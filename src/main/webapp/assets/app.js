/* CampusFix UI. Production requests use HttpSession; preview data is isolated and explicitly labelled. */
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const icon = (name, cls = '') => `<i class="bi bi-${name} ${cls}" aria-hidden="true"></i>`;
const nice = (s) =>
  String(s || '')
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
const statuses = [
  'REPORTED',
  'REVIEW',
  'ASSIGNED',
  'IN_PROGRESS',
  'PENDING_CONFIRMATION',
  'RESOLVED',
  'CLOSED',
];
const statusLabel = (s) =>
  ({
    REPORTED: 'Submitted',
    REVIEW: 'Under review',
    ASSIGNED: 'Assigned',
    IN_PROGRESS: 'In progress',
    PENDING_CONFIRMATION: 'Awaiting confirmation',
    RESOLVED: 'Resolved',
    CLOSED: 'Closed',
  })[s] || s;
const categories = [
  'Electrical',
  'Plumbing',
  'Internet & Wi-Fi',
  'Furniture',
  'Housekeeping',
  'Air Conditioning',
  'Infrastructure',
  'Other',
];
const catIcons = [
  'lightning-charge',
  'droplet',
  'wifi',
  'grid-3x3-gap',
  'stars',
  'snow',
  'building',
  'grid',
];
const blocks = {
  Hostel: ['K', 'L', 'M', 'N', 'Q', 'R', 'S', 'T'],
  Academic: ['PRP', 'SJT', 'TT', 'SMV'],
};
const roles = ['STUDENT', 'FACULTY', 'ADMIN', 'STAFF'];
const roleNames = {
  STUDENT: 'Student',
  FACULTY: 'Faculty',
  ADMIN: 'Administrator',
  STAFF: 'Maintenance Staff',
};
const names = {
  STUDENT: 'Aryan Aman',
  FACULTY: 'Dr. Meera Nair',
  ADMIN: 'Ananya Sharma',
  STAFF: 'Ravi Kumar',
};
let state = {
  user: null,
  demo: false,
  page: 'overview',
  tickets: [],
  notifications: [],
  staff: [],
  filter: 'All',
  search: '',
  category: 'All',
  priority: 'All',
  view: 'table',
  charts: [],
  rating: 5,
};
let photoFiles = [],
  photoPreviews = [];
const date = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const timeAgo = (d) => {
  const h = Math.max(0, Math.floor((Date.now() - new Date(d)) / 3600000));
  return h < 1 ? 'Just now' : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};
const brand = () =>
  `<a href="#" class="brand" data-action="home" aria-label="CampusFix home"><img class="campusfix-symbol" src="assets/campusfix-logo.svg?v=20261022-indigo" alt="" width="42" height="42"><div class="campusfix-wordmark">campus<span>fix</span></div></a>`;
const campusArt = () =>
  `<div class="campus-art" aria-hidden="true"><span class="sun"></span><div class="building b1"></div><div class="building b2"></div><div class="building b3"></div><div class="tree"></div></div>`;
const statusBadge = (s) =>
  `<span class="badge-status s-${s.toLowerCase()}">${statusLabel(s)}</span>`;
const priorityBadge = (p) =>
  `<span class="badge-priority p-${p.toLowerCase()}">${icon('flag-fill')} ${nice(p)}</span>`;
const isAdmin = () => state.user?.role === 'ADMIN';
const isStaff = () => state.user?.role === 'STAFF';
const canReport = () => ['STUDENT', 'FACULTY'].includes(state.user?.role);
const myTickets = () =>
  state.tickets.filter(
    (t) =>
      !t.deletedAt &&
      (isAdmin() || (isStaff() ? t.assignedStaffId === state.user.id : t.userId === state.user.id))
  );
function sampleData() {
  const now = Date.now(),
    ago = (h) => new Date(now - h * 3600000).toISOString();
  const specs = [
    [
      'Ceiling fan not working',
      'Electrical',
      'Hostel',
      'K',
      '3',
      '312',
      'IN_PROGRESS',
      'HIGH',
      48,
      4,
    ],
    [
      'Water leakage in washroom',
      'Plumbing',
      'Hostel',
      'K',
      '2',
      'Common washroom',
      'REVIEW',
      'MEDIUM',
      24,
      null,
    ],
    [
      'Wi-Fi connection unstable',
      'Internet & Wi-Fi',
      'Academic',
      'SJT',
      '2',
      'Lab 204',
      'RESOLVED',
      'MEDIUM',
      72,
      5,
    ],
    [
      'Broken chair in classroom',
      'Furniture',
      'Academic',
      'PRP',
      '1',
      'Room 108',
      'ASSIGNED',
      'LOW',
      36,
      4,
    ],
    [
      'AC not cooling properly',
      'Air Conditioning',
      'Academic',
      'TT',
      '3',
      'Lab 301',
      'RESOLVED',
      'HIGH',
      120,
      4,
    ],
    [
      'Corridor lights flickering',
      'Electrical',
      'Hostel',
      'K',
      '3',
      'Corridor',
      'CLOSED',
      'MEDIUM',
      168,
      4,
    ],
    [
      'Drinking water filter needs service',
      'Plumbing',
      'Hostel',
      'M',
      '1',
      'Water point',
      'REPORTED',
      'HIGH',
      5,
      null,
    ],
    ['Unclean common area', 'Housekeeping', 'Hostel', 'N', '0', 'Lobby', 'REVIEW', 'LOW', 8, null],
    [
      'Projector power socket damaged',
      'Electrical',
      'Academic',
      'SMV',
      '2',
      'Room 212',
      'IN_PROGRESS',
      'URGENT',
      12,
      4,
    ],
    [
      'Water leakage near staircase',
      'Plumbing',
      'Hostel',
      'K',
      '2',
      'Staircase',
      'ASSIGNED',
      'HIGH',
      28,
      5,
    ],
    [
      'Washroom tap leaking',
      'Plumbing',
      'Hostel',
      'K',
      '2',
      'Common washroom',
      'CLOSED',
      'LOW',
      240,
      5,
    ],
    [
      'Lab desk requires repair',
      'Furniture',
      'Academic',
      'SJT',
      '1',
      'Lab 101',
      'RESOLVED',
      'LOW',
      80,
      4,
    ],
  ];
  return specs.map((s, i) => ({
    id: 1042 - i,
    title: s[0],
    category: s[1],
    type: s[2],
    block: s[3],
    floor: s[4],
    room: s[5],
    status: s[6],
    priority: s[7],
    createdAt: ago(s[8]),
    updatedAt: ago(Math.max(1, s[8] - 18)),
    userId: i < 6 ? 1 : 2,
    reporter: i < 6 ? 'Aryan Aman' : 'Dr. Meera Nair',
    assignedStaffId: s[9],
    assignedStaff: s[9] === 4 ? 'Ravi Kumar' : s[9] === 5 ? 'Suresh Patel' : null,
    description: [
      'The ceiling fan in our room has stopped working. The switch is on, but the fan does not rotate. Please arrange an inspection.',
      'Water has been leaking continuously since this morning. The floor is wet and needs attention.',
      'The network keeps disconnecting during lab sessions and makes it difficult to complete our work.',
    ][i % 3],
    attachments: [],
    rating: s[6] === 'CLOSED' ? 5 : null,
    feedback: s[6] === 'CLOSED' ? 'Quick and professional service. Thank you!' : null,
    updates: [
      {
        status: 'REPORTED',
        remarks: 'Complaint submitted. Our campus team will review it shortly.',
        actor: i < 6 ? 'Aryan Aman' : 'Dr. Meera Nair',
        createdAt: ago(s[8]),
      },
      ...(s[6] !== 'REPORTED'
        ? [
            {
              status: 'REVIEW',
              remarks: 'Reviewed by campus administration.',
              actor: 'Ananya Sharma',
              createdAt: ago(Math.max(1, s[8] - 1)),
            },
          ]
        : []),
      ...(['ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(s[6])
        ? [
            {
              status: 'ASSIGNED',
              remarks: 'Assigned to the maintenance team.',
              actor: 'Ananya Sharma',
              createdAt: ago(Math.max(1, s[8] - 3)),
            },
          ]
        : []),
      ...(['IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(s[6])
        ? [
            {
              status: s[6] === 'CLOSED' ? 'RESOLVED' : s[6],
              remarks:
                s[6] === 'IN_PROGRESS'
                  ? 'Inspection complete. Replacement parts are being arranged.'
                  : 'The issue has been fixed and verified.',
              actor: s[9] === 4 ? 'Ravi Kumar' : 'Suresh Patel',
              createdAt: ago(Math.max(1, s[8] - 18)),
            },
          ]
        : []),
      ...(s[6] === 'CLOSED'
        ? [
            {
              status: 'CLOSED',
              remarks: 'Feedback received. Complaint closed.',
              actor: 'Aryan Aman',
              createdAt: ago(Math.max(1, s[8] - 24)),
            },
          ]
        : []),
    ],
  }));
}
async function api(path, options = {}) {
  const headers = { ...options.headers };
  if (options.body && !(options.body instanceof FormData))
    headers['Content-Type'] = 'application/json';
  if (state.csrf) headers['X-CSRF-Token'] = state.csrf;
  const response = await fetch(`api/${path}`, { credentials: 'same-origin', ...options, headers });
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error(
      'The server is unavailable. Start the Tomcat application or use the labelled demo.'
    );
  }
  if (!response.ok) throw Error(data.error || 'Unable to complete this request.');
  return data;
}
async function refresh() {
  if (state.demo) {
    saveDemo();
    return;
  }
  const data = await api('complaints');
  state.tickets = data.tickets;
  state.staff = data.staff || [];
  state.notifications = data.notifications || [];
  if (data.config && typeof applyConfig === 'function') applyConfig(data.config);
}
function saveDemo() {
  if (state.demo)
    try {
      localStorage.setItem(
        'campusfix-demo-v1',
        JSON.stringify({ tickets: state.tickets, notifications: state.notifications })
      );
    } catch {
      toast('Preview storage is full. Changes remain in this session.');
    }
}
function demoLogin(role) {
  state.demo = true;
  state.user = {
    id: { STUDENT: 1, FACULTY: 2, ADMIN: 3, STAFF: 4 }[role],
    name: names[role],
    role,
    email: `${role.toLowerCase()}@vit.ac.in`,
  };
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem('campusfix-demo-v1'));
  } catch {}
  state.tickets = saved?.tickets || sampleData();
  state.notifications = saved?.notifications || [
    {
      id: 1,
      message: 'Welcome to CampusFix. Your campus workspace is ready.',
      createdAt: new Date().toISOString(),
      read: false,
    },
  ];
  state.staff = [
    { id: 4, name: 'Ravi Kumar', specialization: 'Electrical & Infrastructure' },
    { id: 5, name: 'Suresh Patel', specialization: 'Plumbing & Housekeeping' },
  ];
  state.page = 'overview';
  state.filter = 'All';
  state.search = '';
  render();
  window.scrollTo(0, 0);
  toast(`${roleNames[role]} demo opened. Changes are saved in this browser.`);
}
function toast(message, error = false) {
  const el = document.createElement('div');
  el.className = 'toast-msg';
  el.setAttribute('role', error ? 'alert' : 'status');
  el.innerHTML = icon(error ? 'exclamation-circle' : 'check-circle') + esc(message);
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 5500);
}
function destroyCharts() {
  state.charts.forEach((c) => c.destroy());
  state.charts = [];
}
function render() {
  destroyCharts();
  $('#modal-root').innerHTML = '';
  document.body.style.overflow = '';
  const hash = location.hash.slice(1);
  if (!state.user) {
    if (hash === 'signup' && typeof renderSignup === 'function') renderSignup();
    else if (hash === 'login') renderLogin();
    else renderLanding();
    return;
  }
  renderShell();
  renderPage();
}
function renderLanding() {
  $('#app').innerHTML =
    `<div class="landing fade-in"><nav class="landing-nav">${brand()}<div class="landing-links"><a href="#features">The experience</a><a href="#how-it-works">How it works</a><button class="icon-btn" data-action="theme" aria-label="Toggle dark mode">${icon('moon')}</button><button class="btn-primary" data-action="login">Campus login ${icon('arrow-up-right')}</button></div></nav><section class="landing-hero"><div><div class="eyebrow">${icon('geo-alt')} BUILT FOR VIT. BUILT FOR YOU.</div><h1>A better campus.<br>Starts with <em>you.</em></h1><p>A flickering light. A leaking tap. A Wi-Fi dead zone. Turn everyday campus issues into real improvements, with a little help from CampusFix.</p><div class="heading-actions"><button class="btn-primary" data-action="login">Report an issue ${icon('arrow-right')}</button><button class="btn-outline" data-action="demo" data-role="STUDENT">Explore the demo</button></div><div class="hero-note">${icon('check-circle')} One campus. One connected community.</div></div><div class="hero-visual">${campusArt()}<span class="hero-tag">VIT · VELLORE</span><div class="hero-floating first">${icon('check-circle-fill')}<strong>Your voice makes a difference.</strong><small>From your room to the whole campus.</small></div><div class="hero-floating second"><strong>${icon('tools')} Every issue has a next step.</strong><small>Report. Track. Resolve. Together.</small></div></div></section><section id="features" class="landing-section"><div class="eyebrow muted">SMALL REPORTS. MEANINGFUL CHANGE.</div><h2>Campus care, without the runaround.</h2><p class="muted">Everything you need to get things working again.</p><div class="feature-grid">${[
      [
        'camera',
        'Show us what’s wrong',
        'Add photos, select your exact VIT location, and tell us what needs attention.',
      ],
      [
        'signpost-split',
        'The right people, on it',
        'Campus admins review every report and connect it with the right maintenance team.',
      ],
      [
        'clock-history',
        'No more guessing',
        'Follow every update from the first review to the final fix, in one clear timeline.',
      ],
      [
        'star',
        'Close the loop',
        'Rate the fix and share your feedback. Better service starts with a conversation.',
      ],
    ]
      .map((f) => `<article>${icon(f[0])}<h3>${f[1]}</h3><p>${f[2]}</p></article>`)
      .join(
        ''
      )}</div></section><section id="how-it-works" class="landing-section"><div class="eyebrow muted">A CLEAR PATH TO A BETTER CAMPUS</div><h2>From “something’s broken” to “all fixed”.</h2><div class="workflow-line">${['01 · Report', '02 · Admin review', '03 · Prioritize', '04 · Assign staff', '05 · In progress', '06 · Resolved', '07 · Your feedback', '08 · Closed'].map((x) => `<span>${x}</span>`).join('')}</div><p class="muted" style="margin-top:25px;font-size:12px">Serving K, L, M, N, Q, R, S and T hostels · PRP, SJT, TT and SMV academic blocks.</p></section><footer class="landing-footer"><span>© ${new Date().getFullYear()} CampusFix · Made for the VIT community</span><span>Better spaces. Better campus days.</span></footer></div>`;
}
function renderLogin() {
  $('#app').innerHTML =
    `<div class="login-shell fade-in"><aside class="login-art">${brand()}<div><div class="eyebrow" style="color:#8ea99d">YOUR CAMPUS. CONNECTED.</div><h1>Good campus days<br>start here.</h1><p>A shared space to care for the places where we learn, live, and grow.</p>${campusArt()}</div><small class="muted">CampusFix · VIT Vellore</small></aside><main class="login-form"><div class="login-inner"><a class="text-link" href="#">${icon('arrow-left')} Back to home</a><h1 style="margin-top:30px">Welcome back.</h1><p class="muted" style="font-size:12px">Sign in to your campus workspace.</p><form id="login-form"><div class="field"><label for="email">VIT email address</label><input id="email" name="email" type="email" placeholder="you@vit.ac.in" required autocomplete="username"></div><div class="field"><label for="password">Password</label><input id="password" name="password" type="password" placeholder="Enter your password" required autocomplete="current-password"></div><p style="font-size:10px;color:var(--muted)">Your workspace is selected automatically using your assigned campus role.</p><button class="btn-primary" style="width:100%" type="submit">Sign in ${icon('arrow-right')}</button></form><div class="demo-entry">Just looking around? Explore with sample data.<div class="role-choices">${roles.map((r, i) => `<button class="role-choice" data-action="demo" data-role="${r}">${icon(['mortarboard', 'person-workspace', 'shield-check', 'tools'][i])}${r === 'STAFF' ? 'Staff' : nice(r)}</button>`).join('')}</div><small>Demo mode uses browser storage and is separate from the live application.</small></div><p class="muted" style="font-size:10px;text-align:center;margin-top:25px">Need an account? Contact your campus administrator.</p></div></main></div>`;
}
function navItem(page, label, ico, count) {
  return `<button class="nav-item ${state.page === page ? 'active' : ''}" data-action="nav" data-page="${page}">${icon(ico)}<span>${label}</span>${count ? `<span class="nav-count">${count}</span>` : ''}</button>`;
}
function renderShell() {
  const unread = state.notifications.filter((n) => !n.read).length;
  $('#app').innerHTML =
    `<aside class="sidebar" id="sidebar">${brand()}<div class="campus-chip">${icon('buildings')}<div>VIT Vellore</div>${icon('chevron-down', 'ms-auto')}</div><div class="nav-label">WORKSPACE</div>${navItem('overview', 'Overview', 'grid-1x2')}${navItem('complaints', isAdmin() ? 'All complaints' : isStaff() ? 'Assigned to me' : 'My complaints', 'inboxes', myTickets().filter((t) => !['RESOLVED', 'CLOSED'].includes(t.status)).length)}${canReport() ? navItem('report', 'Report an issue', 'plus-square') : ''}${isAdmin() || isStaff() ? navItem('board', 'Workflow board', 'kanban') : ''}${isAdmin() ? navItem('staff', 'Maintenance team', 'people') : ''}${isAdmin() ? navItem('analytics', 'Analytics & reports', 'bar-chart-line') : ''}${navItem('notifications', 'Notifications', 'bell', unread)}<div class="nav-label" style="margin-top:27px">PERSONAL</div>${navItem('profile', 'My profile', 'person-circle')}${navItem('help', 'Help & support', 'question-circle')}<div class="sidebar-bottom"><div class="campus-note">${icon('flower1')}<strong>A little care goes a long way.</strong><p>Every issue you report helps build a better campus for everyone.</p></div><button class="nav-item" data-action="logout">${icon('box-arrow-left')} Sign out</button><div class="sidebar-foot"><span>CampusFix</span><span>${state.demo ? 'DEMO' : 'VIT COMMUNITY'}</span></div></div></aside><main class="main"><header class="topbar"><div style="display:flex;align-items:center;gap:8px"><button class="icon-btn mobile-menu" data-action="menu" aria-label="Open navigation">${icon('list')}</button><div class="breadcrumb"><span>Workspace</span><span>/</span><strong id="crumb">Overview</strong></div></div><div class="top-actions"><label class="global-search">${icon('search')}<input id="global-search" placeholder="Search complaints…" aria-label="Search complaints"><kbd>⌘ K</kbd></label><button class="icon-btn" data-action="theme" aria-label="Toggle dark mode">${icon('moon')}</button><button class="icon-btn ${unread ? 'notification-dot' : ''}" data-action="nav" data-page="notifications" aria-label="Notifications">${icon('bell')}</button><button class="user-menu" style="border-top:0;border-right:0;border-bottom:0;background:none;text-align:left;color:var(--ink)" data-action="nav" data-page="profile"><span class="avatar">${esc(
      state.user.name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
    )}</span><div><strong>${esc(state.user.name)}</strong><small>${roleNames[state.user.role]}</small></div>${icon('chevron-down')}</button></div></header><div class="content fade-in" id="page-content"></div></main>`;
}
function pageHeading(title, subtitle, action = true) {
  title =
    {
      overview: 'Dashboard',
      complaints: isAdmin() ? 'Complaints' : isStaff() ? 'My assignments' : 'My complaints',
      board: 'Workflow',
      analytics: 'Analytics',
      staff: 'Maintenance team',
      users: 'Users',
      settings: 'Settings',
      notifications: 'Notifications',
      profile: 'My profile',
      help: 'Help',
    }[state.page] || title;
  return `<div class="page-heading"><div><h1>${title}</h1></div><div class="heading-actions">${action ? `<span class="date-label">${icon('calendar4')} ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>${canReport() ? `<button class="btn-primary" data-action="report">${icon('plus-lg')} Report an issue</button>` : `<button class="btn-outline" data-action="export">${icon('download')} Export report</button>`}` : ''}</div></div>`;
}
function renderPage() {
  destroyCharts();
  const p = $('#page-content');
  const labels = {
    overview: 'Overview',
    complaints: isAdmin() ? 'All complaints' : isStaff() ? 'Assigned to me' : 'My complaints',
    board: 'Workflow board',
    analytics: 'Analytics & reports',
    staff: 'Maintenance team',
    notifications: 'Notifications',
    profile: 'My profile',
    help: 'Help & support',
  };
  $('#crumb').textContent = labels[state.page] || 'Overview';
  let content = '';
  if (state.page === 'overview') content = overview();
  else if (state.page === 'complaints') content = complaints();
  else if (state.page === 'board') content = board();
  else if (state.page === 'analytics' && isAdmin()) content = analytics();
  else if (state.page === 'staff' && isAdmin()) content = staffPage();
  else if (state.page === 'notifications') content = notifications();
  else if (state.page === 'profile') content = profile();
  else if (state.page === 'help') content = help();
  else content = overview();
  p.innerHTML =
    content +
    `<footer class="footer"><span>© ${new Date().getFullYear()} CampusFix. Built for the VIT community.</span><span>${state.demo ? 'Sample data · Browser demo' : `${icon('circle-fill')} Connected to campus services`}</span></footer>`;
  if (state.page === 'overview' || state.page === 'analytics') requestAnimationFrame(renderCharts);
  $$('.nav-item[data-page]').forEach((el) =>
    el.classList.toggle('active', el.dataset.page === state.page)
  );
}
function stats() {
  const ts = myTickets();
  return [
    {
      label: isAdmin() ? 'Total complaints' : 'Total reported',
      value: ts.length,
      ico: 'inboxes',
      foot: 'Across your campus workspace',
    },
    {
      label: 'Awaiting action',
      value: ts.filter((t) =>
        ['REPORTED', 'REVIEW', 'ASSIGNED', 'PENDING_CONFIRMATION'].includes(t.status)
      ).length,
      ico: 'hourglass-split',
      foot: 'Reported, reviewed or assigned',
    },
    {
      label: 'In progress',
      value: ts.filter((t) => t.status === 'IN_PROGRESS').length,
      ico: 'tools',
      foot: 'Our team is working on it',
    },
    {
      label: 'Resolved',
      value: ts.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.status)).length,
      ico: 'check2-circle',
      foot: 'Better spaces, one fix at a time',
    },
  ]
    .map(
      (x) =>
        `<article class="stat-card"><div class="stat-top">${x.label}<span class="stat-icon">${icon(x.ico)}</span></div><div class="stat-value">${x.value.toString().padStart(2, '0')}</div><div class="stat-foot">${x.ico === 'check2-circle' ? '<span>' + icon('check2') + '</span>' : ''}${x.foot}</div></article>`
    )
    .join('');
}
function overview() {
  const first = esc(state.user.name.replace(/^Dr\. /, '').split(' ')[0]);
  return (
    pageHeading(
      `Hello, ${first} <span style="font-size:23px">✳</span>`,
      `Here’s what’s happening ${isAdmin() ? 'across your campus' : isStaff() ? 'with your assignments' : 'with your campus today'}.`
    ) +
    `<div class="stat-grid">${stats()}</div><div class="dashboard-grid"><div><section class="panel"><div class="panel-head"><div><h2>${isAdmin() ? 'Recent complaints' : isStaff() ? 'Your assignments' : 'My recent complaints'}</h2></div><button class="text-link" data-action="nav" data-page="complaints">View all ${icon('arrow-right')}</button></div>${filters(true)}${ticketTable(filteredTickets().slice(0, 5))}<div class="table-footer"><span>Showing ${Math.min(5, filteredTickets().length)} of ${filteredTickets().length} complaints</span><span>Updated just now</span></div></section><section class="panel chart-panel"><div class="panel-head"><div><h2>Complaint activity</h2><p>Last 7 days</p></div><div class="chart-legend"><span><i class="legend-dot" style="background:#6367e7"></i>Reported</span><span><i class="legend-dot" style="background:#26a88a"></i>Resolved</span></div></div><div class="chart-box"><canvas id="activity-chart" aria-label="Complaints reported and resolved during the last seven days" role="img"></canvas></div></section></div><aside class="dashboard-aside"><section class="panel"><div class="panel-head"><h2>Recent activity</h2><span class="muted">${icon('clock-history')}</span></div><div class="activity-list">${recentActivity()}</div><div style="padding:13px 22px;border-top:1px solid var(--line)"><button class="text-link" data-action="nav" data-page="notifications">All notifications ${icon('arrow-right')}</button></div></section><section class="help-card"><div class="help-icon">${icon('chat-dots')}</div><h3>A little help?</h3><p>Not sure where to start? We’re here to help you find the right next step.</p><button data-action="nav" data-page="help">Visit help center ${icon('arrow-up-right')}</button></section></aside></div>`
  );
}
function recentActivity() {
  const activities = myTickets()
    .flatMap((t) => {
      const update = (t.updates || []).at(-1);
      return update ? [{ ...update, title: t.title, id: t.id }] : [];
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 4);
  return activities.length
    ? activities
        .map(
          (a) =>
            `<div class="activity-item"><span class="activity-icon">${icon(a.status === 'RESOLVED' || a.status === 'CLOSED' ? 'check2' : a.status === 'IN_PROGRESS' ? 'tools' : 'clock')}</span><div><strong>${esc(a.title)}</strong><p>${statusLabel(a.status)} · CF-${a.id}</p><time>${timeAgo(a.createdAt)}</time></div></div>`
        )
        .join('')
    : `<div class="empty">Your campus story starts with your first report.</div>`;
}
function filters(compact = false) {
  return `<div class="filter-row"><div class="tabs">${['All', 'Open', 'In progress', 'Resolved'].map((f) => `<button class="tab ${state.filter === f ? 'active' : ''}" data-action="filter" data-filter="${f}">${f}${f === 'All' ? `<b>${myTickets().length}</b>` : ''}</button>`).join('')}</div><div style="display:flex;gap:7px"><select class="small-select" id="category-filter" aria-label="Filter by category"><option value="All">${compact ? 'All categories' : 'Category: All'}</option>${categories.map((c) => `<option ${state.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>${!compact ? `<select class="small-select" id="priority-filter" aria-label="Filter by priority"><option value="All">Priority: All</option>${['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((c) => `<option value="${c}" ${state.priority === c ? 'selected' : ''}>${nice(c)}</option>`).join('')}</select>` : ''}</div></div>`;
}
function filteredTickets() {
  return myTickets()
    .filter(
      (t) =>
        (state.filter === 'All' ||
          (state.filter === 'Open' && !['RESOLVED', 'CLOSED'].includes(t.status)) ||
          (state.filter === 'In progress' && t.status === 'IN_PROGRESS') ||
          (state.filter === 'Resolved' && ['RESOLVED', 'CLOSED'].includes(t.status))) &&
        (state.category === 'All' || t.category === state.category) &&
        (state.priority === 'All' || t.priority === state.priority) &&
        (!state.search ||
          `${t.id} ${t.title} ${t.block} ${t.room} ${t.category} ${t.status}`
            .toLowerCase()
            .includes(state.search.toLowerCase()))
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
function ticketTable(tickets) {
  if (!tickets.length)
    return `<div class="empty">${icon('inbox')}No complaints found.<p style="font-size:11px">Try another filter or report your first issue.</p></div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Complaint</th><th>Location</th><th>Status</th><th>Priority</th><th></th></tr></thead><tbody>${tickets.map((t) => `<tr class="ticket-row" data-action="detail" data-id="${t.id}" tabindex="0" aria-label="Open ${esc(t.title)}"><td><div class="ticket-name"><span class="category-icon">${icon(catIcons[categories.indexOf(t.category)] || 'grid')}</span><div><strong>${esc(t.title)}</strong><small>CF-${t.id} <span style="margin:0 5px">·</span> ${date(t.createdAt)}</small></div></div></td><td class="location-cell">${esc(t.block)} ${t.type === 'Hostel' ? 'Block' : 'Building'}<small>${esc(t.room)} · Floor ${esc(t.floor)}</small></td><td>${statusBadge(t.status)}</td><td>${priorityBadge(t.priority)}</td><td>${icon('chevron-right', 'muted')}</td></tr>`).join('')}</tbody></table></div>`;
}
function complaints() {
  return (
    pageHeading(
      isAdmin()
        ? 'Every issue. One workspace.'
        : isStaff()
          ? 'Your work, in focus.'
          : 'Your campus, your reports.',
      'Track progress, follow updates, and keep the conversation going.'
    ) +
    `<section class="panel"><div class="panel-head"><div><h2>${isAdmin() ? 'All campus complaints' : 'Complaint history'}</h2><p>${state.demo ? 'Sample records for exploring the complete workflow.' : 'Your latest campus maintenance records.'}</p></div><label class="global-search" style="display:flex;min-width:180px">${icon('search')}<input id="list-search" value="${esc(state.search)}" placeholder="Search complaints…" aria-label="Search complaint history"></label></div>${filters()}${ticketTable(filteredTickets())}<div class="table-footer"><span>${filteredTickets().length} complaints found</span><button class="text-link" data-action="reset-filters">Reset filters</button></div></section>`
  );
}
function board() {
  return (
    pageHeading(
      'A clear view of what’s next.',
      'Move campus issues forward with the right people and clear updates.'
    ) +
    `<div class="board">${[
      ['REPORTED', 'REVIEW'],
      ['ASSIGNED'],
      ['IN_PROGRESS', 'PENDING_CONFIRMATION'],
      ['RESOLVED', 'CLOSED'],
    ]
      .map((ss, i) => {
        const ts = myTickets().filter((t) => ss.includes(t.status));
        return `<section class="board-col"><h3>${['Needs review', 'Assigned', 'In progress', 'Resolved'][i]} <span class="muted">${ts.length}</span></h3>${ts.map((t) => `<article class="board-ticket" data-action="detail" data-id="${t.id}" tabindex="0">${priorityBadge(t.priority)}<h4>${esc(t.title)}</h4><p>${esc(t.block)} Block · ${esc(t.room)}</p>${ss.length > 1 ? statusBadge(t.status) : ''}<footer><span>CF-${t.id}</span><span>${t.assignedStaff ? esc(t.assignedStaff.split(' ')[0]) : 'Unassigned'}</span></footer></article>`).join('') || '<p class="muted" style="font-size:11px;padding:15px">Nothing here right now.</p>'}</section>`;
      })
      .join('')}</div>`
  );
}
function analytics() {
  const ts = myTickets(),
    resolved = ts.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.status)),
    rated = ts.filter((t) => t.rating);
  const groups = {};
  ts.filter((t) => Date.now() - new Date(t.createdAt) < 30 * 86400000).forEach((t) => {
    const key = `${t.category}|${t.type}|${t.block}|${t.floor}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  const recurring = Object.values(groups)
    .filter((g) => g.length >= 2)
    .sort((a, b) => b.length - a.length);
  return (
    pageHeading(
      'A healthier campus, in numbers.',
      'Spot patterns, understand demand, and make every fix count.'
    ) +
    `<div class="stat-grid">${[
      {
        label: 'Resolution rate',
        value: ts.length ? Math.round((resolved.length / ts.length) * 100) + '%' : '0%',
        foot: 'Resolved and closed complaints',
        ico: 'check2-circle',
      },
      {
        label: 'Community rating',
        value: rated.length
          ? (rated.reduce((a, t) => a + t.rating, 0) / rated.length).toFixed(1) + '/5'
          : '—',
        foot: `From ${rated.length} reviews`,
        ico: 'star',
      },
      {
        label: 'Recurring clusters',
        value: recurring.length,
        foot: 'Same category, block and floor',
        ico: 'arrow-repeat',
      },
      {
        label: 'Active complaints',
        value: ts.length - resolved.length,
        foot: 'Awaiting resolution',
        ico: 'activity',
      },
    ]
      .map(
        (x) =>
          `<article class="stat-card"><div class="stat-top">${x.label}<span class="stat-icon">${icon(x.ico)}</span></div><div class="stat-value">${x.value}</div><div class="stat-foot">${x.foot}</div></article>`
      )
      .join(
        ''
      )}</div><div class="analytics-grid"><section class="panel chart-panel"><div class="panel-head"><div><h2>Campus activity</h2><p>Reported and resolved in the last seven days</p></div></div><div class="chart-box"><canvas id="activity-chart" role="img" aria-label="Campus complaint activity"></canvas></div></section><section class="panel"><div class="panel-head"><h2>Complaints by category</h2></div><div class="chart-box"><canvas id="category-chart" role="img" aria-label="Complaints by category"></canvas></div></section></div><section class="panel"><div class="panel-head"><div><h2>Recurring issue detection</h2><p>Two or more reports in the same category, block and floor during the last 30 days.</p></div><button class="text-link" data-action="export">Download report ${icon('download')}</button></div>${
      recurring
        .filter(
          (g) => g.filter((t) => Date.now() - new Date(t.createdAt) < 30 * 86400000).length >= 2
        )
        .map(
          (g) =>
            `<div class="recurring"><span class="category-icon">${icon(catIcons[categories.indexOf(g[0].category)] || 'grid')}</span><div><strong>${esc(g[0].category)} · ${esc(g[0].block)} Block</strong><small>${esc(g[0].type)} · Floor ${esc(g[0].floor)} · Review for a permanent fix</small></div><b>${g.filter((t) => Date.now() - new Date(t.createdAt) < 30 * 86400000).length}<small>reports</small></b></div>`
        )
        .join('') || '<div class="empty">No recurring issues detected in the last 30 days.</div>'
    }</section>`
  );
}
function staffPage() {
  return (
    pageHeading(
      'The people behind every fix.',
      'A connected team, a better cared-for campus.',
      false
    ) +
    `<div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">${state.staff
      .map((s) => {
        const assigned = state.tickets.filter((t) => t.assignedStaffId === s.id);
        return `<article class="stat-card"><span class="avatar" style="width:46px;height:46px">${esc(
          s.name
            .split(' ')
            .map((x) => x[0])
            .join('')
        )}</span><h2 style="font-size:19px;margin:16px 0 6px">${esc(s.name)}</h2><p class="muted" style="font-size:11px">${esc(s.specialization)}</p><div class="detail-info"><div><small>Active assignments</small>${assigned.filter((t) => !['RESOLVED', 'CLOSED'].includes(t.status)).length}</div><div><small>Resolved</small>${assigned.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.status)).length}</div></div><button class="btn-outline" style="width:100%" data-action="staff-work" data-id="${s.id}">View assignments ${icon('arrow-right')}</button></article>`;
      })
      .join('')}</div>`
  );
}
function notifications() {
  return (
    pageHeading('You’re in the loop.', 'The latest updates from your campus workspace.', false) +
    `<section class="panel"><div class="panel-head"><h2>Notifications</h2><button class="text-link" data-action="read-all">Mark all as read ${icon('check2-all')}</button></div>${state.notifications.length ? state.notifications.map((n) => `<article class="notification-item ${!n.read ? 'unread' : ''}"><span class="activity-icon">${icon('bell')}</span><div><strong style="font-size:12px">Campus update</strong><p>${esc(n.message)}</p><time>${date(n.createdAt)} · ${timeAgo(n.createdAt)}</time></div></article>`).join('') : '<div class="empty">' + icon('bell') + 'All quiet for now. New updates will appear here.</div>'}</section>`
  );
}
function profile() {
  return (
    pageHeading(
      'Your corner of CampusFix.',
      'Your identity, preferences, and campus connection.',
      false
    ) +
    `<section class="panel profile-card" style="max-width:760px"><div style="display:flex;gap:18px;align-items:center"><span class="avatar" style="height:65px;width:65px;font-size:19px">${esc(
      state.user.name
        .split(' ')
        .map((x) => x[0])
        .slice(0, 2)
        .join('')
    )}</span><div><h2 style="margin:0">${esc(state.user.name)}</h2><p class="muted" style="font-size:12px;margin:5px 0">${roleNames[state.user.role]} · VIT Vellore</p></div></div><div class="detail-info" style="margin-top:30px"><div><small>Campus email</small>${esc(state.user.email)}</div><div><small>Account role</small>${roleNames[state.user.role]}</div><div><small>Campus</small>VIT Vellore</div><div><small>Connection</small>${state.demo ? 'Browser demo' : 'Authenticated session'}</div></div><h3 style="margin-top:30px">Make yourself comfortable.</h3><p class="muted" style="font-size:12px">Switch between a light workspace and a quieter dark theme.</p><button class="btn-outline" data-action="theme">${icon('moon-stars')} Toggle appearance</button>${state.demo ? `<div class="notice" style="margin-top:25px">You’re exploring sample data. Try another role to see how campus care connects.</div><div class="role-choices">${roles.map((r) => `<button class="role-choice ${state.user.role === r ? 'active' : ''}" data-action="demo" data-role="${r}">${nice(r)}</button>`).join('')}</div><button class="text-link" data-action="reset-demo">Reset demo records</button>` : ''}</section>`
  );
}
function help() {
  return (
    pageHeading(
      'A little guidance goes a long way.',
      'Find your next step and get back to your campus day.',
      false
    ) +
    `<section class="panel profile-card" style="max-width:850px">${[
      [
        'How do I report an issue?',
        'Choose “Report an issue”, add a clear title and description, select a category, and choose the exact location. You can attach up to five JPEG, PNG or WebP photos, each up to 5 MB.',
      ],
      [
        'How do I track a complaint?',
        'Open a complaint from your dashboard or complaint history. Its timeline shows every review, assignment and progress update.',
      ],
      [
        'What happens after an issue is resolved?',
        'Open the resolved complaint, give the service a star rating and leave feedback. Submitting your feedback closes the complaint.',
      ],
      [
        'How does priority work?',
        'Choose the urgency that best describes the issue. The campus admin reviews the priority and assigns the right maintenance staff.',
      ],
      [
        'How do I access my account?',
        'Your campus administrator provisions accounts and assigns roles. Contact your VIT administration office for account or password support.',
      ],
      [
        'What if there is an immediate danger?',
        'For an immediate safety emergency, contact campus security or emergency services directly. CampusFix is for maintenance coordination and is not monitored as an emergency service.',
      ],
    ]
      .map(
        ([q, a]) =>
          `<details style="padding:18px 0;border-bottom:1px solid var(--line)"><summary style="font-weight:600;font-size:13px;cursor:pointer">${q}</summary><p class="muted" style="font-size:12px;margin:15px 0 0">${a}</p></details>`
      )
      .join('')}</section>`
  );
}
function renderCharts() {
  destroyCharts();
  if (typeof Chart === 'undefined') {
    if ($('#activity-chart'))
      $('#activity-chart').parentNode.innerHTML =
        '<p class="muted" style="padding:20px;font-size:12px">Charts require an internet connection. All complaint counts remain available above.</p>';
    return;
  }
  const ts = myTickets(),
    days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - 6 + i);
      return d;
    }),
    count = (arr, key) =>
      days.map(
        (d) =>
          arr.filter((t) => new Date(t[key]) >= d && new Date(t[key]) < new Date(+d + 86400000))
            .length
      );
  const canvas = $('#activity-chart');
  const text = getComputedStyle(document.body).getPropertyValue('--muted').trim();
  if (canvas)
    state.charts.push(
      new Chart(canvas, {
        type: 'line',
        data: {
          labels: days.map((d) => d.toLocaleDateString('en', { weekday: 'short' })),
          datasets: [
            {
              label: 'Reported',
              data: count(ts, 'createdAt'),
              borderColor: '#6367e7',
              backgroundColor: '#6367e712',
              fill: true,
              borderWidth: 2,
              pointRadius: 3,
              pointBackgroundColor: '#6367e7',
              tension: 0.4,
            },
            {
              label: 'Resolved',
              data: count(
                ts
                  .filter((t) => ['RESOLVED', 'CLOSED'].includes(t.status))
                  .map((t) => ({
                    ...t,
                    resolvedAt: t.updates?.find((u) => u.status === 'RESOLVED')?.createdAt,
                  })),
                'resolvedAt'
              ),
              borderColor: '#26a88a',
              backgroundColor: '#26a88a08',
              fill: true,
              borderWidth: 2,
              pointRadius: 3,
              tension: 0.4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: '#17272b', padding: 12 },
          },
          scales: {
            x: {
              grid: { display: false },
              border: { display: false },
              ticks: { color: text, font: { size: 9 } },
            },
            y: {
              beginAtZero: true,
              border: { display: false },
              grid: { color: '#8c9c9910' },
              ticks: { stepSize: 1, color: text, font: { size: 9 } },
            },
          },
        },
      })
    );
  if ($('#category-chart'))
    state.charts.push(
      new Chart($('#category-chart'), {
        type: 'doughnut',
        data: {
          labels: categories,
          datasets: [
            {
              data: categories.map((c) => ts.filter((t) => t.category === c).length),
              backgroundColor: [
                '#6367e7',
                '#26a88a',
                '#5e9ae6',
                '#d7af5b',
                '#9a7cd4',
                '#59b8c3',
                '#8bb99a',
                '#9ca9c4',
              ],
              borderWidth: 3,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          cutout: '72%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { boxWidth: 8, boxHeight: 8, color: text, font: { size: 9 }, padding: 12 },
            },
          },
        },
      })
    );
}
function openModal(title, html) {
  $('#modal-root').innerHTML =
    `<div class="modal-overlay"><section class="modal-box" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-action="close-modal" aria-label="Close dialog">${icon('x-lg')}</button></header><div class="modal-body">${html}</div></section></div>`;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#modal-root input, #modal-root select, #modal-root button')?.focus(), 0);
}
function closeModal() {
  $('#modal-root').innerHTML = '';
  document.body.style.overflow = '';
  photoPreviews.forEach((p) => URL.revokeObjectURL(p));
  photoPreviews = [];
  photoFiles = [];
}
function reportForm() {
  if (!canReport()) return;
  photoFiles = [];
  photoPreviews = [];
  openModal(
    'What needs a little care?',
    `<p>Tell us what’s happening. The more detail, the faster the right fix.</p><form id="report-form"><div class="field"><label for="title">Issue title *</label><input id="title" name="title" required minlength="5" maxlength="150" placeholder="e.g. Ceiling fan not working"></div><div class="form-grid"><div class="field"><label for="category">Category *</label><select id="category" name="category" required><option value="">Choose a category</option>${categories.map((c) => `<option>${esc(c)}</option>`).join('')}</select></div><div class="field"><label for="priority">Priority *</label><select id="priority" name="priority"><option value="LOW">Low · Can wait a little</option><option value="MEDIUM" selected>Medium · Needs attention</option><option value="HIGH">High · Affecting daily use</option><option value="URGENT">Urgent · Requires prompt attention</option></select></div></div><h3 style="margin:10px 0 15px">Point us to the right place.</h3>${state.user.role === 'STUDENT' ? `<p class="muted">${state.user.hostelBlock ? `Hostel reports are restricted to your assigned ${esc(state.user.hostelBlock)} Block. Academic buildings remain available.` : 'Your hostel is not assigned. Contact Admin to report hostel issues. Academic buildings remain available.'}</p>` : '<p class="muted">Faculty can report issues in academic buildings only.</p>'}<div class="form-grid"><div class="field"><label for="location-type">Location type *</label><select name="type" id="location-type" required><option value="">Hostel or academic?</option>${state.user.role !== 'FACULTY' ? '<option>Hostel</option>' : ''}<option>Academic</option></select></div><div class="field"><label for="location-block">Block / building *</label><select name="block" id="location-block" required disabled><option value="">Select type first</option></select></div><div class="field"><label for="location-floor">Floor *</label><select name="floor" id="location-floor" required disabled><option value="">Select block first</option></select></div><div class="field"><label for="room">Room / lab / exact area *</label><input id="room" name="room" required maxlength="80" placeholder="e.g. Room 312 or common washroom" disabled></div></div><div class="field"><label for="description">Describe the issue *</label><textarea id="description" name="description" required minlength="15" maxlength="3000" placeholder="What’s wrong, when did it start, and how is it affecting you?"></textarea></div><label class="upload-zone" for="photos" style="display:block">${icon('cloud-arrow-up')}<strong>Bring the issue into focus.</strong><small>Click to upload photos · JPEG, PNG, WebP · Up to 5 files, 5 MB each</small><input id="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" style="display:none"></label><div id="photo-previews" class="previews"></div><div class="form-footer"><button class="btn-outline" type="button" data-action="close-modal">Cancel</button><button class="btn-primary" type="submit">Submit complaint ${icon('arrow-right')}</button></div></form>`
  );
}
function detail(id) {
  const t = myTickets().find((t) => t.id === Number(id));
  if (!t) return;
  state.rating = 5;
  const owner = t.userId === state.user.id;
  openModal(
    `Complaint CF-${t.id}`,
    `${statusBadge(t.status)}<h1 class="detail-title">${esc(t.title)}</h1><div class="detail-meta">${priorityBadge(t.priority)}<span class="muted" style="font-size:11px">${icon('tag')} ${esc(t.category)}</span></div><p>${esc(t.description)}</p><div class="detail-info"><div><small>Location</small>${esc(t.block)} ${t.type === 'Hostel' ? 'Block' : 'Building'} · Floor ${esc(t.floor)}<br>${esc(t.room)}</div><div><small>Reported by</small>${esc(t.reporter)}<br><span class="muted" style="font-size:10px">${date(t.createdAt)}</span></div><div><small>Assigned to</small>${esc(t.assignedStaff || 'Awaiting assignment')}</div><div><small>Last update</small>${timeAgo(t.updatedAt)}</div></div>${t.attachments?.length ? `<h3>Photos</h3><div class="previews">${t.attachments.map((a) => `<a href="${esc(state.demo ? a.url : 'api/attachment/' + a.id)}" target="_blank" rel="noopener"><img style="width:110px;height:85px;object-fit:cover;border-radius:8px" src="${esc(state.demo ? a.url : 'api/attachment/' + a.id)}" alt="Complaint evidence"></a>`).join('')}</div>` : ''}<h3 style="margin-top:25px">Every step, in the open.</h3><div class="timeline">${(t.updates || []).map((u) => `<article class="timeline-item"><strong>${statusLabel(u.status)}</strong><p>${esc(u.remarks)}</p><time>${esc(u.actor)} · ${date(u.createdAt)} · ${timeAgo(u.createdAt)}</time></article>`).join('')}</div>${
      isAdmin() && !['PENDING_CONFIRMATION', 'RESOLVED', 'CLOSED'].includes(t.status)
        ? `<form id="workflow-form" data-id="${t.id}"><h3>Move this issue forward.</h3><div class="form-grid"><div class="field"><label for="workflow-priority">Priority</label><select id="workflow-priority" name="priority">${['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => `<option ${t.priority === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div><div class="field"><label for="workflow-staff">Assign staff</label><select id="workflow-staff" name="staffId"><option value="">Choose maintenance staff</option>${state.staff.map((s) => `<option value="${s.id}" ${t.assignedStaffId === s.id ? 'selected' : ''}>${esc(s.name)} · ${esc(s.specialization)}</option>`).join('')}</select></div></div><div class="field"><label for="workflow-status">Status</label><select id="workflow-status" name="status">${[
            t.status,
            ...(t.status === 'REPORTED'
              ? ['REVIEW', 'ASSIGNED']
              : t.status === 'REVIEW'
                ? ['ASSIGNED']
                : []),
          ]
            .filter((x, i, a) => a.indexOf(x) === i)
            .map((s) => `<option value="${s}">${statusLabel(s)}</option>`)
            .join(
              ''
            )}</select></div><div class="field"><label for="workflow-remarks">Update note *</label><textarea id="workflow-remarks" name="remarks" required minlength="5" maxlength="1000" placeholder="Share the next step with the reporter."></textarea></div><button class="btn-primary" type="submit">Save update ${icon('check2')}</button></form>`
        : ''
    }${isStaff() && t.assignedStaffId === state.user.id && ['ASSIGNED', 'IN_PROGRESS'].includes(t.status) ? `<form id="workflow-form" data-id="${t.id}"><h3>Share your progress.</h3><p class="muted">After completing the repair, choose Awaiting confirmation. The reporter will check and confirm the fix.</p><div class="field"><label for="workflow-status">Status</label><select id="workflow-status" name="status">${(t.status === 'ASSIGNED' ? ['IN_PROGRESS'] : ['IN_PROGRESS', 'PENDING_CONFIRMATION']).map((s) => `<option value="${s}">${statusLabel(s)}</option>`).join('')}</select></div><div class="field"><label for="workflow-remarks">Work notes *</label><textarea id="workflow-remarks" required minlength="5" maxlength="1000" name="remarks" placeholder="What have you checked or fixed?"></textarea></div><button class="btn-primary" type="submit">Update progress ${icon('arrow-right')}</button></form>` : ''}${(owner && !['RESOLVED', 'CLOSED'].includes(t.status)) || t.status === 'PENDING_CONFIRMATION' ? resolutionConfirmation(t, owner) : ''}${owner && t.status === 'RESOLVED' ? `<form id="feedback-form" data-id="${t.id}"><h3>How did we do?</h3><p>Your feedback helps us care for campus better.</p><div class="stars" role="group" aria-label="Service rating">${[1, 2, 3, 4, 5].map((n) => `<button class="star selected" type="button" data-action="rate" data-rating="${n}" aria-label="${n} stars" aria-pressed="true">${icon('star-fill')}</button>`).join('')}</div><div class="field" style="margin-top:15px"><label for="feedback">Your feedback *</label><textarea id="feedback" name="comment" required minlength="3" maxlength="1000" placeholder="Tell us about the fix."></textarea></div><button class="btn-primary" type="submit">Send feedback & close ${icon('check2-circle')}</button></form>` : ''}${t.rating ? `<div class="notice"><strong>${'★'.repeat(t.rating)}${'☆'.repeat(5 - t.rating)} · Community feedback</strong><p style="margin:8px 0 0">${esc(t.feedback)}</p></div>` : ''}`
  );
}
function demoNotify(t, message) {
  state.notifications.unshift({
    id: Date.now(),
    message: `CF-${t.id}: ${message}`,
    createdAt: new Date().toISOString(),
    read: false,
  });
}
async function submitReport(form) {
  const data = Object.fromEntries(new FormData(form));
  if (state.demo) {
    const t = {
      ...data,
      id: Math.max(1042, ...state.tickets.map((t) => t.id)) + 1,
      userId: state.user.id,
      reporter: state.user.name,
      status: 'REPORTED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedStaffId: null,
      assignedStaff: null,
      updates: [
        {
          status: 'REPORTED',
          remarks: 'Complaint submitted. Our campus team will review it shortly.',
          actor: state.user.name,
          createdAt: new Date().toISOString(),
        },
      ],
      attachments: [],
    };
    for (const file of photoFiles) {
      const url = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      t.attachments.push({ url });
    }
    state.tickets.unshift(t);
    demoNotify(t, 'Your complaint has been submitted.');
    saveDemo();
  } else {
    const fd = new FormData(form);
    photoFiles.forEach((file) => fd.append('photos', file));
    await api('complaints', { method: 'POST', body: fd });
    await refresh();
  }
  closeModal();
  state.page = 'complaints';
  state.filter = 'All';
  state.search = '';
  state.category = 'All';
  render();
  toast('Issue reported. Thank you for making campus better.');
}
async function submitWorkflow(form) {
  const data = Object.fromEntries(new FormData(form)),
    t = myTickets().find((t) => t.id === Number(form.dataset.id));
  if (data.status === 'ASSIGNED' && !data.staffId && !t.assignedStaffId)
    throw Error('Choose a maintenance staff member before assigning.');
  if (state.demo) {
    if (isAdmin()) {
      t.priority = data.priority || t.priority;
      if (data.staffId) {
        t.assignedStaffId = Number(data.staffId);
        t.assignedStaff = state.staff.find((s) => s.id === Number(data.staffId))?.name;
      }
    }
    t.status = data.status;
    t.updatedAt = new Date().toISOString();
    t.updates.push({
      status: t.status,
      remarks: data.remarks,
      actor: state.user.name,
      createdAt: t.updatedAt,
    });
    demoNotify(t, `${statusLabel(t.status)}. ${data.remarks}`);
    saveDemo();
  } else {
    await api(`complaints/${t.id}/update`, { method: 'POST', body: JSON.stringify(data) });
    await refresh();
  }
  closeModal();
  render();
  detail(t.id);
  toast('Update saved. Everyone stays in the loop.');
}
function resolutionConfirmation(t, owner) {
  const pending = t.status === 'PENDING_CONFIRMATION';
  if (!owner)
    return pending
      ? `<section class="resolution-review"><h3>${icon('person-check')} Awaiting reporter confirmation</h3><p>The reporter must check and confirm whether the issue is resolved.</p></section>`
      : '';
  if (['RESOLVED', 'CLOSED'].includes(t.status)) return '';
  return `<section class="resolution-review"><h3>${icon('shield-check')} Is your issue fixed?</h3><p>${pending ? 'Staff have completed their work. Please check the issue before confirming.' : 'If the problem is already fixed, you can mark it resolved now. You do not need to wait for staff.'}</p><form id="resolution-confirm-form" data-id="${t.id}"><label class="resolution-check"><input type="checkbox" name="confirmed" required><span>I checked and confirm that my problem is resolved.</span></label><button class="btn-primary" type="submit">${pending ? 'Confirm resolution' : 'Mark as resolved'} ${icon('check2-circle')}</button></form>${pending ? `<details class="resolution-return"><summary>Still having the problem?</summary><form id="resolution-reject-form" data-id="${t.id}"><div class="field"><label for="resolution-remarks">What still needs fixing?</label><textarea id="resolution-remarks" name="remarks" required minlength="5" maxlength="1000" placeholder="Tell the maintenance team what is still wrong."></textarea></div><button class="btn-outline" type="submit">Send back to staff ${icon('arrow-counterclockwise')}</button></form></details>` : ''}</section>`;
}

async function submitResolutionConfirmation(form) {
  const t = myTickets().find((t) => t.id === Number(form.dataset.id));
  const confirmed = form.id === 'resolution-confirm-form';
  if (confirmed && !form.querySelector('[name="confirmed"]').checked)
    throw Error('Please check the confirmation box.');
  const data = {
    confirmed: String(confirmed),
    remarks: confirmed ? '' : new FormData(form).get('remarks'),
  };
  if (state.demo) {
    t.status = confirmed ? 'RESOLVED' : 'IN_PROGRESS';
    t.updatedAt = new Date().toISOString();
    t.updates.push({
      status: t.status,
      remarks: confirmed ? 'Reporter confirmed that the issue is resolved.' : data.remarks,
      actor: state.user.name,
      createdAt: t.updatedAt,
    });
    demoNotify(
      t,
      confirmed ? 'Fix confirmed. You can now rate the service.' : 'Complaint returned to staff.'
    );
    saveDemo();
  } else {
    await api(`complaints/${t.id}/confirm`, { method: 'POST', body: JSON.stringify(data) });
    await refresh();
  }
  closeModal();
  render();
  detail(t.id);
  toast(
    confirmed
      ? 'Resolution confirmed. You can now rate the service.'
      : 'Sent back to staff for further work.'
  );
}

async function submitFeedback(form) {
  const t = myTickets().find((t) => t.id === Number(form.dataset.id)),
    data = { rating: state.rating, comment: new FormData(form).get('comment') };
  if (state.demo) {
    t.rating = data.rating;
    t.feedback = data.comment;
    t.status = 'CLOSED';
    t.updatedAt = new Date().toISOString();
    t.updates.push({
      status: 'CLOSED',
      remarks: 'Feedback received. Complaint closed.',
      actor: state.user.name,
      createdAt: t.updatedAt,
    });
    demoNotify(t, 'Thank you for your feedback. Complaint closed.');
    saveDemo();
  } else {
    await api(`complaints/${t.id}/feedback`, { method: 'POST', body: JSON.stringify(data) });
    await refresh();
  }
  closeModal();
  render();
  toast('Thank you. Your feedback makes a difference.');
}
function csvCell(value) {
  const text = String(value ?? '');
  // Preserve the original text while preventing spreadsheet formula execution.
  const safe = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
function exportReport() {
  const rows = [
    [
      'ID',
      'Title',
      'Category',
      'Location type',
      'Block',
      'Floor',
      'Room',
      'Status',
      'Priority',
      'Reporter',
      'Staff',
      'Created',
      'Rating',
    ],
    ...filteredTickets().map((t) => [
      t.id,
      t.title,
      t.category,
      t.type,
      t.block,
      t.floor,
      t.room,
      t.status,
      t.priority,
      t.reporter,
      t.assignedStaff,
      t.createdAt,
      t.rating,
    ]),
  ];
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `CampusFix-${state.demo ? 'sample-' : ''}report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Your report is ready.');
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  e.preventDefault();
  const action = b.dataset.action;
  try {
    if (action === 'home') {
      if (state.user) {
        state.page = 'overview';
        render();
      } else {
        location.hash = '';
        render();
      }
    } else if (action === 'login') {
      location.hash = 'login';
      renderLogin();
    } else if (action === 'demo') {
      demoLogin(b.dataset.role);
    } else if (action === 'nav') {
      if (b.dataset.page === 'report') reportForm();
      else {
        state.page = b.dataset.page;
        state.filter = 'All';
        state.search = '';
        state.category = 'All';
        state.priority = 'All';
        $('#sidebar')?.classList.remove('open');
        renderPage();
        window.scrollTo(0, 0);
      }
    } else if (action === 'report') reportForm();
    else if (action === 'detail') detail(b.dataset.id);
    else if (action === 'close-modal') closeModal();
    else if (action === 'filter') {
      state.filter = b.dataset.filter;
      renderPage();
    } else if (action === 'reset-filters') {
      state.filter = 'All';
      state.category = 'All';
      state.priority = 'All';
      state.search = '';
      renderPage();
    } else if (action === 'theme') {
      document.body.classList.toggle('dark');
      localStorage.setItem(
        'campusfix-theme',
        document.body.classList.contains('dark') ? 'dark' : 'light'
      );
      if (state.user) renderChartsAfterTheme();
    } else if (action === 'menu') $('#sidebar').classList.toggle('open');
    else if (action === 'rate') {
      state.rating = Number(b.dataset.rating);
      $$('.star').forEach((x) => {
        x.classList.toggle('selected', Number(x.dataset.rating) <= state.rating);
        x.setAttribute('aria-pressed', String(Number(x.dataset.rating) <= state.rating));
      });
    } else if (action === 'logout') {
      if (!state.demo) await api('logout', { method: 'POST' });
      state.user = null;
      state.demo = false;
      location.hash = '';
      render();
    } else if (action === 'export') exportReport();
    else if (action === 'read-all') {
      if (!state.demo) await api('notifications/read', { method: 'POST' });
      state.notifications.forEach((n) => (n.read = true));
      saveDemo();
      render();
      toast('You’re all caught up.');
    } else if (action === 'reset-demo') {
      localStorage.removeItem('campusfix-demo-v1');
      demoLogin(state.user.role);
      toast('Sample records restored.');
    } else if (action === 'staff-work') {
      const staff = state.staff.find((s) => s.id === Number(b.dataset.id));
      openModal(
        `${esc(staff.name)} · Assignments`,
        ticketTable(state.tickets.filter((t) => t.assignedStaffId === staff.id))
      );
    }
  } catch (err) {
    toast(err.message, true);
  }
});
function renderChartsAfterTheme() {
  destroyCharts();
  requestAnimationFrame(renderCharts);
}
document.addEventListener('submit', async (e) => {
  if (
    ![
      'login-form',
      'report-form',
      'workflow-form',
      'feedback-form',
      'resolution-confirm-form',
      'resolution-reject-form',
    ].includes(e.target.id)
  )
    return;
  e.preventDefault();
  const f = e.target,
    btn = f.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    if (f.id === 'login-form') {
      const credentials = Object.fromEntries(new FormData(f)),
        data = await api('login', { method: 'POST', body: JSON.stringify(credentials) });
      state.user = data.user;
      state.csrf = data.csrf;
      state.demo = false;
      state.page = 'overview';
      await refresh();
      render();
      toast('Welcome to your campus workspace.');
    } else if (f.id === 'report-form') await submitReport(f);
    else if (f.id === 'workflow-form') await submitWorkflow(f);
    else if (f.id.startsWith('resolution-')) await submitResolutionConfirmation(f);
    else await submitFeedback(f);
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
  }
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'category-filter') {
    state.category = el.value;
    renderPage();
  } else if (el.id === 'priority-filter') {
    state.priority = el.value;
    renderPage();
  } else if (el.id === 'location-type') {
    const s = $('#location-block');
    s.disabled = !el.value;
    s.innerHTML =
      '<option value="">Choose a block</option>' +
      (el.value === 'Hostel' && state.user?.role === 'STUDENT'
        ? (blocks.Hostel || []).filter((b) => b === state.user.hostelBlock)
        : blocks[el.value] || []
      )
        .map((b) => `<option>${esc(b)}</option>`)
        .join('');
    $('#location-floor').disabled = true;
    $('#location-floor').innerHTML = '<option value="">Select block first</option>';
    $('#room').value = '';
    $('#room').disabled = true;
  } else if (el.id === 'location-block') {
    const f = $('#location-floor');
    f.disabled = !el.value;
    f.innerHTML =
      '<option value="">Choose a floor</option>' +
      Array.from(
        { length: $('#location-type').value === 'Hostel' ? 16 : 9 },
        (_, i) => `<option value="${i}">${i === 0 ? 'Ground floor' : 'Floor ' + i}</option>`
      ).join('');
    $('#room').disabled = true;
    $('#room').value = '';
  } else if (el.id === 'location-floor') {
    $('#room').disabled = !el.value;
  } else if (el.id === 'photos') {
    const files = [...el.files];
    if (files.length + photoFiles.length > (state.config?.maxPhotos || 5)) {
      toast(`Please choose up to ${state.config?.maxPhotos || 5} photos.`, true);
      el.value = '';
      return;
    }
    for (const f of files) {
      if (
        !['image/jpeg', 'image/png', 'image/webp'].includes(f.type) ||
        f.size > (state.config?.uploadSizeMb || 5) * 1024 * 1024
      ) {
        toast(
          `Each photo must be JPEG, PNG or WebP, and at most ${state.config?.uploadSizeMb || 5} MB.`,
          true
        );
        continue;
      }
      photoFiles.push(f);
      photoPreviews.push(URL.createObjectURL(f));
    }
    $('#photo-previews').innerHTML = photoPreviews
      .map(
        (url, i) =>
          `<div class="preview-image"><img src="${url}" alt="Photo ${i + 1} preview"><button type="button" class="remove-photo" data-index="${i}" aria-label="Remove photo">×</button></div>`
      )
      .join('');
    el.value = '';
  }
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('.remove-photo');
  if (b) {
    const i = Number(b.dataset.index);
    URL.revokeObjectURL(photoPreviews[i]);
    photoPreviews.splice(i, 1);
    photoFiles.splice(i, 1);
    b.parentNode.remove();
    $$('.remove-photo').forEach((x, i) => (x.dataset.index = i));
  }
});
let lastInteraction = Date.now();
document.addEventListener('pointerdown', () => (lastInteraction = Date.now()));
document.addEventListener('keydown', () => (lastInteraction = Date.now()));
let searchTimer;
document.addEventListener('input', (e) => {
  if (['global-search', 'list-search'].includes(e.target.id)) {
    const input = e.target;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const start = input.selectionStart;
      state.search = input.value;
      state.page = 'complaints';
      renderPage();
      if (input.id === 'list-search') {
        const next = $('#list-search');
        next.focus();
        next.setSelectionRange(start, start);
      }
    }, 260);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if ($('#modal-root').children.length) closeModal();
    else $('#sidebar')?.classList.remove('open');
  }
  if (e.key === 'Enter' && e.target.matches('.ticket-row,.board-ticket')) e.target.click();
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    $('#global-search')?.focus();
  }
  if (e.key === 'Tab' && $('#modal-root').children.length) {
    const focusable = $$(
        '#modal-root button, #modal-root input, #modal-root select, #modal-root textarea, #modal-root a'
      ).filter((x) => !x.disabled && x.offsetParent !== null),
      first = focusable[0],
      last = focusable.at(-1);
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
window.addEventListener('hashchange', () => {
  if (!state.user) render();
});
// Preserve active forms and search input; refresh visible production workspaces quietly.
setInterval(async () => {
  if (
    !state.user ||
    state.demo ||
    document.hidden ||
    Date.now() - lastInteraction > 5 * 60 * 1000 ||
    $('#modal-root').children.length ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
  )
    return;
  try {
    await refresh();
    renderShell();
    renderPage();
  } catch (error) {
    if (error.message.includes('sign in')) {
      state.user = null;
      location.hash = 'login';
      render();
      toast('Your session expired. Please sign in again.', true);
    }
  }
}, 30000);
(async () => {
  if (localStorage.getItem('campusfix-theme') === 'dark') document.body.classList.add('dark');
  render();
  if (location.pathname.endsWith('preview.html')) return;
  try {
    const data = await api('session');
    if (data.user) {
      state.user = data.user;
      state.csrf = data.csrf;
      await refresh();
      render();
    }
  } catch {
    /* Public landing remains available before Tomcat configuration. */
  }
})();
