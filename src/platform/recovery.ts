export type RecoverySnapshot = {
  timestamp: string;
  bytes: Uint8Array;
  name: string;
};
export class RecoveryStore {
  private generation = 0;
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(Error("Local recovery is unavailable in this browser."));
        return;
      }
      const request = indexedDB.open("form-recovery", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("snapshots");
      let blocked = false;
      request.onsuccess = () => {
        if (blocked) request.result.close();
        else resolve(request.result);
      };
      request.onerror = () =>
        reject(request.error ?? Error("Recovery storage is unavailable."));
      request.onblocked = () => {
        blocked = true;
        reject(Error("Another FORM tab is blocking recovery storage."));
      };
    });
  }
  async read(): Promise<RecoverySnapshot | null> {
    const db = await this.open();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction("snapshots", "readonly"),
          request = transaction.objectStore("snapshots").get("latest");
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }
  invalidate() {
    this.generation++;
  }
  async save(
    prepare: () => Promise<Uint8Array>,
    name: string,
  ): Promise<string | null> {
    const generation = ++this.generation,
      bytes = await prepare();
    if (generation !== this.generation) return null;
    const db = await this.open();
    try {
      if (generation !== this.generation) return null;
      const timestamp = new Date().toISOString();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("snapshots", "readwrite");
        transaction
          .objectStore("snapshots")
          .put({ timestamp, bytes, name }, "latest");
        transaction.oncomplete = () => resolve();
        transaction.onabort = () =>
          reject(
            transaction.error ??
              Error("Local recovery failed. Save a .form file."),
          );
        transaction.onerror = () =>
          reject(
            transaction.error ??
              Error("Local recovery storage is full. Save a .form file."),
          );
      });
      return timestamp;
    } finally {
      db.close();
    }
  }
  async clear() {
    this.invalidate();
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("snapshots", "readwrite");
        tx.objectStore("snapshots").delete("latest");
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }
}
