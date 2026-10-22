"""Run a loopback-only verification deployment from official portable Windows distributions.
Prerequisites in .runtime/: mysql-8.4.0-winx64/ and apache-tomcat-10.1.61/.
Keeps isolated data for inspection and stops only the child processes it starts.
"""

import os, pathlib, shutil, socket, subprocess, sys, time, urllib.request, zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
RUNTIME = ROOT / ".runtime"
env = dict(os.environ)
for line in (RUNTIME / "deployment-test.env").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        key, value = line.split("=", 1)
        env[key] = value
env.update(
    CAMPUSFIX_DB_URL="jdbc:mysql://127.0.0.1:13306/campusfix?serverTimezone=UTC&sslMode=DISABLED&allowPublicKeyRetrieval=true",
    CAMPUSFIX_DB_USER="campusfix",
    CAMPUSFIX_UPLOAD_DIR=str(RUNTIME / "verification-uploads"),
    CAMPUSFIX_NATIVE_TEST="1",
    CAMPUSFIX_SLA_SCAN_SECONDS="5",
)
if not env.get("JAVA_HOME") or not (pathlib.Path(env["JAVA_HOME"]) / "bin/java.exe").is_file():
    candidates = sorted(
        (pathlib.Path.home() / ".vscode/extensions").glob("redhat.java-*/jre/*"), reverse=True
    )
    compiler = shutil.which("javac.exe")
    if compiler:
        candidates.insert(0, pathlib.Path(compiler).resolve().parents[1])
    env["JAVA_HOME"] = str(next((p for p in candidates if (p / "bin/javac.exe").is_file()), ""))
    if not env["JAVA_HOME"]:
        raise RuntimeError("Set JAVA_HOME to an installed JDK 17 or newer.")
MYSQL = RUNTIME / "mysql-8.4.0-winx64"
TOMCAT = RUNTIME / "apache-tomcat-10.1.61"
JAVA = pathlib.Path(env["JAVA_HOME"]) / "bin/java.exe"
DATA = RUNTIME / "mysql-verification-data"
LOGS = RUNTIME / "verification-logs"
LOGS.mkdir(exist_ok=True)
FLAGS = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def run(args, **kwargs):
    return subprocess.run(
        [str(a) for a in args],
        check=True,
        env=kwargs.pop("env", env),
        creationflags=FLAGS,
        **kwargs,
    )


def free(port):
    with socket.socket() as s:
        try:
            s.bind(("127.0.0.1", port))
        except OSError:
            raise RuntimeError(
                f"Verification port {port} is in use. No existing service was stopped."
            )


def wait_port(port, process):
    for _ in range(120):
        if process.poll() is not None:
            raise RuntimeError(f"Verification process exited. Check {LOGS}.")
        try:
            with socket.create_connection(("127.0.0.1", port), 1):
                return
        except OSError:
            time.sleep(0.5)
    raise RuntimeError(f"Port {port} did not become ready. Check {LOGS}.")


if not MYSQL.exists():
    with zipfile.ZipFile(RUNTIME / "mysql.zip") as z:
        for name in z.namelist():
            if not (RUNTIME / name).resolve().is_relative_to(RUNTIME.resolve()):
                raise ValueError("Unsafe archive path")
        z.extractall(RUNTIME)
print("Official portable distributions ready. Using isolated data and loopback ports.", flush=True)
free(13306)
free(18080)
fresh = not DATA.exists()
if fresh:
    with (LOGS / "mysql-initialize.log").open("wb") as log:
        run(
            [
                MYSQL / "bin/mysqld.exe",
                "--no-defaults",
                "--initialize-insecure",
                "--basedir=" + str(MYSQL),
                "--datadir=" + str(DATA),
                "--innodb-buffer-pool-size=64M",
                "--performance-schema=OFF",
                "--console",
            ],
            stdout=log,
            stderr=subprocess.STDOUT,
        )
mysql_log = (LOGS / "mysql.log").open("ab")
tomcat_log = (LOGS / "tomcat.log").open("ab")
mysql = None
tomcat = None
try:
    mysql = subprocess.Popen(
        [
            str(MYSQL / "bin/mysqld.exe"),
            "--no-defaults",
            "--basedir=" + str(MYSQL),
            "--datadir=" + str(DATA),
            "--port=13306",
            "--bind-address=127.0.0.1",
            "--mysqlx=OFF",
            "--innodb-buffer-pool-size=64M",
            "--performance-schema=OFF",
            "--max-connections=20",
            "--console",
        ],
        stdout=mysql_log,
        stderr=subprocess.STDOUT,
        env=env,
        creationflags=FLAGS,
    )
    wait_port(13306, mysql)
    client = [
        MYSQL / "bin/mysql.exe",
        "--no-defaults",
        "--host=127.0.0.1",
        "--port=13306",
        "--user=root",
        "--protocol=TCP",
        "--default-character-set=utf8mb4",
    ]
    root_env = dict(env)
    if fresh:
        sql = (
            "ALTER USER 'root'@'localhost' IDENTIFIED BY '"
            + env["MYSQL_ROOT_PASSWORD"]
            + "'; CREATE DATABASE IF NOT EXISTS campusfix; CREATE USER 'campusfix'@'127.0.0.1' IDENTIFIED BY '"
            + env["CAMPUSFIX_DB_PASSWORD"]
            + "'; GRANT ALL PRIVILEGES ON campusfix.* TO 'campusfix'@'127.0.0.1';\n"
        )
        run(client, input=sql.encode(), stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    root_env["MYSQL_PWD"] = env["MYSQL_ROOT_PASSWORD"]
    run(
        client,
        input=(ROOT / "database/schema.sql").read_bytes(),
        env=root_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    classpath = (
        str(ROOT / "target/classes") + os.pathsep + str(ROOT / "target/campusfix/WEB-INF/lib/*")
    )
    run(
        [
            JAVA,
            "-Xms16m",
            "-Xmx96m",
            "-XX:+UseSerialGC",
            "-cp",
            classpath,
            "edu.vit.campusfix.MigrationTool",
            ROOT / "database/schema.sql",
        ]
    )
    test_classpath = str(ROOT / "target/test-classes") + os.pathsep + classpath
    marker = RUNTIME / "native-fixture-ready"
    if not marker.exists():
        run(
            [
                JAVA,
                "-Xms16m",
                "-Xmx96m",
                "-XX:+UseSerialGC",
                "-cp",
                test_classpath,
                "edu.vit.campusfix.DeploymentFixture",
            ]
        )
        marker.write_text(
            "Isolated verification accounts provisioned; credentials are in ignored runtime environment file.\n"
        )
    server = TOMCAT / "conf/server.xml"
    text = (
        server.read_text()
        .replace('port="8080"', 'port="18080"')
        .replace('port="8005"', 'port="18005"')
    )
    server.write_text(text)
    shutil.copy2(ROOT / "target/campusfix.war", TOMCAT / "webapps/campusfix.war")
    tc_cp = str(TOMCAT / "bin/bootstrap.jar") + os.pathsep + str(TOMCAT / "bin/tomcat-juli.jar")
    opens = [
        "--add-opens=java.base/java.lang=ALL-UNNAMED",
        "--add-opens=java.base/java.io=ALL-UNNAMED",
        "--add-opens=java.base/java.util=ALL-UNNAMED",
        "--add-opens=java.base/java.util.concurrent=ALL-UNNAMED",
        "--add-opens=java.rmi/sun.rmi.transport=ALL-UNNAMED",
    ]
    command = [
        str(JAVA),
        "-Xms32m",
        "-Xmx192m",
        "-XX:+UseSerialGC",
        *opens,
        "-Djava.awt.headless=true",
        "-Dcatalina.home=" + str(TOMCAT),
        "-Dcatalina.base=" + str(TOMCAT),
        "-Djava.io.tmpdir=" + str(TOMCAT / "temp"),
        "-Djava.util.logging.config.file=" + str(TOMCAT / "conf/logging.properties"),
        "-Djava.util.logging.manager=org.apache.juli.ClassLoaderLogManager",
        "-cp",
        tc_cp,
        "org.apache.catalina.startup.Bootstrap",
        "start",
    ]
    tomcat = subprocess.Popen(
        command, stdout=tomcat_log, stderr=subprocess.STDOUT, env=env, creationflags=FLAGS
    )
    wait_port(18080, tomcat)
    for _ in range(120):
        try:
            with urllib.request.urlopen(
                "http://127.0.0.1:18080/campusfix/api/config", timeout=3
            ) as response:
                if response.status == 200:
                    break
        except Exception:
            time.sleep(0.5)
    else:
        raise RuntimeError("CampusFix did not become ready. Inspect the private verification logs.")
    with urllib.request.urlopen("http://127.0.0.1:18080/campusfix/", timeout=15) as response:
        html = response.read().decode()
        assert "assets/enhancements.js" in html and "<!doctype html>" in html
    print("PASS: JSP entry page compiled and served by actual Tomcat.", flush=True)
    run([sys.executable, ROOT / "scripts/deployment-smoke.py"])
finally:
    if tomcat is not None and tomcat.poll() is None:
        try:
            run(
                [
                    JAVA,
                    "-Xms16m",
                    "-Xmx64m",
                    "-XX:+UseSerialGC",
                    "-Dcatalina.home=" + str(TOMCAT),
                    "-Dcatalina.base=" + str(TOMCAT),
                    "-cp",
                    str(TOMCAT / "bin/bootstrap.jar")
                    + os.pathsep
                    + str(TOMCAT / "bin/tomcat-juli.jar"),
                    "org.apache.catalina.startup.Bootstrap",
                    "stop",
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            tomcat.wait(timeout=20)
        except Exception:
            tomcat.terminate()
            tomcat.wait(timeout=10)
    if mysql is not None and mysql.poll() is None:
        try:
            shutdown_env = dict(env)
            shutdown_env["MYSQL_PWD"] = env["MYSQL_ROOT_PASSWORD"]
            run(
                [
                    MYSQL / "bin/mysqladmin.exe",
                    "--no-defaults",
                    "--host=127.0.0.1",
                    "--port=13306",
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
    print(
        "Owned verification processes stopped. Isolated database and uploads preserved.", flush=True
    )
