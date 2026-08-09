import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, ThemeTestBrowser, ensureTestServer, assertCleanDiagnostics } from "./lib/theme-test-runtime.mjs";

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("transparent-cards");
const artifactDir = join(ROOT, "test-artifacts", "transparent-content-cards");
await mkdir(artifactDir, { recursive: true });
const cases = [
  ["calisma-merkezi", "#studyhub .topic-card"],
  ["quiz-merkezi", "#quizhub .topic-card"],
  ["kahoot", "#kahoot .kahoot-panel, #kahoot .kahoot-category-card"],
];

try {
  for (const viewport of [{width:390,height:844,mobile:true}, {width:412,height:915,mobile:true}, {width:430,height:932,mobile:true}, {width:768,height:1024,mobile:false}, {width:1440,height:900,mobile:false}, {width:1920,height:1080,mobile:false}]) {
    await browser.setViewport({...viewport, deviceScaleFactor: 1});
    for (const dark of [false, true]) {
      for (const [route, selector] of cases) {
        await browser.navigate(`/?page=${route}`, `document.querySelector(${JSON.stringify(selector)})`);
        await browser.evaluate(`document.body.classList.toggle('dark', ${dark})`);
        const styles = JSON.parse(await browser.evaluate(`JSON.stringify([...document.querySelectorAll(${JSON.stringify(selector)})].slice(0,30).map(el => {
          const s=getComputedStyle(el); const m=s.backgroundColor.match(/[\\d.]+/g)||[];
          return {bg:s.backgroundColor, alpha:m.length>3?Number(m[3]):1, blur:s.backdropFilter, border:s.borderTopColor};
        }))`));
        assert.ok(styles.length, `${route}: kart bulunamadi`);
        for (const style of styles) {
          assert.equal(style.alpha, 0, `${route}: tam saydam degil (${style.bg})`);
          assert.ok(!style.blur || style.blur === "none", `${route}: kart basi backdrop filter (${style.blur})`);
          assert.notEqual(style.border, "rgba(0, 0, 0, 0)", `${route}: sinir gorunmez`);
        }
        if (viewport.width <= 430 && (route === "calisma-merkezi" || route === "quiz-merkezi")) {
          const layout = JSON.parse(await browser.evaluate(`(() => {
            const cards=[...document.querySelectorAll(${JSON.stringify(selector)})].slice(0,3).map(el=>el.getBoundingClientRect());
            const grid=document.querySelector(${JSON.stringify(route === "calisma-merkezi" ? "#studyHubGrid" : "#quizHubGrid")});
            return JSON.stringify({cards:cards.map(r=>({x:r.x,y:r.y,w:r.width,right:r.right})),columns:getComputedStyle(grid).gridTemplateColumns,scrollWidth:document.documentElement.scrollWidth,innerWidth});
          })()`));
          assert.equal(Math.round(layout.cards[0].y), Math.round(layout.cards[1].y), `${route}: ilk iki kart ayni satirda degil (${layout.columns}; ${layout.innerWidth}px)`);
          assert.ok(layout.cards[2].y > layout.cards[0].y, `${route}: ucuncu kart ikinci satira inmedi`);
          assert.ok(Math.abs(layout.cards[0].w - layout.cards[1].w) < 1, `${route}: kart genislikleri esit degil`);
          assert.ok(layout.scrollWidth <= layout.innerWidth, `${route}: yatay tasma ${layout.scrollWidth}/${layout.innerWidth}`);
        }
        if (route === "calisma-merkezi" || route === "quiz-merkezi") {
          const shot = await browser.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
          await writeFile(join(artifactDir, `${route}-${viewport.width}-${dark ? "dark" : "light"}.png`), Buffer.from(shot.data, "base64"));
        }
      }
    }
  }
  await browser.navigate("/?page=quiz-merkezi", "document.querySelector('#quizhub .topic-card')");
  const stateStyles = JSON.parse(await browser.evaluate(`(() => {
    const host=document.getElementById('quizhub');
    host.insertAdjacentHTML('beforeend', '<div id="surface-fixture"><section class="question-card"></section><button class="option-item"></button><button class="option-item correct"></button><button class="option-item wrong"></button><section class="result-box"></section><article class="review-card"></article><section class="exam-focus-card"></section><button class="exam-option-btn selected"></button><section class="kahoot-result-card"></section></div>');
    return JSON.stringify([...document.querySelectorAll('#surface-fixture > *')].map(el => ({cls:el.className,bg:getComputedStyle(el).backgroundColor})));
  })()`));
  const alpha = value => { const values=value.match(/[\d.]+/g)||[]; return values.length > 3 ? Number(values[3]) : 1; };
  for (const item of stateStyles) {
    assert.equal(alpha(item.bg), 0, `${item.cls}: transparent shell (${item.bg})`);
  }
  assertCleanDiagnostics(browser, "transparent content cards");
  console.log("PASS transparent cards: alpha=0, 3 live route + quiz/exam/result/review states x light/dark x 390/768/1440/1920");
} finally {
  await browser.close();
  await server.close();
}
