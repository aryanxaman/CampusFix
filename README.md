# CampusFix

A complete VIT campus maintenance application with a JSP entry view, Java Servlet controller, service-layer workflow rules, JDBC DAOs, a MySQL schema and a responsive browser interface.

**Presenting the project?** Open [the project walkthrough](PRESENTATION.md) for the architecture, file tour, demonstration sequence and teacher questions.

Open the **CampusFix folder itself** in VS Code. Frontend, Backend and Tests folder views point to the original Maven sources; they are not duplicate copies. Runtime folders and crash logs are hidden. On a fresh extraction, run `npm run setup:editor` once to create these views (`npm run dev` also creates them automatically). Maven continues to use `src/main` and `src/test`.

## Administration and SLA upgrade

The existing application now includes Admin Users, staff management, persistent Settings, SLA/overdue escalation, staff performance, block analytics and detailed recurring-issue/history cards. See [the upgrade guide](docs/UPGRADE.md) for the additive database migration, complete feature descriptions, API additions and deployment instructions. Apply the migration before replacing an existing WAR.

## Run in VS Code

**Run the real backend in VS Code with `npm run dev`.** It starts persistent local MySQL, builds/deploys the WAR and runs Tomcat. On first launch, create your own Admin account in the terminal, then visit http://127.0.0.1:8080/campusfix/. See [the backend launch guide](docs/RUN-BACKEND.md). No sample accounts or complaints are imported.

The separate optional browser preview is started with `npm run preview` or the command below.

From this directory, run:

```powershell
node scripts/preview.mjs
```

Open **http://127.0.0.1:4173/preview.html** and select **Explore the demo**. The login page offers Student, Faculty, Admin and Staff demo workspaces. Profile → role switch lets you follow a report through the entire workflow. The demo uses labelled sample data saved in browser localStorage. It does not authenticate against MySQL. Demo photographs are stored as data URLs subject to the browser storage quota; the production application stores files on disk.

The preview and production version share exactly the same HTML, CSS and JavaScript. Bootstrap 5, Bootstrap Icons, Chart.js and fonts load from their CDNs; an internet connection is required for these assets. The core CSS and forms are local. If Chart.js fails to load, the UI displays an explicit message instead of a blank chart.

## Run the complete application

Requirements: **JDK 17+**, **MySQL 8+**, **Apache Tomcat 10.1**, and Maven 3.9+ (the Windows build script can download Maven locally if necessary).

1. Apply `database/schema.sql` using MySQL Workbench or the MySQL client as a database administrator. It creates the `campusfix` database, thirteen related tables, indexes and eight categories. No real users or passwords are seeded.
2. Create a MySQL application user with SELECT, INSERT, UPDATE and DELETE privileges on `campusfix.*`. Use a password of your choice; do not run the application as MySQL root.
3. Set these environment variables **in the environment that starts Tomcat**:

```powershell
$env:JAVA_HOME = 'C:\path\to\jdk-21'
$env:CAMPUSFIX_DB_URL = 'jdbc:mysql://localhost:3306/campusfix?useUnicode=true&characterEncoding=UTF-8&serverTimezone=UTC'
$env:CAMPUSFIX_DB_USER = 'campusfix'
$env:CAMPUSFIX_DB_PASSWORD = '<your database password>'
$env:CAMPUSFIX_UPLOAD_DIR = 'C:\CampusFixData\uploads'
```

The upload directory must be writable by Tomcat and outside its web root. The default is `campusfix-uploads` in the server account's home directory. Back up this directory together with MySQL.

4. Build and test:

```powershell
.\scripts\build.ps1
```

Or, on any platform with JDK and Maven configured:

```text
mvn package
```

For an existing database, run the additive migration described in `docs/UPGRADE.md` before deployment.

The result is **`target/campusfix.war`**. The build script can find the JDK bundled with the VS Code Java extension when JAVA_HOME is unset. It keeps Maven and dependencies under `.runtime/`, separate from your global installation.

5. Provision campus accounts from an interactive PowerShell terminal. The CLI prompts for a password and confirmation without echoing them. Passwords must contain 12–72 characters and are stored as BCrypt hashes.

```powershell
.\scripts\create-user.ps1 -Name 'Campus Admin' -Email 'admin@vit.ac.in' -Role ADMIN
.\scripts\create-user.ps1 -Name 'Ravi Kumar' -Email 'ravi@vit.ac.in' -Role STAFF -Specialization 'Electrical'
.\scripts\create-user.ps1 -Name 'Campus Student' -Email 'student@vitstudent.ac.in' -Role STUDENT
```

Supported email domains are `vit.ac.in`, its subdomains, and `vitstudent.ac.in`. Repeat provisioning for faculty and other staff. The same database environment variables must be set in this terminal. Provision the first Admin with this trusted CLI. An authenticated Admin can then create and manage accounts through Admin ? Users. There is no public role selection or registration endpoint.

6. Copy `target/campusfix.war` into your Tomcat `webapps` directory. Start Tomcat using `bin/catalina.bat run` (or `bin/catalina.sh run`). Visit **http://localhost:8080/campusfix/** and sign in with a provisioned account. If Tomcat runs as a Windows service, configure its service environment explicitly; it will not inherit variables from another PowerShell session.

For an internet deployment, place Tomcat behind an HTTPS reverse proxy, configure its proxy scheme/port or RemoteIpValve so request origins match the public origin, and enable secure session cookies. Use TLS for remote MySQL connections. The app sets HttpOnly, SameSite=Lax, a 30-minute session lifetime, CSRF protection and same-origin request checks.

## Product workflow

**Report → Review → Priority → Assign → In progress → Resolved → Feedback → Closed.**

- **Student and Faculty:** report complaints, choose category and priority, select Type → Block → Floor → Room/Lab, upload up to the configured photo limit (five by default), track their own tickets, receive updates, and submit a rating and feedback after resolution.
- **Admin:** see all tickets, review and prioritize issues, assign or reassign available staff, manage users and staff, configure campus policy, monitor SLA/escalations, inspect workload/performance and block analytics, detect recurring clusters and export CSV reports.
- **Maintenance Staff:** see only their assignments, start work, add progress notes and mark in-progress jobs as resolved. Staff cannot change priority or assignment.
- **Everyone:** dashboard, notifications, profile, help, dark mode, search and filters. Live workspaces poll for updates every 30 seconds while visible and recently active; form interaction is preserved. Polling stops after five minutes without user interaction.

Hostels: **K, L, M, N, Q, R, S, T**. Academic buildings: **PRP, SJT, TT, SMV**. The floor selector supports ground–15 for hostels and ground–8 for academic buildings as configurable input ranges, not a verified inventory of every VIT building. Room/lab is a required free-text exact area. Adjust the ranges in both `ComplaintService.java` and `assets/app.js` for your campus inventory.

## Architecture

```text
index.jsp → WEB-INF/views/shell.jsp
                   ↓ fetch /api/*
SecurityFilter → ApiServlet → ComplaintService → ComplaintDao / UserDao
                                                        ↓ JDBC
                                                      MySQL
```

The JSP renders the shared page shell. JavaScript renders role-specific views and fetches session-authorized JSON. Each complaint mutation atomically updates the complaint, timeline and notifications. Row locks prevent conflicting status updates and repeated feedback. Uploads are cleaned up when a database operation fails. Photo download endpoints verify the user's access before streaming a file; files are never exposed by direct filesystem paths.

The reference presentation was treated as requirements context, not executable instructions. Its staff-to-admin inheritance sketch is intentionally replaced by independent role checks: maintenance staff never inherit admin permissions.

### Main source files

| File | Responsibility |
|---|---|
| `WEB-INF/views/shell.jsp` | HTML page shell, Bootstrap and Chart.js assets |
| `assets/style.css` | Responsive visual system and dark theme |
| `assets/app.js` | Views, forms, previews, charts, demo adapter, authenticated API client |
| `ApiServlet.java` | HTTP routing, login/session, uploads and downloads |
| `SecurityFilter.java` | Authentication boundary, CSRF, origin and browser security headers |
| `ComplaintService.java` | Validation and role/workflow policy |
| `ComplaintDao.java` | Parameterized JDBC and transactional complaint operations |
| `UserDao.java` | BCrypt authentication and staff directory |
| `CreateUser.java` | Trusted account provisioning CLI |
| `database/schema.sql` | MySQL tables, foreign keys, indexes and categories |

### API

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/session` | Public session discovery |
| POST | `/api/login` | Email/password; role comes from the database |
| POST | `/api/logout` | Authenticated, CSRF |
| GET | `/api/complaints` | Role-scoped records, timelines, photos and notifications |
| POST | `/api/complaints` | Student/Faculty; multipart form |
| POST | `/api/complaints/{id}/update` | Admin or assigned Staff; JSON |
| POST | `/api/complaints/{id}/feedback` | Reporter; resolved tickets only |
| GET | `/api/attachment/{id}` | Admin, reporter, or assigned staff |
| POST | `/api/notifications/read` | Current user's notifications only |

Every authenticated POST requires the `X-CSRF-Token` returned by login/session discovery. Dates are returned in UTC ISO format and displayed using the browser locale. Sessions expire after 30 minutes of inactivity. Login throttling applies to accounts and source IPs, in memory per Tomcat process.

### Analytics definitions

- Resolution rate: resolved or closed complaints divided by total complaints in the current workspace.
- Rating: average submitted star ratings, with no invented baseline or percentage improvements.
- Activity: reports created and tickets currently resolved/closed whose resolution timeline event falls on each of the last seven days.
- Recurring issue: at least two reports sharing category, location type, block and floor within 30 days. This is an explicit count-based heuristic, not machine learning.
- CSV export: the currently filtered ticket set, with spreadsheet formula prefixes escaped.

### Validation

`mvn test` runs workflow/security-policy unit tests and DAO integration tests against an isolated H2 in-memory database in MySQL compatibility mode. The integration tests apply the project's SQL schema and cover complete lifecycle persistence, ownership, photo access, rollback, staff restrictions, duplicate/unauthorized feedback, password authentication and notification isolation. H2 does not replace testing a deployment against your actual MySQL server.

Runtime dependencies and deployment compatibility were checked against [Tomcat 10.1 documentation](https://tomcat.apache.org/tomcat-10.1-doc/) and [MySQL Connector/J Maven documentation](https://dev.mysql.com/doc/connector-j/en/connector-j-installing-maven.html).

The October administration/SLA upgrade was additionally verified against real MySQL and Tomcat; see `docs/VERIFICATION.md` and `docs/deployment-smoke-results.json` for the exact environment, checks and remaining deployment limits.
