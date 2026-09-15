const { getAuthenticatedContext, humanSimulateBrowsing } = require('./fb-browser');
const { getDatabase, saveDatabase, logEvent, getConfig } = require('./storage');
const { v4: uuidv4 } = require('uuid');

/**
 * Searches Facebook for groups matching a niche keyword
 */
async function searchGroupsForNiche(nicheId) {
  const db = getDatabase();
  const niche = (db.niches || []).find(n => n.id === nicheId);
  if (!niche) {
    throw new Error(`Niche with ID ${nicheId} not found`);
  }

  const query = niche.keyword || `${niche.name} ${niche.location || ''}`.trim();
  logEvent('info', `Searching Facebook groups for niche: "${niche.name}" with query: "${query}"...`);

  let context = null;
  let page = null;
  const discoveredGroups = [];

  try {
    context = await getAuthenticatedContext({ headless: true });
    page = await context.newPage();

    const searchUrl = `https://www.facebook.com/groups/search/groups/?q=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(4000);

    // Human browsing behavior: scroll down a bit to load 10-20 groups
    await humanSimulateBrowsing(page);
    await page.waitForTimeout(2000);

    // Extract group cards
    const rawGroups = await page.evaluate(() => {
      const results = [];
      const links = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
      
      const seenUrls = new Set();

      for (const link of links) {
        const href = link.href;
        // Match standard group URLs e.g. /groups/123456789/ or /groups/hvacpros/
        const groupMatch = href.match(/https:\/\/(www\.)?facebook\.com\/groups\/([^\/?#]+)/);
        if (groupMatch) {
          const groupIdentifier = groupMatch[2];
          // Skip general paths like 'feed', 'search', 'create', 'discover'
          if (['feed', 'search', 'create', 'discover', 'joins'].includes(groupIdentifier)) continue;

          const cleanUrl = `https://www.facebook.com/groups/${groupIdentifier}/`;
          if (seenUrls.has(cleanUrl)) continue;
          seenUrls.add(cleanUrl);

          // Find container and details
          const container = link.closest('div[role="feed"] > div, div[role="article"], div[data-visualcompletion="ignore-dynamic-snippet"]') || link.parentElement?.parentElement?.parentElement;
          const textContent = container ? container.innerText : link.innerText;

          let groupName = link.innerText.trim();
          if (!groupName || groupName.length < 3) {
            const heading = container ? container.querySelector('h2, h3, span[dir="auto"]') : null;
            groupName = heading ? heading.innerText.trim() : `Group ${groupIdentifier}`;
          }

          // Parse members & privacy info from textContent
          let members = 'Unknown members';
          let privacy = 'Public';

          if (textContent.includes('Private')) privacy = 'Private';
          if (textContent.includes('Public')) privacy = 'Public';

          const memberMatch = textContent.match(/([\d\.,]+[KkMm]?)\s*members?/i);
          if (memberMatch) {
            members = memberMatch[0];
          }

          // Determine join state
          let isJoined = false;
          if (textContent.includes('Joined') || textContent.includes('Manage')) {
            isJoined = true;
          }

          results.push({
            name: groupName.split('\n')[0].trim(),
            url: cleanUrl,
            groupIdentifier,
            privacy,
            members,
            isJoined
          });
        }
      }
      return results;
    });

    logEvent('info', `Found ${rawGroups.length} group results on Facebook for query "${query}".`);

    // Merge into local database
    const currentGroups = db.groups || [];
    let newCount = 0;

    for (const raw of rawGroups) {
      const existing = currentGroups.find(g => g.url === raw.url || g.groupIdentifier === raw.groupIdentifier);
      if (existing) {
        existing.nicheId = nicheId;
        existing.nicheName = niche.name;
        existing.members = raw.members;
        existing.privacy = raw.privacy;
        existing.updatedAt = new Date().toISOString();
        if (raw.isJoined && existing.status !== 'joined') {
          existing.status = 'joined';
        }
        discoveredGroups.push(existing);
      } else {
        const newGroup = {
          id: 'grp-' + uuidv4().substring(0, 8),
          nicheId: nicheId,
          nicheName: niche.name,
          name: raw.name || `FB Group (${raw.groupIdentifier})`,
          url: raw.url,
          groupIdentifier: raw.groupIdentifier,
          members: raw.members,
          privacy: raw.privacy,
          status: raw.isJoined ? 'joined' : 'discovered', // 'discovered' | 'join_requested' | 'joined' | 'rejected'
          canPost: raw.isJoined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastPostDate: null,
          postCount: 0
        };
        currentGroups.push(newGroup);
        discoveredGroups.push(newGroup);
        newCount++;
      }
    }

    db.groups = currentGroups;
    saveDatabase(db);
    logEvent('success', `Saved ${discoveredGroups.length} groups (${newCount} newly added) for niche "${niche.name}".`);

    await context.close();
    return discoveredGroups;
  } catch (err) {
    if (context) await context.close().catch(() => {});
    logEvent('error', `Failed to search groups: ${err.message}`);
    throw err;
  }
}

/**
 * Automates requesting to join a specific Facebook group
 */
async function joinGroup(groupId) {
  const db = getDatabase();
  const group = (db.groups || []).find(g => g.id === groupId);
  if (!group) throw new Error('Group not found');

  if (group.status === 'joined') {
    return { success: true, message: 'Already a member of this group' };
  }

  logEvent('info', `Attempting to join group: "${group.name}" (${group.url})...`);

  let context = null;
  let page = null;

  try {
    context = await getAuthenticatedContext({ headless: true });
    page = await context.newPage();

    await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(3000);

    // Look for "Join group" button
    const joinButton = await page.$('div[aria-label="Join group"], div[aria-label="Join Group"], span:has-text("Join group"), span:has-text("Join Group"), div[role="button"]:has-text("Join")');

    if (!joinButton) {
      // Check if already requested or joined
      const pageText = await page.evaluate(() => document.body.innerText);
      if (pageText.includes('Pending') || pageText.includes('Cancel request')) {
        group.status = 'join_requested';
        group.updatedAt = new Date().toISOString();
        saveDatabase(db);
        logEvent('info', `Join request for "${group.name}" is already pending admin approval.`);
        await context.close();
        return { success: true, status: 'join_requested', message: 'Join request already pending' };
      }

      if (pageText.includes('Write something...') || pageText.includes('Joined') || pageText.includes('Manage')) {
        group.status = 'joined';
        group.canPost = true;
        group.updatedAt = new Date().toISOString();
        saveDatabase(db);
        logEvent('success', `Already confirmed member of "${group.name}".`);
        await context.close();
        return { success: true, status: 'joined', message: 'Already joined' };
      }

      await context.close();
      return { success: false, message: 'Join button not found (might require answering questions or group is restricted)' };
    }

    // Click the join button with human delay
    await joinButton.click();
    await page.waitForTimeout(3000);

    // Check if membership questions or rules modal popped up
    const modalQuestions = await page.$('div[role="dialog"]');
    if (modalQuestions) {
      // Check rules checkbox if present
      const rulesCheckbox = await page.$('div[role="dialog"] input[type="checkbox"]');
      if (rulesCheckbox) {
        await rulesCheckbox.click().catch(() => {});
        await page.waitForTimeout(500);
      }

      // Submit modal if there's a submit button
      const submitBtn = await page.$('div[role="dialog"] div[aria-label="Submit"], div[role="dialog"] button:has-text("Submit"), div[role="dialog"] div[aria-label="Agree"], div[role="dialog"] span:has-text("Submit")');
      if (submitBtn) {
        await submitBtn.click().catch(() => {});
        await page.waitForTimeout(2000);
      }
    }

    group.status = 'join_requested';
    group.updatedAt = new Date().toISOString();
    saveDatabase(db);
    logEvent('success', `Submitted join request for group: "${group.name}".`);

    await context.close();
    return { success: true, status: 'join_requested', message: 'Join request sent successfully' };
  } catch (err) {
    if (context) await context.close().catch(() => {});
    logEvent('error', `Error joining group "${group.name}": ${err.message}`);
    throw err;
  }
}

/**
 * Manually or bulk update group status (e.g. mark as joined after admin approval)
 */
function updateGroupStatus(groupId, updates) {
  const db = getDatabase();
  const group = (db.groups || []).find(g => g.id === groupId);
  if (!group) throw new Error('Group not found');

  Object.assign(group, updates, { updatedAt: new Date().toISOString() });
  if (updates.status === 'joined') {
    group.canPost = true;
  }
  saveDatabase(db);
  return group;
}

module.exports = {
  searchGroupsForNiche,
  joinGroup,
  updateGroupStatus
};
