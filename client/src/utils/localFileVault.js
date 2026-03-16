const DB_NAME = 'habytarc-local-files';
const STORE_NAME = 'files';
const DB_VERSION = 1;

const openVault = () =>
  new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open local file vault.'));
  });

const runTransaction = async (mode, worker) => {
  const db = await openVault();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = worker(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
  });
};

export const saveLocalFile = async (file, uid) => {
  if (!(file instanceof File)) {
    throw new Error('A browser file is required.');
  }

  const id = `local_${uid || 'anon'}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const entry = {
    id,
    uid: String(uid || ''),
    name: String(file.name || 'file'),
    type: String(file.type || 'application/octet-stream'),
    size: Number(file.size || 0),
    updatedAtMs: Date.now(),
    blob: file
  };

  await runTransaction('readwrite', (store) => store.put(entry));
  return entry;
};

export const getLocalFileEntry = async (id) => {
  if (!id) return null;
  const result = await runTransaction('readonly', (store) => store.get(id));
  return result || null;
};

export const deleteLocalFile = async (id) => {
  if (!id) return;
  await runTransaction('readwrite', (store) => store.delete(id));
};

export const getLocalFileUrl = async (id) => {
  const entry = await getLocalFileEntry(id);
  if (!entry?.blob) return null;
  return URL.createObjectURL(entry.blob);
};
