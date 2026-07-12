// Gizli kilit butonu: 650 ms içinde üçlü dokunma, 10 sn'lik ömür ve tam temizlik.
// Sahte zaman + minimal DOM stub'ı ile deterministik çalışır (gerçek tarayıcı gerekmez).
import assert from "node:assert/strict";
import { createLockReveal } from "../js/lock-reveal.js";

function test(name, callback) {
  try {
    callback();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

// —— Minimal DOM ————————————————————————————————————————————————————

function createNode(tag) {
  const node = {
    tagName: tag,
    children: [],
    parent: null,
    attributes: new Map(),
    listeners: new Map(),
    classes: new Set(),
    get className() { return [...node.classes].join(" "); },
    set className(value) { node.classes = new Set(String(value).split(/\s+/).filter(Boolean)); },
    classList: {
      add: (name) => node.classes.add(name),
      remove: (name) => node.classes.delete(name),
      contains: (name) => node.classes.has(name),
      toggle: (name, force) => (force ? node.classes.add(name) : node.classes.delete(name))
    },
    setAttribute: (name, value) => node.attributes.set(name, String(value)),
    getAttribute: (name) => node.attributes.get(name) ?? null,
    append: (...nodes) => nodes.forEach((child) => { child.parent = node; node.children.push(child); }),
    remove: () => {
      if (!node.parent) return;
      node.parent.children = node.parent.children.filter((child) => child !== node);
      node.parent = null;
    },
    addEventListener: (type, handler) => {
      if (!node.listeners.has(type)) node.listeners.set(type, []);
      node.listeners.get(type).push(handler);
    },
    removeEventListener: (type, handler) => {
      node.listeners.set(type, (node.listeners.get(type) || []).filter((item) => item !== handler));
    },
    dispatch: (type) => [...(node.listeners.get(type) || [])].forEach((handler) => handler())
  };
  return node;
}

const doc = {
  createElement: createNode,
  createElementNS: (_ns, tag) => createNode(tag)
};

/** Sahte zaman: setTimeout kuyruğu elle ilerletilir, gerçek bekleme yok. */
function createClock() {
  let time = 1000;
  let nextId = 1;
  const scheduled = new Map();
  return {
    now: () => time,
    pending: () => scheduled.size,
    timers: {
      setTimeout: (callback, delay) => {
        const id = nextId++;
        scheduled.set(id, { callback, at: time + delay });
        return id;
      },
      clearTimeout: (id) => scheduled.delete(id),
      requestAnimationFrame: (callback) => { callback(); return 0; }
    },
    advance(ms) {
      time += ms;
      for (const [id, task] of [...scheduled]) {
        if (task.at <= time) {
          scheduled.delete(id);
          task.callback();
        }
      }
    }
  };
}

function setup({ visibleMs = 10000, tripleTapMs = 650 } = {}) {
  const clock = createClock();
  const title = createNode("h1");
  const host = createNode("header");
  const activations = [];
  const reveal = createLockReveal({
    title,
    host,
    onActivate: () => activations.push(clock.now()),
    visibleMs,
    tripleTapMs,
    doc,
    timers: clock.timers,
    now: clock.now
  });
  const lockButton = () => host.children.find((child) => child.id === "lockButton") || null;
  return { clock, title, host, reveal, activations, lockButton };
}

const tripleTap = (title, clock, firstGap = 100, secondGap = 100) => {
  title.dispatch("pointerdown");
  clock.advance(firstGap);
  title.dispatch("pointerdown");
  clock.advance(secondGap);
  title.dispatch("pointerdown");
};

// —— Testler ————————————————————————————————————————————————————————

test("1 · sayfa ilk açıldığında kilit butonu DOM'da yok", () => {
  const { host, reveal, lockButton } = setup();
  assert.equal(lockButton(), null);
  assert.equal(host.children.length, 0, "yerinde boşluk da bırakılmamalı");
  assert.equal(reveal.isVisible(), false);
});

test("2 · tek tıklamada açılmaz", () => {
  const { title, clock, lockButton } = setup();
  title.dispatch("pointerdown");
  clock.advance(2000);
  assert.equal(lockButton(), null);
});

test("3 · çift tıklamada açılmaz", () => {
  const { title, clock, lockButton } = setup();
  title.dispatch("pointerdown");
  clock.advance(100);
  title.dispatch("pointerdown");
  assert.equal(lockButton(), null);
});

test("4 · 650 ms içindeki üçlü tıklamada açılır", () => {
  const { title, clock, lockButton } = setup();
  tripleTap(title, clock, 300, 349);
  const button = lockButton();
  assert.ok(button, "üçlü tıklamadan sonra buton DOM'da olmalı");
  assert.equal(button.tagName, "button");
  assert.equal(button.getAttribute("aria-label"), "Özel alanı aç");
  assert.equal(button.classList.contains("is-revealed"), true, "açılış animasyonu sınıfı eklenmeli");
});

test("5 · yavaş üçlü tıklamada açılmaz", () => {
  const { title, clock, lockButton } = setup();
  tripleTap(title, clock, 325, 326);
  assert.equal(lockButton(), null, "ilk ve üçüncü dokunma arası 650 ms'yi aşmamalı");
});

test("6 · mobil üçlü dokunma aynı yolu kullanır (pointerdown)", () => {
  const { title, clock, lockButton } = setup();
  // Dokunmatikte de pointerdown tetiklenir — ayrı bir touch yolu yok.
  assert.equal(title.listeners.has("pointerdown"), true);
  assert.equal(title.listeners.has("click"), false, "click/dblclick'e bağlanmamalı (mobilde gecikmeli)");
  tripleTap(title, clock, 200, 200);
  assert.ok(lockButton());
});

test("7 · 10 saniye sonunda kendiliğinden kapanır ve DOM'dan silinir", () => {
  const { title, clock, host, lockButton } = setup();
  tripleTap(title, clock);
  assert.ok(lockButton());

  clock.advance(9999);
  assert.ok(lockButton(), "süre dolmadan kaybolmamalı");

  clock.advance(2);
  assert.equal(lockButton(), null, "10 sn sonunda DOM'dan silinmeli");
  assert.equal(host.children.length, 0, "opaklıkla gizlenmemeli, düğüm kaldırılmalı");
});

test("8 · süre içinde tekrar üçlü dokununca sayaç yenilenir", () => {
  const { title, clock, lockButton } = setup();
  tripleTap(title, clock);
  clock.advance(9000);
  assert.ok(lockButton());

  tripleTap(title, clock);      // sayaç sıfırlanır
  clock.advance(9000);          // ilk sayaç olsaydı çoktan kapanmıştı
  assert.ok(lockButton(), "üçlü dokunma süreyi yenilemeli");

  clock.advance(1100);
  assert.equal(lockButton(), null);
});

test("9 · butona tıklanınca mevcut PIN akışı açılır ve buton kendiliğinden kaybolmaz", () => {
  const { title, clock, activations, lockButton } = setup();
  tripleTap(title, clock);
  lockButton().dispatch("click");
  assert.equal(activations.length, 1, "onActivate bir kez çağrılmalı");

  clock.advance(60000); // modal açıkken uzun süre beklense bile
  assert.ok(lockButton(), "PIN modalı açıkken buton kaybolmamalı");
});

test("10 · modal kapatılınca (hide) buton yeniden gizlenir", () => {
  const { title, clock, reveal, lockButton } = setup();
  tripleTap(title, clock);
  lockButton().dispatch("click");
  reveal.hide(); // app.js closeLock() içinde çağırır
  assert.equal(lockButton(), null);
  assert.equal(reveal.isVisible(), false);
});

test("11 · kilit durumu ikon ve aria'ya yansır", () => {
  const { title, clock, reveal, lockButton } = setup();
  reveal.setOpen(true);
  tripleTap(title, clock);
  const button = lockButton();
  assert.equal(button.classList.contains("is-open"), true);
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.equal(button.getAttribute("aria-label"), "Özel alanı kilitle");

  reveal.setOpen(false);
  assert.equal(button.classList.contains("is-open"), false);
  assert.equal(button.getAttribute("aria-label"), "Özel alanı aç");
});

test("12 · destroy() sonrası listener ve timer kalmaz, buton silinir", () => {
  const { title, clock, reveal, activations, lockButton } = setup();
  tripleTap(title, clock);
  assert.ok(lockButton());
  assert.equal(clock.pending(), 1, "gizleme sayacı çalışıyor olmalı");

  reveal.destroy();
  assert.equal(lockButton(), null, "destroy butonu DOM'dan kaldırmalı");
  assert.equal(clock.pending(), 0, "bekleyen timer kalmamalı");
  assert.equal((title.listeners.get("pointerdown") || []).length, 0, "listener sökülmeli");

  tripleTap(title, clock); // artık hiçbir şey olmamalı
  assert.equal(lockButton(), null);
  assert.equal(activations.length, 0);
});

test("13 · tekrar tekrar üçlü tıklama listener/timer biriktirmez", () => {
  const { title, clock, host, reveal, lockButton } = setup();
  for (let index = 0; index < 5; index += 1) tripleTap(title, clock);
  assert.equal(host.children.length, 1, "tek bir buton olmalı");
  assert.equal(clock.pending(), 1, "tek bir gizleme sayacı olmalı");
  assert.equal(lockButton().listeners.get("click").length, 1, "tek bir click listener olmalı");
  reveal.destroy();
});

console.log("\nTüm gizli kilit testleri geçti.");
