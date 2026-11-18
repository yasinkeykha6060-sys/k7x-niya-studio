const DB = "niyayesh-studio";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveProject(record) {
  const db = await openDb();
  const tx = db.transaction("projects", "readwrite");
  tx.objectStore("projects").put(record);
  await txDone(tx);
  db.close();
}

export async function loadProject(id) {
  const db = await openDb();
  const tx = db.transaction("projects", "readonly");
  const req = tx.objectStore("projects").get(id);
  const value = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return value;
}

export async function listProjects() {
  const db = await openDb();
  const tx = db.transaction("projects", "readonly");
  const req = tx.objectStore("projects").getAll();
  const value = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return value.sort((a, b) => b.updated - a.updated);
}

export async function deleteProject(id) {
  const db = await openDb();
  const tx = db.transaction("projects", "readwrite");
  tx.objectStore("projects").delete(id);
  await txDone(tx);
  db.close();
}

export async function rememberStorage() {
  try { await navigator.storage?.persist?.(); } catch { /* مرورگر اجازه نداد */ }
}

export async function quotaRatio() {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est?.quota) return 0;
    return est.usage / est.quota;
  } catch {
    return 0;
  }
}

function blobToData(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

export async function projectToJson(record) {
  const layers = [];
  for (const layer of record.layers) {
    layers.push({ ...layer, blob: layer.blob ? await blobToData(layer.blob) : null });
  }
  return JSON.stringify({ ...record, thumb: null, layers });
}

export function dataUrlToBlob(url) {
  const [head, body] = url.split(",");
  const mime = /data:(.*?);/.exec(head)?.[1] || "image/png";
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
