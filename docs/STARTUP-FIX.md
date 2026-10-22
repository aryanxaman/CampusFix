# Windows MySQL startup fix — 22 October 2026

The local MySQL log showed InnoDB file-read failures and a later allocation crash before the database listener started. The database was stopped and an offline copy of the data and matching configuration was saved under the ignored `.runtime/recovery-backups/` folder before testing changes.

The local launcher now explicitly uses `--innodb-flush-method=normal` and `--innodb-log-buffer-size=8M` alongside its existing 64 MB buffer pool. This applies to initialization and normal startup. MySQL documents `normal` as buffered I/O on Windows: https://dev.mysql.com/doc/refman/8.4/en/innodb-parameters.html

No database files were deleted or reinitialized. The launcher now names the failed service, its exit code and log path instead of displaying only a generic startup error.

Verification on the existing database: `npm run dev -- --check` passed, including MySQL startup, JSP/Tomcat readiness and clean shutdown. A second normal startup passed; Admin authentication, 12 existing accounts, 9 complaints and the writable upload directory were verified. Buffered I/O and the 8 MB log buffer were confirmed through MySQL. Doublewrite and commit-flush protections remained enabled. See `startup-fix-verification.json` for the saved results.

Run `npm run dev` from the CampusFix folder. If CampusFix is already running, the launcher prints its existing URL.
