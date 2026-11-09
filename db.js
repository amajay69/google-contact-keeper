// Tiny IndexedDB wrapper. Contacts never leave the device.
const DB = (() => {
  const open = () =>
    new Promise((res, rej) => {
      const r = indexedDB.open("contact-keeper", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("contacts", { keyPath: "id", autoIncrement: true });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const tx = db.transaction("contacts", mode);
      const out = fn(tx.objectStore("contacts"));
      tx.oncomplete = () => { db.close(); res(out && out.result); };
      tx.onerror = () => rej(tx.error);
    });
  };
  return {
    getAll: () => run("readonly", (s) => s.getAll()),
    replaceAll: (list) => run("readwrite", (s) => { s.clear(); list.forEach((c) => { delete c.id; s.add(c); }); }),
    put: (c) => run("readwrite", (s) => s.put(c)),
    clear: () => run("readwrite", (s) => s.clear()),
  };
})();
