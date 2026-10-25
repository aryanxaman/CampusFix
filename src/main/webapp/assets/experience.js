/* Shared visual refinements. All counts come from the authenticated complaint list. */
const experienceLogin = renderLogin;
renderLogin = function () {
  experienceLogin();
  const art = document.querySelector('.login-art');
  art?.classList.add('campus-login-art');
  const illustration = art?.querySelector('.campus-art');
  illustration?.insertAdjacentHTML(
    'beforebegin',
    `
    <div class="login-journey" aria-label="How CampusFix works">
      <div><span>${icon('geo-alt')}</span><section><strong>Every place matters.</strong><p>From your hostel room to your next lecture.</p></section></div>
      <div><span>${icon('people')}</span><section><strong>The right team, connected.</strong><p>Clear ownership. Updates at every step.</p></section></div>
      <div><span>${icon('check2-circle')}</span><section><strong>A fix you can follow.</strong><p>Report, track, and close the loop.</p></section></div>
    </div>`
  );
  const inner = document.querySelector('.login-inner');
  inner
    ?.querySelector('h1')
    ?.insertAdjacentHTML('beforebegin', '<div class="login-label">YOUR CAMPUS WORKSPACE</div>');
  inner
    ?.querySelector('form')
    ?.insertAdjacentHTML(
      'afterend',
      `<div class="login-access"><span>${icon('shield-check')} Role-based access</span><span>${icon('buildings')} VIT Vellore</span></div>`
    );
};

function serviceJourney(tickets) {
  const stages = [
    ['REPORTED', 'Reported', 'Pending', 'inbox'],
    ['REVIEW', 'In review', 'In Review', 'clipboard-check'],
    ['ASSIGNED', 'Assigned', 'Assigned', 'person-check'],
    ['IN_PROGRESS', 'In progress', 'In Progress', 'tools'],
    ['PENDING_CONFIRMATION', 'Confirm fix', 'Awaiting confirmation', 'person-check'],
    ['RESOLVED', 'Resolved', 'Resolved', 'check2-circle'],
    ['CLOSED', 'Closed', 'Closed', 'star'],
  ];
  return `<details class="service-journey" aria-label="Complaint lifecycle"><summary>Workflow <span class="muted">${tickets.length} complaints</span></summary>
    <div class="journey-stages">${stages
      .map(([status, label, filter, symbol]) => {
        const count = tickets.filter((ticket) => ticket.status === status).length;
        return `<button type="button" class="journey-stage journey-${status.toLowerCase()}" data-journey-filter="${filter}" aria-label="${label}: ${count} ${count === 1 ? 'complaint' : 'complaints'}"><span class="journey-icon">${icon(symbol)}</span><strong>${count}</strong><span>${label}</span>${icon('arrow-up-right', 'journey-arrow')}</button>`;
      })
      .join('')}</div>
  </details>`;
}

const experienceOverview = overview;
overview = function () {
  return campusOverview();
};

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-journey-filter]');
  if (!button || !state.user) return;
  state.page = 'complaints';
  state.filter = button.dataset.journeyFilter;
  state.category = 'All';
  state.priority = 'All';
  state.search = '';
  state.blockFilter = '';
  state.slaFilter = '';
  state.staffFilter = null;
  state.relatedIds = null;
  render();
  window.scrollTo(0, 0);
});

if (!state.user && location.hash === '#login') renderLogin();

// Shared operating workspace. Reads existing authenticated data; never provisions records.
const campusDone = (t) => ['RESOLVED', 'CLOSED'].includes(t.status);
function campusDashboardMetrics(tickets, now = Date.now()) {
  const active = tickets.filter((t) => !campusDone(t));
  const completed = tickets.filter(campusDone);
  const average = (values) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const response = tickets
    .map((t) => {
      const first = (t.updates || [])
        .filter((u) => ['REVIEW', 'ASSIGNED', 'IN_PROGRESS'].includes(u.status))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
      return first
        ? Math.max(0, (new Date(first.createdAt) - new Date(t.createdAt)) / 3600000)
        : null;
    })
    .filter((n) => n != null && Number.isFinite(n));
  const resolution = completed
    .map((t) =>
      cfResolvedAt(t)
        ? Math.max(0, (new Date(cfResolvedAt(t)) - new Date(t.createdAt)) / 3600000)
        : null
    )
    .filter((n) => n != null && Number.isFinite(n));
  return {
    total: tickets.length,
    open: active.length,
    completed: completed.length,
    review: active.filter((t) => ['REPORTED', 'REVIEW'].includes(t.status)).length,
    progress: active.filter((t) => t.status === 'IN_PROGRESS').length,
    pending: active.filter((t) => t.status === 'PENDING_CONFIRMATION').length,
    overdue: active.filter((t) => cfSla(t).state === 'OVERDUE').length,
    unassigned: active.filter((t) => !t.assignedStaffId).length,
    high: active.filter((t) => ['HIGH', 'URGENT'].includes(t.priority)).length,
    dueToday: active.filter(
      (t) => new Date(cfSla(t).due).toDateString() === new Date(now).toDateString()
    ).length,
    pendingOld: active.filter(
      (t) =>
        t.status === 'PENDING_CONFIRMATION' &&
        now -
          new Date(
            t.updates?.filter((u) => u.status === 'PENDING_CONFIRMATION').at(-1)?.createdAt ||
              t.updatedAt
          ) >
          86400000
    ).length,
    compliance: completed.length
      ? Math.round(
          (100 * completed.filter((t) => cfSla(t).state === 'MET').length) / completed.length
        )
      : null,
    response: average(response),
    resolution: average(resolution),
  };
}
function campusKpi(label, value, context, symbol, tone = '') {
  return `<article class="ops-kpi ${tone}"><div class="ops-kpi-label">${icon(symbol)}<span>${label}</span></div><strong>${value}</strong><small>${context}</small></article>`;
}
function campusEmpty(
  title = 'No complaints found',
  message = 'Try another filter or check back after a report is submitted.'
) {
  return `<div class="ops-empty">${icon('inbox')}<strong>${title}</strong><p>${message}</p></div>`;
}
function campusOverview() {
  const tickets = myTickets(),
    m = campusDashboardMetrics(tickets);
  const hour = new Date().getHours(),
    greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = esc(state.user.name.replace(/^Dr\. /, '').split(' ')[0]);
  const heading = `<div class="ops-heading"><div><div class="ops-eyebrow">${isAdmin() ? 'CAMPUS OPERATIONS' : isStaff() ? 'MAINTENANCE WORKSPACE' : 'YOUR CAMPUS WORKSPACE'}</div><h1>${greeting}, ${name}<span class="ops-greeting" aria-hidden="true">${icon('sun')}</span></h1><p>${isAdmin() ? "Here's what needs your attention across campus today." : isStaff() ? 'Your assignments, deadlines, and next steps in one place.' : 'Report an issue, follow the repair, and confirm the fix.'}</p></div><div class="ops-heading-actions"><span class="ops-date">${new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span><button class="btn-primary" data-action="${canReport() ? 'report' : 'nav'}" ${!canReport() ? 'data-page="complaints"' : ''}>${icon(canReport() ? 'plus-lg' : 'inboxes')} ${canReport() ? 'Report an issue' : isStaff() ? 'My assignments' : 'Manage complaints'}</button></div></div>`;
  const kpis = isAdmin()
    ? [
        ['Total complaints', m.total, 'All campus reports', 'inboxes'],
        ['Open', m.open, `${m.review} need review`, 'clipboard-check'],
        ['In progress', m.progress, 'Repairs currently underway', 'tools'],
        [
          'Awaiting confirmation',
          m.pending,
          `${m.pendingOld} waiting over 24 hours`,
          'person-check',
        ],
        ['Overdue', m.overdue, 'Open reports past SLA', 'exclamation-triangle', 'ops-danger'],
      ]
    : isStaff()
      ? [
          ['Assigned to me', m.open, 'All active assignments', 'person-workspace'],
          ['In progress', m.progress, 'Repairs currently underway', 'tools'],
          ['Due today', m.dueToday, 'Based on current SLA targets', 'clock'],
          ['Completed', m.completed, 'Resolved and closed assignments', 'check2-circle'],
        ]
      : [
          ['My complaints', m.total, 'All your reports', 'inboxes'],
          ['Active', m.open, 'Repairs and reviews underway', 'activity'],
          ['Awaiting confirmation', m.pending, 'Check the fix and respond', 'person-check'],
          ['Resolved', m.completed, 'Resolved and closed reports', 'check2-circle'],
        ];
  let html =
    heading +
    `<div class="ops-kpis ${isAdmin() ? 'ops-five' : ''}">${kpis.map((x) => campusKpi(...x)).join('')}</div>`;
  if (!isAdmin()) {
    if (canReport() && m.pending)
      html += `<section class="ops-confirm-prompt">${icon('person-check')}<div><strong>${m.pending} ${m.pending === 1 ? 'repair needs' : 'repairs need'} your confirmation</strong><p>Check the work, then confirm the fix or send it back.</p></div><button class="btn-primary" data-ops-filter="pending">Review fixes ${icon('arrow-right')}</button></section>`;
    const work = isStaff()
      ? tickets.filter((t) => !campusDone(t)).sort((a, b) => cfSla(a).due - cfSla(b).due)
      : [...tickets].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return (
      html +
      `<section class="panel ops-work"><div class="panel-head"><div><h2>${isStaff() ? "Today's work" : 'My complaints'}</h2><p>${isStaff() ? 'Earliest SLA deadlines first. Open a job to record work notes.' : 'Your latest reports and their next steps.'}</p></div><button class="text-link" data-action="nav" data-page="complaints">View all ${icon('arrow-right')}</button></div>${work.length ? `<div class="ops-work-grid">${work.slice(0, 8).map(campusWorkCard).join('')}</div>` : campusEmpty(isStaff() ? "You're all caught up" : 'Your campus care starts here', isStaff() ? 'No active assignments. Completed work is available in My assignments.' : 'Use Report an issue when something needs attention.')}</section><div class="ops-secondary-grid"><section class="panel"><div class="panel-head"><h2>Recent activity</h2></div><div class="activity-list">${recentActivity()}</div></section><section class="panel"><div class="panel-head"><h2>Complaint progress</h2></div><div class="ops-workflow-wrap">${serviceJourney(tickets)}</div></section></div>`
    );
  }
  html += `<section class="panel ops-attention"><div class="ops-section-caption"><h2>Needs attention</h2><span>Where to focus next</span></div><div class="ops-attention-grid">${[
    ['overdue', 'Overdue complaints', m.overdue, 'Review now', 'exclamation-triangle', 'danger'],
    ['unassigned', 'Unassigned', m.unassigned, 'Assign staff', 'person-plus', 'neutral'],
    ['high', 'High priority', m.high, 'View complaints', 'flag', 'amber'],
    ['pending', 'Awaiting confirmation', m.pending, 'Review fixes', 'person-check', 'purple'],
  ]
    .map(
      ([key, label, count, action, ico, tone]) =>
        `<button class="ops-attention-item tone-${tone}" data-ops-filter="${key}">${icon(ico)}<div><span>${label}</span><strong>${count}</strong><small>${action} ${icon('arrow-right')}</small></div></button>`
    )
    .join('')}</div></section>`;
  html += `<div class="ops-analytics-grid"><section class="panel ops-chart-card"><div class="panel-head"><div><h2>Complaint activity</h2><p>Report volume and work milestones</p></div><label class="ops-range-label">Period<select id="ops-chart-range" aria-label="Complaint activity period">${[
    ['7', 'Last 7 days'],
    ['30', 'Last 30 days'],
    ['90', 'Last 3 months'],
    ['custom', 'Custom dates'],
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}" ${(state.activityRange || '7') === value ? 'selected' : ''}>${label}</option>`
    )
    .join(
      ''
    )}</select></label></div>${state.activityRange === 'custom' ? `<form class="ops-custom-range" id="ops-custom-range"><label>From<input type="date" name="from" required value="${esc(state.activityFrom || '')}"></label><label>To<input type="date" name="to" required value="${esc(state.activityTo || '')}"></label><button type="submit" class="btn-outline">Apply</button></form>` : ''}<div class="ops-chart-legend"><span><i class="ops-dot reported"></i>Reported</span><span><i class="ops-dot progress"></i>Started work</span><span><i class="ops-dot resolved"></i>Resolved</span></div><div class="ops-chart-box"><canvas id="ops-activity-chart" role="img" aria-label="Complaint reports, first work starts, and resolutions over the selected period"></canvas></div><p class="ops-chart-note">Work starts and resolutions reflect recorded milestones, not historical queue size.</p></section>${campusPerformance(m)}</div>`;
  html += `<div class="ops-bottom-grid"><section class="panel ops-recent"><div class="panel-head"><div><h2>Recent complaints</h2><p>Latest reports across campus</p></div><button class="text-link" data-action="nav" data-page="complaints">View all ${icon('arrow-right')}</button></div><div class="ops-table-controls"><label>${icon('search')}<input id="ops-recent-search" aria-label="Search recent complaints" placeholder="Find a complaint…" value="${esc(state.recentSearch || '')}"></label><select id="ops-recent-status" aria-label="Recent complaint status"><option value="">All statuses</option>${Object.entries(
    cfStatusMap
  )
    .filter(([key]) => key !== 'In progress')
    .map(
      ([key, value]) =>
        `<option value="${value}" ${state.recentStatus === value ? 'selected' : ''}>${key}</option>`
    )
    .join(
      ''
    )}</select><select id="ops-recent-priority" aria-label="Recent complaint priority"><option value="">All priorities</option>${['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((p) => `<option ${state.recentPriority === p ? 'selected' : ''}>${p}</option>`).join('')}</select><select id="ops-recent-date" aria-label="Recent complaint date"><option value="">Any date</option><option value="7" ${state.recentDate === '7' ? 'selected' : ''}>Last 7 days</option><option value="30" ${state.recentDate === '30' ? 'selected' : ''}>Last 30 days</option></select></div><div id="ops-recent-results">${campusRecentTable()}</div></section><div class="ops-insights"><section class="panel"><div class="panel-head"><h2>Complaints by category</h2></div>${campusDistribution('category')}</section><section class="panel"><div class="panel-head"><h2>Most reported locations</h2></div>${campusDistribution('block')}</section></div></div><section class="panel ops-recent-activity"><div class="panel-head"><h2>Recent activity</h2><button class="text-link" data-action="nav" data-page="notifications">Notifications ${icon('arrow-right')}</button></div><div class="activity-list">${recentActivity()}</div></section>`;
  return html;
}
function campusWorkCard(t) {
  const steps = [
    'REPORTED',
    'REVIEW',
    'ASSIGNED',
    'IN_PROGRESS',
    'PENDING_CONFIRMATION',
    'RESOLVED',
    'CLOSED',
  ];
  const pct = (Math.max(0, steps.indexOf(t.status)) / 6) * 100;
  return `<article class="ops-work-card"><div class="ops-work-meta"><span>CF-${t.id}</span>${priorityBadge(t.priority)}</div><h3><button class="ops-title-button" data-action="detail" data-id="${t.id}">${esc(t.title)}</button></h3><p>${icon('geo-alt')} ${esc(t.block)} · ${esc(t.room)}</p><div class="ops-work-status">${statusBadge(t.status)}<time>${date(t.createdAt)}</time></div><div class="ops-progress" role="progressbar" aria-label="Workflow stage" aria-valuemin="0" aria-valuemax="6" aria-valuenow="${Math.max(0, steps.indexOf(t.status))}" aria-valuetext="${statusLabel(t.status)}"><span style="width:${pct}%"></span></div><footer>${cfSlaBadge(t)}<button class="text-link" data-action="detail" data-id="${t.id}">${isStaff() ? (t.status === 'ASSIGNED' ? 'Start work' : t.status === 'IN_PROGRESS' ? 'Update / complete' : 'View job') : t.status === 'PENDING_CONFIRMATION' ? 'Confirm fix' : 'View details'} ${icon('arrow-right')}</button></footer></article>`;
}
function campusPerformance(m) {
  const pct = m.compliance == null ? 0 : m.compliance;
  return `<section class="panel ops-performance"><div class="panel-head"><div><h2>SLA performance</h2><p>Completed reports</p></div>${icon('shield-check')}</div><div class="ops-ring" style="--progress:${pct}%" role="img" aria-label="${m.compliance == null ? 'No completed reports to measure SLA compliance' : pct + '% SLA compliance'}"><div><strong>${m.compliance == null ? '—' : pct + '%'}</strong><span>SLA compliance</span></div></div><p class="ops-performance-note">Against configured priority deadlines</p><dl><div><dt>Average response</dt><dd>${cfDuration(m.response)}</dd></div><div><dt>Average resolution</dt><dd>${cfDuration(m.resolution)}</dd></div><div><dt>Completed reports</dt><dd>${m.completed}</dd></div></dl><button class="text-link" data-action="nav" data-page="analytics">View performance ${icon('arrow-right')}</button></section>`;
}
function campusRecentTable() {
  const search = (state.recentSearch || '').toLowerCase();
  const rows = [...myTickets()]
    .filter(
      (t) =>
        (!state.recentStatus || t.status === state.recentStatus) &&
        (!state.recentPriority || t.priority === state.recentPriority) &&
        (!state.recentDate ||
          Date.now() - new Date(t.createdAt) < Number(state.recentDate) * 86400000) &&
        (!search ||
          `${t.id} ${t.title} ${t.block} ${t.category} ${t.assignedStaff || ''}`
            .toLowerCase()
            .includes(search))
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 6);
  if (!rows.length) return campusEmpty();
  return `<div class="table-wrap"><table class="ops-complaint-table"><thead><tr>${['Complaint', 'Location', 'Category', 'Priority', 'Assigned to', 'Status', 'Reported', 'Action'].map((x) => `<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${rows
    .map(
      (t) =>
        `<tr class="ticket-row" tabindex="0" data-action="detail" data-id="${t.id}" aria-label="Open ${esc(t.title)}"><td><strong>${esc(t.title)}</strong><small>CF-${t.id}</small></td><td>${esc(t.block)}<small>${esc(t.room)}</small></td><td>${esc(t.category)}</td><td>${priorityBadge(t.priority)}</td><td><span class="ops-assignee">${
          t.assignedStaff
            ? `<span class="ops-mini-avatar" aria-hidden="true">${esc(
                t.assignedStaff
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')
              )}</span>`
            : ''
        }${esc(t.assignedStaff || 'Unassigned')}</span></td><td>${statusBadge(t.status)}</td><td><time title="${esc(new Date(t.createdAt).toLocaleString())}">${timeAgo(t.createdAt)}</time></td><td><button class="icon-btn" data-action="detail" data-id="${t.id}" aria-label="Open actions and details for CF-${t.id}">${icon('three-dots')}</button></td></tr>`
    )
    .join(
      ''
    )}</tbody></table></div><div class="table-footer">Showing ${rows.length} latest matching complaints</div>`;
}
function campusDistribution(field) {
  const totals = new Map();
  for (const t of myTickets()) {
    const key = field === 'block' ? `${t.type} · ${t.block}` : t.category;
    totals.set(key, (totals.get(key) || 0) + 1);
  }
  const groups = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 6),
    max = Math.max(1, ...groups.map((x) => x[1]));
  return groups.length
    ? `<div class="ops-distribution">${groups.map(([key, count]) => `<button class="ops-bar-row" data-ops-${field}="${esc(key)}"><span>${esc(key)}<strong>${count}</strong></span><span class="ops-bar"><span style="width:${(count / max) * 100}%"></span></span></button>`).join('')}</div>`
    : campusEmpty('No data yet', 'Insights appear when complaints are reported.');
}

const campusExistingCharts = renderCharts;
renderCharts = function () {
  if (!$('#ops-activity-chart')) {
    campusExistingCharts();
    return;
  }
  destroyCharts();
  const canvas = $('#ops-activity-chart');
  if (typeof Chart === 'undefined') {
    canvas.parentElement.innerHTML = campusEmpty(
      'Chart unavailable',
      'Check your internet connection. All complaint counts and lists remain available.'
    );
    return;
  }
  const series = campusChartSeries(
    myTickets(),
    state.activityRange || '7',
    state.activityFrom,
    state.activityTo
  );
  const muted = getComputedStyle(document.body).getPropertyValue('--muted').trim();
  const dark = document.body.classList.contains('dark');
  state.charts.push(
    new Chart(canvas, {
      type: 'line',
      data: {
        labels: series.labels,
        datasets: [
          {
            label: 'Reported',
            data: series.reported,
            borderColor: dark ? '#9cdbb2' : '#287557',
            backgroundColor: '#28755712',
            fill: true,
          },
          {
            label: 'Started work',
            data: series.progress,
            borderColor: dark ? '#dbc17f' : '#a58136',
            backgroundColor: 'transparent',
          },
          {
            label: 'Resolved',
            data: series.resolved,
            borderColor: dark ? '#76cec6' : '#2b9690',
            backgroundColor: 'transparent',
          },
        ].map((d) => ({
          ...d,
          borderWidth: 2,
          pointRadius: series.labels.length > 15 ? 0 : 2,
          pointHoverRadius: 5,
          tension: 0.28,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        animation: { duration: 200 },
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#183e32', padding: 12 },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: muted, maxTicksLimit: 8, font: { size: 12 } },
          },
          y: {
            beginAtZero: true,
            border: { display: false },
            grid: { color: '#809b8c22' },
            ticks: { color: muted, precision: 0, maxTicksLimit: 5, font: { size: 12 } },
          },
        },
      },
    })
  );
};
function campusChartSeries(tickets, range = '7', from, to, now = new Date()) {
  const end = range === 'custom' && to ? new Date(to + 'T00:00:00') : new Date(now);
  const start = range === 'custom' && from ? new Date(from + 'T00:00:00') : new Date(end);
  end.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  if (range !== 'custom' || !from) start.setDate(end.getDate() - (Number(range) || 7) + 1);
  const days = [];
  for (let d = new Date(start); d <= end && days.length < 366; d.setDate(d.getDate() + 1))
    days.push(new Date(d));
  const count = (dates) =>
    days.map(
      (d) =>
        dates.filter((value) => {
          const parsed = new Date(value);
          return parsed.toDateString() === d.toDateString();
        }).length
    );
  const work = tickets
    .map(
      (t) =>
        (t.updates || [])
          .filter((u) => u.status === 'IN_PROGRESS')
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0]?.createdAt
    )
    .filter(Boolean);
  return {
    labels: days.map((d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })),
    reported: count(tickets.map((t) => t.createdAt)),
    progress: count(work),
    resolved: count(tickets.map(cfResolvedAt).filter(Boolean)),
  };
}

const campusExistingShell = renderShell;
renderShell = function () {
  campusExistingShell();
  const sidebar = $('#sidebar');
  const unread = state.notifications.filter((n) => !n.read).length;
  const group = (label, items) =>
    `<div class="ops-nav-group"><div class="nav-label">${label}</div>${items}</div>`;
  sidebar.innerHTML = `<div class="ops-brand">${brand()}<span>Campus Maintenance Platform</span></div>${group('OVERVIEW', navItem('overview', 'Dashboard', 'grid-1x2'))}${group('OPERATIONS', navItem('complaints', isAdmin() ? 'Complaints' : isStaff() ? 'My assignments' : 'My complaints', 'inboxes') + (canReport() ? `<button class="nav-item" title="Report an issue" data-action="report">${icon('plus-square')}<span>Report an issue</span></button>` : '') + (isAdmin() ? navItem('staff', 'Maintenance team', 'people') + navItem('users', 'Users', 'person-gear') : '') + (isAdmin() || isStaff() ? navItem('board', 'Workflow board', 'kanban') : ''))}${isAdmin() ? group('INSIGHTS', navItem('analytics', 'Analytics', 'bar-chart-line') + `<button class="nav-item" title="Reports" data-ops-report>${icon('file-earmark-bar-graph')}<span>Reports</span></button>`) + group('MANAGEMENT', `<button class="nav-item" title="Categories" data-ops-settings="settings-categories">${icon('tags')}<span>Categories</span></button><button class="nav-item" title="Locations" data-ops-settings="settings-hostels">${icon('geo-alt')}<span>Locations</span></button>` + navItem('settings', 'Settings', 'sliders')) : ''}<div class="sidebar-bottom">${navItem('notifications', 'Notifications', 'bell', unread)}${navItem('profile', 'Profile', 'person-circle')}${navItem('help', 'Help', 'question-circle')}<button class="nav-item" title="Logout" data-action="logout">${icon('box-arrow-left')}<span>Logout</span></button><div class="sidebar-foot">VIT Vellore · CampusFix</div></div>`;
  const header = $('.topbar');
  header.insertAdjacentHTML(
    'afterbegin',
    '<button class="icon-btn ops-sidebar-toggle" data-ops-sidebar aria-label="Toggle sidebar" aria-controls="sidebar" aria-expanded="true">' +
      icon('list') +
      '</button>'
  );
  header.querySelector('.mobile-menu')?.remove();
  const search = header.querySelector('.global-search');
  search?.setAttribute('class', 'global-search ops-global-search');
  const field = header.querySelector('#global-search');
  if (field) {
    field.placeholder = isAdmin()
      ? 'Search complaints, users, locations…'
      : 'Search complaints, locations…';
    field.setAttribute(
      'aria-label',
      isAdmin() ? 'Search complaints, users and locations' : 'Search complaints and locations'
    );
    field.setAttribute('aria-controls', 'ops-search-results');
    field.setAttribute('aria-expanded', 'false');
  }
  if (isAdmin())
    header
      .querySelector('.top-actions')
      ?.insertAdjacentHTML(
        'afterbegin',
        `<button class="icon-btn ops-header-settings" data-action="nav" data-page="settings" aria-label="Open settings">${icon('gear')}</button>`
      );
  sidebar.insertAdjacentHTML(
    'afterend',
    '<button class="ops-drawer-backdrop" data-ops-close-drawer aria-label="Close navigation"></button>'
  );
  document.body.classList.toggle(
    'ops-collapsed',
    localStorage.getItem('campusfix-sidebar') === 'collapsed'
  );
  campusSyncNavigation();
};
function campusSyncNavigation() {
  const collapsed = document.body.classList.contains('ops-collapsed');
  const mobile = window.innerWidth <= 1000;
  const toggle = $('[data-ops-sidebar]');
  toggle?.setAttribute(
    'aria-expanded',
    String(mobile ? $('#sidebar')?.classList.contains('open') : !collapsed)
  );
  const sidebar = $('#sidebar');
  if (sidebar) {
    sidebar.inert = mobile && !sidebar.classList.contains('open');
    sidebar.setAttribute('aria-label', 'Main navigation');
  }
  const main = $('.main');
  if (main) main.inert = mobile && !!sidebar?.classList.contains('open');
  $$('.nav-item').forEach((n) => n.setAttribute('aria-label', n.title || n.textContent.trim()));
  $$('.nav-item[data-page]').forEach((n) =>
    n.setAttribute('aria-current', n.dataset.page === state.page ? 'page' : 'false')
  );
}
window.addEventListener('resize', campusSyncNavigation);
function campusApplyFilter(kind) {
  state.page = 'complaints';
  state.filter = 'All';
  state.category = 'All';
  state.priority = 'All';
  state.search = '';
  state.blockFilter = '';
  state.slaFilter = '';
  state.staffFilter = null;
  state.relatedIds = null;
  state.attentionLabel =
    kind === 'unassigned'
      ? 'Unassigned complaints'
      : kind === 'high'
        ? 'High-priority complaints'
        : null;
  if (kind === 'overdue') state.slaFilter = 'OVERDUE';
  if (kind === 'pending') state.filter = 'Awaiting confirmation';
  if (kind === 'unassigned' || kind === 'high')
    state.relatedIds = myTickets()
      .filter(
        (t) =>
          !campusDone(t) &&
          (kind === 'unassigned' ? !t.assignedStaffId : ['HIGH', 'URGENT'].includes(t.priority))
      )
      .map((t) => t.id);
  renderPage();
  window.scrollTo(0, 0);
}
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-ops-back]')) {
    closeModal();
    state.page = 'complaints';
    renderPage();
    return;
  }
  const filter = event.target.closest('[data-ops-filter]');
  if (filter) {
    campusApplyFilter(filter.dataset.opsFilter);
    return;
  }
  if (event.target.closest('[data-ops-sidebar]')) {
    if (window.innerWidth <= 1000) $('#sidebar').classList.toggle('open');
    else {
      document.body.classList.toggle('ops-collapsed');
      localStorage.setItem(
        'campusfix-sidebar',
        document.body.classList.contains('ops-collapsed') ? 'collapsed' : 'expanded'
      );
    }
    campusSyncNavigation();
    if (window.innerWidth <= 1000 && $('#sidebar').classList.contains('open'))
      $('#sidebar a, #sidebar button')?.focus();
    return;
  }
  if (event.target.closest('[data-ops-close-drawer]')) {
    $('#sidebar').classList.remove('open');
    campusSyncNavigation();
    $('[data-ops-sidebar]')?.focus();
    return;
  }
  const settings = event.target.closest('[data-ops-settings]');
  if (settings && isAdmin()) {
    state.page = 'settings';
    renderPage();
    $('#' + settings.dataset.opsSettings)?.focus();
    $('#' + settings.dataset.opsSettings)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  if (event.target.closest('[data-ops-report]') && isAdmin()) {
    state.page = 'analytics';
    renderPage();
    openModal(
      'Export report',
      `<p>Export the complaints currently selected by your complaint filters as a CSV file.</p><button class="btn-primary" data-action="export">${icon('download')} Download CSV</button>`
    );
  }
  const category = event.target.closest('[data-ops-category]');
  const block = event.target.closest('[data-ops-block]');
  if (category || block) {
    campusApplyFilter('all');
    if (category) state.category = category.dataset.opsCategory;
    else state.blockFilter = block.dataset.opsBlock.replace(' · ', '|');
    renderPage();
  }
  if (
    event.target.closest(
      '[data-action="nav"], [data-action="report"], [data-action="logout"], [data-ops-settings], [data-ops-report]'
    ) &&
    window.innerWidth <= 1000
  ) {
    $('#sidebar')?.classList.remove('open');
    campusSyncNavigation();
  }
  if (event.target.closest('[data-ops-retry]')) campusRefreshPage();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const drawerWasOpen =
      window.innerWidth <= 1000 &&
      $('[data-ops-sidebar]')?.getAttribute('aria-expanded') === 'true';
    campusSyncNavigation();
    if (drawerWasOpen) $('[data-ops-sidebar]')?.focus();
    return;
  }
  if (
    event.key === 'Tab' &&
    window.innerWidth <= 1000 &&
    $('#sidebar')?.classList.contains('open')
  ) {
    const items = [...$('#sidebar').querySelectorAll('a,button')].filter(
      (x) => x.offsetParent !== null
    );
    if (event.shiftKey && document.activeElement === items[0]) {
      event.preventDefault();
      items.at(-1)?.focus();
    } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
      event.preventDefault();
      items[0]?.focus();
    }
  }
});
function campusRefreshRecent() {
  const root = $('#ops-recent-results');
  if (root) root.innerHTML = campusRecentTable();
}
document.addEventListener('input', (e) => {
  if (e.target.id === 'ops-recent-search') {
    state.recentSearch = e.target.value;
    campusRefreshRecent();
  }
});
document.addEventListener('change', (e) => {
  const keys = {
    'ops-recent-status': 'recentStatus',
    'ops-recent-priority': 'recentPriority',
    'ops-recent-date': 'recentDate',
  };
  if (keys[e.target.id]) {
    state[keys[e.target.id]] = e.target.value;
    campusRefreshRecent();
  }
  if (e.target.id === 'ops-chart-range') {
    state.activityRange = e.target.value;
    renderPage();
  }
});
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'ops-custom-range') return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const days = (new Date(d.to) - new Date(d.from)) / 86400000;
  if (!d.from || !d.to || !Number.isFinite(days) || days < 0 || days > 365) {
    toast('Choose a date range of up to 366 days, with From before To.', true);
    return;
  }
  state.activityFrom = d.from;
  state.activityTo = d.to;
  renderPage();
});

// Loading and recovery use the original refresh/API functions and preserve active forms.
const campusExistingRefresh = refresh;
refresh = async function () {
  const root = $('#page-content'),
    show = root && !root.children.length;
  if (show)
    root.innerHTML =
      '<div class="ops-skeleton" role="status" aria-label="Loading campus workspace"><span></span><div><span></span><span></span><span></span><span></span></div><span></span></div>';
  try {
    await campusExistingRefresh();
    state.workspaceError = null;
  } catch (error) {
    state.workspaceError = error.message;
    throw error;
  }
};
async function campusRefreshPage() {
  const root = $('#page-content');
  if (root) root.innerHTML = '';
  try {
    await refresh();
    renderPage();
  } catch (error) {
    campusShowError(root, error);
  }
}
function campusShowError(root, error) {
  if (!root) return;
  root.innerHTML = `<section class="panel ops-error" role="alert">${icon('exclamation-circle')}<h1>Unable to load workspace</h1><p>${esc(error.message)}</p><button class="btn-primary" data-ops-retry>Try again ${icon('arrow-clockwise')}</button></section>`;
}
const campusExistingRenderPage = renderPage;
renderPage = function () {
  campusExistingRenderPage();
  if (state.page === 'overview' && $('#crumb')) $('#crumb').textContent = 'Dashboard';
  if (state.workspaceError) campusShowError($('#page-content'), new Error(state.workspaceError));
  campusSyncNavigation();
};

// Keep the established detail forms and action hooks, and add a readable stage track.
const campusExistingDetail = detail;
detail = function (id) {
  campusExistingDetail(id);
  const t = myTickets().find((x) => x.id === Number(id));
  if (!t) return;
  const title = $('#modal-root .detail-title');
  title?.insertAdjacentHTML(
    'beforebegin',
    `<button class="text-link ops-detail-back" data-ops-back>${icon('arrow-left')} Back to complaints</button>`
  );
  title?.insertAdjacentHTML(
    'afterend',
    `<p class="ops-detail-location">${icon('geo-alt')} ${esc(t.block)} · Floor ${esc(t.floor)} · ${esc(t.room)}</p>`
  );
  const box = $('#modal-root .modal-box');
  box?.classList.add('ops-detail-dialog');
  const track = [
    ['REPORTED', 'Reported'],
    ['REVIEW', 'Reviewed'],
    ['ASSIGNED', 'Assigned'],
    ['IN_PROGRESS', 'In progress'],
    ['PENDING_CONFIRMATION', 'Confirmation'],
    ['RESOLVED', 'Resolved'],
  ];
  const index = t.status === 'CLOSED' ? 5 : track.findIndex(([s]) => s === t.status);
  const recorded = new Set((t.updates || []).map((u) => u.status));
  const stages = track
    .map(([status, label], i) => {
      const current = i === index && !campusDone(t),
        done = recorded.has(status) || i === index;
      return `<li class="${current ? 'current' : done ? 'complete' : 'upcoming'}" ${current ? 'aria-current="step"' : ''}><span>${icon(current ? 'circle-fill' : done ? 'check2' : 'circle')}</span><small>${label}</small></li>`;
    })
    .join('');
  $('#modal-root .timeline')?.insertAdjacentHTML(
    'beforebegin',
    `<ol class="ops-stage-track" aria-label="Complaint workflow; completed stages reflect recorded history">${stages}</ol>`
  );
};
let campusModalTrigger = null;
const campusExistingOpenModal = openModal,
  campusExistingCloseModal = closeModal;
openModal = function (title, html) {
  campusModalTrigger = document.activeElement;
  campusExistingOpenModal(title, html);
};
closeModal = function () {
  campusExistingCloseModal();
  if (campusModalTrigger?.isConnected) campusModalTrigger.focus();
  else {
    const heading = $('#page-content h1');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus();
  }
};

function campusQuickSearch(query) {
  const value = query.trim().toLowerCase();
  if (!value) return '';
  const tickets = myTickets()
    .filter((t) => `${t.id} ${t.title} ${t.block} ${t.room}`.toLowerCase().includes(value))
    .slice(0, 4);
  const people = isAdmin()
    ? (state.users || [])
        .filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(value))
        .slice(0, 3)
    : [];
  const places = Object.entries(blocks)
    .flatMap(([type, names]) => names.map((name) => ({ type, name })))
    .filter((x) => `${x.type} ${x.name}`.toLowerCase().includes(value))
    .slice(0, 3);
  return `<div class="ops-search-group"><strong>Complaints</strong>${tickets.length ? tickets.map((t) => `<button type="button" data-action="detail" data-id="${t.id}"><span>${esc(t.title)}</span><small>CF-${t.id} · ${esc(t.block)}</small></button>`).join('') : '<p>No matching complaints</p>'}</div>${people.length ? `<div class="ops-search-group"><strong>People</strong>${people.map((u) => `<button type="button" data-ops-person="${u.id}"><span>${esc(u.name)}</span><small>${esc(u.email)}</small></button>`).join('')}</div>` : ''}${places.length ? `<div class="ops-search-group"><strong>Locations</strong>${places.map((x) => `<button type="button" data-ops-location="${esc(x.type + '|' + x.name)}"><span>${esc(x.type)} · ${esc(x.name)}</span></button>`).join('')}</div>` : ''}<button class="ops-search-all" type="button" data-ops-search-all>Search all complaints ${icon('arrow-right')}</button>`;
}
function campusCloseSearch() {
  $('#ops-search-results')?.remove();
  $('#global-search')?.setAttribute('aria-expanded', 'false');
}

// A restored session may finish before the following classic scripts load.
window.addEventListener('load', () => {
  if (
    state.user &&
    state.page === 'overview' &&
    !$('.ops-heading') &&
    !$('#modal-root').children.length
  )
    render();
});
document.addEventListener(
  'input',
  (e) => {
    if (e.target.id !== 'global-search') return;
    e.stopImmediatePropagation();
    campusCloseSearch();
    const html = campusQuickSearch(e.target.value);
    if (html) {
      e.target
        .closest('.topbar')
        .insertAdjacentHTML(
          'beforeend',
          `<div id="ops-search-results" class="ops-search-results" aria-label="Search results">${html}</div>`
        );
      e.target.setAttribute('aria-expanded', 'true');
    }
  },
  true
);
function campusOpenSearchResults() {
  const query = $('#global-search')?.value || '';
  campusApplyFilter('all');
  state.search = query;
  renderPage();
  campusCloseSearch();
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const fromResults = e.target.closest('#ops-search-results');
    campusCloseSearch();
    if (fromResults) $('#global-search')?.focus();
  }
  if (e.key === 'ArrowDown' && e.target.id === 'global-search' && $('#ops-search-results')) {
    e.preventDefault();
    $('#ops-search-results button')?.focus();
  } else if (['ArrowDown', 'ArrowUp'].includes(e.key) && e.target.closest('#ops-search-results')) {
    e.preventDefault();
    const buttons = $$('#ops-search-results button'),
      index = buttons.indexOf(e.target);
    buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }
  if (e.key === 'Enter' && e.target.id === 'global-search') {
    e.preventDefault();
    campusOpenSearchResults();
  }
});
document.addEventListener('click', (e) => {
  const person = e.target.closest('[data-ops-person]'),
    place = e.target.closest('[data-ops-location]');
  if (person && isAdmin()) {
    const user = state.users.find((u) => Number(u.id) === Number(person.dataset.opsPerson));
    if (user) {
      state.userSearch = user.email;
      state.page = 'users';
      renderPage();
    }
  }
  if (place) {
    campusApplyFilter('all');
    state.blockFilter = place.dataset.opsLocation;
    renderPage();
  }
  if (e.target.closest('[data-ops-search-all]')) campusOpenSearchResults();
  if (!e.target.closest('#global-search')) campusCloseSearch();
});

// Reset attention-view labels before the existing navigation handlers render a new page.
document.addEventListener(
  'click',
  (e) => {
    if (
      e.target.closest(
        '[data-action="nav"], [data-action="reset-filters"], [data-action="cf-related"]'
      )
    )
      state.attentionLabel = null;
  },
  true
);
