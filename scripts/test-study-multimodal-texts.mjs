import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ROOT,
  ThemeTestBrowser,
  assertCleanDiagnostics,
  delay,
  ensureTestServer,
} from "./lib/theme-test-runtime.mjs";
import { KONU_LISTESI } from "../data/konu-listesi.js";
import QUIZ from "../data/quizzes/multimodaltexts.js";

const TOPIC_ID = "multimodaltexts";
const server = await ensureTestServer();
const browser = await ThemeTestBrowser.launch("study-multimodal-texts");
const artifactDir = join(ROOT, "test-artifacts", "study-multimodal-texts");
await mkdir(artifactDir, { recursive: true });

async function screenshot(name) {
  const shot = await browser.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(artifactDir, `${name}.png`), Buffer.from(shot.data, "base64"));
}

async function openStudyHub(viewport, theme = "light") {
  await browser.setViewport(viewport);
  await browser.navigate(`/?page=calisma-merkezi&t=${Date.now()}`, "document.querySelector('#studyHubGrid')");
  await browser.evaluate(`localStorage.setItem('ravza-theme', ${JSON.stringify(theme)});`);
  await browser.evaluate("window.navigate('calisma-merkezi')");
  await browser.waitFor("document.querySelectorAll('#studyHubGrid .topic-card').length > 0", "study hub grid", 30000);
  await delay(300);
}

async function openLesson() {
  await browser.evaluate(`window.openStudyTopic(${JSON.stringify(TOPIC_ID)})`);
  await browser.waitFor("document.querySelector('#studydetail .study-content .content-card')", "lesson content", 30000);
  await delay(400);
}

const lessonText = () => browser.evaluate("document.querySelector('#studydetail .study-content')?.innerText || ''");

async function scrollToModes() {
  await browser.evaluate(`(() => {
    const head = document.querySelector('#studydetail .mode-head');
    head?.closest('.content-card')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  })()`);
  await delay(350);
}

try {
  // ---------------------------------------------------------- registry entry
  const topic = KONU_LISTESI.find((item) => item.id === TOPIC_ID);
  assert.ok(topic, "topic is not registered in KONU_LISTESI");
  assert.equal(topic.title, "Multimodal Texts", "unexpected topic title");
  assert.equal(topic.contentPath, `./content/topics/${TOPIC_ID}.html`, "contentPath does not follow the convention");
  assert.equal(topic.quizPath, `./data/quizzes/${TOPIC_ID}.js`, "quizPath does not follow the convention");
  assert.equal(topic.quizCount, QUIZ.length, `quizCount ${topic.quizCount} != real question count ${QUIZ.length}`);
  const orders = KONU_LISTESI.map((item) => item.order);
  assert.equal(new Set(orders).size, orders.length, "duplicate order values in the registry");
  const ids = KONU_LISTESI.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate topic ids in the registry");

  // ------------------------------------------------------- quiz answer keys
  QUIZ.forEach((question, index) => {
    assert.ok(Array.isArray(question.options) && question.options.length >= 3, `Q${index + 1}: needs at least three options`);
    assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < question.options.length, `Q${index + 1}: answer index out of range`);
    assert.equal(new Set(question.options).size, question.options.length, `Q${index + 1}: duplicate options`);
    assert.ok(question.explanation && question.explanation.length > 10, `Q${index + 1}: missing explanation`);
  });
  // §43 mode -> concept mapping regression.
  const answerOf = (needle) => {
    const question = QUIZ.find((item) => item.question.includes(needle));
    assert.ok(question, `quiz question containing "${needle}" is missing`);
    return question.options[question.answer].toLowerCase();
  };
  assert.match(answerOf("relates mainly to sound"), /aural/, "aural must map to sound");
  assert.match(answerOf("belongs to the gestural mode"), /facial expression/, "gestural must map to facial expression/movement");
  assert.match(answerOf("layout and positioning"), /spatial/, "spatial must map to layout/position");
  assert.match(answerOf("primarily a visual design feature"), /colour/, "visual must map to colour/images");
  assert.match(answerOf("What is a multimodal text"), /more than one mode/, "definition must be mode-based");
  assert.match(answerOf("What is multimodal literacy"), /understand.*create|create.*understand/, "literacy must cover understanding and creating");

  // --------------------------------------------------------------- hub card
  await openStudyHub({ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const card = await browser.evaluate(`(() => {
    const cards = [...document.querySelectorAll('#studyHubGrid .topic-card')];
    const found = cards.find(el => el.querySelector('.topic-title')?.textContent.trim() === 'Multimodal Texts');
    if (!found) return null;
    return {
      unit: found.querySelector('.unit-badge')?.textContent.trim(),
      subtitle: found.querySelector('p')?.textContent.trim(),
      hasGoButton: /Konuya Git/.test(found.querySelector('.primary-btn')?.textContent || ''),
      total: cards.length
    };
  })()`);
  assert.ok(card, "Multimodal Texts card does not render in the study hub");
  assert.equal(card.unit, "Literacy", "unexpected unit badge");
  assert.ok(card.hasGoButton, "card is missing the Konuya Git action");
  assert.equal(card.total, KONU_LISTESI.length, "study hub does not render every registered topic");

  // §47: gerçek "Konuya Git" düğmesiyle git, doğrudan fonksiyon çağırma.
  await browser.evaluate(`(() => {
    const found = [...document.querySelectorAll('#studyHubGrid .topic-card')]
      .find(el => el.querySelector('.topic-title')?.textContent.trim() === 'Multimodal Texts');
    found.querySelector('.primary-btn').click();
  })()`);
  await browser.waitFor("document.querySelector('#studydetail .study-content .content-card')", "lesson via card button", 30000);
  await delay(400);
  assert.equal(
    await browser.evaluate("document.querySelector('#studydetail .detail-title')?.textContent.trim()"),
    "Multimodal Texts",
    "Konuya Git button did not open the right lesson",
  );
  // Geri dönüş de gerçek düğmeyle.
  await browser.evaluate("document.querySelector('#studydetail .detail-back-btn').click()");
  await browser.waitFor("document.querySelectorAll('#studyHubGrid .topic-card').length > 0", "back via button", 20000);
  await delay(300);

  // ----------------------------------------------------------------- search
  for (const term of ["multimodal", "aural", "gestural", "spatial", "linguistic", "multiliteracies"]) {
    const hits = await browser.evaluate(`(() => {
      const input = document.getElementById('studyFilter');
      input.value = ${JSON.stringify(term)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return [...document.querySelectorAll('#studyHubGrid .topic-card .topic-title')].map(el => el.textContent.trim());
    })()`);
    assert.ok(hits.includes("Multimodal Texts"), `search "${term}" did not find the lesson (got ${hits.length} results)`);
  }
  await browser.evaluate(`(() => { const i=document.getElementById('studyFilter'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);

  // ------------------------------------------------------- lesson structure
  await openLesson();
  const text = await lessonText();
  const requiredSections = [
    "Learning Objectives",
    "What Is a Multimodal Text?",
    "The Five Modes of Communication",
    "Modes Work Together",
    "Examples of Multimodal Texts",
    "Why Do Multimodal Texts Matter?",
    "What Is Multimodal Literacy?",
    "Multiliteracies",
    "How to Analyse a Multimodal Text",
    "Key Vocabulary",
    "Key Takeaways",
  ];
  for (const section of requiredSections) {
    assert.ok(text.includes(section), `lesson is missing the section: ${section}`);
  }

  const modes = await browser.evaluate(`(() => {
    const heads = [...document.querySelectorAll('#studydetail .mode-head')];
    return heads.map(head => ({
      name: head.querySelector('.mode-name')?.textContent.trim(),
      turkish: head.querySelector('.mode-tr')?.textContent.trim(),
      hasIcon: Boolean(head.querySelector('svg')),
      iconHidden: head.querySelector('svg')?.getAttribute('aria-hidden') === 'true'
    }));
  })()`);
  assert.equal(modes.length, 5, `expected five modes, found ${modes.length}`);
  assert.deepEqual(modes.map((mode) => mode.name), ["Linguistic", "Visual", "Aural", "Gestural", "Spatial"], "wrong mode names or order");
  assert.ok(modes.every((mode) => mode.hasIcon), "a mode is missing its SVG icon");
  assert.ok(modes.every((mode) => mode.iconHidden), "mode icons must be aria-hidden (text label carries the meaning)");
  assert.ok(modes.every((mode) => mode.turkish), "a mode is missing its Turkish helper label");

  // Definitions must stay attached to the right mode (§42).
  const definitions = await browser.evaluate(`(() => {
    const out = {};
    for (const head of document.querySelectorAll('#studydetail .mode-head')) {
      out[head.querySelector('.mode-name').textContent.trim()] = head.parentElement.innerText.toLowerCase();
    }
    return out;
  })()`);
  assert.match(definitions.Linguistic, /written or spoken language/, "linguistic definition drifted");
  assert.match(definitions.Visual, /things we can see/, "visual definition drifted");
  assert.match(definitions.Aural, /through .*sound/, "aural definition drifted");
  assert.match(definitions.Gestural, /movement and physical expression/, "gestural definition drifted");
  assert.match(definitions.Spatial, /arrangement and position/, "spatial definition drifted");

  // §40: the five modes must be framed as one common framework, not the only one.
  assert.match(text, /commonly used framework/i, "the five modes are not presented as a commonly used framework");
  assert.ok(!/only five modes|exactly five modes|all scholars agree/i.test(text), "lesson overstates the five-mode framework");

  // §28: no emoji anywhere in the lesson body.
  const emoji = await browser.evaluate(`(() => {
    const body = document.querySelector('#studydetail .study-content')?.innerText || '';
    return [...body].filter(ch => /\\p{Extended_Pictographic}/u.test(ch));
  })()`);
  assert.equal(emoji.length, 0, `lesson body contains emoji: ${emoji.join(" ")}`);

  await screenshot("1440x900-light-lesson");
  await scrollToModes();
  await screenshot("1440x900-light-modes");

  // ------------------------------------------------------ progress + return
  await browser.evaluate(`localStorage.removeItem('eul_study_${TOPIC_ID}')`);
  await openLesson();
  await browser.evaluate(`window.toggleStudyDone(${JSON.stringify(TOPIC_ID)}, true)`);
  await delay(500);
  assert.equal(
    await browser.evaluate(`localStorage.getItem('eul_study_${TOPIC_ID}')`),
    "true",
    "completion is not stored under the canonical study key",
  );
  await browser.evaluate("window.navigate('calisma-merkezi')");
  await browser.waitFor("document.querySelectorAll('#studyHubGrid .topic-card').length > 0", "back to hub", 20000);
  const persisted = await browser.evaluate(`(() => {
    const found = [...document.querySelectorAll('#studyHubGrid .topic-card')]
      .find(el => el.querySelector('.topic-title')?.textContent.trim() === 'Multimodal Texts');
    return found?.querySelector('.mark-btn')?.classList.contains('done') || false;
  })()`);
  assert.equal(persisted, true, "completion state does not persist on the hub card");

  // --------------------------------------------------------------- the quiz
  await browser.evaluate(`window.openQuizTopic(${JSON.stringify(TOPIC_ID)})`);
  await browser.waitFor("document.querySelectorAll('#quizdetail .question-card').length > 0", "quiz render", 30000);
  const quizRender = await browser.evaluate(`(() => {
    const cards = [...document.querySelectorAll('#quizdetail .question-card')];
    return {
      count: cards.length,
      questions: cards.map(card => card.querySelector('.question-title')?.textContent.trim()),
      optionCounts: cards.map(card => card.querySelectorAll('.option-item').length)
    };
  })()`);
  assert.equal(quizRender.count, QUIZ.length, "quiz renders a different number of questions");
  QUIZ.forEach((question, index) => {
    assert.equal(quizRender.questions[index], question.question, `Q${index + 1}: rendered question text differs from the answer key order`);
    assert.equal(quizRender.optionCounts[index], question.options.length, `Q${index + 1}: rendered option count differs`);
  });
  await screenshot("1440x900-light-quiz");

  // ------------------------------------------------------------- responsive
  const overflow = [];
  for (const viewport of [
    { width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
    { width: 430, height: 932, deviceScaleFactor: 3, mobile: true },
    { width: 768, height: 1024, deviceScaleFactor: 2, mobile: true },
    { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false },
    { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
    { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false },
  ]) {
    await openStudyHub(viewport);
    await openLesson();
    const metrics = await browser.evaluate(`(() => {
      const smallTargets = [...document.querySelectorAll('#studydetail button')]
        .filter(el => el.getBoundingClientRect().height > 0)
        .filter(el => el.getBoundingClientRect().height < 44).length;
      return {
        docWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        viewport: innerWidth,
        modes: document.querySelectorAll('#studydetail .mode-head').length,
        smallTargets
      };
    })()`);
    assert.ok(metrics.docWidth <= metrics.viewport + 1 && metrics.bodyWidth <= metrics.viewport + 1, `${viewport.width}px: horizontal overflow (${metrics.docWidth} > ${metrics.viewport})`);
    assert.equal(metrics.modes, 5, `${viewport.width}px: five modes must stay rendered`);
    if (viewport.mobile) {
      assert.equal(metrics.smallTargets, 0, `${viewport.width}px: ${metrics.smallTargets} button(s) below the 44px touch target`);
    }
    overflow.push({ viewport: `${viewport.width}x${viewport.height}`, docWidth: metrics.docWidth, modes: metrics.modes });
    if (viewport.width === 390 || viewport.width === 768) {
      await screenshot(`${viewport.width}x${viewport.height}-light-lesson`);
      await scrollToModes();
      await screenshot(`${viewport.width}x${viewport.height}-light-modes`);
    }
  }

  // ------------------------------------------------------------ dark theme
  for (const [theme, label] of [["dark", "1440x900-dark-lesson"], ["dark", "390x844-dark-lesson"]]) {
    const viewport = label.startsWith("390")
      ? { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }
      : { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false };
    await openStudyHub(viewport, theme);
    await openLesson();
    const rendered = await browser.evaluate(`(() => {
      const content = document.querySelector('#studydetail .study-content');
      return {
        modes: document.querySelectorAll('#studydetail .mode-head').length,
        visible: content.getBoundingClientRect().height > 200,
        docWidth: document.documentElement.scrollWidth,
        viewport: innerWidth
      };
    })()`);
    assert.equal(rendered.modes, 5, `${label}: modes missing in dark theme`);
    assert.ok(rendered.visible, `${label}: lesson content not visible in dark theme`);
    assert.ok(rendered.docWidth <= rendered.viewport + 1, `${label}: horizontal overflow in dark theme`);
    await screenshot(label);
    await scrollToModes();
    await screenshot(label.replace("-lesson", "-modes"));
  }

  assertCleanDiagnostics(browser, "study multimodal texts");
  console.table(overflow);
  console.log(`PASS Multimodal Texts lesson: registry, card, search, ${requiredSections.length} sections, 5 modes, ${QUIZ.length} quiz questions, progress, responsive, dark/light`);
} finally {
  await browser.close();
  await server.close();
}
