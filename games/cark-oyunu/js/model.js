export const MAX_OPTIONS = 500;

const STATUS = new Set(["available", "used", "disabled"]);

export function createId(prefix = "item") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeLabel(value, caseSensitive = false) {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  return caseSensitive ? clean : clean.toLocaleLowerCase("tr-TR");
}

export function parseOptionText(value) {
  return String(value ?? "")
    .split(/[\n,;]+/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function generateNumberRange(start, end, step = 1) {
  const first = Number(start);
  const last = Number(end);
  const stride = Math.abs(Number(step));
  if (![first, last, stride].every(Number.isFinite) || stride <= 0) {
    throw new Error("Başlangıç, bitiş ve artış geçerli sayı olmalı.");
  }
  const direction = first <= last ? 1 : -1;
  const values = [];
  for (let value = first; direction > 0 ? value <= last : value >= last; value += stride * direction) {
    values.push(String(Number(value.toFixed(10))));
    if (values.length > MAX_OPTIONS) throw new Error(`En fazla ${MAX_OPTIONS} seçenek oluşturabilirsin.`);
  }
  return values;
}

export function createOption(label, overrides = {}) {
  return {
    id: overrides.id || createId("option"),
    label: String(label).replace(/\s+/g, " ").trim(),
    weight: Math.max(0.01, Number(overrides.weight) || 1),
    status: STATUS.has(overrides.status) ? overrides.status : "available"
  };
}

export function createWheel(name = "Şans Çarkı", labels = []) {
  const now = new Date().toISOString();
  const wheel = {
    id: createId("wheel"),
    name: String(name).trim() || "Şans Çarkı",
    allOptions: [],
    availableOptions: [],
    usedOptions: [],
    disabledOptions: [],
    currentResult: null,
    spinHistory: [],
    createdAt: now,
    updatedAt: now,
    settings: {
      caseSensitive: false,
      weighted: false,
      theme: "gold",
      sound: true,
      vibration: true,
      reducedMotion: false
    }
  };
  addOptions(wheel, labels);
  return wheel;
}

function optionById(wheel, id) {
  return wheel.allOptions.find((option) => option.id === id);
}

export function addOptions(wheel, labels, options = {}) {
  const caseSensitive = options.caseSensitive ?? wheel.settings.caseSensitive;
  const seen = new Set(wheel.allOptions.map((option) => normalizeLabel(option.label, caseSensitive)));
  const added = [];
  const duplicates = [];

  for (const raw of labels) {
    const label = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!label) continue;
    const key = normalizeLabel(label, caseSensitive);
    if (seen.has(key)) {
      duplicates.push(label);
      continue;
    }
    if (wheel.allOptions.length >= MAX_OPTIONS) throw new Error(`Bir çarkta en fazla ${MAX_OPTIONS} seçenek olabilir.`);
    const option = createOption(label);
    wheel.allOptions.push(option);
    wheel.availableOptions.push(option.id);
    seen.add(key);
    added.push(option);
  }
  touch(wheel);
  return { added, duplicates };
}

export function secureRandomIndex(length, cryptoObject = globalThis.crypto) {
  if (!Number.isInteger(length) || length <= 0) throw new Error("Seçilecek aktif seçenek yok.");
  if (!cryptoObject?.getRandomValues) return Math.floor(Math.random() * length);
  const range = 0x100000000;
  const limit = range - (range % length);
  const buffer = new Uint32Array(1);
  do cryptoObject.getRandomValues(buffer); while (buffer[0] >= limit);
  return buffer[0] % length;
}

function chooseWeightedIndex(options, randomUnit) {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let cursor = randomUnit * total;
  for (let index = 0; index < options.length; index += 1) {
    cursor -= options[index].weight;
    if (cursor < 0) return index;
  }
  return options.length - 1;
}

export function selectOption(wheel, randomIndex = secureRandomIndex, randomUnit = Math.random) {
  if (!wheel.availableOptions.length) throw new Error("Bütün seçenekler seçildi.");
  const available = wheel.availableOptions.map((id) => optionById(wheel, id)).filter(Boolean);
  const selectedIndex = wheel.settings.weighted
    ? chooseWeightedIndex(available, randomUnit())
    : randomIndex(available.length);
  const selected = available[selectedIndex];
  const sourceIndex = wheel.availableOptions.indexOf(selected.id);
  wheel.availableOptions.splice(sourceIndex, 1);
  wheel.usedOptions.push(selected.id);
  selected.status = "used";
  const entry = {
    id: createId("spin"),
    optionId: selected.id,
    value: selected.label,
    selectedAt: new Date().toISOString(),
    order: wheel.spinHistory.length + 1
  };
  wheel.currentResult = entry;
  wheel.spinHistory.push(entry);
  touch(wheel);
  return { option: selected, entry, selectedIndex, available };
}

export function undoLastSpin(wheel) {
  const entry = wheel.spinHistory.at(-1);
  if (!entry) return null;
  return undoSpin(wheel, entry.id);
}

export function undoSpin(wheel, historyId) {
  const entry = wheel.spinHistory.find((item) => item.id === historyId);
  if (!entry) return null;
  wheel.spinHistory = wheel.spinHistory.filter((item) => item.id !== historyId);
  const option = optionById(wheel, entry.optionId);
  wheel.usedOptions = wheel.usedOptions.filter((id) => id !== entry.optionId);
  if (option && option.status === "used") {
    option.status = "available";
    if (!wheel.availableOptions.includes(option.id)) wheel.availableOptions.push(option.id);
  }
  wheel.spinHistory.forEach((item, index) => { item.order = index + 1; });
  wheel.currentResult = wheel.spinHistory.at(-1) || null;
  touch(wheel);
  return entry;
}

export function resetResults(wheel) {
  wheel.allOptions.forEach((option) => {
    if (option.status === "used") option.status = "available";
  });
  wheel.availableOptions = wheel.allOptions.filter((option) => option.status === "available").map((option) => option.id);
  wheel.usedOptions = [];
  wheel.spinHistory = [];
  wheel.currentResult = null;
  touch(wheel);
}

export function clearWheel(wheel) {
  wheel.allOptions = [];
  wheel.availableOptions = [];
  wheel.usedOptions = [];
  wheel.disabledOptions = [];
  wheel.spinHistory = [];
  wheel.currentResult = null;
  touch(wheel);
}

export function setOptionStatus(wheel, optionId, status) {
  if (!STATUS.has(status)) return false;
  const option = optionById(wheel, optionId);
  if (!option) return false;
  wheel.availableOptions = wheel.availableOptions.filter((id) => id !== optionId);
  wheel.usedOptions = wheel.usedOptions.filter((id) => id !== optionId);
  wheel.disabledOptions = wheel.disabledOptions.filter((id) => id !== optionId);
  option.status = status;
  const bucket = status === "available" ? wheel.availableOptions : status === "used" ? wheel.usedOptions : wheel.disabledOptions;
  bucket.push(optionId);
  touch(wheel);
  return true;
}

export function updateOption(wheel, optionId, changes) {
  const option = optionById(wheel, optionId);
  if (!option) return false;
  const label = String(changes.label ?? option.label).replace(/\s+/g, " ").trim();
  if (!label) throw new Error("Seçenek metni boş olamaz.");
  const duplicate = wheel.allOptions.some((item) => item.id !== optionId
    && normalizeLabel(item.label, wheel.settings.caseSensitive) === normalizeLabel(label, wheel.settings.caseSensitive));
  if (duplicate) throw new Error("Bu seçenek listede zaten bulunuyor.");
  option.label = label;
  option.weight = Math.max(0.01, Number(changes.weight) || option.weight);
  touch(wheel);
  return true;
}

export function deleteOption(wheel, optionId) {
  const before = wheel.allOptions.length;
  wheel.allOptions = wheel.allOptions.filter((option) => option.id !== optionId);
  wheel.availableOptions = wheel.availableOptions.filter((id) => id !== optionId);
  wheel.usedOptions = wheel.usedOptions.filter((id) => id !== optionId);
  wheel.disabledOptions = wheel.disabledOptions.filter((id) => id !== optionId);
  wheel.spinHistory = wheel.spinHistory.filter((entry) => entry.optionId !== optionId);
  wheel.spinHistory.forEach((entry, index) => { entry.order = index + 1; });
  wheel.currentResult = wheel.spinHistory.at(-1) || null;
  touch(wheel);
  return wheel.allOptions.length < before;
}

export function shuffleAvailable(wheel, random = Math.random) {
  for (let index = wheel.availableOptions.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [wheel.availableOptions[index], wheel.availableOptions[swapIndex]] = [wheel.availableOptions[swapIndex], wheel.availableOptions[index]];
  }
  touch(wheel);
}

export function sanitizeWheel(candidate) {
  if (!candidate || typeof candidate !== "object") return createWheel();
  const wheel = createWheel(candidate.name || "Şans Çarkı");
  wheel.id = typeof candidate.id === "string" ? candidate.id : wheel.id;
  wheel.createdAt = candidate.createdAt || wheel.createdAt;
  wheel.settings = { ...wheel.settings, ...(candidate.settings || {}) };
  wheel.allOptions = Array.isArray(candidate.allOptions)
    ? candidate.allOptions.slice(0, MAX_OPTIONS).map((item) => createOption(item?.label, item || {})).filter((item) => item.label)
    : [];
  const validIds = new Set(wheel.allOptions.map((option) => option.id));
  const uniqueValid = (value) => [...new Set(Array.isArray(value) ? value : [])].filter((id) => validIds.has(id));
  wheel.availableOptions = uniqueValid(candidate.availableOptions);
  wheel.usedOptions = uniqueValid(candidate.usedOptions);
  wheel.disabledOptions = uniqueValid(candidate.disabledOptions);
  const assigned = new Set([...wheel.availableOptions, ...wheel.usedOptions, ...wheel.disabledOptions]);
  wheel.allOptions.forEach((option) => {
    if (!assigned.has(option.id)) wheel.availableOptions.push(option.id);
    option.status = wheel.usedOptions.includes(option.id) ? "used" : wheel.disabledOptions.includes(option.id) ? "disabled" : "available";
  });
  wheel.spinHistory = Array.isArray(candidate.spinHistory)
    ? candidate.spinHistory.filter((entry) => entry && validIds.has(entry.optionId)).map((entry, index) => ({ ...entry, order: index + 1 }))
    : [];
  wheel.currentResult = wheel.spinHistory.at(-1) || null;
  wheel.updatedAt = candidate.updatedAt || new Date().toISOString();
  return wheel;
}

function touch(wheel) {
  wheel.updatedAt = new Date().toISOString();
}
