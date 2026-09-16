require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');

const {
  getDatabase,
  saveDatabase,
  getConfig,
  saveConfig,
  logEvent,
  deleteSessionState
} = require('./services/storage');

const {
  generatePostContent,
  FRAMEWORKS
} = require('./services/gemini');

const {
  checkLoginStatus,
  launchLoginAssistant,
  importSessionCookies
} = require('./services/fb-browser');

const {
  searchGroupsForNiche,
  importMyJoinedGroups,
  verifyGroupMembership,
  addGroupByDirectUrl,
  joinGroup,
  checkMembershipStatuses,
  updateGroupStatus,
  updateMultipleGroupStatuses
} = require('./services/fb-groups');

const {
  postToGroup,
  processNextQueueItem
} = require('./services/fb-poster');

const {
  getAdminCredentials,
  updateAdminCredentials,
  createAuthToken,
  verifyAuthToken,
  requireAdminAuth
} = require('./services/admin-auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------------------------------------
// 💓 HEALTH / KEEP-ALIVE ENDPOINT (For 24/7 Uptime Pings)
// ----------------------------------------------------
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ----------------------------------------------------
// 🔐 ADMIN DASHBOARD AUTHENTICATION
// ----------------------------------------------------
app.post('/api/auth/admin-login', (req, res) => {
  const { username, password } = req.body;
  const currentCreds = getAdminCredentials();

  if (username === currentCreds.username && password === currentCreds.password) {
    const token = createAuthToken(username);
    logEvent('info', `Admin user "${username}" logged in successfully.`);
    return res.json({ success: true, token, username });
  }

  logEvent('warn', `Failed admin login attempt for username "${username}".`);
  res.status(401).json({ success: false, error: 'Invalid username or password' });
});

app.get('/api/auth/admin-status', (req, res) => {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-admin-token']) {
    token = req.headers['x-admin-token'];
  }

  const session = verifyAuthToken(token);
  res.json({ isAuthenticated: Boolean(session), user: session ? session.username : null });
});

// Guard all other /api/* endpoints
app.use(requireAdminAuth);

app.post('/api/auth/change-password', (req, res) => {
  const { currentPassword, newUsername, newPassword } = req.body;
  const currentCreds = getAdminCredentials();

  if (currentPassword !== currentCreds.password) {
    return res.status(400).json({ success: false, error: 'Current password is incorrect' });
  }

  if (newPassword && newPassword.length < 6) {
    return res.status(400).json({ success: false, error: 'New password must be at least 6 characters long' });
  }

  const updated = updateAdminCredentials(newUsername, newPassword);
  const newToken = createAuthToken(updated.username);
  logEvent('success', `Admin credentials updated successfully for user "${updated.username}".`);
  res.json({ success: true, message: 'Account credentials updated successfully', token: newToken, username: updated.username });
});

// ----------------------------------------------------
// 📊 STATS & OVERVIEW API
// ----------------------------------------------------
app.get('/api/stats', (req, res) => {
  const db = getDatabase();
  const today = new Date().toISOString().split('T')[0];
  const postsToday = (db.postHistory || []).filter(p => p.postedAt && p.postedAt.startsWith(today)).length;
  
  res.json({
    nichesCount: (db.niches || []).length,
    groupsCount: (db.groups || []).length,
    joinedGroupsCount: (db.groups || []).filter(g => g.status === 'joined').length,
    pendingJoinCount: (db.groups || []).filter(g => g.status === 'join_requested').length,
    queuedPostsCount: (db.postQueue || []).filter(q => q.status === 'scheduled' || q.status === 'pending').length,
    totalPostsCount: (db.postHistory || []).length,
    postsToday
  });
});

// ----------------------------------------------------
// 🎯 NICHES MANAGEMENT API (CRUD)
// ----------------------------------------------------
app.get('/api/niches', (req, res) => {
  const db = getDatabase();
  res.json(db.niches || []);
});

app.post('/api/niches', (req, res) => {
  const { name, keyword, industry, location, specificAngle } = req.body;
  if (!name || !keyword) {
    return res.status(400).json({ error: 'Niche name and keyword are required' });
  }

  const db = getDatabase();
  const newNiche = {
    id: 'niche-' + uuidv4().substring(0, 8),
    name: name.trim(),
    keyword: keyword.trim(),
    industry: industry ? industry.trim() : name.trim(),
    location: location ? location.trim() : '',
    specificAngle: specificAngle ? specificAngle.trim() : '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!db.niches) db.niches = [];
  db.niches.push(newNiche);
  saveDatabase(db);
  logEvent('info', `Added new niche: "${newNiche.name}"`);

  res.status(201).json(newNiche);
});

app.put('/api/niches/:id', (req, res) => {
  const { id } = req.params;
  const { name, keyword, industry, location, specificAngle } = req.body;

  const db = getDatabase();
  const nicheIndex = (db.niches || []).findIndex(n => n.id === id);
  if (nicheIndex === -1) {
    return res.status(404).json({ error: 'Niche not found' });
  }

  db.niches[nicheIndex] = {
    ...db.niches[nicheIndex],
    name: name !== undefined ? name.trim() : db.niches[nicheIndex].name,
    keyword: keyword !== undefined ? keyword.trim() : db.niches[nicheIndex].keyword,
    industry: industry !== undefined ? industry.trim() : db.niches[nicheIndex].industry,
    location: location !== undefined ? location.trim() : db.niches[nicheIndex].location,
    specificAngle: specificAngle !== undefined ? specificAngle.trim() : db.niches[nicheIndex].specificAngle,
    updatedAt: new Date().toISOString()
  };

  saveDatabase(db);
  logEvent('info', `Updated niche: "${db.niches[nicheIndex].name}"`);
  res.json(db.niches[nicheIndex]);
});

app.delete('/api/niches/:id', (req, res) => {
  const { id } = req.params;
  const db = getDatabase();
  const initialLength = (db.niches || []).length;
  db.niches = (db.niches || []).filter(n => n.id !== id);

  if (db.niches.length === initialLength) {
    return res.status(404).json({ error: 'Niche not found' });
  }

  saveDatabase(db);
  logEvent('info', `Deleted niche with ID ${id}`);
  res.json({ success: true, message: 'Niche deleted successfully' });
});

// ----------------------------------------------------
// 👥 GROUPS DISCOVERY & JOINING API
// ----------------------------------------------------
app.get('/api/groups', (req, res) => {
  const { nicheId, status } = req.query;
  const db = getDatabase();
  let groups = db.groups || [];

  if (nicheId) {
    groups = groups.filter(g => g.nicheId === nicheId);
  }
  if (status) {
    groups = groups.filter(g => g.status === status);
  }

  res.json(groups);
});

app.post('/api/groups/search', async (req, res) => {
  const { nicheId } = req.body;
  if (!nicheId) {
    return res.status(400).json({ error: 'nicheId is required' });
  }

  try {
    const discovered = await searchGroupsForNiche(nicheId);
    res.json({ success: true, count: discovered.length, groups: discovered });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/groups/import-my-groups', async (req, res) => {
  try {
    const result = await importMyJoinedGroups();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/groups/add-by-url', (req, res) => {
  const { url, nicheId, name, status } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'Group URL is required' });
  }

  try {
    const group = addGroupByDirectUrl({
      url,
      nicheId,
      customName: name,
      status: status || 'joined'
    });
    res.status(201).json({ success: true, group });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/groups/:id/verify', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await verifyGroupMembership(id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/groups/join', async (req, res) => {
  const { groupId } = req.body;
  if (!groupId) {
    return res.status(400).json({ error: 'groupId is required' });
  }

  try {
    const result = await joinGroup(groupId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/groups/sync-status', async (req, res) => {
  const { includeDiscovered } = req.body || {};
  try {
    const result = await checkMembershipStatuses({ includeDiscovered: Boolean(includeDiscovered) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/groups/batch-status', (req, res) => {
  const { groupIds, status } = req.body;
  if (!groupIds || !Array.isArray(groupIds) || !status) {
    return res.status(400).json({ error: 'groupIds array and status are required' });
  }

  try {
    const result = updateMultipleGroupStatuses(groupIds, status);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/groups/:id/status', (req, res) => {
  const { id } = req.params;
  const { status, canPost } = req.body;

  try {
    const updated = updateGroupStatus(id, { status, canPost });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/groups/:id', (req, res) => {
  const { id } = req.params;
  const db = getDatabase();
  db.groups = (db.groups || []).filter(g => g.id !== id);
  saveDatabase(db);
  res.json({ success: true });
});

// ----------------------------------------------------
// ✍️ GEMINI AI CONTENT GENERATOR API
// ----------------------------------------------------
app.get('/api/ai/frameworks', (req, res) => {
  res.json(FRAMEWORKS);
});

app.post('/api/ai/generate', async (req, res) => {
  const { nicheId, framework, customInstructions, count, portfolioUrl } = req.body;
  const db = getDatabase();
  
  let nicheName = 'Local Service Business';
  let industry = 'Web Services';
  let location = '';
  let specificAngle = '';

  if (nicheId) {
    const niche = (db.niches || []).find(n => n.id === nicheId);
    if (niche) {
      nicheName = niche.name;
      industry = niche.industry;
      location = niche.location;
      specificAngle = niche.specificAngle;
    }
  }

  try {
    const posts = await generatePostContent({
      nicheName,
      industry,
      location,
      specificAngle,
      framework: framework || 'audit',
      portfolioUrl,
      customInstructions,
      variationCount: count || 3
    });

    res.json({ success: true, posts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// 📅 POST QUEUE & SCHEDULER API
// ----------------------------------------------------
app.get('/api/queue', (req, res) => {
  const db = getDatabase();
  res.json(db.postQueue || []);
});

app.post('/api/queue', (req, res) => {
  const { groupId, content, scheduledTime } = req.body;
  if (!groupId || !content) {
    return res.status(400).json({ error: 'groupId and content are required' });
  }

  const db = getDatabase();
  const group = (db.groups || []).find(g => g.id === groupId);
  if (!group) return res.status(404).json({ error: 'Group not found' });

  const queueItem = {
    id: 'queue-' + uuidv4().substring(0, 8),
    groupId: group.id,
    groupName: group.name,
    groupUrl: group.url,
    nicheId: group.nicheId,
    content: content.trim(),
    status: 'scheduled', // 'scheduled' | 'in_progress' | 'completed' | 'failed'
    scheduledTime: scheduledTime || new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  if (!db.postQueue) db.postQueue = [];
  db.postQueue.push(queueItem);
  saveDatabase(db);
  logEvent('info', `Queued post for group "${group.name}".`);

  res.status(201).json(queueItem);
});

app.delete('/api/queue/:id', (req, res) => {
  const { id } = req.params;
  const db = getDatabase();
  db.postQueue = (db.postQueue || []).filter(q => q.id !== id);
  saveDatabase(db);
  res.json({ success: true });
});

app.post('/api/queue/process-now', async (req, res) => {
  try {
    const result = await processNextQueueItem();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/posts/direct', async (req, res) => {
  const { groupId, content } = req.body;
  if (!groupId || !content) {
    return res.status(400).json({ error: 'groupId and content are required' });
  }

  try {
    const result = await postToGroup({ groupId, content });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history', (req, res) => {
  const db = getDatabase();
  res.json(db.postHistory || []);
});

// ----------------------------------------------------
// 🔐 FACEBOOK AUTH & SESSION API
// ----------------------------------------------------
app.get('/api/auth/status', async (req, res) => {
  try {
    const status = await checkLoginStatus();
    res.json(status);
  } catch (err) {
    res.json({ isLoggedIn: false, error: err.message });
  }
});

app.post('/api/auth/login-assistant', async (req, res) => {
  try {
    const result = await launchLoginAssistant();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/import-cookies', (req, res) => {
  const { cookies } = req.body;
  if (!cookies) {
    return res.status(400).json({ error: 'Cookies data required' });
  }
  const result = importSessionCookies(cookies);
  res.json(result);
});

app.post('/api/auth/logout', (req, res) => {
  deleteSessionState();
  logEvent('info', 'Facebook session cleared.');
  res.json({ success: true });
});

// ----------------------------------------------------
// ⚙️ CONFIG & LOGS API
// ----------------------------------------------------
app.get('/api/config', (req, res) => {
  res.json(getConfig());
});

app.post('/api/config', (req, res) => {
  const newConfig = req.body;
  saveConfig(newConfig);
  logEvent('info', 'Configuration settings updated.');
  res.json({ success: true, config: newConfig });
});

app.get('/api/logs', (req, res) => {
  const db = getDatabase();
  res.json(db.logs || []);
});

app.post('/api/logs/clear', (req, res) => {
  const db = getDatabase();
  db.logs = [];
  saveDatabase(db);
  res.json({ success: true });
});

// ----------------------------------------------------
// 🤖 AUTOPILOT ENGINE API
// ----------------------------------------------------
const { runAutopilotCycle } = require('./services/autopilot');

app.get('/api/autopilot/status', (req, res) => {
  const config = getConfig();
  res.json({
    enabled: Boolean(config.autopilotEnabled),
    dailyJoinLimit: config.autopilotDailyJoinLimit || 3,
    autoSearch: config.autopilotAutoSearch !== false,
    autoGeneratePosts: config.autopilotAutoGeneratePosts !== false
  });
});

app.post('/api/autopilot/toggle', (req, res) => {
  const { enabled, dailyJoinLimit } = req.body;
  const config = getConfig();
  if (enabled !== undefined) config.autopilotEnabled = Boolean(enabled);
  if (dailyJoinLimit !== undefined) config.autopilotDailyJoinLimit = parseInt(dailyJoinLimit) || 3;
  
  saveConfig(config);
  logEvent('info', `Autopilot ${config.autopilotEnabled ? 'ENABLED 🟢' : 'DISABLED 🔴'}`);
  res.json({ success: true, enabled: config.autopilotEnabled, config });
});

app.post('/api/autopilot/run-now', async (req, res) => {
  try {
    const result = await runAutopilotCycle();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// ⏰ BACKGROUND AUTOMATION CRONS
// ----------------------------------------------------
// 1. Checks and processes posting queue every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  console.log('[CRON] Running scheduled post queue check...');
  try {
    await processNextQueueItem();
  } catch (err) {
    console.error('[CRON] Error processing queue:', err.message);
  }
});

// 2. Runs Autopilot Discovery & Auto-Joiner cycle every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  const config = getConfig();
  if (config.autopilotEnabled) {
    console.log('[CRON] Running scheduled Autopilot cycle...');
    try {
      await runAutopilotCycle();
    } catch (err) {
      console.error('[CRON] Error running autopilot:', err.message);
    }
  }
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Facebook Group Marketer & AI Auto-Poster`);
  console.log(`📡 Dashboard running at: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
