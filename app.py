
from flask import (
    Flask, request, jsonify, session,
    send_from_directory
)
from werkzeug.security import (
    generate_password_hash,
    check_password_hash
)
from werkzeug.utils import secure_filename
from functools import wraps
from datetime import datetime
import sqlite3
import os
import uuid

# --------------------------------------------------
# BASIC SETTINGS
# --------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATABASE = os.environ.get(
    "DATABASE_PATH",
    os.path.join(BASE_DIR, "nexstudy.db")
)

UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(os.path.dirname(DATABASE), exist_ok=True)

app = Flask(__name__)

app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY")
if not app.config["SECRET_KEY"]:
    # Local development fallback only. Set SECRET_KEY in production hosting.
    app.config["SECRET_KEY"] = "local-dev-only-change-this-secret-before-deployment"

app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

if os.environ.get("RENDER"):
    app.config["SESSION_COOKIE_SECURE"] = True


# --------------------------------------------------
# DATABASE CONNECTION
# --------------------------------------------------

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        role TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone TEXT DEFAULT '',
        college TEXT DEFAULT '',
        enrollment TEXT DEFAULT '',
        course TEXT DEFAULT '',
        semester TEXT DEFAULT '',
        department TEXT DEFAULT '',
        faculty_id TEXT DEFAULT '',
        created_at TEXT
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS classes (
        id TEXT PRIMARY KEY,
        faculty_id TEXT NOT NULL,
        name TEXT NOT NULL,
        course TEXT DEFAULT '',
        semester TEXT DEFAULT '',
        section TEXT DEFAULT '',
        description TEXT DEFAULT '',
        created_at TEXT,
        FOREIGN KEY (faculty_id) REFERENCES users(id)
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS class_members (
        class_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        UNIQUE(class_id, student_id),
        FOREIGN KEY (class_id) REFERENCES classes(id),
        FOREIGN KEY (student_id) REFERENCES users(id)
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS assignments (
        id TEXT PRIMARY KEY,
        faculty_id TEXT NOT NULL,
        class_id TEXT NOT NULL,
        title TEXT NOT NULL,
        subject TEXT DEFAULT '',
        description TEXT DEFAULT '',
        deadline TEXT NOT NULL,
        created_at TEXT,
        FOREIGN KEY (faculty_id) REFERENCES users(id),
        FOREIGN KEY (class_id) REFERENCES classes(id)
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        assignment_id TEXT NOT NULL,
        student_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        submitted_at TEXT,
        UNIQUE(assignment_id, student_id),
        FOREIGN KEY (assignment_id) REFERENCES assignments(id),
        FOREIGN KEY (student_id) REFERENCES users(id)
    )
    """)

    conn.commit()
    conn.close()


# --------------------------------------------------
# COMMON HELPERS
# --------------------------------------------------

def public_user(user):
    return {
        "id": user["id"],
        "role": user["role"],
        "name": user["name"],
        "email": user["email"],
        "phone": user["phone"],
        "college": user["college"],
        "enrollment": user["enrollment"],
        "course": user["course"],
        "semester": user["semester"],
        "department": user["department"],
        "facultyId": user["faculty_id"]
    }


def current_user():
    user_id = session.get("user_id")

    if not user_id:
        return None

    conn = get_db()
    user = conn.execute(
        "SELECT * FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()
    conn.close()

    return user


def login_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"error": "Please login first"}), 401

        if not current_user():
            session.clear()
            return jsonify({"error": "User account not found"}), 401

        return func(*args, **kwargs)

    return wrapper


def role_required(role):
    def decorator(func):
        @wraps(func)
        @login_required
        def wrapper(*args, **kwargs):
            user = current_user()

            if user["role"] != role:
                return jsonify({"error": "Access denied"}), 403

            return func(*args, **kwargs)

        return wrapper
    return decorator


def deadline_passed(deadline):
    try:
        due = datetime.fromisoformat(deadline.replace("Z", "+00:00"))

        if due.tzinfo:
            from datetime import timezone
            return due < datetime.now(timezone.utc)

        return due < datetime.now()

    except (ValueError, TypeError):
        return True


# --------------------------------------------------
# FRONTEND ROUTES
# --------------------------------------------------

@app.route("/")
def home():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/style.css")
def stylesheet():
    return send_from_directory(BASE_DIR, "style.css")


@app.route("/script.js")
def javascript():
    return send_from_directory(BASE_DIR, "script.js")


@app.route("/api/status")
def status():
    return jsonify({
        "status": "success",
        "message": "NEXSTUDY backend connected!"
    })


# --------------------------------------------------
# REGISTER
# --------------------------------------------------

@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    role = str(data.get("role", "")).strip().lower()
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")

    if role not in ["student", "faculty"]:
        return jsonify({"error": "Select Student or Faculty"}), 400

    if not name or not email or not password:
        return jsonify({"error": "Fill all required fields"}), 400

    if len(password) < 8:
        return jsonify({
            "error": "Password must contain at least 8 characters"
        }), 400

    user_id = str(uuid.uuid4())

    conn = get_db()

    try:
        conn.execute("""
        INSERT INTO users (
            id, role, name, email, password,
            phone, college, enrollment, course,
            semester, department, faculty_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            role,
            name,
            email,
            generate_password_hash(password),
            data.get("phone", ""),
            data.get("college", ""),
            data.get("enrollment", ""),
            data.get("course", ""),
            data.get("semester", ""),
            data.get("department", ""),
            data.get("facultyId", ""),
            datetime.now().isoformat()
        ))

        conn.commit()

        return jsonify({
            "message": "Account created successfully",
            "userId": user_id
        }), 201

    except sqlite3.IntegrityError:
        return jsonify({"error": "Email already registered"}), 409

    finally:
        conn.close()


# --------------------------------------------------
# LOGIN / LOGOUT / CURRENT USER
# --------------------------------------------------

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}

    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")

    conn = get_db()
    user = conn.execute(
        "SELECT * FROM users WHERE email = ?",
        (email,)
    ).fetchone()
    conn.close()

    if not user or not check_password_hash(
        user["password"], password
    ):
        return jsonify({"error": "Invalid email or password"}), 401

    session.clear()
    session["user_id"] = user["id"]

    return jsonify({
        "message": "Login successful",
        "user": public_user(user)
    })


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out successfully"})


@app.route("/api/me", methods=["GET"])
@login_required
def me():
    user = current_user()

    return jsonify({
        "user": public_user(user)
    })


# --------------------------------------------------
# PROFILE
# --------------------------------------------------

@app.route("/api/profile", methods=["GET"])
@login_required
def get_profile():
    return jsonify({
        "user": public_user(current_user())
    })


@app.route("/api/profile", methods=["PUT"])
@login_required
def update_profile():
    data = request.get_json(silent=True) or {}
    user_id = session["user_id"]

    # API field name -> SQLite column name.
    allowed_fields = {
        "name": "name",
        "phone": "phone",
        "college": "college",
        "enrollment": "enrollment",
        "course": "course",
        "semester": "semester",
        "department": "department",
        "facultyId": "faculty_id"
    }

    values = {
        column: data[api_field]
        for api_field, column in allowed_fields.items()
        if api_field in data
    }

    if not values:
        return jsonify({"error": "No profile changes provided"}), 400

    query = ", ".join(
        f"{column} = ?" for column in values
    )

    conn = get_db()
    conn.execute(
        f"UPDATE users SET {query} WHERE id = ?",
        (*values.values(), user_id)
    )
    conn.commit()

    user = conn.execute(
        "SELECT * FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()

    conn.close()

    return jsonify({
        "message": "Profile updated successfully",
        "user": public_user(user)
    })


# --------------------------------------------------
# CLASSES
# --------------------------------------------------

@app.route("/api/classes", methods=["POST"])
@role_required("faculty")
def create_class():
    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()

    if not name:
        return jsonify({"error": "Class name is required"}), 400

    class_id = str(uuid.uuid4())

    conn = get_db()
    conn.execute("""
    INSERT INTO classes (
        id, faculty_id, name, course,
        semester, section, description, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        class_id,
        session["user_id"],
        name,
        data.get("course", ""),
        data.get("semester", ""),
        data.get("section", ""),
        data.get("description", ""),
        datetime.now().isoformat()
    ))

    conn.commit()
    conn.close()

    return jsonify({
        "message": "Class created successfully",
        "classId": class_id
    }), 201


@app.route("/api/classes", methods=["GET"])
@login_required
def get_classes():
    user = current_user()
    conn = get_db()

    if user["role"] == "faculty":
        rows = conn.execute("""
            SELECT * FROM classes
            WHERE faculty_id = ?
            ORDER BY created_at DESC
        """, (user["id"],)).fetchall()
    else:
        rows = conn.execute("""
            SELECT c.* FROM classes c
            JOIN class_members m ON c.id = m.class_id
            WHERE m.student_id = ?
        """, (user["id"],)).fetchall()

    classes = [dict(row) for row in rows]
    conn.close()

    return jsonify({"classes": classes})


@app.route("/api/classes/<class_id>/members", methods=["POST"])
@role_required("faculty")
def add_class_member(class_id):
    data = request.get_json(silent=True) or {}
    student_id = data.get("studentId")

    conn = get_db()

    cls = conn.execute("""
        SELECT * FROM classes
        WHERE id = ? AND faculty_id = ?
    """, (class_id, session["user_id"])).fetchone()

    student = conn.execute("""
        SELECT * FROM users
        WHERE id = ? AND role = 'student'
    """, (student_id,)).fetchone()

    if not cls or not student:
        conn.close()
        return jsonify({"error": "Invalid class or student"}), 400

    try:
        conn.execute("""
            INSERT INTO class_members (class_id, student_id)
            VALUES (?, ?)
        """, (class_id, student_id))

        conn.commit()

    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"error": "Student already in class"}), 409

    conn.close()

    return jsonify({"message": "Student added to class"}), 201


# --------------------------------------------------
# ASSIGNMENTS
# --------------------------------------------------

@app.route("/api/assignments", methods=["POST"])
@role_required("faculty")
def create_assignment():
    data = request.get_json(silent=True) or {}

    class_id = data.get("classId")
    title = str(data.get("title", "")).strip()
    deadline = data.get("deadline")

    if not class_id or not title or not deadline:
        return jsonify({"error": "Fill all assignment fields"}), 400

    if deadline_passed(deadline):
        return jsonify({"error": "Deadline must be in the future"}), 400

    conn = get_db()

    cls = conn.execute("""
        SELECT * FROM classes
        WHERE id = ? AND faculty_id = ?
    """, (class_id, session["user_id"])).fetchone()

    if not cls:
        conn.close()
        return jsonify({"error": "Class not found"}), 403

    assignment_id = str(uuid.uuid4())

    conn.execute("""
    INSERT INTO assignments (
        id, faculty_id, class_id, title,
        subject, description, deadline, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        assignment_id,
        session["user_id"],
        class_id,
        title,
        data.get("subject", ""),
        data.get("description", ""),
        deadline,
        datetime.now().isoformat()
    ))

    conn.commit()
    conn.close()

    return jsonify({
        "message": "Assignment created successfully",
        "assignmentId": assignment_id
    }), 201


@app.route("/api/assignments", methods=["GET"])
@login_required
def get_assignments():
    user = current_user()
    conn = get_db()

    if user["role"] == "faculty":
        rows = conn.execute("""
            SELECT a.*, c.name AS class_name
            FROM assignments a
            JOIN classes c ON c.id = a.class_id
            WHERE a.faculty_id = ?
            ORDER BY a.created_at DESC
        """, (user["id"],)).fetchall()
    else:
        rows = conn.execute("""
            SELECT a.*, c.name AS class_name
            FROM assignments a
            JOIN classes c ON c.id = a.class_id
            JOIN class_members m ON m.class_id = c.id
            WHERE m.student_id = ?
            ORDER BY a.created_at DESC
        """, (user["id"],)).fetchall()

    assignments = []

    for row in rows:
        item = dict(row)

        submission = conn.execute("""
            SELECT file_name, submitted_at
            FROM submissions
            WHERE assignment_id = ? AND student_id = ?
        """, (item["id"], user["id"])).fetchone()

        item["mySubmission"] = (
            dict(submission) if submission else None
        )
        item["isExpired"] = deadline_passed(item["deadline"])

        assignments.append(item)

    conn.close()

    return jsonify({"assignments": assignments})


# --------------------------------------------------
# STUDENT FILE SUBMISSION
# --------------------------------------------------

@app.route(
    "/api/assignments/<assignment_id>/submit",
    methods=["POST"]
)
@role_required("student")
def submit_assignment(assignment_id):
    file = request.files.get("file")

    if not file or not file.filename:
        return jsonify({"error": "Please select a file"}), 400

    conn = get_db()

    assignment = conn.execute("""
        SELECT * FROM assignments WHERE id = ?
    """, (assignment_id,)).fetchone()

    if not assignment:
        conn.close()
        return jsonify({"error": "Assignment not found"}), 404

    member = conn.execute("""
        SELECT * FROM class_members
        WHERE class_id = ? AND student_id = ?
    """, (
        assignment["class_id"],
        session["user_id"]
    )).fetchone()

    if not member:
        conn.close()
        return jsonify({"error": "You are not in this class"}), 403

    if deadline_passed(assignment["deadline"]):
        conn.close()
        return jsonify({"error": "Submission portal is closed"}), 403

    existing = conn.execute("""
        SELECT id FROM submissions
        WHERE assignment_id = ? AND student_id = ?
    """, (
        assignment_id,
        session["user_id"]
    )).fetchone()

    if existing:
        conn.close()
        return jsonify({"error": "Already submitted"}), 409

    original_name = secure_filename(file.filename)
    extension = os.path.splitext(original_name)[1].lower()

    allowed = [
        ".pdf", ".doc", ".docx", ".ppt", ".pptx",
        ".png", ".jpg", ".jpeg", ".zip"
    ]

    if extension not in allowed:
        conn.close()
        return jsonify({"error": "File type not allowed"}), 400

    stored_name = str(uuid.uuid4()) + extension
    file.save(os.path.join(UPLOAD_FOLDER, stored_name))

    conn.execute("""
        INSERT INTO submissions (
            id, assignment_id, student_id,
            file_name, stored_name, submitted_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        str(uuid.uuid4()),
        assignment_id,
        session["user_id"],
        original_name,
        stored_name,
        datetime.now().isoformat()
    ))

    conn.commit()
    conn.close()

    return jsonify({
        "message": "Assignment submitted successfully"
    }), 201


# --------------------------------------------------
# FACULTY SUBMISSION TRACKING
# --------------------------------------------------

@app.route(
    "/api/assignments/<assignment_id>/submissions",
    methods=["GET"]
)
@role_required("faculty")
def view_submissions(assignment_id):
    conn = get_db()

    assignment = conn.execute("""
        SELECT * FROM assignments
        WHERE id = ? AND faculty_id = ?
    """, (
        assignment_id,
        session["user_id"]
    )).fetchone()

    if not assignment:
        conn.close()
        return jsonify({"error": "Assignment not found"}), 404

    submitted = conn.execute("""
        SELECT u.name, u.enrollment, u.email,
               s.file_name, s.submitted_at
        FROM submissions s
        JOIN users u ON u.id = s.student_id
        WHERE s.assignment_id = ?
    """, (assignment_id,)).fetchall()

    pending = conn.execute("""
        SELECT u.name, u.enrollment, u.email
        FROM class_members m
        JOIN users u ON u.id = m.student_id
        WHERE m.class_id = ?
        AND u.id NOT IN (
            SELECT student_id FROM submissions
            WHERE assignment_id = ?
        )
    """, (
        assignment["class_id"],
        assignment_id
    )).fetchall()

    conn.close()

    return jsonify({
        "submitted": [dict(row) for row in submitted],
        "pending": [dict(row) for row in pending]
    })


# --------------------------------------------------
# ERROR HANDLING
# --------------------------------------------------

@app.errorhandler(413)
def file_too_large(error):
    return jsonify({
        "error": "File is too large. Maximum size is 16 MB."
    }), 413


# --------------------------------------------------
# START SERVER
# --------------------------------------------------

init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))

    app.run(
        host="0.0.0.0",
        port=port,
        debug=True
    )

