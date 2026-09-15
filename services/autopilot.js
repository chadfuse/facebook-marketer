const { getDatabase, saveDatabase, getConfig, saveConfig, logEvent } = require('./storage');
const { searchGroupsForNiche, joinGroup } = require('./fb-groups');
const { generatePostContent, FRAMEWORKS } = require('./gemini');
const { v4: uuidv4 } = require('uuid');

let isAutopilotCycleRunning = false;

/**
 * Runs a single intelligent Autopilot execution cycle
 */
async function runAutopilotCycle() {
  const config = getConfig();
  if (!config.autopilotEnabled) {
    return { status: 'disabled', message: 'Autopilot is currently turned off' };
  }

  if (isAutopilotCycleRunning) {
    logEvent('info', '[AUTOPILOT] Cycle skipped: Another cycle is already running.');
    return { status: 'busy' };
  }

  isAutopilotCycleRunning = true;
  logEvent('info', '[AUTOPILOT] 🤖 Starting scheduled Autopilot cycle...');

  const db = getDatabase();
  const today = new Date().toISOString().split('T')[0];
  const results = {
    discoveredCount: 0,
    joinedCount: 0,
    generatedPostsCount: 0
  };

  try {
    const niches = db.niches || [];
    const groups = db.groups || [];
    const dailyJoinLimit = config.autopilotDailyJoinLimit || config.dailyJoinLimit || 3;

    // ----------------------------------------------------
    // 1. AUTO-DISCOVERY: Find new groups for niches with low count
    // ----------------------------------------------------
    for (const niche of niches) {
      const existingForNiche = groups.filter(g => g.nicheId === niche.id);
      if (existingForNiche.length < 5) {
        logEvent('info', `[AUTOPILOT] Auto-discovering Facebook groups for niche: "${niche.name}"...`);
        try {
          const newGroups = await searchGroupsForNiche(niche.id);
          results.discoveredCount += (newGroups || []).length;
        } catch (searchErr) {
          logEvent('warn', `[AUTOPILOT] Auto-discovery error for "${niche.name}": ${searchErr.message}`);
        }
        break; // Process one niche per cycle to respect anti-scraping limits
      }
    }

    // ----------------------------------------------------
    // 2. AUTO-JOIN: Join 1 discovered group safely per cycle
    // ----------------------------------------------------
    const joinsToday = (db.logs || []).filter(l => 
      l.type === 'success' && 
      l.message && 
      l.message.includes('join request') && 
      l.timestamp.startsWith(today)
    ).length;

    if (joinsToday < dailyJoinLimit) {
      const candidateGroup = (db.groups || []).find(g => g.status === 'discovered');
      if (candidateGroup) {
        logEvent('info', `[AUTOPILOT] Auto-joining candidate group: "${candidateGroup.name}" (${joinsToday + 1}/${dailyJoinLimit} today)...`);
        try {
          const joinRes = await joinGroup(candidateGroup.id);
          if (joinRes.success) {
            results.joinedCount++;
          }
        } catch (joinErr) {
          logEvent('warn', `[AUTOPILOT] Auto-join error for "${candidateGroup.name}": ${joinErr.message}`);
        }
      }
    } else {
      logEvent('info', `[AUTOPILOT] Daily join limit reached (${joinsToday}/${dailyJoinLimit}). Skipping join step.`);
    }

    // ----------------------------------------------------
    // 3. AUTO-POST GENERATION: Generate fresh copy for joined groups
    // ----------------------------------------------------
    const joinedGroups = (db.groups || []).filter(g => g.status === 'joined');
    const queue = db.postQueue || [];

    for (const group of joinedGroups) {
      // Check if group already has pending post in queue
      const alreadyQueued = queue.some(q => q.groupId === group.id && (q.status === 'scheduled' || q.status === 'pending'));
      if (alreadyQueued) continue;

      // Check if posted recently (in last 3 days)
      if (group.lastPostDate) {
        const diffHours = (Date.now() - new Date(group.lastPostDate).getTime()) / (1000 * 60 * 60);
        if (diffHours < 72) continue; // Skip if posted within 72h
      }

      // Rotate frameworks (audit, case_study, value_tips, soft_pitch)
      const frameworkKeys = Object.keys(FRAMEWORKS);
      const chosenFramework = frameworkKeys[Math.floor(Math.random() * frameworkKeys.length)];

      logEvent('info', `[AUTOPILOT] Auto-generating fresh post for joined group "${group.name}" using ${chosenFramework}...`);
      
      const niche = niches.find(n => n.id === group.nicheId) || {};
      const posts = await generatePostContent({
        nicheName: niche.name || group.nicheName || 'Local Business',
        industry: niche.industry || 'Local Services',
        location: niche.location || '',
        specificAngle: niche.specificAngle || '',
        framework: chosenFramework,
        portfolioUrl: config.portfolioUrl || 'https://myportfolio.dev',
        variationCount: 1
      });

      if (posts && posts.length > 0) {
        const queueItem = {
          id: 'queue-' + uuidv4().substring(0, 8),
          groupId: group.id,
          groupName: group.name,
          groupUrl: group.url,
          nicheId: group.nicheId,
          content: posts[0],
          status: 'scheduled',
          scheduledTime: new Date(Date.now() + Math.floor(Math.random() * 30 + 15) * 60000).toISOString(), // Random 15-45 mins in future
          createdAt: new Date().toISOString(),
          isAutopilot: true
        };

        if (!db.postQueue) db.postQueue = [];
        db.postQueue.push(queueItem);
        saveDatabase(db);
        results.generatedPostsCount++;
        logEvent('success', `[AUTOPILOT] Queued AI-generated post for "${group.name}".`);
      }
      break; // Generate for 1 group per cycle to pace queue
    }

    logEvent('info', `[AUTOPILOT] Cycle completed. (Discovered: ${results.discoveredCount}, Joined: ${results.joinedCount}, Queued: ${results.generatedPostsCount})`);
    isAutopilotCycleRunning = false;
    return { status: 'success', results };
  } catch (err) {
    isAutopilotCycleRunning = false;
    logEvent('error', `[AUTOPILOT] Critical error in autopilot cycle: ${err.message}`);
    return { status: 'error', error: err.message };
  }
}

module.exports = {
  runAutopilotCycle
};
