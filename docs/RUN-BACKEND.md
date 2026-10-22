# Run the real CampusFix application in VS Code

On the development machine where this project was built, Java, Maven, portable MySQL and portable Tomcat are already available. Open the **CampusFix** folder in VS Code, open Terminal → New Terminal, and run:

```powershell
npm run dev
```

No npm dependencies need installing. npm launches `scripts/run-backend.py`; the application itself runs on Java Servlets/JSP, Tomcat and MySQL.

## First launch

1. The launcher detects the existing JDK, compiles the Java application and builds `target/campusfix.war`.
2. It initializes a separate, persistent local MySQL database with generated database credentials, applies the schema and additive migration, and configures a dedicated Tomcat instance.
3. It asks for your first administrator's name, VIT email and password. Default email: `admin@vit.ac.in`. **Choose your own password.** It is entered without echo and stored as a BCrypt hash. There is no default login password.
4. Once the terminal says the backend is running, open **http://127.0.0.1:8080/campusfix/**.
5. Click Campus login and sign in using the administrator email and password you entered.
6. Use **Admin → Users** to create Student, Faculty and Maintenance Staff accounts. Sign in with these accounts to use the real complaint workflow.

The database starts with no demo users or complaints. The live Tomcat interface hides demo entry buttons. Records entered here are written to MySQL, and photos are stored on disk.

## Subsequent launches

Run `npm run dev` again. It retains all accounts, complaints, settings, notifications, feedback and uploaded photos. It rebuilds only when application source or pom.xml changes. It does not reset the database or import verification fixtures.

Keep the terminal open. Press **Ctrl+C** to stop Tomcat and MySQL. The next launch uses the same data.

## Local files and ports

| Location | Purpose |
|---|---|
| `.runtime/local/mysql-data` | Persistent MySQL database |
| `.runtime/local/uploads` | Real complaint photo uploads |
| `.runtime/local/tomcat` | Dedicated local Tomcat configuration/deployment |
| `.runtime/local/logs` | MySQL and Tomcat logs |
| `.runtime/local/server.json` | Private generated database credentials and local ports |

Do not delete or share `.runtime/local/`. Back it up securely if you need to preserve the local system. It is ignored by Git and excluded from the downloadable project ZIP. Real local data is separate from `.runtime/mysql-verification-data` and `.runtime/verification-uploads`, which are only test fixtures.

Default application port: **8080**. Default MySQL port: **13307**, bound to loopback only. Tomcat also uses a loopback shutdown port. If a required port is already occupied, the launcher refuses to stop an existing service. Choose another HTTP port with:

```powershell
$env:CAMPUSFIX_LOCAL_HTTP_PORT = '8081'
npm run dev
```

Then open the URL printed by the launcher.

If PowerShell blocks `npm.ps1`, use `npm.cmd run dev` instead; changing the system execution policy is unnecessary.

## Other commands

```text
npm start       Start the same real backend
npm run build   Compile/package the WAR without starting servers
npm run preview Start the separate optional browser demo
```

`python scripts/run-backend.py --check` verifies database/Tomcat/JSP startup and then stops the owned servers. It does not create accounts. The first normal interactive `npm run dev` launch still asks you to create your administrator.

## If you move the project to another machine

The ZIP includes source, scripts and WAR, but excludes large server binaries, local data and credentials. Install Python 3, JDK 17+, Maven, MySQL 8+ and Tomcat 10.1, then follow README.md for a standard deployment. The convenience Windows launcher expects the existing portable runtimes under `.runtime/mysql-8.4.0-winx64`, `.runtime/apache-tomcat-10.1.61` and `.runtime/apache-maven-3.9.9`.

This launcher is for local development, with local JDBC transport and loopback network bindings. Public deployment uses your own database credentials, HTTPS and hosting configuration as described in docs/UPGRADE.md.

## Apply code changes

Run `npm run restart` in the project terminal to stop the local instance safely, rebuild when needed and deploy the current WAR. Existing accounts, complaints and uploads are preserved. `npm run dev` reuses an already-running instance.

Run `npm run test:frontend` for CSV regression checks. Java tests run through Maven (`scripts/build.ps1` runs tests and packages the WAR).
