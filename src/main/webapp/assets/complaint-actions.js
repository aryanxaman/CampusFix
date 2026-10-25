/* Reporter-owned editing and recoverable deletion. Authorization is also enforced by Java. */
function canManageComplaint(t) {
  return (
    canReport() &&
    t.userId === state.user.id &&
    ['REPORTED', 'REVIEW', 'ASSIGNED'].includes(t.status)
  );
}

function canDeleteComplaint(t) {
  return isAdmin() || (canReport() && t.userId === state.user.id);
}

function complaintManagementControls(t) {
  if (!canDeleteComplaint(t)) return '';
  return `<div class="complaint-owner-actions">${canManageComplaint(t) ? `<button type="button" class="btn-outline" data-action="owner-edit" data-id="${t.id}">${icon('pencil')} Edit complaint</button>` : ''}<button type="button" class="btn-outline owner-delete" data-action="owner-delete" data-id="${t.id}">${icon('trash3')} Delete complaint</button><small>${canManageComplaint(t) ? 'Edits available until staff start work.' : 'Deleted complaints can be restored later.'}</small></div>`;
}

const ownerOriginalDetail = detail;
detail = function (id) {
  ownerOriginalDetail(id);
  const t = myTickets().find((t) => t.id === Number(id));
  if (t)
    $('#modal-root .modal-body')?.insertAdjacentHTML('beforeend', complaintManagementControls(t));
};

const ownerOriginalComplaints = complaints;
complaints = function () {
  const html = ownerOriginalComplaints();
  return canReport() || isAdmin()
    ? html.replace(
        '<div class="heading-actions">',
        `<div class="heading-actions"><button class="btn-outline" data-action="owner-deleted">${icon('trash3')} Deleted complaints</button>`
      )
    : html;
};

function editComplaint(t) {
  if (!canManageComplaint(t)) return;
  const choices = (values, selected) =>
    values
      .map(
        (v) =>
          `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(v)}</option>`
      )
      .join('');
  const allowedBlocks =
    t.type === 'Hostel' && state.user.role === 'STUDENT'
      ? (blocks.Hostel || []).filter((b) => b === state.user.hostelBlock)
      : blocks[t.type] || [];
  openModal(
    'Edit complaint',
    `<form id="owner-edit-form" data-id="${t.id}"><p class="muted">Update the report details. Existing photos and the complaint timeline are preserved.</p><div class="field"><label for="edit-title">Issue title *</label><input id="edit-title" name="title" value="${esc(t.title)}" required minlength="5" maxlength="150"></div><div class="form-grid"><div class="field"><label for="edit-category">Category *</label><select id="edit-category" name="category" required><option value="">Choose a category</option>${choices(categories, t.category)}</select></div><div class="field"><label for="edit-priority">Priority *</label><select id="edit-priority" name="priority" required>${choices(['LOW', 'MEDIUM', 'HIGH', 'URGENT'], t.priority)}</select></div><div class="field"><label for="location-type">Location type *</label><select id="location-type" name="type" required>${choices(state.user.role === 'FACULTY' ? ['Academic'] : ['Hostel', 'Academic'], t.type)}</select></div><div class="field"><label for="location-block">Block / building *</label><select id="location-block" name="block" required><option value="">Choose a block</option>${choices(allowedBlocks, t.block)}</select></div><div class="field"><label for="location-floor">Floor *</label><select id="location-floor" name="floor" required>${choices(
      Array.from({ length: t.type === 'Hostel' ? 16 : 9 }, (_, i) => i),
      t.floor
    )}</select></div><div class="field"><label for="room">Room / lab / exact area *</label><input id="room" name="room" value="${esc(t.room)}" required maxlength="80"></div></div><div class="field"><label for="edit-description">Describe the issue *</label><textarea id="edit-description" name="description" required minlength="15" maxlength="3000">${esc(t.description)}</textarea></div><div class="form-footer"><button type="button" class="btn-outline" data-action="detail" data-id="${t.id}">Cancel</button><button type="submit" class="btn-primary">Save changes ${icon('check2')}</button></div></form>`
  );
}

async function showDeletedComplaints() {
  const records = state.demo
    ? state.tickets.filter((t) => t.deletedAt && (isAdmin() || t.userId === state.user.id))
    : (await api('complaints/deleted')).tickets;
  openModal(
    'Deleted complaints',
    `<p class="muted">Restore deleted complaints here. Completed complaints keep their status and feedback; active complaints return for admin review.</p>${records.length ? records.map((t) => `<article class="deleted-complaint"><div><small class="muted">CF-${t.id}</small><h3>${esc(t.title)}</h3><p class="muted">${esc(t.block)} · ${esc(t.room)}</p></div><button class="btn-outline" data-action="owner-restore" data-id="${t.id}">${icon('arrow-counterclockwise')} Restore</button></article>`).join('') : '<div class="empty">No deleted complaints.</div>'}`
  );
}

async function manageComplaint(id, action, data = {}) {
  if (state.demo) {
    const t = state.tickets.find((t) => t.id === id && (isAdmin() || t.userId === state.user.id));
    if (!t) throw Error('Complaint not found.');
    if (action === 'restore') {
      t.deletedAt = null;
      if (!['RESOLVED', 'CLOSED'].includes(t.status)) {
        t.status = 'REPORTED';
        t.assignedStaffId = null;
        t.assignedStaff = null;
      }
    } else {
      if (!canDeleteComplaint(t) || (action === 'edit' && !canManageComplaint(t)))
        throw Error('This complaint cannot be edited.');
      if (action === 'delete') t.deletedAt = new Date().toISOString();
      else Object.assign(t, data);
    }
    t.updatedAt = new Date().toISOString();
    t.updates.push({
      status: t.status,
      remarks: `Reporter ${action === 'edit' ? 'edited' : action === 'delete' ? 'deleted' : 'restored'} the complaint.`,
      actor: state.user.name,
      createdAt: t.updatedAt,
    });
    saveDemo();
  } else {
    await api(`complaints/${id}/${action}`, { method: 'POST', body: JSON.stringify(data) });
    await refresh();
  }
  closeModal();
  render();
  if (action === 'edit') detail(id);
  toast(
    action === 'edit'
      ? 'Complaint updated.'
      : action === 'delete'
        ? 'Complaint deleted. You can restore it from Deleted complaints.'
        : 'Complaint restored.'
  );
}

document.addEventListener(
  'click',
  async (event) => {
    const button = event.target.closest('[data-action]');
    if (
      !button ||
      ![
        'owner-edit',
        'owner-delete',
        'owner-delete-confirm',
        'owner-deleted',
        'owner-restore',
      ].includes(button.dataset.action)
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = Number(button.dataset.id);
    try {
      if (button.dataset.action === 'owner-deleted') await showDeletedComplaints();
      else if (button.dataset.action === 'owner-restore') {
        button.disabled = true;
        await manageComplaint(id, 'restore');
        await showDeletedComplaints();
      } else if (button.dataset.action === 'owner-delete-confirm') {
        button.disabled = true;
        await manageComplaint(id, 'delete');
      } else {
        const t = myTickets().find((t) => t.id === id);
        if (
          !t ||
          !canDeleteComplaint(t) ||
          (button.dataset.action === 'owner-edit' && !canManageComplaint(t))
        )
          throw Error('You cannot manage this complaint.');
        if (button.dataset.action === 'owner-edit') editComplaint(t);
        else
          openModal(
            'Delete complaint?',
            `<p><strong>${esc(t.title)}</strong></p><p class="muted">This removes the complaint from active lists. You can restore it later from Deleted complaints. Existing photos and history will be retained.</p><div class="form-footer"><button class="btn-outline" data-action="detail" data-id="${id}">Keep complaint</button><button class="btn-primary" data-action="owner-delete-confirm" data-id="${id}">${icon('trash3')} Delete complaint</button></div>`
          );
      }
    } catch (error) {
      button.disabled = false;
      toast(error.message, true);
    }
  },
  true
);

document.addEventListener(
  'submit',
  async (event) => {
    const form = event.target;
    if (form.id !== 'owner-edit-form') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await manageComplaint(
        Number(form.dataset.id),
        'edit',
        Object.fromEntries(new FormData(form))
      );
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  },
  true
);
