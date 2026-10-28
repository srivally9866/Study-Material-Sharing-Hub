/* StudyShare frontend. All resource data is loaded from the Express API. */
const API_BASE = (window.STUDYSHARE_API_URL || "http://localhost:3000/api").replace(/\/$/, "");
const grid = document.getElementById("materialsGrid");
const searchInput = document.getElementById("searchInput");
const subjectFilter = document.getElementById("subjectFilter");
const typeFilter = document.getElementById("typeFilter");
const resultsCount = document.getElementById("resultsCount");
const emptyState = document.getElementById("emptyState");
const apiNote = document.getElementById("apiNote");
const form = document.getElementById("materialForm");
const submitButton = document.getElementById("submitButton");
const formMessage = document.getElementById("formMessage");
const toast = document.getElementById("toast");
let materials = [];
let toastTimer;

const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);

function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}
function setFormMessage(message, type = "") {
  formMessage.textContent = message;
  formMessage.className = `form-message ${type}`.trim();
}
function typeClass(type = "") {
  const t = type.toLowerCase();
  if (t.includes("question")) return "paper";
  if (t.includes("lab")) return "lab";
  if (t.includes("reference")) return "reference";
  if (t.includes("presentation")) return "presentation";
  return "";
}
function typeSymbol(type = "") {
  const t = type.toLowerCase();
  if (t.includes("question")) return "▤";
  if (t.includes("lab")) return "⚗";
  if (t.includes("reference")) return "⌑";
  if (t.includes("presentation")) return "▧";
  return "✎";
}
function formatDate(dateValue) {
  if (!dateValue) return "Recently shared";
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? "Recently shared" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function safeResourceURL(url) {
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}
function renderMaterials() {
  const term = searchInput.value.trim().toLowerCase();
  const subject = subjectFilter.value;
  const type = typeFilter.value;
  const filtered = materials.filter(item => {
    const searchable = [item.title, item.subject, item.description, item.author_name, item.semester].join(" ").toLowerCase();
    return (!term || searchable.includes(term)) &&
      (!subject || item.subject === subject) &&
      (!type || item.resource_type === type);
  });
  resultsCount.textContent = `${filtered.length} ${filtered.length === 1 ? "resource" : "resources"} found`;
  grid.innerHTML = "";
  emptyState.classList.toggle("hidden", filtered.length > 0);
  if (!filtered.length) return;
  const fragment = document.createDocumentFragment();
  filtered.forEach(item => {
    const url = safeResourceURL(item.resource_url);
    const card = document.createElement("article");
    card.className = "material-card";
    card.innerHTML = `
      <div class="material-card-top"><span class="resource-symbol ${typeClass(item.resource_type)}">${typeSymbol(item.resource_type)}</span><span class="resource-type">${escapeHTML(item.resource_type || "Other")}</span></div>
      <h3>${escapeHTML(item.title)}</h3>
      <p class="material-description">${escapeHTML(item.description || "A student-shared resource to support your learning and revision.")}</p>
      <div class="material-tags"><span class="material-tag">${escapeHTML(item.subject)}</span>${item.semester ? `<span class="material-tag">${escapeHTML(item.semester)}</span>` : ""}</div>
      <div class="material-card-footer"><span class="author-dot">${escapeHTML((item.author_name || "S").trim().charAt(0).toUpperCase())}</span><span>${escapeHTML(item.author_name || "Student")} · ${escapeHTML(formatDate(item.created_at))}</span>${url ? `<a class="open-resource" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : `<span class="open-resource">Unavailable</span>`}</div>`;
    fragment.appendChild(card);
  });
  grid.appendChild(fragment);
}
async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
  } catch {
    throw new Error("Cannot reach the backend. Start the server and check the API URL.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}
function populateSubjects() {
  const selected = subjectFilter.value;
  const subjects = [...new Set(materials.map(item => item.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  subjectFilter.innerHTML = '<option value="">All subjects</option>' + subjects.map(subject => `<option value="${escapeHTML(subject)}">${escapeHTML(subject)}</option>`).join("");
  if (subjects.includes(selected)) subjectFilter.value = selected;
}
async function loadMaterials() {
  grid.innerHTML = '<div class="loading-state"><span class="spinner"></span><p>Loading study materials…</p></div>';
  emptyState.classList.add("hidden");
  apiNote.textContent = "";
  try {
    const data = await apiRequest("/materials");
    materials = Array.isArray(data.data) ? data.data : [];
    populateSubjects();
    renderMaterials();
    apiNote.textContent = materials.length ? "Resources are loaded from the connected database." : "No resources yet. Share the first one with your classmates.";
  } catch (error) {
    materials = [];
    grid.innerHTML = "";
    resultsCount.textContent = "Library unavailable";
    emptyState.classList.remove("hidden");
    emptyState.querySelector("h3").textContent = "We couldn't load the library";
    emptyState.querySelector("p").textContent = error.message;
    apiNote.textContent = "Check backend/.env, the Supabase schema, and that the backend server is running.";
  }
}
document.getElementById("searchButton").addEventListener("click", renderMaterials);
searchInput.addEventListener("input", renderMaterials);
subjectFilter.addEventListener("change", renderMaterials);
typeFilter.addEventListener("change", renderMaterials);
document.getElementById("clearFilters").addEventListener("click", () => {
  searchInput.value = "";
  subjectFilter.value = "";
  typeFilter.value = "";
  renderMaterials();
});
document.getElementById("menuToggle").addEventListener("click", () => {
  const links = document.getElementById("navLinks");
  const opened = links.classList.toggle("open");
  document.getElementById("menuToggle").setAttribute("aria-expanded", String(opened));
});
document.querySelectorAll("#navLinks a").forEach(link => link.addEventListener("click", () => {
  document.getElementById("navLinks").classList.remove("open");
  document.getElementById("menuToggle").setAttribute("aria-expanded", "false");
}));
document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
    document.getElementById("materials").scrollIntoView({ behavior: "smooth" });
  }
});
form.addEventListener("submit", async event => {
  event.preventDefault();
  setFormMessage("");
  if (!form.reportValidity()) return;
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.title = payload.title.trim();
  payload.subject = payload.subject.trim();
  payload.author_name = payload.author_name.trim();
  payload.description = payload.description.trim();
  payload.semester = payload.semester.trim();
  payload.resource_url = payload.resource_url.trim();
  if (!safeResourceURL(payload.resource_url)) {
    setFormMessage("Enter a valid HTTP or HTTPS resource link.", "error");
    return;
  }
  submitButton.disabled = true;
  submitButton.innerHTML = '<span class="spinner" style="width:15px;height:15px;border-width:2px"></span> Sharing…';
  try {
    const result = await apiRequest("/materials", { method: "POST", body: JSON.stringify(payload) });
    form.reset();
    setFormMessage("Resource shared successfully!", "success");
    notify("Your resource has been added to the library.");
    await loadMaterials();
    if (result.data?.id) {
      const added = materials.find(item => item.id === result.data.id);
      if (added) {
        searchInput.value = "";
        subjectFilter.value = "";
        typeFilter.value = "";
        renderMaterials();
      }
    }
    document.getElementById("materials").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    setFormMessage(error.message, "error");
    notify(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Share resource <span>↗</span>';
  }
});
document.getElementById("year").textContent = new Date().getFullYear();
loadMaterials();
