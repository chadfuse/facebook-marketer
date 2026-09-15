const { getAuthenticatedContext, humanType, humanSimulateBrowsing } = require('./fb-browser');
const { getDatabase, saveDatabase, logEvent, getConfig } = require('./storage');
const { v4: uuidv4 } = require('uuid');

let isPostingInProgress = false;

/**
 * Executes posting a single message to a target Facebook group
 */
async function postToGroup({ groupId, content, queueItemId = null }) {
  const db = getDatabase();
  const group = (db.groups || []).find(g => g.id === groupId);
  if (!group) throw new Error('Target group not found in database');

  logEvent('info', `Starting automated post to group "${group.name}"...`);

  let context = null;
  let page = null;

  try {
    context = await getAuthenticatedContext({ headless: true });
    page = await context.newPage();

    // Navigate to group URL
    await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(3500);

    await humanSimulateBrowsing(page);

    // Look for post trigger box e.g. "Write something...", "Create a public post..."
    const postBoxSelectors = [
      'div[role="button"]:has-text("Write something...")',
      'div[role="button"]:has-text("Create a public post...")',
      'div[role="button"]:has-text("What\'s on your mind?")',
      'span:has-text("Write something...")',
      'span:has-text("Create a public post...")',
      'div[data-pagelet="GroupInlineComposer"] div[role="button"]'
    ];

    let postTrigger = null;
    for (const selector of postBoxSelectors) {
      postTrigger = await page.$(selector);
      if (postTrigger) break;
    }

    if (!postTrigger) {
      throw new Error('Could not find Facebook group post input box (Group might require approval or you are not a joined member)');
    }

    // Click to open composer modal
    await postTrigger.click();
    await page.waitForTimeout(2500);

    // Find active editable composer div
    const editorSelectors = [
      'div[role="dialog"] div[role="textbox"]',
      'div[role="dialog"] div[contenteditable="true"]',
      'div[contenteditable="true"][data-lexical-editor="true"]',
      'div[role="textbox"][aria-label*="What\'s on your mind"]',
      'div[role="textbox"]'
    ];

    let editor = null;
    for (const selector of editorSelectors) {
      editor = await page.$(selector);
      if (editor) break;
    }

    if (!editor) {
      throw new Error('Post editor modal did not open or text input element was not found');
    }

    // Type post content naturally
    await humanType(page, editor, content);
    await page.waitForTimeout(3000);

    // Find and click the Post button inside modal
    const postButtonSelectors = [
      'div[role="dialog"] div[aria-label="Post"][role="button"]',
      'div[role="dialog"] div[role="button"]:has-text("Post")',
      'div[role="dialog"] span:has-text("Post")',
      'div[aria-label="Post"][role="button"]'
    ];

    let postButton = null;
    for (const selector of postButtonSelectors) {
      postButton = await page.$(selector);
      if (postButton) {
        // Verify it's not disabled
        const isDisabled = await postButton.getAttribute('aria-disabled');
        if (isDisabled !== 'true') break;
      }
    }

    if (!postButton) {
      throw new Error('Could not find active "Post" button in modal');
    }

    await postButton.click();
    logEvent('info', 'Clicked "Post" button, waiting for submission confirmation...');
    
    // Wait for modal to dismiss or submission to complete
    await page.waitForTimeout(6000);

    // Record in history
    const historyItem = {
      id: 'post-' + uuidv4().substring(0, 8),
      groupId: group.id,
      groupName: group.name,
      groupUrl: group.url,
      nicheId: group.nicheId,
      nicheName: group.nicheName,
      content,
      postedAt: new Date().toISOString(),
      status: 'success'
    };

    if (!db.postHistory) db.postHistory = [];
    db.postHistory.unshift(historyItem);

    // Update group stats
    group.lastPostDate = new Date().toISOString();
    group.postCount = (group.postCount || 0) + 1;

    // Update queue if linked
    if (queueItemId) {
      const queueIndex = (db.postQueue || []).findIndex(q => q.id === queueItemId);
      if (queueIndex !== -1) {
        db.postQueue[queueIndex].status = 'completed';
        db.postQueue[queueIndex].completedAt = new Date().toISOString();
      }
    }

    saveDatabase(db);
    logEvent('success', `Successfully published post to group "${group.name}".`);

    await context.close();
    return { success: true, historyItem };
  } catch (err) {
    if (context) await context.close().catch(() => {});
    logEvent('error', `Failed to post to group "${group.name}": ${err.message}`);

    if (queueItemId) {
      const queueIndex = (db.postQueue || []).findIndex(q => q.id === queueItemId);
      if (queueIndex !== -1) {
        db.postQueue[queueIndex].status = 'failed';
        db.postQueue[queueIndex].error = err.message;
        saveDatabase(db);
      }
    }
    throw err;
  }
}

/**
 * Background Queue Processor for Scheduled Posts with Anti-Spam Safety Limits
 */
async function processNextQueueItem() {
  if (isPostingInProgress) {
    logEvent('info', 'Queue runner skipped: Another post execution is already in progress.');
    return { status: 'busy' };
  }

  const db = getDatabase();
  const config = getConfig();
  const queue = db.postQueue || [];

  // Filter pending approved posts
  const pendingItem = queue.find(q => q.status === 'scheduled' || q.status === 'pending');
  if (!pendingItem) {
    return { status: 'empty' };
  }

  // Check daily post limit
  const today = new Date().toISOString().split('T')[0];
  const postsToday = (db.postHistory || []).filter(p => p.postedAt && p.postedAt.startsWith(today)).length;
  const limit = config.dailyPostLimit || 5;

  if (postsToday >= limit) {
    logEvent('warn', `Daily posting safety limit reached (${postsToday}/${limit} posts today). Skipping queue to protect account.`);
    return { status: 'limit_reached' };
  }

  isPostingInProgress = true;
  pendingItem.status = 'in_progress';
  saveDatabase(db);

  try {
    const result = await postToGroup({
      groupId: pendingItem.groupId,
      content: pendingItem.content,
      queueItemId: pendingItem.id
    });
    isPostingInProgress = false;
    return { status: 'success', result };
  } catch (err) {
    isPostingInProgress = false;
    return { status: 'error', error: err.message };
  }
}

module.exports = {
  postToGroup,
  processNextQueueItem
};
