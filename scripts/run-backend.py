"""Persistent local CampusFix: real MySQL, compiled JSP/Servlet WAR, Tomcat, and real accounts.
No fixture accounts or browser sample records are imported. Ctrl+C stops owned servers; data persists.
"""

import argparse, getpass, hashlib, json, os, pathlib, secrets, shutil, socket, subprocess, sys, time, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
RUNTIME = ROOT / ".runtime"
LOCAL = RUNTIME / "local"
LOCAL.mkdir(parents=True, exist_ok=True)
LOGS = LOCAL / "logs"
LOGS.mkdir(exist_ok=True)
FLAGS = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
env = dict(os.environ)


def find_java():
    candidates = []
    if env.get("JAVA_HOME"):
        candidates.append(pathlib.Path(env["JAVA_HOME"]))
    installed_compiler = shutil.which("javac.exe")
    if installed_compiler:
        candidates.append(pathlib.Path(installed_compiler).resolve().parents[1])
    candidates.extend(
        sorted(
            (pathlib.Path.home() / ".vscode/extensions").glob("redhat.java-*/jre/*"), reverse=True
        )
    )
    for candidate in candidates:
        executable = candidate / "bin/javac.exe"
        if executable.exists():
            version = subprocess.run(
                [str(executable), "-version"], capture_output=True, text=True, creationflags=FLAGS
            )
            try:
                if int((version.stdout + version.stderr).split()[1].split(".")[0]) >= 17:
                    return candidate
            except (IndexError, ValueError):
                pass
    raise RuntimeError("JDK 17+ was not found. Set JAVA_HOME to a JDK, then run npm run dev again.")


def run(args, **kwargs):
    result = subprocess.run(
        [str(a) for a in args], env=kwargs.pop("env", env), creationflags=FLAGS, **kwargs
    )
    if result.returncode:
        raise RuntimeError(
            "A setup command failed. See the terminal output or .runtime/local/logs."
        )
    return result


JAVA_HOME = find_java()
JAVA = JAVA_HOME / "bin/java.exe"
env["JAVA_HOME"] = str(JAVA_HOME)


def java_args(classpath, main, *args):
    return [JAVA, "-Xms16m", "-Xmx96m", "-XX:+UseSerialGC", "-cp", classpath, main, *args]


def build():
    files = [ROOT / "pom.xml"] + [p for p in (ROOT / "src/main").rglob("*") if p.is_file()]
    fingerprint = hashlib.sha256()
    for file in sorted(files):
        fingerprint.update(str(file.relative_to(ROOT)).encode())
        fingerprint.update(file.read_bytes())
    digest = fingerprint.hexdigest()
    marker = LOCAL / "build.sha256"
    if (
        (ROOT / "target/campusfix.war").exists()
        and marker.exists()
        and marker.read_text() == digest
    ):
        return
    maven = RUNTIME / "apache-maven-3.9.9"
    jars = list((maven / "boot").glob("plexus-classworlds-*.jar"))
    if not jars:
        raise RuntimeError("Local Maven was not found. Run scripts/build.ps1 first.")
    print("Building the real Java application...", flush=True)
    command = [
        JAVA,
        "-Xms32m",
        "-Xmx128m",
        "-XX:+UseSerialGC",
        "-Dmaven.home=" + str(maven),
        "-Dclassworlds.conf=" + str(maven / "bin/m2.conf"),
        "-Dmaven.multiModuleProjectDirectory=" + str(ROOT),
        "-cp",
        jars[0],
        "org.codehaus.plexus.classworlds.launcher.Launcher",
        "-B",
        "-ntp",
        "-Dmaven.repo.local=" + str(RUNTIME / "repository"),
        "-DskipTests",
        "package",
    ]
    run(command, cwd=ROOT)
    marker.write_text(digest)


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument(
    "--check",
    action="store_true",
    help="Check real backend startup without creating an account; then stop owned processes.",
)
parser.add_argument("--build-only", action="store_true", help="Compile/package the WAR, then exit.")
parser.add_argument(
    "--admin-file",
    type=pathlib.Path,
    help="Private JSON file for first administrator setup; only used when no administrator exists.",
)
parser.add_argument(
    "--restart",
    action="store_true",
    help="Safely restart this local CampusFix instance and deploy the current WAR.",
)
args = parser.parse_args()
build()
if args.build_only:
    sys.exit(0)
MYSQL = RUNTIME / "mysql-8.4.0-winx64"
TOMCAT_HOME = RUNTIME / "apache-tomcat-10.1.61"
if not (MYSQL / "bin/mysqld.exe").exists() or not (TOMCAT_HOME / "bin/bootstrap.jar").exists():
    raise RuntimeError(
        "Portable MySQL/Tomcat were not found under .runtime. See docs/RUN-BACKEND.md for setup."
    )

config_path = LOCAL / "server.json"
if not config_path.exists():
    config_path.write_text(
        json.dumps(
            {
                "databasePassword": secrets.token_urlsafe(24),
                "rootPassword": secrets.token_urlsafe(24),
                "databasePort": 13307,
                "httpPort": 8080,
                "shutdownPort": 18006,
                "shutdownToken": secrets.token_hex(24),
            },
            indent=2,
        )
    )
config = json.loads(config_path.read_text())
db_port = int(os.environ.get("CAMPUSFIX_LOCAL_DB_PORT", config["databasePort"]))
http_port = int(os.environ.get("CAMPUSFIX_LOCAL_HTTP_PORT", config["httpPort"]))
shutdown_port = int(config.get("shutdownPort", 18006))
shutdown_token = config.get("shutdownToken", "CampusFixLocalStop")
# Repeated starts should open the existing application instead of colliding with MySQL.
url = f"http://127.0.0.1:{http_port}/campusfix/"
local_http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
if args.restart:
    try:
        with socket.create_connection(("127.0.0.1", shutdown_port), 3) as connection:
            connection.sendall(shutdown_token.encode())
    except OSError:
        pass
    # The owning launcher shuts down MySQL after Tomcat exits. Allow both to finish.
    for _ in range(60):
        try:
            with socket.create_connection(("127.0.0.1", db_port), 0.5):
                pass
        except OSError:
            # The listener can close before InnoDB releases its on-disk files.
            time.sleep(2)
            break
        time.sleep(0.5)
try:
    with local_http.open(url + "api/config", timeout=3) as response:
        running_config = json.load(response)
    with local_http.open(url, timeout=3) as response:
        running_page = response.read().decode("utf-8")
    if (
        isinstance(running_config, dict)
        and "categories" in running_config
        and "assets/app.js" in running_page
    ):
        print("\nCampusFix is already running: " + url, flush=True)
        print(
            "Open that URL in your browser. Your existing accounts and records are ready.",
            flush=True,
        )
        sys.exit(0)
except (OSError, ValueError):
    pass
for port in [db_port, http_port, shutdown_port]:
    with socket.socket() as s:
        try:
            s.bind(("127.0.0.1", port))
        except OSError:
            sys.exit(
                f"CampusFix could not start: port {port} is in use, but the website is not ready. Check .runtime/local/logs or stop the earlier CampusFix terminal with Ctrl+C and retry. Your data is preserved."
            )
env.update(
    CAMPUSFIX_DB_URL=f"jdbc:mysql://127.0.0.1:{db_port}/campusfix?serverTimezone=UTC&sslMode=DISABLED&allowPublicKeyRetrieval=true",
    CAMPUSFIX_DB_USER="campusfix",
    CAMPUSFIX_DB_PASSWORD=config["databasePassword"],
    CAMPUSFIX_UPLOAD_DIR=str(LOCAL / "uploads"),
    CAMPUSFIX_SLA_SCAN_SECONDS="60",
)
# Keep normal development separate from every verification fixture and sample account.
env.pop("CAMPUSFIX_TEST_FIXTURE", None)
env.pop("CAMPUSFIX_TEST_PASSWORD", None)
DATA = LOCAL / "mysql-data"
BASE = LOCAL / "tomcat"
BASE.mkdir(exist_ok=True)
if not (BASE / "conf/server.xml").exists():
    shutil.copytree(TOMCAT_HOME / "conf", BASE / "conf", dirs_exist_ok=True)
for name in ["logs", "temp", "webapps", "work"]:
    (BASE / name).mkdir(exist_ok=True)
server = BASE / "conf/server.xml"
text = server.read_text()
import re

text = re.sub(
    r'(<Server\s+)port="[^"]+"', lambda m: m.group(1) + f'port="{shutdown_port}"', text, count=1
)
text = re.sub(
    r'(<Server[^>]*\s)shutdown="[^"]+"',
    lambda m: m.group(1) + f'shutdown="{shutdown_token}"',
    text,
    count=1,
)
text = re.sub(
    r'(<Connector\s+)port="(?:8080|18080|\d+)"',
    lambda m: m.group(1) + f'port="{http_port}" address="127.0.0.1"',
    text,
    count=1,
)
# Repeated starts retain one loopback address attribute.
text = re.sub(r'address="127\.0\.0\.1"\s+address="127\.0\.0\.1"', 'address="127.0.0.1"', text)
server.write_text(text)
classpath = str(ROOT / "target/classes") + os.pathsep + str(ROOT / "target/campusfix/WEB-INF/lib/*")
fresh = not (DATA / "mysql").exists()
mysql = None
tomcat = None
mysql_log = (LOGS / "mysql.log").open("ab")
tomcat_log = (LOGS / "tomcat.log").open("ab")


def wait_port(port, process):
    for _ in range(120):
        if process.poll() is not None:
            name = "MySQL" if process is mysql else "Tomcat"
            log = LOGS / ("mysql.log" if process is mysql else "tomcat.log")
            raise RuntimeError(f"{name} exited during startup (exit code {process.returncode}). See {log}")
        try:
            with socket.create_connection(("127.0.0.1", port), 1):
                return
        except OSError:
            time.sleep(0.5)
    raise RuntimeError("Server startup timed out. Check .runtime/local/logs.")


try:
    if fresh:
        print("Initializing your persistent local MySQL database...", flush=True)
        with (LOGS / "mysql-initialize.log").open("wb") as log:
            run(
                [
                    MYSQL / "bin/mysqld.exe",
                    "--no-defaults",
                    "--initialize-insecure",
                    "--basedir=" + str(MYSQL),
                    "--datadir=" + str(DATA),
                    "--innodb-buffer-pool-size=64M",
                    "--innodb-flush-method=normal",
                    "--innodb-log-buffer-size=8M",
                    "--performance-schema=OFF",
                    "--console",
                ],
                stdout=log,
                stderr=subprocess.STDOUT,
            )
    mysql = subprocess.Popen(
        [
            str(MYSQL / "bin/mysqld.exe"),
            "--no-defaults",
            "--basedir=" + str(MYSQL),
            "--datadir=" + str(DATA),
            f"--port={db_port}",
            "--bind-address=127.0.0.1",
            "--mysqlx=OFF",
            "--innodb-buffer-pool-size=64M",
            "--innodb-flush-method=normal",
            "--innodb-log-buffer-size=8M",
            "--performance-schema=OFF",
            "--max-connections=30",
            "--console",
        ],
        stdout=mysql_log,
        stderr=subprocess.STDOUT,
        env=env,
        creationflags=FLAGS,
    )
    wait_port(db_port, mysql)
    root_env = dict(env)
    root_env["MYSQL_PWD"] = config["rootPassword"]
    client = [
        MYSQL / "bin/mysql.exe",
        "--no-defaults",
        "--host=127.0.0.1",
        f"--port={db_port}",
        "--user=root",
        "--protocol=TCP",
        "--default-character-set=utf8mb4",
    ]
    if fresh:
        setup = (
            "ALTER USER 'root'@'localhost' IDENTIFIED BY '"
            + config["rootPassword"]
            + "'; CREATE DATABASE IF NOT EXISTS campusfix; CREATE USER 'campusfix'@'127.0.0.1' IDENTIFIED BY '"
            + config["databasePassword"]
            + "'; GRANT SELECT,INSERT,UPDATE,DELETE ON campusfix.* TO 'campusfix'@'127.0.0.1';"
        )
        initial_env = dict(env)
        initial_env.pop("MYSQL_PWD", None)
        run(
            client,
            input=setup.encode(),
            env=initial_env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
    run(
        client,
        input=(ROOT / "database/schema.sql").read_bytes(),
        env=root_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    migration_env = dict(env)
    migration_env["CAMPUSFIX_DB_USER"] = "root"
    migration_env["CAMPUSFIX_DB_PASSWORD"] = config["rootPassword"]
    run(
        java_args(classpath, "edu.vit.campusfix.MigrationTool", ROOT / "database/schema.sql"),
        env=migration_env,
    )
    if not args.check:
        result = subprocess.run(
            [str(a) for a in java_args(classpath, "edu.vit.campusfix.BootstrapAdmin", "check")],
            env=env,
            capture_output=True,
            creationflags=FLAGS,
        )
        if result.returncode == 3:
            if args.admin_file:
                run(
                    java_args(classpath, "edu.vit.campusfix.BootstrapAdmin"),
                    input=args.admin_file.read_bytes(),
                )
            elif not sys.stdin.isatty():
                raise RuntimeError(
                    "Run npm run dev in the VS Code terminal to create your first administrator interactively."
                )
            else:
                print(
                    "\nCreate your first real administrator account. No demo accounts will be added.",
                    flush=True,
                )
                name = input("Administrator name [Campus Admin]: ").strip() or "Campus Admin"
                email = input("VIT email [admin@vit.ac.in]: ").strip() or "admin@vit.ac.in"
                while True:
                    password = getpass.getpass(
                        "Choose a password (12+ characters, max 72 UTF-8 bytes): "
                    )
                    confirm = getpass.getpass("Confirm password: ")
                    if password == confirm and len(password) >= 12 and len(password.encode()) <= 72:
                        break
                    print("Passwords must match and meet the stated length limits.")
                run(
                    java_args(classpath, "edu.vit.campusfix.BootstrapAdmin"),
                    input=json.dumps({"name": name, "email": email, "password": password}).encode(),
                )
                password = confirm = None
        elif result.returncode:
            raise RuntimeError(
                "Could not check administrator access. Check database configuration."
            )
    shutil.copy2(ROOT / "target/campusfix.war", BASE / "webapps/campusfix.war")
    tc_cp = (
        str(TOMCAT_HOME / "bin/bootstrap.jar")
        + os.pathsep
        + str(TOMCAT_HOME / "bin/tomcat-juli.jar")
    )
    opens = [
        f"--add-opens={module}=ALL-UNNAMED"
        for module in [
            "java.base/java.lang",
            "java.base/java.io",
            "java.base/java.util",
            "java.base/java.util.concurrent",
            "java.rmi/sun.rmi.transport",
        ]
    ]
    command = [
        str(JAVA),
        "-Xms32m",
        "-Xmx192m",
        "-XX:+UseSerialGC",
        *opens,
        "-Djava.awt.headless=true",
        "-Dcatalina.home=" + str(TOMCAT_HOME),
        "-Dcatalina.base=" + str(BASE),
        "-Djava.io.tmpdir=" + str(BASE / "temp"),
        "-Djava.util.logging.config.file=" + str(BASE / "conf/logging.properties"),
        "-Djava.util.logging.manager=org.apache.juli.ClassLoaderLogManager",
        "-cp",
        tc_cp,
        "org.apache.catalina.startup.Bootstrap",
        "start",
    ]
    tomcat = subprocess.Popen(
        command, stdout=tomcat_log, stderr=subprocess.STDOUT, env=env, creationflags=FLAGS
    )
    wait_port(http_port, tomcat)
    url = f"http://127.0.0.1:{http_port}/campusfix/"
    for _ in range(120):
        try:
            with local_http.open(url + "api/config", timeout=3) as r:
                if r.status == 200:
                    break
        except Exception:
            time.sleep(0.5)
    else:
        raise RuntimeError("The WAR did not become ready. See .runtime/local/logs/tomcat.log.")
    print("\nCampusFix backend is running: " + url, flush=True)
    print(
        "MySQL + Tomcat + JSP/Servlets are connected. Data and uploads persist under .runtime/local/.",
        flush=True,
    )
    if args.check:
        with local_http.open(url, timeout=15) as r:
            assert r.status == 200 and "assets/app.js" in r.read().decode()
        print(
            "Backend startup check passed. No accounts or sample complaints were created.",
            flush=True,
        )
    else:
        print(
            "Sign in with your administrator account. Create other accounts under Admin > Users.",
            flush=True,
        )
        print("Keep this terminal open. Press Ctrl+C to stop the servers safely.", flush=True)
        while True:
            if mysql.poll() is not None or tomcat.poll() is not None:
                raise RuntimeError("A backend process stopped. See .runtime/local/logs.")
            time.sleep(1)
except KeyboardInterrupt:
    print("\nStopping CampusFix...", flush=True)
except RuntimeError as error:
    print(f"CampusFix could not start: {error}", file=sys.stderr, flush=True)
    sys.exit(1)
finally:
    if tomcat is not None and tomcat.poll() is None:
        try:
            with socket.create_connection(("127.0.0.1", shutdown_port), 3) as connection:
                connection.sendall(shutdown_token.encode())
            tomcat.wait(timeout=20)
        except Exception:
            tomcat.terminate()
            try:
                tomcat.wait(timeout=10)
            except subprocess.TimeoutExpired:
                tomcat.kill()
                tomcat.wait()
    if mysql is not None and mysql.poll() is None:
        try:
            shutdown_env = dict(env)
            shutdown_env["MYSQL_PWD"] = config["rootPassword"]
            run(
                [
                    MYSQL / "bin/mysqladmin.exe",
                    "--no-defaults",
                    "--host=127.0.0.1",
                    f"--port={db_port}",
                    "--user=root",
                    "--protocol=TCP",
                    "shutdown",
                ],
                env=shutdown_env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            mysql.wait(timeout=20)
        except Exception:
            mysql.terminate()
            mysql.wait(timeout=10)
    mysql_log.close()
    tomcat_log.close()
    print("CampusFix stopped. Your database and uploaded photos are preserved.", flush=True)
