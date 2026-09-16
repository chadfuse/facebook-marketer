const { getAuthenticatedContext, humanSimulateBrowsing, setupLowMemoryRouteBlocking, withBrowserLock } = require('./fb-browser');
const { getDatabase, saveDatabase, logEvent, getConfig } = require('./storage');
const { v4: uuidv4 } = require('uuid');

/**
 * Searches Facebook for groups matching a niche keyword (Single-instance low RAM)
 */
async function searchGroupsForNiche(nicheId) {
  return withBrowserLock(async () => {
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
      await setupLowMemoryRouteBlocking(page);

      const searchUrl = `https://www.facebook.com/groups/search/groups/?q=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(3000);

      await humanSimulateBrowsing(page);
      await page.waitForTimeout(1500);

      const rawGroups = await page.evaluate(() => {
        const results = [];
        const links = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
        const seenUrls = new Set();

        for (const link of links) {
          const href = link.href;
          const groupMatch = href.match(/https:\/\/(www\.)?facebook\.com\/groups\/([^\/?#]+)/);
          if (groupMatch) {
            const groupIdentifier = groupMatch[2];
            if (['feed', 'search', 'create', 'discover', 'joins'].includes(groupIdentifier)) continue;

            const cleanUrl = `https://www.facebook.com/groups/${groupIdentifier}/`;
            if (seenUrls.has(cleanUrl)) continue;
            seenUrls.add(cleanUrl);

            const container = link.closest('div[role="feed"] > div, div[role="article"], div[data-visualcompletion="ignore-dynamic-snippet"]') || link.parentElement?.parentElement?.parentElement;
            const textContent = container ? container.innerText : link.innerText;

            let groupName = link.innerText.trim();
            if (!groupName || groupName.length < 3) {
              const heading = container ? container.querySelector('h2, h3, span[dir="auto"]') : null;
              groupName = heading ? heading.innerText.trim() : `Group ${groupIdentifier}`;
            }

            let members = 'Unknown members';
            let privacy = 'Public';

            if (textContent.includes('Private')) privacy = 'Private';
            if (textContent.includes('Public')) privacy = 'Public';

            const memberMatch = textContent.match(/([\d\.,]+[KkMm]?)\s*members?/i);
            if (memberMatch) {
              members = memberMatch[0];
            }

            let isJoined = false;
            if (textContent.includes('Joined') || textContent.includes('Manage') || textContent.includes('Joined Group')) {
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
            existing.canPost = true;
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
            status: raw.isJoined ? 'joined' : 'discovered',
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
  });
}

/**
 * Automates requesting to join a specific Facebook group (Single-instance low RAM)
 */
async function joinGroup(groupId) {
  return withBrowserLock(async () => {
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
      await setupLowMemoryRouteBlocking(page);

      await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(2500);

      const joinButton = await page.$('div[aria-label="Join group"], div[aria-label="Join Group"], span:has-text("Join group"), span:has-text("Join Group"), div[role="button"]:has-text("Join")');

      if (!joinButton) {
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
        return { success: false, message: 'Join button not found or group is restricted' };
      }

      await joinButton.click();
      await page.waitForTimeout(2500);

      const modalQuestions = await page.$('div[role="dialog"]');
      if (modalQuestions) {
        const rulesCheckbox = await page.$('div[role="dialog"] input[type="checkbox"]');
        if (rulesCheckbox) {
          await rulesCheckbox.click().catch(() => {});
          await page.waitForTimeout(400);
        }

        const submitBtn = await page.$('div[role="dialog"] div[aria-label="Submit"], div[role="dialog"] button:has-text("Submit"), div[role="dialog"] div[aria-label="Agree"], div[role="dialog"] span:has-text("Submit")');
        if (submitBtn) {
          await submitBtn.click().catch(() => {});
          await page.waitForTimeout(1500);
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
  });
}

/**
 * Checks all pending groups to verify if admin has accepted our join request
 */
async function checkMembershipStatuses() {
  return withBrowserLock(async () => {
    const db = getDatabase();
    const groups = db.groups || [];
    const pendingGroups = groups.filter(g => g.status === 'join_requested');

    if (pendingGroups.length === 0) {
      return { checkedCount: 0, newlyAcceptedCount: 0, message: 'No pending join requests to check' };
    }

    logEvent('info', `Checking membership status for ${pendingGroups.length} pending group(s)...`);

    let context = null;
    let page = null;
    let newlyAcceptedCount = 0;

    try {
      context = await getAuthenticatedContext({ headless: true });
      page = await context.newPage();
      await setupLowMemoryRouteBlocking(page);

      for (const group of pendingGroups) {
        try {
          await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await page.waitForTimeout(2000);

          const pageText = await page.evaluate(() => document.body.innerText);
          const hasComposer = await page.$('div[role="button"]:has-text("Write something..."), span:has-text("Write something..."), div[role="button"]:has-text("Create a public post")');

          if (hasComposer || pageText.includes('Joined') || pageText.includes('Write something...') || pageText.includes('Manage')) {
            group.status = 'joined';
            group.canPost = true;
            group.updatedAt = new Date().toISOString();
            newlyAcceptedCount++;
            logEvent('success', `🎉 Admin accepted join request for "${group.name}"! Status updated to Joined.`);
          } else if (pageText.includes('Join group') || pageText.includes('Join Group')) {
            // Request was declined or expired
            group.status = 'discovered';
            group.updatedAt = new Date().toISOString();
          }
        } catch (e) {
          // Skip on individual group error
        }
      }

      saveDatabase(db);
      await context.close();
      return { checkedCount: pendingGroups.length, newlyAcceptedCount, success: true };
    } catch (err) {
      if (context) await context.close().catch(() => {});
      logEvent('error', `Error checking membership statuses: ${err.message}`);
      throw err;
    }
  });
}

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
  checkMembershipStatuses,
  updateGroupStatus
};
