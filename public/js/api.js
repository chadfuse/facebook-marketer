function getStoredToken() {
  return localStorage.getItem('fb_marketer_admin_token') || '';
}

function setStoredToken(token) {
  if (token) {
    localStorage.setItem('fb_marketer_admin_token', token);
  } else {
    localStorage.removeItem('fb_marketer_admin_token');
  }
}

async function authFetch(url, options = {}) {
  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (response.status === 401 && !url.includes('/api/auth/admin-login') && !url.includes('/api/auth/admin-status')) {
    setStoredToken('');
    if (window.showAdminLoginModal) {
      window.showAdminLoginModal();
    }
    throw new Error('Unauthorized');
  }

  return response.json();
}

const API = {
  // Admin Auth
  adminLogin: (username, password) => fetch('/api/auth/admin-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  }).then(r => r.json()),

  adminStatus: () => authFetch('/api/auth/admin-status'),

  changePassword: (data) => authFetch('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // Autopilot Engine
  getAutopilotStatus: () => authFetch('/api/autopilot/status'),
  toggleAutopilot: (data) => authFetch('/api/autopilot/toggle', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  runAutopilotNow: () => authFetch('/api/autopilot/run-now', {
    method: 'POST'
  }),

  // Stats
  getStats: () => authFetch('/api/stats'),

  // Niches
  getNiches: () => authFetch('/api/niches'),
  createNiche: (data) => authFetch('/api/niches', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateNiche: (id, data) => authFetch(`/api/niches/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteNiche: (id) => authFetch(`/api/niches/${id}`, { method: 'DELETE' }),

  // Groups
  getGroups: (nicheId = '', status = '') => {
    let query = '';
    const params = [];
    if (nicheId) params.push(`nicheId=${encodeURIComponent(nicheId)}`);
    if (status) params.push(`status=${encodeURIComponent(status)}`);
    if (params.length) query = '?' + params.join('&');
    return authFetch(`/api/groups${query}`);
  },
  searchGroups: (nicheId) => authFetch('/api/groups/search', {
    method: 'POST',
    body: JSON.stringify({ nicheId })
  }),
  joinGroup: (groupId) => authFetch('/api/groups/join', {
    method: 'POST',
    body: JSON.stringify({ groupId })
  }),
  updateGroupStatus: (groupId, status, canPost) => authFetch(`/api/groups/${groupId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, canPost })
  }),
  deleteGroup: (groupId) => authFetch(`/api/groups/${groupId}`, { method: 'DELETE' }),

  // AI Generation
  getFrameworks: () => authFetch('/api/ai/frameworks'),
  generatePosts: (payload) => authFetch('/api/ai/generate', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  // Queue & Posting
  getQueue: () => authFetch('/api/queue'),
  addToQueue: (payload) => authFetch('/api/queue', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  deleteQueueItem: (id) => authFetch(`/api/queue/${id}`, { method: 'DELETE' }),
  processQueueNow: () => authFetch('/api/queue/process-now', { method: 'POST' }),
  postDirect: (groupId, content) => authFetch('/api/posts/direct', {
    method: 'POST',
    body: JSON.stringify({ groupId, content })
  }),
  getHistory: () => authFetch('/api/history'),

  // Auth & Session
  getAuthStatus: () => authFetch('/api/auth/status'),
  launchLoginAssistant: () => authFetch('/api/auth/login-assistant', { method: 'POST' }),
  importCookies: (cookies) => authFetch('/api/auth/import-cookies', {
    method: 'POST',
    body: JSON.stringify({ cookies })
  }),
  logout: () => authFetch('/api/auth/logout', { method: 'POST' }),

  // Config & Logs
  getConfig: () => authFetch('/api/config'),
  saveConfig: (config) => authFetch('/api/config', {
    method: 'POST',
    body: JSON.stringify(config)
  }),
  getLogs: () => authFetch('/api/logs'),
  clearLogs: () => authFetch('/api/logs/clear', { method: 'POST' })
};
