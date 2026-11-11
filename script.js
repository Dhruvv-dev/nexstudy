
/* =========================================================
   NEXSTUDY — COMPLETE JAVASCRIPT
   Forest Green + Sand Beige Edition
   Frontend: HTML + CSS + JavaScript
   Backend: Python Flask + SQLite
========================================================= */

"use strict";

/* =========================================================
   1. CONFIGURATION
========================================================= */

const API = {
  register: "/api/register",
  login: "/api/login",
  logout: "/api/logout",
  me: "/api/me",
  profile: "/api/profile",
  classes: "/api/classes",
  assignments: "/api/assignments"
};

const STORAGE = {
  user: "nexstudy_user",
  photo: "nexstudy_photo",
  posts: "nexstudy_posts",
  seniors: "nexstudy_seniors",
  quizzes: "nexstudy_quizzes",
  attempts: "nexstudy_attempts",
  challenges: "nexstudy_challenges"
};

const $ = id => document.getElementById(id);

let currentUser = null;
let currentQuiz = null;
let currentQuestion = 0;
let quizAnswers = [];
let selectedRole = "student";
let classesCache = [];
let assignmentsCache = [];
let toastTimer = null;


/* =========================================================
   2. COMMON HELPERS
========================================================= */

function getData(key, fallback = []) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function saveData(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function value(id) {
  return $(id)?.value?.trim() ?? "";
}

function setText(id, text) {
  if ($(id)) $(id).textContent = text ?? "";
}

function showToast(message) {
  const el = $("toast");

  if (!el) {
    console.log(message);
    return;
  }

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 2800);
}

function formatDate(date) {
  if (!date) return "Not specified";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) return "Invalid date";

  return parsed.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function expired(date) {
  return !date || new Date(date).getTime() <= Date.now();
}

function initials(name) {
  return String(name || "User")
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || "Something went wrong.");
  }

  return data;
}

function jsonOptions(method, body) {
  return {
    method,
    body: JSON.stringify(body)
  };
}

function setLoading(button, loading, originalText = "") {
  if (!button) return;

  button.disabled = loading;

  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = "Please wait...";
  } else {
    button.textContent =
      button.dataset.originalText || originalText;
  }
}


/* =========================================================
   3. AUTH SCREEN
========================================================= */

function showAuth(view = "login") {
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

/* HERO BUTTONS — SCROLL TO GLASS LOGIN */
document.querySelectorAll("[data-auth-scroll]").forEach(button => {
  button.addEventListener("click", () => {
    const view = button.dataset.authScroll;

    showAuth(view);

    document.getElementById("authCard")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
});



/* =========================================================
   4. STUDENT / FACULTY ROLE
========================================================= */

function selectRole(role) {
  selectedRole = role;

  document.querySelectorAll("[data-role]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.role === role
    );
  });

  $("studentFields")?.classList.toggle(
    "hidden",
    role !== "student"
  );

  $("facultyFields")?.classList.toggle(
    "hidden",
    role !== "faculty"
  );
}

document.querySelectorAll("[data-role]").forEach(button => {
  button.addEventListener("click", () => {
    selectRole(button.dataset.role);
  });
});


/* =========================================================
   5. REGISTRATION — FLASK BACKEND
========================================================= */

async function registerAccount(event) {
  event.preventDefault();

  const button = event.submitter;

  const password = value("regPassword");
  const confirm = value("regConfirm");

  if (password.length < 8) {
    showToast("Password must have at least 8 characters.");
    return;
  }

  if (password !== confirm) {
    showToast("Passwords do not match.");
    return;
  }

  const data = {
    role: selectedRole,
    name: value("regName"),
    email: value("regEmail").toLowerCase(),
    password,
    phone: value("regPhone"),
    college: value("regCollege"),
    enrollment: value("regEnrollment"),
    course: value("regCourse"),
    semester: value("regSemester"),
    department: value("regDepartment"),
    facultyId: value("regFacultyId")
  };

  if (!data.name || !data.email || !data.college) {
    showToast("Please complete all required fields.");
    return;
  }

  setLoading(button, true);

  try {
    await api(API.register, jsonOptions("POST", data));

    const login = await api(
      API.login,
      jsonOptions("POST", {
        email: data.email,
        password
      })
    );

    currentUser = login.user;

    saveData(STORAGE.user, currentUser);

    $("registerForm").reset();

    selectRole("student");

    await enterApplication();

    showToast("Welcome to NEXSTUDY!");

  } catch (error) {
    showToast(error.message);
  } finally {
    setLoading(button, false);
  }
}

$("registerForm")?.addEventListener(
  "submit",
  registerAccount
);


/* =========================================================
   6. LOGIN — FLASK BACKEND
========================================================= */

async function loginAccount(event) {
  event.preventDefault();

  const button = event.submitter;

  const email = value("loginEmail").toLowerCase();
  const password = value("loginPassword");

  if (!email || !password) {
    showToast("Enter your email and password.");
    return;
  }

  setLoading(button, true);

  try {
    const result = await api(
      API.login,
      jsonOptions("POST", { email, password })
    );

    currentUser = result.user;

    saveData(STORAGE.user, currentUser);

    $("loginForm").reset();

    await enterApplication();

    showToast("Login successful!");

  } catch (error) {
    showToast(error.message);
  } finally {
    setLoading(button, false);
  }
}

$("loginForm")?.addEventListener(
  "submit",
  loginAccount
);


/* =========================================================
   7. RESTORE LOGIN SESSION
========================================================= */

async function restoreSession() {
  try {
    const result = await api(API.me);

    currentUser = result.user;

    saveData(STORAGE.user, currentUser);

    await enterApplication();

  } catch {
    currentUser = null;

    $("authScreen")?.classList.remove("hidden");
    $("appShell")?.classList.add("hidden");

    showAuth("login");
  }
}


/* =========================================================
   8. ENTER APPLICATION
========================================================= */

async function enterApplication() {
  if (!currentUser) return;

  $("authScreen")?.classList.add("hidden");
  $("appShell")?.classList.remove("hidden");

  updateUserInterface();

  await loadClasses();
  await loadAssignments();

  renderAll();

  showPage("dashboard");
}

function updateUserInterface() {
  if (!currentUser) return;

  const user = currentUser;

  setText("sideName", user.name);
  setText("sideRole", user.role);
  setText("welcomeName", user.name.split(" ")[0]);
  setText("roleBadge", user.role.toUpperCase());

  const photo = localStorage.getItem(
    STORAGE.photo + "_" + user.id
  );

  const avatar = $("sideAvatar");

  if (avatar) {
    avatar.innerHTML = photo
      ? `<img src="${photo}" alt="Profile">`
      : escapeHTML(initials(user.name));
  }

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
}


/* =========================================================
   9. LOGOUT
========================================================= */

async function logout() {
  try {
    await api(API.logout, { method: "POST" });
  } catch (error) {
    console.error(error);
  }

  currentUser = null;

  $("appShell")?.classList.add("hidden");
  $("authScreen")?.classList.remove("hidden");

  showAuth("login");

  showToast("You have signed out.");
}

$("logoutBtn")?.addEventListener("click", logout);


/* =========================================================
   10. PAGE NAVIGATION
========================================================= */

const PAGE_TITLES = {
  dashboard: "Dashboard",
  dailyhub: "Daily Hub",
  assignments: "Assignments",
  classes: "My Classes",
  community: "Class Community",
  seniors: "Senior Connect",
  profile: "My Profile"
};

function showPage(page) {
  const target = $("page-" + page);

  if (!target) return;

  document.querySelectorAll(".page").forEach(section => {
    section.classList.toggle(
      "active",
      section === target
    );
  });

  document.querySelectorAll(".nav-link[data-page]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });

  setText("pageTitle", PAGE_TITLES[page] || "NEXSTUDY");

  $("sidebar")?.classList.remove("open");

  renderPage(page);
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

$("menuToggle")?.addEventListener("click", () => {
  $("sidebar")?.classList.toggle("open");
});


/* =========================================================
   11. PAGE RENDERING
========================================================= */

function renderPage(page) {
  const functions = {
    dashboard: renderDashboard,
    dailyhub: renderDailyHub,
    assignments: renderAssignments,
    classes: renderClasses,
    community: renderCommunity,
    seniors: renderSeniors,
    profile: renderProfile
  };

  functions[page]?.();
}

function renderAll() {
  if (!currentUser) return;

  Object.values({
    dashboard: renderDashboard,
    dailyhub: renderDailyHub,
    assignments: renderAssignments,
    classes: renderClasses,
    community: renderCommunity,
    seniors: renderSeniors,
    profile: renderProfile
  }).forEach(fn => fn());
}


/* =========================================================
   12. CLASSES — BACKEND
========================================================= */

async function loadClasses() {
  try {
    const result = await api(API.classes);

    classesCache = result.classes || [];

    populateClassSelects();

  } catch (error) {
    classesCache = [];
    console.error("Classes:", error);
  }
}

function populateClassSelects() {
  [
    "assignmentClass",
    "quizClass",
    "rosterClass",
    "postClass"
  ].forEach(id => {
    const select = $(id);

    if (!select) return;

    const previous = select.value;

    select.innerHTML = classesCache.map(item => `
      <option value="${escapeHTML(item.id)}">
        ${escapeHTML(item.name)}
      </option>
    `).join("") || `
      <option value="">No classes available</option>
    `;

    if (classesCache.some(item => item.id === previous)) {
      select.value = previous;
    }
  });
}


/* =========================================================
   13. CREATE CLASS — FACULTY
========================================================= */

$("classForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (currentUser?.role !== "faculty") {
    return showToast("Only faculty can create classes.");
  }

  const button = event.submitter;

  const data = {
    name: value("className"),
    course: value("classCourse"),
    semester: value("classSemester"),
    section: value("classSection"),
    description: value("classDescription")
  };

  if (!data.name || !data.course) {
    return showToast("Enter class name and course.");
  }

  setLoading(button, true);

  try {
    await api(
      API.classes,
      jsonOptions("POST", data)
    );

    event.target.reset();

    await loadClasses();

    renderAll();

    showToast("Class created successfully!");

  } catch (error) {
    showToast(error.message);
  } finally {
    setLoading(button, false);
  }
});


/* =========================================================
   14. RENDER CLASSES
========================================================= */

function renderClasses() {
  const container = $("classList");

  if (!container) return;

  container.innerHTML = classesCache.length
    ? classesCache.map(item => `
        <article class="panel glass">
          <p class="eyebrow">LEARNING SPACE</p>
          <h3>${escapeHTML(item.name)}</h3>
          <p>${escapeHTML(item.course || "")}</p>
          <p class="muted">
            Semester: ${escapeHTML(item.semester || "-")}
            · Section: ${escapeHTML(item.section || "-")}
          </p>
          <p class="muted">
            ${escapeHTML(item.description || "")}
          </p>
        </article>
      `).join("")
    : `
      <div class="empty-state">
        No classes available yet.
      </div>
    `;
}


/* =========================================================
   15. ASSIGNMENTS — BACKEND
========================================================= */

async function loadAssignments() {
  try {
    const result = await api(API.assignments);

    assignmentsCache = result.assignments || [];

  } catch (error) {
    assignmentsCache = [];
    console.error("Assignments:", error);
  }
}


/* =========================================================
   16. CREATE ASSIGNMENT — FACULTY
========================================================= */

$("assignmentForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (currentUser?.role !== "faculty") {
    return showToast("Faculty access required.");
  }

  const button = event.submitter;

  const data = {
    title: value("assignmentTitle"),
    classId: value("assignmentClass"),
    subject: value("assignmentSubject"),
    deadline: value("assignmentDeadline"),
    description: value("assignmentDescription")
  };

  if (!data.title || !data.classId || !data.deadline) {
    return showToast("Complete all required fields.");
  }

  if (expired(data.deadline)) {
    return showToast("Deadline must be in the future.");
  }

  setLoading(button, true);

  try {
    await api(
      API.assignments,
      jsonOptions("POST", data)
    );

    event.target.reset();

    await loadAssignments();

    renderAll();

    showToast("Assignment published!");

  } catch (error) {
    showToast(error.message);
  } finally {
    setLoading(button, false);
  }
});


/* =========================================================
   17. RENDER ASSIGNMENTS
========================================================= */

function renderAssignments() {
  const container = $("assignmentList");

  if (!container) return;

  const search = value("assignmentSearch").toLowerCase();
  const filter = $("assignmentFilter")?.value || "all";

  let items = assignmentsCache.filter(item => {
    const matchesSearch =
      `${item.title} ${item.subject} ${item.class_name}`
        .toLowerCase()
        .includes(search);

    if (!matchesSearch) return false;

    const isExpired = expired(item.deadline);
    const submitted = Boolean(item.mySubmission);

    if (filter === "expired" && !isExpired) return false;
    if (filter === "submitted" && !submitted) return false;
    if (filter === "pending" && (submitted || isExpired)) return false;

    return true;
  });

  container.innerHTML = items.length
    ? items.map(item => {
        const isExpired = expired(item.deadline);
        const submitted = Boolean(item.mySubmission);

        return `
          <article class="panel glass">
            <p class="eyebrow">
              ${escapeHTML(item.subject || "Assignment")}
            </p>

            <h3>${escapeHTML(item.title)}</h3>

            <p class="muted">
              ${escapeHTML(item.description || "")}
            </p>

            <p class="muted">
              Class: ${escapeHTML(item.class_name || "")}
            </p>

            <p class="muted">
              Deadline: ${formatDate(item.deadline)}
            </p>

            <span class="pill">
              ${
                isExpired ? "Closed"
                : submitted ? "Submitted"
                : "Pending"
              }
            </span>

            ${
              currentUser.role === "student" &&
              !submitted &&
              !isExpired
                ? `
                  <button class="btn primary"
                    data-submit="${escapeHTML(item.id)}">
                    Submit work
                  </button>
                `
                : ""
            }

            ${
              submitted
                ? `<p class="muted small">
                    File: ${escapeHTML(item.mySubmission.file_name)}
                   </p>`
                : ""
            }

            ${
              currentUser.role === "faculty"
                ? `
                  <button class="btn secondary"
                    data-submissions="${escapeHTML(item.id)}">
                    View submissions
                  </button>
                `
                : ""
            }
          </article>
        `;
      }).join("")
    : `
      <div class="empty-state">
        No assignments found.
      </div>
    `;

  container.querySelectorAll("[data-submit]").forEach(button => {
    button.addEventListener("click", () => {
      uploadAssignment(button.dataset.submit);
    });
  });

  container.querySelectorAll("[data-submissions]").forEach(button => {
    button.addEventListener("click", () => {
      loadSubmissions(button.dataset.submissions);
    });
  });
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
   18. UPLOAD ASSIGNMENT — FLASK
========================================================= */

async function uploadAssignment(id) {
  const file = document.createElement("input");

  file.type = "file";

  file.accept =
    ".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.zip";

  file.onchange = async () => {
    const selected = file.files?.[0];

    if (!selected) return;

    const form = new FormData();

    form.append("file", selected);

    try {
      await api(
        `${API.assignments}/${encodeURIComponent(id)}/submit`,
        {
          method: "POST",
          body: form
        }
      );

      await loadAssignments();

      renderAll();

      showToast("Assignment submitted successfully!");

    } catch (error) {
      showToast(error.message);
    }
  };

  file.click();
}


/* =========================================================
   19. FACULTY SUBMISSION TRACKING
========================================================= */

async function loadSubmissions(id) {
  try {
    const result = await api(
      `${API.assignments}/${encodeURIComponent(id)}/submissions`
    );

    const submitted = result.submitted || [];
    const pending = result.pending || [];

    openModal(
      "Assignment Submissions",
      `
        <h3>Submitted (${submitted.length})</h3>

        ${
          submitted.map(student => `
            <div class="list-item">
              <div>
                <strong>${escapeHTML(student.name)}</strong>
                <small>${escapeHTML(student.enrollment || "")}</small>
                <small>${escapeHTML(student.file_name)}</small>
              </div>
            </div>
          `).join("") || "<p>No submissions yet.</p>"
        }

        <hr>

        <h3>Pending (${pending.length})</h3>

        ${
          pending.map(student => `
            <div class="list-item">
              <strong>${escapeHTML(student.name)}</strong>
              <small>${escapeHTML(student.enrollment || "")}</small>
            </div>
          `).join("") || "<p>No pending students.</p>"
        }
      `
    );

  } catch (error) {
    showToast(error.message);
  }
}


/* =========================================================
   20. DASHBOARD
========================================================= */

function renderDashboard() {
  if (!currentUser) return;

  const total = assignmentsCache.length;

  const submitted = assignmentsCache.filter(
    item => item.mySubmission
  ).length;

  const pending = assignmentsCache.filter(
    item => !item.mySubmission && !expired(item.deadline)
  ).length;

  const stats = currentUser.role === "faculty"
    ? [
        ["My classes", classesCache.length],
        ["Assignments", total],
        ["Submissions", assignmentsCache.reduce(
          (sum, item) => sum + (item.submission_count || 0), 0
        )]
      ]
    : [
        ["My classes", classesCache.length],
        ["Pending tasks", pending],
        ["Submitted", submitted]
      ];

  if ($("dashboardStats")) {
    $("dashboardStats").innerHTML = stats.map(([label, number]) => `
      <article class="stat-card glass">
        <small>${escapeHTML(label)}</small>
        <strong>${number}</strong>
      </article>
    `).join("");
  }

  const upcoming = assignmentsCache
    .filter(item => !expired(item.deadline))
    .sort((a, b) =>
      new Date(a.deadline) - new Date(b.deadline)
    )
    .slice(0, 5);

  if ($("dashboardAssignments")) {
    $("dashboardAssignments").innerHTML = upcoming.length
      ? upcoming.map(item => `
          <div class="list-item">
            <div>
              <strong>${escapeHTML(item.title)}</strong>
              <small>${formatDate(item.deadline)}</small>
            </div>
            <span class="pill">
              ${item.mySubmission ? "Submitted" : "Pending"}
            </span>
          </div>
        `).join("")
      : `<p class="muted">No upcoming assignments.</p>`;
  }

  if ($("dashboardClasses")) {
    $("dashboardClasses").innerHTML = classesCache.length
      ? classesCache.slice(0, 5).map(item => `
          <div class="list-item">
            <strong>${escapeHTML(item.name)}</strong>
            <small>${escapeHTML(item.course || "")}</small>
          </div>
        `).join("")
      : `<p class="muted">No classes yet.</p>`;
  }

  const percentage = total
    ? Math.round(submitted / total * 100)
    : 0;

  if ($("progressOverview")) {
    $("progressOverview").innerHTML = `
      <strong>${percentage}% completed</strong>
      <div class="progress-track">
        <span style="width:${percentage}%"></span>
      </div>
      <p class="muted small">
        ${submitted} of ${total} assignments completed.
      </p>
    `;
  }
}


/* =========================================================
   21. PROFILE — BACKEND
========================================================= */

function renderProfile() {
  if (!currentUser) return;

  const user = currentUser;

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

  Object.entries(fields).forEach(([id, val]) => {
    if ($(id)) $(id).value = val || "";
  });

  setText("idName", user.name);
  setText("idRole", user.role.toUpperCase());

  const photo = localStorage.getItem(
    STORAGE.photo + "_" + user.id
  );

  if ($("idPhoto")) {
    $("idPhoto").innerHTML = photo
      ? `<img src="${photo}" alt="Profile photo">`
      : escapeHTML(initials(user.name));
  }

  if ($("idDetails")) {
    $("idDetails").innerHTML = `
      <p><strong>Email</strong><br>${escapeHTML(user.email)}</p>
      <p><strong>College</strong><br>${escapeHTML(user.college || "-")}</p>
      ${
        user.role === "student"
          ? `
            <p><strong>Enrollment</strong><br>
              ${escapeHTML(user.enrollment || "-")}
            </p>
            <p><strong>Course</strong><br>
              ${escapeHTML(user.course || "-")}
            </p>
          `
          : `
            <p><strong>Department</strong><br>
              ${escapeHTML(user.department || "-")}
            </p>
            <p><strong>Faculty ID</strong><br>
              ${escapeHTML(user.facultyId || "-")}
            </p>
          `
      }
    `;
  }
}

$("profileForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) return;

  const button = event.submitter;

  const data = {
    name: value("profileName"),
    phone: value("profilePhone"),
    college: value("profileCollege"),
    enrollment: value("profileEnrollment"),
    course: value("profileCourse"),
    semester: value("profileSemester"),
    department: value("profileDepartment")
  };

  setLoading(button, true);

  try {
    const result = await api(
      API.profile,
      jsonOptions("PUT", data)
    );

    currentUser = result.user;

    saveData(STORAGE.user, currentUser);

    const photoFile = $("profilePhoto")?.files?.[0];

    if (photoFile) {
      if (photoFile.size > 2 * 1024 * 1024) {
        throw new Error("Profile photo must be below 2 MB.");
      }

      const photoData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(photoFile);
      });

      localStorage.setItem(
        STORAGE.photo + "_" + currentUser.id,
        photoData
      );
    }

    updateUserInterface();
    renderProfile();

    showToast("Profile updated successfully!");

  } catch (error) {
    showToast(error.message);
  } finally {
    setLoading(button, false);
  }
});


/* =========================================================
   22. DAILY HUB — CHALLENGES
========================================================= */

const DAILY_QUESTIONS = [
  {
    question: "Which language is mainly used for web page structure?",
    options: ["CSS", "HTML", "Python", "SQL"],
    answer: 1
  },
  {
    question: "What does CPU stand for?",
    options: [
      "Central Processing Unit",
      "Computer Personal Unit",
      "Central Program Utility",
      "Control Processing User"
    ],
    answer: 0
  },
  {
    question: "Which data structure follows FIFO?",
    options: ["Stack", "Tree", "Queue", "Graph"],
    answer: 2
  },
  {
    question: "Which language is commonly used for Flask?",
    options: ["Java", "Python", "C", "Swift"],
    answer: 1
  },
  {
    question: "Which symbol starts a Python comment?",
    options: ["//", "#", "/*", "<!--"],
    answer: 1
  }
];

function renderDailyHub() {
  const challenges = getData(STORAGE.challenges, []);

  setText("challengeCount", challenges.length);

  setText(
    "totalPoints",
    challenges.reduce((sum, item) => sum + item.points, 0)
  );

  const last = challenges[challenges.length - 1];

  setText(
    "streakCount",
    last ? "Active" : "0 days"
  );

  if ($("dailyChallengeStatus")) {
    $("dailyChallengeStatus").textContent =
      last
        ? `Last score: ${last.score}/${last.total}`
        : "You have not completed today's challenge.";
  }

  renderFacultyQuizzes();
  renderLeaderboard();
}

$("startDailyChallenge")?.addEventListener("click", () => {
  startQuiz(
    "Daily Challenge",
    DAILY_QUESTIONS,
    false
  );
});


/* =========================================================
   23. QUIZ SYSTEM
========================================================= */

function startQuiz(title, questions, published = false) {
  if (!questions?.length) {
    return showToast("No questions available.");
  }

  currentQuiz = {
    title,
    questions,
    published
  };

  currentQuestion = 0;
  quizAnswers = [];

  $("quizBackdrop")?.classList.remove("hidden");

  renderQuizQuestion();
}

function renderQuizQuestion() {
  if (!currentQuiz) return;

  const question = currentQuiz.questions[currentQuestion];

  setText("quizModalTitle", currentQuiz.title);

  const container = $("quizModalBody");

  if (!container) return;

  container.innerHTML = `
    <p class="muted">
      Question ${currentQuestion + 1}
      of ${currentQuiz.questions.length}
    </p>

    <h3>${escapeHTML(question.question)}</h3>

    <div class="quiz-options">
      ${question.options.map((option, index) => `
        <button class="quiz-option"
          data-answer="${index}">
          ${String.fromCharCode(65 + index)}.
          ${escapeHTML(option)}
        </button>
      `).join("")}
    </div>

    <button class="btn primary full" id="nextQuestion">
      ${currentQuestion === currentQuiz.questions.length - 1
        ? "Finish quiz"
        : "Next question"}
    </button>
  `;

  container.querySelectorAll("[data-answer]").forEach(button => {
    button.addEventListener("click", () => {
      quizAnswers[currentQuestion] =
        Number(button.dataset.answer);

      container.querySelectorAll("[data-answer]").forEach(item => {
        item.classList.toggle("active", item === button);
      });
    });
  });

  $("nextQuestion")?.addEventListener("click", () => {
    if (quizAnswers[currentQuestion] === undefined) {
      return showToast("Select an answer.");
    }

    if (currentQuestion < currentQuiz.questions.length - 1) {
      currentQuestion++;
      renderQuizQuestion();
    } else {
      finishQuiz();
    }
  });
}

function finishQuiz() {
  const correct = currentQuiz.questions.filter(
    (question, index) =>
      Number(question.answer) === quizAnswers[index]
  ).length;

  const score = Math.round(
    correct / currentQuiz.questions.length * 100
  );

  if (!currentQuiz.published) {
    const history = getData(STORAGE.challenges, []);

    history.push({
      date: new Date().toISOString(),
      score: correct,
      total: currentQuiz.questions.length,
      points: correct * 10
    });

    saveData(STORAGE.challenges, history);
  } else {
    const attempts = getData(STORAGE.attempts, []);

    attempts.push({
      title: currentQuiz.title,
      score,
      user: currentUser.id,
      date: new Date().toISOString()
    });

    saveData(STORAGE.attempts, attempts);
  }

  $("quizModalBody").innerHTML = `
    <div class="quiz-result">
      <h2>${score}%</h2>
      <h3>Challenge completed!</h3>
      <p>You got ${correct} out of
        ${currentQuiz.questions.length} correct.
      </p>
      <button class="btn primary full" id="finishQuiz">
        Close
      </button>
    </div>
  `;

  $("finishQuiz")?.addEventListener("click", () => {
    $("quizBackdrop")?.classList.add("hidden");
    currentQuiz = null;
    renderDailyHub();
  });
}

$("quizClose")?.addEventListener("click", () => {
  $("quizBackdrop")?.classList.add("hidden");
  currentQuiz = null;
});


/* =========================================================
   24. FACULTY QUIZ CREATION
========================================================= */

$("facultyQuizForm")?.addEventListener("submit", event => {
  event.preventDefault();

  if (currentUser?.role !== "faculty") {
    return showToast("Faculty access required.");
  }

  const quiz = {
    id: uid(),
    facultyId: currentUser.id,
    classId: value("quizClass"),
    title: value("quizTitle"),
    deadline: value("quizDeadline"),
    explanation: value("quizExplanation"),
    questions: [{
      question: value("quizQuestion"),
      options: [
        value("quizA"),
        value("quizB"),
        value("quizC"),
        value("quizD")
      ],
      answer: Number(value("quizCorrect"))
    }]
  };

  if (!quiz.title || !quiz.classId || !quiz.questions[0].question) {
    return showToast("Complete all quiz details.");
  }

  if (expired(quiz.deadline)) {
    return showToast("Select a future deadline.");
  }

  const quizzes = getData(STORAGE.quizzes, []);

  quizzes.push(quiz);

  saveData(STORAGE.quizzes, quizzes);

  event.target.reset();

  renderDailyHub();

  showToast("Quiz published!");
});


/* =========================================================
   25. FACULTY QUIZ LIST
========================================================= */

function renderFacultyQuizzes() {
  const container = $("facultyQuizList");

  if (!container) return;

  const quizzes = getData(STORAGE.quizzes, []);

  const visible = quizzes.filter(item =>
    currentUser.role === "faculty"
      ? item.facultyId === currentUser.id
      : classesCache.some(c => c.id === item.classId)
  );

  container.innerHTML = visible.length
    ? visible.map(item => `
        <div class="list-item">
          <div>
            <strong>${escapeHTML(item.title)}</strong>
            <small>${formatDate(item.deadline)}</small>
          </div>
          <button class="btn secondary"
            data-play-quiz="${escapeHTML(item.id)}">
            Start
          </button>
        </div>
      `).join("")
    : `<p class="muted">No quizzes available.</p>`;

  container.querySelectorAll("[data-play-quiz]").forEach(button => {
    button.addEventListener("click", () => {
      const quiz = visible.find(
        item => item.id === button.dataset.playQuiz
      );

      if (!quiz || expired(quiz.deadline)) {
        return showToast("This quiz has expired.");
      }

      startQuiz(quiz.title, quiz.questions, true);
    });
  });
}


/* =========================================================
   26. LEADERBOARD
========================================================= */

function renderLeaderboard() {
  const container = $("leaderboardList");

  if (!container) return;

  const period = $("leaderboardPeriod")?.value || "all";

  const attempts = getData(STORAGE.attempts, []);

  const today = new Date();

  const filtered = attempts.filter(item => {
    const date = new Date(item.date);

    if (period === "weekly") {
      return (today - date) <= 7 * 86400000;
    }

    if (period === "monthly") {
      return (
        today.getMonth() === date.getMonth() &&
        today.getFullYear() === date.getFullYear()
      );
    }

    return true;
  });

  const totals = {};

  filtered.forEach(item => {
    totals[item.user] = (totals[item.user] || 0) + item.score;
  });

  const ownScore = totals[currentUser.id] || 0;

  container.innerHTML = `
    <div class="list-item">
      <strong>${escapeHTML(currentUser.name)}</strong>
      <span>${ownScore} points</span>
    </div>
    <p class="tiny-note">
      Current browser's stored quiz scores.
    </p>
  `;

  setText(
    "leaderboardScope",
    "Local preview — shared rankings are not yet connected."
  );
}

$("leaderboardPeriod")?.addEventListener(
  "change",
  renderLeaderboard
);


/* =========================================================
   27. CLASS COMMUNITY
========================================================= */

function renderCommunity() {
  const container = $("communityFeed");

  if (!container) return;

  const posts = getData(STORAGE.posts, []);

  container.innerHTML = posts.length
    ? posts.slice().reverse().map(post => `
        <article class="panel glass">
          <p class="eyebrow">${escapeHTML(post.className)}</p>
          <h3>${escapeHTML(post.author)}</h3>
          <p>${escapeHTML(post.text)}</p>
          <small class="muted">${formatDate(post.date)}</small>

          ${
            post.userId === currentUser.id
              ? `<button class="btn secondary"
                  data-delete-post="${escapeHTML(post.id)}">
                  Delete
                 </button>`
              : ""
          }
        </article>
      `).join("")
    : `<p class="muted">No community posts yet.</p>`;

  container.querySelectorAll("[data-delete-post]").forEach(button => {
    button.addEventListener("click", () => {
      const remaining = getData(STORAGE.posts, []).filter(
        item => item.id !== button.dataset.deletePost
      );

      saveData(STORAGE.posts, remaining);

      renderCommunity();

      showToast("Post deleted.");
    });
  });
}

$("postForm")?.addEventListener("submit", event => {
  event.preventDefault();

  const classId = value("postClass");
  const text = value("postText");

  const selectedClass = classesCache.find(
    item => item.id === classId
  );

  if (!selectedClass || !text) {
    return showToast("Select a class and enter your post.");
  }

  const posts = getData(STORAGE.posts, []);

  posts.push({
    id: uid(),
    userId: currentUser.id,
    author: currentUser.name,
    classId,
    className: selectedClass.name,
    text,
    date: new Date().toISOString()
  });

  saveData(STORAGE.posts, posts);

  event.target.reset();

  renderCommunity();

  showToast("Post published!");
});


/* =========================================================
   28. SENIOR CONNECT
========================================================= */

function renderSeniors() {
  const container = $("seniorList");

  if (!container) return;

  const entries = getData(STORAGE.seniors, []);

  container.innerHTML = entries.length
    ? entries.map(item => `
        <article class="panel glass">
          <p class="eyebrow">${escapeHTML(item.topic)}</p>
          <h3>${escapeHTML(item.name)}</h3>
          <p class="muted">${escapeHTML(item.course)}</p>
          <p>${escapeHTML(item.bio)}</p>
          <small>${formatDate(item.date)}</small>

          ${
            item.userId === currentUser.id
              ? `<button class="btn secondary"
                  data-delete-senior="${escapeHTML(item.id)}">
                  Remove
                 </button>`
              : ""
          }
        </article>
      `).join("")
    : `<p class="muted">No senior connect cards yet.</p>`;

  container.querySelectorAll("[data-delete-senior]").forEach(button => {
    button.addEventListener("click", () => {
      const remaining = getData(STORAGE.seniors, []).filter(
        item => item.id !== button.dataset.deleteSenior
      );

      saveData(STORAGE.seniors, remaining);

      renderSeniors();

      showToast("Card removed.");
    });
  });
}

$("seniorForm")?.addEventListener("submit", event => {
  event.preventDefault();

  const topic = value("seniorTopic");
  const course = value("seniorCourse");
  const bio = value("seniorBio");

  if (!topic || !course || !bio) {
    return showToast("Complete all fields.");
  }

  const entries = getData(STORAGE.seniors, []);

  entries.push({
    id: uid(),
    userId: currentUser.id,
    name: currentUser.name,
    topic,
    course,
    bio,
    date: new Date().toISOString()
  });

  saveData(STORAGE.seniors, entries);

  event.target.reset();

  renderSeniors();

  showToast("Senior Connect card published!");
});


/* =========================================================
   29. PDF ROSTER INPUT
========================================================= */

$("rosterForm")?.addEventListener("submit", event => {
  event.preventDefault();

  const file = $("rosterPdf")?.files?.[0];

  if (!file) {
    return showToast("Select a PDF file.");
  }

  if (file.size > 150 * 1024) {
    return showToast("PDF must be below 150 KB.");
  }

  showToast(
    "PDF selected. Automatic roster reading is not connected yet."
  );
});


/* =========================================================
   30. MODAL SYSTEM
========================================================= */

function openModal(title, html) {
  setText("modalTitle", title);

  if ($("modalBody")) {
    $("modalBody").innerHTML = html;
  }

  $("modalBackdrop")?.classList.remove("hidden");
}

function closeModal() {
  $("modalBackdrop")?.classList.add("hidden");
}

$("modalClose")?.addEventListener("click", closeModal);

$("modalBackdrop")?.addEventListener("click", event => {
  if (event.target.id === "modalBackdrop") {
    closeModal();
  }
});


/* =========================================================
   31. SCROLL EFFECT
========================================================= */

window.addEventListener("scroll", () => {
  document.body.classList.toggle(
    "page-scrolled",
    window.scrollY > 60
  );
}, { passive: true });


/* =========================================================
   32. DATE AND INITIAL STATUS
========================================================= */

async function checkBackend() {
  try {
    const result = await api("/api/status");

    console.log(result.message);

  } catch (error) {
    console.warn("Backend connection issue:", error.message);
  }
}


/* =========================================================
   33. INITIALIZE APPLICATION
========================================================= */

async function initializeNexstudy() {
  console.log("NEXSTUDY initializing...");

  await checkBackend();

  await restoreSession();

  console.log("NEXSTUDY ready.");
}

document.addEventListener("DOMContentLoaded", initializeNexstudy);
