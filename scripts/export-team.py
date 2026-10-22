"""Export local CampusFix records and photos for the authorized project team."""

from datetime import datetime
from pathlib import Path
import json
import os
import subprocess
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
local = root / '.runtime/local'
config = json.loads((local / 'server.json').read_text(encoding='utf-8'))
output = root.parent / f'CampusFix-Team-Data-{datetime.now():%Y%m%d-%H%M%S}.zip'
instructions = '''CampusFix team database import

This package contains a snapshot of accounts, complaints and uploaded photos.
Share it privately with your project team. Login details are in LOGIN-DETAILS.txt.
It does not contain the original machine's MySQL root password or server configuration.

Use a fresh MySQL instance/database for import. Do not import over a teammate's
existing CampusFix database: this dump recreates its tables.

1. Extract this ZIP.
2. Open MySQL Workbench and connect to your own MySQL server.
3. Choose Server > Data Import > Import from Self-Contained File.
4. Select campusfix.sql and click Start Import. Refresh the Schemas list.
   Alternative from Command Prompt (cmd.exe):
   mysql -u root -p < campusfix.sql
   Enter YOUR MySQL root password, not a CampusFix website password.
5. Copy the uploads folder to a permanent location, for example
   C:\\CampusFixData\\uploads. Keep its files and subfolders unchanged.
6. Configure Tomcat's CAMPUSFIX_DB_URL, CAMPUSFIX_DB_USER and
   CAMPUSFIX_DB_PASSWORD for YOUR database. The website login accounts in the
   dump are separate from the MySQL connection user. Create/grant the application
   database user following README.md.
7. Set CAMPUSFIX_UPLOAD_DIR to the copied uploads folder before starting Tomcat.
8. Deploy the project WAR to Tomcat 10.1 using README.md, start Tomcat, and open
   http://localhost:8080/campusfix/. Sign in with an account in LOGIN-DETAILS.txt.

If using the portable Windows launcher instead of standard Tomcat deployment,
initialize its local database first, stop it safely, copy the photos into that
project's .runtime/local/uploads, restart it, and import this SQL into its own
local MySQL instance (normally port 13307). Its database credentials are in its
own .runtime/local/server.json. Import only when no one is using the website.

The GitHub code, Java/Tomcat/MySQL setup and this data package are all needed.
This is a snapshot: later records and photos do not sync across computers.
'''
env = dict(os.environ)
env['MYSQL_PWD'] = config['rootPassword']
with tempfile.TemporaryDirectory(prefix='campusfix-export-') as temporary:
    sql = Path(temporary) / 'campusfix.sql'
    with sql.open('wb') as stream:
        subprocess.run([
            str(root / '.runtime/mysql-8.4.0-winx64/bin/mysqldump.exe'),
            '--no-defaults', '--host=127.0.0.1',
            f"--port={config['databasePort']}", '--user=root', '--protocol=TCP',
            '--single-transaction', '--quick', '--no-tablespaces',
            '--set-gtid-purged=OFF', '--default-character-set=utf8mb4',
            '--databases', 'campusfix',
        ], env=env, stdout=stream, stderr=subprocess.PIPE, check=True)
    if sql.stat().st_size < 100:
        raise RuntimeError('Database export was unexpectedly empty.')
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.write(sql, 'campusfix.sql')
        archive.writestr('IMPORT-INSTRUCTIONS.txt', instructions)
        archive.write(local / 'LOGIN-DETAILS.txt', 'LOGIN-DETAILS.txt')
        archive.writestr('uploads/', '')
        photos = 0
        for photo in (local / 'uploads').rglob('*'):
            if photo.is_file():
                archive.write(photo, 'uploads/' + photo.relative_to(local / 'uploads').as_posix())
                photos += 1
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        assert b'CREATE TABLE `users`' in archive.read('campusfix.sql')
        assert b'INSERT INTO `users`' in archive.read('campusfix.sql')
print(f'Team package created: {output}')
print(f'Database SQL and login details included; uploaded files: {photos}. ZIP integrity verified.')
