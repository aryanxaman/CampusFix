# Reporter confirmation of maintenance work

## Workflow

Report → Review → Assign → In progress → **Awaiting confirmation** → **Resolved** → Feedback → Closed.

1. Assigned maintenance staff start work and submit their work notes with **Awaiting confirmation** when they have completed the repair.
2. The complaint remains active. Its reporter receives a notification, a dashboard prompt and an Awaiting confirmation tab in complaint history.
3. The student or faculty member opens the complaint, checks **I checked and confirm that my problem is resolved**, then clicks **Confirm resolution**.
4. The server records the reporter's confirmation, marks the complaint Resolved and sets its resolution timestamp. The existing rating and feedback form becomes available; submitting feedback closes the complaint.
5. If the issue persists, the reporter expands **Still having the problem?**, supplies a reason and clicks **Send back to staff**. The complaint returns to In progress with the same assignment and priority. Staff can repair it and request confirmation again.

The student or faculty reporter can also resolve their own complaint directly at any open stage, without waiting for staff submission. Open the complaint, tick the same confirmation checkbox and click **Mark as resolved**. The timeline explicitly records that the reporter resolved it without a staff submission. Admins and assigned staff are notified; the resolution timestamp and feedback workflow are updated normally.

Admin, staff and other students/faculty cannot confirm on behalf of the reporter. Returning a repair to staff is only available after staff submit a fix. Duplicate confirmations and premature feedback are rejected. Confirmation/rejection, timeline entries and notifications commit atomically under a complaint row lock.

## Compatibility and deployment

Historical Resolved and Closed complaints keep their status and feedback. Only newly submitted repairs use the confirmation stage. Waiting for confirmation counts as active work; SLA and resolution-time calculations stop at reporter confirmation rather than staff submission.

The existing convenience launcher applies the additive enum migration automatically. For a standard Tomcat deployment, run the existing MigrationTool using `scripts/migrate.ps1` with migration privileges, or apply `database/migrations/reporter-confirmation.sql`, then deploy the updated WAR. Fresh installations use the updated `database/schema.sql`.

New authenticated, CSRF-protected endpoint: `POST /api/complaints/{id}/confirm`.

```json
{"confirmed":"true"}
```

To return the repair:

```json
{"confirmed":"false","remarks":"The fan still stops after a few minutes."}
```

## Verification

- 63 Java tests passed, including direct Student/Faculty resolution at every open stage, reporter-only confirmation, rejection/rework, duplicate requests, timestamps, feedback gating and notification persistence.
- HTTP checks against isolated real MySQL 8.4 and Tomcat 10.1 cover confirmation, unauthorized confirmation, direct Student/Faculty resolution, rejection, re-submission, feedback and duplicate confirmation.
- Frontend tests cover the explicit required checkbox and absence of reporter controls for other users.
- The working database was backed up before its additive migration. Existing complaints and uploads were preserved.
