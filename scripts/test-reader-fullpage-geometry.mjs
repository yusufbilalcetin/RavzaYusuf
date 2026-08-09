import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, ThemeTestBrowser, ensureTestServer, delay, assertCleanDiagnostics } from "./lib/theme-test-runtime.mjs";

const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("reader-fullpage-geometry");
const artifactDir = join(ROOT, "test-artifacts", "reader-fullpage-geometry");
await mkdir(artifactDir, { recursive: true });

const viewports = [
  { width: 390, height: 844, mobile: true },
  { width: 430, height: 932, mobile: true },
  { width: 768, height: 1024, mobile: false },
  { width: 1024, height: 768, mobile: false },
  { width: 1440, height: 900, mobile: false },
  { width: 1920, height: 1080, mobile: false },
];

const measure = () => browser.evaluate(`JSON.stringify((() => {
  const stage=document.getElementById('rdr-stage');
  const cradle=document.getElementById('book-cradle');
  const root=document.getElementById('reader-inner');
  const block=document.querySelector('.stf__block'); const wrapper=document.querySelector('.stf__wrapper');
  const sr=stage.getBoundingClientRect();
  const cr=cradle.getBoundingClientRect();
  const ss=getComputedStyle(stage); const cs=getComputedStyle(cradle);
  const px=name => parseFloat(ss[name]) || 0;
  const pages=[...document.querySelectorAll('.pdf-page')]
    .map(el => ({el,r:el.getBoundingClientRect()})).filter(item => item.r.width > 1)
    .sort((a,b) => a.r.left-b.r.left);
  const pageData=pages.map(({el,r}) => {
    const frame=el.querySelector('.pdf-canvas-frame'); const canvas=el.querySelector('canvas');
    const fs=getComputedStyle(frame); const ps=getComputedStyle(el); const fr=frame.getBoundingClientRect();
    const vr=canvas?.getBoundingClientRect();
    return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,
      aspect:r.width/r.height,border:[ps.borderTopWidth,ps.borderRightWidth,ps.borderBottomWidth,ps.borderLeftWidth],
      shadow:ps.boxShadow,frameBg:fs.backgroundColor,framePadding:[fs.paddingTop,fs.paddingRight,fs.paddingBottom,fs.paddingLeft],
      frame:{x:fr.x,y:fr.y,w:fr.width,h:fr.height},canvas:vr?{x:vr.x,y:vr.y,w:vr.width,h:vr.height}:null};
  });
  const before=getComputedStyle(cradle,'::before'); const after=getComputedStyle(cradle,'::after');
  const shadows=[...document.querySelectorAll('[class*="shadow"]')].filter(el => {
    const r=el.getBoundingClientRect(), s=getComputedStyle(el); return r.width>1 && r.height>1 && s.display!=='none' && Number(s.opacity)!==0;
  }).map(el => el.className);
  return {
    spread:root.dataset.spread, stage:{x:sr.x,y:sr.y,w:sr.width,h:sr.height}, cradle:{x:cr.x,y:cr.y,w:cr.width,h:cr.height},
    blockBg:block?getComputedStyle(block).backgroundColor:null, wrapperBg:wrapper?getComputedStyle(wrapper).backgroundColor:null,
    seam:block?(() => { const s=getComputedStyle(block,'::after'); return {content:s.content,width:parseFloat(s.width)||0,background:s.backgroundColor}; })():null,
    padding:[px('paddingTop'),px('paddingRight'),px('paddingBottom'),px('paddingLeft')],
    cradleShadow:cs.boxShadow, before:{content:before.content,shadow:before.boxShadow},
    after:{content:after.content,width:after.width,opacity:after.opacity,background:after.backgroundImage},
    pages:pageData, shadows, docWidth:document.documentElement.scrollWidth, viewport:{w:innerWidth,h:innerHeight}
  };
})())`);

try {
  for (const viewport of viewports) {
    await browser.setViewport({ ...viewport, deviceScaleFactor: 1 });
    await browser.navigate("/?page=ravza-books", "document.querySelector('.library-book-card')");
    await browser.evaluate(`localStorage.setItem('ravza-books-prefs', JSON.stringify({readerMode:'page',pageSound:false})); localStorage.setItem('ravza-books-last-read', JSON.stringify({'kucuk-prens':{page:24}})); location.reload()`);
    await browser.waitFor("document.querySelector('.library-book-card')", "library after prefs reload", 30000);
    await browser.evaluate(`document.querySelector('.library-book-card[data-book-id="kucuk-prens"]').click()`);
    await browser.waitFor("document.querySelectorAll('.pdf-page.is-rendered').length >= 2 || document.querySelector('.pdf-page.is-rendered')", "PDF pages", 60000);
    await delay(1200);
    const shown=JSON.parse(await measure());
    assert.ok(shown.pages.length >= 1 && shown.pages.length <= 2, `${viewport.width}: gorunen sayfa sayisi ${shown.pages.length}`);
    assert.deepEqual(shown.padding, [0,0,0,0], `${viewport.width}: stage dekoratif padding ${JSON.stringify(shown.padding)}`);
    assert.equal(shown.before.content, "none", `${viewport.width}: fake outer book shadow pseudo-element`);
    assert.equal(shown.after.content, "none", `${viewport.width}: fake center spine pseudo-element`);
    assert.equal(shown.shadows.length, 0, `${viewport.width}: PageFlip shadow katmani ${JSON.stringify(shown.shadows)}`);
    for (const page of shown.pages) {
      assert.ok(page.border.every(value => value === "0px"), `${viewport.width}: PDF border ${page.border}`);
      assert.equal(page.shadow, "none", `${viewport.width}: PDF shadow ${page.shadow}`);
      assert.ok(page.framePadding.every(value => value === "0px"), `${viewport.width}: frame padding ${page.framePadding}`);
      assert.ok(page.canvas, `${viewport.width}: canvas yok`);
      // Telefon portresinde FIZIKSEL YAPRAK ile PDF ICERIGI bilincli olarak
      // ayrilir: yaprak sahnenin tamamini kaplar, tuval onun icinde contain
      // edilir. Diger tum duzenlerde ikisi hala ayni dikdortgendir.
      const mobilePortrait = viewport.mobile && viewport.height > viewport.width;
      if (mobilePortrait) {
        assert.ok(page.canvas.w <= page.w+1 && page.canvas.h <= page.h+1, `${viewport.width}: canvas fiziksel yapragi tasiyor`);
        assert.ok(Math.abs(page.canvas.w-page.w)<=1, `${viewport.width}: canvas genisligi yaprak genisligini doldurmuyor`);
      } else {
        assert.ok(Math.abs(page.canvas.w-page.w)<=1 && Math.abs(page.canvas.h-page.h)<=1, `${viewport.width}: canvas gercek sayfayi doldurmuyor`);
      }
    }
    if (shown.pages.length === 2) {
      const gap=shown.pages[1].x-shown.pages[0].right;
      assert.ok(Math.abs(gap) <= 1, `${viewport.width}: StPageFlip geometry gap ${gap}`);
      assert.ok(shown.seam.width >= 6 && shown.seam.width <= 12, `${viewport.width}: visual seam ${shown.seam.width}`);
      assert.ok(Math.abs(shown.pages[0].y-shown.pages[1].y)<=1, `${viewport.width}: page top hizasi bozuk`);
      assert.ok(Math.abs(shown.pages[0].bottom-shown.pages[1].bottom)<=1, `${viewport.width}: page bottom hizasi bozuk`);
      assert.equal(shown.blockBg, "rgba(0, 0, 0, 0)", `${viewport.width}: spread block background ${shown.blockBg}`);
      assert.equal(shown.wrapperBg, "rgba(0, 0, 0, 0)", `${viewport.width}: spread wrapper background ${shown.wrapperBg}`);
    }
    const spreadWidth=shown.pages.at(-1).right-shown.pages[0].x;
    const spreadHeight=Math.max(...shown.pages.map(page => page.h));
    const widthUse=spreadWidth/shown.stage.w, heightUse=spreadHeight/shown.stage.h;
    assert.ok(Math.max(widthUse,heightUse)>=0.995, `${viewport.width}: PDF maksimum fit degil (${widthUse}/${heightUse})`);
    assert.ok(spreadWidth<=shown.stage.w+1 && spreadHeight<=shown.stage.h+1, `${viewport.width}: fit-page crop/tasma`);
    assert.ok(shown.pages.every(page => Math.abs(page.aspect-shown.pages[0].aspect)<0.002), `${viewport.width}: aspect ratio farki`);
    assert.ok(shown.docWidth<=viewport.width+1, `${viewport.width}: yatay document tasmasi`);

    if (viewport.width === 1440) {
      for (const theme of ["light", "sepia", "dark", "black"]) {
        await browser.evaluate(`document.querySelector('.theme-btn[data-theme="${theme}"]').click(); document.getElementById('reader-inner').classList.remove('controls-visible')`);
        await delay(180);
        const themed=JSON.parse(await measure());
        assert.equal(themed.pages.length, 2, `${theme}: spread iki sayfa degil`);
        const themeGap=themed.pages[1].x-themed.pages[0].right;
        assert.ok(Math.abs(themeGap)<=1, `${theme}: StPageFlip geometry gap ${themeGap}`);
        assert.ok(themed.seam.width>=6 && themed.seam.width<=12, `${theme}: visual seam ${themed.seam.width}`);
        assert.equal(themed.blockBg, "rgba(0, 0, 0, 0)", `${theme}: gap reader background'unu gostermiyor`);
        const themeShot=await browser.command("Page.captureScreenshot", {format:"png",captureBeyondViewport:false});
        await writeFile(join(artifactDir, `fullpage-1440x900-${theme}.png`), Buffer.from(themeShot.data,"base64"));
      }
    }

    await browser.evaluate(`document.getElementById('reader-inner').classList.remove('controls-visible')`);
    await delay(300); const hidden=JSON.parse(await measure());
    assert.ok(Math.abs(hidden.cradle.w-shown.cradle.w)<=1 && Math.abs(hidden.cradle.h-shown.cradle.h)<=1, `${viewport.width}: toolbar geometry degistirdi`);
    const shot=await browser.command("Page.captureScreenshot", {format:"png",captureBeyondViewport:false});
    await writeFile(join(artifactDir, `fullpage-${viewport.width}x${viewport.height}.png`), Buffer.from(shot.data,"base64"));
  }
  assertCleanDiagnostics(browser, "reader fullpage geometry");
  console.log("PASS reader full-page geometry: no spine/shadow/frame, StPageFlip-safe seam, maximum fit, responsive single/spread");
} finally {
  await browser.close();
  await server.close();
}
