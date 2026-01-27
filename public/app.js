// AgentTrail - Client-side JavaScript

const state = {
  sessions: [],
  allSessions: [],
  directories: [],
  projects: [],
  tags: {},
  currentSession: null,
  filters: {
    time: 'all',
    tag: null,
    directory: null,
    project: null,
    search: '',
    projectQuery: '',
    projectModalQuery: ''
  },
  groupBy: 'date',
  ui: {
    filtersOpen: false,
    projectsModalOpen: false
  },
  searchMode: 'quick',
  eventSource: null
};

function updateLayoutVisibility() {
  const listView = document.getElementById('list-view');
  const detailView = document.getElementById('detail-view');
  const sidebar = document.getElementById('sidebar');

  if (sidebar) sidebar.classList.remove('hidden');
  if (detailView) detailView.classList.remove('hidden');

  if (state.currentSession) {
    if (listView) listView.classList.add('hidden');
    if (detailView) detailView.classList.add('detail-full');
  } else {
    if (listView) listView.classList.remove('hidden');
    if (detailView) detailView.classList.remove('detail-full');
    renderDetailEmpty();
  }
}

// Initialize
async function init() {
  await Promise.all([
    loadSessions(),
    loadDirectories(),
    loadProjects(),
    loadTags(),
    loadConfig()
  ]);
  initUiState();
  setupEventListeners();
  handleRoute();
  updateLayoutVisibility();
}

// API calls
async function loadSessions() {
  try {
    const res = await fetch('/api/sessions');
    const data = await res.json();
    state.sessions = data.sessions;
    state.allSessions = data.sessions;
    renderSessionList();
    updateFilterCounts();
    renderActiveFilters();
    updateFiltersToggleLabel();
  } catch (error) {
    console.error('Failed to load sessions:', error);
    document.getElementById('session-list').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">&#x26A0;</div>
        <div class="empty-state-title">Failed to load sessions</div>
      </div>
    `;
  }
}

async function loadDirectories() {
  try {
    const res = await fetch('/api/directories');
    const data = await res.json();
    state.directories = data.directories;
    renderDirectoryList();
  } catch (error) {
    console.error('Failed to load directories:', error);
  }
}

async function loadProjects() {
  try {
    const res = await fetch('/api/projects');
    const data = await res.json();
    state.projects = data.projects;
    renderProjectList();
  } catch (error) {
    console.error('Failed to load projects:', error);
  }
}

async function loadTags() {
  try {
    const res = await fetch('/api/tags');
    const data = await res.json();
    state.tags = data.tags;
    renderTagList();
  } catch (error) {
    console.error('Failed to load tags:', error);
  }
}

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    document.getElementById('config-path').textContent = data.configPath;
  } catch (error) {
    console.error('Failed to load config:', error);
  }
}

// Date Grouping
function groupSessionsByDate(sessions) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const groups = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: []
  };

  sessions.forEach(session => {
    const sessionDate = new Date(session.lastModified);
    const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());

    if (sessionDay.getTime() === today.getTime()) {
      groups.today.push(session);
    } else if (sessionDay.getTime() === yesterday.getTime()) {
      groups.yesterday.push(session);
    } else if (sessionDate >= weekAgo) {
      groups.thisWeek.push(session);
    } else {
      groups.older.push(session);
    }
  });

  return groups;
}

function getDateGroupLabel(groupKey) {
  const labels = {
    today: 'Today',
    yesterday: 'Yesterday',
    thisWeek: 'This Week',
    older: 'Older'
  };
  return labels[groupKey] || groupKey;
}

function groupSessionsByProject(sessions) {
  const groups = new Map();
  sessions.forEach(session => {
    const key = session.project || session.projectName;
    if (!groups.has(key)) {
      groups.set(key, {
        label: session.projectName,
        key,
        latest: new Date(session.lastModified).getTime(),
        sessions: []
      });
    }
    const group = groups.get(key);
    group.sessions.push(session);
    group.latest = Math.max(group.latest, new Date(session.lastModified).getTime());
  });

  return Array.from(groups.values()).sort((a, b) => b.latest - a.latest);
}

function groupSessionsByDirectory(sessions) {
  const groups = new Map();
  sessions.forEach(session => {
    const key = session.directory;
    if (!groups.has(key)) {
      groups.set(key, {
        label: session.directoryLabel,
        color: session.directoryColor,
        key,
        latest: new Date(session.lastModified).getTime(),
        sessions: []
      });
    }
    const group = groups.get(key);
    group.sessions.push(session);
    group.latest = Math.max(group.latest, new Date(session.lastModified).getTime());
  });

  return Array.from(groups.values()).sort((a, b) => b.latest - a.latest);
}

// Rendering
function renderSessionList() {
  const container = document.getElementById('session-list');
  const filtered = getFilteredSessions();

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state flex flex-col items-center justify-center rounded-2xl border border-border bg-card/60 px-6 py-12 text-center">
        <div class="empty-state-icon text-4xl">&#x1F4AC;</div>
        <div class="empty-state-title mt-4 text-lg font-semibold text-foreground">No sessions found</div>
        <div class="empty-state-text text-sm text-muted-foreground">Try adjusting your filters</div>
      </div>
    `;
    return;
  }

  const pinned = filtered.filter(session => session.isPinned);
  const pinnedIds = new Set(pinned.map(session => session.id));
  const awaiting = filtered.filter(session => session.status === 'awaiting' && !pinnedIds.has(session.id));
  const awaitingIds = new Set(awaiting.map(session => session.id));
  const rest = filtered.filter(session => !pinnedIds.has(session.id) && !awaitingIds.has(session.id));

  let html = '';
  if (pinned.length > 0) {
    html += renderSection('Pinned', pinned);
  }
  if (awaiting.length > 0) {
    html += renderSection('Needs input', awaiting);
  }
  if (rest.length > 0) {
    html += renderGroupedSessions(rest);
  }

  container.innerHTML = html;
}

function renderSection(title, sessions) {
  return `
    <div class="session-section space-y-3">
      <div class="section-title text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">${title}</div>
      ${sessions.map(session => renderSessionCard(session)).join('')}
    </div>
  `;
}

function renderGroupedSessions(sessions) {
  if (state.groupBy === 'project') {
    const groups = groupSessionsByProject(sessions);
    return groups.map(group => `
      <div class="date-group space-y-3" data-group="${escapeHtml(group.key)}">
        <div class="group-header flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
          <span>${escapeHtml(group.label)}</span>
          <span class="group-count ml-auto rounded-full border border-border bg-background/70 px-2 py-0.5 text-[11px]">${group.sessions.length}</span>
        </div>
        ${group.sessions.map(session => renderSessionCard(session)).join('')}
      </div>
    `).join('');
  }

  if (state.groupBy === 'directory') {
    const groups = groupSessionsByDirectory(sessions);
    return groups.map(group => `
      <div class="date-group space-y-3" data-group="${escapeHtml(group.key)}">
        <div class="group-header flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
          <span class="group-badge h-2.5 w-2.5 rounded-full" style="background: ${group.color}"></span>
          <span>${escapeHtml(group.label)}</span>
          <span class="group-count ml-auto rounded-full border border-border bg-background/70 px-2 py-0.5 text-[11px]">${group.sessions.length}</span>
        </div>
        ${group.sessions.map(session => renderSessionCard(session)).join('')}
      </div>
    `).join('');
  }

  const groups = groupSessionsByDate(sessions);
  const groupOrder = ['today', 'yesterday', 'thisWeek', 'older'];

  return groupOrder.map(groupKey => {
    const groupSessions = groups[groupKey];
    if (groupSessions.length === 0) return '';
    return `
      <div class="date-group space-y-3" data-group="${groupKey}">
        <div class="date-divider text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">${getDateGroupLabel(groupKey)}</div>
        ${groupSessions.map(session => renderSessionCard(session)).join('')}
      </div>
    `;
  }).join('');
}

function renderSessionCard(session) {
  const pinnedClass = session.isPinned ? 'pinned' : '';
  const awaitingClass = session.status === 'awaiting' ? 'awaiting' : '';
  const selectedClass = state.currentSession && state.currentSession.id === session.id ? 'selected' : '';
  const pinBadge = session.isPinned ? '<span class="pin-badge">&#x1F4CC;</span>' : '';

  // Generate preview from first message content
  const preview = getSessionPreview(session);

  return `
    <div class="session-card ${pinnedClass} ${awaitingClass} ${selectedClass} cursor-pointer rounded-2xl border border-border bg-card/60 p-3 transition hover:border-primary/40 hover:bg-card/80" data-id="${session.id}" onclick="showSession('${session.id}')">
      <div class="session-card-header flex items-start justify-between gap-4">
        <div class="session-title text-[15px] font-semibold text-foreground">${escapeHtml(session.title)}${pinBadge}</div>
        <div class="session-project meta-link inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground" data-filter-type="project" data-filter-value="${escapeHtml(session.project)}">
          <span class="project-icon">&#x1F4C1;</span>
          ${escapeHtml(session.projectName)}
        </div>
      </div>
      ${preview ? `<div class="session-preview mt-2 text-[13px] text-muted-foreground">${escapeHtml(preview)}</div>` : ''}
      <div class="session-meta mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span class="session-directory meta-link inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] font-medium" data-filter-type="directory" data-filter-value="${escapeHtml(session.directory)}" style="background: ${session.directoryColor}20; color: ${session.directoryColor}">
          <span class="directory-color h-2 w-2 rounded-full" style="background: ${session.directoryColor}"></span>
          ${escapeHtml(session.directoryLabel)}
        </span>
        <span class="session-dot inline-block h-1 w-1 rounded-full bg-muted-foreground/60"></span>
        <span>${formatRelativeTime(session.lastModified)}</span>
        ${renderStatusIndicator(session.status)}
      </div>
      ${session.tags.length > 0 ? `
        <div class="session-tags mt-2 flex flex-wrap gap-2">
          ${session.tags.map(tag => `<span class="tag tag-${tag} inline-flex items-center rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground" data-filter-type="tag" data-filter-value="${escapeHtml(tag)}">${tag}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function getSessionPreview(session) {
  // Try to get preview from session's first user message
  if (session.preview) {
    return truncateText(session.preview, 120);
  }
  // Fallback: if we have messages loaded, get first user message
  if (session.messages && session.messages.length > 0) {
    const firstUserMsg = session.messages.find(m => m.type === 'user');
    if (firstUserMsg && firstUserMsg.content) {
      const text = extractTextContent(firstUserMsg.content);
      return truncateText(text, 120);
    }
  }
  return '';
}

function extractTextContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  const textBlock = content.find(block => block.type === 'text');
  return textBlock ? textBlock.text : '';
}

function truncateText(text, maxLength) {
  if (!text) return '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trim() + '...';
}

function renderStatusIndicator(status) {
  if (status === 'idle') return '';
  const labels = { awaiting: 'Needs input', working: 'Working...' };
  return `
    <span class="session-dot inline-block h-1 w-1 rounded-full bg-muted-foreground/60"></span>
    <span class="live-indicator ${status} inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[11px] font-medium">
      <span class="live-dot h-1.5 w-1.5 rounded-full"></span>
      ${labels[status]}
    </span>
  `;
}

function renderDirectoryList() {
  const container = document.getElementById('directory-list');
  if (!container) return;
  container.innerHTML = state.directories.map(dir => `
    <div class="directory-item ${state.filters.directory === dir.path ? 'active' : ''} inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
         data-path="${escapeHtml(dir.path)}" onclick="filterByDirectory('${escapeHtml(dir.path)}')">
      <span class="directory-color h-2 w-2 rounded-full" style="background: ${dir.color}"></span>
      <span class="directory-label">${escapeHtml(dir.label)}</span>
      <span class="filter-count rounded-full border border-border bg-card/70 px-2 py-0.5 text-[10px] text-muted-foreground">${dir.count}</span>
    </div>
  `).join('');
}

function renderProjectList() {
  const container = document.getElementById('project-list');
  if (!container) return;
  const query = (state.filters.projectQuery || '').toLowerCase().trim();
  const list = query
    ? state.projects.filter(project =>
        project.name.toLowerCase().includes(query) ||
        project.path.toLowerCase().includes(query)
      )
    : state.projects.slice().sort((a, b) => b.count - a.count).slice(0, 12);

  container.innerHTML = list.map(project => `
    <div class="project-item ${state.filters.project === project.path ? 'active' : ''} flex w-full items-center justify-between gap-3 rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
         onclick="filterByProject('${escapeHtml(project.path)}')">
      <span class="inline-flex items-center gap-2 truncate">
        <span class="project-icon">&#x1F4C1;</span>
        <span class="project-name truncate">${escapeHtml(project.name)}</span>
      </span>
      <span class="filter-count shrink-0 rounded-full border border-border bg-card/70 px-2 py-0.5 text-[10px] text-muted-foreground">${project.count}</span>
    </div>
  `).join('');
}

function renderTagList() {
  const container = document.getElementById('tag-list');
  if (!container) return;
  container.innerHTML = Object.entries(state.tags)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => `
      <span class="tag tag-${tag} ${state.filters.tag === tag ? 'active' : ''} inline-flex items-center rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            onclick="filterByTag('${tag}')">${tag} (${count})</span>
    `).join('');
}

// Filtering
function getFilteredSessions() {
  return state.sessions.filter(session => {
    if (state.filters.time !== 'all') {
      const sessionDate = new Date(session.lastModified);
      const now = new Date();
      if (state.filters.time === 'today') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (sessionDate < today) return false;
      } else if (state.filters.time === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (sessionDate < weekAgo) return false;
      }
    }
    if (state.filters.tag && !session.tags.includes(state.filters.tag)) return false;
    if (state.filters.directory && session.directory !== state.filters.directory) return false;
    if (state.filters.project && session.project !== state.filters.project) return false;
    if (state.filters.search && state.searchMode !== 'deep') {
      const search = state.filters.search.toLowerCase();
      const matchesTitle = session.title.toLowerCase().includes(search);
      const matchesProject = session.projectName.toLowerCase().includes(search);
      const matchesTags = session.tags.some(t => t.toLowerCase().includes(search));
      if (!matchesTitle && !matchesProject && !matchesTags) return false;
    }
    return true;
  });
}

function updateFilterCounts() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const countAll = state.sessions.length;
  const countToday = state.sessions.filter(s => new Date(s.lastModified) >= today).length;
  const countWeek = state.sessions.filter(s => new Date(s.lastModified) >= weekAgo).length;

  // Update sidebar counts (if present)
  const countAllEl = document.getElementById('count-all');
  const countTodayEl = document.getElementById('count-today');
  const countWeekEl = document.getElementById('count-week');

  if (countAllEl) countAllEl.textContent = countAll;
  if (countTodayEl) countTodayEl.textContent = countToday;
  if (countWeekEl) countWeekEl.textContent = countWeek;

  // Update header filter button counts (new design)
  document.querySelectorAll('.filter-btn').forEach(btn => {
    const filter = btn.dataset.filter;
    const countSpan = btn.querySelector('.filter-count');
    if (!countSpan) return;

    if (filter === 'all') countSpan.textContent = countAll;
    else if (filter === 'today') countSpan.textContent = countToday;
    else if (filter === 'week') countSpan.textContent = countWeek;
  });
}

function filterByTime(filter) {
  state.filters.time = filter;

  // Update sidebar filters (if present)
  document.querySelectorAll('#time-filters .filter-item').forEach(el => {
    el.classList.toggle('active', el.dataset.filter === filter);
  });

  // Update header filter buttons (new design)
  document.querySelectorAll('.filter-btn').forEach(el => {
    el.classList.toggle('active', el.dataset.filter === filter);
  });

  if (state.currentSession) returnToList();
  renderSessionList();
  renderActiveFilters();
  updateFiltersToggleLabel();
}

function filterByTag(tag) {
  state.filters.tag = state.filters.tag === tag ? null : tag;
  renderTagList();
  if (state.currentSession) returnToList();
  renderSessionList();
  renderActiveFilters();
  updateFiltersToggleLabel();
}

function filterByDirectory(path) {
  state.filters.directory = state.filters.directory === path ? null : path;
  renderDirectoryList();
  if (state.currentSession) returnToList();
  renderSessionList();
  renderActiveFilters();
  updateFiltersToggleLabel();
}

function filterByProject(path) {
  state.filters.project = state.filters.project === path ? null : path;
  renderProjectList();
  if (state.currentSession) returnToList();
  renderSessionList();
  renderActiveFilters();
  updateFiltersToggleLabel();
}

// Session detail
async function showSession(sessionId) {
  history.pushState(null, '', `/session/${sessionId}`);
  await navigateToSession(sessionId);
}

async function navigateToSession(sessionId) {
  if (state.currentSession && state.currentSession.id === sessionId) return;

  const messagesContainer = document.getElementById('messages');
  messagesContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div>Loading...</div>';

  updateLayoutVisibility();

  try {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (!res.ok) {
      showSessionNotFound(sessionId);
      return;
    }
    const data = await res.json();
    state.currentSession = data.session;
    renderSessionDetail(data.session);
    renderSessionList();
    startEventStream(sessionId);
    updateLayoutVisibility();
  } catch (error) {
    console.error('Failed to load session:', error);
    showSessionNotFound(sessionId);
  }
}

function renderSessionDetail(session) {
  document.getElementById('detail-title').textContent = session.title;

  const pinBtn = document.getElementById('pin-button');
  pinBtn.classList.toggle('pinned', session.isPinned);

  const metaHtml = `
    <span style="color: ${session.directoryColor}">${escapeHtml(session.directoryLabel)}</span>
    <span>&#x2022;</span>
    <span>${escapeHtml(session.projectName)}</span>
    <span>&#x2022;</span>
    <span>${formatDate(session.timestamp)}</span>
    <span>&#x2022;</span>
    <span>${session.messages.length} messages</span>
  `;
  document.getElementById('detail-meta').innerHTML = metaHtml;

  // Render tags section in the banner area
  document.getElementById('detail-banner').innerHTML = renderTagsSection(session);

  renderMessages(session.messages);
}

function renderDetailEmpty() {
  const title = document.getElementById('detail-title');
  const meta = document.getElementById('detail-meta');
  const banner = document.getElementById('detail-banner');
  const messages = document.getElementById('messages');
  const pinBtn = document.getElementById('pin-button');

  if (title) title.textContent = 'Select a session';
  if (meta) meta.innerHTML = '';
  if (banner) banner.innerHTML = '';
  if (pinBtn) pinBtn.classList.remove('pinned');
  if (messages) {
    messages.innerHTML = `
      <div class="empty-state flex flex-col items-center justify-center rounded-2xl border border-border bg-card/60 px-6 py-12 text-center">
        <div class="empty-state-icon text-3xl">&#x1F4D6;</div>
        <div class="empty-state-title mt-4 text-lg font-semibold text-foreground">Select a session</div>
        <div class="empty-state-text text-sm text-muted-foreground">Pick a session from the list to view details.</div>
      </div>
    `;
  }
}

function renderMessages(messages) {
  const container = document.getElementById('messages');
  const toolResults = collectToolResults(messages);

  const html = messages
    .filter(msg => hasDisplayableContent(msg.content))
    .map(msg => {
      const isUser = msg.type === 'user';
      const label = isUser ? 'You' : 'Claude';
      const contentHtml = renderMessageContent(msg.content, toolResults);
      if (!contentHtml.trim()) return '';

      const wrapperClass = [
        'message',
        `message-${msg.type}`,
        'rounded-2xl',
        'border',
        'p-3',
        'space-y-3',
        isUser ? 'border-accent/40 bg-accent/10' : 'border-border bg-card/60'
      ].join(' ');

      return `
        <div class="${wrapperClass}">
          <div class="message-label text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">${label}</div>
          <div class="message-content space-y-3">${contentHtml}</div>
        </div>
      `;
    })
    .filter(h => h.trim())
    .join('');

  container.innerHTML = html;
  setupToolCardListeners();
  applyHighlighting(container);
  container.scrollTop = container.scrollHeight;
}

function hasDisplayableContent(content) {
  if (!Array.isArray(content)) return content && String(content).trim().length > 0;
  return content.some(block => {
    if (block.type === 'text') return block.text && block.text.trim().length > 0;
    if (block.type === 'tool_use') return true;
    if (block.type === 'thinking') return block.thinking && block.thinking.trim().length > 0;
    return false;
  });
}

function renderMessageContent(content, toolResults = new Map()) {
  if (!Array.isArray(content)) {
    return `<div class="message-text text-sm leading-relaxed text-foreground">${escapeHtml(String(content))}</div>`;
  }

  return content.map(block => {
    switch (block.type) {
      case 'text':
        if (!block.text || !block.text.trim()) return '';
        return `<div class="message-text text-sm leading-relaxed text-foreground">${formatText(block.text)}</div>`;
      case 'tool_use':
        return renderToolUse(block, toolResults);
      case 'thinking':
        if (!block.thinking || !block.thinking.trim()) return '';
        return `
          <div class="thinking-block rounded-2xl border border-border bg-background/60 p-3 text-sm text-muted-foreground" onclick="this.classList.toggle('expanded')">
            <div class="thinking-header flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">&#x1F4AD; View thinking</div>
            <div class="thinking-content mt-2 whitespace-pre-wrap font-mono text-xs text-foreground">${escapeHtml(block.thinking)}</div>
          </div>
        `;
      default:
        return '';
    }
  }).join('');
}

function renderToolUse(block, toolResults = new Map()) {
  const toolName = block.name || 'Unknown';
  const toolClass = `tool-${toolName.toLowerCase()}`;
  const icon = getToolIcon(toolName);

  let path = '';
  let content = '';
  let hasSpecializedContent = false;

  if (block.input) {
    if (block.input.file_path) path = block.input.file_path;
    else if (block.input.command) path = block.input.command;
    else if (block.input.pattern) path = block.input.pattern;

    if (toolName === 'Edit' && block.input.old_string && block.input.new_string) {
      content = renderDiff(block.input.old_string, block.input.new_string);
      hasSpecializedContent = true;
    } else if (toolName === 'Write' && block.input.content) {
      content = renderCodeBlock(block.input.content);
      hasSpecializedContent = true;
    } else if (toolName === 'Bash' && block.input.command) {
      content = `<pre class="bash-content rounded-xl border border-border bg-background/80 p-3 text-xs text-foreground"><code>${escapeHtml(formatBashCommand(block.input.command))}</code></pre>`;
      hasSpecializedContent = true;
    }
  }

  const toolResult = toolResults.get(block.id);
  if (!hasSpecializedContent) {
    content = renderToolDetailView(block.input, toolResult);
  } else if (toolResult && toolResult.content) {
    const resultContent = renderToolResultContent(toolResult.content);
    if (resultContent) content += resultContent;
  }

  return `
    <div class="tool-card ${toolClass} collapsed rounded-2xl border border-border bg-background/60">
      <div class="tool-header flex items-center gap-3 border-b border-border/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <div class="tool-icon flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card/70 text-[11px]">${icon}</div>
        <span class="tool-name">${toolName}</span>
        <span class="tool-path truncate text-[11px] normal-case text-muted-foreground">${escapeHtml(path)}</span>
        <span class="tool-toggle ml-auto text-[10px]">&#x25BC;</span>
      </div>
      <div class="tool-body px-3 py-2">${content}</div>
    </div>
  `;
}

function collectToolResults(messages) {
  const results = new Map();
  messages.forEach(msg => {
    if (!Array.isArray(msg.content)) return;
    msg.content.forEach(block => {
      if (block.type === 'tool_result' && block.tool_use_id) {
        results.set(block.tool_use_id, block);
      }
    });
  });
  return results;
}

function renderToolDetailView(input, toolResult) {
  let html = '<div class="tool-detail-view">';

  if (input && Object.keys(input).length > 0) {
    html += '<div class="tool-section">';
    html += '<div class="tool-section-header">Input</div>';
    html += '<div class="tool-section-content">';
    html += renderToolInputParams(input);
    html += '</div></div>';
  }

  if (toolResult && toolResult.content) {
    const resultHtml = renderToolResultContent(toolResult.content);
    if (resultHtml) html += resultHtml;
  }

  html += '</div>';
  return html;
}

function renderToolInputParams(input) {
  let html = '<div class="tool-params">';
  for (const [key, value] of Object.entries(input)) {
    const displayValue = formatParamValue(value);
    html += `
      <div class="tool-param">
        <span class="tool-param-key">${escapeHtml(key)}:</span>
        <span class="tool-param-value">${displayValue}</span>
      </div>
    `;
  }
  html += '</div>';
  return html;
}

function formatParamValue(value) {
  if (value === null || value === undefined) {
    return '<span class="tool-param-null">null</span>';
  }
  if (typeof value === 'boolean') {
    return `<span class="tool-param-bool">${value}</span>`;
  }
  if (typeof value === 'number') {
    return `<span class="tool-param-number">${value}</span>`;
  }
  if (typeof value === 'string') {
    if (value.length > 200) {
      const truncated = value.slice(0, 200) + '...';
      return `<code class="tool-param-string">${escapeHtml(truncated)}</code>`;
    }
    if (value.includes('\n')) {
      return `<pre class="tool-param-multiline">${escapeHtml(value)}</pre>`;
    }
    return `<code class="tool-param-string">${escapeHtml(value)}</code>`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '<span class="tool-param-array">[]</span>';
    if (value.length <= 3 && value.every(v => ['string', 'number', 'boolean'].includes(typeof v))) {
      return `<span class="tool-param-array">[${value.map(v => escapeHtml(String(v))).join(', ')}]</span>`;
    }
    return `<pre class="tool-param-json">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
  }
  if (typeof value === 'object') {
    return `<pre class="tool-param-json">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
  }
  return escapeHtml(String(value));
}

function renderToolResultContent(content) {
  if (!content) return '';
  let html = '<div class="tool-section tool-output">';
  html += '<div class="tool-section-header">Output</div>';
  html += '<div class="tool-section-content">';

  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (!trimmed) {
      html += '<span class="tool-result-empty">(empty)</span>';
    } else if (trimmed.length > 1000) {
      html += `<pre class="tool-result-text">${escapeHtml(trimmed.slice(0, 1000))}...\n\n[${trimmed.length - 1000} more characters]</pre>`;
    } else {
      html += `<pre class="tool-result-text">${escapeHtml(trimmed)}</pre>`;
    }
  } else if (Array.isArray(content)) {
    const textParts = content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text)
      .join('\n');
    if (textParts) {
      html += `<pre class="tool-result-text">${escapeHtml(textParts)}</pre>`;
    } else {
      html += `<pre class="tool-result-json">${escapeHtml(JSON.stringify(content, null, 2))}</pre>`;
    }
  } else {
    html += `<pre class="tool-result-json">${escapeHtml(JSON.stringify(content, null, 2))}</pre>`;
  }

  html += '</div></div>';
  return html;
}

function formatBashCommand(command) {
  const raw = String(command ?? '');
  if (!raw.trim()) return raw;

  const lines = raw.split('\n');
  return lines
    .map((line) => {
      if (!line.trim()) return line;
      const trimmedStart = line.trimStart();
      if (trimmedStart.startsWith('$')) return line;
      const leadingWhitespace = line.slice(0, line.length - trimmedStart.length);
      return `${leadingWhitespace}$ ${trimmedStart}`;
    })
    .join('\n');
}

function renderDiff(oldStr, newStr) {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');

  let html = '<div class="code-block overflow-hidden rounded-xl border border-border bg-background/80 font-mono text-xs text-foreground">';
  oldLines.forEach((line, i) => {
    html += `<div class="code-line diff-remove flex items-start gap-3 border-b border-border/40 px-3 py-1.5 last:border-b-0"><span class="line-number w-8 text-right text-[10px] text-muted-foreground">${i + 1}</span><span class="line-content flex-1 whitespace-pre-wrap">${escapeHtml(line)}</span></div>`;
  });
  newLines.forEach((line, i) => {
    html += `<div class="code-line diff-add flex items-start gap-3 border-b border-border/40 px-3 py-1.5 last:border-b-0"><span class="line-number w-8 text-right text-[10px] text-muted-foreground">${i + 1}</span><span class="line-content flex-1 whitespace-pre-wrap">${escapeHtml(line)}</span></div>`;
  });
  html += '</div>';
  return html;
}

function renderCodeBlock(code, language = '') {
  const lines = code.split('\n');
  let html = '<div class="code-block overflow-hidden rounded-xl border border-border bg-background/80 font-mono text-xs text-foreground">';
  lines.forEach((line, i) => {
    html += `<div class="code-line flex items-start gap-3 border-b border-border/40 px-3 py-1.5 last:border-b-0"><span class="line-number w-8 text-right text-[10px] text-muted-foreground">${i + 1}</span><span class="line-content flex-1 whitespace-pre-wrap">${escapeHtml(line) || ' '}</span></div>`;
  });
  html += '</div>';
  return html;
}

function getToolIcon(toolName) {
  const icons = {
    'Read': '&#x1F4C4;',
    'Edit': '&#x270F;',
    'Write': '&#x1F4DD;',
    'Bash': '$',
    'Glob': '&#x1F50D;',
    'Grep': '&#x1F50E;',
    'Task': '&#x1F916;'
  };
  return icons[toolName] || '&#x1F527;';
}

function formatText(text) {
  if (typeof marked !== 'undefined') {
    try {
      return `<div class="markdown-content">${marked.parse(text)}</div>`;
    } catch (e) {
      console.error('Markdown parse error:', e);
    }
  }
  return `<p>${escapeHtml(text)}</p>`;
}

function applyHighlighting(container) {
  if (typeof hljs === 'undefined') return;
  container.querySelectorAll('pre code:not(.hljs)').forEach(block => {
    hljs.highlightElement(block);
  });
}

function setupToolCardListeners() {
  document.querySelectorAll('.tool-header').forEach(header => {
    header.addEventListener('click', e => {
      e.stopPropagation();
      header.parentElement.classList.toggle('collapsed');
    });
  });
}

// Event stream
function startEventStream(sessionId) {
  if (state.eventSource) {
    state.eventSource.close();
  }

  state.eventSource = new EventSource(`/api/sessions/${sessionId}/events`);

  state.eventSource.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (state.currentSession) {
      state.currentSession.messages.push(message);
      appendMessage(message);
    }
  });

  state.eventSource.addEventListener('status', event => {
    const { status } = JSON.parse(event.data);
    if (state.currentSession) {
      state.currentSession.status = status;
    }
  });
}

function appendMessage(message) {
  if (!hasDisplayableContent(message.content)) return;

  const container = document.getElementById('messages');
  const isUser = message.type === 'user';
  const label = isUser ? 'You' : 'Claude';
  const contentHtml = renderMessageContent(message.content);
  if (!contentHtml.trim()) return;

  const msgDiv = document.createElement('div');
  const wrapperClass = [
    'message',
    `message-${message.type}`,
    'rounded-2xl',
    'border',
    'p-3',
    'space-y-3',
    isUser ? 'border-accent/40 bg-accent/10' : 'border-border bg-card/60'
  ].join(' ');
  msgDiv.className = wrapperClass;
  msgDiv.innerHTML = `
    <div class="message-label text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">${label}</div>
    <div class="message-content space-y-3">${contentHtml}</div>
  `;

  container.appendChild(msgDiv);
  setupToolCardListeners();
  applyHighlighting(msgDiv);
  container.scrollTop = container.scrollHeight;
}

// Navigation
function returnToList() {
  history.pushState(null, '', '/');
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  state.currentSession = null;
  renderDetailEmpty();
  updateLayoutVisibility();
}

async function showList() {
  returnToList();
  await loadSessions();
}

function handleRoute() {
  const path = window.location.pathname;
  if (path.startsWith('/session/')) {
    const sessionId = path.slice('/session/'.length);
    if (sessionId) navigateToSession(sessionId);
  } else {
    renderDetailEmpty();
    updateLayoutVisibility();
  }
}

function showSessionNotFound(sessionId) {
  document.getElementById('messages').innerHTML = `
    <div class="empty-state flex flex-col items-center justify-center rounded-2xl border border-border bg-card/60 px-6 py-12 text-center">
      <div class="empty-state-icon text-3xl">&#x26A0;</div>
      <div class="empty-state-title mt-4 text-lg font-semibold text-foreground">Session not found</div>
      <div class="empty-state-text text-sm text-muted-foreground">The session "${escapeHtml(sessionId)}" could not be found.</div>
    </div>
  `;
  document.getElementById('detail-title').textContent = 'Session not found';
  document.getElementById('detail-meta').innerHTML = '';
  updateLayoutVisibility();
}

// Pin functionality
async function togglePin() {
  if (!state.currentSession) return;

  const isPinned = state.currentSession.isPinned;
  const sessionId = state.currentSession.id;

  try {
    if (isPinned) {
      await fetch(`/api/pins/${sessionId}`, { method: 'DELETE' });
    } else {
      await fetch(`/api/pins/${sessionId}`, { method: 'POST' });
    }
    state.currentSession.isPinned = !isPinned;
    document.getElementById('pin-button').classList.toggle('pinned', !isPinned);
  } catch (error) {
    console.error('Failed to toggle pin:', error);
  }
}

// Search
function toggleSearchMode() {
  state.searchMode = state.searchMode === 'quick' ? 'deep' : 'quick';
  const btn = document.getElementById('search-mode-btn');
  btn.classList.toggle('active', state.searchMode === 'deep');
  document.getElementById('search-mode-label').textContent = state.searchMode === 'quick' ? 'Quick' : 'Deep';

  if (state.filters.search) {
    performSearch(state.filters.search);
  }
}

async function performSearch(query) {
  if (!query) {
    state.filters.search = '';
    state.sessions = state.allSessions;
    renderSessionList();
    renderActiveFilters();
    updateFiltersToggleLabel();
    return;
  }

  if (state.searchMode === 'deep') {
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&mode=deep`);
      const data = await res.json();
      state.sessions = data.results;
      state.filters.search = query;
      renderSessionList();
      renderActiveFilters();
      updateFiltersToggleLabel();
    } catch (error) {
      console.error('Search failed:', error);
    }
  } else {
    state.sessions = state.allSessions;
    state.filters.search = query;
    renderSessionList();
    renderActiveFilters();
    updateFiltersToggleLabel();
  }
}

// Settings modal
function openSettings() {
  document.getElementById('settings-modal').classList.add('open');
  renderSettingsDirectories();
}

function closeSettings() {
  document.getElementById('settings-modal').classList.remove('open');
}

function renderSettingsDirectories() {
  const container = document.getElementById('settings-directories');
  const dirs = state.directories;

  if (dirs.length === 0) {
    container.innerHTML = '<p class="text-sm text-muted-foreground">No directories configured.</p>';
    return;
  }

  container.innerHTML = dirs.map(dir => `
    <div class="settings-directory-item flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/70 p-3" data-path="${escapeHtml(dir.path)}">
      <div class="settings-directory-color h-3 w-3 rounded-full" style="background: ${dir.color}"></div>
      <div class="settings-directory-info flex min-w-[200px] flex-1 flex-col">
        <div class="settings-directory-label text-[13px] font-medium text-foreground">${escapeHtml(dir.label)}</div>
        <div class="settings-directory-path text-[11px] text-muted-foreground">${escapeHtml(dir.path)}</div>
      </div>
      <label class="toggle">
        <input type="checkbox" ${dir.enabled !== false ? 'checked' : ''} onchange="toggleDirectoryEnabled('${escapeHtml(dir.path)}', this.checked)">
        <span class="slider"></span>
      </label>
      <div class="settings-directory-actions flex items-center gap-2">
        <button class="btn-icon inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/80 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground" onclick="editDirectory('${escapeHtml(dir.path)}')" title="Edit">&#x270F;</button>
        <button class="btn-icon btn-danger inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/80 text-sm text-destructive transition-colors hover:bg-destructive/10" onclick="deleteDirectory('${escapeHtml(dir.path)}')" title="Delete">&#x1F5D1;</button>
      </div>
    </div>
  `).join('');
}

function showAddDirectoryForm() {
  const container = document.getElementById('settings-directories');
  const existingForm = document.getElementById('add-directory-form');
  if (existingForm) {
    existingForm.remove();
    return;
  }

  const formHtml = `
    <div class="add-directory-form mt-4 space-y-3 rounded-xl border border-border bg-background/70 p-3" id="add-directory-form">
      <input type="text" id="new-dir-path" placeholder="Directory path (e.g., ~/.claude)" class="input w-full rounded-md border border-input bg-background/80 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40">
      <input type="text" id="new-dir-label" placeholder="Label (e.g., Work)" class="input w-full rounded-md border border-input bg-background/80 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40">
      <input type="color" id="new-dir-color" value="#10b981" class="input-color h-9 w-16 rounded-md border border-border bg-background/80">
      <div class="form-actions flex items-center justify-end gap-2">
        <button class="btn btn-primary inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90" onclick="submitAddDirectory()">Add</button>
        <button class="btn btn-secondary inline-flex items-center justify-center rounded-md border border-border bg-background/80 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground" onclick="cancelAddDirectory()">Cancel</button>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', formHtml);
  document.getElementById('new-dir-path').focus();
}

function cancelAddDirectory() {
  const form = document.getElementById('add-directory-form');
  if (form) form.remove();
}

async function submitAddDirectory() {
  const pathInput = document.getElementById('new-dir-path');
  const labelInput = document.getElementById('new-dir-label');
  const colorInput = document.getElementById('new-dir-color');

  const path = pathInput.value.trim();
  const label = labelInput.value.trim() || path.split('/').pop();
  const color = colorInput.value;

  if (!path) {
    showNotification('Please enter a directory path', 'error');
    return;
  }

  try {
    const res = await fetch('/api/directories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, label, color, enabled: true })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to add directory');
    }

    cancelAddDirectory();
    await loadDirectories();
    await loadSessions();
    renderSettingsDirectories();
    renderDirectoryList();
    showNotification('Directory added successfully', 'success');
  } catch (error) {
    showNotification('Failed to add directory: ' + error.message, 'error');
  }
}

async function toggleDirectoryEnabled(path, enabled) {
  try {
    const res = await fetch(`/api/directories/${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });

    if (!res.ok) throw new Error('Failed to update directory');

    await loadDirectories();
    await loadSessions();
    renderDirectoryList();
    renderSessionList();
    showNotification(enabled ? 'Directory enabled' : 'Directory disabled', 'success');
  } catch (error) {
    showNotification('Failed to update: ' + error.message, 'error');
  }
}

function editDirectory(path) {
  const dir = state.directories.find(d => d.path === path);
  if (!dir) return;

  const existingModal = document.getElementById('edit-directory-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.className = 'modal open fixed inset-0 z-50 flex items-center justify-center';
  modal.id = 'edit-directory-modal';
  modal.innerHTML = `
    <div class="modal-backdrop absolute inset-0 bg-black/40 backdrop-blur-sm" onclick="closeEditDirectory()"></div>
    <div class="modal-content relative mx-auto w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
      <div class="modal-header flex items-center justify-between">
        <h2 class="text-lg font-semibold text-foreground">Edit Directory</h2>
        <button class="modal-close rounded-full border border-border bg-background/80 px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground" onclick="closeEditDirectory()">&times;</button>
      </div>
      <div class="modal-body mt-5 space-y-4">
        <div class="form-group space-y-2">
          <label class="text-sm font-medium text-muted-foreground">Path</label>
          <input type="text" id="edit-dir-path" value="${escapeHtml(dir.path)}" class="input w-full rounded-md border border-input bg-background/80 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 opacity-70" readonly>
        </div>
        <div class="form-group space-y-2">
          <label class="text-sm font-medium text-muted-foreground">Label</label>
          <input type="text" id="edit-dir-label" value="${escapeHtml(dir.label)}" class="input w-full rounded-md border border-input bg-background/80 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40">
        </div>
        <div class="form-group space-y-2">
          <label class="text-sm font-medium text-muted-foreground">Color</label>
          <input type="color" id="edit-dir-color" value="${dir.color}" class="input-color h-9 w-16 rounded-md border border-border bg-background/80">
        </div>
        <div class="form-actions mt-4 flex items-center justify-end gap-2">
          <button class="btn btn-primary inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90" onclick="submitEditDirectory('${escapeHtml(path)}')">Save</button>
          <button class="btn btn-secondary inline-flex items-center justify-center rounded-md border border-border bg-background/80 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground" onclick="closeEditDirectory()">Cancel</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function closeEditDirectory() {
  const modal = document.getElementById('edit-directory-modal');
  if (modal) modal.remove();
}

async function submitEditDirectory(originalPath) {
  const label = document.getElementById('edit-dir-label').value.trim();
  const color = document.getElementById('edit-dir-color').value;

  if (!label) {
    showNotification('Label cannot be empty', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/directories/${encodeURIComponent(originalPath)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, color })
    });

    if (!res.ok) throw new Error('Failed to update directory');

    closeEditDirectory();
    await loadDirectories();
    await loadSessions();
    renderSettingsDirectories();
    renderDirectoryList();
    renderSessionList();
    showNotification('Directory updated', 'success');
  } catch (error) {
    showNotification('Failed to update: ' + error.message, 'error');
  }
}

async function deleteDirectory(path) {
  const dir = state.directories.find(d => d.path === path);
  if (!confirm(`Delete directory "${dir?.label || path}"? Sessions won't be deleted, just hidden.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/directories/${encodeURIComponent(path)}`, {
      method: 'DELETE'
    });

    if (!res.ok) throw new Error('Failed to delete directory');

    await loadDirectories();
    await loadSessions();
    renderSettingsDirectories();
    renderDirectoryList();
    renderSessionList();
    showNotification('Directory removed', 'success');
  } catch (error) {
    showNotification('Failed to delete: ' + error.message, 'error');
  }
}

// Custom Tags UI
function renderTagsSection(session) {
  const autoTagsList = ['debugging', 'feature', 'refactoring', 'git', 'testing', 'docs', 'config', 'api', 'ui'];
  const customTags = session.tags.filter(t => !autoTagsList.includes(t));
  const autoTags = session.tags.filter(t => autoTagsList.includes(t));

  return `
    <div class="session-tags-section space-y-3 rounded-2xl border border-border bg-card/60 p-4">
      <div class="tags-header flex items-center justify-between">
        <span class="tags-label text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Tags</span>
        <button class="btn-small inline-flex items-center justify-center rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground" onclick="showAddTagForm('${session.id}')">+ Add Tag</button>
      </div>
      <div class="tags-list flex flex-wrap gap-2">
        ${autoTags.map(t => `<span class="tag tag-${t} inline-flex items-center rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">${t}</span>`).join('')}
        ${customTags.map(t => `
          <span class="tag tag-custom inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">
            ${escapeHtml(t)}
            <button class="tag-remove rounded-full border border-border bg-card/70 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground" onclick="event.stopPropagation(); removeTag('${session.id}', '${escapeHtml(t)}')">&times;</button>
          </span>
        `).join('')}
      </div>
      <div id="add-tag-form-${session.id}" class="add-tag-form hidden"></div>
    </div>
  `;
}

function showAddTagForm(sessionId) {
  const container = document.getElementById(`add-tag-form-${sessionId}`);
  if (!container) return;

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="flex flex-wrap items-center gap-2">
      <input type="text" id="new-tag-input-${sessionId}" placeholder="Tag name" class="input-small w-48 rounded-md border border-input bg-background/80 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40" onkeypress="if(event.key==='Enter')submitAddTag('${sessionId}')">
      <button class="btn-small btn-primary inline-flex items-center justify-center rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90" onclick="submitAddTag('${sessionId}')">Add</button>
      <button class="btn-small inline-flex items-center justify-center rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground" onclick="hideAddTagForm('${sessionId}')">Cancel</button>
    </div>
  `;
  document.getElementById(`new-tag-input-${sessionId}`).focus();
}

function hideAddTagForm(sessionId) {
  const container = document.getElementById(`add-tag-form-${sessionId}`);
  if (container) {
    container.classList.add('hidden');
    container.innerHTML = '';
  }
}

async function submitAddTag(sessionId) {
  const input = document.getElementById(`new-tag-input-${sessionId}`);
  const tag = input.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');

  if (!tag) {
    showNotification('Please enter a tag name', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/sessions/${sessionId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: [tag] })
    });

    if (!res.ok) throw new Error('Failed to add tag');

    hideAddTagForm(sessionId);
    await loadSessions();
    await loadTags();
    if (state.currentSession && state.currentSession.id === sessionId) {
      const sessionRes = await fetch(`/api/sessions/${sessionId}`);
      const data = await sessionRes.json();
      state.currentSession = data.session;
      renderSessionDetail(data.session);
    }
    showNotification('Tag added', 'success');
  } catch (error) {
    showNotification('Failed to add tag: ' + error.message, 'error');
  }
}

async function removeTag(sessionId, tag) {
  try {
    const res = await fetch(`/api/sessions/${sessionId}/tags/${encodeURIComponent(tag)}`, {
      method: 'DELETE'
    });

    if (!res.ok) throw new Error('Failed to remove tag');

    await loadSessions();
    await loadTags();
    if (state.currentSession && state.currentSession.id === sessionId) {
      const sessionRes = await fetch(`/api/sessions/${sessionId}`);
      const data = await sessionRes.json();
      state.currentSession = data.session;
      renderSessionDetail(data.session);
    }
    showNotification('Tag removed', 'success');
  } catch (error) {
    showNotification('Failed to remove tag: ' + error.message, 'error');
  }
}

// Notification System
function showNotification(message, type = 'info') {
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  const typeClass = type === 'error'
    ? 'border-destructive/50 bg-destructive/10 text-destructive'
    : type === 'success'
      ? 'border-accent/50 bg-accent/10 text-foreground'
      : 'border-border bg-card/80 text-foreground';
  notification.className = `notification notification-${type} fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur ${typeClass}`;
  notification.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button class="notification-close ml-2 rounded-full border border-border bg-background/70 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground" onclick="this.parentElement.remove()">&times;</button>
  `;
  document.body.appendChild(notification);

  setTimeout(() => {
    if (notification.parentElement) {
      notification.classList.add('notification-fade');
      setTimeout(() => notification.remove(), 300);
    }
  }, 3000);
}

// Event listeners
function setupEventListeners() {
  window.addEventListener('popstate', handleRoute);

  // Header scroll shadow effect
  const header = document.querySelector('.header');
  const main = document.querySelector('.main');
  if (header && main) {
    main.addEventListener('scroll', () => {
      if (main.scrollTop > 10) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    });
  }

  // Sidebar time filters (legacy/fallback)
  document.querySelectorAll('#time-filters .filter-item').forEach(el => {
    el.addEventListener('click', () => filterByTime(el.dataset.filter));
  });

  // Header filter buttons (new design)
  document.querySelectorAll('.filter-btn').forEach(el => {
    el.addEventListener('click', () => filterByTime(el.dataset.filter));
  });

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', e => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => performSearch(e.target.value), 300);
    });
  }

  const searchModeBtn = document.getElementById('search-mode-btn');
  if (searchModeBtn) {
    searchModeBtn.addEventListener('click', toggleSearchMode);
  }

  const backButton = document.getElementById('back-button');
  if (backButton) {
    backButton.addEventListener('click', showList);
  }

  const pinButton = document.getElementById('pin-button');
  if (pinButton) {
    pinButton.addEventListener('click', togglePin);
  }

  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', openSettings);
  }

  const modalClose = document.getElementById('modal-close');
  if (modalClose) {
    modalClose.addEventListener('click', closeSettings);
  }

  const modalBackdrop = document.getElementById('modal-backdrop');
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', closeSettings);
  }

  const addDirectoryBtn = document.getElementById('add-directory-btn');
  if (addDirectoryBtn) {
    addDirectoryBtn.addEventListener('click', showAddDirectoryForm);
  }

  const projectSearchInput = document.getElementById('project-search-input');
  if (projectSearchInput) {
    let projectSearchTimeout;
    projectSearchInput.addEventListener('input', e => {
      clearTimeout(projectSearchTimeout);
      projectSearchTimeout = setTimeout(() => {
        state.filters.projectQuery = e.target.value;
        renderProjectList();
      }, 150);
    });
  }

  const projectBrowseBtn = document.getElementById('project-browse-btn');
  if (projectBrowseBtn) {
    projectBrowseBtn.addEventListener('click', openProjectsModal);
  }

  const projectsClose = document.getElementById('projects-close');
  if (projectsClose) {
    projectsClose.addEventListener('click', closeProjectsModal);
  }

  const projectsBackdrop = document.getElementById('projects-backdrop');
  if (projectsBackdrop) {
    projectsBackdrop.addEventListener('click', closeProjectsModal);
  }

  const projectsSearchInput = document.getElementById('projects-search-input');
  if (projectsSearchInput) {
    let modalSearchTimeout;
    projectsSearchInput.addEventListener('input', e => {
      clearTimeout(modalSearchTimeout);
      modalSearchTimeout = setTimeout(() => {
        state.filters.projectModalQuery = e.target.value;
        renderProjectsModalList();
      }, 150);
    });
  }

  const filtersToggle = document.getElementById('filters-toggle');
  if (filtersToggle) {
    filtersToggle.addEventListener('click', toggleFiltersDrawer);
  }

  document.querySelectorAll('.group-btn').forEach(btn => {
    btn.addEventListener('click', () => setGroupBy(btn.dataset.group));
  });

  const sessionList = document.getElementById('session-list');
  if (sessionList) {
    sessionList.addEventListener('click', event => {
      const target = event.target.closest('[data-filter-type]');
      if (!target) return;
      event.stopPropagation();
      const type = target.dataset.filterType;
      const value = target.dataset.filterValue;
      if (!type || !value) return;
      if (type === 'tag') filterByTag(value);
      if (type === 'directory') filterByDirectory(value);
      if (type === 'project') filterByProject(value);
    });
  }
}

function getProjectLabel(path) {
  const found = state.projects.find(project => project.path === path);
  return found ? found.name : path;
}

function initUiState() {
  const savedGroup = localStorage.getItem('agenttrail.groupBy');
  if (savedGroup === 'date' || savedGroup === 'project' || savedGroup === 'directory') {
    state.groupBy = savedGroup;
  }
  const savedFiltersOpen = localStorage.getItem('agenttrail.filtersOpen');
  if (savedFiltersOpen === 'true' || savedFiltersOpen === 'false') {
    state.ui.filtersOpen = savedFiltersOpen === 'true';
  } else {
    state.ui.filtersOpen = true;
  }
  updateGroupToggle();
  updateFiltersDrawer();
  renderActiveFilters();
  updateFiltersToggleLabel();
}

function setGroupBy(groupBy) {
  if (!groupBy) return;
  state.groupBy = groupBy;
  localStorage.setItem('agenttrail.groupBy', groupBy);
  updateGroupToggle();
  renderSessionList();
}

function updateGroupToggle() {
  document.querySelectorAll('.group-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.group === state.groupBy);
  });
}

function toggleFiltersDrawer() {
  state.ui.filtersOpen = !state.ui.filtersOpen;
  localStorage.setItem('agenttrail.filtersOpen', String(state.ui.filtersOpen));
  updateFiltersDrawer();
}

function updateFiltersDrawer() {
  const drawer = document.getElementById('filters-drawer');
  const toggle = document.getElementById('filters-toggle');
  if (drawer) {
    drawer.classList.toggle('open', state.ui.filtersOpen);
  }
  if (toggle) {
    toggle.classList.toggle('active', state.ui.filtersOpen);
  }
}

function getActiveFilterCount() {
  let count = 0;
  if (state.filters.time !== 'all') count++;
  if (state.filters.tag) count++;
  if (state.filters.directory) count++;
  if (state.filters.project) count++;
  if (state.filters.search) count++;
  return count;
}

function updateFiltersToggleLabel() {
  const label = document.getElementById('filters-toggle-label');
  if (!label) return;
  const count = getActiveFilterCount();
  label.textContent = count > 0 ? `Filters (${count})` : 'Filters';
}

function renderActiveFilters() {
  const container = document.getElementById('active-filters');
  if (!container) return;

  const chips = [];
  if (state.filters.time !== 'all') {
    chips.push({ label: `Time: ${state.filters.time}`, action: "clearFilter('time')" });
  }
  if (state.filters.tag) {
    chips.push({ label: `Tag: ${state.filters.tag}`, action: "clearFilter('tag')" });
  }
  if (state.filters.directory) {
    chips.push({ label: `Directory: ${state.filters.directory}`, action: "clearFilter('directory')" });
  }
  if (state.filters.project) {
    chips.push({ label: `Project: ${getProjectLabel(state.filters.project)}`, action: "clearFilter('project')" });
  }
  if (state.filters.search) {
    chips.push({ label: `Search: ${state.filters.search}`, action: "clearFilter('search')" });
  }

  if (chips.length === 0) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = `
    ${chips.map(chip => `
      <span class="filter-chip inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground">
        ${escapeHtml(chip.label)}
        <button class="rounded-full border border-border bg-card/70 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground" onclick="${chip.action}">&times;</button>
      </span>
    `).join('')}
    <button class="btn-small inline-flex items-center justify-center rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground" onclick="clearAllFilters()">Clear all</button>
  `;
}

function clearFilter(type) {
  if (type === 'time') filterByTime('all');
  if (type === 'tag') {
    state.filters.tag = null;
    renderTagList();
    renderSessionList();
  }
  if (type === 'directory') {
    state.filters.directory = null;
    renderDirectoryList();
    renderSessionList();
  }
  if (type === 'project') {
    state.filters.project = null;
    renderProjectList();
    renderSessionList();
  }
  if (type === 'search') {
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    state.filters.search = '';
    state.sessions = state.allSessions;
    renderSessionList();
  }
  renderActiveFilters();
  updateFiltersToggleLabel();
}

function clearAllFilters() {
  state.filters.time = 'all';
  state.filters.tag = null;
  state.filters.directory = null;
  state.filters.project = null;
  state.filters.search = '';
  state.filters.projectQuery = '';
  state.filters.projectModalQuery = '';
  state.sessions = state.allSessions;
  const input = document.getElementById('search-input');
  if (input) input.value = '';
  const projectInput = document.getElementById('project-search-input');
  if (projectInput) projectInput.value = '';
  renderTagList();
  renderDirectoryList();
  renderProjectList();
  renderSessionList();
  renderActiveFilters();
  updateFiltersToggleLabel();
}

function openProjectsModal() {
  const modal = document.getElementById('projects-modal');
  if (!modal) return;
  modal.classList.add('open');
  state.ui.projectsModalOpen = true;
  state.filters.projectModalQuery = '';
  const input = document.getElementById('projects-search-input');
  if (input) {
    input.value = '';
    input.focus();
  }
  renderProjectsModalList();
}

function closeProjectsModal() {
  const modal = document.getElementById('projects-modal');
  if (!modal) return;
  modal.classList.remove('open');
  state.ui.projectsModalOpen = false;
}

function renderProjectsModalList() {
  const container = document.getElementById('projects-modal-list');
  if (!container) return;
  const query = (state.filters.projectModalQuery || '').toLowerCase().trim();
  const list = state.projects
    .filter(project =>
      !query ||
      project.name.toLowerCase().includes(query) ||
      project.path.toLowerCase().includes(query)
    )
    .sort((a, b) => b.count - a.count);

  container.innerHTML = list.map(project => `
    <div class="projects-modal-item flex items-center gap-3 rounded-xl border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground" onclick="selectProjectFromModal('${escapeHtml(project.path)}')">
      <span class="project-icon text-base">&#x1F4C1;</span>
      <span class="project-name flex-1">${escapeHtml(project.name)}</span>
      <span class="projects-modal-count rounded-full border border-border bg-card/70 px-2 py-0.5 text-[10px] text-muted-foreground">${project.count}</span>
    </div>
  `).join('');
}

function selectProjectFromModal(path) {
  filterByProject(path);
  closeProjectsModal();
}

// Utilities
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// Initialize
init();
