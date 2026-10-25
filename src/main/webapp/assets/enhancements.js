/* Additive CampusFix administration, service-level policy and analytics views.
   The original reporting, timeline, feedback and board implementation remains in app.js. */
const cfDefaults = () => ({
  slaHours: { URGENT: 4, HIGH: 24, MEDIUM: 48, LOW: 72 },
  maxPhotos: 5,
  uploadSizeMb: 5,
  categories: [
    'Electrical',
    'Plumbing',
    'Internet & Wi-Fi',
    'Furniture',
    'Housekeeping',
    'Air Conditioning',
    'Infrastructure',
    'Other',
  ],
  hostelBlocks: ['K', 'L', 'M', 'N', 'Q', 'R', 'S', 'T'],
  academicBlocks: ['PRP', 'SJT', 'TT', 'SMV'],
  notifyReporter: true,
  notifyStaff: true,
  notifyAdmins: true,
  notifyEscalations: true,
});
state.config = cfDefaults();
state.users = [];
state.blockFilter = '';
state.relatedIds = null;
state.slaFilter = '';
state.staffFilter = null;
state.usersLoaded = false;
function applyConfig(config) {
  if (!config) return;
  state.config = config;
  categories.splice(0, categories.length, ...config.categories);
  blocks.Hostel = [...config.hostelBlocks];
  blocks.Academic = [...config.academicBlocks];
}
function cfDemoUsers() {
  return roles
    .map((role, i) => ({
      id: i + 1,
      name: names[role],
      email: `${role.toLowerCase()}@vit.ac.in`,
      role,
      active: true,
      specialization: role === 'STAFF' ? 'Electrical & Infrastructure' : null,
      available: true,
      createdAt: new Date().toISOString(),
    }))
    .concat([
      {
        id: 5,
        name: 'Suresh Patel',
        email: 'suresh@vit.ac.in',
        role: 'STAFF',
        active: true,
        specialization: 'Plumbing & Housekeeping',
        available: true,
        createdAt: new Date().toISOString(),
      },
    ]);
}
function cfSaveDemo() {
  if (!state.demo) return;
  try {
    localStorage.setItem(
      'campusfix-admin-demo-v2',
      JSON.stringify({ users: state.users, config: state.config })
    );
    saveDemo();
  } catch {
    toast('Browser storage is full. Changes remain in this session.', true);
  }
}
const cfOriginalDemoLogin = demoLogin;
demoLogin = function (role) {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem('campusfix-admin-demo-v2'));
  } catch {}
  state.users = saved?.users || cfDemoUsers();
  state.usersLoaded = true;
  applyConfig(saved?.config || cfDefaults());
  state.blockFilter = '';
  state.relatedIds = null;
  state.slaFilter = '';
  state.staffFilter = null;
  cfOriginalDemoLogin(role);
};
const cfOriginalRefresh = refresh;
refresh = async function () {
  if (state.demo) {
    state.staff = cfStaffMetrics();
    cfSaveDemo();
    return;
  }
  await cfOriginalRefresh();
  if (isAdmin()) {
    const data = await api('admin/users');
    state.users = data.users;
    state.usersLoaded = true;
  }
};
const cfOriginalShell = renderShell;
renderShell = function () {
  cfOriginalShell();
  if (isAdmin()) {
    const team = $('#sidebar [data-page="staff"]');
    team?.insertAdjacentHTML('afterend', navItem('users', 'Users', 'person-gear'));
    const analyticsNav = $('#sidebar [data-page="analytics"]');
    analyticsNav?.insertAdjacentHTML('afterend', navItem('settings', 'Admin settings', 'sliders'));
  }
  if (state.demo) {
    const crumb = $('.breadcrumb');
    if (crumb) crumb.insertAdjacentHTML('afterbegin', '<span class="demo-pill">Demo</span>');
  }
};
const cfOriginalRenderPage = renderPage;
renderPage = function () {
  if (state.demo) {
    state.staff = cfStaffMetrics();
    cfDemoEscalate();
  }
  if (state.page === 'users' || state.page === 'settings') {
    if (!isAdmin()) {
      state.page = 'overview';
      cfOriginalRenderPage();
      return;
    }
    destroyCharts();
    $('#crumb').textContent = state.page === 'users' ? 'Users' : 'Admin settings';
    $('#page-content').innerHTML =
      (state.page === 'users' ? cfUsersPage() : cfSettingsPage()) + cfFooter();
    $$('.nav-item[data-page]').forEach((n) =>
      n.classList.toggle('active', n.dataset.page === state.page)
    );
    if (state.page === 'users' && !state.usersLoaded && !state.demo) {
      cfLoadUsers()
        .then(() => {
          if (state.page === 'users') renderPage();
        })
        .catch((e) => toast(e.message, true));
    }
    return;
  }
  cfOriginalRenderPage();
};
function cfFooter() {
  return `<footer class="footer"><span>CampusFix · VIT Vellore</span><span>${state.demo ? 'Sample data · Browser demo' : 'Session protected · Changes are audited'}</span></footer>`;
}
function cfResolvedAt(t) {
  return t.resolvedAt || t.updates?.find((u) => u.status === 'RESOLVED')?.createdAt || null;
}
function cfSla(t) {
  const hours = state.config.slaHours[t.priority] || 48,
    due = +new Date(t.createdAt) + hours * 3600000,
    done = ['RESOLVED', 'CLOSED'].includes(t.status),
    resolved = cfResolvedAt(t),
    end = done ? (resolved ? +new Date(resolved) : +new Date(t.updatedAt)) : Date.now();
  return {
    state: done
      ? end > due
        ? 'BREACHED'
        : 'MET'
      : end > due
        ? 'OVERDUE'
        : due - end <= hours * 3600000 * 0.2
          ? 'APPROACHING'
          : 'WITHIN',
    due,
    remaining: (due - Date.now()) / 3600000,
    hours,
    done,
  };
}
function cfSlaBadge(t) {
  const s = cfSla(t);
  return `<span class="sla-badge sla-${s.state.toLowerCase()}">${icon(s.state === 'OVERDUE' ? 'exclamation-triangle' : s.state === 'APPROACHING' ? 'clock' : 'check2-circle')} ${{ WITHIN: 'Within SLA', APPROACHING: 'Approaching deadline', OVERDUE: 'Overdue · Escalation Required', MET: 'Resolved within SLA', BREACHED: 'Resolved after SLA' }[s.state]}</span>`;
}
function cfDuration(value) {
  return value == null ? '—' : `${Number(value).toFixed(1)}h`;
}
function cfMetric(tickets) {
  const resolved = tickets.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.status)),
    durations = resolved
      .map((t) =>
        cfResolvedAt(t)
          ? Math.max(0, (new Date(cfResolvedAt(t)) - new Date(t.createdAt)) / 3600000)
          : null
      )
      .filter((x) => x != null),
    ratings = tickets.filter((t) => t.rating != null).map((t) => Number(t.rating)),
    avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return {
    total: tickets.length,
    activeAssignments: tickets.length - resolved.length,
    resolved: resolved.length,
    averageResolutionHours: avg(durations),
    averageRating: avg(ratings),
    completionPercent: tickets.length ? (resolved.length / tickets.length) * 100 : 0,
    withinSlaPercent: resolved.length
      ? (resolved.filter((t) => cfSla(t).state === 'MET').length / resolved.length) * 100
      : null,
  };
}
function cfStaffMetrics() {
  return state.users
    .filter((u) => u.role === 'STAFF')
    .map((u) => ({
      ...u,
      ...cfMetric(state.tickets.filter((t) => Number(t.assignedStaffId) === Number(u.id))),
    }));
}
const cfOriginalOverview = overview;
overview = function () {
  let html = cfOriginalOverview();
  if (isAdmin()) {
    const active = myTickets().filter((t) => !['RESOLVED', 'CLOSED'].includes(t.status)),
      count = (s) => active.filter((t) => cfSla(t).state === s).length;
    const panel = `<section class="sla-overview"><div class="sla-heading"><div><h2>Deadlines</h2></div><button class="text-link" data-action="nav" data-page="settings">Configure targets ${icon('sliders')}</button></div><div class="sla-summary">${[
      ['WITHIN', 'Within SLA', 'shield-check'],
      ['APPROACHING', 'Approaching deadline', 'clock'],
      ['OVERDUE', 'Overdue', 'exclamation-triangle'],
    ]
      .map(
        ([s, l, i]) =>
          `<button class="sla-summary-card sla-${s.toLowerCase()}" data-action="cf-sla-filter" data-sla="${s}">${icon(i)}<span>${l}</span><strong>${count(s)}</strong></button>`
      )
      .join(
        ''
      )}</div>${count('OVERDUE') ? `<div class="escalation-banner">${icon('exclamation-triangle-fill')} ${count('OVERDUE')} overdue complaints<button class="text-link" data-action="cf-sla-filter" data-sla="OVERDUE">Review overdue ${icon('arrow-right')}</button></div>` : ''}</section>`;
    html = html.replace('<div class="dashboard-grid">', panel + '<div class="dashboard-grid">');
  }
  return html;
};
const cfOriginalDetail = detail;
detail = function (id) {
  cfOriginalDetail(id);
  const t = myTickets().find((t) => t.id === Number(id));
  if (!t) return;
  const sla = cfSla(t);
  $('#modal-root .detail-info')?.insertAdjacentHTML(
    'afterend',
    `<section class="detail-sla ${sla.state === 'OVERDUE' ? 'escalated' : ''}">${cfSlaBadge(t)}<p>Target: ${sla.hours} hours from reporting · Deadline ${new Date(sla.due).toLocaleString('en-IN')}</p><small>${sla.done ? 'The SLA clock stopped when this complaint was resolved.' : sla.remaining < 0 ? `${Math.abs(sla.remaining).toFixed(1)} hours past deadline. Admin escalation is required.` : `${sla.remaining.toFixed(1)} hours remaining.`}</small></section>`
  );
  const staffSelect = $('#workflow-staff');
  if (staffSelect) {
    staffSelect.innerHTML =
      '<option value="">Choose maintenance staff</option>' +
      state.staff
        .filter((s) => (s.active !== false && s.available !== false) || s.id === t.assignedStaffId)
        .map(
          (s) =>
            `<option value="${s.id}" ${s.id === t.assignedStaffId ? 'selected' : ''}>${esc(s.name)} · ${esc(s.specialization)}${s.available === false ? ' (unavailable)' : ''}</option>`
        )
        .join('');
  }
};
const cfStatusMap = {
  Pending: 'REPORTED',
  'In Review': 'REVIEW',
  Assigned: 'ASSIGNED',
  'In Progress': 'IN_PROGRESS',
  'In progress': 'IN_PROGRESS',
  'Awaiting confirmation': 'PENDING_CONFIRMATION',
  Resolved: 'RESOLVED',
  Closed: 'CLOSED',
};
filteredTickets = function () {
  return myTickets()
    .filter(
      (t) =>
        (state.filter === 'All' ||
          (state.filter === 'Open' && !['RESOLVED', 'CLOSED'].includes(t.status)) ||
          cfStatusMap[state.filter] === t.status) &&
        (state.category === 'All' || state.category === t.category) &&
        (state.priority === 'All' || state.priority === t.priority) &&
        (!state.blockFilter || state.blockFilter === `${t.type}|${t.block}`) &&
        (!state.relatedIds || state.relatedIds.includes(t.id)) &&
        (!state.staffFilter || Number(t.assignedStaffId) === Number(state.staffFilter)) &&
        (!state.slaFilter || cfSla(t).state === state.slaFilter) &&
        (!state.search ||
          `${t.id} ${t.title} ${t.block} ${t.room} ${t.category} ${t.status}`
            .toLowerCase()
            .includes(state.search.toLowerCase()))
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};
const cfOriginalFilters = filters;
filters = function (compact = false) {
  if (compact) return cfOriginalFilters(true);
  const activeFilters =
    (state.category !== 'All' ? 1 : 0) +
    (state.priority !== 'All' ? 1 : 0) +
    (state.blockFilter ? 1 : 0) +
    (state.slaFilter ? 1 : 0);
  return `<div class="history-filter"><div class="history-tabs">${['All', 'Pending', 'In Review', 'Assigned', 'In Progress', 'Awaiting confirmation', 'Resolved', 'Closed'].map((label) => `<button class="tab ${state.filter === label ? 'active' : ''}" data-action="filter" data-filter="${label}">${label}<b>${label === 'All' ? myTickets().length : myTickets().filter((t) => t.status === cfStatusMap[label]).length}</b></button>`).join('')}</div><details class="extra-filters" ${activeFilters ? 'open' : ''}><summary>${icon('sliders')} Filters${activeFilters ? ` · ${activeFilters} active` : ''}</summary><div class="history-controls"><select class="small-select" id="category-filter" aria-label="Filter by category"><option value="All">All categories</option>${categories.map((c) => `<option ${state.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><select class="small-select" id="priority-filter" aria-label="Filter by priority"><option value="All">All priorities</option>${['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((p) => `<option ${state.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select><select class="small-select" id="block-filter" aria-label="Filter by block"><option value="">All campus blocks</option>${Object.entries(
    blocks
  )
    .flatMap(([type, bs]) =>
      bs.map(
        (b) =>
          `<option value="${type}|${esc(b)}" ${state.blockFilter === type + '|' + b ? 'selected' : ''}>${type} · ${esc(b)}</option>`
      )
    )
    .join(
      ''
    )}</select><select class="small-select" id="sla-filter" aria-label="Filter by SLA"><option value="">All SLA states</option>${[
    ['WITHIN', 'Within SLA'],
    ['APPROACHING', 'Approaching deadline'],
    ['OVERDUE', 'Overdue'],
    ['MET', 'Resolved within SLA'],
    ['BREACHED', 'Resolved after SLA'],
  ]
    .map(
      ([s, l]) => `<option value="${s}" ${state.slaFilter === s ? 'selected' : ''}>${l}</option>`
    )
    .join(
      ''
    )}</select><button class="text-link" data-action="reset-filters">Clear</button></div></details></div>`;
};
function cfComplaintCards(tickets) {
  return tickets.length
    ? `<div class="complaint-cards">${tickets
        .map((t) => {
          const overdue = cfSla(t).state === 'OVERDUE';
          return `<article class="complaint-card ${overdue ? 'escalated' : ''}" role="button" tabindex="0" data-action="detail" data-id="${t.id}" aria-label="Open ${esc(t.title)}"><div class="complaint-card-top"><span class="muted">CF-${t.id}</span>${priorityBadge(t.priority)}${statusBadge(t.status)}</div><h3>${esc(t.title)}</h3><div class="complaint-card-location">${icon('geo-alt')} ${esc(t.block)} · ${esc(t.room)}</div><div class="complaint-card-bottom"><span class="muted">${t.assignedStaff ? esc(t.assignedStaff) : 'Unassigned'}</span>${overdue ? `<span class="sla-badge sla-overdue">${icon('exclamation-triangle')} Overdue</span>` : `<span class="muted">Details ${icon('arrow-up-right')}</span>`}</div></article>`;
        })
        .join('')}</div>`
    : `<section class="panel"><div class="empty">${icon('inbox')}No complaints found.</div></section>`;
}
complaints = function () {
  const ts = filteredTickets();
  return (
    pageHeading(
      isAdmin()
        ? 'Campus complaints. Clear next steps.'
        : isStaff()
          ? 'Your assignments, at a glance.'
          : 'My complaints. Every update, together.',
      'A complete history from your first report to the final fix.'
    ) +
    `<section class="panel"><div class="panel-head"><div><h2>${state.relatedIds ? esc(state.attentionLabel || 'Related recurring complaints') : state.staffFilter ? 'Staff assignments' : state.blockFilter ? 'Complaints by block' : 'Results'}</h2><p>${ts.length} complaints${state.demo ? ' · Demo' : ''}</p></div><label class="history-search">${icon('search')}<input id="list-search" value="${esc(state.search)}" placeholder="Search complaints…" aria-label="Search complaint history"></label></div>${filters()}</section>${cfComplaintCards(ts)}`
  );
};
function cfMetricTiles(m) {
  return `<div class="team-metrics"><div><small>Active</small><strong>${m.activeAssignments}</strong></div><div><small>Completed</small><strong>${m.resolved}</strong></div><div><small>Avg. resolution</small><strong>${cfDuration(m.averageResolutionHours)}</strong></div><div><small>Avg. rating</small><strong>${m.averageRating == null ? '—' : Number(m.averageRating).toFixed(1) + '/5'}</strong></div></div>`;
}
staffPage = function () {
  return (
    pageHeading(
      'The team behind every fix.',
      'Manage availability, specializations and the work that keeps campus moving.',
      false
    ) +
    `<div class="team-grid">${
      state.staff
        .map(
          (s) =>
            `<article class="panel team-card"><div class="team-card-head"><span class="avatar">${esc(
              s.name
                .split(' ')
                .map((x) => x[0])
                .slice(0, 2)
                .join('')
            )}</span><span class="account-state ${s.active === false ? 'disabled' : ''}">${s.active === false ? 'Account disabled' : s.available === false ? 'Unavailable' : 'Available'}</span></div><h2>${esc(s.name)}</h2><p class="muted">${esc(s.specialization)}</p>${cfMetricTiles(s)}<div class="performance-row"><span>Completion performance</span><b>${Number(s.completionPercent || 0).toFixed(0)}%</b></div><div class="performance-track"><span style="width:${Math.max(0, Math.min(100, s.completionPercent || 0))}%"></span></div><div class="team-actions"><button class="btn-outline" data-action="cf-staff-view" data-id="${s.id}">Assignments ${icon('arrow-right')}</button><button class="btn-soft" data-action="cf-user-edit" data-id="${s.id}">Manage ${icon('sliders')}</button></div></article>`
        )
        .join('') ||
      '<div class="empty">Create a Maintenance Staff account in Users to build your team.</div>'
    }</div>`
  );
};
function cfUserLabel(r) {
  return roleNames[r] || nice(r);
}
function cfUsersPage() {
  return `<div class="page-heading"><div><h1>Users</h1><p>Manage accounts, roles, and campus access.</p></div><button class="btn-primary" data-action="cf-user-create">${icon('person-plus')} Create user</button></div><section class="panel"><div class="panel-head"><div><h2>Campus users</h2><p>${state.users.length} accounts · Account changes invalidate existing sessions.</p></div><label class="history-search">${icon('search')}<input id="user-search" value="${esc(state.userSearch || '')}" placeholder="Find a campus user…" aria-label="Search users"></label></div><div class="user-list">${
    state.users
      .filter(
        (u) =>
          !state.userSearch ||
          `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(state.userSearch.toLowerCase())
      )
      .map(
        (u) =>
          `<article class="user-row"><span class="avatar">${esc(
            u.name
              .split(' ')
              .map((x) => x[0])
              .slice(0, 2)
              .join('')
          )}</span><div class="user-identity"><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></div><span class="role-tag">${cfUserLabel(u.role)}</span><span class="account-state ${u.active ? '' : 'disabled'}">${u.active ? 'Enabled' : 'Disabled'}</span><div class="user-actions"><button class="btn-outline" data-action="cf-user-edit" data-id="${u.id}" aria-label="Manage ${esc(u.name)}">Manage</button><button class="icon-btn" data-action="cf-password" data-id="${u.id}" aria-label="Reset password for ${esc(u.name)}">${icon('key')}</button>${Number(u.id) !== Number(state.user.id) ? `<button class="btn-outline user-delete-button" data-action="cf-user-delete" data-id="${u.id}" aria-label="Delete ${esc(u.name)}">${icon('trash3')} Delete</button>` : ''}</div></article>`
      )
      .join('') || '<div class="empty">No users found.</div>'
  }</div></section><div class="notice">Staff with active work must have their complaints reassigned before their account can be disabled or their role changed. You cannot remove your own administrator access.</div>`;
}
function cfDeleteUserForm(id) {
  const u = state.users.find((u) => u.id === Number(id));
  if (!isAdmin() || !u || Number(u.id) === Number(state.user.id)) return;
  openModal(
    'Delete user',
    `<p>Delete <strong>${esc(u.name)}</strong>?</p><p class="muted">${esc(u.email)}</p><div class="notice">This account will lose access immediately and disappear from the user directory. Complaint history is preserved. The email remains reserved. This action cannot be undone from this page.</div><form id="cf-user-delete-form" data-id="${u.id}"><label class="resolution-check"><input type="checkbox" name="confirmed" value="true" required> I confirm that I want to delete this user.</label><div class="form-footer"><button type="button" class="btn-outline" data-action="close-modal">Cancel</button><button type="submit" class="btn-primary user-delete-button">${icon('trash3')} Delete user</button></div></form>`
  );
}

function cfUserForm(id) {
  const u = id ? state.users.find((u) => u.id === Number(id)) : null;
  if (id && !u) return;
  openModal(
    u ? 'Manage campus access' : 'Create a campus user',
    `<p>${u ? 'Changes take effect on the user’s next request. Existing complaint history is preserved.' : 'Create a real campus account with a role and a strong password.'}</p><form id="cf-user-form" data-id="${u?.id || ''}"><div class="field"><label for="managed-name">Full name *</label><input name="name" id="managed-name" required minlength="2" maxlength="100" value="${esc(u?.name || '')}"></div>${!u ? `<div class="field"><label for="managed-email">Campus email *</label><input type="email" name="email" id="managed-email" required maxlength="190" placeholder="you@vit.ac.in"></div>` : ''}<div class="form-grid"><div class="field"><label for="managed-role">Role *</label><select id="managed-role" name="role">${roles.map((r) => `<option value="${r}" ${u?.role === r ? 'selected' : ''}>${cfUserLabel(r)}</option>`).join('')}</select></div><div class="field"><label for="managed-active">Account status</label><select id="managed-active" name="active"><option value="true" ${u?.active !== false ? 'selected' : ''}>Enabled</option><option value="false" ${u?.active === false ? 'selected' : ''}>Disabled</option></select></div></div><div class="student-form-fields" ${!u || u.role === 'STUDENT' ? '' : 'hidden'}><div class="field"><label for="managed-hostel">Student hostel block</label><select name="hostelBlock" id="managed-hostel"><option value="">Not assigned</option>${blocks.Hostel.map((b) => `<option value="${esc(b)}" ${u?.hostelBlock === b ? 'selected' : ''}>${esc(b)} Block</option>`).join('')}</select><small>Students can report hostel issues only in their assigned block. Academic reporting remains available.</small></div></div><div class="staff-form-fields" ${u?.role === 'STAFF' ? '' : 'hidden'}><div class="field"><label for="managed-specialization">Staff specialization</label><input id="managed-specialization" name="specialization" maxlength="150" value="${esc(u?.specialization || 'General maintenance')}"></div><div class="field"><label for="managed-availability">Staff availability</label><select id="managed-availability" name="available"><option value="true" ${u?.available !== false ? 'selected' : ''}>Available for new assignments</option><option value="false" ${u?.available === false ? 'selected' : ''}>Unavailable for new assignments</option></select></div></div>${!u ? `<div class="field"><label for="managed-password">Initial password *</label><input id="managed-password" name="password" type="password" required minlength="12" maxlength="72" autocomplete="new-password"><small>At least 12 characters; maximum 72 UTF-8 bytes. Share securely with the user.</small></div>` : ''}<div class="form-footer"><button class="btn-outline" type="button" data-action="close-modal">Cancel</button><button class="btn-primary" type="submit">${u ? 'Save changes' : 'Create user'} ${icon('check2')}</button></div></form>`
  );
}
function cfPasswordForm(id) {
  const u = state.users.find((u) => u.id === Number(id));
  if (!u) return;
  openModal(
    'Reset account password',
    `<p>Set a new password for <strong>${esc(u.name)}</strong>. Their existing sessions will be invalidated.</p><form id="cf-password-form" data-id="${u.id}"><div class="field"><label for="reset-password">New password *</label><input id="reset-password" name="password" type="password" required minlength="12" maxlength="72" autocomplete="new-password"></div><div class="field"><label for="confirm-password">Confirm password *</label><input id="confirm-password" name="confirm" type="password" required minlength="12" maxlength="72" autocomplete="new-password"></div><div class="notice">${state.demo ? 'Demo mode: no password is stored or used for authentication.' : 'Use a secure channel to give the new password to the user. Passwords are stored as BCrypt hashes.'}</div><div class="form-footer"><button type="button" class="btn-outline" data-action="close-modal">Cancel</button><button type="submit" class="btn-primary">Reset password ${icon('key')}</button></div></form>`
  );
}
async function cfLoadUsers() {
  const data = await api('admin/users');
  state.users = data.users;
  state.usersLoaded = true;
}
function cfSettingsPage() {
  const c = state.config;
  return (
    pageHeading(
      'Campus policy, in your hands.',
      'Configure reporting limits, service targets and campus notifications.',
      false
    ) +
    `<form id="cf-settings-form"><section class="panel settings-section"><div class="panel-head"><div><h2>Service-level targets</h2><p>Hours from complaint creation. Changes recalculate deadlines for existing complaints.</p></div>${icon('clock-history')}</div><div class="settings-body"><div class="settings-sla-grid">${['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((p) => `<div class="field"><label for="sla-${p}">${nice(p)} · hours</label><input id="sla-${p}" name="sla-${p}" type="number" min="1" max="8760" required value="${c.slaHours[p]}"></div>`).join('')}</div><small class="muted">Approaching deadline: the final 20% of the target. Unresolved complaints past their deadline require escalation.</small></div></section><section class="panel settings-section"><div class="panel-head"><div><h2>Photos and reporting</h2><p>Changes apply to new submissions. Existing evidence is preserved.</p></div>${icon('camera')}</div><div class="settings-body"><div class="form-grid"><div class="field"><label for="max-photos">Maximum photos</label><input id="max-photos" name="maxPhotos" type="number" min="1" max="10" required value="${c.maxPhotos}"></div><div class="field"><label for="upload-size">Maximum size per photo · MB</label><input id="upload-size" name="uploadSizeMb" type="number" min="1" max="10" required value="${c.uploadSizeMb}"></div></div><div class="field"><label for="settings-categories">Complaint categories · one per line</label><textarea id="settings-categories" name="categories" required>${esc(c.categories.join('\n'))}</textarea></div></div></section><section class="panel settings-section"><div class="panel-head"><div><h2>Campus locations</h2><p>Use one block per line. Removing a choice does not remove historical complaints.</p></div>${icon('buildings')}</div><div class="settings-body form-grid"><div class="field"><label for="settings-hostels">Hostel blocks</label><textarea id="settings-hostels" name="hostelBlocks" required>${esc(c.hostelBlocks.join('\n'))}</textarea></div><div class="field"><label for="settings-academic">Academic blocks</label><textarea id="settings-academic" name="academicBlocks" required>${esc(c.academicBlocks.join('\n'))}</textarea></div></div></section><section class="panel settings-section"><div class="panel-head"><div><h2>Notification preferences</h2><p>Controls future in-app notices. Existing notifications remain available.</p></div>${icon('bell')}</div><div class="settings-body">${[
      [
        'notifyReporter',
        'Reporter updates',
        'Submission, status changes and feedback confirmation.',
      ],
      ['notifyStaff', 'Staff assignments', 'Notify staff when a complaint is assigned to them.'],
      [
        'notifyAdmins',
        'Administrative updates',
        'New reports, staff progress and complaint closure.',
      ],
      [
        'notifyEscalations',
        'SLA escalation alerts',
        'Notify active admins of overdue complaints, independently of general admin updates.',
      ],
    ]
      .map(
        ([key, title, description]) =>
          `<label class="setting-toggle"><div><strong>${title}</strong><small>${description}</small></div><input type="checkbox" name="${key}" ${c[key] ? 'checked' : ''}></label>`
      )
      .join(
        ''
      )}</div></section><div class="settings-save"><span class="muted">${state.demo ? 'Demo settings are saved in this browser.' : 'Policy changes are validated, saved in MySQL, and audited.'}</span><button class="btn-primary" type="submit">Save settings ${icon('check2')}</button></div></form><section class="panel" style="margin-top:22px"><div class="panel-head"><div><h2>Deployment readiness</h2><p>Check database connectivity, schema and writable upload storage.</p></div><button class="btn-outline" data-action="cf-health">Run check ${icon('activity')}</button></div><div id="health-result" class="settings-body muted">No check run in this workspace yet.</div></section>`
  );
}
function cfPerformanceTable() {
  return `<section class="panel"><div class="panel-head"><div><h2>Staff performance</h2><p>Resolution time is measured from report creation to resolution. Completion is resolved / total currently attributed assignments.</p></div></div><div class="table-wrap performance-table"><table><thead><tr><th>Staff</th><th>Active</th><th>Resolved</th><th>Avg. resolution</th><th>Avg. rating</th><th>Completion</th><th>Within SLA</th></tr></thead><tbody>${state.staff.map((s) => `<tr><td><strong>${esc(s.name)}</strong><small class="muted" style="display:block">${esc(s.specialization)}</small></td><td>${s.activeAssignments}</td><td>${s.resolved}</td><td>${cfDuration(s.averageResolutionHours)}</td><td>${s.averageRating == null ? '—' : Number(s.averageRating).toFixed(1) + '/5'}</td><td>${Number(s.completionPercent || 0).toFixed(0)}%</td><td>${s.withinSlaPercent == null ? '—' : Number(s.withinSlaPercent).toFixed(0) + '%'}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function cfBlockAnalysis() {
  const max = Math.max(
    1,
    ...Object.entries(blocks).flatMap(([type, bs]) =>
      bs.map((b) => state.tickets.filter((t) => t.type === type && t.block === b).length)
    )
  );
  return `<section class="panel"><div class="panel-head"><div><h2>Campus, block by block</h2><p>Click a block to inspect its complaint statistics and open related reports.</p></div><button class="text-link" data-action="cf-block-clear">Show all</button></div><div class="block-analysis">${Object.entries(
    blocks
  )
    .map(
      ([type, bs]) =>
        `<div><h3>${type === 'Hostel' ? 'Hostels' : 'Academic buildings'}</h3><div class="block-grid">${bs
          .map((b) => {
            const ts = state.tickets.filter((t) => t.type === type && t.block === b),
              m = cfMetric(ts);
            return `<button class="block-card ${state.analyticsBlock === type + '|' + b ? 'selected' : ''}" data-action="cf-block-stats" data-block="${type}|${esc(b)}"><span>${esc(b)}<small>${type === 'Hostel' ? 'Block' : 'Building'}</small></span><strong>${ts.length}</strong><div class="block-meter"><span style="width:${(ts.length / max) * 100}%"></span></div><small>${m.activeAssignments} active · ${m.resolved} resolved</small></button>`;
          })
          .join('')}</div></div>`
    )
    .join(
      ''
    )}</div><div id="block-statistics" class="settings-body">${cfBlockStatistics()}</div></section>`;
}
function cfBlockStatistics() {
  if (!state.analyticsBlock)
    return '<p class="muted">Select a block above to explore its service performance.</p>';
  const [type, block] = state.analyticsBlock.split('|'),
    ts = state.tickets.filter((t) => t.type === type && t.block === block),
    m = cfMetric(ts);
  return `<div class="block-stat-heading"><div><h3>${esc(type)} · ${esc(block)} Block</h3><p class="muted">${ts.length} complaints · ${ts.filter((t) => cfSla(t).state === 'OVERDUE').length} overdue</p></div><button class="btn-soft" data-action="cf-block-view" data-block="${esc(state.analyticsBlock)}">View complaints ${icon('arrow-right')}</button></div>${cfMetricTiles(m)}`;
}
function cfRecurringCards() {
  const groups = new Map();
  state.tickets
    .filter((t) => Date.now() - new Date(t.createdAt) < 30 * 86400000)
    .forEach((t) => {
      const key = [t.category, t.type, t.block, t.floor].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    });
  state.recurringGroups = [...groups.values()]
    .filter((ts) => ts.length >= 2)
    .sort((a, b) => b.length - a.length);
  return `<section class="panel"><div class="panel-head"><div><h2>Recurring issues, with context.</h2><p>Two or more reports in the same category, location type, block and floor within 30 days.</p></div></div><div class="recurring-grid">${
    state.recurringGroups
      .map((ts, i) => {
        const sorted = [...ts].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
          first = sorted[0],
          last = sorted.at(-1),
          m = cfMetric(ts);
        return `<article class="recurring-card"><div class="recurring-card-heading"><span class="category-icon">${icon(catIcons[categories.indexOf(first.category)] || 'grid')}</span><span class="repeat-count">${ts.length} complaints</span></div><h3>${esc(first.category)}</h3><p>${icon('geo-alt')} ${esc(first.type)} · ${esc(first.block)} Block · Floor ${esc(first.floor)}</p><dl><div><dt>Date range</dt><dd>${date(first.createdAt)} – ${date(last.createdAt)}</dd></div><div><dt>Avg. resolution</dt><dd>${cfDuration(m.averageResolutionHours)}</dd></div></dl><div class="latest-complaint"><small>Latest complaint · CF-${last.id}</small><strong>${esc(last.title)}</strong><small>${esc(last.room)} · ${statusLabel(last.status)}</small></div><button class="btn-outline" data-action="cf-related" data-group="${i}">View related complaints ${icon('arrow-right')}</button></article>`;
      })
      .join('') || '<p class="empty">No recurring issues in the last 30 days.</p>'
  }</div></section>`;
}
const cfOriginalAnalytics = analytics;
analytics = function () {
  const html = cfOriginalAnalytics(),
    marker =
      '<section class="panel"><div class="panel-head"><div><h2>Recurring issue detection</h2>';
  const start = html.indexOf(marker);
  return (
    (start >= 0 ? html.slice(0, start) : html) +
    cfPerformanceTable() +
    cfBlockAnalysis() +
    cfRecurringCards()
  );
};
const cfOriginalReportForm = reportForm;
reportForm = function () {
  cfOriginalReportForm();
  const hint = $('.upload-zone small');
  if (hint)
    hint.textContent = `Click to upload photos · JPEG, PNG, WebP · Up to ${state.config.maxPhotos} files, ${state.config.uploadSizeMb} MB each`;
};
document.addEventListener(
  'click',
  async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const action = b.dataset.action;
    if (action === 'reset-filters' || action === 'nav') {
      state.blockFilter = '';
      state.relatedIds = null;
      state.slaFilter = '';
      state.staffFilter = null;
    }
    if (action === 'reset-demo') {
      localStorage.removeItem('campusfix-admin-demo-v2');
    }
    if (!action.startsWith('cf-')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!state.user) return;
    try {
      if (action === 'cf-sla-filter') {
        state.page = 'complaints';
        state.filter = 'All';
        state.category = 'All';
        state.priority = 'All';
        state.search = '';
        state.slaFilter = b.dataset.sla;
        state.blockFilter = '';
        state.relatedIds = null;
        state.staffFilter = null;
        renderPage();
        window.scrollTo(0, 0);
        return;
      }
      if (action === 'cf-block-view') {
        state.page = 'complaints';
        state.filter = 'All';
        state.category = 'All';
        state.priority = 'All';
        state.search = '';
        state.blockFilter = b.dataset.block;
        state.relatedIds = null;
        state.slaFilter = '';
        state.staffFilter = null;
        renderPage();
        window.scrollTo(0, 0);
        return;
      }
      if (!isAdmin()) throw Error('Administrator access is required.');
      if (action === 'cf-user-create') cfUserForm();
      else if (action === 'cf-user-edit') cfUserForm(b.dataset.id);
      else if (action === 'cf-password') cfPasswordForm(b.dataset.id);
      else if (action === 'cf-user-delete') cfDeleteUserForm(b.dataset.id);
      else if (action === 'cf-staff-view') {
        state.page = 'complaints';
        state.filter = 'All';
        state.category = 'All';
        state.priority = 'All';
        state.search = '';
        state.staffFilter = Number(b.dataset.id);
        state.blockFilter = '';
        state.relatedIds = null;
        state.slaFilter = '';
        renderPage();
        window.scrollTo(0, 0);
      } else if (action === 'cf-block-stats') {
        state.analyticsBlock = b.dataset.block;
        $('#block-statistics').innerHTML = cfBlockStatistics();
        $$('.block-card').forEach((x) =>
          x.classList.toggle('selected', x.dataset.block === state.analyticsBlock)
        );
      } else if (action === 'cf-block-clear') {
        state.analyticsBlock = '';
        $('#block-statistics').innerHTML = cfBlockStatistics();
        $$('.block-card').forEach((x) => x.classList.remove('selected'));
      } else if (action === 'cf-related') {
        state.relatedIds = state.recurringGroups[Number(b.dataset.group)].map((t) => t.id);
        state.page = 'complaints';
        state.filter = 'All';
        state.category = 'All';
        state.priority = 'All';
        state.search = '';
        state.blockFilter = '';
        state.slaFilter = '';
        state.staffFilter = null;
        renderPage();
        window.scrollTo(0, 0);
      } else if (action === 'cf-health') {
        const result = state.demo
          ? { mode: 'Browser demo — does not verify MySQL or Tomcat' }
          : await api('admin/health');
        $('#health-result').innerHTML = Object.entries(result)
          .map(([k, v]) => `<p><strong>${esc(nice(k))}:</strong> ${esc(v)}</p>`)
          .join('');
      }
    } catch (error) {
      toast(error.message, true);
    }
  },
  true
);
document.addEventListener(
  'submit',
  async (e) => {
    const f = e.target;
    if (
      !['cf-user-form', 'cf-password-form', 'cf-settings-form', 'cf-user-delete-form'].includes(
        f.id
      )
    )
      return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!isAdmin()) {
      toast('Administrator access is required.', true);
      return;
    }
    const button = f.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const d = Object.fromEntries(new FormData(f));
      if (f.id === 'cf-user-delete-form') {
        if (d.confirmed !== 'true') throw Error('Confirm user deletion first.');
        const id = Number(f.dataset.id);
        if (id === Number(state.user.id))
          throw Error('You cannot delete your own administrator account.');
        if (state.demo) {
          if (
            state.tickets.some(
              (t) => Number(t.assignedStaffId) === id && !['RESOLVED', 'CLOSED'].includes(t.status)
            )
          )
            throw Error('Reassign active complaints before deleting this user.');
          state.users = state.users.filter((u) => Number(u.id) !== id);
          state.staff = cfStaffMetrics();
          cfSaveDemo();
        } else {
          await api(`admin/users/${id}/delete`, {
            method: 'POST',
            body: JSON.stringify({ confirmed: 'true' }),
          });
          await refresh();
        }
        closeModal();
        render();
        toast('User deleted. Complaint history preserved.');
        return;
      }
      if (f.id === 'cf-settings-form') {
        const config = {
          slaHours: Object.fromEntries(
            ['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((p) => [p, Number(d['sla-' + p])])
          ),
          maxPhotos: Number(d.maxPhotos),
          uploadSizeMb: Number(d.uploadSizeMb),
          categories: d.categories
            .split('\n')
            .map((x) => x.trim())
            .filter(Boolean),
          hostelBlocks: d.hostelBlocks
            .split('\n')
            .map((x) => x.trim())
            .filter(Boolean),
          academicBlocks: d.academicBlocks
            .split('\n')
            .map((x) => x.trim())
            .filter(Boolean),
          ...Object.fromEntries(
            ['notifyReporter', 'notifyStaff', 'notifyAdmins', 'notifyEscalations'].map((k) => [
              k,
              new FormData(f).has(k),
            ])
          ),
        };
        for (const [label, items] of [
          ['categories', config.categories],
          ['hostel blocks', config.hostelBlocks],
          ['academic blocks', config.academicBlocks],
        ])
          if (!items.length || new Set(items.map((x) => x.toLowerCase())).size !== items.length)
            throw Error(`Provide nonempty, unique ${label}.`);
        if (!state.demo)
          await api('admin/settings', {
            method: 'POST',
            body: JSON.stringify({ config: JSON.stringify(config) }),
          });
        applyConfig(config);
        if (state.demo) cfSaveDemo();
        else await refresh();
        renderPage();
        toast('Campus settings saved. Service targets and reporting choices are updated.');
        return;
      }
      if (f.id === 'cf-user-form') {
        if (state.demo) {
          let u = state.users.find((u) => u.id === Number(f.dataset.id));
          if (u) {
            if (u.id === state.user.id && (d.role !== 'ADMIN' || d.active === 'false'))
              throw Error('You cannot remove your own administrator access.');
            if (
              u.role === 'STAFF' &&
              (d.role !== 'STAFF' || d.active === 'false') &&
              state.tickets.some(
                (t) => t.assignedStaffId === u.id && !['RESOLVED', 'CLOSED'].includes(t.status)
              )
            )
              throw Error(
                'Reassign active complaints before disabling staff or changing their role.'
              );
            Object.assign(u, {
              name: d.name,
              role: d.role,
              hostelBlock: d.hostelBlock || null,
              active: d.active === 'true',
              specialization: d.specialization,
              available: d.available === 'true',
            });
          } else {
            if (state.users.some((u) => u.email.toLowerCase() === d.email.toLowerCase()))
              throw Error('That email already has an account.');
            state.users.push({
              id: Math.max(5, ...state.users.map((u) => u.id)) + 1,
              name: d.name,
              email: d.email,
              role: d.role,
              hostelBlock: d.hostelBlock || null,
              active: d.active === 'true',
              specialization: d.specialization,
              available: d.available === 'true',
              createdAt: new Date().toISOString(),
            });
          }
          state.staff = cfStaffMetrics();
          cfSaveDemo();
        } else {
          await api(f.dataset.id ? `admin/users/${f.dataset.id}/update` : 'admin/users', {
            method: 'POST',
            body: JSON.stringify(d),
          });
          await refresh();
          if (Number(f.dataset.id) === state.user.id) state.user.name = d.name;
        }
        closeModal();
        render();
        toast('Campus account saved.');
      } else {
        if (d.password !== d.confirm) throw Error('Passwords do not match.');
        if (new TextEncoder().encode(d.password).length > 72)
          throw Error('Use at most 72 UTF-8 bytes for the password.');
        if (!state.demo)
          await api(`admin/users/${f.dataset.id}/password`, {
            method: 'POST',
            body: JSON.stringify({ password: d.password }),
          });
        closeModal();
        if (!state.demo && Number(f.dataset.id) === state.user.id) {
          state.user = null;
          location.hash = 'login';
          render();
          toast('Your password was reset. Please sign in again.');
        } else
          toast(
            state.demo
              ? 'Demo reset verified. No password was stored.'
              : 'Password reset. Existing sessions have been invalidated.'
          );
      }
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  },
  true
);
document.addEventListener('change', (e) => {
  if (e.target.id === 'block-filter') {
    state.blockFilter = e.target.value;
    renderPage();
  } else if (e.target.id === 'sla-filter') {
    state.slaFilter = e.target.value;
    renderPage();
  } else if (e.target.id === 'managed-role') {
    $('.staff-form-fields').hidden = e.target.value !== 'STAFF';
    $('.student-form-fields').hidden = e.target.value !== 'STUDENT';
  }
});
let cfUserSearchTimer;
document.addEventListener('input', (e) => {
  if (e.target.id === 'user-search') {
    clearTimeout(cfUserSearchTimer);
    const value = e.target.value,
      pos = e.target.selectionStart;
    cfUserSearchTimer = setTimeout(() => {
      if (!$('#user-search')) return;
      state.userSearch = value;
      renderPage();
      const search = $('#user-search');
      search?.focus();
      search?.setSelectionRange(pos, pos);
    }, 200);
  }
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.complaint-card')) {
    e.preventDefault();
    e.target.click();
  }
});
// Public reporting choices are fetched without granting access to users or administrative data.
if (!location.pathname.endsWith('preview.html'))
  api('config')
    .then((c) => {
      if (!state.demo) applyConfig(c);
    })
    .catch(() => {});

function cfDemoEscalate() {
  if (!isAdmin() || !state.config.notifyEscalations) return;
  let changed = false;
  for (const t of state.tickets)
    if (
      cfSla(t).state === 'OVERDUE' &&
      !state.notifications.some((n) => n.message.startsWith(`CF-${t.id}: Escalation Required`))
    ) {
      state.notifications.unshift({
        id: Date.now() + t.id,
        message: `CF-${t.id}: Escalation Required ? complaint has exceeded its SLA.`,
        createdAt: new Date().toISOString(),
        read: false,
      });
      changed = true;
    }
  if (changed) {
    saveDemo();
    const nav = $('#sidebar [data-page="notifications"]');
    if (nav)
      nav.outerHTML = navItem(
        'notifications',
        'Notifications',
        'bell',
        state.notifications.filter((n) => !n.read).length
      );
  }
}

const cfOriginalHelp = help;
help = function () {
  return cfOriginalHelp().replace(
    'up to five JPEG, PNG or WebP photos, each up to 5 MB.',
    `up to ${state.config.maxPhotos} JPEG, PNG or WebP photos, each up to ${state.config.uploadSizeMb} MB.`
  );
};
// Normal Tomcat pages present authenticated backend access. Sample workspaces remain preview-only.
if (!location.pathname.endsWith('preview.html')) document.body.classList.add('backend-app');
