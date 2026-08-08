import { ThemeTestBrowser, ensureTestServer, delay } from "./scripts/lib/theme-test-runtime.mjs";

const PROBE = `(() => {
  const box = (sel) => {
    const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { sel: typeof sel === 'string' ? sel : 'node',
      x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
      pos: cs.position, ov: cs.overflowY, ta: cs.touchAction, disp: cs.display,
      minH: cs.minHeight, maxH: cs.maxHeight, hgt: cs.height };
  };
  const c = document.querySelector('.pdf-page.is-rendered canvas') || document.querySelector('.pdf-page canvas');
  const scroller = document.getElementById('rdr-flipbook');
  return {
    vp: { innerW: innerWidth, innerH: innerHeight,
          docW: document.documentElement.clientWidth, docH: document.documentElement.clientHeight,
          vvW: Math.round(visualViewport?.width||0), vvH: Math.round(visualViewport?.height||0),
          vvTop: Math.round(visualViewport?.offsetTop||0), dpr: devicePixelRatio },
    mode: document.getElementById('reader-inner')?.dataset.readerMode,
    page: document.getElementById('reader-inner')?.dataset.currentPage,
    boxes: [box('#ravzabooks'), box('#reader-inner'), box('#rdr-stage'), box('#book-cradle'),
            box('#rdr-flipbook'), box('.pdf-page'), box('.pdf-canvas-frame'), box('.reader-dock')].filter(Boolean),
    canvas: c ? { attrW: c.width, attrH: c.height, styleW: c.style.width, styleH: c.style.height,
                  cssW: Math.round(c.getBoundingClientRect().width), cssH: Math.round(c.getBoundingClientRect().height) } : null,
    scroll: scroller ? { clientH: scroller.clientHeight, scrollH: scroller.scrollHeight, scrollTop: scroller.scrollTop,
                         canScroll: scroller.scrollHeight > scroller.clientHeight + 4 } : null,
    docScrollW: document.documentElement.scrollWidth,
    bodyScrollW: document.body.scrollWidth,
    horizOverflow: document.documentElement.scrollWidth > innerWidth + 1,
  };
})()`;

const server = await ensureTestServer();
const b = await ThemeTestBrowser.launch("measure");
try {
  for (const [w,h,dpr] of [[390,844,3],[430,932,3]]) {
    for (const mode of ['page','scroll']) {
      await b.setViewport({ width: w, height: h, deviceScaleFactor: dpr, mobile: true });
      await b.navigate("/?page=ravza-books", "!!document.querySelector('#ravzabooks')");
      await b.waitFor("document.querySelectorAll('.library-book-card').length>0","cards");
      await b.evaluate(`localStorage.setItem('ravza-books-prefs', JSON.stringify({ readerMode: '${mode}', theme: 'light' })); localStorage.removeItem('ravza-books-last-read');`);
      await b.navigate("/?page=ravza-books", "!!document.querySelector('#ravzabooks')");
      await b.waitFor("document.querySelectorAll('.library-book-card').length>0","cards2");
      await b.evaluate(`document.querySelector('.library-book-card[data-book-id="kucuk-prens"]').click()`);
      await b.waitFor("document.querySelector('#ravzabooks')?.dataset.appMode==='reading'","reading",90000);
      await delay(2500);
      const r = await b.evaluate(PROBE);
      console.log(`\n########## ${w}x${h} dpr${dpr} mode=${mode} (asked ${mode}) actual=${r.mode}`);
      console.log('vp', JSON.stringify(r.vp));
      console.log('canvas', JSON.stringify(r.canvas));
      console.log('scroll', JSON.stringify(r.scroll));
      console.log('horizOverflow', r.horizOverflow, 'docScrollW', r.docScrollW);
      for (const bx of r.boxes) console.log('  ', JSON.stringify(bx));
    }
  }
} finally { await b.close(); await server.close(); }
