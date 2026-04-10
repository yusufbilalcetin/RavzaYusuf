const clone = (value) => JSON.parse(JSON.stringify(value));

export const SOURCE_LIBRARY = {
  wordList1A: { title: "1A Word List", file: "1A WORD LIST.docx", kind: "docx" },
  objectPronouns1A: { title: "Object Pronouns", file: "INTER-PLUS GRAMMAR NOTES 1A.docx", kind: "docx" },
  adjectives1B: { title: "Adjectives", file: "1B- GRAMMAR - ADJECTIVES.docx", kind: "docx" },
  presentTenses2A: { title: "Present Tenses", file: "Present Tenses- 2A Interplus.docx", kind: "docx" },
  possessives2B: { title: "Possessives", file: "_POSSESSIVES_- INTERPLUS 2B.docx", kind: "docx" },
  pastTenses3A: { title: "Past Tenses", file: "INTER-plus 3a.docx", kind: "docx" },
  prepositions3B: { title: "Prepositions", file: "GRAMMAR BANK- INTER-PLUS 3B.docx", kind: "docx" },
  futureForms4A: { title: "Future Forms", file: "FUTURE FORMS- 4B INTER-PLUS.docx", kind: "docx" },
  conditionals4B: { title: "First and Second Conditionals", file: "First and Second Conditional-4B GRAMMAR.docx", kind: "docx" },
  workbook1B: { title: "Workbook Vocabulary / Highlighted Words", file: "Vocabulary_List 1B Workbook.pdf", kind: "pdf" },
  photoPack: { title: "Oxford Grammar Bank Photo Pack", file: "WhatsApp Image 2026-04-06 ...", kind: "jpeg" }
};

const BLOCK_DEFAULTS = {
  heading: { text: "New heading", tone: "section" },
  subheading: { text: "New subheading" },
  text: { text: "Write your paragraph here." },
  richText: { html: "<p>Write formatted content here.</p>" },
  list: { title: "Key points", style: "bullet", items: ["Point 1", "Point 2"] },
  table: { title: "Table", headers: ["Column A", "Column B"], rows: [["Value A", "Value B"]] },
  infoBox: { title: "Definition", text: "Add an important explanation." },
  warningBox: { title: "Important note", text: "Add a common mistake or caution." },
  exampleBox: { title: "Examples", examples: ["Example 1", "Example 2"] },
  formulaBox: { title: "Formula", formula: "If + present simple, will + base verb", notes: ["Key note"] },
  comparison: {
    title: "Comparison",
    leftTitle: "Form A",
    rightTitle: "Form B",
    rows: [{ point: "Use", left: "Use A here", right: "Use B here" }]
  },
  qa: { title: "Question and answer", items: [{ q: "Question?", a: "Answer." }] },
  flashcards: { title: "Flashcards", cards: [{ front: "Front", back: "Back" }] },
  image: { title: "Image", url: "", caption: "Add a caption.", alt: "Learning visual" },
  resource: { title: "Resource note", files: ["source.docx"], note: "Use this source while expanding the lesson." },
  sourceQuote: { title: "Source excerpt", sourceLabel: "Source file", excerpt: "Paste a faithful excerpt from the source here." },
  miniQuiz: {
    title: "Mini quiz",
    questions: [{ prompt: "Choose the correct answer.", options: ["A", "B", "C"], answerIndex: 0, explanation: "Explain why." }]
  }
};

export const BLOCK_LIBRARY = [
  { type: "heading", label: "Baslik", icon: "H1" },
  { type: "subheading", label: "Alt baslik", icon: "H2" },
  { type: "text", label: "Duz metin", icon: "Tx" },
  { type: "richText", label: "Zengin metin", icon: "</>" },
  { type: "list", label: "Liste", icon: "Li" },
  { type: "table", label: "Tablo", icon: "Tb" },
  { type: "infoBox", label: "Bilgi kutusu", icon: "i" },
  { type: "warningBox", label: "Uyari kutusu", icon: "!" },
  { type: "exampleBox", label: "Ornek kutusu", icon: "Ex" },
  { type: "formulaBox", label: "Formul kutusu", icon: "=" },
  { type: "comparison", label: "Comparison", icon: "<>" },
  { type: "qa", label: "Soru cevap", icon: "Q&A" },
  { type: "flashcards", label: "Flashcard", icon: "FC" },
  { type: "image", label: "Gorsel", icon: "Img" },
  { type: "resource", label: "Kaynak notu", icon: "Rs" },
  { type: "sourceQuote", label: "Kaynak metni", icon: "Qt" },
  { type: "miniQuiz", label: "Mini test", icon: "?" }
];

const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function createBlock(type, overrides = {}) {
  return {
    id: uid(type),
    type,
    data: { ...clone(BLOCK_DEFAULTS[type] || BLOCK_DEFAULTS.text), ...clone(overrides) }
  };
}

const h = (value) => createBlock("heading", { text: value });
const info = (value, title = "Definition") => createBlock("infoBox", { title, text: value });
const warn = (value, title = "Important note") => createBlock("warningBox", { title, text: value });
const ex = (title, examples) => createBlock("exampleBox", { title, examples });
const formula = (title, expression, notes) => createBlock("formulaBox", { title, formula: expression, notes });
const compare = (title, leftTitle, rightTitle, rows) => createBlock("comparison", { title, leftTitle, rightTitle, rows });
const flash = (title, cards) => createBlock("flashcards", { title, cards });
const quote = (sourceLabel, excerpt, title = "Source excerpt") => createBlock("sourceQuote", { title, sourceLabel, excerpt });
const resource = (files, note, title = "Source note") => createBlock("resource", { title, files, note });
const table = (title, headers, rows) => createBlock("table", { title, headers, rows });
const mini = (questions, title = "Mini quiz") => createBlock("miniQuiz", { title, questions });
const q = (id, prompt, options, answerIndex, explanation, topicTag = "") => ({ id, type: "multiple-choice", prompt, options, answerIndex, explanation, topicTag });

function topic(config) {
  return { status: "draft", ...config };
}

function quiz(config) {
  return { status: "draft", ...config };
}

function exam(config) {
  return { status: "draft", topicIds: config.topicIds || [], manualQuestions: config.manualQuestions || [], ...config };
}

export const DEFAULT_PORTAL_SETTINGS = {
  id: "portal-settings",
  siteTitle: "Ravza EUL Studio",
  logoText: "Ravza",
  logoMark: "EUL",
  topBadge: "Draft-safe study system",
  heroTitle: "Grammar, vocabulary, quiz and exam flow in one live portal",
  heroDescription:
    "Study content is produced in the admin editor as draft first. The student portal only reads the published version, so you can build lessons safely and publish when ready.",
  footerText:
    "Prepared for EUL prep work. Draft and published layers are separated for safe content operations.",
  theme: {
    primary: "#2448ff",
    secondary: "#0f1739",
    accent: "#ff7cb7",
    surface: "#f6f8ff",
    surfaceStrong: "#ffffff",
    line: "rgba(36, 72, 255, 0.12)"
  },
  badges: ["Live editor", "Draft first", "Published only for students", "Grammar + vocabulary + exams"],
  dashboardCards: [
    { id: "card-study", eyebrow: "Study Center", title: "Structured lessons", description: "Block based explanations, tables, flashcards and mini checks.", ctaLabel: "Explore topics", ctaPage: "study" },
    { id: "card-quiz", eyebrow: "Quiz Center", title: "Topic-linked practice", description: "Every quiz belongs to a topic and includes answer explanations.", ctaLabel: "Start quiz", ctaPage: "quiz" },
    { id: "card-exam", eyebrow: "Exam Center", title: "Mini, mid and full exams", description: "Build timed exams manually or from the shared question bank.", ctaLabel: "Open exams", ctaPage: "exam" }
  ],
  quickRecap: [
    { id: "recap-1", title: "Conditionals", text: "First conditional = real future possibility. Second conditional = unreal or imaginary." },
    { id: "recap-2", title: "Future forms", text: "Will for instant decisions and predictions. Going to for plans and evidence." },
    { id: "recap-3", title: "Possessives", text: "Use 's for people, of for many non-living things, and own for emphasis." },
    { id: "recap-4", title: "Object pronouns", text: "Direct object = thing. Indirect object = person who receives the action." }
  ],
  status: "draft"
};

export const COLLECTION_BLUEPRINTS = {
  portal_settings: {
    draft: { id: "draft", siteTitle: "Ravza EUL Studio", status: "draft", createdAt: "serverTimestamp()", updatedAt: "serverTimestamp()", publishedAt: null },
    published: { id: "published", siteTitle: "Ravza EUL Studio", status: "published", createdAt: "serverTimestamp()", updatedAt: "serverTimestamp()", publishedAt: "serverTimestamp()" }
  },
  portal_topics_draft: { id: "topic-2a-present-tenses", slug: "present-tenses", unit: "2A", title: "Present Tenses", category: "Grammar", order: 4, status: "draft", sourceRefs: ["Present Tenses- 2A Interplus.docx"], blocks: [{ id: "heading-x", type: "heading", data: { text: "Present Tenses" } }], createdAt: "serverTimestamp()", updatedAt: "serverTimestamp()", publishedAt: null },
  portal_topics_published: { id: "topic-2a-present-tenses", slug: "present-tenses", status: "published", order: 4, publishedAt: "serverTimestamp()" },
  portal_quizzes_draft: { id: "quiz-present-tenses-core", slug: "present-tenses-core", topicId: "topic-2a-present-tenses", title: "Present Tenses Core Quiz", order: 3, status: "draft", questions: [{ id: "q-1", type: "multiple-choice", prompt: "The train ____ at 6.30 tomorrow morning.", options: ["leave", "leaves", "is leaving"], answerIndex: 1, explanation: "Timetables usually take the present simple." }], createdAt: "serverTimestamp()", updatedAt: "serverTimestamp()", publishedAt: null },
  portal_quizzes_published: { id: "quiz-present-tenses-core", status: "published", publishedAt: "serverTimestamp()" },
  portal_exams_draft: { id: "exam-mini-core-review", slug: "mini-core-review", title: "Mini Core Review", type: "mini", mode: "pool", durationMinutes: 12, questionCount: 8, topicIds: ["topic-1b-adjectives", "topic-2a-present-tenses"], status: "draft", createdAt: "serverTimestamp()", updatedAt: "serverTimestamp()", publishedAt: null },
  portal_exams_published: { id: "exam-mini-core-review", status: "published", publishedAt: "serverTimestamp()" },
  progress: { id: "device_xxxxx", studyCompleted: { "topic-2a-present-tenses": true }, quizAttempts: { "quiz-present-tenses-core": { bestScore: 75, lastScore: 75, completedAt: "ISO string" } }, examAttempts: [{ examId: "exam-mini-core-review", score: 80, total: 10, completedAt: "ISO string" }], updatedAt: "serverTimestamp()" },
  admin_meta: { id: "portal", publishVersion: 2, lastPublishedAt: "serverTimestamp()", lastPublishedSummary: { topics: 10, quizzes: 9, exams: 3 }, draftCounts: { topics: 10, quizzes: 9, exams: 3 }, updatedAt: "serverTimestamp()" },
  assets: { id: "asset-hero-01", title: "Workbook screenshot", type: "image", storagePath: "portal-assets/workbook-01.jpg", createdAt: "serverTimestamp()", updatedAt: "serverTimestamp()" }
};

export const DEFAULT_TOPICS = [
  topic({
    id: "topic-1a-word-list",
    slug: "1a-word-list",
    unit: "1A",
    title: "1A Word List",
    subtitle: "Definition, usage and memory blocks from the source word list",
    category: "Vocabulary",
    level: "Starter",
    estimatedMinutes: 28,
    order: 1,
    sourceRefs: [SOURCE_LIBRARY.wordList1A.file],
    tags: ["vocabulary", "identity", "descriptions"],
    blocks: [
      h("1A Word List"),
      info("This lesson turns the source word list into a study-friendly structure: glossary, flashcards, usage examples and a short mini check."),
      table("Core vocabulary from the source file", ["Word / phrase", "Meaning", "Example"], [
        ["researchers", "people who carry out studies", "Researchers are working on new ways to reduce air pollution."],
        ["evidence", "facts that support an idea", "There is strong evidence that exercise improves mental health."],
        ["survey", "a way to collect information by asking questions", "The teacher did a survey to find out students' favourite books."],
        ["the average", "the typical result after dividing by number of items", "The average score in the exam was 75."],
        ["stand out", "be clearly noticeable", "Her bright dress made her stand out in the crowd."],
        ["maiden name", "a woman's family name before marriage", "She still uses her maiden name at work."]
      ]),
      flash("Fast recall cards", [
        { front: "evidence", back: "facts that support a claim" },
        { front: "survey", back: "questions used to collect information" },
        { front: "stand out", back: "be easy to notice" },
        { front: "initials", back: "the first letters of a person's names" }
      ]),
      ex("How to work with the list", ["Read the word and say the definition aloud.", "Cover the definition and test yourself with the flashcards.", "Write one new sentence for each word you want to keep."]),
      quote(SOURCE_LIBRARY.wordList1A.file, "Researchers are working on new ways to reduce air pollution. There is strong evidence that exercise improves mental health. The company tried to create a new image after the scandal."),
      mini([
        q("mq-word-1", "Which word means facts that support an idea?", ["survey", "evidence", "rank"], 1, "Evidence is used for proof or support."),
        q("mq-word-2", "Which phrase means be very noticeable?", ["stand out", "go about", "feel sorry"], 0, "Stand out means become easy to notice."),
        q("mq-word-3", "Which item refers to the first letters of names?", ["brand name", "initials", "full name"], 1, "Initials are the first letters of a person's names.")
      ]),
      resource([SOURCE_LIBRARY.wordList1A.file], "Use the original word list to extend the table with more entries if needed.")
    ]
  }),
  topic({
    id: "topic-1a-object-pronouns",
    slug: "1a-object-pronouns",
    unit: "1A",
    title: "Object Pronouns",
    subtitle: "Direct objects, indirect objects and word order",
    category: "Grammar",
    level: "Starter",
    estimatedMinutes: 24,
    order: 2,
    sourceRefs: [SOURCE_LIBRARY.objectPronouns1A.file, SOURCE_LIBRARY.photoPack.file],
    tags: ["pronouns", "word-order"],
    blocks: [
      h("Object Pronouns"),
      info("A direct object is usually the thing affected by the action. An indirect object is usually the person who receives the action."),
      table("Object pronoun map", ["Question", "Role", "Pronouns", "Example"], [
        ["What?", "Direct object", "it / them", "I bought a book. I bought it."],
        ["To whom?", "Indirect object", "me / you / him / her / us / them", "They sent him a postcard."],
        ["For whom?", "Indirect object", "me / you / him / her / us / them", "She found them for me."]
      ]),
      formula("Word order", "verb + indirect object + direct object", [
        "Mary gave me some money.",
        "When the direct object is a pronoun, use verb + direct object + to / for + person.",
        "James will lend it to her."
      ]),
      warn("Do not say: I gave them to she. Use object pronouns after to / for: I gave them to her."),
      quote(SOURCE_LIBRARY.objectPronouns1A.file, "Structure 1: verb + indirect object + direct object. Structure 2: verb + direct object + to / for + indirect object. This structure depends on the verb."),
      mini([
        q("mq-obj-1", "Choose the correct sentence.", ["I gave them to she.", "I gave them to her.", "I gave she them."], 1, "After to, use the object pronoun her."),
        q("mq-obj-2", "What is the direct object in 'They sent him a postcard'?", ["him", "postcard", "they"], 1, "The postcard is the thing sent."),
        q("mq-obj-3", "Choose the best pattern.", ["She found for me them.", "She found them for me.", "She for me found them."], 1, "When the direct object is a pronoun, it often comes before for / to.")
      ]),
      resource([SOURCE_LIBRARY.objectPronouns1A.file, SOURCE_LIBRARY.photoPack.file], "The page photos also show highlighted object pronoun transformations and replacement tasks.")
    ]
  }),
  topic({
    id: "topic-1b-adjectives",
    slug: "1b-adjectives",
    unit: "1B",
    title: "Adjectives",
    subtitle: "One / ones, comparatives, superlatives and degree words",
    category: "Grammar",
    level: "Starter",
    estimatedMinutes: 30,
    order: 3,
    sourceRefs: [SOURCE_LIBRARY.adjectives1B.file, SOURCE_LIBRARY.workbook1B.file, SOURCE_LIBRARY.photoPack.file],
    tags: ["adjectives", "comparatives", "superlatives"],
    blocks: [
      h("Adjectives"),
      info("An adjective describes a person, place or thing. With a singular countable noun, we usually need an article: a beautiful girl."),
      compare("One / ones versus repeated nouns", "Use one / ones", "Use the noun again", [
        { point: "Singular", left: "the blue one", right: "the blue pen" },
        { point: "Plural", left: "the red ones", right: "the red books" },
        { point: "Goal", left: "avoid repetition", right: "used if clarity is needed" }
      ]),
      table("Comparative and superlative patterns", ["Adjective", "Comparative", "Superlative"], [
        ["tall", "taller than", "the tallest"],
        ["narrow", "narrower than", "the narrowest"],
        ["boring", "more boring than", "the most boring"],
        ["good", "better than", "the best"],
        ["bad", "worse than", "the worst"]
      ]),
      formula("Small difference or big difference", "a bit + comparative / much + comparative", [
        "Tom is a bit taller than Terry.",
        "iPhones are much more expensive than Redmi."
      ]),
      warn("Do not forget the article with a singular noun. Do not say the most bad. Use the irregular form the worst."),
      mini([
        q("mq-adj-1", "Choose the correct sentence.", ["She's very ambitious person.", "She's a very ambitious person.", "She's a person very ambitious."], 1, "A singular noun needs an article here."),
        q("mq-adj-2", "Complete: Cats are ____ selfish than dogs.", ["much more", "the most", "a bit most"], 0, "We need much more for a big difference."),
        q("mq-adj-3", "Which is correct?", ["the most bad", "the baddest", "the worst"], 2, "Bad has the irregular superlative worst.")
      ]),
      resource([SOURCE_LIBRARY.adjectives1B.file, SOURCE_LIBRARY.workbook1B.file], "Workbook vocabulary can be attached here later as extra adjective lists or collocations.")
    ]
  }),
  topic({
    id: "topic-2a-present-tenses",
    slug: "2a-present-tenses",
    unit: "2A",
    title: "Present Tenses",
    subtitle: "Stative verbs, arrangements and timetables",
    category: "Grammar",
    level: "Elementary",
    estimatedMinutes: 32,
    order: 4,
    sourceRefs: [SOURCE_LIBRARY.presentTenses2A.file, SOURCE_LIBRARY.photoPack.file],
    tags: ["present-simple", "present-continuous", "future-arrangements"],
    blocks: [
      h("Present Tenses"),
      info("Stative verbs describe states, feelings, thoughts or possession. They are not normally used in the present continuous."),
      table("Core contrast", ["Focus", "Preferred form", "Example"], [
        ["Habit / fact", "present simple", "She works in a bank."],
        ["Action happening now", "present continuous", "She is studying now."],
        ["Future arrangement", "present continuous", "I'm meeting my friends tonight."],
        ["Timetable / schedule", "present simple", "The flight departs at 12 o'clock tomorrow."]
      ]),
      compare("Verbs that can change meaning", "State / opinion", "Action / process", [
        { point: "have", left: "I have a car.", right: "I am having lunch." },
        { point: "think", left: "I think it's a good idea.", right: "I am thinking about moving abroad." },
        { point: "see", left: "I see what you mean.", right: "I am seeing the dentist tomorrow." }
      ]),
      warn("Do not use stative verbs in the continuous when they describe a state: I know the answer, not I am knowing the answer."),
      quote(SOURCE_LIBRARY.presentTenses2A.file, "The present continuous is used for future events that have already been arranged. The present simple is more natural when referring to timetables."),
      mini([
        q("mq-pres-1", "The train ____ at 6.30 tomorrow morning.", ["leave", "leaves", "is leaving"], 1, "Timetables generally use the present simple."),
        q("mq-pres-2", "We ____ in an airport hotel tonight.", ["stay", "are staying", "stays"], 1, "An arranged plan uses the present continuous."),
        q("mq-pres-3", "I ____ what you mean.", ["am seeing", "see", "am knowing"], 1, "See here means understand, so the present simple is correct.")
      ])
    ]
  }),
  topic({
    id: "topic-2b-possessives",
    slug: "2b-possessives",
    unit: "2B",
    title: "Possessives",
    subtitle: "Possessive 's, plural possessives, of and own",
    category: "Grammar",
    level: "Elementary",
    estimatedMinutes: 24,
    order: 5,
    sourceRefs: [SOURCE_LIBRARY.possessives2B.file, SOURCE_LIBRARY.photoPack.file],
    tags: ["ownership", "apostrophe"],
    blocks: [
      h("Possessives"),
      table("Four core patterns", ["Pattern", "Use", "Example"], [
        ["'s", "one person or thing", "Lara's backpack is on the chair."],
        ["plural apostrophe", "plural noun ending in s", "The teachers' room is upstairs."],
        ["of", "many non-living things", "The end of the movie was surprising."],
        ["own", "emphasis", "She has her own room."]
      ]),
      compare("Two names", "Shared possession", "Separate possession", [
        { point: "Pattern", left: "Emma and Mia's house", right: "Emma's and Mia's bags" },
        { point: "Meaning", left: "one shared item", right: "two different items" }
      ]),
      warn("If the plural noun already ends in s, add only the apostrophe. For irregular plurals like children and women, add 's."),
      ex("Examples", ["Children's playground is closed today.", "The door of the car was open.", "They started their own company."]),
      quote(SOURCE_LIBRARY.possessives2B.file, "If two people share one thing, add 's to the second name only. If they do not share, add 's to both."),
      mini([
        q("mq-pos-1", "Choose the correct form.", ["the teachers's room", "the teachers' room", "the teacher room"], 1, "Plural nouns ending in s take only the apostrophe."),
        q("mq-pos-2", "Which sentence shows shared possession?", ["Emma's and Mia's flat", "Emma and Mia's flat", "Emma flat and Mia"], 1, "Only the second name takes 's for shared possession."),
        q("mq-pos-3", "Choose the best option for a non-living thing.", ["the car's door", "the door of the car", "the car own door"], 1, "The of structure is common with non-living things.")
      ]),
      resource([SOURCE_LIBRARY.possessives2B.file], "The photo pack also shows grammar-bank exercises with highlighted possessive forms.")
    ]
  }),
  topic({
    id: "topic-3a-past-tenses",
    slug: "3a-past-tenses",
    unit: "3A",
    title: "Past Tenses",
    subtitle: "Past simple, past continuous and used to",
    category: "Grammar",
    level: "Elementary",
    estimatedMinutes: 34,
    order: 6,
    sourceRefs: [SOURCE_LIBRARY.pastTenses3A.file, SOURCE_LIBRARY.photoPack.file],
    tags: ["past-simple", "past-continuous", "used-to"],
    blocks: [
      h("Past Tense Forms"),
      table("Three target structures", ["Structure", "Use", "Example"], [
        ["past simple", "finished past action", "I visited my grandparents last weekend."],
        ["past continuous", "action in progress in the past", "I was reading when the phone rang."],
        ["used to", "past habit or repeated past state", "I used to play the piano."]
      ]),
      formula("Key forms", "did + subject + base verb / was-were + verb-ing / used to + base verb", [
        "Do not say: Did you went to school yesterday?",
        "Say: Did you go to school yesterday?",
        "Negative for used to: didn't use to."
      ]),
      compare("How to choose the correct past form", "Event in progress", "Finished action or habit", [
        { point: "Interrupted action", left: "I was cooking when she called.", right: "She called at 7." },
        { point: "Past habit", left: "We used to visit them.", right: "We visited them yesterday." }
      ]),
      warn("After did, use the base verb. Use used to only for habits or long-term repeated past situations, not very short temporary events."),
      quote(SOURCE_LIBRARY.pastTenses3A.file, "We use the past continuous to describe an action that was interrupted by another action. We use used to for things we did regularly in the past but do not do anymore."),
      mini([
        q("mq-past-1", "Choose the correct question.", ["Did you go to school yesterday?", "Did you went to school yesterday?", "Went you to school yesterday?"], 0, "After did, use the base form go."),
        q("mq-past-2", "Which sentence describes an interrupted action?", ["I visited Rome last year.", "I was reading when the phone rang.", "I used to read in the evening."], 1, "Past continuous plus past simple shows interruption."),
        q("mq-past-3", "Choose the best form for a past habit.", ["I used to walk to school.", "I was walking to school every day.", "I did walked to school."], 0, "Used to is a clean way to talk about a past habit.")
      ])
    ]
  }),
  topic({
    id: "topic-3b-prepositions",
    slug: "3b-prepositions",
    unit: "3B",
    title: "Prepositions",
    subtitle: "Place, movement and dependent prepositions",
    category: "Grammar",
    level: "Elementary",
    estimatedMinutes: 30,
    order: 7,
    sourceRefs: [SOURCE_LIBRARY.prepositions3B.file, SOURCE_LIBRARY.photoPack.file],
    tags: ["prepositions", "movement", "dependent-prepositions"],
    blocks: [
      h("Prepositions"),
      table("Prepositions of place", ["Preposition", "Use", "Example"], [
        ["in", "inside something", "The shoes are in the closet."],
        ["on", "touching a surface", "The laptop is on the table."],
        ["under", "below", "The cat is under the bed."],
        ["next to", "beside", "The school is next to the hospital."],
        ["between", "in the middle of two things", "The sofa is between the two chairs."]
      ]),
      table("Movement and dependent patterns", ["Pattern", "Meaning", "Example"], [
        ["across", "from one side to the other", "She swam across the lake."],
        ["through", "inside an enclosed space", "The car drove through the tunnel."],
        ["towards", "in the direction of", "The child ran towards her mother."],
        ["wait for", "verb + preposition", "She's waiting for the bus."],
        ["good at", "adjective + preposition", "He's good at painting."]
      ]),
      warn("The dog ran towards me means it moved in my direction. The dog ran to me means it reached me. Also remember that some verbs do not take a preposition: discuss, enter, marry."),
      ex("Useful examples", ["We walked along the beach.", "I applied for the job.", "She is interested in science.", "Please check your notes. Not discuss about the notes."]),
      quote(SOURCE_LIBRARY.prepositions3B.file, "Use verb + ing after prepositions: I'm looking forward to seeing you. She believes in working hard. Some verbs do not need prepositions."),
      mini([
        q("mq-prep-1", "Choose the best sentence.", ["She discussed about the problem.", "She discussed the problem.", "She discussed on the problem."], 1, "Discuss does not need a preposition."),
        q("mq-prep-2", "Which preposition means from one side to the other?", ["towards", "across", "into"], 1, "Across is used for crossing a surface or area."),
        q("mq-prep-3", "Complete: He's good ____ painting.", ["in", "on", "at"], 2, "The correct dependent preposition is at.")
      ])
    ]
  }),
  topic({
    id: "topic-4a-future-forms",
    slug: "4a-future-forms",
    unit: "4A",
    title: "Future Forms",
    subtitle: "Will, be going to and present continuous",
    category: "Grammar",
    level: "Pre-intermediate",
    estimatedMinutes: 30,
    order: 8,
    sourceRefs: [SOURCE_LIBRARY.futureForms4A.file, SOURCE_LIBRARY.photoPack.file],
    tags: ["future", "predictions", "arrangements"],
    blocks: [
      h("Future Forms"),
      compare("Which future form should you choose?", "Will", "Be going to / present continuous", [
        { point: "instant decision", left: "I'll call you later.", right: "Not the best default choice." },
        { point: "plan already decided", left: "Possible but weaker", right: "I'm going to start a new course." },
        { point: "arranged appointment", left: "Possible but weaker", right: "I'm meeting my friend at 6 PM." },
        { point: "prediction with visible evidence", left: "general prediction", right: "It's going to rain." }
      ]),
      formula("Core formulas", "will + base verb / am-is-are going to + base verb / am-is-are + verb-ing", [
        "Will is common for promises and instant decisions.",
        "Be going to is common for prior plans and evidence-based predictions.",
        "Present continuous is natural for fixed arrangements."
      ]),
      info("Use was / were going to when you describe a plan that existed in the past but did not happen: I was going to visit my uncle, but he was abroad.", "Future in the past"),
      ex("Examples", ["I think it will rain tomorrow.", "Look at those dark clouds. It's going to rain.", "We're flying to Italy next week."]),
      quote(SOURCE_LIBRARY.futureForms4A.file, "Use will for predictions, future facts, instant decisions, promises, offers and suggestions. Use be going to for plans and predictions with evidence."),
      mini([
        q("mq-fut-1", "Look at those clouds. It ____.", ["will rain", "is raining", "is going to rain"], 2, "Visible evidence usually takes be going to."),
        q("mq-fut-2", "I'm tired. I ____ to bed now.", ["go", "will go", "am going"], 1, "An instant decision often takes will."),
        q("mq-fut-3", "We ____ our grandparents on Friday. It's already arranged.", ["visit", "are visiting", "will visiting"], 1, "A fixed arrangement takes the present continuous.")
      ])
    ]
  }),
  topic({
    id: "topic-4b-conditionals",
    slug: "4b-conditionals",
    unit: "4B",
    title: "First and Second Conditionals",
    subtitle: "Real future possibilities and unreal situations",
    category: "Grammar",
    level: "Pre-intermediate",
    estimatedMinutes: 32,
    order: 9,
    sourceRefs: [SOURCE_LIBRARY.conditionals4B.file, SOURCE_LIBRARY.photoPack.file],
    tags: ["first-conditional", "second-conditional"],
    blocks: [
      h("First and Second Conditionals"),
      table("Main contrast", ["Conditional", "Form", "Meaning", "Example"], [
        ["first", "if + present simple, will + base verb", "real or likely future result", "If I study hard, I will pass the exam."],
        ["second", "if + past simple, would + base verb", "imaginary or unreal situation", "If I won the lottery, I would travel the world."]
      ]),
      formula("Useful extension", "if + past simple, would / could + base verb", [
        "Would talks about the result that would happen.",
        "Could talks about ability or possibility in that imaginary situation.",
        "If I spoke Spanish, I could work in Spain."
      ]),
      warn("Do not use will after if in the condition clause. Use if + present simple in the first conditional. In formal English, If I were you is preferred."),
      compare("Would versus could", "Would", "Could", [
        { point: "focus", left: "likely result in the imaginary case", right: "possible ability or option" },
        { point: "example", left: "If I had more money, I would buy a phone.", right: "If I had more money, I could travel more." }
      ]),
      quote(SOURCE_LIBRARY.conditionals4B.file, "The if part of the second conditional uses the past simple, but it is not about the past. It is about unreal or imagined situations."),
      mini([
        q("mq-cond-1", "Choose the first conditional.", ["If I study, I will pass.", "If I studied, I will pass.", "If I study, I would pass."], 0, "Real future possibility uses first conditional."),
        q("mq-cond-2", "Choose the second conditional.", ["If I won the lottery, I would travel the world.", "If I win the lottery, I would travel the world.", "If I won the lottery, I will travel the world."], 0, "Second conditional uses if + past simple and would."),
        q("mq-cond-3", "Choose the more formal option.", ["If I was you, I wouldn't do that.", "If I were you, I wouldn't do that.", "If I am you, I wouldn't do that."], 1, "Were is preferred in formal English.")
      ])
    ]
  }),
  topic({
    id: "topic-workbook-highlighted-words",
    slug: "workbook-highlighted-words",
    unit: "Workbook",
    title: "Workbook Vocabulary and Highlighted Words",
    subtitle: "High-frequency phrases and highlighted forms worth revising",
    category: "Vocabulary",
    level: "Mixed",
    estimatedMinutes: 22,
    order: 10,
    sourceRefs: [SOURCE_LIBRARY.workbook1B.file, SOURCE_LIBRARY.photoPack.file],
    tags: ["revision", "highlighted-forms", "workbook"],
    blocks: [
      h("Workbook Vocabulary and Highlighted Words"),
      info("This revision set collects highlighted forms and reusable phrases seen across the provided workbook and photo pack."),
      table("Highlighted forms to recycle", ["Form", "Why it matters", "Example"], [
        ["gave you that pen", "object pronoun shift", "I gave you that pen for your birthday."],
        ["They sent me a new password", "indirect object order", "They sent me a new password yesterday."],
        ["much more expensive", "large difference with comparative", "This laptop is much more expensive than mine."],
        ["used to", "past habit", "I used to walk to school."],
        ["look forward to", "verb + preposition pattern", "I look forward to seeing you."],
        ["If I were you", "formal second conditional advice", "If I were you, I would revise every day."]
      ]),
      flash("Fast review cards", [
        { front: "look forward to", back: "followed by verb + ing" },
        { front: "much more", back: "large difference in a comparison" },
        { front: "used to", back: "past habit that no longer happens" },
        { front: "If I were you", back: "formal advice with second conditional" }
      ]),
      warn("Highlighted items are useful because they often point to structures students misuse in exams: object pronouns, degree words, prepositions and conditionals."),
      quote(`${SOURCE_LIBRARY.workbook1B.file} + ${SOURCE_LIBRARY.photoPack.file}`, "The highlighted material across the pages includes object pronoun replacements, comparative forms, future choices and conditional frames."),
      mini([
        q("mq-work-1", "Complete: I look forward to ____ you.", ["see", "seeing", "saw"], 1, "After to in this phrase, use the -ing form."),
        q("mq-work-2", "Choose the best advice sentence.", ["If I was you, I revise more.", "If I were you, I would revise more.", "If I were you, I will revise more."], 1, "Formal advice uses If I were you, I would..."),
        q("mq-work-3", "Choose the correct comparison.", ["much more expensive", "much expensiver", "the more expensive"], 0, "Use much more + adjective for a big difference with longer adjectives.")
      ]),
      resource([SOURCE_LIBRARY.workbook1B.file, SOURCE_LIBRARY.photoPack.file], "Add exact workbook pages or storage links later if you upload the media into Firebase Storage.")
    ]
  })
];

export const DEFAULT_QUIZZES = [
  quiz({
    id: "quiz-1a-word-list-core",
    slug: "1a-word-list-core",
    topicId: "topic-1a-word-list",
    title: "1A Word List Core Quiz",
    description: "Meaning and context check for the first vocabulary pack.",
    order: 1,
    questionTime: 35,
    questions: [
      q("q-word-1", "Which word means facts that support an idea?", ["evidence", "survey", "scale"], 0, "Evidence supports a claim or opinion.", "vocabulary"),
      q("q-word-2", "Which phrase means be very noticeable?", ["feel sorry", "stand out", "go about"], 1, "Stand out means become easy to notice.", "vocabulary"),
      q("q-word-3", "Which item refers to a woman's family name before marriage?", ["initials", "maiden name", "brand name"], 1, "Maiden name is the family name before marriage.", "vocabulary")
    ]
  }),
  quiz({
    id: "quiz-1a-object-pronouns",
    slug: "1a-object-pronouns",
    topicId: "topic-1a-object-pronouns",
    title: "Object Pronouns Quiz",
    description: "Direct object, indirect object and correct pronoun order.",
    order: 2,
    questionTime: 40,
    questions: [
      q("q-obj-1", "Choose the correct sentence.", ["I gave them to her.", "I gave them to she.", "I gave her to them."], 0, "After to, use an object pronoun.", "pronouns"),
      q("q-obj-2", "What is the direct object in 'She sent him a message'?", ["him", "message", "she"], 1, "Message is the thing sent.", "pronouns"),
      q("q-obj-3", "Choose the best option.", ["James will lend it to her.", "James will lend her it.", "James will lend to her it."], 0, "With a pronoun direct object, use it before to / for.", "pronouns")
    ]
  }),
  quiz({
    id: "quiz-1b-adjectives",
    slug: "1b-adjectives",
    topicId: "topic-1b-adjectives",
    title: "Adjectives Quiz",
    description: "Articles, one / ones and comparison forms.",
    order: 3,
    questionTime: 45,
    questions: [
      q("q-adj-1", "Choose the correct sentence.", ["She's a very ambitious person.", "She's very ambitious person.", "She's a person very ambitious."], 0, "A singular noun needs an article.", "adjectives"),
      q("q-adj-2", "Which sentence avoids repetition correctly?", ["I want the blue pen. The blue pen.", "I want the blue one.", "I want the blue ones."], 1, "One replaces a singular countable noun.", "adjectives"),
      q("q-adj-3", "Choose the correct superlative of bad.", ["the baddest", "the worst", "the most bad"], 1, "Bad becomes worst in the superlative.", "adjectives")
    ]
  }),
  quiz({
    id: "quiz-2a-present-tenses",
    slug: "2a-present-tenses",
    topicId: "topic-2a-present-tenses",
    title: "Present Tenses Quiz",
    description: "Stative verbs, arrangements and timetables.",
    order: 4,
    questionTime: 45,
    questions: [
      q("q-pres-1", "The train ____ at 6.30 tomorrow morning.", ["leave", "leaves", "is leaving"], 1, "Timetables usually use the present simple.", "present-tenses"),
      q("q-pres-2", "We ____ our cousins tonight. The plan is fixed.", ["see", "are seeing", "seeing"], 1, "An arrangement uses the present continuous.", "present-tenses"),
      q("q-pres-3", "Choose the correct sentence.", ["I am knowing the answer.", "I know the answer.", "I knowing the answer."], 1, "Know is a stative verb here.", "present-tenses")
    ]
  }),
  quiz({
    id: "quiz-2b-possessives",
    slug: "2b-possessives",
    topicId: "topic-2b-possessives",
    title: "Possessives Quiz",
    description: "Apostrophes, shared possession and own.",
    order: 5,
    questionTime: 40,
    questions: [
      q("q-pos-1", "Choose the correct form.", ["the teachers' room", "the teachers's room", "the teacher room"], 0, "Plural nouns ending in s take only the apostrophe.", "possessives"),
      q("q-pos-2", "Choose the shared possession form.", ["Emma and Mia's house", "Emma's and Mia's house", "Emma house Mia"], 0, "Only the second name takes 's for a shared item.", "possessives"),
      q("q-pos-3", "Which option emphasizes possession?", ["their own company", "their of company", "them company"], 0, "Own adds emphasis to possession.", "possessives")
    ]
  }),
  quiz({
    id: "quiz-3a-past-tenses",
    slug: "3a-past-tenses",
    topicId: "topic-3a-past-tenses",
    title: "Past Tenses Quiz",
    description: "Past simple, past continuous and used to.",
    order: 6,
    questionTime: 45,
    questions: [
      q("q-past-1", "Choose the correct question.", ["Did you go to school yesterday?", "Did you went to school yesterday?", "Went you to school yesterday?"], 0, "After did, use the base form go.", "past-tenses"),
      q("q-past-2", "Which sentence shows an interrupted action?", ["I visited Rome last year.", "I was reading when the phone rang.", "I used to read every evening."], 1, "Past continuous plus past simple shows interruption.", "past-tenses"),
      q("q-past-3", "Which sentence shows a past habit?", ["I was walking to school every day.", "I used to walk to school.", "I walked now."], 1, "Used to expresses a habit in the past.", "past-tenses")
    ]
  }),
  quiz({
    id: "quiz-3b-prepositions",
    slug: "3b-prepositions",
    topicId: "topic-3b-prepositions",
    title: "Prepositions Quiz",
    description: "Place, movement and dependent prepositions.",
    order: 7,
    questionTime: 40,
    questions: [
      q("q-prep-1", "Complete: The cat is ____ the bed.", ["under", "towards", "along"], 0, "Under shows position below something.", "prepositions"),
      q("q-prep-2", "Which sentence is correct?", ["We discussed about the plan.", "We discussed the plan.", "We discussed on the plan."], 1, "Discuss does not need a preposition.", "prepositions"),
      q("q-prep-3", "Complete: She is interested ____ science.", ["in", "on", "at"], 0, "Interested in is the correct dependent preposition.", "prepositions")
    ]
  }),
  quiz({
    id: "quiz-4a-future-forms",
    slug: "4a-future-forms",
    topicId: "topic-4a-future-forms",
    title: "Future Forms Quiz",
    description: "Will, going to and present continuous.",
    order: 8,
    questionTime: 45,
    questions: [
      q("q-fut-1", "Look at those clouds. It ____.", ["will rain", "is going to rain", "rains"], 1, "Visible evidence suggests be going to.", "future-forms"),
      q("q-fut-2", "I'm thirsty. I ____ some water.", ["will get", "am getting", "get"], 0, "An instant decision often takes will.", "future-forms"),
      q("q-fut-3", "We ____ the dentist on Friday. It's arranged.", ["see", "are seeing", "will see"], 1, "A fixed arrangement uses the present continuous.", "future-forms")
    ]
  }),
  quiz({
    id: "quiz-4b-conditionals",
    slug: "4b-conditionals",
    topicId: "topic-4b-conditionals",
    title: "Conditionals Quiz",
    description: "First conditional, second conditional and would / could.",
    order: 9,
    questionTime: 45,
    questions: [
      q("q-cond-1", "Choose the first conditional.", ["If I study, I will pass.", "If I studied, I will pass.", "If I study, I would pass."], 0, "Real future possibility uses first conditional.", "conditionals"),
      q("q-cond-2", "Choose the second conditional.", ["If I won the lottery, I would travel.", "If I win the lottery, I would travel.", "If I won the lottery, I will travel."], 0, "Second conditional uses if + past simple and would.", "conditionals"),
      q("q-cond-3", "Choose the more formal advice sentence.", ["If I was you, I wouldn't do that.", "If I were you, I wouldn't do that.", "If I am you, I wouldn't do that."], 1, "Were is preferred in formal English.", "conditionals")
    ]
  }),
  quiz({
    id: "quiz-workbook-highlighted-words",
    slug: "workbook-highlighted-words",
    topicId: "topic-workbook-highlighted-words",
    title: "Workbook Highlighted Review Quiz",
    description: "Highlighted forms, reusable phrases and workbook revision points.",
    order: 10,
    questionTime: 40,
    questions: [
      q("q-work-1", "Complete: I look forward to ____ you.", ["see", "seeing", "saw"], 1, "After look forward to, use the -ing form.", "workbook"),
      q("q-work-2", "Choose the best advice sentence.", ["If I was you, I would revise more.", "If I were you, I would revise more.", "If I am you, I will revise more."], 1, "The formal pattern is If I were you, I would...", "workbook"),
      q("q-work-3", "Choose the correct comparison.", ["much more expensive", "much expensiver", "the more expensive"], 0, "Use much more + adjective for a big difference with a longer adjective.", "workbook")
    ]
  })
];

export const DEFAULT_EXAMS = [
  exam({
    id: "exam-mini-foundation-check",
    slug: "mini-foundation-check",
    title: "Mini Foundation Check",
    description: "Short review for the first core units.",
    type: "mini",
    mode: "pool",
    durationMinutes: 12,
    questionCount: 8,
    topicIds: ["topic-1a-word-list", "topic-1a-object-pronouns", "topic-1b-adjectives", "topic-2a-present-tenses"],
    order: 1
  }),
  exam({
    id: "exam-mid-grammar-review",
    slug: "mid-grammar-review",
    title: "Mid Grammar Review",
    description: "Mixed grammar paper built from the shared quiz pool.",
    type: "mid",
    mode: "pool",
    durationMinutes: 20,
    questionCount: 14,
    topicIds: ["topic-1b-adjectives", "topic-2a-present-tenses", "topic-2b-possessives", "topic-3a-past-tenses", "topic-3b-prepositions", "topic-4a-future-forms", "topic-4b-conditionals"],
    order: 2
  }),
  exam({
    id: "exam-full-eul-mock",
    slug: "full-eul-mock",
    title: "Full EUL Mock",
    description: "Longer practice exam with mixed topics, timing and analysis.",
    type: "full",
    mode: "pool",
    durationMinutes: 35,
    questionCount: 24,
    topicIds: DEFAULT_TOPICS.map((item) => item.id),
    order: 3
  })
];

export function createSeedBundle() {
  return {
    settings: clone(DEFAULT_PORTAL_SETTINGS),
    topics: clone(DEFAULT_TOPICS),
    quizzes: clone(DEFAULT_QUIZZES),
    exams: clone(DEFAULT_EXAMS),
    meta: {
      id: "portal",
      publishVersion: 0,
      lastPublishedAt: null,
      lastPublishedSummary: { topics: 0, quizzes: 0, exams: 0 },
      draftCounts: { topics: DEFAULT_TOPICS.length, quizzes: DEFAULT_QUIZZES.length, exams: DEFAULT_EXAMS.length }
    }
  };
}

export function getBlockTemplate(type) {
  return createBlock(type);
}
