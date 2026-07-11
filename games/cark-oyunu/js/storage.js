import { createWheel, sanitizeWheel } from "./model.js";

export const STORAGE_KEY = "ravza-wheel-game-v1";

export function createDefaultStore() {
  const wheel = createWheel("Şans Çarkı", ["Seçenek 1"]);
  return { version: 1, wheels: [wheel], activeWheelId: wheel.id, updatedAt: new Date().toISOString() };
}

export function loadStore(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY) || "null");
    if (!parsed || !Array.isArray(parsed.wheels) || !parsed.wheels.length) return createDefaultStore();
    const wheels = parsed.wheels.map(sanitizeWheel);
    return {
      version: 1,
      wheels,
      activeWheelId: wheels.some((wheel) => wheel.id === parsed.activeWheelId) ? parsed.activeWheelId : wheels[0].id,
      updatedAt: parsed.updatedAt || new Date().toISOString()
    };
  } catch {
    return createDefaultStore();
  }
}

export function saveStore(store, storage = globalThis.localStorage) {
  store.updatedAt = new Date().toISOString();
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}
