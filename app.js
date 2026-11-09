if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// Install button
let deferredPrompt;
const installBtn = document.getElementById("installBtn");
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});

// State
let contacts = [];
const $ = (id) => document.getElementById(id);
const statusEl = $("status"), listEl = $("list"), toolsEl = $("tools"), countEl = $("count");

// Last 10 digits, so +91 98765 43210 and 098765 43210 match
const phoneKey = (p) => p.replace(/\D/g, "").slice(-10);

function duplicateIds() {
  const seen = new Map();
  contacts.forEach((c) => {
    new Set(c.phones.map(phoneKey).filter((k) => k.length >= 7)).forEach((k) => {
      if (!seen.has(k)) seen.set(k, []);
      seen.get(k).push(c.id);
    });
  });
  const ids = new Set();
  seen.forEach((list) => list.length > 1 && list.forEach((id) => ids.add(id)));
  return ids;
}

function visible() {
  const q = $("search").value.trim().toLowerCase();
  const f = $("filter").value;
  const dupes = f === "dupes" ? duplicateIds() : null;
  let out = contacts.filter((c) => {
    if (f === "nobday" && c.birthday) return false;
    if (f === "nophone" && c.phones.length) return false;
    if (f === "noname" && c.name) return false;
    if (dupes && !dupes.has(c.id)) return false;
    if (!q) return true;
    return [c.name, c.org, c.title, ...c.phones, ...c.emails].join(" ").toLowerCase().includes(q);
  });
  const dir = $("sort").value === "za" ? -1 : 1;
  out.sort((a, b) => dir * (a.name || "~").localeCompare(b.name || "~", "en", { sensitivity: "base" }));
  return out;
}

function render() {
  toolsEl.hidden = contacts.length === 0;
  const list = visible();
  countEl.textContent = `Showing ${list.length} of ${contacts.length}`;
  const frag = document.createDocumentFragment();
  list.forEach((c) => {
    const li = document.createElement("li");
    li.dataset.id = c.id;
    li.textContent = c.name || "(no name)";
    const small = document.createElement("small");
    small.textContent = [c.phones[0] || c.emails[0], c.org].filter(Boolean).join("  |  ");
    li.appendChild(small);
    frag.appendChild(li);
  });
  listEl.replaceChildren(frag);
}

$("fileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (contacts.length && !confirm(`This replaces the ${contacts.length} contacts saved on this device. Continue?`)) {
    e.target.value = "";
    return;
  }
  const parsed = VCard.parse(await file.text());
  if (!parsed.length) {
    statusEl.textContent = "No contacts found. Please pick a .vcf file exported from your phone.";
    return;
  }
  await DB.replaceAll(parsed);
  contacts = await DB.getAll();
  statusEl.textContent = `Loaded ${contacts.length} contacts from ${file.name}. Saved on this device.`;
  render();
});

["search", "sort", "filter"].forEach((id) => $(id).addEventListener("input", render));

$("clearBtn").addEventListener("click", async () => {
  if (!confirm("Remove all contacts from this device? Your phone contacts are not affected.")) return;
  await DB.clear();
  contacts = [];
  statusEl.textContent = "No file loaded yet.";
  render();
});

// ---- Editor ----
const MONTHS = ["Month", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function buildDateRow(row) {
  row.replaceChildren();
  const day = document.createElement("select");
  day.add(new Option("Day", 0));
  for (let i = 1; i <= 31; i++) day.add(new Option(i, i));
  const mon = document.createElement("select");
  MONTHS.forEach((m, i) => mon.add(new Option(m, i)));
  const yr = document.createElement("input");
  yr.type = "number"; yr.placeholder = "Year"; yr.min = 1900; yr.max = 2100; yr.inputMode = "numeric";
  row.append(day, mon, yr);
}
const readDate = (row) => {
  const [day, mon, yr] = row.children;
  return { d: +day.value, m: +mon.value, y: yr.value.trim() };
};
const fillDate = (row, value) => {
  const [day, mon, yr] = row.children;
  const p = VCard.parseDate(value);
  day.value = p.d; mon.value = p.m; yr.value = p.y;
};
const dateText = (x) => VCard.formatDate(x);

let editing = null;
const editor = $("editor");
buildDateRow($("bdRow"));
buildDateRow($("anRow"));

listEl.addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  editing = contacts.find((c) => c.id === +li.dataset.id);
  if (!editing) return;
  $("edTitle").textContent = editing.name || "(no name)";
  $("edPhones").textContent = [...editing.phones, ...editing.emails].join("  |  ");
  $("edName").value = editing.name;
  $("edOrg").value = editing.org;
  $("edJob").value = editing.title;
  $("edNote").value = editing.note;
  fillDate($("bdRow"), editing.birthday);
  fillDate($("anRow"), editing.anniversary);
  editor.showModal();
});

$("edCancel").addEventListener("click", () => editor.close());

$("editForm").addEventListener("submit", async () => {
  const c = editing;
  if (!c) return;
  const name = $("edName").value.trim(), org = $("edOrg").value.trim();
  const job = $("edJob").value.trim(), note = $("edNote").value.trim();
  // Only touch what changed, so untouched data is exported exactly as it came in
  if (name !== c.name) VCard.setName(c, name);
  if (org !== c.org) VCard.setSimple(c, "ORG", org);
  if (job !== c.title) VCard.setSimple(c, "TITLE", job);
  if (note !== c.note) VCard.setSimple(c, "NOTE", note);
  const bd = readDate($("bdRow")), an = readDate($("anRow"));
  if (dateText(bd) !== dateText(VCard.parseDate(c.birthday))) VCard.setBirthday(c, bd);
  if (dateText(an) !== dateText(VCard.parseDate(c.anniversary))) VCard.setAnniversary(c, an);
  VCard.recompute(c);
  await DB.put(c);
  editing = null;
  render();
});

(async function init() {
  try {
    contacts = await DB.getAll();
    if (contacts.length) statusEl.textContent = `${contacts.length} contacts saved on this device.`;
  } catch (e) {
    statusEl.textContent = "Storage is unavailable in this browser mode (private window?).";
  }
  render();
})();
