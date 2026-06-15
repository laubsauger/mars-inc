import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { SaveManager } from './save-manager';
import { idbBackupCount } from './storage';

beforeEach(() => {
  // Fresh DB per test so persistence is isolated.
  globalThis.indexedDB = new IDBFactory();
});

describe('SaveManager (T24, V14/V15 persistence)', () => {
  it('first load returns a fresh default profile', async () => {
    const sm = new SaveManager();
    const p = await sm.load();
    expect(p.currencies.martianGlory).toBe(0);
  });

  it('persists settings and restores them on a new manager (refresh sim)', async () => {
    const a = new SaveManager();
    await a.load();
    a.updateSettings({ masterVolume: 0.2 });
    expect(await a.flush()).toBe(true);

    const b = new SaveManager();
    const restored = await b.load();
    expect(restored.settings.masterVolume).toBe(0.2);
  });

  it('persists profile mutations (currencies)', async () => {
    const a = new SaveManager();
    await a.load();
    a.mutate((p) => {
      p.currencies.martianGlory += 50;
    });
    await a.flush();

    const b = new SaveManager();
    expect((await b.load()).currencies.martianGlory).toBe(50);
  });

  it('does not flush before load (no clobbering an existing save)', async () => {
    const sm = new SaveManager();
    expect(await sm.flush()).toBe(false);
  });

  it('recovers a fresh profile when stored data is absent', async () => {
    const sm = new SaveManager();
    const p = await sm.load();
    expect(p.schemaVersion).toBeGreaterThan(0);
  });

  it('writes a rolling backup on flush', async () => {
    const sm = new SaveManager();
    await sm.load();
    let t = 1000;
    sm.now = () => (t += 1000); // distinct timestamps
    for (let i = 0; i < 5; i++) {
      sm.mutate((p) => {
        p.currencies.martianGlory += 1;
      });
      await sm.flush();
    }
    // Storage prunes to the most recent few — bounded, not unbounded.
    expect(await idbBackupCount()).toBeLessThanOrEqual(3);
    expect(await idbBackupCount()).toBeGreaterThan(0);
  });

  it('recovers (does not throw) when stored data is corrupt', async () => {
    // Put a primitive where a profile object should be.
    const a = new SaveManager();
    await a.load();
    await new Promise<void>((resolve) => {
      const req = indexedDB.open('mars-pit', 2);
      req.onsuccess = () => {
        const tx = req.result.transaction('profile', 'readwrite');
        tx.objectStore('profile').put('not-a-profile', 'main');
        tx.oncomplete = () => resolve();
      };
    });
    const b = new SaveManager();
    const recovered = await b.load();
    expect(recovered.currencies.martianGlory).toBe(0); // fresh default, no crash
  });

  it('exports and imports a profile round-trip', async () => {
    const a = new SaveManager();
    await a.load();
    a.mutate((p) => {
      p.currencies.redDust = 9;
    });
    const blob = a.exportText();

    const b = new SaveManager();
    await b.load();
    expect(await b.importText(blob)).toBe(true);
    expect(b.current.currencies.redDust).toBe(9);
  });

  it('rejects a malformed import without touching the current save', async () => {
    const sm = new SaveManager();
    await sm.load();
    sm.mutate((p) => {
      p.currencies.martianGlory = 7;
    });
    expect(await sm.importText('{garbage')).toBe(false);
    expect(sm.current.currencies.martianGlory).toBe(7);
  });
});
