# CampusFix verification record

Verified on 19 October 2026 after extending the existing project in place.

## Build and automated regression checks

- Maven WAR packaging succeeded, using JDK 21 and targeting Java 17 bytecode.
- **47 JUnit tests passed, zero failures, zero errors, zero skips.**
- This includes the original 18 tests plus 29 administration/SLA/settings/analytics tests.
- The database unit/integration suite uses isolated H2 in MySQL compatibility mode. It covers original reporting/workflow/photo ownership/feedback behavior and new account administration, session versions, staff availability, policy persistence, notification switches, SLA boundaries, escalation deduplication, detailed analytics and additive migration preservation.
- JavaScript syntax checks passed for both app.js and enhancements.js.

## Actual MySQL and Tomcat deployment

- Environment: **Real MySQL 8.4.0 + Apache Tomcat/10.1.61 + Java 21.0.12.1**.
- **53 live HTTP checks passed, 0 failed**, plus a separate JSP compilation/serving check.
- Applied the actual SQL schema and migration to real MySQL, and deployed the compiled WAR to real Tomcat on loopback-only verification ports.
- Verified all four role logins, unauthenticated denial, role authorization and CSRF protection.
- Verified user creation, enable/disable, role changes, BCrypt password reset, old-password rejection, session invalidation and protection of the current Admin account.
- Verified persistent settings, custom categories/blocks and changed SLA/photo limits.
- Submitted two real photos through the Servlet multipart endpoint, checked MySQL attachment records and exact downloaded bytes, and verified owner/assigned-staff access restrictions.
- Rejected excessive photo counts, disguised image uploads and oversized photos according to the configured limits.
- Verified complete Report ? Review ? Assign ? In Progress ? Resolved ? Feedback ? Closed persistence, including all timeline events, rating and notifications.
- Verified an actual aged complaint becomes overdue, the background monitor notifies Admin without a complaint refresh, and repeat refreshes do not duplicate notices.
- Verified persisted staff performance and block analytics, and preservation of historical complaints after removing reporting choices.
- Latest verified Tomcat startup and shutdown logs had no warnings, severe messages or exceptions after JDBC cleanup fixes.
- Owned verification processes were stopped. The isolated verification database and uploads remain under ignored .runtime/. No existing user database was modified.

The exact sanitized live-check list is in [deployment-smoke-results.json](deployment-smoke-results.json). Test credentials, runtime logs, server binaries and database files are excluded from the distributable ZIP.

## Browser checks

- Inspected new Admin Users, account/staff editing, Settings, SLA summary/escalation indicators, staff performance, block analysis and detailed recurring cards.
- Confirmed clicking a block shows its statistics and filters complaint history.
- Confirmed the new seven history tabs and complaint cards render correctly.
- Checked Admin Users and complaint history at a 390-pixel viewport: document scroll width equalled client width; no horizontal page overflow.
- Fixed a duplicate Chart.js initialization found during rapid workspace changes. Subsequent navigation used the corrected renderer.
- Original landing, reporting, role workspaces, timeline, workflow board, feedback, dark mode, profile/help and exports remain in the existing codebase.

## Practical limits

This is a verified local deployment, not a public production launch or a connection to VIT's institutional systems. Configure your own accounts, credentials, HTTPS/proxy settings, backups and actual campus inventory before campus use. Compose configuration is included, but actual deployment verification used native MySQL/Tomcat because Docker's VM exhausted the host's available memory. Additional browser/device coverage, load testing and production HTTPS configuration have not been verified.

## Real backend npm launcher

`npm run dev` now launches a persistent local MySQL database and Tomcat application, rather than the browser preview. Actual startup was verified at http://127.0.0.1:8080/campusfix/ using `npm run dev -- --check`. This check created no accounts or sample records, and stopped its owned servers afterward. First normal launch asks the user to create their own administrator. The real database/uploads are separate from verification fixtures.

After adding the first-admin bootstrap and launcher, **51 automated tests passed**, including four new first-admin provisioning tests. The previously recorded 53 HTTP checks remain the full application regression evidence; the new launcher additionally passed real database/Tomcat/JSP startup verification. See RUN-BACKEND.md for the VS Code instructions.
