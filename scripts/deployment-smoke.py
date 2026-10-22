"""HTTP checks against the actual WAR on Tomcat and MySQL, using disposable fixture accounts.
Run only against the dedicated verification Compose project. No credentials are printed.
"""

import base64, http.cookiejar, json, os, pathlib, subprocess, sys, time, urllib.request, urllib.error, uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".runtime" / "deployment-test.env"
env = dict(
    line.split("=", 1)
    for line in ENV_FILE.read_text().splitlines()
    if "=" in line and not line.startswith("#")
)
PASSWORD = env["CAMPUSFIX_TEST_PASSWORD"]
BASE = os.environ.get("CAMPUSFIX_TEST_URL", "http://127.0.0.1:18080/campusfix/api/")
assert BASE.startswith(
    "http://127.0.0.1:"
), "Smoke test is restricted to a loopback verification server."
checks = []


def check(condition, label):
    assert condition, label
    checks.append(label)
    print("PASS:", label, flush=True)


class Client:
    def __init__(self):
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
        )
        self.csrf = None

    def request(self, path, method="GET", body=None, content="application/json", csrf=True):
        headers = {}
        if body is not None:
            headers["Content-Type"] = content
            if content == "application/json":
                body = json.dumps(body).encode()
        if csrf and self.csrf:
            headers["X-CSRF-Token"] = self.csrf
        req = urllib.request.Request(BASE + path, data=body, method=method, headers=headers)
        try:
            with self.opener.open(req, timeout=30) as r:
                data = r.read()
                status = r.status
                kind = r.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            data = e.read()
            status = e.code
            kind = e.headers.get("Content-Type", "")
        return status, json.loads(data) if "application/json" in kind else data

    def login(self, role):
        status, data = self.request(
            "login", "POST", {"email": role + ".it@vit.ac.in", "password": PASSWORD}
        )
        check(status == 200, "Real " + role + " login")
        self.csrf = data["csrf"]
        return data["user"]


public = Client()
check(public.request("complaints")[0] == 401, "Unauthenticated complaint access denied")
check(public.request("config")[0] == 200, "Public reporting configuration loads from MySQL")
admin, student, faculty, staff = Client(), Client(), Client(), Client()
admin_user = admin.login("admin")
student_user = student.login("student")
faculty.login("faculty")
staff_user = staff.login("staff")
status, health = admin.request("admin/health")
check(
    status == 200
    and health["database"] == "connected"
    and health["uploads"] == "writable"
    and "10.1" in health["server"],
    "Tomcat 10.1, MySQL schema and upload directory readiness",
)
check(student.request("admin/users")[0] == 403, "Student cannot administer accounts")
check(
    admin.request("admin/users", "POST", {}, csrf=False)[0] == 403,
    "Admin mutations require a CSRF token",
)
check(
    admin.request(
        "complaints/1/update",
        "POST",
        {"status": "REVIEW", "remarks": "Validation regression check."},
    )[0]
    == 400,
    "Missing admin priority is a validation error, not a server failure",
)

suffix = uuid.uuid4().hex[:10]
email = "managed." + suffix + "@vit.ac.in"
payload = {
    "name": "Managed verification user",
    "email": email,
    "role": "STUDENT",
    "password": PASSWORD,
}
status, created = admin.request("admin/users", "POST", payload)
check(status == 201, "Admin creates a campus user")
uid = created["id"]
managed = Client()
status, login = managed.request("login", "POST", {"email": email, "password": PASSWORD})
check(status == 200, "Created user can authenticate")
managed.csrf = login["csrf"]
check(
    admin.request(
        f"admin/users/{uid}/update",
        "POST",
        {"role": "FACULTY", "active": "true", "name": "Managed faculty"},
    )[0]
    == 200,
    "Admin changes account role",
)
check(managed.request("session")[0] == 401, "Role change revokes existing session")
status, data = managed.request("login", "POST", {"email": email, "password": PASSWORD})
managed.csrf = data["csrf"]
check(
    admin.request(f"admin/users/{uid}/update", "POST", {"active": "false"})[0] == 200,
    "Admin disables account",
)
check(managed.request("session")[0] == 401, "Disabling an account revokes its existing session")
check(
    Client().request("login", "POST", {"email": email, "password": PASSWORD})[0] == 401,
    "Disabled account cannot sign in",
)
check(
    admin.request(f"admin/users/{uid}/update", "POST", {"active": "true"})[0] == 200,
    "Admin enables account",
)
status, data = managed.request("login", "POST", {"email": email, "password": PASSWORD})
managed.csrf = data["csrf"]
new_password = PASSWORD + "x"
check(
    admin.request(f"admin/users/{uid}/password", "POST", {"password": new_password})[0] == 200,
    "Admin resets password",
)
check(managed.request("session")[0] == 401, "Password reset revokes existing sessions")
check(
    Client().request("login", "POST", {"email": email, "password": PASSWORD})[0] == 401,
    "Previous password rejected after reset",
)
check(
    Client().request("login", "POST", {"email": email, "password": new_password})[0] == 200,
    "Reset password authenticates",
)
check(
    admin.request(f'admin/users/{admin_user["id"]}/update', "POST", {"active": "false"})[0] == 409,
    "Admin cannot disable their own access",
)

status, config = admin.request("admin/settings")
original = json.loads(json.dumps(config))
check(status == 200, "Admin reads persistent settings")
config["slaHours"]["HIGH"] = 12
config["maxPhotos"] = 2
config["uploadSizeMb"] = 1
config["categories"].append("Deployment Test")
config["hostelBlocks"].append("VERIFY")
check(
    admin.request("admin/settings", "POST", {"config": json.dumps(config)})[0] == 200,
    "Admin saves configurable targets, reporting limits and locations",
)
check(
    public.request("config")[1]["slaHours"]["HIGH"] == 12,
    "Updated policy is visible through the live API",
)

boundary = "CampusFix" + uuid.uuid4().hex
check(
    admin.request(f'admin/users/{student_user["id"]}/update', "POST", {"hostelBlock": "VERIFY"})[0]
    == 200,
    "Admin assigns the student hostel block",
)
check(student.request("session")[0] == 401, "Hostel changes revoke existing student sessions")
student.login("student")
png = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="
)
fields = {
    "title": "Deployment verification complaint",
    "description": "A dedicated integration test of the complete maintenance workflow.",
    "category": "Deployment Test",
    "priority": "HIGH",
    "type": "Hostel",
    "block": "VERIFY",
    "floor": "1",
    "room": "Verification lab",
}
parts = []
for key, value in fields.items():
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
    )
for index in range(2):
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="photos"; filename="evidence-{index}.png"\r\nContent-Type: image/png\r\n\r\n'.encode()
        + png
        + b"\r\n"
    )
parts.append(f"--{boundary}--\r\n".encode())
for forbidden_block in (b"K", b"L", b"N"):
    status_denied, _ = student.request(
        "complaints",
        "POST",
        b"".join(parts).replace(b"\r\nVERIFY\r\n", b"\r\n" + forbidden_block + b"\r\n"),
        f"multipart/form-data; boundary={boundary}",
    )
    check(
        status_denied == 403,
        "Student cannot spoof a different hostel block: " + forbidden_block.decode(),
    )
status, result = student.request(
    "complaints", "POST", b"".join(parts), f"multipart/form-data; boundary={boundary}"
)
check(status == 201, "Real multipart complaint creation with two photo uploads")
cid = result["id"]
records = student.request("complaints")[1]["tickets"]
ticket = next(t for t in records if t["id"] == cid)
check(len(ticket["attachments"]) == 2, "Both uploaded photos persist in MySQL")
aid = ticket["attachments"][0]["id"]
check(student.request(f"attachment/{aid}")[1] == png, "Reporter retrieves original photo bytes")
check(faculty.request(f"attachment/{aid}")[0] == 403, "Other reporter cannot retrieve photo")
extra = (
    f'--{boundary}\r\nContent-Disposition: form-data; name="photos"; filename="extra.png"\r\nContent-Type: image/png\r\n\r\n'.encode()
    + png
    + b"\r\n"
)
check(
    student.request(
        "complaints",
        "POST",
        b"".join(parts[:-1] + [extra, parts[-1]]),
        f"multipart/form-data; boundary={boundary}",
    )[0]
    == 400,
    "Configured photo count is enforced by the real upload endpoint",
)
check(
    student.request(
        "complaints",
        "POST",
        b"".join(parts).replace(png, b"<script>not an image</script>", 1),
        f"multipart/form-data; boundary={boundary}",
    )[0]
    == 400,
    "Disguised image uploads are rejected",
)
check(
    student.request(
        "complaints",
        "POST",
        b"".join(parts).replace(png, b"x" * (1024 * 1024 + 1), 1),
        f"multipart/form-data; boundary={boundary}",
    )[0]
    == 400,
    "Configured photo size is enforced by the real upload endpoint",
)
check(staff.request(f"attachment/{aid}")[0] == 403, "Unassigned staff cannot retrieve photo")
check(
    student.request(
        f"complaints/{cid}/update",
        "POST",
        {"status": "RESOLVED", "remarks": "Unauthorized attempt"},
    )[0]
    == 403,
    "Reporter cannot modify maintenance workflow",
)

if os.environ.get("CAMPUSFIX_NATIVE_TEST") == "1":
    java = pathlib.Path(os.environ["JAVA_HOME"]) / "bin" / "java.exe"
    classpath = (
        str(ROOT / "target/test-classes")
        + os.pathsep
        + str(ROOT / "target/classes")
        + os.pathsep
        + str(ROOT / "target/campusfix/WEB-INF/lib/*")
    )
    fixture = [
        str(java),
        "-Xms16m",
        "-Xmx96m",
        "-XX:+UseSerialGC",
        "-cp",
        classpath,
        "edu.vit.campusfix.DeploymentFixture",
        "age",
    ]
    subprocess.run(fixture, check=True, stdout=subprocess.DEVNULL)
else:
    project = os.environ.get("CAMPUSFIX_COMPOSE_PROJECT", "campusfix-verification")
    container = subprocess.check_output(
        [
            "docker",
            "compose",
            "--env-file",
            str(ENV_FILE),
            "-p",
            project,
            "-f",
            str(ROOT / "compose.yaml"),
            "ps",
            "-q",
            "app",
        ],
        text=True,
    ).strip()
    fixture = [
        "docker",
        "exec",
        "--env-file",
        str(ENV_FILE),
        container,
        "java",
        "-cp",
        "/tmp/campusfix-test-classes:/usr/local/tomcat/webapps/campusfix/WEB-INF/classes:/usr/local/tomcat/webapps/campusfix/WEB-INF/lib/*",
        "edu.vit.campusfix.DeploymentFixture",
        "age",
    ]
    subprocess.run(fixture, check=True, stdout=subprocess.DEVNULL)
if os.environ.get("CAMPUSFIX_NATIVE_TEST") == "1":
    for _ in range(20):
        notices = admin.request("notifications")[1]["notifications"]
        if any(
            f"CF-{cid}:" in n["message"] and "Escalation Required" in n["message"] for n in notices
        ):
            break
        time.sleep(0.5)
    else:
        raise AssertionError("Background SLA monitor failed to notify without an admin refresh")
    check(True, "Background SLA monitor notifies without an admin complaint refresh")
data = admin.request("complaints")[1]
ticket = next(t for t in data["tickets"] if t["id"] == cid)
check(
    ticket["sla"]["state"] == "OVERDUE" and ticket["sla"]["escalationRequired"],
    "Aged real complaint is marked overdue with escalation required",
)
notices = [
    n
    for n in data["notifications"]
    if f"CF-{cid}:" in n["message"] and "Escalation Required" in n["message"]
]
check(len(notices) == 1, "Admin receives an SLA escalation notification")
check(
    len(
        [
            n
            for n in admin.request("complaints")[1]["notifications"]
            if f"CF-{cid}:" in n["message"] and "Escalation Required" in n["message"]
        ]
    )
    == 1,
    "Repeated refresh does not duplicate escalation notices",
)

check(
    admin.request(
        f"complaints/{cid}/update",
        "POST",
        {"status": "REVIEW", "priority": "HIGH", "remarks": "Reviewed the verification complaint."},
    )[0]
    == 200,
    "Admin review persists",
)
check(
    admin.request(
        f"complaints/{cid}/update",
        "POST",
        {
            "status": "ASSIGNED",
            "priority": "HIGH",
            "staffId": str(staff_user["id"]),
            "remarks": "Assigned for verification repair.",
        },
    )[0]
    == 200,
    "Admin staff assignment persists",
)
check(
    admin.request(f'admin/users/{staff_user["id"]}/update', "POST", {"active": "false"})[0] == 409,
    "Staff with active work cannot be disabled before reassignment",
)
check(staff.request(f"attachment/{aid}")[0] == 200, "Assigned staff can access photo evidence")
check(
    staff.request(
        f"complaints/{cid}/update",
        "POST",
        {"status": "IN_PROGRESS", "remarks": "Started verification repair."},
    )[0]
    == 200,
    "Staff starts assigned work",
)
check(
    staff.request(
        f"complaints/{cid}/update",
        "POST",
        {"status": "PENDING_CONFIRMATION", "remarks": "Completed verification repair."},
    )[0]
    == 200,
    "Staff submits fix for reporter confirmation",
)
check(student.request(f"complaints/{cid}/feedback", "POST", {"rating": 5, "comment": "Not confirmed yet"})[0] == 409, "Feedback blocked before reporter confirmation")
for actor, label in [(admin, "Admin"), (staff, "Staff"), (faculty, "Other reporter")]:
    check(actor.request(f"complaints/{cid}/confirm", "POST", {"confirmed": "true"})[0] == 403, label + " cannot confirm another reporter's fix")
check(student.request(f"complaints/{cid}/confirm", "POST", {"confirmed": "false", "remarks": "The problem is still present."})[0] == 200, "Reporter returns an unfixed issue to staff")
check(staff.request(f"complaints/{cid}/update", "POST", {"status": "PENDING_CONFIRMATION", "remarks": "Repaired again and rechecked."})[0] == 200, "Staff submits a second repair for confirmation")
check(student.request(f"complaints/{cid}/confirm", "POST", {"confirmed": "true"})[0] == 200, "Reporter confirms the fix")
check(student.request(f"complaints/{cid}/confirm", "POST", {"confirmed": "true"})[0] == 409, "Duplicate confirmation is rejected")
check(
    student.request(
        f"complaints/{cid}/feedback",
        "POST",
        {"rating": 5, "comment": "Verification repair completed successfully."},
    )[0]
    == 200,
    "Reporter submits rating and feedback",
)
ticket = next(t for t in student.request("complaints")[1]["tickets"] if t["id"] == cid)
check(
    ticket["status"] == "CLOSED" and ticket["rating"] == 5 and len(ticket["updates"]) == 9,
    "Closed complaint, rating and full timeline persist",
)
check(
    student.request(
        f"complaints/{cid}/feedback", "POST", {"rating": 5, "comment": "Duplicate feedback"}
    )[0]
    == 409,
    "Duplicate feedback is rejected",
)
check(
    len(student.request("complaints")[1]["notifications"]) >= 4,
    "Reporter status notifications persist",
)
check(
    student.request("notifications/read", "POST")[0] == 200
    and all(n["read"] for n in student.request("complaints")[1]["notifications"]),
    "Notification read state persists",
)
status, analytics = admin.request("admin/analytics")
check(
    status == 200
    and any(
        s["id"] == staff_user["id"] and s["resolved"] >= 1 and s["averageRating"] == 5
        for s in analytics["staff"]
    ),
    "Staff performance analytics use persisted resolution and feedback",
)
check(
    any(b["block"] == "VERIFY" and b["total"] >= 1 for b in analytics["blocks"]),
    "Block analytics include configured locations",
)
check(
    admin.request("admin/settings", "POST", {"config": json.dumps(original)})[0] == 200,
    "Original reporting policy restored without deleting complaint history",
)
check(
    any(t["id"] == cid for t in student.request("complaints")[1]["tickets"]),
    "Removed reporting choices preserve historical complaints",
)
# Student signup is public but cannot create privileged roles.
signup_data = {
    "name": "Registered student",
    "email": "signup." + suffix + "@vitstudent.ac.in",
    "password": PASSWORD,
    "hostelBlock": "K",
}
check(
    public.request("register", "POST", signup_data)[0] == 201,
    "Student signup persists selected hostel",
)
check(
    public.request("register", "POST", signup_data)[0] == 409,
    "Signup rejects duplicate campus email",
)
check(
    public.request(
        "register",
        "POST",
        dict(signup_data, email="missing." + suffix + "@vitstudent.ac.in", hostelBlock=""),
    )[0]
    == 400,
    "Signup requires a hostel block",
)
check(
    public.request(
        "register",
        "POST",
        dict(signup_data, email="admin." + suffix + "@vitstudent.ac.in", role="ADMIN"),
    )[0]
    == 400,
    "Signup cannot grant administrator access",
)
registered = Client()
status, signed = registered.request(
    "login", "POST", {"email": signup_data["email"], "password": PASSWORD}
)
check(
    status == 200 and signed["user"]["role"] == "STUDENT" and signed["user"]["hostelBlock"] == "K",
    "Registered student can log in with stored residence",
)
registered.csrf = signed["csrf"]


# Academic permission checks use the original Electrical category after settings restoration.
def location_body(typ, block):
    boundary_local = "LocationPolicy" + uuid.uuid4().hex
    fields_local = {
        "title": "Location access verification",
        "description": "Isolated verification of role-based campus reporting permissions.",
        "category": "Electrical",
        "priority": "LOW",
        "type": typ,
        "block": block,
        "floor": "1",
        "room": "Verification area",
    }
    body_local = (
        "".join(
            "--"
            + boundary_local
            + '\r\nContent-Disposition: form-data; name="'
            + key
            + '"\r\n\r\n'
            + value
            + "\r\n"
            for key, value in fields_local.items()
        )
        + "--"
        + boundary_local
        + "--\r\n"
    )
    return body_local.encode(), "multipart/form-data; boundary=" + boundary_local


body_location, content_location = location_body("Hostel", "K")
check(
    faculty.request("complaints", "POST", body_location, content_location)[0] == 403,
    "Faculty cannot report hostel complaints",
)
for block in ["PRP", "SJT", "TT", "SMV"]:
    body_location, content_location = location_body("Academic", block)
    check(
        faculty.request("complaints", "POST", body_location, content_location)[0] == 201,
        "Faculty can report academic building " + block,
    )
    check(
        registered.request("complaints", "POST", body_location, content_location)[0] == 201,
        "Student can report academic building " + block,
    )
body_location, content_location = location_body("Hostel", "N")
check(
    registered.request("complaints", "POST", body_location, content_location)[0] == 403,
    "Registered K student cannot report N Block",
)

for reporter, other, label in [(student, faculty, "Student"), (faculty, student, "Faculty")]:
    direct_body, direct_content = location_body("Academic", "SJT")
    direct_status, direct_result = reporter.request("complaints", "POST", direct_body, direct_content)
    check(direct_status == 201, label + " creates a complaint for direct resolution")
    direct_id = direct_result["id"]
    check(other.request(f"complaints/{direct_id}/confirm", "POST", {"confirmed": "true"})[0] == 403, "Other reporter cannot directly resolve " + label + " complaint")
    check(reporter.request(f"complaints/{direct_id}/confirm", "POST", {"confirmed": "true"})[0] == 200, label + " resolves own issue without staff submission")
    direct_ticket = next(t for t in reporter.request("complaints")[1]["tickets"] if t["id"] == direct_id)
    check(direct_ticket["status"] == "RESOLVED" and direct_ticket.get("assignedStaffId") is None, label + " direct resolution persists without an assignment")

for reporter, other, label in [(student, faculty, "Student"), (faculty, student, "Faculty")]:
    own_body, own_content = location_body("Academic", "SJT")
    own_status, own_result = reporter.request("complaints", "POST", own_body, own_content)
    check(own_status == 201, label + " creates an editable complaint")
    own_id = own_result["id"]
    edit_data = {"title":"Updated classroom fan report", "description":"Updated details for an isolated editable classroom complaint.", "category":"Electrical", "priority":"LOW", "type":"Academic", "block":"SJT", "floor":"1", "room":"Updated verification lab"}
    check(other.request(f"complaints/{own_id}/edit", "POST", edit_data)[0] == 403, "Other reporter cannot edit " + label + " complaint")
    check(reporter.request(f"complaints/{own_id}/edit", "POST", edit_data)[0] == 200, label + " edits own submitted complaint")
    edited = next(t for t in reporter.request("complaints")[1]["tickets"] if t["id"] == own_id)
    check(edited["title"] == edit_data["title"] and edited["room"] == edit_data["room"], label + " updated details persist")
    check(reporter.request(f"complaints/{own_id}/delete", "POST", {}, csrf=False)[0] == 403, "Deletion requires CSRF protection")
    check(other.request(f"complaints/{own_id}/delete", "POST", {})[0] == 403, "Other reporter cannot delete " + label + " complaint")
    check(reporter.request(f"complaints/{own_id}/delete", "POST", {})[0] == 200, label + " deletes own complaint recoverably")
    check(all(t["id"] != own_id for t in admin.request("complaints")[1]["tickets"]), "Deleted complaint is excluded from active admin lists")
    check(any(t["id"] == own_id for t in reporter.request("complaints/deleted")[1]["tickets"]), "Reporter can find deleted complaint")
    check(all(t["id"] != own_id for t in other.request("complaints/deleted")[1]["tickets"]), "Deleted complaint list remains reporter scoped")
    check(staff.request("complaints/deleted")[0] == 403, "Staff cannot browse deleted complaints")
    check(other.request(f"complaints/{own_id}/restore", "POST", {})[0] == 403, "Other reporter cannot restore a complaint")
    check(reporter.request(f"complaints/{own_id}/restore", "POST", {})[0] == 200, label + " restores own complaint")
    restored = next(t for t in reporter.request("complaints")[1]["tickets"] if t["id"] == own_id)
    check(restored["status"] == "REPORTED" and restored.get("assignedStaffId") is None, "Restored complaint awaits fresh admin review")
    check(reporter.request(f"complaints/{own_id}/restore", "POST", {})[0] == 409, "Repeated restore is rejected")

for reporter, label in [(student, "Student"), (faculty, "Faculty")]:
    history_body, history_content = location_body("Academic", "SJT")
    history_status, history_result = reporter.request("complaints", "POST", history_body, history_content)
    check(history_status == 201, label + " creates a report for historical deletion checks")
    history_id = history_result["id"]
    check(reporter.request(f"complaints/{history_id}/confirm", "POST", {"confirmed":"true"})[0] == 200, label + " resolves historical deletion test report")
    for terminal in ["RESOLVED", "CLOSED"]:
        if terminal == "CLOSED":
            check(reporter.request(f"complaints/{history_id}/feedback", "POST", {"rating":4,"comment":"Completed repair retained in history."})[0] == 200, label + " closes historical report with feedback")
        before = next(t for t in reporter.request("complaints")[1]["tickets"] if t["id"] == history_id)
        check(reporter.request(f"complaints/{history_id}/delete", "POST", {})[0] == 200, label + " deletes previous " + terminal + " complaint")
        check(all(t["id"] != history_id for t in reporter.request("complaints")[1]["tickets"]), terminal + " deleted report disappears from normal history")
        check(reporter.request(f"complaints/{history_id}/restore", "POST", {})[0] == 200, label + " restores previous " + terminal + " complaint")
        after = next(t for t in reporter.request("complaints")[1]["tickets"] if t["id"] == history_id)
        check(after["status"] == terminal and all(after.get(k) == before.get(k) for k in ["resolvedAt","rating","feedback","assignedStaffId"]), "Restored " + terminal + " report preserves completion and feedback")

for reporter, label, completed in [(student, "Student", False), (faculty, "Faculty", True)]:
    admin_body, admin_content = location_body("Academic", "SJT")
    admin_status, admin_result = reporter.request("complaints", "POST", admin_body, admin_content)
    check(admin_status == 201, label + " report created for admin deletion")
    admin_id = admin_result["id"]
    if completed:
        check(reporter.request(f"complaints/{admin_id}/confirm", "POST", {"confirmed":"true"})[0] == 200, "Faculty resolves report before admin deletion")
        check(reporter.request(f"complaints/{admin_id}/feedback", "POST", {"rating":5,"comment":"Feedback must survive administrator deletion."})[0] == 200, "Faculty feedback saved before admin deletion")
    before = next(t for t in reporter.request("complaints")[1]["tickets"] if t["id"] == admin_id)
    check(staff.request(f"complaints/{admin_id}/delete", "POST", {})[0] == 403, "Staff still cannot delete complaints")
    check(admin.request(f"complaints/{admin_id}/delete", "POST", {}, csrf=False)[0] == 403, "Admin deletion requires CSRF")
    check(admin.request(f"complaints/{admin_id}/delete", "POST", {})[0] == 200, "Admin deletes " + label + " complaint")
    check(all(t["id"] != admin_id for t in reporter.request("complaints")[1]["tickets"]), "Admin-deleted report is hidden from reporter normal history")
    archived = next(t for t in admin.request("complaints/deleted")[1]["tickets"] if t["id"] == admin_id)
    check(archived["updates"][-1]["remarks"].startswith("Admin deleted"), "Timeline identifies administrative deletion")
    check(any("administrator deleted" in n["message"] for n in reporter.request("complaints")[1]["notifications"]), "Reporter receives admin deletion notice")
    check(admin.request(f"complaints/{admin_id}/restore", "POST", {})[0] == 200, "Admin restores " + label + " complaint")
    restored = next(t for t in reporter.request("complaints")[1]["tickets"] if t["id"] == admin_id)
    check(restored["status"] == before["status"] and all(restored.get(k) == before.get(k) for k in ["rating","feedback","resolvedAt"]), "Admin restore preserves report completion and feedback")
    check(reporter.request(f"complaints/{admin_id}/delete", "POST", {})[0] == 200, "Reporter retains own deletion permission")
    check(admin.request(f"complaints/{admin_id}/restore", "POST", {})[0] == 200, "Admin restores a reporter-deleted complaint")

report = {
    "environment": f'Real MySQL {health.get("databaseVersion","8.4")} + {health["server"]} + Java {health["java"]}',
    "checks": checks,
    "passed": len(checks),
    "failed": 0,
}
(ROOT / "docs" / "deployment-smoke-results.json").write_text(json.dumps(report, indent=2))
print(f"{len(checks)} real deployment checks passed. No credentials logged.")
