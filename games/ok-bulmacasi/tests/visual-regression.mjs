import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const output = resolve("../../test-artifacts/ok-visual-regression");
const run = spawnSync(process.execPath, ["./tests/browser-smoke.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, VISUAL_DIR: output },
  encoding: "utf8"
});
process.stdout.write(run.stdout || "");
process.stderr.write(run.stderr || "");
assert.equal(run.status, 0, "Görsel tarayıcı akışı başarılı olmalı");

const expected = [
  "dense-mobile-390x844.png", "dense-desktop-1440x900.png",
  "tail-follow-start-frame.png", "tail-follow-mid-frame.png", "tail-follow-end-frame.png",
  "after-undo.png", "hint-highlight.png", "after-restart.png", "wrong-selection.png", "dark-theme.png",
  ...[5, 10, 25, 50, 75, 100, 125, 144, 150].map((id) => `level-${id}-390x844.png`),
  "level-150-320x568.png", "level-150-768x1024.png", "level-150-1440x900.png"
];
expected.forEach((name) => {
  const file = resolve(output, name);
  assert.equal(existsSync(file), true, `${name} üretilmeli`);
  assert.ok(statSync(file).size > 10000, `${name} boş/bozuk olmamalı`);
});
console.log(`Görsel regresyon doğrulandı: ${expected.length} sabit durum ekran görüntüsü üretildi.`);
