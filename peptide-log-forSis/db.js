// IndexedDB storage. Everything lives on the device; nothing is sent anywhere.
//
// Data model (designed so later steps only add fields/records, never migrate old ones):
//   peptides  {id, name, vialAmount, vialUnit, vialCount, notes, archived, createdAt, updatedAt}
//   supplies  {id, name, amount, unit, count, createdAt, updatedAt}          e.g. bac water
//   entries   {id, peptideId, peptideName, dose, doseUnit, volume, volumeUnit,
//              takenAt (ISO), site, notes, status ('taken'), vialId, scheduleId,
//              createdAt, updatedAt}
//   vials     step 2: {id, peptideId, peptideAmount, unit, diluentMl, mixedAt, status, ...}
//   schedules step 3: {id, peptideId, dose, doseUnit, rule, times, active, ...}
//   daily     v2: {id = 'YYYY-MM-DD', sleep, energy, mood (1-5), side, weight, weightUnit, waist}
//   meta      {key, value}  app settings and flags (e.g. seeded)
const DB_NAME = 'peptide-log-2';
const DB_VERSION = 2;

const DB = (() => {
  let dbp;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('peptides')) {
          db.createObjectStore('peptides', { keyPath: 'id' }).createIndex('name', 'name');
        }
        if (!db.objectStoreNames.contains('supplies')) db.createObjectStore('supplies', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('entries')) {
          const s = db.createObjectStore('entries', { keyPath: 'id' });
          s.createIndex('takenAt', 'takenAt');
          s.createIndex('peptideId', 'peptideId');
        }
        if (!db.objectStoreNames.contains('vials')) {
          db.createObjectStore('vials', { keyPath: 'id' }).createIndex('peptideId', 'peptideId');
        }
        if (!db.objectStoreNames.contains('schedules')) {
          db.createObjectStore('schedules', { keyPath: 'id' }).createIndex('peptideId', 'peptideId');
        }
        if (!db.objectStoreNames.contains('daily')) db.createObjectStore('daily', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  function wrap(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      let result;
      Promise.resolve(fn(t.objectStore(store))).then((r) => { result = r; });
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  const uid = () =>
    (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  return {
    uid,
    all: (store) => tx(store, 'readonly', (s) => wrap(s.getAll())),
    get: (store, id) => tx(store, 'readonly', (s) => wrap(s.get(id))),
    put: (store, obj) => {
      const now = new Date().toISOString();
      const rec = { ...obj, id: obj.id || uid(), createdAt: obj.createdAt || now, updatedAt: now };
      return tx(store, 'readwrite', (s) => wrap(s.put(rec))).then(() => rec);
    },
    // Write a record exactly as given (restore keeps original ids and timestamps).
    putRaw: (store, obj) => tx(store, 'readwrite', (s) => wrap(s.put(obj))),
    del: (store, id) => tx(store, 'readwrite', (s) => wrap(s.delete(id))),
    getMeta: (key) => tx('meta', 'readonly', (s) => wrap(s.get(key))).then((r) => (r ? r.value : undefined)),
    setMeta: (key, value) => tx('meta', 'readwrite', (s) => wrap(s.put({ key, value }))),

    async seedIfEmpty() {
      if (await this.getMeta('seeded')) return;
      for (const p of window.SEED_PEPTIDES) await this.put('peptides', { ...p, notes: '', archived: false });
      for (const s of window.SEED_SUPPLIES) await this.put('supplies', s);
      await this.setMeta('seeded', new Date().toISOString());
    }
  };
})();
