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
  assert.equal((html.match(/data-journey-filter=/g) || []).length, 6);
});

const enhancements = readFileSync(
  new URL('../src/main/webapp/assets/enhancements.js', import.meta.url),
  'utf8'
);
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
