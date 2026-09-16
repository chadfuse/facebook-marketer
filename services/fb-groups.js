const { getAuthenticatedContext, humanSimulateBrowsing, setupLowMemoryRouteBlocking, withBrowserLock } = require('./fb-browser');
const { getDatabase, saveDatabase, logEvent, getConfig } = require('./storage');
const { v4: uuidv4 } = require('uuid');

/**
 * Normalizes and extracts clean Facebook group info from a raw URL or identifier
 */
function normalizeGroupUrl(rawUrl) {
  if (!rawUrl) return null;
  const match = rawUrl.match(/https?:\/\/(?:www\.|web\.|m\.)?facebook\.com\/groups\/([^\/?#]+)/i);
  if (match) {
    const identifier = match[1];
    if (['feed', 'search', 'create', 'discover', 'joins'].includes(identifier.toLowerCase())) {
      return null;
    }
    return {
      identifier,
      cleanUrl: `https://www.facebook.com/groups/${identifier}/`
    };
  }
  // If user passed identifier directly (e.g. "architecture.jobs.philippines")
  const cleanId = rawUrl.trim().replace(/^[\/\s]+|[\/\s]+$/g, '');
  if (cleanId && !cleanId.includes('facebook.com') && !cleanId.includes(' ') && cleanId.length > 2) {
    return {
      identifier: cleanId,
      cleanUrl: `https://www.facebook.com/groups/${cleanId}/`
    };
  }
  return null;
}

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
            if (['feed', 'search', 'create', 'discover', 'joins'].includes(groupIdentifier.toLowerCase())) continue;

            const cleanUrl = `https://www.facebook.com/groups/${groupIdentifier}/`;
            if (seenUrls.has(cleanUrl)) continue;
            seenUrls.add(cleanUrl);

            // Expand container search to catch action buttons (Visit / Joined / Join)
            const container = link.closest('div[role="feed"] > div, div[role="article"], div[role="listitem"], div[data-visualcompletion="ignore-dynamic-snippet"]') 
              || link.closest('div[data-virtualized="false"]')
              || link.parentElement?.parentElement?.parentElement?.parentElement
              || link.parentElement?.parentElement?.parentElement;

            const textContent = container ? container.innerText : link.innerText;

            let groupName = link.innerText.trim();
            if (!groupName || groupName.length < 3) {
              const heading = container ? container.querySelector('h2, h3, h4, span[dir="auto"]') : null;
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

            // Thorough check for Joined / Member / Visit status:
            let isJoined = false;
            if (textContent.includes('Joined') || textContent.includes('Manage') || textContent.includes('Joined Group')) {
              isJoined = true;
            }

            if (container) {
              // Check aria labels
              const ariaElements = container.querySelectorAll('[aria-label]');
              for (const el of ariaElements) {
                const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                if (aria.includes('joined') || aria.includes('manage') || aria.includes('visit') || aria.includes('member')) {
                  isJoined = true;
                  break;
                }
              }

              // Check buttons/links inside container
              const buttons = Array.from(container.querySelectorAll('div[role="button"], button, a'));
              for (const b of buttons) {
                const bText = (b.innerText || '').trim().toLowerCase();
                if (bText === 'visit' || bText === 'joined' || bText === 'manage' || bText === 'view group' || bText.includes('joined')) {
                  isJoined = true;
                  break;
                }
              }
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
 * Directly imports all groups that the logged-in Facebook profile or Page has already joined
 */
async function importMyJoinedGroups() {
  return withBrowserLock(async () => {
    logEvent('info', 'Scanning Facebook for all groups you are already a member of...');
    let context = null;
    let page = null;
    let importedCount = 0;
    let updatedCount = 0;

    try {
      context = await getAuthenticatedContext({ headless: true });
      page = await context.newPage();
      await setupLowMemoryRouteBlocking(page);

      // Primary FB joined groups URL
      await page.goto('https://www.facebook.com/groups/joins/', { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(3000);

      // Scroll multiple times to trigger lazy-loading of all joined groups
      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => window.scrollBy(0, 800));
        await page.waitForTimeout(1000);
      }

      const scrapedGroups = await page.evaluate(() => {
        const list = [];
        const seen = new Set();
        const links = Array.from(document.querySelectorAll('a[href*="/groups/"]'));

        for (const link of links) {
          const href = link.href;
          const match = href.match(/https:\/\/(www\.)?facebook\.com\/groups\/([^\/?#]+)/);
          if (match) {
            const groupIdentifier = match[2];
            if (['feed', 'search', 'create', 'discover', 'joins'].includes(groupIdentifier.toLowerCase())) continue;

            const cleanUrl = `https://www.facebook.com/groups/${groupIdentifier}/`;
            if (seen.has(cleanUrl)) continue;
            seen.add(cleanUrl);

            const container = link.closest('div[role="listitem"], div[role="article"], div[role="feed"] > div') || link.parentElement?.parentElement;
            let groupName = link.innerText.trim();
            if (!groupName || groupName.length < 2) {
              const heading = container ? container.querySelector('span[dir="auto"], h3, h4') : null;
              groupName = heading ? heading.innerText.trim() : `FB Group (${groupIdentifier})`;
            }

            const cleanName = groupName.split('\n')[0].trim();
            list.push({
              name: cleanName || `FB Group (${groupIdentifier})`,
              url: cleanUrl,
              groupIdentifier
            });
          }
        }
        return list;
      });

      logEvent('info', `Found ${scrapedGroups.length} joined groups on your Facebook account.`);

      const db = getDatabase();
      const currentGroups = db.groups || [];

      for (const scraped of scrapedGroups) {
        const existing = currentGroups.find(g => g.url === scraped.url || g.groupIdentifier === scraped.groupIdentifier);
        if (existing) {
          existing.status = 'joined';
          existing.canPost = true;
          if (scraped.name && !scraped.name.startsWith('FB Group (')) {
            existing.name = scraped.name;
          }
          existing.updatedAt = new Date().toISOString();
          updatedCount++;
        } else {
          const newGroup = {
            id: 'grp-' + uuidv4().substring(0, 8),
            nicheId: '',
            nicheName: 'Imported / General',
            name: scraped.name,
            url: scraped.url,
            groupIdentifier: scraped.groupIdentifier,
            members: 'Member',
            privacy: 'Public',
            status: 'joined',
            canPost: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastPostDate: null,
            postCount: 0
          };
          currentGroups.push(newGroup);
          importedCount++;
        }
      }

      db.groups = currentGroups;
      saveDatabase(db);
      logEvent('success', `Successfully imported ${importedCount} new groups and marked ${updatedCount} existing groups as Joined.`);

      await context.close();
      const totalJoined = currentGroups.filter(g => g.status === 'joined').length;
      return { success: true, importedCount, updatedCount, totalJoinedCount: totalJoined };
    } catch (err) {
      if (context) await context.close().catch(() => {});
      logEvent('error', `Failed to import joined groups: ${err.message}`);
      throw err;
    }
  });
}

/**
 * Verifies live membership status for a single group by URL or ID
 */
async function verifyGroupMembership(groupIdOrUrl) {
  return withBrowserLock(async () => {
    const db = getDatabase();
    let group = (db.groups || []).find(g => g.id === groupIdOrUrl || g.url === groupIdOrUrl);
    let targetUrl = group ? group.url : null;

    if (!targetUrl) {
      const norm = normalizeGroupUrl(groupIdOrUrl);
      if (norm) {
        targetUrl = norm.cleanUrl;
        group = (db.groups || []).find(g => g.url === targetUrl || g.groupIdentifier === norm.identifier);
      }
    }

    if (!targetUrl) {
      throw new Error(`Group not found for ${groupIdOrUrl}`);
    }

    logEvent('info', `Verifying live Facebook membership for group "${group ? group.name : targetUrl}"...`);

    let context = null;
    let page = null;

    try {
      context = await getAuthenticatedContext({ headless: true });
      page = await context.newPage();
      await setupLowMemoryRouteBlocking(page);

      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(2500);

      const pageAnalysis = await page.evaluate(() => {
        const bodyText = document.body ? document.body.innerText : '';
        const titleEl = document.querySelector('h1, h2');
        const title = titleEl ? titleEl.innerText.trim() : document.title;

        // Check for post composer
        const hasComposer = Boolean(
          document.querySelector('div[role="button"][aria-label*="Write something"], div[role="button"][aria-label*="Create a public post"], span[dir="auto"]') &&
          (bodyText.includes('Write something...') || bodyText.includes('Create a public post') || bodyText.includes("What's on your mind?"))
        );

        // Check for Joined/Manage buttons or labels
        let hasJoinedBadge = false;
        if (bodyText.includes('Joined') || bodyText.includes('Manage') || bodyText.includes('You are a member')) {
          hasJoinedBadge = true;
        }

        const ariaLabels = Array.from(document.querySelectorAll('[aria-label]')).map(el => el.getAttribute('aria-label').toLowerCase());
        if (ariaLabels.some(a => a.includes('joined') || a.includes('manage') || a.includes('member'))) {
          hasJoinedBadge = true;
        }

        const isPending = bodyText.includes('Pending') || bodyText.includes('Cancel request') || ariaLabels.some(a => a.includes('pending') || a.includes('cancel request'));
        const hasJoinButton = bodyText.includes('Join group') || bodyText.includes('Join Group') || ariaLabels.some(a => a.includes('join group'));

        let memberStatus = 'discovered';
        if (hasComposer || hasJoinedBadge) {
          memberStatus = 'joined';
        } else if (isPending) {
          memberStatus = 'join_requested';
        }

        return {
          title: title.split('\n')[0].trim(),
          hasComposer,
          hasJoinedBadge,
          isPending,
          hasJoinButton,
          memberStatus
        };
      });

      if (group) {
        group.status = pageAnalysis.memberStatus;
        group.canPost = pageAnalysis.memberStatus === 'joined';
        if (pageAnalysis.title && pageAnalysis.title.length > 2 && !pageAnalysis.title.includes('Facebook')) {
          group.name = pageAnalysis.title;
        }
        group.updatedAt = new Date().toISOString();
        saveDatabase(db);
      }

      logEvent('success', `Verification result for "${targetUrl}": Status is "${pageAnalysis.memberStatus}".`);
      await context.close();

      return {
        success: true,
        status: pageAnalysis.memberStatus,
        isJoined: pageAnalysis.memberStatus === 'joined',
        group
      };
    } catch (err) {
      if (context) await context.close().catch(() => {});
      logEvent('error', `Failed to verify group membership: ${err.message}`);
      throw err;
    }
  });
}

/**
 * Adds a Facebook group directly by URL and marks its initial status
 */
function addGroupByDirectUrl({ url, nicheId, customName, status = 'joined' }) {
  const norm = normalizeGroupUrl(url);
  if (!norm) {
    throw new Error('Invalid Facebook group URL. Please enter a valid URL like https://www.facebook.com/groups/your-group-name/');
  }

  const db = getDatabase();
  const currentGroups = db.groups || [];
  const niche = (db.niches || []).find(n => n.id === nicheId);

  let group = currentGroups.find(g => g.url === norm.cleanUrl || g.groupIdentifier === norm.identifier);
  const isJoined = status === 'joined';

  if (group) {
    if (nicheId) {
      group.nicheId = nicheId;
      group.nicheName = niche ? niche.name : group.nicheName;
    }
    if (customName) group.name = customName.trim();
    group.status = status;
    group.canPost = isJoined;
    group.updatedAt = new Date().toISOString();
  } else {
    group = {
      id: 'grp-' + uuidv4().substring(0, 8),
      nicheId: nicheId || '',
      nicheName: niche ? niche.name : 'Directly Added',
      name: customName ? customName.trim() : `Group (${norm.identifier})`,
      url: norm.cleanUrl,
      groupIdentifier: norm.identifier,
      members: 'Member',
      privacy: 'Public',
      status: status,
      canPost: isJoined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastPostDate: null,
      postCount: 0
    };
    currentGroups.push(group);
  }

  db.groups = currentGroups;
  saveDatabase(db);
  logEvent('success', `Added group "${group.name}" (${group.url}) as ${status}.`);
  return group;
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
 * Checks pending and discovered groups to verify if admin has accepted our join request
 */
async function checkMembershipStatuses(options = {}) {
  return withBrowserLock(async () => {
    const db = getDatabase();
    const groups = db.groups || [];
    
    // Check pending groups by default, or all non-joined if requested
    const targetGroups = options.includeDiscovered
      ? groups.filter(g => g.status === 'join_requested' || g.status === 'discovered')
      : groups.filter(g => g.status === 'join_requested');

    if (targetGroups.length === 0) {
      return { checkedCount: 0, newlyAcceptedCount: 0, message: 'No groups to check' };
    }

    logEvent('info', `Checking membership status for ${targetGroups.length} group(s)...`);

    let context = null;
    let page = null;
    let newlyAcceptedCount = 0;

    try {
      context = await getAuthenticatedContext({ headless: true });
      page = await context.newPage();
      await setupLowMemoryRouteBlocking(page);

      for (const group of targetGroups) {
        try {
          await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await page.waitForTimeout(2000);

          const pageText = await page.evaluate(() => document.body ? document.body.innerText : '');
          const hasComposer = await page.$('div[role="button"]:has-text("Write something..."), span:has-text("Write something..."), div[role="button"]:has-text("Create a public post")');

          if (hasComposer || pageText.includes('Joined') || pageText.includes('Write something...') || pageText.includes('Manage')) {
            group.status = 'joined';
            group.canPost = true;
            group.updatedAt = new Date().toISOString();
            newlyAcceptedCount++;
            logEvent('success', `🎉 Confirmed membership for "${group.name}"! Status updated to Joined.`);
          } else if (pageText.includes('Join group') || pageText.includes('Join Group')) {
            group.status = 'discovered';
            group.updatedAt = new Date().toISOString();
          }
        } catch (e) {
          // Skip individual group error
        }
      }

      saveDatabase(db);
      await context.close();
      return { checkedCount: targetGroups.length, newlyAcceptedCount, success: true };
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
  } else {
    group.canPost = false;
  }
  saveDatabase(db);
  return group;
}

function updateMultipleGroupStatuses(groupIds, status) {
  if (!Array.isArray(groupIds) || groupIds.length === 0) {
    throw new Error('groupIds array is required');
  }
  const db = getDatabase();
  const currentGroups = db.groups || [];
  let updatedCount = 0;
  const isJoined = status === 'joined';

  for (const group of currentGroups) {
    if (groupIds.includes(group.id)) {
      group.status = status;
      group.canPost = isJoined;
      group.updatedAt = new Date().toISOString();
      updatedCount++;
    }
  }

  saveDatabase(db);
  logEvent('info', `Batch updated ${updatedCount} groups to status "${status}".`);
  return { updatedCount, success: true };
}

module.exports = {
  searchGroupsForNiche,
  importMyJoinedGroups,
  verifyGroupMembership,
  addGroupByDirectUrl,
  joinGroup,
  checkMembershipStatuses,
  updateGroupStatus,
  updateMultipleGroupStatuses
};

