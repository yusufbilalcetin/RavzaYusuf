import { ThemeTestBrowser, ensureTestServer, delay } from "./scripts/lib/theme-test-runtime.mjs";
const P = `(() => {
  const stage = document.getElementById('rdr-stage');
  const cradle = document.getElementById('book-cradle');
  const frame = document.querySelector('.pdf-canvas-frame');
  const cs = getComputedStyle(stage);
  const fs = frame && getComputedStyle(frame);
  const c = document.querySelector('.pdf-page canvas');
  return {
    mode: document.getElementById('reader-inner').dataset.readerMode,
    stage: { clientW: stage.clientWidth, clientH: stage.clientHeight,
             padL: cs.paddingLeft, padR: cs.paddingRight, padT: cs.paddingTop, padB: cs.paddingBottom },
    cradleInline: cradle.getAttribute('style'),
    cradleRect: { w: Math.round(cradle.getBoundingClientRect().width), h: Math.round(cradle.getBoundingClientRect().height) },
    frame: frame ? { rectW: Math.round(frame.getBoundingClientRect().width), clientW: frame.clientWidth,
                     padL: fs.paddingLeft, padR: fs.paddingRight } : null,
    canvas: c ? { attrW: c.width, styleW: c.style.width, rectW: Math.round(c.getBoundingClientRect().width),
                  maxW: getComputedStyle(c).maxWidth } : null,
  };
})()`;
const server = await ensureTestServer(); const b = await ThemeTestBrowser.launch("m2");
try {
  for (const mode of ['page','scroll']) {
    await b.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await b.navigate("/?page=ravza-books", "!!document.querySelector('#ravzabooks')");
    await b.waitFor("document.querySelectorAll('.library-book-card').length>0","c");
    await b.evaluate(`localStorage.setItem('ravza-books-prefs', JSON.stringify({readerMode:'${mode}',theme:'light'})); localStorage.removeItem('ravza-books-last-read');`);
    await b.navigate("/?page=ravza-books", "!!document.querySelector('#ravzabooks')");
    await b.waitFor("document.querySelectorAll('.library-book-card').length>0","c2");
    await b.evaluate(`document.querySelector('.library-book-card[data-book-id="kucuk-prens"]').click()`);
    await b.waitFor("document.querySelector('#ravzabooks')?.dataset.appMode==='reading'","r",90000);
    await delay(2500);
    console.log(`\n=== ${mode} ===`); console.log(JSON.stringify(await b.evaluate(P), null, 1));
  }
} finally { await b.close(); await server.close(); }
