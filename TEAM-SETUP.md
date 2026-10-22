# CampusFix — Team Setup Guide

Follow this guide to run the real CampusFix application with Java, Tomcat and MySQL on another Windows computer. This uses a standard installation; the project's `npm run dev` command expects portable server tools that are currently installed only on Aryan's computer.


1. Open https://github.com/aryanxaman/CampusFix.
2. Choose **Settings → Collaborators → Add people**.
3. Enter each teammate's GitHub username and send the invitation.
4. Each teammate must accept the invitation through GitHub or email.


Send the latest **CampusFix-Team-Data-*.zip** from Aryan's Desktop privately to the teammates. Create a fresh export after changing accounts, complaints or uploads.

It contains:

- `campusfix.sql`: accounts, complaints and other saved records.
- `LOGIN-DETAILS.txt`: the website account emails and passwords.
- `IMPORT-INSTRUCTIONS.txt`: database import notes.
- `uploads/`: complaint photos included at export time.

The ZIP is a snapshot. Later records and uploads are not included automatically. To create a fresh snapshot on Aryan's machine while the local backend is running, run `python scripts/export-team.py` from the project folder. It creates a new dated ZIP on the Desktop.

## 3. Teammates install the software

Install these tools on each computer:

| Tool | Required version or purpose |
|---|---|
| Git | Clone and update the repository |
| VS Code | Open and edit the project |
| Node.js | Provides npm for the editor setup command |
| JDK | Version 17 or newer |
| Maven | Version 3.9 or newer |
| MySQL Server | Version 8 or newer |
| MySQL Workbench | Import and inspect the database |
| Apache Tomcat | Version 10.1; use the binary ZIP distribution |

Remember the MySQL root password chosen during installation. It is separate from the website passwords.

In a new VS Code terminal, verify:

```powershell
git --version
node --version
npm.cmd --version
java -version
javac -version
mvn -version
```

If a command is not recognized, finish installing that tool and configure its PATH, then restart VS Code. Maven must report Java 17 or newer. Internet access is needed for Maven dependencies and the website's CDN assets.

## 4. Download and open the code

Open a PowerShell terminal in the folder where you want to save the project:

```powershell
git clone https://github.com/aryanxaman/CampusFix.git
cd CampusFix
npm.cmd run setup:editor
code .
```

Complete GitHub sign-in if prompted. The VS Code sidebar will show **Frontend**, **Backend** and **Tests** shortcuts. The actual tracked source files are under `src/main/webapp`, `src/main/java` and `src/test`.

## 5. Import the shared database

Use a fresh database installation or back up existing CampusFix data first. The SQL export recreates CampusFix tables and can overwrite existing records.

1. Extract the team data ZIP.
2. Open MySQL Workbench and connect to your MySQL server using your own root account.
3. Choose **Server → Data Import**.
4. Select **Import from Self-Contained File**.
5. Browse to the extracted `campusfix.sql`.
6. Click **Start Import** and check that it completes successfully.
7. Refresh the Schemas list. You should see `campusfix`.

Do not import `database/schema.sql` instead of this export if you want Aryan's saved accounts and complaints. The schema alone does not include them.

## 6. Create the application's database user

Open a SQL query tab in MySQL Workbench as root. Replace `ChooseYourDatabasePassword` with a password of your choice, then run:

```sql
CREATE USER 'campusfix'@'localhost'
IDENTIFIED BY 'ChooseYourDatabasePassword';

GRANT SELECT, INSERT, UPDATE, DELETE
ON campusfix.*
TO 'campusfix'@'localhost';
```

If this user already exists, use its existing password and apply the GRANT statement. Do not recreate it blindly. This database user is separate from Admin, Student, Faculty and Staff website accounts.

## 7. Configure the backend

Open a PowerShell terminal inside the CampusFix project. Replace the JDK path and database password with your own values:

```powershell
$env:JAVA_HOME = "C:\path\to\your\jdk"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$env:CAMPUSFIX_DB_URL = "jdbc:mysql://localhost:3306/campusfix?serverTimezone=UTC&sslMode=DISABLED&allowPublicKeyRetrieval=true"
$env:CAMPUSFIX_DB_USER = "campusfix"
$env:CAMPUSFIX_DB_PASSWORD = "ChooseYourDatabasePassword"
$env:CAMPUSFIX_UPLOAD_DIR = "C:\CampusFixData\uploads"

New-Item -ItemType Directory -Force -Path $env:CAMPUSFIX_UPLOAD_DIR
```

Use the same password as Step 6. If MySQL runs on a different port, replace `3306` in the JDBC URL.

Copy the contents of the extracted `uploads` folder into `C:\CampusFixData\uploads`, preserving filenames and subfolders. If the export has no photos, the destination can remain empty.

These environment variables apply to this terminal and processes started from it. Keep using the same terminal for the build and Tomcat startup below. Repeat the configuration when using a new terminal.

## 8. Build and test

From the project folder:

```powershell
mvn package
```

Wait for **BUILD SUCCESS**. The result is `target\campusfix.war`.

Optional frontend regression checks:

```powershell
npm.cmd run test:frontend
```

## 9. Deploy and start Tomcat

Before deploying, upgrade the imported database to match the current code. Keep Tomcat stopped, back up the database, then run this in the configured terminal using your own MySQL root password:

```powershell
$env:CAMPUSFIX_DB_USER = "root"
$taskMigrationPassword = Read-Host "Your MySQL root password" -AsSecureString
$env:CAMPUSFIX_DB_PASSWORD = [System.Net.NetworkCredential]::new('', $taskMigrationPassword).Password
try {
    & .\scripts\migrate.ps1
    if (-not $?) { throw "Migration failed. Fix it before starting Tomcat." }
} finally {
    Remove-Item Env:CAMPUSFIX_DB_PASSWORD -ErrorAction SilentlyContinue
    $env:CAMPUSFIX_DB_USER = "campusfix"
    Remove-Variable taskMigrationPassword -ErrorAction SilentlyContinue
}
```

Set `CAMPUSFIX_DB_PASSWORD` back to the application password from Step 6 before starting Tomcat. MigrationTool preserves existing records and adds missing fields, including user deletion and reporter confirmation. Repeat this migration step after future code updates that change the schema. A migration account with suitable privileges can be used instead of root.

Extract the Tomcat 10.1 binary ZIP to a folder. In the same configured PowerShell terminal, replace the example path with the real folder containing Tomcat's `bin`, `conf` and `webapps` directories:

```powershell
$tomcatPath = "C:\path\to\apache-tomcat-10.1"

Copy-Item ".\target\campusfix.war" "$tomcatPath\webapps\campusfix.war"

& "$tomcatPath\bin\catalina.bat" run
```

Keep this terminal open. MySQL must also remain running. For these instructions, start Tomcat from the terminal rather than as a Windows service so it inherits the configured environment.

## 10. Open CampusFix and sign in

Open:

http://localhost:8080/campusfix/

Click **Campus login**. Use an email and password from the private `LOGIN-DETAILS.txt` supplied with the data package. It includes Admin, Student, Faculty and Maintenance Staff accounts.

CampusFix selects the dashboard automatically from the account's role. You do not need to create another Admin after importing the shared database.

## 11. Stop and run again

Press **Ctrl+C** in the Tomcat terminal to stop the website. MySQL records and uploaded photos remain saved.

To start again, make sure MySQL is running, repeat the environment configuration from Step 7 in your terminal, set `$tomcatPath` again and run:

```powershell
& "$tomcatPath\bin\catalina.bat" run
```

## 12. Get future code updates

Before editing, run from the project folder:

```powershell
git pull origin main
```

To apply updated code to the website, stop Tomcat, run `mvn package`, copy the new WAR into `webapps` and restart Tomcat using the configured terminal. Refresh the browser with **Ctrl+F5**. Follow any migration instructions provided with future schema changes.

Git updates source code. It does not synchronize database records or uploaded photos. Each teammate has a separate database copy. To collaborate on the same live complaints, use one shared deployed backend and database.

## Troubleshooting

| Problem | Check |
|---|---|
| GitHub repository cannot be cloned | Accept the collaborator invitation and sign in with the invited account. |
| PowerShell blocks npm.ps1 | Use `npm.cmd` as shown above. |
| Java or Maven command not found | Install the tool, configure PATH and reopen the terminal. |
| Maven uses an older Java version | Set JAVA_HOME and prepend its bin directory as in Step 7. |
| Database access denied | Check the application database user, its password and grants. Website passwords are different. |
| Database connection refused | Start MySQL and check its port against CAMPUSFIX_DB_URL. |
| Website says email/password incorrect | Confirm the team SQL export was imported into the same database used by Tomcat. Use LOGIN-DETAILS.txt. |
| Port 8080 is already in use | Stop your other Tomcat instance or configure this Tomcat's HTTP Connector port in conf/server.xml, then use that port in the URL. |
| Website returns 404 | Check that campusfix.war was deployed and inspect Tomcat's startup logs for deployment errors. |
| Photos are missing | Check the uploads folder contents and CAMPUSFIX_UPLOAD_DIR. The current data export has no photos. |
| Old design still appears | Confirm the latest WAR is deployed, then press Ctrl+F5. |
