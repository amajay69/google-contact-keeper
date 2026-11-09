if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

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

let contacts = [];
const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");

document.getElementById("fileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  contacts = VCard.parse(await file.text());
  statusEl.textContent = contacts.length
    ? `Loaded ${contacts.length} contacts from ${file.name}.`
    : "No contacts found. Please pick a .vcf file exported from your phone.";
  render();
});

function render() {
  listEl.replaceChildren();
  contacts.slice(0, 50).forEach((c) => {
    const li = document.createElement("li");
    li.textContent = c.name || "(no name)";
    const small = document.createElement("small");
    small.textContent = c.phones[0] || c.emails[0] || "";
    li.appendChild(small);
    listEl.appendChild(li);
  });
}
