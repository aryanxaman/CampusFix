import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/main/webapp/assets/app.js', import.meta.url), 'utf8');
const start = source.indexOf('function csvCell(');
const end = source.indexOf('function exportReport(', start);
const csvCell = vm.runInNewContext(`${source.slice(start, end)}; csvCell;`);

test('CSV export preserves ordinary text, quotes and line breaks', () => {
  assert.equal(csvCell('Room "A", floor 2\nFan broken'), '"Room ""A"", floor 2\nFan broken"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(5), '"5"');
});

test('CSV export neutralizes formulas without deleting original characters', () => {
  for (const text of ['=1+1', '+SUM(A1)', '-2+3', '@SUM(A1)', '  =1+1', '\t=1+1', '\n=1+1']) {
    assert.equal(csvCell(text), `"'${text}"`);
  }
});

const experience = readFileSync(
  new URL('../src/main/webapp/assets/experience.js', import.meta.url),
  'utf8'
);
const journeySource = experience.slice(
  experience.indexOf('function serviceJourney('),
  experience.indexOf('const experienceOverview')
);
const serviceJourney = vm.runInNewContext(`${journeySource}; serviceJourney;`, {
  icon: (name) => `<i class="${name}"></i>`,
});

test('Complaint lifecycle shows real stage totals and supports an empty workspace', () => {
  const html = serviceJourney([
    { status: 'REPORTED' },
    { status: 'REPORTED' },
    { status: 'CLOSED' },
  ]);
  assert.match(html, /Reported: 2 complaints/);
  assert.match(html, /Closed: 1 complaint/);
  assert.match(html, /In progress: 0 complaints/);
  assert.match(html, /3 complaints/);
  assert.match(serviceJourney([]), /0 complaints/);
  assert.equal((html.match(/data-journey-filter=/g) || []).length, 7);
});

const enhancements = readFileSync(
  new URL('../src/main/webapp/assets/enhancements.js', import.meta.url),
  'utf8'
);

test('User deletion confirmation escapes identity and excludes self/non-admin access', () => {
  const formSource = enhancements.slice(
    enhancements.indexOf('function cfDeleteUserForm('),
    enhancements.indexOf('function cfUserForm(')
  );
  let modal;
  const context = {
    state: {
      user: { id: 3 },
      users: [
        { id: 1, name: '<img onerror=alert(1)>', email: 'student@vit.ac.in' },
        { id: 3, name: 'Admin' },
      ],
    },
    isAdmin: () => true,
    esc: (x) => String(x).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    icon: () => '',
    openModal: (title, html) => {
      modal = html;
    },
  };
  const show = vm.runInNewContext(`${formSource}; cfDeleteUserForm;`, context);
  show(1);
  assert.match(modal, /name="confirmed" value="true" required/);
  assert.match(modal, /Complaint history is preserved/);
  assert.ok(!modal.includes('<img'));
  modal = null;
  show(3);
  assert.equal(modal, null);
  context.isAdmin = () => false;
  show(1);
  assert.equal(modal, null);
});
const cardsSource = enhancements.slice(
  enhancements.indexOf('function cfComplaintCards('),
  enhancements.indexOf('complaints = function ()')
);
const complaintCards = vm.runInNewContext(`${cardsSource}; cfComplaintCards;`, {
  esc: (text) => String(text).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  icon: () => '',
  priorityBadge: () => '<span>High</span>',
  statusBadge: () => '<span>Assigned</span>',
  cfSla: () => ({ state: 'OVERDUE' }),
});
test('Compact cards preserve details action and overdue state without repeating descriptions', () => {
  const html = complaintCards([
    {
      id: 7,
      title: 'Broken <fan>',
      description: 'FULL_DESCRIPTION',
      block: 'K',
      room: '214',
      assignedStaff: 'Ravi',
      priority: 'HIGH',
      status: 'ASSIGNED',
    },
  ]);
  assert.match(html, /data-action="detail" data-id="7"/);
  assert.match(html, /Broken &lt;fan&gt;/);
  assert.match(html, /Overdue/);
  assert.match(html, /K · 214/);
  assert.ok(!html.includes('FULL_DESCRIPTION'));
});

const activitySource = source.slice(
  source.indexOf('function recentActivity('),
  source.indexOf('function filters(')
);
const recentActivity = vm.runInNewContext(`${activitySource}; recentActivity;`, {
  myTickets: () => [
    {
      id: 1,
      title: 'Fan issue',
      updates: [
        { status: 'REPORTED', createdAt: '2026-10-20T10:00:00Z' },
        { status: 'ASSIGNED', createdAt: '2026-10-22T10:00:00Z' },
      ],
    },
    {
      id: 2,
      title: 'Tap leak',
      updates: [{ status: 'REPORTED', createdAt: '2026-10-21T10:00:00Z' }],
    },
  ],
  esc: String,
  icon: () => '',
  statusLabel: String,
  timeAgo: () => 'Today',
});
test('Dashboard activity shows each complaint once using its latest update', () => {
  const html = recentActivity();
  assert.equal((html.match(/Fan issue/g) || []).length, 1);
  assert.match(html, /ASSIGNED · CF-1/);
  assert.match(html, /Tap leak/);
});

const confirmationSource = source.slice(
  source.indexOf('function resolutionConfirmation('),
  source.indexOf('async function submitResolutionConfirmation(')
);
const resolutionConfirmation = vm.runInNewContext(
  `${confirmationSource}; resolutionConfirmation;`,
  {
    icon: () => '',
  }
);
test('Reporter gets explicit required confirmation and an option to return the repair', () => {
  const html = resolutionConfirmation({ id: 12, status: 'PENDING_CONFIRMATION' }, true);
  assert.match(html, /id="resolution-confirm-form" data-id="12"/);
  assert.match(html, /type="checkbox" name="confirmed" required/);
  assert.match(html, /I checked and confirm/);
  assert.match(html, /id="resolution-reject-form"/);
  assert.match(html, /name="remarks" required minlength="5"/);
});
test('Other users see pending confirmation information without reporter controls', () => {
  const html = resolutionConfirmation({ id: 12, status: 'PENDING_CONFIRMATION' }, false);
  assert.match(html, /Awaiting reporter confirmation/);
  assert.ok(!html.includes('resolution-confirm-form'));
  assert.ok(!html.includes('resolution-reject-form'));
});

test('Reporters can mark any open issue resolved without a staff submission', () => {
  for (const status of ['REPORTED', 'REVIEW', 'ASSIGNED', 'IN_PROGRESS']) {
    const html = resolutionConfirmation({ id: 12, status }, true);
    assert.match(html, /Mark as resolved/);
    assert.match(html, /do not need to wait for staff/);
    assert.match(html, /type="checkbox" name="confirmed" required/);
    assert.ok(!html.includes('resolution-reject-form'));
    assert.equal(resolutionConfirmation({ id: 12, status }, false), '');
  }
});

test('Resolved and closed issues do not offer repeated confirmation', () => {
  for (const status of ['RESOLVED', 'CLOSED'])
    assert.equal(resolutionConfirmation({ id: 12, status }, true), '');
});

const management = readFileSync(
  new URL('../src/main/webapp/assets/complaint-actions.js', import.meta.url),
  'utf8'
);
const managementSource = management.slice(0, management.indexOf('const ownerOriginalDetail'));
const managementControls = vm.runInNewContext(`${managementSource}; complaintManagementControls;`, {
  canReport: () => true,
  isAdmin: () => false,
  state: { user: { id: 1 } },
  icon: () => '',
});
test('Only the reporter sees edit and delete controls before staff start work', () => {
  for (const status of ['REPORTED', 'REVIEW', 'ASSIGNED']) {
    assert.match(managementControls({ id: 12, userId: 1, status }), /owner-edit/);
    assert.match(managementControls({ id: 12, userId: 1, status }), /owner-delete/);
    assert.equal(managementControls({ id: 12, userId: 2, status }), '');
  }
  for (const status of ['IN_PROGRESS', 'PENDING_CONFIRMATION', 'RESOLVED', 'CLOSED']) {
    const html = managementControls({ id: 12, userId: 1, status });
    assert.match(html, /owner-delete/);
    assert.ok(!html.includes('owner-edit'));
    assert.equal(managementControls({ id: 12, userId: 2, status }), '');
  }
});

test('Editing preserves escaped text and offers only the student assigned hostel', () => {
  let html = '';
  const editSource = management.slice(
    management.indexOf('function editComplaint('),
    management.indexOf('async function showDeletedComplaints(')
  );
  const edit = vm.runInNewContext(`${editSource}; editComplaint;`, {
    canManageComplaint: () => true,
    state: { user: { role: 'STUDENT', hostelBlock: 'K' } },
    blocks: { Hostel: ['K', 'L', 'N'], Academic: ['SJT'] },
    categories: ['Electrical'],
    icon: () => '',
    esc: (s) =>
      String(s)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;'),
    openModal: (_, content) => {
      html = content;
    },
  });
  edit({
    id: 12,
    title: 'Broken <fan>',
    description: 'The fan <stopped> working.',
    category: 'Electrical',
    priority: 'HIGH',
    type: 'Hostel',
    block: 'K',
    floor: 2,
    room: '214',
  });
  assert.match(html, /Broken &lt;fan&gt;/);
  assert.match(html, /The fan &lt;stopped&gt; working/);
  assert.ok(!html.includes('value="L"'));
  assert.ok(!html.includes('value="N"'));
  assert.match(html, /Existing photos and the complaint timeline are preserved/);
});

test('Admin can delete complaints at every stage without receiving reporter edit controls', () => {
  const controls = vm.runInNewContext(`${managementSource}; complaintManagementControls;`, {
    canReport: () => false,
    isAdmin: () => true,
    state: { user: { id: 99 } },
    icon: () => '',
  });
  for (const status of [
    'REPORTED',
    'REVIEW',
    'ASSIGNED',
    'IN_PROGRESS',
    'PENDING_CONFIRMATION',
    'RESOLVED',
    'CLOSED',
  ]) {
    const html = controls({ id: 12, userId: 1, status });
    assert.match(html, /owner-delete/);
    assert.ok(!html.includes('owner-edit'));
  }
});

test('Maintenance staff have no complaint deletion controls', () => {
  const controls = vm.runInNewContext(`${managementSource}; complaintManagementControls;`, {
    canReport: () => false,
    isAdmin: () => false,
    state: { user: { id: 99 } },
    icon: () => '',
  });
  assert.equal(controls({ id: 12, userId: 1, status: 'ASSIGNED' }), '');
});
