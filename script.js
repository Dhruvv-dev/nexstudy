/* =========================================================
   NEXSTUDY — COMPLETE FRONTEND JAVASCRIPT
   Backend connected:
   - Login: POST /api/login
   - Profile: PUT /api/profile/<user_id>

   Other modules currently use browser localStorage.
========================================================= */


/* =========================================================
   1. DATABASE AND HELPER FUNCTIONS
========================================================= */

const DB = {
  users: "nex_users_v2",
  current: "nex_current_v2",
  classes: "nex_classes_v2",
  assignments: "nex_assignments_v2",
  quizzes: "nex_quizzes_v2",
  attempts: "nex_attempts_v2",
  posts: "nex_posts_v2",
  seniors: "nex_seniors_v2"
};

const $ = id => document.getElementById(id);

function read(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("Storage read error:", key, error);
    return [];
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uid() {
  return Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function dateText(value) {
  if (!value) return "No date";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return date.toLocaleString();
}

function isExpired(value) {
  if (!value) return false;

  const date = new Date(value).getTime();

  return !Number.isNaN(date) && date < Date.now();
}

function currentUser() {
  const currentId = localStorage.getItem(DB.current);

  if (!currentId) return null;

  return read(DB.users).find(
    user => String(user.id) === String(currentId)
  ) || null;
}

function updateUserInStorage(updatedUser) {
  const users = read(DB.users);

  const index = users.findIndex(
    user => String(user.id) === String(updatedUser.id)
  );

  if (index === -1) {
    users.push(updatedUser);
  } else {
    users[index] = {
      ...users[index],
      ...updatedUser
    };
  }

  write(DB.users, users);
}

function safeValue(id) {
  return $(id)?.value ?? "";
}

function setText(id, value) {
  if ($(id)) {
    $(id).textContent = value ?? "";
  }
}

function toast(message) {
  const el = $("toast");

  if (!el) {
    console.log(message);
    return;
  }

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    el.classList.remove("show");
  }, 2800);
}


/* =========================================================
   2. GLOBAL VARIABLES
========================================================= */

let selectedRole = "student";
let quizSession = null;
let selectedAnswers = {};
let rosterRows = [];


/* =========================================================
   3. LOGIN AND REGISTER SCREEN
========================================================= */

function showAuth(view) {
  $("loginView")?.classList.toggle("hidden", view !== "login");
  $("registerView")?.classList.toggle("hidden", view !== "register");

  document.querySelectorAll("[data-auth]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.auth === view
    );
  });
}

document.querySelectorAll("[data-auth]").forEach(button => {
  button.addEventListener("click", () => {
    showAuth(button.dataset.auth);
  });
});

document.querySelectorAll("[data-switch]").forEach(button => {
  button.addEventListener("click", () => {
    showAuth(button.dataset.switch);
  });
});


/* =========================================================
   4. STUDENT / FACULTY ROLE SELECTION
========================================================= */

document.querySelectorAll("[data-role]").forEach(button => {
  button.addEventListener("click", () => {
    selectedRole = button.dataset.role;

    document.querySelectorAll("[data-role]").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    $("studentFields")?.classList.toggle(
      "hidden",
      selectedRole !== "student"
    );

    $("facultyFields")?.classList.toggle(
      "hidden",
      selectedRole !== "faculty"
    );
  });
});


/* =========================================================
   5. REGISTER ACCOUNT

   Registration is currently browser-local because the
   current Python backend does not have a register API.
========================================================= */

function registerAccount(event) {
  event.preventDefault();

  const users = read(DB.users);

  const email = safeValue("regEmail")
    .trim()
    .toLowerCase();

  const password = safeValue("regPassword");

  const confirmPassword = safeValue("regConfirm");

  if (password.length < 6) {
    return toast("Password must contain at least 6 characters.");
  }

  if (password !== confirmPassword) {
    return toast("Passwords do not match.");
  }

  if (users.some(user => user.email === email)) {
    return toast("This email is already registered in this browser.");
  }

  const user = {
    id: uid(),
    role: selectedRole,

    name: safeValue("regName").trim(),
    email,
    password,

    phone: safeValue("regPhone").trim(),
    college: safeValue("regCollege").trim(),

    enrollment: safeValue("regEnrollment").trim(),
    course: safeValue("regCourse").trim(),
    semester: safeValue("regSemester").trim(),

    department: safeValue("regDepartment").trim(),
    facultyId: safeValue("regFacultyId").trim(),

    photo: "",
    authSource: "local",

    createdAt: new Date().toISOString()
  };

  users.push(user);

  write(DB.users, users);

  localStorage.setItem(DB.current, String(user.id));

  $("registerForm").reset();

  openApp();

  toast("Account created successfully.");
}

$("registerForm")?.addEventListener(
  "submit",
  registerAccount
);


/* =========================================================
   6. LOGIN ACCOUNT — PYTHON BACKEND
========================================================= */

async function loginAccount(event) {
  event.preventDefault();

  const email = safeValue("loginEmail")
    .trim()
    .toLowerCase();

  const password = safeValue("loginPassword");

  if (!email || !password) {
    return toast("Enter email and password.");
  }

  try {
    const response = await fetch("/api/login", {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        email,
        password
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return toast(data.error || "Login failed.");
    }

    if (!data.user || data.user.id === undefined) {
      return toast("Invalid user information received from server.");
    }

    const backendUser = {
      ...data.user,

      id: String(data.user.id),

      photo: "",
      authSource: "backend"
    };

    // Preserve the user's previously saved profile photo.
    const existingUser = read(DB.users).find(
      user => String(user.id) === backendUser.id
    );

    if (existingUser?.photo) {
      backendUser.photo = existingUser.photo;
    }

    updateUserInStorage(backendUser);

    localStorage.setItem(
      DB.current,
      backendUser.id
    );

    $("loginForm").reset();

    openApp();

    toast("Login successful!");

  } catch (error) {
    console.error("Login error:", error);

    // Local account fallback for accounts created
    // through the current browser-only registration.
    const localUser = read(DB.users).find(user =>
      user.email === email &&
      user.password === password &&
      user.authSource !== "backend"
    );

    if (localUser) {
      localStorage.setItem(
        DB.current,
        String(localUser.id)
      );

      $("loginForm").reset();

      openApp();

      toast("Logged in using local preview account.");

      return;
    }

    toast("Server error. Check if Python is running.");
  }
}

$("loginForm")?.addEventListener(
  "submit",
  loginAccount
);


/* =========================================================
   7. OPEN APPLICATION
========================================================= */

function openApp() {
  const user = currentUser();

  if (!user) {
    showLoginScreen();
    return;
  }

  $("authScreen")?.classList.add("hidden");
  $("appShell")?.classList.remove("hidden");

  setText("sideName", user.name);
  setText("sideRole", user.role);

  const avatar = $("sideAvatar");

  if (avatar) {
    avatar.innerHTML = user.photo
      ? `<img src="${user.photo}" alt="Profile">`
      : esc((user.name || "U").charAt(0).toUpperCase());
  }

  setText(
    "welcomeName",
    (user.name || "User").split(" ")[0]
  );

  setText(
    "roleBadge",
    (user.role || "student").toUpperCase()
  );

  setText(
    "welcomeMessage",
    user.role === "faculty"
      ? "Manage your classes, assignments and student learning."
      : "Your academics, activities and progress in one place."
  );

  document.querySelectorAll(".faculty-only").forEach(element => {
    element.classList.toggle(
      "hidden",
      user.role !== "faculty"
    );
  });

  $("profileStudentFields")?.classList.toggle(
    "hidden",
    user.role !== "student"
  );

  $("profileFacultyFields")?.classList.toggle(
    "hidden",
    user.role !== "faculty"
  );

  renderAll();

  showPage("dashboard");
}


function showLoginScreen() {
  $("appShell")?.classList.add("hidden");
  $("authScreen")?.classList.remove("hidden");

  showAuth("login");
}


/* =========================================================
   8. LOGOUT
========================================================= */

$("logoutBtn")?.addEventListener("click", () => {
  localStorage.removeItem(DB.current);

  showLoginScreen();

  toast("You have signed out.");
});


/* =========================================================
   9. PAGE NAVIGATION
========================================================= */

function showPage(page) {
  document.querySelectorAll(".page").forEach(element => {
    element.classList.remove("active");
  });

  const target = $("page-" + page);

  if (!target) return;

  target.classList.add("active");

  document.querySelectorAll(".nav-link[data-page]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });

  const titles = {
    dashboard: "Dashboard",
    dailyhub: "Daily Hub",
    assignments: "Assignments",
    classes: "My Classes",
    community: "Class Community",
    seniors: "Senior Connect",
    profile: "My Profile"
  };

  setText("pageTitle", titles[page] || "NEXSTUDY");

  $("sidebar")?.classList.remove("open");

  renderAll();
}

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => {
    showPage(button.dataset.page);
  });
});

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => {
    showPage(button.dataset.go);
  });
});

$("topProfile")?.addEventListener("click", () => {
  showPage("profile");
});

$("menuToggle")?.addEventListener("click", () => {
  $("sidebar")?.classList.toggle("open");
});


/* =========================================================
   10. CLASS HELPERS
========================================================= */

function myClasses() {
  const user = currentUser();

  if (!user) return [];

  const classes = read(DB.classes);

  return user.role === "faculty"
    ? classes.filter(classItem =>
        String(classItem.facultyId) === String(user.id)
      )
    : classes.filter(classItem =>
        (classItem.memberIds || []).some(
          id => String(id) === String(user.id)
        )
      );
}


function populateClassSelects() {
  const classes = myClasses();

  const selectIds = [
    "assignmentClass",
    "quizClass",
    "rosterClass",
    "postClass"
  ];

  selectIds.forEach(id => {
    const element = $(id);

    if (!element) return;

    const previousValue = element.value;

    element.innerHTML = classes.map(classItem => `
      <option value="${esc(classItem.id)}">
        ${esc(classItem.name)}
      </option>
    `).join("") || `
      <option value="">No classes available</option>
    `;

    if (classes.some(classItem =>
      String(classItem.id) === String(previousValue)
    )) {
      element.value = previousValue;
    }
  });
}


/* =========================================================
   11. RENDER ALL FEATURES
========================================================= */

function renderAll() {
  if (!currentUser()) return;

  populateClassSelects();

  renderDashboard();
  renderAssignments();
  renderClasses();
  renderCommunity();
  renderSeniors();
  renderProfile();
  renderDailyHub();
}


/* =========================================================
   12. DASHBOARD
========================================================= */

function renderDashboard() {
  const user = currentUser();

  if (!user) return;

  const classes = myClasses();

  const assignments = read(DB.assignments).filter(item => {
    return user.role === "faculty"
      ? String(item.facultyId) === String(user.id)
      : classes.some(classItem =>
          String(classItem.id) === String(item.classId)
        );
  });

  const done = assignments.filter(item =>
    (item.submissions || []).some(submission =>
      String(submission.userId) === String(user.id)
    )
  ).length;

  const pending = assignments.filter(item =>
    !isExpired(item.deadline) &&
    !(item.submissions || []).some(submission =>
      String(submission.userId) === String(user.id)
    )
  ).length;

  const stats = user.role === "faculty"
    ? [
        ["My classes", classes.length],
        ["Assignments", assignments.length],
        [
          "Total submissions",
          assignments.reduce(
            (total, item) => total + (item.submissions || []).length,
            0
          )
        ]
      ]
    : [
        ["My classes", classes.length],
        ["Pending tasks", pending],
        ["Submitted", done]
      ];

  $("dashboardStats").innerHTML = stats.map(([label, value]) => `
    <article class="stat-card glass">
      <small>${esc(label)}</small>
      <strong>${value}</strong>
    </article>
  `).join("");


  const upcoming = assignments
    .filter(item => !isExpired(item.deadline))
    .sort((a, b) =>
      new Date(a.deadline) - new Date(b.deadline)
    )
    .slice(0, 4);

  $("dashboardAssignments").innerHTML = upcoming.length
    ? upcoming.map(item => {
        const submitted = (item.submissions || []).some(
          submission =>
            String(submission.userId) === String(user.id)
        );

        return `
          <div class="list-item">
            <div>
              <strong>${esc(item.title)}</strong>
              <small>
                ${esc(item.subject)} · Due ${dateText(item.deadline)}
              </small>
            </div>

            <span class="badge ${submitted ? "success" : "warning"}">
              ${submitted ? "Submitted" : "Open"}
            </span>
          </div>
        `;
      }).join("")
    : `<div class="empty-state">No upcoming assignments.</div>`;


  $("dashboardClasses").innerHTML = classes
    .slice(0, 4)
    .map(classItem => `
      <div class="list-item">
        <div>
          <strong>${esc(classItem.name)}</strong>
          <small>
            ${esc(classItem.course)} · Semester
            ${esc(classItem.semester || "-")}
          </small>
        </div>
      </div>
    `).join("") || `
      <div class="empty-state">No classes added yet.</div>
    `;


  const percent = assignments.length
    ? Math.round((done / assignments.length) * 100)
    : 0;

  $("progressOverview").innerHTML = `
    <strong>${percent}% completed</strong>

    <div class="progress-track">
      <span style="width:${percent}%"></span>
    </div>

    <small class="muted">
      ${done} of ${assignments.length} assignments submitted.
    </small>
  `;
}


/* =========================================================
   13. FACULTY — CREATE ASSIGNMENT
========================================================= */

$("assignmentForm")?.addEventListener("submit", event => {
  event.preventDefault();

  const user = currentUser();

  if (!user || user.role !== "faculty") {
    return toast("Faculty access only.");
  }

  const classId = safeValue("assignmentClass");

  if (!classId) {
    return toast("Create a class first.");
  }

  const deadlineValue = safeValue("assignmentDeadline");

  if (!deadlineValue) {
    return toast("Select an assignment deadline.");
  }

  const deadline = new Date(deadlineValue);

  if (Number.isNaN(deadline.getTime())) {
    return toast("Invalid deadline.");
  }

  const items = read(DB.assignments);

  items.push({
    id: uid(),

    facultyId: user.id,
    classId,

    title: safeValue("assignmentTitle").trim(),
    subject: safeValue("assignmentSubject").trim(),
    description: safeValue("assignmentDescription").trim(),

    deadline: deadline.toISOString(),

    submissions: [],

    createdAt: new Date().toISOString()
  });

  write(DB.assignments, items);

  event.target.reset();

  renderAll();

  toast("Assignment published.");
});


/* =========================================================
   14. RENDER ASSIGNMENTS
========================================================= */

function renderAssignments() {
  const user = currentUser();

  if (!user) return;

  const classes = myClasses();

  const search = safeValue("assignmentSearch").toLowerCase();

  const filter = safeValue("assignmentFilter") || "all";

  const items = read(DB.assignments)
    .filter(item => {
      return user.role === "faculty"
        ? String(item.facultyId) === String(user.id)
        : classes.some(classItem =>
            String(classItem.id) === String(item.classId)
          );
    })
    .filter(item =>
      (item.title + " " + item.subject)
        .toLowerCase()
        .includes(search)
    )
    .filter(item => {
      const submitted = (item.submissions || []).some(
        submission =>
          String(submission.userId) === String(user.id)
      );

      if (filter === "submitted") return submitted;

      if (filter === "pending") {
        return !submitted && !isExpired(item.deadline);
      }

      if (filter === "expired") {
        return isExpired(item.deadline) && !submitted;
      }

      return true;
    })
    .sort((a, b) =>
      new Date(a.deadline) - new Date(b.deadline)
    );


  $("assignmentList").innerHTML = items.length
    ? items.map(item => {
        const submitted = (item.submissions || []).some(
          submission =>
            String(submission.userId) === String(user.id)
        );

        const expired = isExpired(item.deadline);

        const className = classes.find(classItem =>
          String(classItem.id) === String(item.classId)
        )?.name || "Class";

        return `
          <article class="data-card glass">

            <span class="badge ${
              submitted ? "success" : expired ? "danger" : "warning"
            }">
              ${submitted ? "Submitted" : expired ? "Closed" : "Open"}
            </span>

            <h3>${esc(item.title)}</h3>

            <p>
              ${esc(item.subject)} · ${esc(className)}
            </p>

            <p>
              ${esc(item.description || "No extra instructions.")}
            </p>

            <p>
              <strong>Deadline:</strong>
              ${dateText(item.deadline)}
            </p>

            <p>
              <strong>Submissions:</strong>
              ${(item.submissions || []).length}
            </p>

            <div class="card-actions">

              ${
                user.role === "student" && !submitted && !expired
                  ? `<button class="btn primary"
                      onclick="submitAssignment('${item.id}')">
                      Submit work
                    </button>`
                  : ""
              }

              ${
                user.role === "faculty"
                  ? `
                    <button class="btn secondary"
                      onclick="viewSubmissions('${item.id}')">
                      View students
                    </button>

                    <button class="btn danger"
                      onclick="deleteAssignment('${item.id}')">
                      Delete
                    </button>
                  `
                  : ""
              }

            </div>
          </article>
        `;
      }).join("")
    : `<div class="empty-state">No assignments found.</div>`;
}


$("assignmentSearch")?.addEventListener(
  "input",
  renderAssignments
);

$("assignmentFilter")?.addEventListener(
  "change",
  renderAssignments
);


/* =========================================================
   15. STUDENT — SUBMIT ASSIGNMENT
========================================================= */

function submitAssignment(id) {
  const items = read(DB.assignments);

  const assignment = items.find(item =>
    String(item.id) === String(id)
  );

  const user = currentUser();

  if (!assignment || !user || user.role !== "student") {
    return toast("Student account required.");
  }

  if (isExpired(assignment.deadline)) {
    return toast("Submission portal is closed.");
  }

  if ((assignment.submissions || []).some(submission =>
    String(submission.userId) === String(user.id)
  )) {
    return toast("Already submitted.");
  }

  const fileInput = document.createElement("input");

  fileInput.type = "file";

  fileInput.accept =
    ".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.zip";

  fileInput.onchange = () => {
    const file = fileInput.files[0];

    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      return toast("File must be 5 MB or smaller in this preview.");
    }

    // This preview stores submission details only.
    // Actual file upload needs a backend upload API.

    assignment.submissions = assignment.submissions || [];

    assignment.submissions.push({
      userId: user.id,
      name: user.name,
      enrollment: user.enrollment || "",
      fileName: file.name,
      fileSize: file.size,
      submittedAt: new Date().toISOString()
    });

    write(DB.assignments, items);

    renderAll();

    toast("Submission recorded in this browser.");
  };

  fileInput.click();
}


/* =========================================================
   16. FACULTY — VIEW SUBMISSIONS
========================================================= */

function viewSubmissions(id) {
  const assignment = read(DB.assignments).find(item =>
    String(item.id) === String(id)
  );

  if (!assignment) return;

  const classItem = read(DB.classes).find(item =>
    String(item.id) === String(assignment.classId)
  );

  const members = classItem?.memberIds || [];

  const users = read(DB.users);

  const submissions = assignment.submissions || [];

  const submittedIds = submissions.map(
    submission => String(submission.userId)
  );

  const submitted = submissions.map(submission => `
    <div class="list-item">
      <div>
        <strong>${esc(submission.name)}</strong>
        <small>
          ${esc(submission.enrollment || "No enrollment")}
          · ${esc(submission.fileName)}
        </small>
      </div>

      <span class="badge success">Submitted</span>
    </div>
  `).join("");

  const pendingUsers = members.filter(id =>
    !submittedIds.includes(String(id))
  );

  const pending = pendingUsers.map(id => {
    const student = users.find(user =>
      String(user.id) === String(id)
    );

    return student
      ? `
        <div class="list-item">
          <strong>${esc(student.name)}</strong>
          <span class="badge warning">Pending</span>
        </div>
      `
      : "";
  }).join("");

  showModal(
    assignment.title,
    `
      <h3>Submitted (${submissions.length})</h3>

      ${submitted || "<p>No submissions yet.</p>"}

      <h3 style="margin-top:20px">
        Pending (${pendingUsers.length})
      </h3>

      ${pending || "<p>No pending students recorded.</p>"}
    `
  );
}


/* =========================================================
   17. FACULTY — DELETE ASSIGNMENT
========================================================= */

function deleteAssignment(id) {
  const user = currentUser();

  if (!user || user.role !== "faculty") {
    return toast("Faculty access only.");
  }

  const items = read(DB.assignments);

  const assignment = items.find(item =>
    String(item.id) === String(id)
  );

  if (!assignment ||
      String(assignment.facultyId) !== String(user.id)) {
    return toast("Assignment not found.");
  }

  if (!confirm("Delete this assignment?")) return;

  write(
    DB.assignments,
    items.filter(item => String(item.id) !== String(id))
  );

  renderAll();

  toast("Assignment deleted.");
}


/* =========================================================
   18. FACULTY — CREATE CLASS
========================================================= */

$("classForm")?.addEventListener("submit", event => {
  event.preventDefault();

  const user = currentUser();

  if (!user || user.role !== "faculty") {
    return toast("Faculty access only.");
  }

  const classes = read(DB.classes);

  classes.push({
    id: uid(),

    facultyId: user.id,

    name: safeValue("className").trim(),
    course: safeValue("classCourse").trim(),
    semester: safeValue("classSemester").trim(),
    section: safeValue("classSection").trim(),

    description: safeValue("classDescription").trim(),

    memberIds: [],

    createdAt: new Date().toISOString()
  });

  write(DB.classes, classes);

  event.target.reset();

  renderAll();

  toast("Class created.");
});


/* =========================================================
   19. RENDER CLASSES
========================================================= */

function renderClasses() {
  const user = currentUser();

  if (!user) return;

  const classes = myClasses();

  $("classList").innerHTML = classes.length
    ? classes.map(classItem => `
        <article class="data-card glass">

          <span class="badge">
            ${user.role === "faculty" ? "FACULTY CLASS" : "MY CLASS"}
          </span>

          <h3>${esc(classItem.name)}</h3>

          <p>
            ${esc(classItem.course)}
            · Semester ${esc(classItem.semester || "-")}
            · Section ${esc(classItem.section || "-")}
          </p>

          <p>
            ${esc(classItem.description || "No description.")}
          </p>

          <p>
            <strong>${(classItem.memberIds || []).length}</strong>
            students in roster
          </p>

          ${
            user.role === "faculty"
              ? `
                <div class="card-actions">
                  <button class="btn secondary"
                    onclick="viewClassStudents('${classItem.id}')">
                    View roster
                  </button>
                </div>
              `
              : ""
          }

        </article>
      `).join("")
    : `<div class="empty-state">No classes available yet.</div>`;
}


/* =========================================================
   20. FACULTY — VIEW CLASS ROSTER
========================================================= */

function viewClassStudents(id) {
  const user = currentUser();

  if (!user || user.role !== "faculty") return;

  const classItem = read(DB.classes).find(item =>
    String(item.id) === String(id) &&
    String(item.facultyId) === String(user.id)
  );

  if (!classItem) return;

  const users = read(DB.users).filter(student =>
    (classItem.memberIds || []).some(
      memberId => String(memberId) === String(student.id)
    )
  );

  const html = users.map(student => `
    <div class="list-item">
      <div>
        <strong>${esc(student.name)}</strong>
        <small>
          ${esc(student.enrollment || "No enrollment")}
          · ${esc(student.email)}
        </small>
      </div>
    </div>
  `).join("");

  showModal(
    classItem.name + " — Student roster",
    html || "<p>No students in this roster yet.</p>"
  );
}


/* =========================================================
   21. FACULTY — PDF ROSTER IMPORT
========================================================= */

$("rosterForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const user = currentUser();

  if (!user || user.role !== "faculty") {
    return toast("Faculty access only.");
  }

  const file = $("rosterPdf")?.files?.[0];

  const classId = safeValue("rosterClass");

  if (!file || !classId) {
    return toast("Choose a class and PDF.");
  }

  if (file.size > 150 * 1024) {
    return toast("PDF must be 150 KB or smaller.");
  }

  if (!window.pdfjsLib) {
    return toast("PDF reader could not load. Check your internet connection.");
  }

  try {
    const data = new Uint8Array(
      await file.arrayBuffer()
    );

    const pdf = await pdfjsLib.getDocument({
      data
    }).promise;

    let text = "";

    for (let pageNumber = 1;
         pageNumber <= pdf.numPages;
         pageNumber++) {

      const page = await pdf.getPage(pageNumber);

      const content = await page.getTextContent();

      text += content.items
        .map(item => item.str)
        .join(" ") + "\n";
    }

    const lines = text
      .split(/\n/)
      .map(line => line.trim())
      .filter(Boolean);

    rosterRows = lines.map(line => {
      const match = line.match(
        /([A-Za-z0-9/-]{5,})\s+(.+)/
      );

      return match
        ? {
            enrollment: match[1],
            name: match[2].trim()
          }
        : null;
    }).filter(Boolean);


    $("rosterPreview").innerHTML = rosterRows.length
      ? `
        <p class="muted">
          Found ${rosterRows.length} possible records.
          Check the extracted text before importing.
        </p>

        ${rosterRows.map(row => `
          <div class="list-item">
            <strong>${esc(row.name)}</strong>
            <small>${esc(row.enrollment)}</small>
          </div>
        `).join("")}

        <button class="btn primary" id="confirmRoster">
          Add matching registered students
        </button>
      `
      : `
        <p class="muted">
          Could not detect enrollment/name pairs.
          Use a text-based PDF with enrollment number
          followed by student name.
        </p>
      `;

    $("confirmRoster")?.addEventListener("click", () => {
      importRoster(classId);
    });

  } catch (error) {
    console.error("PDF error:", error);

    toast("Could not read this PDF.");
  }
});


/* =========================================================
   22. IMPORT MATCHING REGISTERED STUDENTS
========================================================= */

function importRoster(classId) {
  const user = currentUser();

  if (!user || user.role !== "faculty") return;

  const users = read(DB.users);

  const classes = read(DB.classes);

  const classItem = classes.find(item =>
    String(item.id) === String(classId) &&
    String(item.facultyId) === String(user.id)
  );

  if (!classItem) return;

  classItem.memberIds = classItem.memberIds || [];

  let added = 0;

  rosterRows.forEach(row => {
    const userMatch = users.find(student =>
      student.role === "student" &&
      String(student.enrollment || "").toLowerCase() ===
        String(row.enrollment).toLowerCase()
    );

    if (
      userMatch &&
      !classItem.memberIds.some(
        id => String(id) === String(userMatch.id)
      )
    ) {
      classItem.memberIds.push(userMatch.id);

      added++;
    }
  });

  write(DB.classes, classes);

  $("rosterPreview").innerHTML = `
    <p class="muted">
      ${added} registered students matched and added.
      Unregistered students need to create an account first.
    </p>
  `;

  renderAll();

  toast("Roster import completed.");
}


/* =========================================================
   23. CLASS COMMUNITY — CREATE POST
========================================================= */

$("postForm")?.addEventListener("submit", event => {
  event.preventDefault();

  const user = currentUser();

  if (!user) return;

  const classId = safeValue("postClass");

  if (!classId) {
    return toast("No class available.");
  }

  if (!myClasses().some(item =>
    String(item.id) === String(classId)
  )) {
    return toast("You are not a member of this class.");
  }

  const text = safeValue("postText").trim();

  if (!text) {
    return toast("Write something before publishing.");
  }

  const posts = read(DB.posts);

  posts.unshift({
    id: uid(),

    userId: user.id,
    name: user.name,
    role: user.role,

    classId,
    text,

    createdAt: new Date().toISOString()
  });

  write(DB.posts, posts);

  event.target.reset();

  renderCommunity();

  toast("Post published.");
});


/* =========================================================
   24. RENDER CLASS COMMUNITY
========================================================= */

function renderCommunity() {
  const user = currentUser();

  if (!user) return;

  const classIds = myClasses().map(item =>
    String(item.id)
  );

  const classes = read(DB.classes);

  const posts = read(DB.posts).filter(post =>
    classIds.includes(String(post.classId))
  );

  $("communityFeed").innerHTML = posts.length
    ? posts.map(post => {
        const classItem = classes.find(item =>
          String(item.id) === String(post.classId)
        );

        return `
          <article class="feed-post glass">

            <div class="feed-meta">
              ${esc(post.name)}
              · ${esc(post.role)}
              · ${esc(classItem?.name || "Class")}
              · ${dateText(post.createdAt)}
            </div>

            <p>${esc(post.text)}</p>

            ${
              String(post.userId) === String(user.id)
                ? `
                  <button class="btn danger"
                    onclick="deletePost('${post.id}')">
                    Remove post
                  </button>
                `
                : ""
            }

          </article>
        `;
      }).join("")
    : `
      <div class="empty-state">
        No posts in your classes yet. Start the conversation.
      </div>
    `;
}


/* =========================================================
   25. DELETE COMMUNITY POST
========================================================= */

function deletePost(id) {
  const user = currentUser();

  if (!user) return;

  const posts = read(DB.posts);

  const post = posts.find(item =>
    String(item.id) === String(id)
  );

  if (!post || String(post.userId) !== String(user.id)) {
    return toast("You cannot remove this post.");
  }

  write(
    DB.posts,
    posts.filter(item => String(item.id) !== String(id))
  );

  renderCommunity();

  toast("Post removed.");
}


/* =========================================================
   26. SENIOR CONNECT — PUBLISH PROFILE
========================================================= */

$("seniorForm")?.addEventListener("submit", event => {
  event.preventDefault();

  const user = currentUser();

  if (!user) return;

  const topic = safeValue("seniorTopic").trim();
  const course = safeValue("seniorCourse").trim();
  const bio = safeValue("seniorBio").trim();

  if (!topic || !course || !bio) {
    return toast("Complete all Senior Connect fields.");
  }

  const list = read(DB.seniors).filter(item =>
    String(item.userId) !== String(user.id)
  );

  list.unshift({
    id: uid(),

    userId: user.id,

    name: user.name,
    email: user.email,
    college: user.college,

    topic,
    course,
    bio,

    createdAt: new Date().toISOString()
  });

  write(DB.seniors, list);

  event.target.reset();

  renderSeniors();

  toast("Your connect card is published.");
});


/* =========================================================
   27. RENDER SENIOR CONNECT
========================================================= */

function renderSeniors() {
  const user = currentUser();

  if (!user) return;

  const list = read(DB.seniors);

  $("seniorList").innerHTML = list.length
    ? list.map(item => `
        <article class="data-card glass">

          <span class="badge">STUDENT CONNECT</span>

          <h3>${esc(item.name)}</h3>

          <p>
            ${esc(item.course)} · ${esc(item.college)}
          </p>

          <p>
            <strong>Can help with:</strong>
            ${esc(item.topic)}
          </p>

          <p>${esc(item.bio)}</p>

          <div class="card-actions">

            <a class="btn secondary"
              href="mailto:${encodeURIComponent(item.email || "")}">
              Contact by email
            </a>

            ${
              String(item.userId) === String(user.id)
                ? `
                  <button class="btn danger"
                    onclick="deleteSenior('${item.id}')">
                    Remove
                  </button>
                `
                : ""
            }

          </div>
        </article>
      `).join("")
    : `<div class="empty-state">No connect cards yet.</div>`;
}


/* =========================================================
   28. DELETE SENIOR CONNECT CARD
========================================================= */

function deleteSenior(id) {
  const user = currentUser();

  if (!user) return;

  const list = read(DB.seniors);

  const item = list.find(entry =>
    String(entry.id) === String(id)
  );

  if (!item || String(item.userId) !== String(user.id)) {
    return toast("You cannot remove this card.");
  }

  write(
    DB.seniors,
    list.filter(entry => String(entry.id) !== String(id))
  );

  renderSeniors();

  toast("Connect card removed.");
}


/* =========================================================
   29. PROFILE — DISPLAY USER DETAILS
========================================================= */

function renderProfile() {
  const user = currentUser();

  if (!user) return;

  const fields = {
    profileName: user.name,
    profileEmail: user.email,
    profilePhone: user.phone,
    profileCollege: user.college,
    profileEnrollment: user.enrollment,
    profileCourse: user.course,
    profileSemester: user.semester,
    profileDepartment: user.department,
    profileFacultyId: user.facultyId
  };

  Object.entries(fields).forEach(([id, value]) => {
    if ($(id)) {
      $(id).value = value || "";
    }
  });

  $("profileStudentFields")?.classList.toggle(
    "hidden",
    user.role !== "student"
  );

  $("profileFacultyFields")?.classList.toggle(
    "hidden",
    user.role !== "faculty"
  );

  setText("idName", user.name);

  setText(
    "idRole",
    (user.role || "student").toUpperCase()
  );

  const photo = $("idPhoto");

  if (photo) {
    photo.innerHTML = user.photo
      ? `<img src="${user.photo}" alt="Profile">`
      : esc((user.name || "U").charAt(0).toUpperCase());
  }

  if (user.role === "student") {
    $("idDetails").innerHTML = `
      <div>
        <span>Enrollment</span>
        <strong>${esc(user.enrollment || "-")}</strong>
      </div>

      <div>
        <span>Course</span>
        <strong>${esc(user.course || "-")}</strong>
      </div>

      <div>
        <span>Semester</span>
        <strong>${esc(user.semester || "-")}</strong>
      </div>

      <div>
        <span>College</span>
        <strong>${esc(user.college || "-")}</strong>
      </div>
    `;
  } else {
    $("idDetails").innerHTML = `
      <div>
        <span>Faculty ID</span>
        <strong>${esc(user.facultyId || "-")}</strong>
      </div>

      <div>
        <span>Department</span>
        <strong>${esc(user.department || "-")}</strong>
      </div>

      <div>
        <span>College</span>
        <strong>${esc(user.college || "-")}</strong>
      </div>
    `;
  }
}


/* =========================================================
   30. PROFILE PHOTO
========================================================= */

$("profilePhoto")?.addEventListener("change", event => {
  const file = event.target.files[0];

  if (!file) return;

  if (file.size > 1024 * 1024) {
    event.target.value = "";

    return toast("Choose an image under 1 MB.");
  }

  if (!file.type.startsWith("image/")) {
    event.target.value = "";

    return toast("Choose a valid image.");
  }

  const reader = new FileReader();

  reader.onload = () => {
    const user = currentUser();

    if (!user) return;

    user.photo = reader.result;

    updateUserInStorage(user);

    renderProfile();

    const avatar = $("sideAvatar");

    if (avatar) {
      avatar.innerHTML = `
        <img src="${reader.result}" alt="Profile">
      `;
    }

    toast("Profile photo updated.");
  };

  reader.readAsDataURL(file);
});


/* =========================================================
   31. PROFILE SAVE — BACKEND CONNECTED

   This fixes the previous login-screen redirect bug.

   The backend returns a successful response first.
   Then we update the cached user.
   We do NOT call openApp() here.
========================================================= */

$("profileForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const user = currentUser();

  if (!user) {
    showLoginScreen();

    return;
  }

  const profileData = {
    name: safeValue("profileName").trim(),
    phone: safeValue("profilePhone").trim(),
    college: safeValue("profileCollege").trim(),

    enrollment: safeValue("profileEnrollment").trim(),
    course: safeValue("profileCourse").trim(),
    semester: safeValue("profileSemester").trim(),

    department: safeValue("profileDepartment").trim(),
    facultyId: safeValue("profileFacultyId").trim()
  };

  if (!profileData.name) {
    return toast("Name cannot be empty.");
  }

  // Local preview accounts do not exist in the backend yet.
  if (user.authSource !== "backend") {
    const updatedUser = {
      ...user,
      ...profileData
    };

    updateUserInStorage(updatedUser);

    refreshProfileAfterSave(updatedUser);

    toast("Profile updated in this browser.");

    return;
  }

  try {
    const response = await fetch(
      `/api/profile/${encodeURIComponent(user.id)}`,
      {
        method: "PUT",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify(profileData)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return toast(
        data.error || "Profile update failed."
      );
    }

    const updatedUser = {
      ...user,
      ...profileData
    };

    updateUserInStorage(updatedUser);

    refreshProfileAfterSave(updatedUser);

    toast("Profile updated successfully!");

  } catch (error) {
    console.error("Profile update error:", error);

    toast("Could not save profile. Check Python backend.");
  }
});


/* =========================================================
   32. REFRESH PROFILE WITHOUT LOGGING OUT
========================================================= */

function refreshProfileAfterSave(user) {
  // Update profile card and form.
  renderProfile();

  // Update sidebar name.
  setText("sideName", user.name);

  // Update dashboard welcome name.
  setText(
    "welcomeName",
    (user.name || "User").split(" ")[0]
  );

  // Update current page title if needed.
  setText(
    "roleBadge",
    (user.role || "student").toUpperCase()
  );

  // Keep the current page open.
  // Do not call openApp() here.
}


/* =========================================================
   33. DAILY CHALLENGE QUESTIONS
========================================================= */

const sampleQuestions = [
  {
    q: "Which data structure follows FIFO?",
    options: ["Stack", "Queue", "Tree", "Graph"],
    correct: 1,
    explanation: "Queue follows First In, First Out."
  },
  {
    q: "Which language is commonly used for web page structure?",
    options: ["HTML", "SQL", "C", "Python"],
    correct: 0,
    explanation: "HTML defines the structure of web pages."
  },
  {
    q: "What does CPU stand for?",
    options: [
      "Central Program Unit",
      "Central Processing Unit",
      "Computer Personal Unit",
      "Control Processing Utility"
    ],
    correct: 1,
    explanation: "CPU means Central Processing Unit."
  },
  {
    q: "Which number is binary for decimal 2?",
    options: ["01", "10", "11", "100"],
    correct: 1,
    explanation: "Binary 10 represents decimal 2."
  },
  {
    q: "Which one is a relational database?",
    options: ["MySQL", "HTML", "CSS", "Git"],
    correct: 0,
    explanation: "MySQL is a relational database management system."
  }
];


/* =========================================================
   34. START DAILY CHALLENGE
========================================================= */

$("startDailyChallenge")?.addEventListener("click", () => {
  const user = currentUser();

  if (!user) return;

  const today = new Date()
    .toISOString()
    .slice(0, 10);

  const alreadyCompleted = read(DB.attempts).some(attempt =>
    String(attempt.userId) === String(user.id) &&
    attempt.date === today &&
    attempt.type === "daily"
  );

  if (alreadyCompleted) {
    return toast("You have already completed today's challenge.");
  }

  startQuiz(
    "Daily Challenge",
    sampleQuestions,
    "daily"
  );
});


/* =========================================================
   35. FACULTY — CREATE QUIZ
========================================================= */

$("facultyQuizForm")?.addEventListener("submit", event => {
  event.preventDefault();

  const user = currentUser();

  if (!user || user.role !== "faculty") {
    return toast("Faculty access only.");
  }

  const classId = safeValue("quizClass");

  if (!classId) {
    return toast("Create a class first.");
  }

  const deadlineValue = safeValue("quizDeadline");

  if (!deadlineValue) {
    return toast("Select a quiz deadline.");
  }

  const deadline = new Date(deadlineValue);

  if (Number.isNaN(deadline.getTime())) {
    return toast("Invalid quiz deadline.");
  }

  const quizzes = read(DB.quizzes);

  quizzes.unshift({
    id: uid(),

    facultyId: user.id,
    classId,

    title: safeValue("quizTitle").trim(),

    question: {
      q: safeValue("quizQuestion").trim(),

      options: [
        safeValue("quizA").trim(),
        safeValue("quizB").trim(),
        safeValue("quizC").trim(),
        safeValue("quizD").trim()
      ],

      correct: Number(safeValue("quizCorrect")),

      explanation: safeValue("quizExplanation").trim()
    },

    deadline: deadline.toISOString(),

    createdAt: new Date().toISOString()
  });

  write(DB.quizzes, quizzes);

  event.target.reset();

  renderDailyHub();

  toast("Faculty quiz published.");
});


/* =========================================================
   36. RENDER DAILY HUB
========================================================= */

function renderDailyHub() {
  const user = currentUser();

  if (!user) return;

  const attempts = read(DB.attempts).filter(attempt =>
    String(attempt.userId) === String(user.id)
  );

  setText("challengeCount", attempts.length);

  setText(
    "totalPoints",
    attempts.reduce(
      (total, attempt) => total + Number(attempt.score || 0),
      0
    )
  );

  setText(
    "streakCount",
    calculateStreak(attempts) + " days"
  );

  const today = new Date()
    .toISOString()
    .slice(0, 10);

  const completedToday = attempts.some(attempt =>
    attempt.type === "daily" &&
    attempt.date === today
  );

  setText(
    "dailyChallengeStatus",
    completedToday
      ? "Today's challenge completed. Come back tomorrow!"
      : "Your daily challenge is ready."
  );


  const quizzes = read(DB.quizzes).filter(quiz =>
    myClasses().some(classItem =>
      String(classItem.id) === String(quiz.classId)
    ) &&
    !isExpired(quiz.deadline)
  );

  $("facultyQuizList").innerHTML = quizzes.length
    ? quizzes.map(quiz => {
        const completed = attempts.some(attempt =>
          String(attempt.quizId) === String(quiz.id)
        );

        return `
          <div class="list-item">

            <div>
              <strong>${esc(quiz.title)}</strong>
              <small>Due ${dateText(quiz.deadline)}</small>
            </div>

            ${
              completed
                ? `<span class="badge success">Completed</span>`
                : `
                  <button class="btn primary"
                    onclick="startFacultyQuiz('${quiz.id}')">
                    Take quiz
                  </button>
                `
            }

          </div>
        `;
      }).join("")
    : `
      <div class="empty-state">
        No faculty quizzes available for your classes.
      </div>
    `;

  renderLeaderboard();
}


/* =========================================================
   37. CALCULATE LEARNING STREAK
========================================================= */

function calculateStreak(attempts) {
  const days = [
    ...new Set(attempts.map(attempt => attempt.date))
  ].sort().reverse();

  if (!days.length) return 0;

  let streak = 0;

  const date = new Date();

  date.setHours(0, 0, 0, 0);

  const today = date.toISOString().slice(0, 10);

  if (days[0] !== today) {
    date.setDate(date.getDate() - 1);
  }

  for (const day of days) {
    const expected = date.toISOString().slice(0, 10);

    if (day !== expected) break;

    streak++;

    date.setDate(date.getDate() - 1);
  }

  return streak;
}


/* =========================================================
   38. START FACULTY QUIZ
========================================================= */

function startFacultyQuiz(id) {
  const quiz = read(DB.quizzes).find(item =>
    String(item.id) === String(id)
  );

  if (!quiz || isExpired(quiz.deadline)) {
    return toast("This quiz is closed.");
  }

  const user = currentUser();

  if (!user) return;

  const alreadyAttempted = read(DB.attempts).some(attempt =>
    String(attempt.userId) === String(user.id) &&
    String(attempt.quizId) === String(id)
  );

  if (alreadyAttempted) {
    return toast("You have already attempted this quiz.");
  }

  startQuiz(
    quiz.title,
    [quiz.question],
    "faculty",
    id
  );
}


/* =========================================================
   39. START QUIZ SESSION
========================================================= */

function startQuiz(title, questions, type, quizId = null) {
  if (!questions || !questions.length) {
    return toast("No questions available.");
  }

  quizSession = {
    title,
    questions,
    type,
    quizId
  };

  selectedAnswers = {};

  setText("quizModalTitle", title);

  $("quizBackdrop").classList.remove("hidden");

  renderQuizQuestion(0);
}


/* =========================================================
   40. DISPLAY QUIZ QUESTION
========================================================= */

function renderQuizQuestion(index) {
  if (!quizSession) return;

  const question = quizSession.questions[index];

  if (!question) return;

  $("quizModalBody").innerHTML = `
    <p class="muted small">
      Question ${index + 1} of ${quizSession.questions.length}
    </p>

    <div class="modal-question">
      <strong>${esc(question.q)}</strong>
    </div>

    <div>
      ${question.options.map((option, optionIndex) => `
        <button
          class="answer-option ${
            selectedAnswers[index] === optionIndex
              ? "selected"
              : ""
          }"
          data-answer="${optionIndex}"
        >
          ${String.fromCharCode(65 + optionIndex)}.
          ${esc(option)}
        </button>
      `).join("")}
    </div>

    <div class="panel-head" style="margin-top:18px">

      <span class="muted small">
        ${Object.keys(selectedAnswers).length} answered
      </span>

      <button id="nextQuestion" class="btn primary">
        ${
          index === quizSession.questions.length - 1
            ? "Finish quiz"
            : "Next →"
        }
      </button>

    </div>
  `;


  $("quizModalBody")
    .querySelectorAll("[data-answer]")
    .forEach(button => {
      button.addEventListener("click", () => {
        selectedAnswers[index] = Number(button.dataset.answer);

        renderQuizQuestion(index);
      });
    });


  $("nextQuestion").addEventListener("click", () => {
    if (selectedAnswers[index] === undefined) {
      return toast("Select an answer first.");
    }

    if (index < quizSession.questions.length - 1) {
      renderQuizQuestion(index + 1);
    } else {
      finishQuiz();
    }
  });
}


/* =========================================================
   41. FINISH QUIZ
========================================================= */

function finishQuiz() {
  const user = currentUser();

  if (!user || !quizSession) return;

  const questions = quizSession.questions;

  let correct = 0;

  questions.forEach((question, index) => {
    if (selectedAnswers[index] === question.correct) {
      correct++;
    }
  });

  const score = Math.round(
    (correct / questions.length) * 50
  );

  const attempts = read(DB.attempts);

  attempts.push({
    id: uid(),

    userId: user.id,
    name: user.name,
    role: user.role,

    branch: user.course || "Not specified",
    semester: user.semester || "-",
    college: user.college || "",

    score,
    correct,
    total: questions.length,

    type: quizSession.type,
    quizId: quizSession.quizId,

    date: new Date().toISOString().slice(0, 10),

    createdAt: new Date().toISOString()
  });

  write(DB.attempts, attempts);


  $("quizModalBody").innerHTML = `
    <div class="empty-state">

      <h2>${score} / 50 points</h2>

      <p>
        You answered ${correct}
        out of ${questions.length} correctly.
      </p>

    </div>

    ${questions.map((question, index) => `
      <div class="modal-question">

        <strong>${esc(question.q)}</strong>

        <p class="${
          selectedAnswers[index] === question.correct
            ? "muted"
            : "badge danger"
        }">
          Your answer:
          ${esc(question.options[selectedAnswers[index]])}
        </p>

        <p class="badge success">
          Correct:
          ${esc(question.options[question.correct])}
        </p>

        <p class="muted small">
          ${esc(question.explanation || "")}
        </p>

      </div>
    `).join("")}

    <button class="btn primary full" id="finishQuizButton">
      Done
    </button>
  `;


  $("finishQuizButton").addEventListener(
    "click",
    closeQuiz
  );

  renderAll();
}


/* =========================================================
   42. CLOSE QUIZ
========================================================= */

function closeQuiz() {
  $("quizBackdrop")?.classList.add("hidden");

  quizSession = null;

  selectedAnswers = {};
}

$("quizClose")?.addEventListener("click", closeQuiz);

$("quizBackdrop")?.addEventListener("click", event => {
  if (event.target === $("quizBackdrop")) {
    closeQuiz();
  }
});


/* =========================================================
   43. LEADERBOARD
========================================================= */

$("leaderboardPeriod")?.addEventListener(
  "change",
  renderLeaderboard
);


function renderLeaderboard() {
  const user = currentUser();

  if (!user) return;

  const period = safeValue("leaderboardPeriod") || "weekly";

  const now = new Date();

  const attempts = read(DB.attempts).filter(attempt => {
    if (period === "all") return true;

    const date = new Date(attempt.createdAt);

    const age = (now - date) / 86400000;

    return period === "weekly"
      ? age <= 7
      : age <= 31;
  });

  const branch = (user.course || "").toLowerCase();

  const semester = String(user.semester || "");

  const classmates = attempts.filter(attempt =>
    (attempt.branch || "").toLowerCase() === branch &&
    String(attempt.semester || "") === semester
  );

  const totals = {};

  classmates.forEach(attempt => {
    if (!totals[attempt.userId]) {
      totals[attempt.userId] = {
        name: attempt.name,
        score: 0,
        attempts: 0
      };
    }

    totals[attempt.userId].score += attempt.score;

    totals[attempt.userId].attempts++;
  });

  const ranking = Object.entries(totals)
    .map(([id, details]) => ({
      id,
      ...details
    }))
    .sort((a, b) =>
      b.score - a.score ||
      b.attempts - a.attempts
    );

  const myRank = ranking.findIndex(item =>
    String(item.id) === String(user.id)
  ) + 1;

  setText(
    "leaderboardScope",
    `Showing this browser's ${user.course || "unspecified branch"} · Semester ${semester || "-"} preview.`
  );

  $("leaderboardList").innerHTML = ranking.length
    ? ranking.map((item, index) => `
        <div class="list-item">

          <div>
            <strong>
              #${index + 1} · ${esc(item.name)}
              ${String(item.id) === String(user.id) ? "(You)" : ""}
            </strong>

            <small>
              ${item.attempts} quiz attempts
            </small>
          </div>

          <strong>${item.score} pts</strong>

        </div>
      `).join("") + `
        <p class="muted small">
          Your position:
          ${myRank ? "#" + myRank : "Not ranked yet"}
        </p>
      `
    : `
      <div class="empty-state">
        No scores yet. Complete a challenge to appear here.
      </div>
    `;
}


/* =========================================================
   44. GENERAL MODAL
========================================================= */

function showModal(title, html) {
  setText("modalTitle", title);

  $("modalBody").innerHTML = html;

  $("modalBackdrop").classList.remove("hidden");
}

$("modalClose")?.addEventListener("click", () => {
  $("modalBackdrop").classList.add("hidden");
});

$("modalBackdrop")?.addEventListener("click", event => {
  if (event.target === $("modalBackdrop")) {
    $("modalBackdrop").classList.add("hidden");
  }
});


/* =========================================================
   45. INITIAL STARTUP
========================================================= */

(function initializeApp() {
  const user = currentUser();

  if (user) {
    openApp();
  } else {
    showLoginScreen();
  }

  showAuth("login");
})();