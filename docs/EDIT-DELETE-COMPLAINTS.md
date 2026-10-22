# Edit, delete and restore submitted complaints

Students and faculty can manage only their own complaints. Open **My complaints**, select a report, then use **Edit complaint** or **Delete complaint**.

Admin can delete and restore any complaint from **All complaints**, at any stage. Admin also has a **Deleted complaints** button to inspect and restore archived reports. This does not grant permission to edit reporter-entered details or confirm the fix on behalf of the reporter. Administrative deletion/restoration is identified in the timeline and notifies the reporter, following notification preferences.

## Edit

- Available while Submitted, Under review or Assigned, until staff start work.
- Supports title, description, category, priority and Type → Block → Floor → Room/Lab.
- Existing hostel/academic restrictions and server validation apply to edits.
- Existing photos, creation date, assignment, status and timeline are retained. A new timeline entry records the edit; administrators and assigned staff receive notices according to notification preferences.
- Location edits use a separate location row instead of changing other complaints sharing the previous location.

## Delete and restore

- Delete is available for all of the reporter's own complaints, including previous Resolved and Closed reports, with a confirmation dialog.
- Deletion sets `deleted_at`: it removes the complaint from active lists, assignments, analytics and SLA escalation. It does not remove the stored report, evidence or timeline.
- Deleted complaints cannot be updated, confirmed resolved, given feedback or accessed through the photo endpoint.
- In **My complaints → Deleted complaints**, the reporter can click **Restore**.
- Restoring an active complaint preserves its content, evidence and history, resets status to Submitted and clears assignment for fresh Admin review. Restoring a Resolved or Closed complaint instead retains its completed status, resolution timestamp, assignment, rating and feedback. Creation dates are retained; a restored active report may already be overdue.
- Other reporters and maintenance staff cannot delete or restore someone else's report. Admin can delete and restore all reports and browse the complete archive. Editing reporter-entered details remains restricted to the reporter; maintenance staff cannot browse deleted complaints.
- In-progress, awaiting-confirmation, resolved and closed reports cannot be edited, but their reporter can delete and restore them.

## API and deployment

All mutations use the existing session authentication and CSRF checks:

- `POST /api/complaints/{id}/edit` — the same validated text/location fields as a report, as JSON. Existing photos are preserved; this form does not replace or add attachments.
- `POST /api/complaints/{id}/delete` — JSON `{}`.
- `POST /api/complaints/{id}/restore` — JSON `{}`.
- `GET /api/complaints/deleted` — reporter-scoped archive; Admin may inspect all archived reports.

The convenience launcher applies the additive `deleted_at` migration automatically. Standard deployments can use MigrationTool or apply `database/migrations/reporter-edit-delete.sql` once before deploying the updated WAR. Fresh databases use the updated schema.

Validation: 72 Java tests and 13 frontend tests passed. HTTP checks against isolated MySQL 8.4 and Tomcat 10.1 cover editing, ownership, administrator deletion/restoration, reporter notifications, location policy, safe deletion, CSRF, archived visibility, restore, timestamps and retention of evidence/history, including completed reports and their feedback. Existing resolution and feedback workflows remain covered.
