# CampusFix administration and SLA upgrade

This upgrade extends the existing JSP/Servlet/Service/DAO/JDBC application. It preserves reporting, photo evidence, complaint timelines, assignment, the workflow board, feedback, notifications, dark mode and CSV export.

## Upgrade an existing deployment

1. Back up the existing MySQL database and the complete upload directory. Keep the previous deployed WAR for rollback.
2. Build with `scripts/build.ps1` or `mvn package`, using JDK 17 or newer. The Windows build script and Maven tests now use bounded heaps to support machines with limited free memory.
3. Stop the existing Tomcat application before schema migration and WAR replacement.
4. Set `CAMPUSFIX_DB_URL`, `CAMPUSFIX_DB_USER` and `CAMPUSFIX_DB_PASSWORD` to a migration account with CREATE and ALTER privileges on the existing database. Run `scripts/migrate.ps1` from an interactive PowerShell terminal with JAVA_HOME set. On other platforms invoke `edu.vit.campusfix.MigrationTool` with `target/classes` and the WAR's runtime jars on the classpath, passing `database/schema.sql`.
5. The migration adds `users.auth_version` and four new tables: `app_settings`, `admin_audit`, `complaint_escalations` and `escalation_recipients`. It uses additive/idempotent operations and never drops historical records. Repeating the migration is supported. MySQL DDL is not transactionally rolled back, so keep the backup even though the steps are repeatable.
6. Restore the runtime database account in Tomcat's environment. Runtime operations need SELECT, INSERT and UPDATE on the application tables; they do not need CREATE or ALTER. Set `CAMPUSFIX_UPLOAD_DIR` to the existing external upload directory. A Windows Tomcat service must have these variables configured in its own service environment.
7. Replace the deployed WAR with `target/campusfix.war`, then restart Tomcat 10.1. Existing sessions are invalidated by this upgrade and users must sign in again.
8. Sign in as an existing Admin. If this is a fresh database, provision the first Admin with `scripts/create-user.ps1`. Further users can be created through Admin → Users.
9. Open Admin settings → Deployment readiness → Run check. The check verifies the MySQL connection, all required schema tables, the authentication-version column and writable upload storage. Then verify a real report, assignment, resolution and feedback cycle.

Database configuration remains environment-based. Connector/J is explicitly loaded for Tomcat's WAR class loader. Connections have bounded connection/socket timeouts and synchronize the connection time zone to the database session, so SLA calculations do not drift between host time zones. Configure TLS for nonlocal MySQL connections. Use HTTPS and secure session cookies for a public deployment.

## New administrator capabilities

- **Users:** searchable directory; creation of Student, Faculty, Admin and Maintenance Staff accounts; name/role/status editing; password reset. Passwords use BCrypt and are never returned in user-list responses or audit rows.
- **Session revocation:** disabling an account, changing its role or resetting its password increments an authentication version. The next authenticated request, including session discovery, verifies it against MySQL. Existing sessions cannot retain an old role or disabled access.
- **Safeguards:** an Admin cannot disable their own account or remove their own Admin role. At least one enabled Admin is retained. Staff with active complaints must have that work reassigned before account disablement or a role change. Historical staff profiles remain for existing foreign-key references.
- **Maintenance team:** specialization and availability management; enabled/disabled state; active and completed assignment counts; average resolution time and rating; completion performance; direct assignment views. Unavailable staff can finish existing work but cannot receive new assignments.
- **Settings:** SLA targets, photo count, photo size, categories, hostel blocks, academic blocks and four notification preferences are saved in MySQL. Removed reporting choices remain visible on historical complaints. New choices are validated on both the browser and server.

## SLA and escalation behavior

Defaults: Urgent 4 hours; High 24 hours; Medium 48 hours; Low 72 hours. All run from complaint creation. Priority and SLA-policy edits recalculate deadlines, including the policy used in analytics. The clock stops at resolution, not at feedback closure.

- **Within SLA:** more than 20% of the target remains.
- **Approaching deadline:** the last 20% of the target, up to the deadline.
- **Overdue / Escalation Required:** an unresolved complaint exceeds its deadline.
- **Resolved within SLA / Resolved after SLA:** historical outcome after the clock has stopped.

Overdue is a separate service indicator; it never overwrites the complaint's workflow status. Admin dashboards, complaint cards and detail dialogs show the indicator and deadline. The Admin dashboard links directly to overdue complaints.

A ServletContext lifecycle listener scans active work in the background every 60 seconds. `CAMPUSFIX_SLA_SCAN_SECONDS` can set an interval from 5 to 3600 seconds. An Admin complaint refresh also reconciles overdue records. Escalation notices are deduplicated per complaint and recipient across refreshes, threads and restarts. An Admin added later can receive the notice. The monitor shuts down and releases its JDBC driver/cleanup thread when the WAR is stopped or redeployed.

General Admin notifications and SLA escalation alerts have independent switches. Disabling notifications affects future notices; it does not delete previous notifications. Re-enabling escalation alerts delivers notices that were previously suppressed, without duplicating those already delivered.

## Analytics definitions

- **Active assignments:** attributed complaints outside Resolved/Closed.
- **Completed assignments:** attributed complaints in Resolved/Closed, counted once each.
- **Average resolution time:** mean elapsed hours from reporting to resolution, using resolved records with a resolution timestamp.
- **Average rating:** mean submitted feedback rating, with an em dash when no rating exists.
- **Completion performance:** completed / all currently attributed assignments. It is not a separate productivity or SLA score.
- **Within-SLA performance:** completed complaints resolved within the current SLA policy / all completed attributed complaints.
- **Campus blocks:** visual selectors for all configured hostel and academic blocks, including zero-report blocks. A click shows block metrics; View complaints applies a matching history filter.
- **Recurring issues:** existing category + location type + block + floor grouping within 30 days, with at least two complaints. Cards add date range, average resolution, latest complaint and an exact related-complaint view.

## Complaint history

The new card layout has All, Pending, In Review, Assigned, In Progress, Resolved and Closed tabs. It retains search, category/priority filters and CSV export, and adds block and SLA filters. Student/Faculty history remains scoped to their own reports. Staff history remains scoped to their assignments. Admin sees all complaints.

## Additional API endpoints

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/config` | Public reporting choices and service policy; no credentials or account data |
| GET | `/api/notifications` | Current user's notices, without triggering an escalation scan |
| GET | `/api/admin/users` | Admin only |
| POST | `/api/admin/users` | Admin only; create account |
| POST | `/api/admin/users/{id}/update` | Admin only; name, role, active, specialization, available |
| POST | `/api/admin/users/{id}/password` | Admin only; password reset |
| GET | `/api/admin/settings` | Admin only |
| POST | `/api/admin/settings` | Admin only; JSON `{ "config": "<serialized settings JSON>" }` |
| GET | `/api/admin/analytics` | Admin only; server-calculated staff/block/recurring metrics |
| GET | `/api/admin/health` | Admin only; connection, schema and upload readiness |

All authenticated POST operations retain CSRF checks. Account, password and settings changes record an administrative audit event without password material.

## Limits and deployment options

Photo configuration supports 1–10 photos and 1–10 MB per photo. The Servlet has a 10 MB per-file and 102 MB total request ceiling. Reporting categories support 1–50 unique names (80 characters each); each block list supports 1–50 unique names (10 characters each). Floor ranges remain the original configurable code defaults; no verified campus room inventory was added.

`compose.yaml` provides official MySQL 8.4 and Tomcat 10.1/JDK 17 images, database health dependency, persistent database/upload volumes, and a loopback-only application port. Copy `.env.example` to `.env`, supply strong unique passwords, build the WAR, then run `docker compose up -d`. The database is not exposed on a host port. The Compose network uses unencrypted JDBC only inside the local private network; use certificate-verified TLS for a remote database. The init SQL runs only for a fresh volume; existing volumes must use the migration tool.

The actual verification run on this machine uses portable Windows MySQL and Tomcat because Docker's VM exceeded the host's available memory. These native processes are isolated from existing databases/services and are stopped after the checks. No production data or credentials are included in the ZIP.

## Reproduce verification

Run `mvn test` for the JUnit suite. To repeat the native deployment check on this machine, retain the ignored `.runtime` distributions, generated verification environment, isolated database and JAVA_HOME, build the WAR, and run `python scripts/native-verification.py`. The script refuses to occupy an already-used verification port and never stops an existing service. It tests actual Servlet endpoints and writes sanitized results to `docs/deployment-smoke-results.json`.

`DeploymentFixture` is test-only code, excluded from the WAR. It refuses to provision a database that already contains accounts unless the existing isolated fixture has already been initialized by the verification harness. Test credentials, databases, uploaded test evidence and runtime logs remain under ignored `.runtime/` and are excluded from the distributable archive.

## Student hostel residence

Admin assigns a student hostel under Users → Edit → Student hostel block. A student can submit hostel complaints only for that assigned block; an unassigned student must contact Admin first. Academic reporting remains available. The Servlet uses the authenticated residence, and backend validation rejects another block even when submitted manually. Changing the residence invalidates existing sessions. Existing complaint history is preserved.

The additive migration adds `users.hostel_block`; no existing complaints are deleted. Verified with 59 Java tests and 75 HTTP checks on MySQL/Tomcat, including forged block submissions.

## Student signup and reporting permissions

The login screen links to Student signup. Students provide their name, VIT email, password and required hostel block. The server creates only a STUDENT account, hashes the password with BCrypt and stores the selected hostel. Existing emails cannot be registered again. The signup endpoint is rate limited. Faculty, Admin and Staff accounts remain Admin-managed.

Students may report in every academic building (PRP, SJT, TT and SMV) and only their stored hostel block. Faculty may report only in academic buildings and cannot submit hostel complaints. Both the form and backend enforce this policy. Admin changes hostel assignments if a student moves; residence is not reselected on every login. Existing complaint history is retained.

The signup block is declared by the student; it is not an external verification of VIT hostel allocation. Admin can review and correct it. No email verification service is configured.

Current validation: 59 Java tests, 3 frontend regression tests, 75 real MySQL/Tomcat HTTP checks.
