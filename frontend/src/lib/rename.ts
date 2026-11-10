/**
 * The app used to be called "Minha Rotina". What a browser saved under the old names moves to the
 * new ones, so nobody loses their data, theme or attachments after the rename.
 * Imported first in main.tsx: the store reads localStorage as soon as it is created.
 */
const OLD = "minha-rotina";
export const APP_KEY = "organizer";

function moveLocalStorage() {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k !== OLD && !k.startsWith(OLD + ":")) continue;
      const next = APP_KEY + k.slice(OLD.length);
      const v = localStorage.getItem(k);
      if (v !== null && localStorage.getItem(next) === null) localStorage.setItem(next, v);
      localStorage.removeItem(k);
    }
  } catch {
    /* storage blocked (private mode): nothing to move */
  }
}
moveLocalStorage();

/** Copies every entry of the old database's "files" store into `into`, then deletes the old one. */
async function copyOldFiles(oldName: string, into: IDBDatabase) {
  const list = await indexedDB.databases?.().catch(() => undefined);
  if (list && !list.some((d) => d.name === oldName)) return;
  const old = await new Promise<IDBDatabase | null>((resolve) => {
    const req = indexedDB.open(oldName);
    // It didn't exist (browsers without databases()): don't leave an empty one behind.
    req.onupgradeneeded = () => req.transaction?.abort();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  if (!old) return;
  if (old.objectStoreNames.contains("files")) {
    const entries = await new Promise<[IDBValidKey, unknown][]>((resolve) => {
      const out: [IDBValidKey, unknown][] = [];
      const req = old.transaction("files").objectStore("files").openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve(out);
        out.push([c.key, c.value]);
        c.continue();
      };
      req.onerror = () => resolve(out);
    });
    await new Promise<void>((resolve) => {
      const tx = into.transaction("files", "readwrite");
      for (const [k, v] of entries) tx.objectStore("files").put(v, k);
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    });
  }
  old.close();
  indexedDB.deleteDatabase(oldName);
}

const opened = new Map<string, Promise<IDBDatabase>>();

/**
 * Erases this app's file databases (wallpaper picture, attachments kept without an account) from the
 * device, for signing out. Open connections are closed first, or the browser would wait for them.
 */
export async function eraseFilesDbs(names: string[]) {
  for (const name of names) {
    const p = opened.get(name);
    opened.delete(name);
    await p?.then((d) => d.close()).catch(() => undefined);
    await new Promise<void>((resolve) => {
      try {
        const req = indexedDB.deleteDatabase(`${APP_KEY}-${name}`);
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      } catch {
        resolve();
      }
      setTimeout(resolve, 1500);
    });
  }
}
/** Opens this app's "<name>" database with a "files" store, bringing over what the old name kept. */
export function openFilesDb(name: string): Promise<IDBDatabase> {
  let p = opened.get(name);
  if (!p) {
    p = new Promise((resolve, reject) => {
      let fresh = false;
      const req = indexedDB.open(`${APP_KEY}-${name}`, 1);
      req.onupgradeneeded = () => {
        fresh = true;
        req.result.createObjectStore("files");
      };
      req.onsuccess = () => {
        const d = req.result;
        if (!fresh) return resolve(d);
        copyOldFiles(`${OLD}-${name}`, d).then(
          () => resolve(d),
          () => resolve(d),
        );
      };
      req.onerror = () => reject(req.error);
    });
    p.catch(() => opened.delete(name));
    opened.set(name, p);
  }
  return p;
}
