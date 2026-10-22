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
  const html = experienceOverview();
  const journey = serviceJourney(myTickets());
  // Keep the existing overview, charts and SLA sections together.
  const position = html.indexOf('<div class="stat-grid"');
  if (position >= 0) return html.slice(0, position) + journey + html.slice(position);
  return html + journey;
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
