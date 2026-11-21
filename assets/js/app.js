/* AGENT DECK — основная логика дашборда */

import { t, setLang, getLang, applyI18n, roleLabel, statusLabel } from './i18n.js';
import { putFile, deleteFile, clearFiles, listFiles, fileKey } from './db.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  snapshot: null,
  sessions: [],
  agents: [],
  filters: { q: '', status: '', agent: '', sort: 'updated' },
  selectedSessionId: null,
  context: null,
  contextCache: new Map(),
  renderedMessages: 60,
  files: [],
  ctxQuery: '',
};

/* ---------- утилиты ---------- */

const locale = () => (getLang() === 'en' ? 'en-US' : 'ru-RU');

function fmtNumber(value) {
  if (!value) return '0';
  const abs = Math.abs(value);
  const digits = abs >= 1e6 ? 1 : 0;
  return new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: digits }).format(value);
}

function fmtDateTime(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(locale(), {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function fmtRelative(ms) {
  if (!ms) return '—';
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const units = [
    ['year', 31536000000], ['month', 2592000000], ['day', 86400000],
    ['hour', 3600000], ['minute', 60000], ['second', 1000],
  ];
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (abs >= size) return rtf.format(Math.round(diff / size), unit);
  }
  return rtf.format(Math.round(diff / 1000), 'second');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function shortId(id) {
  return id ? `${id.slice(0, 8)}…${id.slice(-4)}` : '—';
}

function shortPath(path) {
  if (!path) return '—';
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 3 ? `…/${parts.slice(-3).join('/')}` : path;
}

function download(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

let toastTimer = null;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function statusClass(status) {
  return ['started', 'running', 'error', 'aborted', 'interrupted', 'idle'].includes(status) ? status : 'idle';
}

/* ---------- загрузка снимка ---------- */

async function loadSnapshot() {
  const response = await fetch('data/snapshot.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function applySnapshot(snapshot) {
  state.snapshot = snapshot;
  state.agents = snapshot.agents || [];
  state.sessions = snapshot.sessions || [];
  state.contextCache.clear();
  state.selectedSessionId = null;
  state.context = null;
  renderAll();
}

/* ---------- отрисовка ---------- */

function renderAll() {
  renderMeta();
  renderKpis();
  renderAgents();
  renderFilterOptions();
  renderRuns();
  renderTargetOptions();
  renderFiles();
}

function renderMeta() {
  const snap = state.snapshot;
  if (!snap) return;
  $('#snapshot-time').textContent = fmtRelative(snap.generated_at);
  $('#snapshot-time').title = fmtDateTime(snap.generated_at);
  $('#foot-source').textContent = snap.source || '—';
  $('#foot-built').textContent = snap.generated_at_iso || fmtDateTime(snap.generated_at);
  $('#public-notice').hidden = false;
}

function renderKpis() {
  const stats = state.snapshot?.stats || {};
  const statuses = stats.statuses || {};
  const running = (statuses.started || 0) + (statuses.running || 0);
  const tokens = stats.tokens?.total || 0;
  const items = [
    { v: stats.agents ?? 0, k: t('agents.title'), hint: t('agents.sub') },
    { v: stats.sessions ?? 0, k: t('reg.title'), hint: `${running} ${t('kpi.active')}` },
    { v: fmtNumber(stats.messages ?? 0), k: t('agents.messages'), hint: t('reg.msgs') },
    { v: fmtNumber(tokens), k: t('agents.tokens'), hint: t('reg.tokens') },
  ];
  $('#kpis').innerHTML = items
    .map((i) => `<div class="kpi"><div class="kpi__value">${escapeHtml(String(i.v))}</div>
      <div class="kpi__label">${escapeHtml(i.k)}</div><div class="kpi__hint">${escapeHtml(i.hint)}</div></div>`)
    .join('');
}

function avatarLetter(agent) {
  const source = agent.display_name || agent.name || '?';
  return source.trim().charAt(0).toUpperCase();
}

function renderAgents() {
  $('#agent-grid').innerHTML = state.agents
    .map((agent) => {
      const stats = agent.stats || {};
      const running = stats.running || 0;
      const badge = running ? 'running' : 'idle';
      return `
      <article class="agent-card" data-agent="${escapeHtml(agent.name)}">
        <div class="agent-card__head">
          <div class="avatar avatar--role-${escapeHtml(agent.role)}">${escapeHtml(avatarLetter(agent))}</div>
          <div style="min-width:0">
            <div class="agent-card__name">${escapeHtml(agent.display_name || agent.name)}</div>
            <div class="agent-card__role">${escapeHtml(agent.name)} · ${escapeHtml(roleLabel(agent.role))}${agent.model ? ` · ${escapeHtml(agent.model)}` : ''}</div>
          </div>
        </div>
        <p class="agent-card__desc">${escapeHtml(agent.description || '')}</p>
        <div class="agent-card__stats">
          <div class="stat"><div class="stat__v">${stats.sessions ?? 0}</div><div class="stat__k">${escapeHtml(t('agents.sessions'))}</div></div>
          <div class="stat"><div class="stat__v">${fmtNumber(stats.messages ?? 0)}</div><div class="stat__k">${escapeHtml(t('agents.messages'))}</div></div>
          <div class="stat"><div class="stat__v">${fmtNumber(stats.tokens ?? 0)}</div><div class="stat__k">${escapeHtml(t('agents.tokens'))}</div></div>
        </div>
        <details class="persona">
          <summary>${escapeHtml(t('agents.persona'))}</summary>
          <pre>${escapeHtml((agent.persona || '').slice(0, 2600))}</pre>
        </details>
        <div class="agent-card__foot">
          <span class="badge badge--${badge}">${escapeHtml(running ? statusLabel('running') : statusLabel('idle'))}</span>
          <span class="mono" style="color:var(--text-faint);font-size:11.5px">${escapeHtml(fmtRelative(stats.last_active))}</span>
          <button class="icon-btn icon-btn--sm" data-agent-export="${escapeHtml(agent.name)}"
                  title="${escapeHtml(t('exp.agent'))}" aria-label="${escapeHtml(t('exp.agent'))}">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 19h14"/></svg>
          </button>
          <button class="btn btn--ghost btn--sm" style="margin-left:auto" data-agent-runs="${escapeHtml(agent.name)}">
            ${escapeHtml(t('agents.contexts'))}
          </button>
        </div>
      </article>`;
    })
    .join('');
}

function renderFilterOptions() {
  const statuses = state.snapshot?.stats?.statuses || {};
  const statusSel = $('#filter-status');
  const currentStatus = statusSel.value;
  statusSel.innerHTML = `<option value="">${escapeHtml(t('reg.allstatus'))}</option>` +
    Object.entries(statuses)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `<option value="${escapeHtml(name)}">${escapeHtml(statusLabel(name))} · ${count}</option>`)
      .join('');
  statusSel.value = currentStatus;

  const agentSel = $('#filter-agent');
  const currentAgent = agentSel.value;
  agentSel.innerHTML = `<option value="">${escapeHtml(t('reg.allagents'))}</option>` +
    state.agents.map((a) => `<option value="${escapeHtml(a.name)}">${escapeHtml(a.display_name || a.name)}</option>`).join('');
  agentSel.value = currentAgent;

  const sortSel = $('#sort-by');
  const currentSort = sortSel.value;
  sortSel.innerHTML = [
    ['updated', t('reg.sort.updated')],
    ['messages', t('reg.sort.messages')],
    ['tokens', t('reg.sort.tokens')],
  ].map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('');
  sortSel.value = currentSort || 'updated';
}

function filteredSessions() {
  const { q, status, agent, sort } = state.filters;
  const query = q.trim().toLowerCase();
  let list = state.sessions.filter((session) => {
    if (status && session.status !== status) return false;
    if (agent && session.agent !== agent) return false;
    if (!query) return true;
    return (
      (session.title || '').toLowerCase().includes(query) ||
      (session.id || '').toLowerCase().includes(query) ||
      (session.workspace || '').toLowerCase().includes(query) ||
      (session.model || '').toLowerCase().includes(query) ||
      (session.agent || '').toLowerCase().includes(query)
    );
  });
  list = list.slice().sort((a, b) => {
    if (sort === 'messages') return (b.messages_total || 0) - (a.messages_total || 0);
    if (sort === 'tokens') return (b.tokens?.total || 0) - (a.tokens?.total || 0);
    return (b.updated_at || 0) - (a.updated_at || 0);
  });
  return list;
}

function renderRuns() {
  const list = filteredSessions();
  $('#run-empty').hidden = list.length > 0;
  $('#run-list').innerHTML = list
    .map((session) => {
      const status = statusClass(session.status);
      return `
      <article class="run-card" data-session="${escapeHtml(session.id)}" tabindex="0">
        <div class="run-card__bar run-card__bar--${status}"></div>
        <div class="run-card__main">
          <div class="run-card__title">${escapeHtml(session.title || '(без названия)')}</div>
          <div class="run-card__meta">
            <span><b>id</b> ${escapeHtml(shortId(session.id))}</span>
            <span><b>agent</b> ${escapeHtml(session.agent || '—')}</span>
            <span><b>model</b> ${escapeHtml(session.model || '—')}</span>
            <span><b>dir</b> ${escapeHtml(shortPath(session.workspace))}</span>
          </div>
        </div>
        <div class="run-card__right">
          <div class="run-card__tokens">
            <b>${fmtNumber(session.tokens?.total || 0)}</b>
            <span>${escapeHtml(t('reg.tokens'))}</span>
          </div>
          <div class="run-card__tokens">
            <b>${fmtNumber(session.messages_total || 0)}</b>
            <span>${escapeHtml(t('reg.msgs'))}</span>
          </div>
          <span class="badge badge--${status}">${escapeHtml(statusLabel(session.status))}</span>
        </div>
      </article>`;
    })
    .join('');
}

function renderChips() {
  const chips = [];
  const { q, status, agent } = state.filters;
  const chip = (label, key) =>
    `<span class="chip">${escapeHtml(label)} <button data-clear="${key}" aria-label="Сбросить">✕</button></span>`;
  if (q) chips.push(chip(`«${q}»`, 'q'));
  if (status) chips.push(chip(statusLabel(status), 'status'));
  if (agent) {
    const found = state.agents.find((a) => a.name === agent);
    chips.push(chip(found?.display_name || agent, 'agent'));
  }
  $('#active-filters').innerHTML = chips.join('');
}

/* ---------- drawer + контекст ---------- */

function sessionById(id) {
  return state.sessions.find((s) => s.id === id) || null;
}

async function openDrawer(sessionId) {
  const session = sessionById(sessionId);
  if (!session) return;
  state.selectedSessionId = sessionId;
  state.renderedMessages = 60;
  state.ctxQuery = '';

  $('#drawer-title').textContent = session.title || '(без названия)';
  $('#drawer-id').textContent = session.id;
  $('#drawer-status').className = `status-dot status-dot--${statusClass(session.status)}`;

  const tokens = session.tokens || {};
  const stats = [
    { k: t('reg.tokens'), v: fmtNumber(tokens.total || 0) },
    { k: t('reg.msgs'), v: fmtNumber(session.messages_total || 0) },
    { k: 'input', v: fmtNumber(tokens.input || 0) },
    { k: 'output', v: fmtNumber(tokens.output || 0) },
    { k: 'cache', v: fmtNumber(tokens.cache_read || 0) },
    { k: 'turns', v: fmtNumber(tokens.turns || 0) },
  ];
  $('#drawer-stats').innerHTML = stats
    .map((s) => `<div class="stat"><div class="stat__v">${escapeHtml(String(s.v))}</div><div class="stat__k">${escapeHtml(s.k)}</div></div>`)
    .join('');

  $('#ctx-body').innerHTML = `<div class="empty">${escapeHtml(t('ctx.loading'))}</div>`;
  const drawer = $('#drawer');
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
  drawer.removeAttribute('inert');
  document.body.style.overflow = 'hidden';

  await loadContext(sessionId);
}

function closeDrawer() {
  const drawer = $('#drawer');
  drawer.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
  drawer.setAttribute('inert', '');
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  document.body.style.overflow = '';
  state.selectedSessionId = null;
  state.context = null;
}

async function fetchContext(sessionId) {
  const session = sessionById(sessionId);
  if (!session) return null;
  if (state.contextCache.has(sessionId)) return state.contextCache.get(sessionId);
  const response = await fetch(`data/${session.context_file}`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const context = await response.json();
  state.contextCache.set(sessionId, context);
  return context;
}

async function loadContext(sessionId) {
  try {
    const context = await fetchContext(sessionId);
    state.context = context;
    state.renderedMessages = 60;
    renderMessages();
  } catch (error) {
    $('#ctx-body').innerHTML = `<div class="empty">${escapeHtml(String(error))}</div>`;
  }
}

function messageMatches(message, query) {
  if (!query) return true;
  const needle = query.toLowerCase();
  if ((message.text || '').toLowerCase().includes(needle)) return true;
  if ((message.thinking || '').toLowerCase().includes(needle)) return true;
  return (message.tools || []).some(
    (tool) => (tool.name || '').toLowerCase().includes(needle)
      || (tool.args || '').toLowerCase().includes(needle)
      || (tool.result || '').toLowerCase().includes(needle),
  );
}

function renderMessages() {
  const context = state.context;
  const body = $('#ctx-body');
  if (!context) return;
  const all = context.messages || [];
  const filtered = all.filter((m) => messageMatches(m, state.ctxQuery));

  if (!all.length) {
    body.innerHTML = `<div class="empty">${escapeHtml(t('ctx.empty'))}</div>`;
    return;
  }

  const shown = filtered.slice(0, state.renderedMessages);
  const head = context.truncated
    ? `<div class="notice">${escapeHtml(t('ctx.truncated', { shown: context.messages_kept, total: context.messages_total }))}</div>`
    : '';

  const html = shown.map((message) => {
    const role = (message.role || 'system').toLowerCase();
    const tools = (message.tools || []).map((tool, index) => `
      <div class="tool-call" data-tool="${index}">
        <div class="tool-call__head">
          <span class="tool-call__name">${escapeHtml(tool.name || 'tool')}</span>
          <span class="tool-call__status">${escapeHtml(String(tool.status ?? ''))}</span>
        </div>
        <div class="tool-call__body">
          <div style="color:var(--text-faint);font-size:11px;text-transform:uppercase;letter-spacing:.08em">${escapeHtml(t('ctx.args'))}</div>
          <pre>${escapeHtml((tool.args || '').slice(0, 4000))}</pre>
          <div style="color:var(--text-faint);font-size:11px;text-transform:uppercase;letter-spacing:.08em">${escapeHtml(t('ctx.result'))}</div>
          <pre>${escapeHtml((tool.result || '').slice(0, 12000))}</pre>
        </div>
      </div>`).join('');

    return `
      <div class="msg">
        <div class="msg__head">
          <span class="msg__role msg__role--${escapeHtml(role)}">${escapeHtml(role)}</span>
          <span class="msg__time">${escapeHtml(fmtDateTime(message.ts))}</span>
        </div>
        ${message.thinking ? `<div class="msg__thinking">${escapeHtml(message.thinking.slice(0, 4000))}</div>` : ''}
        ${message.text ? `<div class="msg__body">${escapeHtml(message.text.slice(0, 20000))}</div>` : ''}
        ${tools ? `<div class="msg__tools">${tools}</div>` : ''}
      </div>`;
  }).join('');

  const more = filtered.length > shown.length
    ? `<button class="btn btn--ghost" id="show-more">${escapeHtml(t('ctx.showMore'))} (${filtered.length - shown.length})</button>`
    : '';

  body.innerHTML = head + html + more;
}

function contextToMarkdown(context) {
  if (!context) return '';
  const lines = [
    `# ${context.title || context.session_id}`,
    '',
    `- session: \`${context.session_id}\``,
    `- agent: ${context.agent}`,
    `- status: ${context.status}`,
    `- model: ${context.model || '—'}`,
    `- workspace: ${context.workspace || '—'}`,
    `- messages: ${context.messages_kept} из ${context.messages_total}`,
    `- tokens: ${context.tokens?.total ?? 0} (in ${context.tokens?.input ?? 0} / out ${context.tokens?.output ?? 0} / cache ${context.tokens?.cache_read ?? 0})`,
    '',
    '---',
    '',
  ];
  for (const message of context.messages || []) {
    lines.push(`## ${message.role} · ${fmtDateTime(message.ts)}`);
    lines.push('');
    if (message.text) lines.push(message.text, '');
    if (message.thinking) lines.push('> thinking:', '> ' + message.thinking.split('\n').join('\n> '), '');
    for (const tool of message.tools || []) {
      lines.push(`### 🔧 ${tool.name}`);
      lines.push('```');
      lines.push((tool.args || '').slice(0, 4000));
      lines.push('```');
      if (tool.result) {
        lines.push('```');
        lines.push(tool.result.slice(0, 12000));
        lines.push('```');
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

/* ---------- загрузка файлов ---------- */

function targetLabel(kind, id) {
  if (kind === 'agent') {
    const agent = state.agents.find((a) => a.name === id);
    return agent ? `${agent.display_name || agent.name}` : id;
  }
  if (kind === 'session') {
    const session = sessionById(id);
    return session ? `${session.title || shortId(session.id)}` : id;
  }
  return '—';
}

function renderTargetOptions() {
  const kind = $('#target-kind').value;
  const select = $('#target-id');
  const previous = select.value;
  if (kind === 'session') {
    select.innerHTML = state.sessions
      .slice(0, 300)
      .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml((s.title || '').slice(0, 60) || shortId(s.id))}</option>`)
      .join('');
  } else if (kind === 'agent') {
    select.innerHTML = state.agents
      .map((a) => `<option value="${escapeHtml(a.name)}">${escapeHtml(a.display_name || a.name)}</option>`)
      .join('');
  } else {
    select.innerHTML = '<option value="global">global</option>';
  }
  if ([...select.options].some((o) => o.value === previous)) select.value = previous;
}

async function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const kind = $('#target-kind').value;
  const targetId = $('#target-id').value || 'global';

  for (const file of files) {
    const isText = file.type.startsWith('text/') || /\.(md|txt|json|jsonl|csv|log|ya?ml|ts|js|py|html|css|xml)$/i.test(file.name);
    let content = '';
    if (isText && file.size <= 8 * 1024 * 1024) {
      content = await file.text();
    }
    await putFile({
      key: fileKey(kind, targetId, file.name),
      name: file.name,
      size: file.size,
      type: file.type,
      targetKind: kind,
      targetId,
      targetKey: `${kind}::${targetId || 'global'}`,
      content,
      binary: !content,
      addedAt: Date.now(),
    });
  }
  await refreshFiles();
  toast(t('toast.filesAdded', { n: files.length }));
}

async function refreshFiles() {
  try {
    state.files = await listFiles();
  } catch {
    state.files = [];
  }
  renderFiles();
}

function renderFiles() {
  const list = state.files;
  $('#file-empty').hidden = list.length > 0;
  $('#file-list').innerHTML = list
    .map((file) => `
      <div class="file-row" data-key="${escapeHtml(file.key)}">
        <div style="min-width:0">
          <div class="file-row__name">${escapeHtml(file.name)}</div>
          <div class="file-row__sub">${escapeHtml(fmtBytes(file.size))} · ${escapeHtml(new Date(file.addedAt).toLocaleString(locale()))}${file.binary ? ` · ${escapeHtml(t('up.binary'))}` : ''}</div>
        </div>
        <span class="file-row__target">${escapeHtml(targetLabel(file.targetKind, file.targetId))}</span>
        <div style="display:flex;gap:6px">
          ${file.content ? `<button class="btn btn--ghost btn--sm" data-preview="${escapeHtml(file.key)}">${escapeHtml(getLang() === 'en' ? 'Preview' : 'Просмотр')}</button>` : ''}
          <button class="btn btn--danger btn--sm" data-remove="${escapeHtml(file.key)}">✕</button>
        </div>
      </div>`)
    .join('');
}

function fmtBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

async function buildBundle(format) {
  const kind = $('#target-kind').value;
  const targetId = $('#target-id').value || 'global';
  const related = state.files.filter(
    (f) => f.targetKind === kind && (kind === 'global' || f.targetId === targetId),
  );
  if (!related.length) { toast(t('up.noFiles')); return; }

  let runtimeContext = null;
  if (kind === 'session' && targetId) {
    const session = sessionById(targetId);
    if (session) {
      try {
        runtimeContext = await fetchContext(targetId);
      } catch {
        runtimeContext = null;
      }
    }
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  if (format === 'md') {
    const parts = [`# Context bundle · ${targetLabel(kind, targetId)}`, '', `Generated: ${new Date().toISOString()}`, ''];
    if (runtimeContext) parts.push('## Runtime context', '', contextToMarkdown(runtimeContext), '');
    for (const file of related) {
      parts.push(`---`, '', `## Uploaded file: ${file.name}`, '', '```', (file.content || '(binary)').slice(0, 200000), '```', '');
    }
    download(`context-${kind}-${stamp}.md`, parts.join('\n'), 'text/markdown;charset=utf-8');
  } else {
    const payload = {
      generated_at: new Date().toISOString(),
      target: { kind, id: targetId, label: targetLabel(kind, targetId) },
      runtime_context: runtimeContext,
      files: related.map((f) => ({
        name: f.name, size: f.size, type: f.type, added_at: new Date(f.addedAt).toISOString(), content: f.content || null,
      })),
    };
    download(`context-${kind}-${stamp}.json`, JSON.stringify(payload, null, 2), 'application/json');
  }
  toast(t('up.saved'));
}

/* ---------- экспорт и сохранение ---------- */

function stamp() {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function exportSnapshot() {
  const payload = {
    ...state.snapshot,
    exported_at: new Date().toISOString(),
  };
  download(`agent-deck-snapshot-${stamp()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  toast(t('toast.exportDone', { what: t('exp.snapshot') }));
}

function csvCell(value) {
  const text = String(value ?? '').replace(/"/g, '""');
  return `"${text}"`;
}

function exportRegistryCsv() {
  const list = filteredSessions();
  const header = [
    'session_id', 'title', 'agent', 'status', 'model', 'workspace',
    'created_at', 'updated_at', 'messages', 'tokens_input', 'tokens_output',
    'tokens_cache_read', 'tokens_total', 'error',
  ];
  const rows = list.map((s) => [
    s.id, s.title, s.agent, s.status, s.model, s.workspace,
    s.created_at ? new Date(s.created_at).toISOString() : '',
    s.updated_at ? new Date(s.updated_at).toISOString() : '',
    s.messages_total || 0,
    s.tokens?.input || 0, s.tokens?.output || 0, s.tokens?.cache_read || 0, s.tokens?.total || 0,
    s.error || '',
  ].map(csvCell).join(','));
  const csv = `\ufeff${[header.join(','), ...rows].join('\r\n')}`;
  download(`agent-deck-registry-${stamp()}.csv`, csv, 'text/csv;charset=utf-8');
  toast(t('toast.exportDone', { what: t('exp.csv') }));
}

async function exportAllContexts() {
  const sessions = state.sessions;
  if (!sessions.length) { toast(t('ctx.empty')); return; }
  const bundle = {
    generated_at: new Date().toISOString(),
    source: state.snapshot?.source || 'MiniMax Code local runtime',
    sessions: [],
  };
  for (let i = 0; i < sessions.length; i += 1) {
    const session = sessions[i];
    try {
      const context = await fetchContext(session.id);
      bundle.sessions.push({
        session_id: session.id,
        title: session.title,
        agent: session.agent,
        status: session.status,
        model: session.model,
        workspace: session.workspace,
        tokens: session.tokens,
        messages_kept: context?.messages_kept ?? 0,
        messages_total: context?.messages_total ?? session.messages_total,
        truncated: context?.truncated ?? false,
        messages: context?.messages || [],
      });
    } catch {
      bundle.sessions.push({ session_id: session.id, title: session.title, error: 'context unavailable' });
    }
    if (i % 10 === 0 || i === sessions.length - 1) {
      toast(t('toast.exportProgress', { done: i + 1, total: sessions.length }));
    }
  }
  download(`agent-deck-contexts-${stamp()}.json`, JSON.stringify(bundle, null, 1), 'application/json');
  toast(t('toast.exportDone', { what: t('exp.contexts') }));
}

async function exportAgentContext(agentName) {
  const agent = state.agents.find((a) => a.name === agentName);
  const sessions = state.sessions.filter((s) => s.agent === agentName);
  if (!sessions.length) { toast(t('ctx.empty')); return; }
  const parts = [
    `# ${agent?.display_name || agentName} — контексты запусков`,
    '',
    `- agent: ${agentName}`,
    `- role: ${agent?.role || '—'}`,
    `- description: ${agent?.description || '—'}`,
    `- sessions: ${sessions.length}`,
    `- generated: ${new Date().toISOString()}`,
    '',
  ];
  for (let i = 0; i < sessions.length; i += 1) {
    const session = sessions[i];
    let context = null;
    try { context = await fetchContext(session.id); } catch { /* пропускаем недоступный */ }
    parts.push('---', '', contextToMarkdown(context) || `## ${session.title}\n\n(контекст недоступен)`, '');
    if (i % 5 === 0 || i === sessions.length - 1) {
      toast(t('toast.exportProgress', { done: i + 1, total: sessions.length }));
    }
  }
  download(`agent-deck-${agentName}-contexts-${stamp()}.md`, parts.join('\n'), 'text/markdown;charset=utf-8');
  toast(t('toast.exportDone', { what: t('exp.agent') }));
}

async function exportSite() {
  toast(t('toast.exportProgress', { done: 0, total: state.sessions.length }));
  const parts = ['<!DOCTYPE html>', '<html lang="ru"><head><meta charset="utf-8" />',
    '<title>AGENT DECK — экспорт</title>', '</head><body>',
    '<h1>AGENT DECK — экспорт данных</h1>',
    '<p>Автономная копия дашборда: встроенные данные снимка и контексты сессий.</p>'];
  for (const session of state.sessions) {
    let context = null;
    try { context = await fetchContext(session.id); } catch { /* пропускаем */ }
    parts.push('<hr />', `<h2>${escapeHtml(session.title || session.id)}</h2>`,
      `<p><code>${escapeHtml(session.id)}</code> · ${escapeHtml(session.agent)} · ${escapeHtml(session.status)} · ${escapeHtml(session.model || '—')}</p>`,
      `<pre>${escapeHtml(contextToMarkdown(context) || '(контекст недоступен)')}</pre>`);
  }
  parts.push('</body></html>');
  download(`agent-deck-archive-${stamp()}.html`, parts.join('\n'), 'text/html;charset=utf-8');
  toast(t('toast.exportDone', { what: t('exp.site') }));
}

function wireExportMenu() {
  const menu = $('#export-menu');
  const btn = $('#export-btn');
  const pop = $('#export-pop');

  const close = () => {
    pop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onOutside);
    document.removeEventListener('keydown', onEsc);
  };
  const onOutside = (e) => { if (!menu.contains(e.target)) close(); };
  const onEsc = (e) => { if (e.key === 'Escape') close(); };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Меню всегда открывается по кнопке (идемпотентно) и закрывается кликом вне или Escape.
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onOutside);
    document.addEventListener('keydown', onEsc);
  });

  pop.addEventListener('click', (e) => {
    const action = e.target.closest('[data-export]')?.dataset.export;
    if (!action) return;
    close();
    if (action === 'snapshot') exportSnapshot();
    else if (action === 'csv') exportRegistryCsv();
    else if (action === 'contexts') exportAllContexts();
    else if (action === 'site') exportSite();
  });
}

/* ---------- события ---------- */

function wireEvents() {
  wireExportMenu();

  $('#theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('agent-deck-theme', next);
  });

  $$('.seg__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.seg__btn').forEach((b) => b.classList.toggle('is-active', b === btn));
      setLang(btn.dataset.lang);
      localStorage.setItem('agent-deck-lang', btn.dataset.lang);
      applyI18n();
      renderAll();
    });
  });

  $('#search').addEventListener('input', (e) => { state.filters.q = e.target.value; renderChips(); renderRuns(); });
  $('#filter-status').addEventListener('change', (e) => { state.filters.status = e.target.value; renderChips(); renderRuns(); });
  $('#filter-agent').addEventListener('change', (e) => { state.filters.agent = e.target.value; renderChips(); renderRuns(); });
  $('#sort-by').addEventListener('change', (e) => { state.filters.sort = e.target.value; renderRuns(); });

  $('#active-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-clear]');
    if (!btn) return;
    const key = btn.dataset.clear;
    state.filters[key] = '';
    if (key === 'q') $('#search').value = '';
    if (key === 'status') $('#filter-status').value = '';
    if (key === 'agent') $('#filter-agent').value = '';
    renderChips();
    renderRuns();
  });

  $('#agent-grid').addEventListener('click', (e) => {
    const exportBtn = e.target.closest('[data-agent-export]');
    if (exportBtn) {
      exportAgentContext(exportBtn.dataset.agentExport);
      return;
    }
    const btn = e.target.closest('[data-agent-runs]');
    if (!btn) return;
    state.filters.agent = btn.dataset.agentRuns;
    $('#filter-agent').value = btn.dataset.agentRuns;
    renderChips();
    renderRuns();
    document.getElementById('registry').scrollIntoView({ behavior: 'smooth' });
  });

  $('#run-list').addEventListener('click', (e) => {
    const card = e.target.closest('[data-session]');
    if (card) openDrawer(card.dataset.session);
  });
  $('#run-list').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('[data-session]');
    if (card) { e.preventDefault(); openDrawer(card.dataset.session); }
  });

  $$('[data-close-drawer]').forEach((el) => el.addEventListener('click', closeDrawer));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#drawer').classList.contains('is-open')) closeDrawer();
  });

  $('#ctx-search').addEventListener('input', (e) => {
    state.ctxQuery = e.target.value;
    state.renderedMessages = 60;
    renderMessages();
  });

  $('#ctx-body').addEventListener('click', (e) => {
    if (e.target.closest('#show-more')) {
      state.renderedMessages += 60;
      renderMessages();
      return;
    }
    const head = e.target.closest('.tool-call__head');
    if (head) head.parentElement.classList.toggle('is-open');
  });

  $('#ctx-copy').addEventListener('click', async () => {
    const text = contextToMarkdown(state.context);
    try {
      await navigator.clipboard.writeText(text);
      toast(t('ctx.copied'));
    } catch {
      toast(t('ctx.copyFail'));
    }
  });
  $('#ctx-md').addEventListener('click', () => {
    if (!state.context) return;
    download(`${state.context.session_id}.md`, contextToMarkdown(state.context), 'text/markdown;charset=utf-8');
  });
  $('#ctx-json').addEventListener('click', () => {
    if (!state.context) return;
    download(`${state.context.session_id}.json`, JSON.stringify(state.context, null, 2), 'application/json');
  });

  const dropzone = $('#dropzone');
  const fileInput = $('#file-input');
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
  ['dragenter', 'dragover'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('is-over'); }));
  dropzone.addEventListener('drop', (e) => handleFiles(e.dataTransfer?.files));

  $('#target-kind').addEventListener('change', renderTargetOptions);
  $('#upload-jump-btn').addEventListener('click', () => {
    document.getElementById('upload').scrollIntoView({ behavior: 'smooth' });
  });
  $('#bundle-md').addEventListener('click', () => buildBundle('md'));
  $('#bundle-json').addEventListener('click', () => buildBundle('json'));
  $('#clear-files').addEventListener('click', async () => {
    await clearFiles();
    await refreshFiles();
  });

  $('#file-list').addEventListener('click', async (e) => {
    const remove = e.target.closest('[data-remove]');
    if (remove) {
      await deleteFile(remove.dataset.remove);
      await refreshFiles();
      toast(t('up.deleted'));
      return;
    }
    const preview = e.target.closest('[data-preview]');
    if (preview) {
      const file = state.files.find((f) => f.key === preview.dataset.preview);
      if (!file) return;
      const row = preview.closest('.file-row');
      const existing = row.nextElementSibling;
      if (existing?.classList.contains('file-preview')) { existing.remove(); return; }
      const block = document.createElement('pre');
      block.className = 'file-preview';
      block.style.cssText = 'grid-column:1/-1;margin:0;padding:12px;border-radius:10px;background:var(--surface-2);border:1px solid var(--line);font-size:12px;white-space:pre-wrap;max-height:320px;overflow:auto';
      block.textContent = (file.content || '').slice(0, 20000);
      row.after(block);
    }
  });

  $('#import-snapshot-btn').addEventListener('click', () => $('#snapshot-file').click());
  $('#snapshot-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.agents) || !Array.isArray(data.sessions)) {
        toast(t('toast.snapshotFail'));
        return;
      }
      applySnapshot(data);
      toast(t('toast.snapshotLoaded', { agents: data.agents.length, sessions: data.sessions.length }));
    } catch (error) {
      toast(t('toast.snapshotFail'));
    }
    e.target.value = '';
  });
}

/* ---------- старт ---------- */

async function init() {
  const savedTheme = localStorage.getItem('agent-deck-theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  const savedLang = localStorage.getItem('agent-deck-lang') || 'ru';
  setLang(savedLang);
  $$('.seg__btn').forEach((b) => b.classList.toggle('is-active', b.dataset.lang === savedLang));
  applyI18n();

  wireEvents();
  renderChips();

  try {
    const snapshot = await loadSnapshot();
    applySnapshot(snapshot);
  } catch (error) {
    $('#run-list').innerHTML = `<div class="empty">Не удалось загрузить data/snapshot.json — ${escapeHtml(String(error))}</div>`;
  }
  await refreshFiles();
}

init();
