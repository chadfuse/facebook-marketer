// State Management
const state = {
  activeView: 'overview',
  niches: [],
  groups: [],
  frameworks: {},
  selectedFramework: 'audit',
  generatedPosts: [],
  queue: [],
  history: [],
  logs: [],
  config: {},
  auth: { isLoggedIn: false },
  editingNicheId: null,
  isSearchingGroups: false,
  isGeneratingAi: false,
  selectedGroupIds: new Set(),
  groupsPage: 1,
  groupsPerPage: 10
};

// Admin Auth Handlers
window.showAdminLoginModal = function() {
  const modal = document.getElementById('admin-login-modal');
  if (modal) modal.classList.add('active');
  document.getElementById('admin-user-display').style.display = 'none';
  document.getElementById('btn-admin-logout').style.display = 'none';
};

window.hideAdminLoginModal = function() {
  const modal = document.getElementById('admin-login-modal');
  if (modal) modal.classList.remove('active');
};

function updateAdminUserUI(username) {
  const display = document.getElementById('admin-user-display');
  const label = document.getElementById('admin-username-label');
  const logoutBtn = document.getElementById('btn-admin-logout');

  if (username) {
    if (display) display.style.display = 'inline-block';
    if (label) label.innerText = username;
    if (logoutBtn) logoutBtn.style.display = 'inline-block';
  } else {
    if (display) display.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }
}

function logoutAdmin() {
  setStoredToken('');
  updateAdminUserUI(null);
  window.showAdminLoginModal();
  showToast('Signed out of admin dashboard', 'info');
}

// DOM Initializer
document.addEventListener('DOMContentLoaded', async () => {
  initNavigation();
  initModals();
  initFrameworkSelector();
  initForms();
  
  // Check Admin Login status first
  try {
    const status = await API.adminStatus();
    if (status && status.isAuthenticated) {
      updateAdminUserUI(status.user || 'admin');
      window.hideAdminLoginModal();
      fetchAllData();
    } else {
      window.showAdminLoginModal();
    }
  } catch (e) {
    window.showAdminLoginModal();
  }
  
  // Refresh stats & logs periodically if logged in
  setInterval(() => {
    if (getStoredToken()) refreshLogs();
  }, 10000);
});

// Toast System
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
    <div>${message}</div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ----------------------------------------------------------------
// 💀 DAISYUI SKELETON LOADERS
// ----------------------------------------------------------------
function renderTableSkeleton(tbodyId, columns = 6, rows = 5, message = '') {
  const container = document.getElementById(tbodyId);
  if (!container) return;

  const headerNotice = message ? `
    <tr>
      <td colspan="${columns}" class="py-3 px-4 bg-base-300/40 text-center">
        <div class="flex items-center justify-center gap-2 text-xs font-semibold text-primary animate-pulse">
          <span class="loading loading-spinner loading-xs text-primary"></span>
          <span>${escapeHtml(message)}</span>
        </div>
      </td>
    </tr>
  ` : '';

  const widthVariants = ['w-3/4', 'w-1/2', 'w-2/3', 'w-4/5', 'w-3/5', 'w-24'];
  const skeletonRows = Array.from({ length: rows }).map((_, i) => `
    <tr class="animate-pulse">
      ${Array.from({ length: columns }).map((_, c) => {
        if (c === 0 && columns >= 6) {
          return `<td><div class="skeleton h-4 w-4 rounded"></div></td>`;
        }
        const w = widthVariants[(i + c) % widthVariants.length];
        return `<td><div class="skeleton h-3.5 ${w} rounded opacity-60"></div></td>`;
      }).join('')}
    </tr>
  `).join('');

  container.innerHTML = headerNotice + skeletonRows;
}

function renderFrameworkCardsSkeleton() {
  const container = document.getElementById('frameworks-container');
  if (!container) return;
  container.innerHTML = Array.from({ length: 4 }).map(() => `
    <div class="framework-card animate-pulse">
      <div class="skeleton h-4 w-3/4 mb-2.5 rounded"></div>
      <div class="skeleton h-3 w-full mb-1.5 rounded opacity-50"></div>
      <div class="skeleton h-3 w-4/5 rounded opacity-50"></div>
    </div>
  `).join('');
}

function renderAiPostSkeleton() {
  const container = document.getElementById('generated-posts-container');
  if (!container) return;
  container.innerHTML = Array.from({ length: 2 }).map(() => `
    <div class="card bg-base-300/60 border border-base-100 p-5 animate-pulse mb-4">
      <div class="flex justify-between items-center mb-3">
        <div class="skeleton h-4 w-1/3 rounded"></div>
        <div class="skeleton h-6 w-20 rounded"></div>
      </div>
      <div class="skeleton h-3.5 w-full mb-2 rounded opacity-70"></div>
      <div class="skeleton h-3.5 w-5/6 mb-2 rounded opacity-70"></div>
      <div class="skeleton h-3.5 w-4/5 mb-4 rounded opacity-70"></div>
      <div class="flex gap-2 justify-end">
        <div class="skeleton h-7 w-24 rounded"></div>
        <div class="skeleton h-7 w-24 rounded"></div>
      </div>
    </div>
  `).join('');
}

function initAllSkeletons() {
  renderTableSkeleton('groups-table-body', 7, 5);
  renderTableSkeleton('niches-table-body', 5, 3);
  renderTableSkeleton('recent-posts-list', 4, 3);
  renderTableSkeleton('queue-table-body', 6, 3);
  renderTableSkeleton('history-table-body', 5, 3);
  renderFrameworkCardsSkeleton();
}

// Navigation Handling
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = item.getAttribute('data-view');
      switchView(targetView);
    });
  });
}

function switchView(viewName) {
  state.activeView = viewName;
  
  // Update nav active states
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.getAttribute('data-view') === viewName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update view panel
  document.querySelectorAll('.view-panel').forEach(panel => {
    if (panel.id === `view-${viewName}`) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });

  // Update header title
  const titles = {
    overview: { title: 'Marketing Command Center', desc: 'Real-time overview of Facebook groups, outreach queue, and performance.' },
    niches: { title: 'Niche & Keyword Manager', desc: 'Target local industries and specific pain points to reach ideal web dev clients.' },
    groups: { title: 'Facebook Group Discovery & Joiner', desc: 'Search Facebook for niche groups and manage membership & join requests.' },
    studio: { title: 'Gemini AI Outreach Studio', desc: 'Generate 4 high-converting marketing framework posts tailored to any trade.' },
    queue: { title: 'Post Scheduler & Queue', desc: 'Manage automated daily posting queue with human-like anti-ban delays.' },
    settings: { title: 'Settings & Facebook Session', desc: 'Configure Gemini API keys, portfolio links, and manage Facebook authentication.' },
    logs: { title: 'System Activity Logs', desc: 'Live event stream of searches, joins, and posting operations.' }
  };

  const current = titles[viewName] || titles.overview;
  document.getElementById('view-title').innerText = current.title;
  document.getElementById('view-desc').innerText = current.desc;

  if (viewName === 'overview') loadOverviewStats();
  if (viewName === 'niches') renderNiches();
  if (viewName === 'groups') renderGroups();
  if (viewName === 'queue') renderQueueAndHistory();
  if (viewName === 'logs') refreshLogs();
}

// Data Fetching
async function fetchAllData() {
  initAllSkeletons();
  try {
    const [niches, groups, frameworks, config, auth, queue, history, autopilot] = await Promise.all([
      API.getNiches(),
      API.getGroups(),
      API.getFrameworks(),
      API.getConfig(),
      API.getAuthStatus().catch(() => ({ isLoggedIn: false })),
      API.getQueue(),
      API.getHistory(),
      API.getAutopilotStatus().catch(() => ({ enabled: false }))
    ]);

    state.niches = niches || [];
    state.groups = groups || [];
    state.frameworks = frameworks || {};
    state.config = config || {};
    state.auth = auth || { isLoggedIn: false };
    state.queue = queue || [];
    state.history = history || [];
    state.autopilot = autopilot || { enabled: false };

    updateAuthBadge();
    updateAutopilotUI(state.autopilot);
    populateNicheSelectDropdowns();
    renderFrameworkCards();
    loadOverviewStats();
    populateSettingsForm();
    renderGroups();
    renderNiches();
    renderQueueAndHistory();
  } catch (err) {
    console.error('Error fetching initial data:', err);
  }
}

// Autopilot UI Update & Handlers
function updateAutopilotUI(autopilot) {
  const toggle = document.getElementById('autopilot-toggle-switch');
  const badge = document.getElementById('autopilot-status-badge');
  if (toggle) {
    toggle.checked = Boolean(autopilot.enabled);
  }
  if (badge) {
    if (autopilot.enabled) {
      badge.className = 'badge badge-joined';
      badge.innerText = 'Active 🟢';
    } else {
      badge.className = 'badge badge-discovered';
      badge.innerText = 'Standby ⏸️';
    }
  }
}

async function toggleAutopilotMode(enabled) {
  try {
    const res = await API.toggleAutopilot({ enabled });
    if (res.success) {
      state.autopilot.enabled = res.enabled;
      updateAutopilotUI(state.autopilot);
      showToast(res.enabled ? 'Autopilot Outreach Engine Activated! 🚀' : 'Autopilot set to Standby ⏸️', 'success');
      refreshLogs();
    }
  } catch (err) {
    showToast('Failed to toggle autopilot: ' + err.message, 'error');
    updateAutopilotUI(state.autopilot);
  }
}

async function triggerRunAutopilotNow() {
  const btn = document.getElementById('btn-run-autopilot-now');
  if (btn) {
    btn.disabled = true;
    btn.innerText = '⏳ Running Cycle...';
  }
  showToast('Executing Autopilot cycle (Discovery, Join & Queue)...', 'info');

  try {
    const res = await API.runAutopilotNow();
    if (res.status === 'success') {
      showToast(`Autopilot finished! Discovered: ${res.results.discoveredCount}, Joined: ${res.results.joinedCount}, Queued: ${res.results.generatedPostsCount}`, 'success');
      fetchAllData();
    } else if (res.status === 'disabled') {
      showToast('Turn ON the Autopilot switch first', 'warn');
    } else {
      showToast('Autopilot result: ' + (res.message || res.status), 'info');
    }
    refreshLogs();
  } catch (err) {
    showToast('Autopilot error: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = '⚡ Run Cycle Now';
    }
  }
}

// Auth Status Badge
function updateAuthBadge() {
  const dot = document.getElementById('auth-status-dot');
  const text = document.getElementById('auth-status-text');
  if (dot && text) {
    if (state.auth.isLoggedIn) {
      dot.className = 'status-dot connected';
      text.innerText = 'FB Session Connected';
    } else {
      dot.className = 'status-dot';
      text.innerText = 'FB Not Logged In';
    }
  }
}

// Overview Dashboard Stats
async function loadOverviewStats() {
  try {
    const stats = await API.getStats();
    document.getElementById('stat-niches').innerText = stats.nichesCount || 0;
    document.getElementById('stat-groups').innerText = stats.groupsCount || 0;
    document.getElementById('stat-joined').innerText = stats.joinedGroupsCount || 0;
    document.getElementById('stat-pending').innerText = stats.pendingJoinCount || 0;
    document.getElementById('stat-queued').innerText = stats.queuedPostsCount || 0;
    document.getElementById('stat-today').innerText = `${stats.postsToday || 0} / ${state.config.dailyPostLimit || 5}`;

    renderRecentHistoryTable(state.history.slice(0, 5));
  } catch (e) {
    console.error('Failed to load overview stats:', e);
  }
}

function renderRecentHistoryTable(items) {
  const container = document.getElementById('recent-posts-list');
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = `<tr><td colspan="4" class="text-center text-xs text-base-content/50 py-6">No posts published yet. Start by generating tailored copy in the AI Studio!</td></tr>`;
    return;
  }

  container.innerHTML = items.map(p => `
    <tr>
      <td><strong class="text-white text-xs">${escapeHtml(p.groupName)}</strong></td>
      <td><span class="badge badge-sm badge-ghost">${escapeHtml(p.nicheName || 'General')}</span></td>
      <td class="text-xs text-base-content/70">${new Date(p.postedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${new Date(p.postedAt).toLocaleDateString()})</td>
      <td><span class="badge badge-sm badge-success">Published</span></td>
    </tr>
  `).join('');
}

// ----------------------------------------------------------------
// 🎯 NICHES MANAGEMENT
// ----------------------------------------------------------------
function renderNiches() {
  const container = document.getElementById('niches-table-body');
  if (!container) return;

  if (state.niches.length === 0) {
    container.innerHTML = `<tr><td colspan="5" class="text-center text-xs text-base-content/50 py-8">No niches added yet. Click "+ Add New Niche" to target your first industry!</td></tr>`;
    return;
  }

  container.innerHTML = state.niches.map(n => {
    const groupCount = state.groups.filter(g => g.nicheId === n.id).length;
    const joinedCount = state.groups.filter(g => g.nicheId === n.id && g.status === 'joined').length;

    return `
      <tr>
        <td>
          <div class="font-bold text-sm text-white">${escapeHtml(n.name)}</div>
          <div class="text-xs text-base-content/60">${escapeHtml(n.industry || '')} &bull; ${escapeHtml(n.location || 'Any Region')}</div>
        </td>
        <td><code class="text-xs text-primary bg-primary/10 px-2 py-1 rounded font-mono">${escapeHtml(n.keyword)}</code></td>
        <td class="max-w-xs text-xs text-base-content/80 truncate">${escapeHtml(n.specificAngle || 'Standard Web Development pitch')}</td>
        <td>
          <span class="badge badge-sm badge-info badge-outline">${groupCount} Groups</span>
          ${joinedCount > 0 ? `<span class="badge badge-sm badge-success ml-1">${joinedCount} Joined</span>` : ''}
        </td>
        <td>
          <div class="flex gap-1.5">
            <button class="btn btn-ghost btn-xs text-primary" onclick="triggerSearchNicheGroups('${n.id}')">🔍 Find Groups</button>
            <button class="btn btn-ghost btn-xs" onclick="editNiche('${n.id}')">✏️ Edit</button>
            <button class="btn btn-ghost btn-xs text-error" onclick="deleteNicheConfirm('${n.id}')">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openNicheModal(niche = null) {
  state.editingNicheId = niche ? niche.id : null;
  document.getElementById('niche-modal-title').innerText = niche ? 'Edit Niche Target' : 'Add New Target Niche';
  document.getElementById('niche-form-name').value = niche ? niche.name : '';
  document.getElementById('niche-form-keyword').value = niche ? niche.keyword : '';
  document.getElementById('niche-form-industry').value = niche ? niche.industry : '';
  document.getElementById('niche-form-location').value = niche ? niche.location : '';
  document.getElementById('niche-form-angle').value = niche ? niche.specificAngle : '';

  document.getElementById('niche-modal').classList.add('active');
}

function editNiche(id) {
  const niche = state.niches.find(n => n.id === id);
  if (niche) openNicheModal(niche);
}

async function deleteNicheConfirm(id) {
  if (!confirm('Are you sure you want to delete this niche?')) return;
  try {
    await API.deleteNiche(id);
    state.niches = state.niches.filter(n => n.id !== id);
    renderNiches();
    populateNicheSelectDropdowns();
    showToast('Niche deleted successfully', 'success');
  } catch (err) {
    showToast('Error deleting niche', 'error');
  }
}

// ----------------------------------------------------------------
// 👥 GROUPS DISCOVERY & JOINING
// ----------------------------------------------------------------
function populateNicheSelectDropdowns() {
  const selects = ['group-filter-niche', 'search-niche-select', 'studio-niche-select', 'queue-niche-select', 'add-group-niche-select'];
  selects.forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;

    const currentVal = sel.value;
    sel.innerHTML = `<option value="">-- Select Niche --</option>` + state.niches.map(n => `
      <option value="${n.id}">${escapeHtml(n.name)}</option>
    `).join('');

    if (currentVal) sel.value = currentVal;
  });
}

let currentGroupStatusFilter = '';

function setGroupStatusFilter(status) {
  currentGroupStatusFilter = status;
  state.groupsPage = 1;
  
  // Update tab active classes
  document.querySelectorAll('.group-tab-btn').forEach(btn => {
    if (btn.getAttribute('data-status') === status) {
      btn.className = 'btn btn-xs btn-active group-tab-btn';
    } else {
      const s = btn.getAttribute('data-status');
      const textClass = s === 'joined' ? 'text-success' : s === 'join_requested' ? 'text-warning' : s === 'discovered' ? 'text-info' : s === 'rejected' ? 'text-error' : '';
      btn.className = `btn btn-xs btn-ghost ${textClass} group-tab-btn`;
    }
  });

  renderGroups();
}

function updateGroupTabCounts() {
  const groups = state.groups || [];
  const allCount = groups.length;
  const joinedCount = groups.filter(g => g.status === 'joined').length;
  const pendingCount = groups.filter(g => g.status === 'join_requested').length;
  const discoveredCount = groups.filter(g => g.status === 'discovered').length;
  const rejectedCount = groups.filter(g => g.status === 'rejected').length;

  const elAll = document.getElementById('tab-count-all');
  const elJoined = document.getElementById('tab-count-joined');
  const elPending = document.getElementById('tab-count-pending');
  const elDiscovered = document.getElementById('tab-count-discovered');
  const elRejected = document.getElementById('tab-count-rejected');

  if (elAll) elAll.innerText = allCount;
  if (elJoined) elJoined.innerText = joinedCount;
  if (elPending) elPending.innerText = pendingCount;
  if (elDiscovered) elDiscovered.innerText = discoveredCount;
  if (elRejected) elRejected.innerText = rejectedCount;
}

function updateBatchBar() {
  const bar = document.getElementById('groups-batch-bar');
  const countSpan = document.getElementById('batch-selected-count');
  const selectAll = document.getElementById('select-all-groups');

  const count = state.selectedGroupIds.size;
  if (countSpan) countSpan.innerText = count;

  if (bar) {
    if (count > 0) {
      bar.classList.remove('hidden');
    } else {
      bar.classList.add('hidden');
    }
  }

  if (selectAll) {
    const visibleGroups = getFilteredGroups();
    selectAll.checked = visibleGroups.length > 0 && visibleGroups.every(g => state.selectedGroupIds.has(g.id));
  }
}

function getFilteredGroups() {
  const nicheFilter = document.getElementById('group-filter-niche')?.value || '';
  const statusFilter = currentGroupStatusFilter;
  let filtered = state.groups || [];
  if (nicheFilter) filtered = filtered.filter(g => g.nicheId === nicheFilter);
  if (statusFilter) filtered = filtered.filter(g => g.status === statusFilter);
  return filtered;
}

function toggleSelectAllGroups(checked) {
  const visible = getFilteredGroups();
  visible.forEach(g => {
    if (checked) {
      state.selectedGroupIds.add(g.id);
    } else {
      state.selectedGroupIds.delete(g.id);
    }
  });
  renderGroups();
}

function toggleGroupSelect(groupId, checked) {
  if (checked) {
    state.selectedGroupIds.add(groupId);
  } else {
    state.selectedGroupIds.delete(groupId);
  }
  updateBatchBar();
}

async function applyBatchStatus(status) {
  const ids = Array.from(state.selectedGroupIds);
  if (ids.length === 0) return;

  showToast(`Updating ${ids.length} group(s) to "${status}"...`, 'info');
  try {
    const res = await API.batchUpdateGroupStatus(ids, status);
    if (res.success) {
      state.groups = await API.getGroups();
      state.selectedGroupIds.clear();
      renderGroups();
      loadOverviewStats();
      showToast(`Updated ${res.updatedCount} groups to ${status}!`, 'success');
    }
  } catch (err) {
    showToast('Batch update error: ' + err.message, 'error');
  }
}

async function deleteBatchSelectedGroups() {
  const ids = Array.from(state.selectedGroupIds);
  if (ids.length === 0) return;
  if (!confirm(`Permanently remove ${ids.length} selected group(s)?`)) return;

  showToast(`Removing ${ids.length} groups...`, 'info');
  try {
    for (const id of ids) {
      await API.deleteGroup(id).catch(() => {});
    }
    state.selectedGroupIds.clear();
    state.groups = await API.getGroups();
    renderGroups();
    loadOverviewStats();
    showToast(`Removed ${ids.length} groups`, 'success');
  } catch (err) {
    showToast('Delete error: ' + err.message, 'error');
  }
}

async function changeGroupStatusDropdown(groupId, newStatus) {
  try {
    const isJoined = newStatus === 'joined';
    await API.updateGroupStatus(groupId, newStatus, isJoined);
    state.groups = await API.getGroups();
    renderGroups();
    loadOverviewStats();
    showToast(`Group status set to ${newStatus === 'joined' ? '✅ Joined (Member)' : newStatus}`, 'success');
  } catch (err) {
    showToast('Failed to update status: ' + err.message, 'error');
  }
}

function changeGroupsPage(newPage) {
  state.groupsPage = newPage;
  renderGroups();
}

function changeGroupsPerPage(newPerPage) {
  state.groupsPerPage = newPerPage === 'all' ? 'all' : parseInt(newPerPage) || 10;
  state.groupsPage = 1;
  renderGroups();
}

function renderGroups() {
  const container = document.getElementById('groups-table-body');
  if (!container) return;

  updateGroupTabCounts();
  updateBatchBar();

  const filtered = getFilteredGroups();
  const totalCount = filtered.length;

  // Calculate pagination
  let perPage = state.groupsPerPage === 'all' ? totalCount : (parseInt(state.groupsPerPage) || 10);
  if (perPage <= 0) perPage = 10;
  const totalPages = state.groupsPerPage === 'all' ? 1 : (Math.ceil(totalCount / perPage) || 1);

  if (state.groupsPage > totalPages) state.groupsPage = totalPages;
  if (state.groupsPage < 1) state.groupsPage = 1;

  const startIndex = state.groupsPerPage === 'all' ? 0 : (state.groupsPage - 1) * perPage;
  const endIndex = state.groupsPerPage === 'all' ? totalCount : Math.min(startIndex + perPage, totalCount);
  const pagedGroups = state.groupsPerPage === 'all' ? filtered : filtered.slice(startIndex, endIndex);

  // Update Pagination Info
  const pageInfoEl = document.getElementById('groups-page-info');
  if (pageInfoEl) {
    pageInfoEl.innerText = totalCount === 0
      ? 'Showing 0–0 of 0 groups'
      : `Showing ${startIndex + 1}–${endIndex} of ${totalCount} groups`;
  }

  // Render Pagination Buttons
  const paginationContainer = document.getElementById('groups-pagination-buttons');
  if (paginationContainer) {
    if (totalPages <= 1) {
      paginationContainer.innerHTML = `
        <button class="join-item btn btn-xs btn-disabled">Page 1 of 1</button>
      `;
    } else {
      let buttonsHtml = '';
      // First and Previous buttons
      buttonsHtml += `
        <button class="join-item btn btn-xs ${state.groupsPage === 1 ? 'btn-disabled' : ''}" onclick="changeGroupsPage(1)" title="First Page">«</button>
        <button class="join-item btn btn-xs ${state.groupsPage === 1 ? 'btn-disabled' : ''}" onclick="changeGroupsPage(${state.groupsPage - 1})" title="Previous Page">‹</button>
      `;

      // Numbered page buttons (window of 5 around current)
      const startPage = Math.max(1, state.groupsPage - 2);
      const endPage = Math.min(totalPages, startPage + 4);

      for (let p = startPage; p <= endPage; p++) {
        buttonsHtml += `
          <button class="join-item btn btn-xs ${p === state.groupsPage ? 'btn-active btn-primary font-bold' : ''}" onclick="changeGroupsPage(${p})">${p}</button>
        `;
      }

      // Next and Last buttons
      buttonsHtml += `
        <button class="join-item btn btn-xs ${state.groupsPage === totalPages ? 'btn-disabled' : ''}" onclick="changeGroupsPage(${state.groupsPage + 1})" title="Next Page">›</button>
        <button class="join-item btn btn-xs ${state.groupsPage === totalPages ? 'btn-disabled' : ''}" onclick="changeGroupsPage(${totalPages})" title="Last Page">»</button>
      `;

      paginationContainer.innerHTML = buttonsHtml;
    }
  }

  if (pagedGroups.length === 0) {
    const emptyMsg = currentGroupStatusFilter === 'joined'
      ? 'No accepted groups yet. Click "📥 Import My Joined Groups" to sync groups you already belong to, or add one with "➕ Add Group by Link"!'
      : currentGroupStatusFilter === 'join_requested'
      ? 'No pending join requests currently waiting for approval.'
      : currentGroupStatusFilter === 'rejected'
      ? 'No rejected or ineligible groups.'
      : 'No groups found. Select a niche and click "Search FB Groups" or import your existing groups!';
    container.innerHTML = `<tr><td colspan="7" class="text-center text-xs text-base-content/50 py-8">${emptyMsg}</td></tr>`;
    return;
  }

  container.innerHTML = pagedGroups.map(g => {
    let rowHighlightClass = '';
    let selectStatusColor = 'select-info';

    if (g.status === 'joined') {
      rowHighlightClass = 'bg-success/5 hover:bg-success/10 transition-colors';
      selectStatusColor = 'select-success text-success';
    } else if (g.status === 'join_requested') {
      selectStatusColor = 'select-warning text-warning';
    } else if (g.status === 'rejected') {
      selectStatusColor = 'select-error text-error';
    }

    const isChecked = state.selectedGroupIds.has(g.id);

    return `
      <tr class="${rowHighlightClass}">
        <td>
          <input type="checkbox" class="checkbox checkbox-xs checkbox-primary group-row-checkbox" ${isChecked ? 'checked' : ''} onchange="toggleGroupSelect('${g.id}', this.checked)" />
        </td>
        <td>
          <a href="${escapeHtml(g.url)}" target="_blank" class="font-bold text-sm text-white hover:text-primary transition-colors flex items-center gap-1.5">
            ${escapeHtml(g.name)}
            <svg class="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          </a>
          <span class="text-xs text-base-content/50 font-mono">${escapeHtml(g.groupIdentifier || '')}</span>
        </td>
        <td><span class="badge badge-sm badge-ghost">${escapeHtml(g.nicheName || 'General')}</span></td>
        <td class="text-xs font-medium">${escapeHtml(g.members || 'Member')}</td>
        <td class="text-xs text-base-content/70">${escapeHtml(g.privacy || 'Public')}</td>
        <td>
          <select class="select select-bordered select-xs font-semibold ${selectStatusColor} w-full max-w-[170px]" onchange="changeGroupStatusDropdown('${g.id}', this.value)">
            <option value="joined" ${g.status === 'joined' ? 'selected' : ''}>✅ Joined (Member)</option>
            <option value="join_requested" ${g.status === 'join_requested' ? 'selected' : ''}>⏳ Pending Approval</option>
            <option value="discovered" ${g.status === 'discovered' ? 'selected' : ''}>🔍 Discovered</option>
            <option value="rejected" ${g.status === 'rejected' ? 'selected' : ''}>❌ Ineligible / Rejected</option>
          </select>
        </td>
        <td>
          <div class="flex items-center gap-1.5 flex-wrap">
            ${g.status === 'joined' ? `
              <button class="btn btn-primary btn-xs" onclick="openPostModalForGroup('${g.id}')">✍️ Post Now</button>
            ` : `
              <button class="btn btn-success btn-xs" onclick="joinGroupClick('${g.id}')">🚀 Auto-Join</button>
            `}
            <button class="btn btn-ghost btn-xs text-info" title="Verify Membership Live on Facebook" onclick="verifyGroupClick('${g.id}')">🔍 Check</button>
            <button class="btn btn-ghost btn-xs text-error" title="Delete group" onclick="deleteGroupClick('${g.id}')">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function triggerImportMyGroups() {
  const btn = document.getElementById('btn-import-my-groups');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Scanning Facebook Groups...';
  }
  showToast('Connecting to Facebook to import all groups you have joined...', 'info');
  renderTableSkeleton('groups-table-body', 7, 6, 'Scanning Facebook /groups/joins/ for your existing groups...');

  try {
    const res = await API.importMyGroups();
    if (res.success) {
      state.groups = await API.getGroups();
      state.groupsPage = 1;
      renderGroups();
      loadOverviewStats();
      showToast(`🎉 Imported ${res.importedCount} new groups! Total joined: ${res.totalJoinedCount}`, 'success');
    } else {
      renderGroups();
      showToast(res.error || 'Failed to import joined groups', 'error');
    }
    refreshLogs();
  } catch (err) {
    renderGroups();
    showToast('Import error: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '📥 Import My Joined Groups';
    }
  }
}

function openAddGroupModal() {
  populateNicheSelectDropdowns();
  const modal = document.getElementById('add-group-modal');
  if (modal) {
    document.getElementById('add-group-url').value = '';
    document.getElementById('add-group-name').value = '';
    document.getElementById('add-group-status-select').value = 'joined';
    modal.classList.add('active');
  }
}

async function verifyGroupClick(groupId) {
  showToast('Visiting Facebook group to verify live membership status...', 'info');
  try {
    const res = await API.verifyGroup(groupId);
    if (res.success) {
      state.groups = await API.getGroups();
      renderGroups();
      loadOverviewStats();
      if (res.isJoined) {
        showToast('🎉 Confirmed! You are an active member with posting access.', 'success');
      } else if (res.status === 'join_requested') {
        showToast('⏳ Group join request is currently pending admin approval.', 'warn');
      } else {
        showToast('ℹ️ Live check: Not a member yet (status: Discovered).', 'info');
      }
    } else {
      showToast(res.error || 'Verification failed', 'error');
    }
    refreshLogs();
  } catch (err) {
    showToast('Verification error: ' + err.message, 'error');
  }
}

async function triggerSyncGroupStatuses(includeDiscovered = true) {
  const btn = document.getElementById('btn-sync-group-statuses');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Auto-Detecting Statuses...';
  }
  showToast('Visiting group URLs on Facebook to auto-detect your live membership status...', 'info');
  renderTableSkeleton('groups-table-body', 7, 6, 'Live-verifying Facebook membership statuses & composer access...');

  try {
    const res = await API.syncGroupStatuses(includeDiscovered);
    if (res.success) {
      state.groups = await API.getGroups();
      renderGroups();
      loadOverviewStats();
      if (res.newlyAcceptedCount > 0) {
        showToast(`🎉 Auto-detected ${res.newlyAcceptedCount} group(s) as Joined (Member)! Statuses updated.`, 'success');
      } else {
        showToast(`Checked ${res.checkedCount} groups on Facebook.`, 'info');
      }
    } else {
      renderGroups();
      showToast(res.message || 'No groups to check', 'info');
    }
    refreshLogs();
  } catch (err) {
    renderGroups();
    showToast('Sync error: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '⚡ Auto-Detect & Sync Statuses';
    }
  }
}

async function triggerSearchNicheGroups(nicheId) {
  switchView('groups');
  document.getElementById('search-niche-select').value = nicheId;
  document.getElementById('group-filter-niche').value = nicheId;
  await executeGroupSearch(nicheId);
}

async function executeGroupSearch(nicheId) {
  if (!nicheId) {
    showToast('Please select a niche to search Facebook groups for', 'error');
    return;
  }

  const searchBtn = document.getElementById('btn-run-group-search');
  if (searchBtn) {
    searchBtn.disabled = true;
    searchBtn.innerHTML = `<span class="loading loading-spinner loading-xs"></span> Searching Facebook...`;
  }

  showToast('Starting Facebook group discovery in background...', 'info');
  renderTableSkeleton('groups-table-body', 7, 6, 'Searching Facebook keyword index & scrolling for active groups...');

  try {
    const res = await API.searchGroups(nicheId);
    if (res.success) {
      showToast(`Discovered ${res.count} Facebook groups!`, 'success');
      state.groups = await API.getGroups();
      state.groupsPage = 1;
      renderGroups();
      loadOverviewStats();
    } else {
      renderGroups();
      showToast(res.error || 'Failed to search groups', 'error');
    }
  } catch (err) {
    renderGroups();
    showToast('Search failed: ' + err.message, 'error');
  } finally {
    if (searchBtn) {
      searchBtn.disabled = false;
      searchBtn.innerHTML = `🔍 Search FB Groups`;
    }
  }
}

async function joinGroupClick(groupId) {
  showToast('Submitting join request to Facebook group...', 'info');
  try {
    const res = await API.joinGroup(groupId);
    if (res.success) {
      showToast(res.message || 'Join request processed!', 'success');
      state.groups = await API.getGroups();
      renderGroups();
      loadOverviewStats();
    } else {
      showToast(res.message || 'Could not join group automatically', 'error');
    }
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function toggleGroupJoined(groupId, status) {
  try {
    const isJoined = status === 'joined';
    await API.updateGroupStatus(groupId, status, isJoined);
    state.groups = await API.getGroups();
    renderGroups();
    loadOverviewStats();
    showToast(`Group status updated to ${isJoined ? 'Joined (Member)' : status}`, 'success');
  } catch (e) {
    showToast('Failed to update status: ' + e.message, 'error');
  }
}

async function deleteGroupClick(groupId) {
  if (!confirm('Remove this group from list?')) return;
  try {
    await API.deleteGroup(groupId);
    state.groups = state.groups.filter(g => g.id !== groupId);
    state.selectedGroupIds.delete(groupId);
    renderGroups();
    loadOverviewStats();
    showToast('Group removed', 'info');
  } catch (e) {
    showToast('Failed to remove group', 'error');
  }
}

// ----------------------------------------------------------------
// ✍️ GEMINI AI CONTENT STUDIO
// ----------------------------------------------------------------
function renderFrameworkCards() {
  const container = document.getElementById('frameworks-container');
  if (!container || !state.frameworks) return;

  container.innerHTML = Object.entries(state.frameworks).map(([key, f]) => `
    <div class="framework-card ${state.selectedFramework === key ? 'active' : ''}" data-framework="${key}" onclick="selectFramework('${key}')">
      <h4>${escapeHtml(f.name)}</h4>
      <p>${escapeHtml(f.description)}</p>
    </div>
  `).join('');
}

function selectFramework(key) {
  state.selectedFramework = key;
  renderFrameworkCards();
}

function initFrameworkSelector() {
  // Handled via renderFrameworkCards & onclick
}

async function generateAiPosts() {
  const nicheId = document.getElementById('studio-niche-select')?.value;
  const count = parseInt(document.getElementById('studio-count-select')?.value || '3');
  const customInstructions = document.getElementById('studio-custom-prompt')?.value || '';
  const portfolioUrl = document.getElementById('studio-portfolio-input')?.value || state.config.portfolioUrl;

  const btn = document.getElementById('btn-generate-ai');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="loading loading-spinner loading-xs"></span> Generating with Gemini AI...`;
  }

  showToast('Gemini is generating high-converting post variations...', 'info');
  renderAiPostSkeleton();

  try {
    const res = await API.generatePosts({
      nicheId,
      framework: state.selectedFramework,
      count,
      customInstructions,
      portfolioUrl
    });

    if (res.success && res.posts) {
      state.generatedPosts = res.posts;
      renderGeneratedPosts();
      showToast(`Generated ${res.posts.length} post variation(s)!`, 'success');
    } else {
      renderGeneratedPosts();
      showToast(res.error || 'Failed to generate posts', 'error');
    }
  } catch (err) {
    renderGeneratedPosts();
    showToast('Generation error: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `✨ Generate Tailored Posts`;
    }
  }
}

function renderGeneratedPosts() {
  const container = document.getElementById('generated-posts-container');
  if (!container) return;

  if (state.generatedPosts.length === 0) {
    container.innerHTML = `<div class="text-center text-xs text-base-content/50 py-8">No posts generated yet. Choose a framework above and click "Generate Tailored Posts"!</div>`;
    return;
  }

  container.innerHTML = state.generatedPosts.map((postText, idx) => `
    <div class="card bg-base-300/60 border border-base-100/60 p-4 rounded-xl">
      <div class="flex justify-between items-center mb-2">
        <span class="badge badge-sm badge-info badge-outline">Variation #${idx + 1} &bull; ${state.frameworks[state.selectedFramework]?.name || 'Framework'}</span>
        <button class="btn btn-ghost btn-xs text-primary" onclick="copyToClipboard(${idx})">📋 Copy Text</button>
      </div>
      <div class="post-content-preview" id="post-preview-${idx}">${escapeHtml(postText)}</div>
      <div class="flex justify-end gap-2 mt-2">
        <button class="btn btn-primary btn-xs" onclick="openScheduleModal(${idx})">📅 Schedule to Group</button>
        <button class="btn btn-success btn-xs" onclick="openDirectPostModal(${idx})">🚀 Direct Post Now</button>
      </div>
    </div>
  `).join('');
}

function copyToClipboard(idx) {
  const text = state.generatedPosts[idx];
  if (text) {
    navigator.clipboard.writeText(text);
    showToast('Post copied to clipboard!', 'success');
  }
}

function openScheduleModal(postIdx) {
  const text = state.generatedPosts[postIdx];
  document.getElementById('queue-post-content').value = text;
  populateQueueGroupDropdown();
  document.getElementById('queue-modal').classList.add('active');
}

function openDirectPostModal(postIdx) {
  const text = state.generatedPosts[postIdx];
  document.getElementById('direct-post-content').value = text;
  populateDirectPostGroupDropdown();
  document.getElementById('direct-post-modal').classList.add('active');
}

function openPostModalForGroup(groupId) {
  populateDirectPostGroupDropdown();
  document.getElementById('direct-post-group-select').value = groupId;
  
  // Pick last generated post if available
  if (state.generatedPosts.length > 0) {
    document.getElementById('direct-post-content').value = state.generatedPosts[0];
  }

  document.getElementById('direct-post-modal').classList.add('active');
}

function populateQueueGroupDropdown() {
  const sel = document.getElementById('queue-group-select');
  if (!sel) return;
  const joinedGroups = state.groups.filter(g => g.status === 'joined');
  
  if (joinedGroups.length === 0) {
    sel.innerHTML = `<option value="">-- No Joined Groups Yet (Mark a group as joined first) --</option>` + state.groups.map(g => `<option value="${g.id}">[${g.status}] ${escapeHtml(g.name)}</option>`).join('');
  } else {
    sel.innerHTML = joinedGroups.map(g => `<option value="${g.id}">${escapeHtml(g.name)} (${escapeHtml(g.nicheName)})</option>`).join('');
  }
}

function populateDirectPostGroupDropdown() {
  const sel = document.getElementById('direct-post-group-select');
  if (!sel) return;
  const joinedGroups = state.groups.filter(g => g.status === 'joined');

  if (joinedGroups.length === 0) {
    sel.innerHTML = state.groups.map(g => `<option value="${g.id}">[${g.status}] ${escapeHtml(g.name)}</option>`).join('');
  } else {
    sel.innerHTML = joinedGroups.map(g => `<option value="${g.id}">${escapeHtml(g.name)} (${escapeHtml(g.nicheName)})</option>`).join('');
  }
}

// ----------------------------------------------------------------
// 📅 QUEUE & AUTO-POSTER
// ----------------------------------------------------------------
function renderQueueAndHistory() {
  const queueContainer = document.getElementById('queue-table-body');
  const historyContainer = document.getElementById('history-table-body');

  if (queueContainer) {
    if (state.queue.length === 0) {
      queueContainer.innerHTML = `<tr><td colspan="5" class="text-center text-xs text-base-content/50 py-6">Queue is empty. Generate posts in AI Studio and schedule them!</td></tr>`;
    } else {
      queueContainer.innerHTML = state.queue.map(q => `
        <tr>
          <td><strong class="text-white text-xs">${escapeHtml(q.groupName)}</strong></td>
          <td class="max-w-xs text-xs text-base-content/80 truncate">${escapeHtml(q.content)}</td>
          <td class="text-xs text-base-content/70">${new Date(q.scheduledTime || q.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
          <td><span class="badge badge-sm ${q.status === 'completed' ? 'badge-success' : q.status === 'failed' ? 'badge-warning' : 'badge-info badge-outline'}">${escapeHtml(q.status)}</span></td>
          <td>
            <button class="btn btn-ghost btn-xs text-error" onclick="removeQueueItem('${q.id}')">🗑️</button>
          </td>
        </tr>
      `).join('');
    }
  }

  if (historyContainer) {
    if (state.history.length === 0) {
      historyContainer.innerHTML = `<tr><td colspan="4" class="text-center text-xs text-base-content/50 py-6">No posting history yet.</td></tr>`;
    } else {
      historyContainer.innerHTML = state.history.map(h => `
        <tr>
          <td><strong class="text-white text-xs">${escapeHtml(h.groupName)}</strong></td>
          <td><span class="badge badge-sm badge-ghost">${escapeHtml(h.nicheName || '')}</span></td>
          <td class="max-w-xs text-xs text-base-content/80 truncate">${escapeHtml(h.content)}</td>
          <td class="text-xs text-base-content/70">${new Date(h.postedAt).toLocaleString()}</td>
        </tr>
      `).join('');
    }
  }
}

async function removeQueueItem(id) {
  try {
    await API.deleteQueueItem(id);
    state.queue = state.queue.filter(q => q.id !== id);
    renderQueueAndHistory();
    showToast('Removed from queue', 'info');
  } catch (e) {
    showToast('Failed to remove item', 'error');
  }
}

async function triggerProcessQueueNow() {
  const btn = document.getElementById('btn-run-queue-now');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `⏳ Posting next item...`;
  }
  showToast('Executing next queued post via Playwright browser...', 'info');

  try {
    const res = await API.processQueueNow();
    if (res.status === 'success') {
      showToast('Successfully posted next queue item to Facebook!', 'success');
    } else if (res.status === 'empty') {
      showToast('No pending posts in queue', 'info');
    } else if (res.status === 'limit_reached') {
      showToast('Daily posting limit reached to prevent FB restrictions', 'warn');
    } else {
      showToast(res.error || 'Execution status: ' + res.status, 'error');
    }

    state.queue = await API.getQueue();
    state.history = await API.getHistory();
    renderQueueAndHistory();
    loadOverviewStats();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `⚡ Post Next Queue Item Now`;
    }
  }
}

// ----------------------------------------------------------------
// ⚙️ SETTINGS & AUTH MANAGEMENT
// ----------------------------------------------------------------
function populateSettingsForm() {
  document.getElementById('config-gemini-key').value = state.config.geminiApiKey || '';
  document.getElementById('config-portfolio-url').value = state.config.portfolioUrl || '';
  document.getElementById('config-daily-post-limit').value = state.config.dailyPostLimit || 5;
  document.getElementById('config-target-service').value = state.config.targetService || '';

  if (document.getElementById('studio-portfolio-input')) {
    document.getElementById('studio-portfolio-input').value = state.config.portfolioUrl || '';
  }
}

async function saveSettingsConfig(e) {
  e.preventDefault();
  const newConfig = {
    ...state.config,
    geminiApiKey: document.getElementById('config-gemini-key').value.trim(),
    portfolioUrl: document.getElementById('config-portfolio-url').value.trim(),
    dailyPostLimit: parseInt(document.getElementById('config-daily-post-limit').value) || 5,
    targetService: document.getElementById('config-target-service').value.trim()
  };

  try {
    await API.saveConfig(newConfig);
    state.config = newConfig;
    showToast('Settings saved successfully!', 'success');
  } catch (e) {
    showToast('Failed to save settings', 'error');
  }
}

async function triggerLoginAssistant() {
  const btn = document.getElementById('btn-login-assistant');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `⏳ Opening Facebook Login Browser...`;
  }
  showToast('Launching interactive login browser. Log in to Facebook in the popup window...', 'info');

  try {
    const res = await API.launchLoginAssistant();
    if (res.success) {
      showToast('Facebook authenticated successfully! Session cookies stored.', 'success');
      state.auth = { isLoggedIn: true };
      updateAuthBadge();
    } else {
      showToast(res.message || 'Login incomplete or window closed', 'warn');
    }
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `🔑 Launch Local Login Window`;
    }
  }
}

async function triggerImportCookies() {
  const cookieText = document.getElementById('import-cookies-text').value.trim();
  if (!cookieText) {
    showToast('Please paste your Facebook cookies (JSON format)', 'error');
    return;
  }

  try {
    const res = await API.importCookies(cookieText);
    if (res.success) {
      showToast(`Imported ${res.count} Facebook cookies successfully!`, 'success');
      state.auth = { isLoggedIn: true };
      updateAuthBadge();
      document.getElementById('import-cookies-text').value = '';
    } else {
      showToast(res.error || 'Failed to import cookies', 'error');
    }
  } catch (e) {
    showToast('Import error: ' + e.message, 'error');
  }
}

// ----------------------------------------------------------------
// 📜 LOGS FEED
// ----------------------------------------------------------------
async function refreshLogs() {
  const container = document.getElementById('log-stream-container');
  if (!container) return;

  try {
    const logs = await API.getLogs();
    state.logs = logs || [];

    if (state.logs.length === 0) {
      container.innerHTML = `<div style="color:var(--text-muted); text-align:center; padding-top:40px;">No logs recorded yet.</div>`;
      return;
    }

    container.innerHTML = state.logs.map(log => `
      <div class="log-entry">
        <span class="log-time">[${new Date(log.timestamp).toLocaleTimeString()}]</span>
        <span class="log-type-badge log-type-${log.type}">${log.type}</span>
        <span style="color:#e2e8f0;">${escapeHtml(log.message)}</span>
      </div>
    `).join('');
  } catch (e) {
    console.error('Failed to refresh logs:', e);
  }
}

async function clearSystemLogs() {
  if (!confirm('Clear all event logs?')) return;
  try {
    await API.clearLogs();
    state.logs = [];
    refreshLogs();
    showToast('Logs cleared', 'info');
  } catch (e) {
    showToast('Failed to clear logs', 'error');
  }
}

// ----------------------------------------------------------------
// MODALS & FORMS BINDINGS
// ----------------------------------------------------------------
function initModals() {
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });

  document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal-overlay').classList.remove('active');
    });
  });
}

function initForms() {
  // Niche Form Submit
  const nicheForm = document.getElementById('niche-form');
  if (nicheForm) {
    nicheForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = {
        name: document.getElementById('niche-form-name').value,
        keyword: document.getElementById('niche-form-keyword').value,
        industry: document.getElementById('niche-form-industry').value,
        location: document.getElementById('niche-form-location').value,
        specificAngle: document.getElementById('niche-form-angle').value
      };

      try {
        if (state.editingNicheId) {
          await API.updateNiche(state.editingNicheId, data);
          showToast('Niche updated!', 'success');
        } else {
          await API.createNiche(data);
          showToast('New niche added!', 'success');
        }
        state.niches = await API.getNiches();
        renderNiches();
        populateNicheSelectDropdowns();
        document.getElementById('niche-modal').classList.remove('active');
      } catch (err) {
        showToast('Failed to save niche: ' + err.message, 'error');
      }
    });
  }

  // Add Group by URL Modal Submit
  const addGroupForm = document.getElementById('add-group-form');
  if (addGroupForm) {
    addGroupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = document.getElementById('add-group-url').value.trim();
      const name = document.getElementById('add-group-name').value.trim();
      const nicheId = document.getElementById('add-group-niche-select').value;
      const status = document.getElementById('add-group-status-select').value;
      const submitBtn = document.getElementById('btn-submit-add-group');

      if (!url) {
        showToast('Please enter a Facebook group URL', 'error');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Saving...';
      }

      try {
        const res = await API.addGroupByUrl({ url, name, nicheId, status });
        if (res.success) {
          showToast(`Group "${res.group.name}" added successfully!`, 'success');
          state.groups = await API.getGroups();
          renderGroups();
          loadOverviewStats();
          document.getElementById('add-group-modal').classList.remove('active');
        } else {
          showToast(res.error || 'Failed to add group', 'error');
        }
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = 'Save Group';
        }
      }
    });
  }

  // Queue Modal Submit
  const queueForm = document.getElementById('queue-form');
  if (queueForm) {
    queueForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const groupId = document.getElementById('queue-group-select').value;
      const content = document.getElementById('queue-post-content').value;

      if (!groupId) {
        showToast('Please select a target group', 'error');
        return;
      }

      try {
        await API.addToQueue({ groupId, content });
        showToast('Post added to automation queue!', 'success');
        state.queue = await API.getQueue();
        renderQueueAndHistory();
        loadOverviewStats();
        document.getElementById('queue-modal').classList.remove('active');
      } catch (err) {
        showToast('Failed to queue post: ' + err.message, 'error');
      }
    });
  }

  // Direct Post Modal Submit
  const directPostForm = document.getElementById('direct-post-form');
  if (directPostForm) {
    directPostForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const groupId = document.getElementById('direct-post-group-select').value;
      const content = document.getElementById('direct-post-content').value;

      if (!groupId) {
        showToast('Please select a target group', 'error');
        return;
      }

      const btn = document.getElementById('btn-submit-direct-post');
      btn.disabled = true;
      btn.innerHTML = `⏳ Publishing to Facebook...`;
      showToast('Publishing post to Facebook group via browser...', 'info');

      try {
        const res = await API.postDirect(groupId, content);
        if (res.success) {
          showToast('Post published successfully to Facebook!', 'success');
          state.history = await API.getHistory();
          renderQueueAndHistory();
          loadOverviewStats();
          document.getElementById('direct-post-modal').classList.remove('active');
        } else {
          showToast(res.error || 'Failed to publish post', 'error');
        }
      } catch (err) {
        showToast('Error publishing: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = `🚀 Publish Now`;
      }
    });
  }

  // Admin Login Form Submit
  const adminLoginForm = document.getElementById('admin-login-form');
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('admin-login-username').value.trim();
      const password = document.getElementById('admin-login-password').value;
      const errorDiv = document.getElementById('admin-login-error');
      const submitBtn = document.getElementById('btn-submit-admin-login');

      if (errorDiv) errorDiv.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Verifying...';
      }

      try {
        const res = await API.adminLogin(username, password);
        if (res.success && res.token) {
          setStoredToken(res.token);
          updateAdminUserUI(res.username || username);
          window.hideAdminLoginModal();
          showToast('Welcome back, Admin!', 'success');
          document.getElementById('admin-login-password').value = '';
          fetchAllData();
        } else {
          if (errorDiv) {
            errorDiv.innerText = res.error || 'Invalid username or password';
            errorDiv.style.display = 'block';
          }
        }
      } catch (err) {
        if (errorDiv) {
          errorDiv.innerText = 'Login error: ' + err.message;
          errorDiv.style.display = 'block';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = '🔐 Sign In to Dashboard';
        }
      }
    });
  }

  // Settings Form Submit
  const settingsForm = document.getElementById('settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', saveSettingsConfig);
  }

  // Account Settings (Change Password) Form Submit
  const accountForm = document.getElementById('account-settings-form');
  if (accountForm) {
    accountForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById('acc-current-password').value;
      const newUsername = document.getElementById('acc-new-username').value.trim();
      const newPassword = document.getElementById('acc-new-password').value;
      const confirmPassword = document.getElementById('acc-confirm-password').value;
      const submitBtn = document.getElementById('btn-submit-change-password');

      if (newPassword !== confirmPassword) {
        showToast('New passwords do not match!', 'error');
        return;
      }

      if (newPassword.length < 6) {
        showToast('Password must be at least 6 characters long', 'error');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Updating...';
      }

      try {
        const res = await API.changePassword({
          currentPassword,
          newUsername,
          newPassword
        });

        if (res.success) {
          setStoredToken(res.token);
          updateAdminUserUI(res.username);
          showToast('Account credentials updated successfully!', 'success');
          document.getElementById('acc-current-password').value = '';
          document.getElementById('acc-new-password').value = '';
          document.getElementById('acc-confirm-password').value = '';
          document.getElementById('acc-new-username').value = '';
        } else {
          showToast(res.error || 'Failed to update credentials', 'error');
        }
      } catch (err) {
        showToast('Update error: ' + err.message, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = '🔒 Update Admin Credentials';
        }
      }
    });
  }

  // Filters
  document.getElementById('group-filter-niche')?.addEventListener('change', renderGroups);
  document.getElementById('group-filter-status')?.addEventListener('change', renderGroups);
}

// Utility for HTML escaping
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
