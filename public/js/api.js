const API = {
  // Stats
  getStats: () => fetch('/api/stats').then(r => r.json()),

  // Niches
  getNiches: () => fetch('/api/niches').then(r => r.json()),
  createNiche: (data) => fetch('/api/niches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  updateNiche: (id, data) => fetch(`/api/niches/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  deleteNiche: (id) => fetch(`/api/niches/${id}`, { method: 'DELETE' }).then(r => r.json()),

  // Groups
  getGroups: (nicheId = '', status = '') => {
    let query = '';
    const params = [];
    if (nicheId) params.push(`nicheId=${encodeURIComponent(nicheId)}`);
    if (status) params.push(`status=${encodeURIComponent(status)}`);
    if (params.length) query = '?' + params.join('&');
    return fetch(`/api/groups${query}`).then(r => r.json());
  },
  searchGroups: (nicheId) => fetch('/api/groups/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nicheId })
  }).then(r => r.json()),
  joinGroup: (groupId) => fetch('/api/groups/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupId })
  }).then(r => r.json()),
  updateGroupStatus: (groupId, status, canPost) => fetch(`/api/groups/${groupId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, canPost })
  }).then(r => r.json()),
  deleteGroup: (groupId) => fetch(`/api/groups/${groupId}`, { method: 'DELETE' }).then(r => r.json()),

  // AI Generation
  getFrameworks: () => fetch('/api/ai/frameworks').then(r => r.json()),
  generatePosts: (payload) => fetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(r => r.json()),

  // Queue & Posting
  getQueue: () => fetch('/api/queue').then(r => r.json()),
  addToQueue: (payload) => fetch('/api/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(r => r.json()),
  deleteQueueItem: (id) => fetch(`/api/queue/${id}`, { method: 'DELETE' }).then(r => r.json()),
  processQueueNow: () => fetch('/api/queue/process-now', { method: 'POST' }).then(r => r.json()),
  postDirect: (groupId, content) => fetch('/api/posts/direct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupId, content })
  }).then(r => r.json()),
  getHistory: () => fetch('/api/history').then(r => r.json()),

  // Auth & Session
  getAuthStatus: () => fetch('/api/auth/status').then(r => r.json()),
  launchLoginAssistant: () => fetch('/api/auth/login-assistant', { method: 'POST' }).then(r => r.json()),
  importCookies: (cookies) => fetch('/api/auth/import-cookies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookies })
  }).then(r => r.json()),
  logout: () => fetch('/api/auth/logout', { method: 'POST' }).then(r => r.json()),

  // Config & Logs
  getConfig: () => fetch('/api/config').then(r => r.json()),
  saveConfig: (config) => fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  }).then(r => r.json()),
  getLogs: () => fetch('/api/logs').then(r => r.json()),
  clearLogs: () => fetch('/api/logs/clear', { method: 'POST' }).then(r => r.json())
};
