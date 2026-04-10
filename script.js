import { db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const TOPICS = [
  {
    id: "wordlist1a",
    unit: "Unit 1A",
    title: "Kelime Listesi",
    subtitle: "Tanım + örnek cümle + kullanım odağı",
    time: 30,
    difficulty: "easy",
    summaryHtml: `
<div class="content-card">
  <h3>Kaynaktan birebir kelime listesi</h3>
  <p>Bu bölüm doğrudan verdiğin <strong>1A Word List</strong> kaynağından sayfaya taşındı. Aşağıdaki tablo kelime, definition ve example sentence bölümlerini içerir.</p>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Word/Phrase</th><th>Definition</th><th>Example Sentence</th></tr></thead><tbody><tr><td>Researchers</td><td>People who carry out studies to gain knowledge or discover information</td><td>Researchers are working on new ways to reduce air pollution.</td></tr><tr><td>Evidence</td><td>Information or facts used to support an idea or claim</td><td>There is strong evidence that exercise improves mental health.</td></tr><tr><td>Survey</td><td>A method of collecting information by asking people questions</td><td>The teacher did a survey to find out students’ favourite books.</td></tr><tr><td>The average</td><td>A typical value calculated by dividing the total by the number of items</td><td>The average score in the exam was 75.</td></tr><tr><td>Scale</td><td>A system used to measure or compare levels of something</td><td>The pain is measured on a scale from 1 to 10.</td></tr><tr><td>Rank</td><td>To arrange items or people in order based on quality or importance</td><td>Students were ranked according to their test results.</td></tr><tr><td>Likely</td><td>Something that has a high chance of happening</td><td>It is likely that it will rain tomorrow.</td></tr><tr><td>Overall</td><td>Considering everything; in general</td><td>Overall, the project was a success.</td></tr><tr><td>Beyond</td><td>Outside the limits of something or more than expected</td><td>His kindness goes beyond what we imagined.</td></tr><tr><td>Create a new image</td><td>To change how others see or think about you</td><td>The company tried to create a new image after the scandal.</td></tr><tr><td>Go about</td><td>To begin or deal with something in a particular way</td><td>How should we go about solving this problem?</td></tr><tr><td>Proof</td><td>Clear information that confirms something is true</td><td>She showed proof of her identity at the airport.</td></tr><tr><td>Seek to</td><td>To try or attempt to achieve something</td><td>The organization seeks to help poor communities.</td></tr><tr><td>Stand out</td><td>To be noticeable or different from others</td><td>Her bright dress made her stand out in the crowd.</td></tr><tr><td>Solicitor</td><td>A lawyer who gives legal advice and prepares documents</td><td>He contacted a solicitor for help with his contract.</td></tr><tr><td>For fun</td><td>Done for enjoyment, not for a serious purpose</td><td>She paints for fun in her free time.</td></tr><tr><td>Birth certificate</td><td>An official document that records a person’s birth details</td><td>You need a birth certificate to apply for a passport.</td></tr><tr><td>Feel sorry</td><td>To feel pity or sadness for someone</td><td>I feel sorry for him because he lost his job.</td></tr><tr><td>Maiden name</td><td>A woman’s family name before marriage</td><td>She still uses her maiden name at work.</td></tr><tr><td>Full name</td><td>A person’s complete name including all given names and surname</td><td>Please write your full name on the form.</td></tr><tr><td>Nickname</td><td>An informal name used instead of someone’s real name</td><td>His nickname at school was “Ace.”</td></tr><tr><td>Be named after</td><td>To be given the same name as another person</td><td>She was named after her grandmother.</td></tr><tr><td>Initials</td><td>The first letters of a person’s names</td><td>His initials are A.K.</td></tr><tr><td>Brand name</td><td>The official name used by a company for its product</td><td>This brand name is known worldwide.</td></tr><tr><td>Common</td><td>Frequently seen or used by many people</td><td>It’s common to see tourists in this area.</td></tr><tr><td>Old-fashioned</td><td>Not modern; belonging to an earlier time</td><td>That style of clothing looks old-fashioned now.</td></tr><tr><td>Celebrity</td><td>A well-known public figure</td><td>The restaurant is popular with celebrities.</td></tr><tr><td>Suit (verb)</td><td>To look good on someone or be appropriate for them</td><td>That colour really suits you.</td></tr></tbody></table></div>
</div>
<div class="content-card">
  <h3>Nasıl çalışılmalı?</h3>
  <ul>
    <li>Önce kelimeyi ve definition kısmını oku.</li>
    <li>Sonra example sentence kısmını sesli tekrar et.</li>
    <li>Her kelime için kendin bir yeni örnek cümle kur.</li>
  </ul>
</div>
`,
    keyPoints: [
      "Researchers, evidence, survey, the average ve scale temel akademik kelimelerdir.",
      "Stand out, nickname, maiden name ve initials gibi kelimeler sınav metinlerinde çıkabilir.",
      "Definition ile example sentence birlikte çalışıldığında kelime daha kalıcı olur."
    ],
    quiz: [
      {
        question: '"There is strong ___ that exercise improves mental health."',
        options: ["survey", "evidence", "proof"],
        answer: 1,
        explanation: "Evidence, bir iddiayı destekleyen kanıt anlamında kullanılır."
      },
      {
        question: '"Her bright dress made her ___ in the crowd."',
        options: ["stand out", "go about", "feel sorry"],
        answer: 0,
        explanation: "Stand out, kalabalık içinde dikkat çekmek anlamındadır."
      },
      {
        question: '"The teacher did a ___ to find out students\' favourite books."',
        options: ["survey", "celebrity", "proof"],
        answer: 0,
        explanation: "Survey, bilgi toplamak için yapılan anket demektir."
      }
    ]
  },
  {
    id: "objectpronouns",
    unit: "Unit 1A",
    title: "Object Pronouns",
    subtitle: "Direct object + indirect object + word order",
    time: 28,
    difficulty: "easy",
    summaryHtml: `
<div class="content-card">
  <h3>Direct object and indirect object</h3>
  <p><strong>Direct object</strong> is usually the thing affected by the action. It answers <em>what?</em></p>
  <p><strong>Indirect object</strong> is usually the person who receives the action. It answers <em>to whom?</em> or <em>for whom?</em></p>
  <div class="source-panel">
    <p>David repaired his car. -> What did he repair? -> his car</p>
    <p>They sent him a postcard. -> To whom? -> him</p>
  </div>
</div>
<div class="content-card">
  <h3>Object pronouns</h3>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Role</th><th>Pronouns</th><th>Example</th></tr></thead><tbody><tr><td>Direct object</td><td>it / them</td><td>I bought a book -> I bought it.</td></tr><tr><td>Indirect object</td><td>me / you / him / her / us / them</td><td>She sent them to us.</td></tr></tbody></table></div>
  <div class="warning-box">
    <p><strong>Wrong:</strong> I gave them to she.</p>
    <p><strong>Correct:</strong> I gave them to her.</p>
  </div>
</div>
<div class="content-card">
  <h3>Sentence structure</h3>
  <ul>
    <li><strong>verb + indirect object + direct object</strong>: Mary gave me some money.</li>
    <li><strong>verb + direct object + to / for + indirect object</strong>: James will lend it to her.</li>
    <li>This choice depends on the verb and on whether the direct object is a noun or a pronoun.</li>
  </ul>
</div>
`,
    keyPoints: [
      "Direct object usually answers what; indirect object usually answers to whom / for whom.",
      "After a preposition such as to or for, use object pronouns: to her, for us.",
      "Word order changes more often when the direct object is a pronoun."
    ],
    quiz: [
      {
        question: "What is the direct object in 'They sent him a postcard'?",
        options: ["him", "postcard", "they"],
        answer: 1,
        explanation: "The postcard is the thing that was sent, so it is the direct object."
      },
      {
        question: "Choose the correct sentence.",
        options: ["She found for me them.", "She found them for me.", "She found me them for."],
        answer: 1,
        explanation: "When the direct object is a pronoun, the pattern them for me is natural."
      },
      {
        question: "Which answer is correct?",
        options: ["I bought it for him.", "I bought for him it.", "I bought him for it."],
        answer: 0,
        explanation: "The object pronoun it comes before for + person in this structure."
      }
    ]
  },
  {
    id: "adjectives",
    unit: "Unit 1B",
    title: "Adjectives",
    subtitle: "One / ones · comparatives · superlatives · a bit / much",
    time: 36,
    difficulty: "easy",
    summaryHtml: `
<div class="content-card">
  <h3>What is an adjective?</h3>
  <p><strong>An adjective is a word that we use to describe places, people, or things.</strong></p>
  <p>Tom has a big house. (how is this house?) It’s a big house.</p>
  <div class="warning-box">
    <p><strong>When we use an adjective with a noun, please add an article (a/an).</strong></p>
    <p>Suzan is beautiful girl. = WRONG</p>
    <p>Suzan is a beautiful girl. = CORRECT</p>
  </div>
</div>
<div class="content-card">
  <h3>Adjective + noun / adjective without noun</h3>
  <p>We can also use an adjective without a noun.</p>
  <p><em>Suzan is beautiful. = CORRECT</em></p>
  <p>The intermediate-plus book covers 3 things about adjectives:</p>
  <ul>
    <li>Adjective + one/ones</li>
    <li>Comparative / Superlatives</li>
    <li>A bit and much + comparative adjectives</li>
  </ul>
</div>
<div class="content-card">
  <h3>Adjective + one / ones</h3>
  <p>We use one/ones with singular and plural countable nouns so we don’t repeat what we are saying or writing.</p>
  <div class="source-panel">
    <p><strong>A:</strong> Can you give me that pen, please?</p>
    <p><strong>B:</strong> Yes. Which one?</p>
    <p><strong>A:</strong> The blue one, please.</p>
  </div>
  <div class="source-panel">
    <p><strong>A:</strong> Can I have the books over there, please?</p>
    <p><strong>B:</strong> Yes…but… which ones?</p>
    <p><strong>A:</strong> The red ones.</p>
  </div>
</div>
<div class="content-card">
  <h3>Comparative and superlative adjectives</h3>
  <p>Use comparative to compare two things, people or places.</p>
  <p>Use superlatives to say what is the “least” or “most” of something/someone in a place or group.</p>
  <div class="info-box">
    <p><strong>To make comparative adjectives:</strong> -r, -er and -ier + than (for one syllable adjectives)</p>
    <p>Turkey is colder than Cyprus in the winter.</p>
  </div>
  <p><strong>With one-syllable adjectives that end in “-ed” in comparatives, we use more:</strong></p>
  <ul>
    <li>more bored</li>
    <li>more pleased</li>
    <li>more shocked</li>
    <li>more stressed</li>
    <li>more tired</li>
  </ul>
  <p><strong>For more than one syllable adjectives we use:</strong> more + adjective + than</p>
  <p>The weather is more boring than it was yesterday.</p>
  <p>The book is more expensive than the pen.</p>
  <p><strong>Superlatives:</strong> for one syllable adjectives → the tallest, for more than one syllable adjectives → the most beautiful.</p>
</div>
<div class="content-card">
  <h3>A bit and much + comparative adjectives</h3>
  <p>Use <strong>a bit + comparative adjective</strong> to say that there is a small difference between two things/people/places.</p>
  <p><em>Tom is a bit taller than Terry.</em></p>
  <p>Use <strong>much + comparative adjective</strong> to say that there is a large difference.</p>
  <p><em>iPhones are much more expensive than Redmi.</em></p>
  <p><em>The exam was much easier than it was last year.</em></p>
</div>
`,
    keyPoints: [
      "Adjective + singular noun kullanıldığında a/an gerekir.",
      "Singular countable noun için one, plural countable noun için ones kullanılır.",
      "a bit küçük farkı, much büyük farkı anlatır."
    ],
    quiz: [
      {
        question: "Doğru cümleyi seç.",
        options: ["She's a person very ambitious.", "She's a very ambitious person.", "She's very ambitious person."],
        answer: 1,
        explanation: "Adjective ismin önüne gelir ve tekil isimde article gerekir."
      },
      {
        question: '"That\'s the ___ film I\'ve ever seen." (bad)',
        options: ["most bad", "worst", "baddest"],
        answer: 1,
        explanation: "Bad kelimesinin düzensiz superlative formu worst'tür."
      },
      {
        question: '"Cats are ___ selfish than dogs." (büyük fark)',
        options: ["a bit more", "much more", "the most"],
        answer: 1,
        explanation: "Büyük fark için much more kullanılır."
      }
    ]
  },
  {
    id: "presenttenses",
    unit: "Unit 2A",
    title: "Present Tenses",
    subtitle: "Stative verbs · future arrangements · timetables",
    time: 34,
    difficulty: "medium",
    summaryHtml: `
<div class="content-card">
  <h3>Action vs. Non-Action (Stative) Verbs</h3>
  <p><strong>These verbs describe states, feelings, thoughts, or possession. They are not normally used in the Present Continuous. We use the Present Simple instead.</strong></p>
  <p><strong>Common stative verbs include:</strong></p>
  <div class="keypoint-list">
    <div class="keypoint-item">agree · be · believe · belong · depend (on) · forget · hate · hear</div>
    <div class="keypoint-item">know · like · look like · love · matter · mean · need · prefer</div>
    <div class="keypoint-item">realize · recognize · remember · seem · suppose · want</div>
  </div>
</div>
<div class="content-card">
  <h3>Some verbs can be both action and stative</h3>
  <p>Some verbs can be both action and stative, depending on the context. Their meaning changes based on how they are used.</p>
  <div class="source-panel">
    <p><strong>have</strong>: I have a car. → State of possession – Present Simple</p>
    <p><strong>have</strong>: I am having lunch. → An action – Present Continuous</p>
    <p><strong>think</strong>: I think it’s a good idea. → Opinion – Present Simple</p>
    <p><strong>think</strong>: I am thinking about moving abroad. → Process of thinking – Present Continuous</p>
    <p><strong>see</strong>: I see what you mean. → Understanding – Present Simple</p>
    <p><strong>see</strong>: I am seeing the dentist tomorrow. → Planned appointment – Present Continuous</p>
  </div>
</div>
<div class="content-card">
  <h3>Present Continuous for Future Arrangements</h3>
  <p>We use the Present Continuous to talk about future events that have already been arranged or planned.</p>
  <p>We’re flying to Istanbul this weekend.</p>
  <p>I’m meeting my friends for dinner tonight.</p>
</div>
<div class="content-card">
  <h3>Present Simple for Timetabled Events</h3>
  <p>The Present Simple is used to talk about future events that are on a schedule or timetable, such as transportation or programs.</p>
  <p>The flight departs at 12 o’clock tomorrow.</p>
  <p>What time does Jane arrive in London?</p>
</div>
`,
    keyPoints: [
      "Stative verbs normalde Present Continuous ile kullanılmaz.",
      "have / think / see fiilleri anlamına göre stative veya action olabilir.",
      "Arranged future için Present Continuous, timetable future için Present Simple kullanılır."
    ],
    quiz: [
      {
        question: 'The flight ________ at 6.50 in the morning.',
        options: ["leaves", "is leaving", "leave"],
        answer: 0,
        explanation: "Timetable olduğu için Present Simple daha uygundur."
      },
      {
        question: 'We ________ in an airport hotel tonight.',
        options: ["stay", "are staying", "stays"],
        answer: 1,
        explanation: "Önceden ayarlanmış planlarda Present Continuous kullanılır."
      },
      {
        question: 'I ________ of going on a safari next year.',
        options: ["think", "am thinking", "thinking"],
        answer: 1,
        explanation: "Burada düşünme süreci anlatıldığı için continuous uygundur."
      }
    ]
  },
  {
    id: "possessives",
    unit: "Unit 2B",
    title: "Possessives",
    subtitle: "'s · plural possessives · two names · of · own",
    time: 28,
    difficulty: "easy",
    summaryHtml: `
<div class="content-card">
  <h3>Possessive 's</h3>
  <p>We use <strong>('s)</strong> to show that something belongs to someone.</p>
  <ul>
    <li>Lara’s backpack is on the chair.</li>
    <li>This is Tom’s car.</li>
  </ul>
</div>
<div class="content-card">
  <h3>Plural possessives</h3>
  <p>When the noun is plural and ends with <strong>s</strong>, just add an apostrophe (’).</p>
  <ul>
    <li>The teachers’ room is upstairs.</li>
  </ul>
  <p>Irregular plurals that don’t end in s use <strong>'s</strong>.</p>
  <ul>
    <li>Children’s playground is closed today.</li>
    <li>Women’s voices were heard outside.</li>
  </ul>
</div>
<div class="content-card">
  <h3>Two names</h3>
  <p>If two people share one thing, add ’s to the second name only.</p>
  <p><em>Emma and Mia’s house is very modern.</em></p>
  <p>If they don’t share, add ’s to both:</p>
  <p><em>Emma’s and Mia’s bags are different.</em></p>
</div>
<div class="content-card">
  <h3>Of structure and own</h3>
  <p>We use <strong>of</strong> for non-living things.</p>
  <ul>
    <li>The door of the car was open.</li>
    <li>The end of the movie was surprising.</li>
  </ul>
  <p>Use <strong>own</strong> to emphasize possession.</p>
  <ul>
    <li>She has her own room.</li>
    <li>They started their own company.</li>
  </ul>
</div>
`,
    keyPoints: [
      "Plural noun -s ile bitiyorsa sadece apostrophe eklenir: teachers'.",
      "Shared item varsa sadece ikinci isme 's gelir.",
      "Non-living things için of yapısı kullanılabilir."
    ],
    quiz: [
      {
        question: 'What\'s ________ where Suzy works?',
        options: ["the name of the shop", "the shop's name", "shop of the name"],
        answer: 0,
        explanation: "Cansız yapı için of kullanımı daha uygundur."
      },
      {
        question: "That's ________ over there.",
        options: ["the car of my friend", "my friend's car", "my friend car"],
        answer: 1,
        explanation: "Kişi sahipliğinde possessive 's daha doğaldır."
      },
      {
        question: '________ names are Peter and Michael.',
        options: ["My brother's", "My brothers'", "My brothers"],
        answer: 1,
        explanation: "İki erkek kardeş olduğundan plural possessive gerekir."
      }
    ]
  },
  {
    id: "pasttenses",
    unit: "Unit 3A",
    title: "Past Tenses & Used To",
    subtitle: "Past Simple · Past Continuous · Used to",
    time: 34,
    difficulty: "medium",
    summaryHtml: `
<div class="content-card">
  <h3>Past Simple</h3>
  <p>We use the past simple to talk about finished actions that happened in the past.</p>
  <div class="source-panel">
    <p><strong>Form:</strong> Subject Pronoun + was/were + adjective/noun</p>
    <p><strong>Form:</strong> Subject Pronoun + Verb 2 (regular or irregular)</p>
    <p>She was tired after the long trip.</p>
    <p>They were at the museum yesterday.</p>
    <p>I visited my grandparents last weekend.</p>
    <p>He wrote a fantastic story when he was younger.</p>
  </div>
  <div class="warning-box">
    <p><strong>NOTE:</strong> We do NOT use Verb 2 in questions or negatives!</p>
    <p>Not correct: Did you went to school yesterday?</p>
    <p>Correct: Did you go to school yesterday?</p>
  </div>
</div>
<div class="content-card">
  <h3>Past Continuous</h3>
  <p>We use the past continuous to describe an action that was interrupted by another action or an action that was happening at a specific time in the past.</p>
  <p><strong>Form:</strong> Subject Pronoun + was/were + verb-ing</p>
  <ul>
    <li>I was reading a book when the phone rang.</li>
    <li>She was cooking dinner at 6 PM.</li>
    <li>They were playing football while it started raining.</li>
    <li>What were you doing at 10 o’clock last night?</li>
  </ul>
</div>
<div class="content-card">
  <h3>Used to</h3>
  <p>We use <strong>used to</strong> to talk about things we did regularly in the past but don’t do anymore.</p>
  <ul>
    <li>Positive: Subject + used to + verb 1</li>
    <li>Negative: Subject + didn’t use to + verb 1</li>
    <li>Question: Did + subject + use to + verb 1</li>
  </ul>
  <div class="warning-box">
    <p>Don't use “used to” for short-term past events.</p>
    <p>Incorrect: I used to live in Italy (for only two months).</p>
    <p>Correct: I lived in Italy for two months.</p>
  </div>
  <p>We can also use an adverb of frequency + Verb 2 instead of used to:</p>
  <ul>
    <li>Tom often walked to school.</li>
    <li>I never liked broccoli, but now I love it.</li>
    <li>We sometimes visited our cousins on weekends.</li>
  </ul>
</div>
`,
    keyPoints: [
      "Soru ve olumsuzda Verb 2 kullanılmaz.",
      "Past Continuous geçmişte devam eden veya bölünen eylemler için kullanılır.",
      "didn't use to doğru formdur; kısa süreli geçmiş olaylarda used to kullanılmaz."
    ],
    quiz: [
      {
        question: 'Where did you ________ on holiday when you were young?',
        options: ["use to go", "used to go", "goes"],
        answer: 0,
        explanation: "Did ile birlikte fiil yalın formda gelir: use to go."
      },
      {
        question: 'This time last week I ________ on a beach.',
        options: ["sat", "was sitting", "sit"],
        answer: 1,
        explanation: "Belirli geçmiş an vurgusu olduğu için Past Continuous uygundur."
      },
      {
        question: 'Sorry, I didn\'t hear what you said, I ________ the news.',
        options: ["was watching", "watched", "watch"],
        answer: 0,
        explanation: "Devam eden eylem Past Continuous ile verilir."
      }
    ]
  },
  {
    id: "prepositions",
    unit: "Unit 3B",
    title: "Prepositions",
    subtitle: "Place · movement · dependent prepositions",
    time: 32,
    difficulty: "medium",
    summaryHtml: `
<div class="content-card">
  <h3>Prepositions of place</h3>
  <p>Prepositions of place describe the location or position of something about something else.</p>
  <p>The books are on the shelf. / The chair is in front of the desk.</p>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Preposition</th><th>Example</th></tr></thead><tbody><tr><td>in</td><td>The shoes are in the closet.</td></tr><tr><td>on</td><td>The laptop is on the table.</td></tr><tr><td>under</td><td>The cat is under the bed.</td></tr><tr><td>next to</td><td>The school is next to the hospital.</td></tr><tr><td>in front of</td><td>The car is in front of the garage.</td></tr><tr><td>behind</td><td>The park is behind the library.</td></tr><tr><td>between</td><td>The sofa is between the two chairs.</td></tr><tr><td>on the left / on the right</td><td>The pharmacy is on the left of the bank.</td></tr></tbody></table></div>
</div>
<div class="content-card">
  <h3>Prepositions of movement</h3>
  <p>These prepositions describe movements from one place to another. There is movement.</p>
  <p>He walked across the street. / The dog ran towards the boy. / We cycled along the river.</p>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Preposition</th><th>Usage &amp; Example</th></tr></thead><tbody><tr><td>to</td><td>Movement to a place – I’m going to the gym.</td></tr><tr><td>through</td><td>Inside an enclosed space – The car drove through the tunnel.</td></tr><tr><td>across</td><td>From one side to the other – She swam across the lake.</td></tr><tr><td>along</td><td>Following a line/path – We walked along the beach.</td></tr><tr><td>over</td><td>Above something – The plane flew over the city.</td></tr><tr><td>under</td><td>Beneath something – They crawled under the fence.</td></tr><tr><td>into</td><td>Entering a space – He went into the room.</td></tr><tr><td>out of</td><td>Exiting a space – She came out of the shop.</td></tr><tr><td>up</td><td>Movement upward – They climbed up the stairs.</td></tr><tr><td>down</td><td>Movement downward – He ran down the hill.</td></tr><tr><td>past</td><td>Moving by something – We walked past the bakery.</td></tr><tr><td>towards</td><td>In the direction of – The child ran towards her mother.</td></tr></tbody></table></div>
  <div class="warning-box">
    <p>"The dog ran towards me." (It didn’t reach me.)</p>
    <p>"The dog ran to me." (It reached me.)</p>
  </div>
</div>
<div class="content-card">
  <h3>Dependent prepositions</h3>
  <p>Some verbs and adjectives must be followed by specific prepositions.</p>
  <h4 class="mini-title">After verbs</h4>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Verb + Preposition</th><th>Example</th></tr></thead><tbody><tr><td>wait for</td><td>She’s waiting for the bus.</td></tr><tr><td>believe in</td><td>I believe in myself.</td></tr><tr><td>ask for</td><td>He asked for a refund.</td></tr><tr><td>rely on</td><td>You can rely on me.</td></tr><tr><td>argue about</td><td>They argued about politics.</td></tr><tr><td>apply for</td><td>I applied for the job.</td></tr><tr><td>pay for</td><td>She paid for the tickets.</td></tr><tr><td>talk about</td><td>We talked about the movie.</td></tr></tbody></table></div>
  <h4 class="mini-title">After adjectives</h4>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Adjective + Preposition</th><th>Example</th></tr></thead><tbody><tr><td>good at</td><td>He’s good at painting.</td></tr><tr><td>interested in</td><td>She’s interested in science.</td></tr><tr><td>tired of</td><td>I’m tired of waiting.</td></tr><tr><td>proud of</td><td>They’re proud of their son.</td></tr><tr><td>angry with/at</td><td>I’m angry with him / angry at the delay.</td></tr><tr><td>worried about</td><td>He’s worried about the exam.</td></tr><tr><td>ready for</td><td>We’re ready for the trip.</td></tr><tr><td>different from</td><td>This song is different from the original.</td></tr></tbody></table></div>
  <div class="info-box">
    <p><strong>Use verb + ing after prepositions:</strong> I’m looking forward to seeing you. / She believes in working hard.</p>
  </div>
  <div class="warning-box">
    <p><strong>Verbs that don’t need prepositions:</strong> ask, discuss, enter, marry</p>
    <p>We discussed the problem. / He entered the room. / She married him.</p>
  </div>
</div>
`,
    keyPoints: [
      "towards yönü gösterir, to hedefe ulaşıldığını gösterir.",
      "Prepositions sonrası verb + ing çok önemlidir.",
      "discuss, enter, marry gibi fiiller ekstra preposition almaz."
    ],
    quiz: [
      {
        question: 'The mouse ran ________ the stairs, ________ the corridor, and ________ the kitchen.',
        options: ["into / across / down", "down / along / into", "under / along / across"],
        answer: 1,
        explanation: "Sıralı hareket anlatımında down, along ve into en doğal seçimdir."
      },
      {
        question: 'I\'m tired ________ all this work - I\'m ready ________ a holiday!',
        options: ["of / for", "from / to", "about / with"],
        answer: 0,
        explanation: "tired of ve ready for sabit yapılardır."
      },
      {
        question: 'We need to discuss ________ the problems with our IT department.',
        options: ["about", "[-]", "for"],
        answer: 1,
        explanation: "Discuss fiili preposition istemez."
      }
    ]
  },
  {
    id: "futureforms",
    unit: "Unit 4A",
    title: "Future Forms",
    subtitle: "Will · be going to · present continuous · future in the past",
    time: 32,
    difficulty: "medium",
    summaryHtml: `
<div class="content-card">
  <h3>Will / won’t + Verb 1</h3>
  <p><strong>When do we use it?</strong></p>
  <ul>
    <li>Predictions (based on beliefs or opinions): I think it will rain tomorrow.</li>
    <li>Future facts (unchangeable future events): The sun will rise at 6:45 AM.</li>
    <li>Instant decisions: I’m tired. I’ll go to bed now.</li>
    <li>Promises: I won’t tell anyone your secret.</li>
    <li>Offers & suggestions: Shall I help you with your bags? / Shall we go out tonight?</li>
  </ul>
  <div class="info-box">
    <p><strong>Positive:</strong> Subject + will + verb1</p>
    <p><strong>Negative:</strong> Subject + won’t + verb1</p>
  </div>
</div>
<div class="content-card">
  <h3>Be going to + verb 1</h3>
  <ul>
    <li>For planned actions (decided before the moment of speaking): I’m going to start a new course next month.</li>
    <li>For predictions with evidence: Look at those dark clouds! It’s going to rain.</li>
  </ul>
  <div class="info-box">
    <p><strong>Positive:</strong> Subject + am/is/are + going to + verb1</p>
    <p><strong>Negative:</strong> Subject + am/is/are + not + going to + verb1</p>
  </div>
</div>
<div class="content-card">
  <h3>Present Continuous for future arrangements</h3>
  <p>Scheduled plans with a specific time or arrangement:</p>
  <ul>
    <li>I’m meeting my friend at 6 PM.</li>
    <li>We’re flying to Italy next week.</li>
    <li>She’s having dinner with her boss tomorrow.</li>
  </ul>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Form</th><th>Used for</th><th>Example</th></tr></thead><tbody><tr><td>Will</td><td>Instant decisions, promises, predictions</td><td>I’ll call you later.</td></tr><tr><td>Be Going to</td><td>Plans and evidence-based predictions</td><td>It’s going to snow. Look at the sky!</td></tr><tr><td>Present Continuous</td><td>Arranged events or appointments</td><td>I’m seeing the doctor on Friday.</td></tr></tbody></table></div>
</div>
<div class="content-card">
  <h3>Future in the past</h3>
  <div class="warning-box">
    <p><strong>We always use was / were going to to talk about failed plans.</strong></p>
    <p>I was going to visit my uncle but he was abroad.</p>
    <p>They were going to meet in café but he had an important meeting so they postponed it.</p>
  </div>
</div>
`,
    keyPoints: [
      "will anlık karar, söz verme ve opinion-based prediction için kullanılır.",
      "be going to plan ve evidence-based prediction için kullanılır.",
      "was / were going to gerçekleşmeyen geçmiş planları anlatır."
    ],
    quiz: [
      {
        question: 'A: Is that the doorbell? B: Yes, it is. ________.',
        options: ["I'm going to get it", "I'll get it", "I get it"],
        answer: 1,
        explanation: "Kapı çalınca o anda verilen karar will ile kurulur."
      },
      {
        question: 'A: What are your plans for the weekend? B: ________ lots of gardening.',
        options: ["I'm going to do", "I'll do", "I do"],
        answer: 0,
        explanation: "Önceden planlanmış niyetlerde going to kullanılır."
      },
      {
        question: 'This cardboard box is empty. ________ put it in the recycling bin?',
        options: ["Will I", "Shall I", "Do I"],
        answer: 1,
        explanation: "Teklif ve öneri sorularında Shall I kullanılır."
      }
    ]
  },
  {
    id: "conditionals12",
    unit: "Unit 4B",
    title: "1st & 2nd Conditionals",
    subtitle: "Real future · unreal present/future · would vs could · unless",
    time: 40,
    difficulty: "hard",
    summaryHtml: `
<div class="content-card">
  <h3>First Conditional</h3>
  <p>We use the First Conditional to talk about real or likely situations in the future. These are possible things that might happen.</p>
  <div class="info-box">
    <p><strong>Structure:</strong> If + Present Simple, will + Verb1</p>
    <p>If it rains, we will stay at home.</p>
    <p>If I study hard, I will pass the exam.</p>
    <p>She will miss the bus if she doesn’t hurry.</p>
  </div>
  <p><strong>Key points:</strong></p>
  <ul>
    <li>The if part is in present simple.</li>
    <li>The result uses will + verb.</li>
    <li>You can change the order: We will stay at home if it rains.</li>
    <li>In the other clause, we can also use imperatives or can + verb1.</li>
  </ul>
</div>
<div class="content-card">
  <h3>Second Conditional</h3>
  <p>We use the Second Conditional to talk about hypothetical situations — things that probably won’t happen, or are imaginary.</p>
  <div class="info-box">
    <p><strong>Structure:</strong> If + Past Simple, would + Verb1</p>
    <p>If I won the lottery, I would travel the world.</p>
    <p>She would be happy if she got the job.</p>
    <p>If I were you, I wouldn’t do that.</p>
  </div>
  <div class="warning-box">
    <p>With I / he / she / it we often use <strong>were</strong> instead of was in formal English.</p>
    <p>If I were rich, I would buy a mansion.</p>
  </div>
  <p>The if part uses past simple, but it’s not about the past — it’s about unreal or imagined situations.</p>
</div>
<div class="content-card">
  <h3>1st vs 2nd Conditional</h3>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Condition</th><th>If Clause</th><th>Main Clause</th><th>Example</th></tr></thead><tbody><tr><td>1st</td><td>If + present simple</td><td>will + verb1</td><td>If I study, I will pass the exam.</td></tr><tr><td>2nd</td><td>If + past simple</td><td>would + verb1</td><td>If I studied, I would pass the exam (but I don&#x27;t).</td></tr></tbody></table></div>
</div>
<div class="content-card">
  <h3>Would vs Could</h3>
  <p><strong>Would</strong> expresses result or consequence. <strong>Could</strong> expresses possibility or ability.</p>
  <div class="source-panel">
    <p>If I had more money, I would buy a new phone.</p>
    <p>If I spoke Spanish, I could work in Spain.</p>
  </div>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>If Clause (Past Simple)</th><th>Main Clause – Using Would</th><th>Main Clause – Using Could</th></tr></thead><tbody><tr><td>If I had a car</td><td>I would drive to work.</td><td>I could drive to the countryside.</td></tr><tr><td>If she knew the answer</td><td>She would tell you.</td><td>She could help you with your homework.</td></tr><tr><td>If we had more free time</td><td>We would travel more.</td><td>We could learn a new language.</td></tr></tbody></table></div>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Word</th><th>Function</th><th>Meaning</th></tr></thead><tbody><tr><td>Would</td><td>Result or consequence</td><td>What someone would do in that situation.</td></tr><tr><td>Could</td><td>Possibility or ability</td><td>What someone would be able to do.</td></tr></tbody></table></div>
</div>
`,
    keyPoints: [
      "First Conditional: If + Present Simple, will + Verb1.",
      "Second Conditional: If + Past Simple, would + Verb1.",
      "Would sonuç bildirir, could ise possibility / ability bildirir."
    ],
    quiz: [
      {
        question: 'If it ________ tomorrow, we will stay at home.',
        options: ["rains", "will rain", "rained"],
        answer: 0,
        explanation: "If clause içinde Present Simple kullanılır."
      },
      {
        question: 'If I ________ the lottery, I would travel the world.',
        options: ["win", "won", "will win"],
        answer: 1,
        explanation: "Second conditional yapısında if clause Past Simple olur."
      },
      {
        question: 'We can\'t help you ________ you tell us what the problem is.',
        options: ["if", "unless", "because"],
        answer: 1,
        explanation: "Unless = if not anlamı verir."
      }
    ]
  },
  {
    id: "perfect",
    unit: "Unit 5A",
    title: "Present Perfect Simple",
    subtitle: "Have/has + V3 · for/since · just/yet/already",
    time: 28,
    difficulty: "medium",
    summaryHtml: `
      <div class="content-card">
        <h3>Kullanım alanları</h3>
        <ul>
          <li>Hayat deneyimleri: <em>Have you ever been...?</em></li>
          <li>Yeni olmuş haber: <em>He's just sent me a text.</em></li>
          <li>Already / yet / just kullanımları.</li>
        </ul>
      </div>
      <div class="content-card">
        <h3>Past Simple ile farkı</h3>
        <div class="warning-box">
          <p>Eğer cümlede <strong>yesterday, last week, in 2020</strong> gibi kesin geçmiş zaman ifadesi varsa Past Simple kullanılır.</p>
        </div>
      </div>
    `,
    keyPoints: [
      "Have/has + V3 temel yapıdır.",
      "Yet genelde olumsuz ve sorularda kullanılır.",
      "Specific past time varsa Present Perfect kullanılmaz."
    ],
    quiz: [
      {
        question: 'Oh no! We\'re late! The film ________.',
        options: ["has already started", "hasn't started yet", "started yesterday"],
        answer: 0,
        explanation: "Beklenenden önce gerçekleşen eylem için already uygundur."
      },
      {
        question: 'I ________ to Canada, but I never went to the USA.',
        options: ["never went", "have been", "am"],
        answer: 1,
        explanation: "Belirsiz yaşam deneyimi olduğu için have been kullanılır."
      },
      {
        question: 'They got married in May, so they ________ for six months.',
        options: ["are married", "have been married", "married"],
        answer: 1,
        explanation: "Şimdiye kadar süren durumlarda have been married kullanılır."
      }
    ]
  },
  {
    id: "perfectcont",
    unit: "Unit 5B",
    title: "Present Perfect Continuous",
    subtitle: "Have been + V-ing · recent activity · visible result",
    time: 28,
    difficulty: "medium",
    summaryHtml: `
      <div class="content-card">
        <h3>Ne anlatır?</h3>
        <p>Yakın geçmişte başlayıp etkisi şimdi süren veya görünür sonuç bırakan eylemleri anlatır.</p>
        <div class="info-box">
          <p><em>I've been working in the garden.</em> → şu an yorgun görünmemin sebebi bu.</p>
        </div>
      </div>
      <div class="content-card">
        <h3>Simple ile farkı</h3>
        <p>Simple daha çok sonuç veya tamamlanmış deneyimlere gider; continuous ise sürece odaklanır.</p>
        <div class="warning-box">
          <p>Stative verbs genelde continuous almaz: <em>I've known them for 10 years.</em></p>
        </div>
      </div>
    `,
    keyPoints: [
      "Have/has been + V-ing kullanılır.",
      "Lately / recently ile sık görülür.",
      "Know, believe gibi stative verbs continuous almaz."
    ],
    quiz: [
      {
        question: 'I ________ too hard lately.',
        options: ["am working", "have been working", "worked"],
        answer: 1,
        explanation: "Lately ile süreklilik vurgusu olduğu için Present Perfect Continuous kullanılır."
      },
      {
        question: 'Ania is really tired - she ________ a lot for work since February.',
        options: ["is travelling", "has been travelling", "travelled"],
        answer: 1,
        explanation: "Since February süregelen eylem verdiği için bu yapı uygundur."
      },
      {
        question: 'At last! I ________ for you for an hour!',
        options: ["am waiting", "have been waiting", "waited"],
        answer: 1,
        explanation: "For an hour + şimdiye kadar süren bekleme continuous ister."
      }
    ]
  },
  {
    id: "modals",
    unit: "Unit 6A",
    title: "Modals of Obligation",
    subtitle: "Have to · must · needn't · mustn't · should",
    time: 26,
    difficulty: "medium",
    summaryHtml: `
      <div class="content-card">
        <h3>Zorunluluk ve tavsiye</h3>
        <p><strong>Have to</strong> dış kural, <strong>must</strong> çoğu zaman iç zorunluluk, <strong>should</strong> tavsiye verir.</p>
      </div>
      <div class="content-card">
        <h3>En kritik fark</h3>
        <div class="warning-box">
          <p><strong>mustn't</strong> = yasak</p>
          <p><strong>don't have to</strong> = yapmak zorunda değilsin</p>
        </div>
      </div>
    `,
    keyPoints: [
      "Geçmiş zorunluluk için had to kullanılır.",
      "mustn't ile don't have to karıştırılmamalıdır.",
      "Advice için should / ought to kullanılır."
    ],
    quiz: [
      {
        question: 'I ________ buy a new fridge last week.',
        options: ["had to", "must", "mustn't"],
        answer: 0,
        explanation: "Geçmiş zorunluluk had to ile verilir."
      },
      {
        question: 'We ________ be at the airport until 5.00. Our flight isn\'t until 7.00.',
        options: ["mustn't", "don't have to", "should"],
        answer: 1,
        explanation: "Gerekli değil anlamı için don't have to kullanılır."
      },
      {
        question: 'You ________ spill anything on the sofa - it\'s leather.',
        options: ["mustn't", "don't have to", "can"],
        answer: 0,
        explanation: "Burada yasak / güçlü uyarı vardır, mustn't gerekir."
      }
    ]
  },
  {
    id: "ability",
    unit: "Unit 6B",
    title: "Can / Could / Be able to",
    subtitle: "Ability · permission · specific past success",
    time: 24,
    difficulty: "medium",
    summaryHtml: `
      <div class="content-card">
        <h3>Genel fark</h3>
        <p><strong>Can</strong> şimdiki yetenek veya izin, <strong>could</strong> geçmiş genel yetenek, <strong>be able to</strong> ise can'in kullanılamadığı tense'lerde ve özel durumlarda kullanılır.</p>
      </div>
      <div class="content-card">
        <h3>Özel geçmiş başarı</h3>
        <div class="warning-box">
          <p>Geçmişte tek ve zor bir durumda başarı anlatıyorsan genelde <strong>was / were able to</strong> veya <strong>managed to</strong> kullanılır; could değil.</p>
        </div>
      </div>
    `,
    keyPoints: [
      "She could swim at three = general past ability.",
      "I was able to fix it = specific successful occasion.",
      "Future formda won't be able to kullanılabilir."
    ],
    quiz: [
      {
        question: 'I\'m afraid it\'s broken and I ________ mend it.',
        options: ["won't can", "won't be able to", "couldn't to"],
        answer: 1,
        explanation: "Future structure için be able to gerekir."
      },
      {
        question: 'He loves music - he ________ play the violin when he was four!',
        options: ["managed to", "could", "is able to"],
        answer: 1,
        explanation: "Genel geçmiş yetenek anlatıldığı için could uygundur."
      },
      {
        question: 'I got a puncture, but I ________ change the wheel myself.',
        options: ["could", "was able to", "can"],
        answer: 1,
        explanation: "Tek olayda başarı olduğu için was able to daha doğrudur."
      }
    ]
  },
  {
    id: "phrasal",
    unit: "Unit 7A",
    title: "Phrasal Verbs",
    subtitle: "No object · separable · inseparable",
    time: 30,
    difficulty: "hard",
    summaryHtml: `
      <div class="content-card">
        <h3>Türler</h3>
        <p>Bazı phrasal verbs nesne almaz; bazıları ayrılabilir; bazıları asla ayrılamaz.</p>
      </div>
      <div class="content-card">
        <h3>Zamir kuralı</h3>
        <div class="warning-box">
          <p>Ayrılabilen phrasal verb'de nesne zamirse mutlaka araya girer.</p>
          <p><strong>Correct:</strong> turn it off</p>
          <p><strong>Wrong:</strong> turn off it</p>
        </div>
      </div>
    `,
    keyPoints: [
      "Separable type 2 yapılarda it / them fiil ile particle arasına gelir.",
      "Inseparable phrasal verbs parçalanmaz: get on with, look forward to.",
      "Phrasal verbs anlamı literal olmayabilir; kalıp olarak çalışılmalıdır."
    ],
    quiz: [
      {
        question: 'The pasta was cold, so I ________.',
        options: ["sent back it", "sent it back", "sent it"],
        answer: 1,
        explanation: "Pronoun, separable phrasal verb'de araya girer."
      },
      {
        question: 'They ________.',
        options: ["live off their parents", "live their parents off", "live of their parents"],
        answer: 0,
        explanation: "Live off inseparable bir yapıdır."
      },
      {
        question: 'Your phone\'s ringing. Quick, ________ ! (turn off)',
        options: ["turn off it", "turn it off", "it turn off"],
        answer: 1,
        explanation: "Pronoun it, turn ve off arasına gelir."
      }
    ]
  },
  {
    id: "verbpatterns",
    unit: "Unit 7B",
    title: "Verb Patterns",
    subtitle: "to-infinitive · bare infinitive · gerund",
    time: 30,
    difficulty: "hard",
    summaryHtml: `
      <div class="content-card">
        <h3>Hangi fiilden sonra ne gelir?</h3>
        <p>Bazı fiiller <strong>to + infinitive</strong>, bazıları <strong>-ing</strong>, modals ise bare infinitive alır.</p>
        <div class="info-box">
          <p><strong>want / decide / need</strong> → to-infinitive</p>
          <p><strong>enjoy / avoid / finish / hate</strong> → gerund</p>
        </div>
      </div>
      <div class="content-card">
        <h3>Let ve make</h3>
        <div class="warning-box">
          <p><strong>let / make + object + bare infinitive</strong></p>
          <p>They made us work late. / His parents let him go.</p>
        </div>
      </div>
    `,
    keyPoints: [
      "Enjoy, avoid, finish gibi fiiller genelde -ing alır.",
      "Want, decide, hope gibi fiiller to-infinitive alır.",
      "Let ve make sonrası to kullanılmaz."
    ],
    quiz: [
      {
        question: 'We really enjoy ________ to concerts. (go)',
        options: ["to go", "going", "go"],
        answer: 1,
        explanation: "Enjoy fiili gerund alır."
      },
      {
        question: 'I hate ________ to visit my family more often... (not be able)',
        options: ["not to be able", "not being able", "to not able"],
        answer: 1,
        explanation: "Hate fiili gerund yapısıyla kullanılır."
      },
      {
        question: 'Karen\'s teacher let her ________ early.',
        options: ["leave", "to leave", "leaving"],
        answer: 0,
        explanation: "Let sonrası bare infinitive gelir."
      }
    ]
  },
  {
    id: "causative",
    unit: "Unit 8A",
    title: "Have Something Done",
    subtitle: "Causative structure · get something done",
    time: 22,
    difficulty: "medium",
    summaryHtml: `
      <div class="content-card">
        <h3>Temel yapı</h3>
        <div class="info-box">
          <p><strong>have + object + V3</strong></p>
        </div>
        <p>İşi kendin yapmadığında, birine yaptırdığında bu yapı kullanılır.</p>
      </div>
      <div class="content-card">
        <h3>Anlam farkı</h3>
        <p><em>I cleaned my car.</em> = kendim yaptım.</p>
        <p><em>I had my car cleaned.</em> = başkasına yaptırdım.</p>
      </div>
    `,
    keyPoints: [
      "Have my hair cut = saçımı kestirdim.",
      "Get something done de benzer anlam verir.",
      "Yapı içinde fiilin V3 hali kullanılır."
    ],
    quiz: [
      {
        question: 'I (my hair had yesterday cut). Doğru sıralama hangisi?',
        options: ["I had cut my hair yesterday.", "I had my hair cut yesterday.", "I my hair had cut yesterday."],
        answer: 1,
        explanation: "Causative yapı have + object + V3 şeklindedir."
      },
      {
        question: 'We (to repaired don\'t have roof the need). Doğru sıralama hangisi?',
        options: ["We don't have to repaired need the roof.", "We don't need to have the roof repaired.", "We need repaired roof don't have."],
        answer: 1,
        explanation: "Doğru causative yapı repaired ile kurulmalıdır."
      },
      {
        question: 'He\'s (have to his taken going photo). Doğru sıralama hangisi?',
        options: ["He's going to have his photo taken.", "He's having to his photo taken going.", "He's going have his photo took."],
        answer: 0,
        explanation: "Going to + have + object + V3 doğru yapıdır."
      }
    ]
  },
  {
    id: "passive",
    unit: "Unit 8B",
    title: "Passive Voice",
    subtitle: "Am/is/are/was/were/been + V3",
    time: 30,
    difficulty: "hard",
    summaryHtml: `
      <div class="content-card">
        <h3>Passive ne zaman kullanılır?</h3>
        <p>Eylemi yapan kişi bilinmiyorsa, önemli değilse veya odak eylemse passive kullanılır.</p>
      </div>
      <div class="content-card">
        <h3>Zamanlara göre passive</h3>
        <ul>
          <li>Present Simple: is / are + V3</li>
          <li>Past Simple: was / were + V3</li>
          <li>Present Continuous: is / are being + V3</li>
          <li>Present Perfect: has / have been + V3</li>
          <li>Future: will be + V3</li>
        </ul>
      </div>
    `,
    keyPoints: [
      "Passive odaklı cümlelerde agent sonradan by ile gelebilir.",
      "Rice is grown in Valencia passive örneğidir.",
      "Tense değişse de asıl mantık be + V3'tür."
    ],
    quiz: [
      {
        question: 'The Guggenheim Museum in Bilbao ________ in 1997. (open)',
        options: ["opened", "was opened", "is opened"],
        answer: 1,
        explanation: "Geçmişte açıldığı için Past Simple Passive gerekir."
      },
      {
        question: 'A new shopping centre ________ in the town centre at the moment. (build)',
        options: ["is building", "is being built", "was built"],
        answer: 1,
        explanation: "Şu anda yapım halinde olduğu için Present Continuous Passive kullanılır."
      },
      {
        question: 'They grow rice in Valencia. Passive karşılığı hangisi?',
        options: ["Rice is grown in Valencia.", "Rice was grown in Valencia.", "Rice grows in Valencia."],
        answer: 0,
        explanation: "Active Present Simple'ın passive karşılığı is grown olur."
      }
    ]
  },
  {
    id: "reported",
    unit: "Unit 9A",
    title: "Reported Speech",
    subtitle: "Statements · questions · imperatives · backshift",
    time: 32,
    difficulty: "hard",
    summaryHtml: `
      <div class="content-card">
        <h3>Backshift</h3>
        <p>Direct speech reported speech'e çevrilirken zaman çoğu durumda bir adım geri gider: <strong>will → would</strong>, <strong>can → could</strong>, <strong>Present Simple → Past Simple</strong>.</p>
      </div>
      <div class="content-card">
        <h3>Reported questions</h3>
        <div class="warning-box">
          <p>Reported question içinde <strong>do / did / does</strong> kullanılmaz.</p>
          <p>Kelime sırası düz cümle olur: <em>She asked me where I lived.</em></p>
        </div>
      </div>
    `,
    keyPoints: [
      "Yes / no questions için if / whether kullanılır.",
      "Imperatives: told / asked + object + to infinitive.",
      "Soru işareti reported clause içinde kaybolur."
    ],
    quiz: [
      {
        question: '"I can\'t find my purse." → She said that ________.',
        options: ["she can't find her purse", "she couldn't find her purse", "she couldn't found her purse"],
        answer: 1,
        explanation: "Can geçmişe kayınca could olur."
      },
      {
        question: '"Where do you live?" → He asked me ________.',
        options: ["where did I live", "where I lived", "where do I live"],
        answer: 1,
        explanation: "Reported question'da normal word order kullanılır."
      },
      {
        question: '"Please fill in the application form." → They asked us ________.',
        options: ["to fill in the application form", "fill in the application form", "filled in the application form"],
        answer: 0,
        explanation: "Requests, asked + object + to infinitive ile aktarılır."
      }
    ]
  },
  {
    id: "conditionals3",
    unit: "Unit 9B",
    title: "3rd Conditional",
    subtitle: "Past Perfect · regret · hypothetical past",
    time: 30,
    difficulty: "hard",
    summaryHtml: `
      <div class="content-card">
        <h3>Third Conditional</h3>
        <div class="info-box">
          <p><strong>If + had V3, would have + V3</strong></p>
        </div>
        <p>Geçmişte gerçekleşmeyen durumlar ve pişmanlıklar için kullanılır.</p>
      </div>
      <div class="content-card">
        <h3>Past Perfect</h3>
        <p>Geçmişte iki olay varsa daha önce olanı göstermek için Past Perfect kullanılabilir.</p>
      </div>
    `,
    keyPoints: [
      "If I'd known, I would have called gibi yapılar third conditional'dır.",
      "Past Perfect = had + V3.",
      "Gerçekleşmemiş geçmiş alternatiflerini anlatır."
    ],
    quiz: [
      {
        question: 'If we ________ the bus, we ________ home till midnight. (miss / not get)',
        options: ["'d missed / wouldn't have got", "missed / wouldn't get", "had missed / won't get"],
        answer: 0,
        explanation: "Third conditional yapısı had + V3 ve would have + V3 ister."
      },
      {
        question: 'If they ________ to the wedding, they ________.',
        options: ["were invited / would have gone", "had been invited / would have gone", "invite / will go"],
        answer: 1,
        explanation: "Passive third conditional için had been invited doğrudur."
      },
      {
        question: 'When she woke up, the house was empty - he ________.',
        options: ["went", "had gone", "was going"],
        answer: 1,
        explanation: "Daha önce gerçekleşen olay Past Perfect ile verilir."
      }
    ]
  },
  {
    id: "auxiliaries",
    unit: "Unit 10A",
    title: "Be / Do / Have",
    subtitle: "Main verbs vs auxiliary verbs",
    time: 22,
    difficulty: "medium",
    summaryHtml: `
      <div class="content-card">
        <h3>Temel mantık</h3>
        <p>Bu üç fiil İngilizcede hem ana fiil hem yardımcı fiil olarak kullanılabilir.</p>
        <ul>
          <li><strong>Be</strong>: continuous, passive veya durum anlatabilir.</li>
          <li><strong>Do</strong>: question / negative yardımcı fiili olabilir veya yapmak anlamına gelebilir.</li>
          <li><strong>Have</strong>: possession veya perfect tense yardımcı fiili olabilir.</li>
        </ul>
      </div>
      <div class="content-card">
        <h3>Neden önemli?</h3>
        <p>Sınavlarda doğru auxiliary seçimi tense yapısını belirler. Bu yüzden özellikle soru kurulumunda çok önemlidir.</p>
      </div>
    `,
    keyPoints: [
      "Does he like...? ve Is he feeling...? farklı yardımcı fiiller kullanır.",
      "Have been doing perfect continuous yapıdır.",
      "Do, ana fiil ve yardımcı fiil olarak farklı görevlerde bulunabilir."
    ],
    quiz: [
      {
        question: '________ he like living in the UK, or ________ he feeling homesick?',
        options: ["Does / is", "Is / does", "Do / are"],
        answer: 0,
        explanation: "Like için does, feeling için is gerekir."
      },
      {
        question: 'A: ________ you miss the beginning of the film? B: No, luckily it ________ started yet.',
        options: ["Have / hasn't", "Did / hadn't", "Did / hasn't"],
        answer: 2,
        explanation: "Miss past simple ile sorulur; film henüz başlamamış anlamı için hasn't started yet uygundur."
      },
      {
        question: 'What ________ you been ________ since I last saw you?',
        options: ["have / doing", "are / doing", "did / do"],
        answer: 0,
        explanation: "Present Perfect Continuous yapısı have been doing şeklindedir."
      }
    ]
  }
];

const makeQuestion = (question, options, answer, explanation) => ({ question, options, answer, explanation });

function getTopicById(id) {
  return TOPICS.find((topic) => topic.id === id);
}

function appendTopicHtml(id, html) {
  const topic = getTopicById(id);
  if (!topic) return;
  topic.summaryHtml += html;
}

function addTopicQuestions(id, questions) {
  const topic = getTopicById(id);
  if (!topic) return;
  topic.quiz.push(...questions);
}

const STUDY_ENHANCEMENTS = {
  objectpronouns: `
<div class="content-card">
  <h3>Pronoun family and verb patterns</h3>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Subject</th><th>Object</th><th>Possessive adjective</th><th>Possessive pronoun</th></tr></thead><tbody><tr><td>I</td><td>me</td><td>my</td><td>mine</td></tr><tr><td>you</td><td>you</td><td>your</td><td>yours</td></tr><tr><td>he / she / it</td><td>him / her / it</td><td>his / her / its</td><td>his / hers / -</td></tr><tr><td>we</td><td>us</td><td>our</td><td>ours</td></tr><tr><td>they</td><td>them</td><td>their</td><td>theirs</td></tr></tbody></table></div>
  <ul>
    <li>After prepositions, always use the object form: to her, for them, with us.</li>
    <li>Common verb + to patterns: give to, send to, lend to, show to, write to, offer to, read to, take to.</li>
    <li>Common verb + for patterns: bring for, buy for, make for, cook for, find for, get for.</li>
  </ul>
</div>
`,
  adjectives: `
<div class="content-card">
  <h3>Extra grammar-bank rules</h3>
  <ul>
    <li>Use one / ones only with countable nouns. With uncountable nouns, repeat the noun or use another determiner.</li>
    <li>Some two-syllable adjectives can take -er / -est: narrow -> narrower -> the narrowest, clever -> cleverer -> the cleverest.</li>
    <li>Adjectives ending in -ed usually take more / the most: more bored, the most tired.</li>
    <li>Another useful comparison pattern is not as + adjective + as: This jacket is not as expensive as that one.</li>
  </ul>
</div>
`,
  presenttenses: `
<div class="content-card">
  <h3>Revise the basics</h3>
  <ul>
    <li>Use the present simple for habits, routines and frequency words: always, often, sometimes, never.</li>
    <li>Use the present continuous for actions happening now, around now, or temporary situations.</li>
    <li>Use the present continuous for arranged future plans, but use the present simple for timetables and schedules.</li>
    <li>With think, have and see, decide from the meaning: opinion / possession / understanding usually stay in the simple form.</li>
  </ul>
</div>
`,
  possessives: `
<div class="content-card">
  <h3>Extra possessive patterns</h3>
  <ul>
    <li>We can use name / person + 's for homes and shops: at the baker's, at my aunt's, at the dentist's.</li>
    <li>A useful double possessive is a friend of mine / a cousin of ours / a colleague of hers.</li>
    <li>Own adds emphasis: her own room, their own company, a business of your own.</li>
    <li>With shared possession, add 's only to the second name. With separate possession, add 's to both names.</li>
  </ul>
</div>
`,
  pasttenses: `
<div class="content-card">
  <h3>Past simple vs past continuous vs used to</h3>
  <ul>
    <li>Past simple gives the finished action: The lesson ended at nine.</li>
    <li>Past continuous gives the background or interrupted action: We were revising when the bell rang.</li>
    <li>Used to describes old habits or states that are no longer true: I used to play tennis every weekend.</li>
    <li>In negatives and questions with used to, use use after did / didn't: Did you use to walk to school?</li>
  </ul>
</div>
`,
  prepositions: `
<div class="content-card">
  <h3>More preposition rules</h3>
  <ul>
    <li>After a preposition, use the -ing form: good at painting, interested in learning, looking forward to seeing you.</li>
    <li>Some verbs do not take a preposition here: discuss the problem, enter the room, marry someone, tell somebody something.</li>
    <li>towards shows direction only; to often suggests the movement reaches the final point.</li>
  </ul>
</div>
`,
  futureforms: `
<div class="content-card">
  <h3>Choosing the best future form</h3>
  <ul>
    <li>Use will for instant decisions, promises, offers and opinion-based predictions.</li>
    <li>Use be going to for intentions decided before speaking and predictions with visible evidence.</li>
    <li>Use the present continuous for fixed arrangements with people, places or times already organized.</li>
    <li>Use shall mainly with I / we for offers and suggestions: Shall I open the window? Shall we start?</li>
  </ul>
</div>
`,
  conditionals12: `
<div class="content-card">
  <h3>Extra first / second conditional notes</h3>
  <ul>
    <li>First conditional can also use imperatives and modal verbs in the main clause: If you see Anna, call me. If you study, you can pass.</li>
    <li>unless means if not: I won't go unless you come with me.</li>
    <li>Second conditional talks about unreal present or future situations. The past form in the if-clause does not mean past time here.</li>
    <li>If I were you is the standard phrase for advice.</li>
  </ul>
</div>
`,
  perfect: `
<div class="content-card">
  <h3>More present perfect uses</h3>
  <ul>
    <li>Use the present perfect for life experiences when the time is not given: Have you ever seen this film?</li>
    <li>Use just for very recent news, already mostly in positive sentences, and yet in negatives and questions.</li>
    <li>Use for + a period of time and since + a starting point: for two weeks, since Monday.</li>
    <li>With non-action verbs, use the present perfect simple for situations that started in the past and continue now: I've known her for years.</li>
  </ul>
</div>
<div class="content-card">
  <h3>Past simple or present perfect?</h3>
  <div class="source-panel">
    <p>I've watched three episodes this week. / I watched three episodes last weekend.</p>
    <p>We've only had a smart TV since last month. / She started here in 2023.</p>
  </div>
</div>
`,
  perfectcont: `
<div class="content-card">
  <h3>Duration and repeated activity</h3>
  <ul>
    <li>Use the present perfect continuous for continuous or repeated actions which started in the past and have present results now.</li>
    <li>It often appears with lately, recently, all day, all morning and how long.</li>
    <li>For work and live, both the simple and continuous forms are often possible: I've lived here for years / I've been living here for years.</li>
    <li>Stative verbs normally stay in the simple form: I've known them for ten years.</li>
  </ul>
</div>
`,
  modals: `
<div class="content-card">
  <h3>Needn't, don't have to, mustn't</h3>
  <ul>
    <li>don't have to / needn't = no necessity. The action is optional.</li>
    <li>mustn't = prohibition. The action is not allowed.</li>
    <li>must is mainly present or future. For past obligation, use had to.</li>
    <li>should / shouldn't and ought to / oughtn't to are used for advice and recommendation.</li>
  </ul>
</div>
`,
  ability: `
<div class="content-card">
  <h3>Permission and deduction</h3>
  <ul>
    <li>Use can / could / may to ask for permission. Could is more polite than can.</li>
    <li>Use be able to in forms where can is not possible: will be able to, have been able to, might be able to.</li>
    <li>For one specific successful action in the past, was / were able to or managed to is usually better than could.</li>
    <li>Use can't to say something is impossible or not true now. Use must to say you are sure something is true.</li>
  </ul>
</div>
`,
  phrasal: `
<div class="content-card">
  <h3>Three core phrasal-verb types</h3>
  <ul>
    <li>Type 1: no object - get up, go away, set off.</li>
    <li>Type 2: separable with an object - switch off the light / switch the light off / switch it off.</li>
    <li>Type 3: inseparable with an object - look after someone, get on with someone, look forward to something.</li>
    <li>Some two-particle phrasal verbs are never separated: look forward to, get on with, put up with.</li>
  </ul>
</div>
`,
  verbpatterns: `
<div class="content-card">
  <h3>Common verb-pattern groups</h3>
  <ul>
    <li>to-infinitive: agree, decide, hope, want, would like, need.</li>
    <li>bare infinitive: modal verbs, let, make.</li>
    <li>gerund: enjoy, finish, avoid, hate, mind, keep.</li>
    <li>object + infinitive: ask somebody to do, tell somebody to do, want somebody to do, would like somebody to do.</li>
  </ul>
</div>
`,
  causative: `
<div class="content-card">
  <h3>More causative notes</h3>
  <ul>
    <li>have + object + past participle works in many tenses: had my phone repaired, am having my eyes tested, will have the kitchen painted.</li>
    <li>Questions and negatives use the auxiliary: Did you have your hair cut? I don't want to have it done now.</li>
    <li>get something done is a common spoken alternative: I'm going to get my passport renewed.</li>
    <li>If you want to mention the person who did the job, use by: We had the heating checked by an engineer.</li>
  </ul>
</div>
`,
  passive: `
<div class="content-card">
  <h3>Passive forms across grammar</h3>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Time / structure</th><th>Passive form</th><th>Example</th></tr></thead><tbody><tr><td>Present simple</td><td>am / is / are + V3</td><td>The site is visited by thousands of people.</td></tr><tr><td>Present continuous</td><td>am / is / are being + V3</td><td>The castle is being restored.</td></tr><tr><td>Present perfect</td><td>has / have been + V3</td><td>The bridge has been repaired.</td></tr><tr><td>Past continuous / past perfect</td><td>was / were being + V3 / had been + V3</td><td>The road was being cleaned. / The room had been painted.</td></tr><tr><td>Future / modal / infinitive</td><td>will be + V3 / can be + V3 / to be + V3</td><td>The museum will be opened. / The form can be found online.</td></tr></tbody></table></div>
  <p>Use by + agent only when the doer is important. Passive is often more formal and keeps the focus on the action or result.</p>
</div>
`,
  reported: `
<div class="content-card">
  <h3>Time and place changes</h3>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Direct speech</th><th>Reported speech</th></tr></thead><tbody><tr><td>today</td><td>that day</td></tr><tr><td>tomorrow</td><td>the next day</td></tr><tr><td>yesterday</td><td>the day before</td></tr><tr><td>this</td><td>that</td></tr><tr><td>here</td><td>there</td></tr></tbody></table></div>
  <ul>
    <li>Reported yes / no questions use if or whether.</li>
    <li>Reported wh-questions keep the question word but use statement word order.</li>
    <li>Requests and imperatives often use tell / ask + object + to-infinitive.</li>
  </ul>
</div>
`,
  conditionals3: `
<div class="content-card">
  <h3>Other uses of the past perfect</h3>
  <ul>
    <li>Use the past perfect for the earlier of two past actions: When we got there, the film had started.</li>
    <li>It is common in narratives to explain background information before another past event.</li>
    <li>In reported speech, present perfect often backshifts to past perfect: She said that she had already seen the film.</li>
    <li>If the original speech is already in the past perfect, there is usually no further change.</li>
  </ul>
</div>
`,
  auxiliaries: `
<div class="content-card">
  <h3>Main verb vs auxiliary verb</h3>
  <ul>
    <li>be can describe states or act as the auxiliary in continuous and passive forms.</li>
    <li>do can mean perform an action, or it can build questions and negatives in the present simple and past simple.</li>
    <li>have can show possession, or it can work as the auxiliary of perfect tenses.</li>
    <li>Watch the structure carefully: Does she work here? / Is she working now? / Has she worked here before?</li>
  </ul>
</div>
`
};

Object.entries(STUDY_ENHANCEMENTS).forEach(([id, html]) => appendTopicHtml(id, html));

const EXTRA_QUIZ_QUESTIONS = {
  wordlist1a: [
    makeQuestion('Which phrase means "try to achieve something"?', ["overall", "seek to", "likely"], 1, "Seek to means try or attempt to do something."),
    makeQuestion('Which phrase means "begin to deal with something in a particular way"?', ["go about", "be named after", "stand out"], 0, "Go about means start or handle something in a certain way.")
  ],
  objectpronouns: [
    makeQuestion("Choose the correct sentence.", ["I'm going to lend it to she.", "I'm going to lend it to her.", "I'm going to lend her it."], 1, "After to, use the object pronoun her."),
    makeQuestion('Which verb most naturally takes for in this lesson?', ["write", "send", "cook"], 2, "We cook something for someone, but send / write usually take to.")
  ],
  adjectives: [
    makeQuestion('We do not have white bread, but we do have brown ____.', ["one", "ones", "bread"], 2, "Bread is uncountable here, so we do not replace it with one / ones."),
    makeQuestion('Choose the correct comparison.', ["This jacket is not as expensive as that one.", "This jacket is not so expensive than that one.", "This jacket is not as more expensive as that one."], 0, "not as + adjective + as is the correct pattern.")
  ],
  presenttenses: [
    makeQuestion('Do you ________ we should have lunch on the boat?', ["think", "are thinking", "thinking"], 0, "Here think expresses an opinion, so the present simple is correct."),
    makeQuestion('What time ________ your flight arrive in New York?', ["is", "does", "do"], 1, "Timetables and schedules usually use the present simple.")
  ],
  possessives: [
    makeQuestion('Choose the correct phrase.', ["a friend of mine", "a friend's of mine", "a friend of my"], 0, "The double possessive pattern is a friend of mine / ours / hers."),
    makeQuestion('They want to open a cafe. They dream of having a business of ____.', ["their own", "theirs own", "them own"], 0, "Own is used to emphasize possession: a business of their own.")
  ],
  pasttenses: [
    makeQuestion('When we were children, we ________ to the beach every weekend.', ["used to go", "were going", "go"], 0, "used to describes a repeated past habit that is no longer true."),
    makeQuestion('I ________ dinner when the taxi arrived.', ["still packed", "was still packing", "used to pack"], 1, "The longer background action takes the past continuous.")
  ],
  prepositions: [
    makeQuestion("I'm really looking forward to ________ from you.", ["hear", "hearing", "heard"], 1, "After a preposition, use the -ing form."),
    makeQuestion('We discussed ________ problem for nearly an hour.', ["about the", "the", "for the"], 1, "Discuss does not take about in this structure.")
  ],
  futureforms: [
    makeQuestion('Look at those black clouds. It ________.', ["will rain", "is going to rain", "rains"], 1, "Visible evidence usually takes be going to."),
    makeQuestion('A: The room is hot. B: OK, I ________ the air conditioning on.', ["am going to turn", "turn", "will turn"], 2, "The decision is made at the moment of speaking, so will is best.")
  ],
  conditionals12: [
    makeQuestion('If you finish the lesson early, ________ me.', ["call", "you will call", "calling"], 0, "The first conditional can use an imperative in the main clause."),
    makeQuestion("If I ________ you, I wouldn't spend so much money.", ["am", "were", "had been"], 1, "If I were you is the standard advice pattern.")
  ],
  perfect: [
    makeQuestion("This programme has been on ________ an hour.", ["since", "for", "from"], 1, "for introduces a period of time."),
    makeQuestion('We ________ each other since we were at university.', ["have known", "have been knowing", "know"], 0, "Know is a non-action verb, so the present perfect simple is used.")
  ],
  perfectcont: [
    makeQuestion('How long ________ you been looking for a new job?', ["do", "have", "are"], 1, "Present perfect continuous questions use have / has been + -ing."),
    makeQuestion('I ________ them for ten years.', ["have known", "have been knowing", "am knowing"], 0, "Know is a stative verb, so we do not normally use the continuous form.")
  ],
  modals: [
    makeQuestion("You ________ wear a tie. This restaurant is informal.", ["mustn't", "don't have to", "shouldn't"], 1, "don't have to means there is no necessity."),
    makeQuestion('You ________ eat so much chocolate before dinner.', ["shouldn't", "mustn't to", "needn't"], 0, "This is advice, so shouldn't is the best choice.")
  ],
  ability: [
    makeQuestion("She ________ be at work yet. It's only 7.30.", ["can't", "must", "could"], 0, "can't is used for an impossible conclusion."),
    makeQuestion('He studied all night. He ________ be exhausted now.', ["must", "can", "couldn't"], 0, "must shows a strong logical deduction.")
  ],
  phrasal: [
    makeQuestion("We're really ________ our trip to China.", ["looking forward to", "looking after", "looking for"], 0, "look forward to means feel excited about a future event."),
    makeQuestion("I haven't found my glasses yet - I've been ________ for them for half an hour.", ["looking them for", "looking for them", "looking after them"], 1, "look for is inseparable, so the object comes after the particle.")
  ],
  verbpatterns: [
    makeQuestion("Karen's teacher allowed her ________ school early.", ["leave", "to leave", "leaving"], 1, "Allow is followed by object + to-infinitive."),
    makeQuestion('My husband wants me ________ to the doctor.', ["go", "to go", "going"], 1, "Want somebody to do something takes object + to-infinitive.")
  ],
  causative: [
    makeQuestion("I'm going to ________ my hair cut tomorrow.", ["make", "have", "do"], 1, "The causative pattern is have + object + past participle."),
    makeQuestion('We need to ________ the roof repaired before winter.', ["have", "having", "had"], 0, "After need to, use the base form have in the causative structure.")
  ],
  passive: [
    makeQuestion('More information ________ on the website.', ["can find", "can be found", "can found"], 1, "A modal passive uses can be + past participle."),
    makeQuestion('A new bridge ________ next year.', ["will build", "will be built", "is building"], 1, "Future passive = will be + past participle.")
  ],
  reported: [
    makeQuestion('"I will see you tomorrow." -> He said that he would see me ________.', ["tomorrow", "the next day", "the day before"], 1, "tomorrow usually changes to the next day in reported speech."),
    makeQuestion('"Are you coming with us?" -> She asked me ________.', ["if I was coming with them", "was I coming with them", "if was coming with them"], 0, "Reported yes / no questions use if / whether and statement word order.")
  ],
  conditionals3: [
    makeQuestion("If I'd known his number, I ________ him.", ["called", "would call", "would have called"], 2, "Third conditional uses would have + past participle in the result clause."),
    makeQuestion('When we arrived at the station, the train ________.', ["left", "had left", "has left"], 1, "The earlier past action takes the past perfect.")
  ],
  auxiliaries: [
    makeQuestion('Where ________ your parents live?', ["are", "do", "have"], 1, "Live is a main verb here, so do is the auxiliary."),
    makeQuestion('She ________ two brothers and a sister.', ["is having", "has", "does have been"], 1, "Here have is the main verb of possession, so has is correct.")
  ]
};

Object.entries(EXTRA_QUIZ_QUESTIONS).forEach(([id, questions]) => addTopicQuestions(id, questions));

const MEMORIZATION_CARDS = [
  { id: "mem-1", front: "Researchers", back: "Araştırmacılar" },
  { id: "mem-2", front: "Evidence", back: "Kanıt" },
  { id: "mem-3", front: "Survey", back: "Anket" },
  { id: "mem-4", front: "The average", back: "Ortalama" },
  { id: "mem-5", front: "Scale", back: "Ölçek" },
  { id: "mem-6", front: "Rank", back: "Sıralamak" },
  { id: "mem-7", front: "Likely", back: "Muhtemel" },
  { id: "mem-8", front: "Overall", back: "Genel olarak" },
  { id: "mem-9", front: "Beyond", back: "Ötesinde" },
  { id: "mem-10", front: "Create a new image", back: "Yeni bir imaj oluşturmak" },
  { id: "mem-11", front: "Go about", back: "Bir işi ele almak" },
  { id: "mem-12", front: "Proof", back: "İspat / kanıt" },
  { id: "mem-13", front: "Seek to", back: "Amaçlamak" },
  { id: "mem-14", front: "Stand out", back: "Öne çıkmak" },
  { id: "mem-15", front: "Solicitor", back: "Avukat" },
  { id: "mem-16", front: "For fun", back: "Eğlence için" },
  { id: "mem-17", front: "Birth certificate", back: "Doğum belgesi" },
  { id: "mem-18", front: "Feel sorry", back: "Üzülmek / acımak" },
  { id: "mem-19", front: "Maiden name", back: "Kızlık soyadı" },
  { id: "mem-20", front: "Full name", back: "Tam ad" },
  { id: "mem-21", front: "Nickname", back: "Lakap" },
  { id: "mem-22", front: "Be named after", back: "Adını birinden almak" },
  { id: "mem-23", front: "Initials", back: "Baş harfler" },
  { id: "mem-24", front: "Brand name", back: "Marka adı" },
  { id: "mem-25", front: "Common", back: "Yaygın" },
  { id: "mem-26", front: "Old-fashioned", back: "Eski tarz / demode" },
  { id: "mem-27", front: "Celebrity", back: "Ünlü" },
  { id: "mem-28", front: "Suit", back: "Yakışmak / uygun olmak" }
,
  { id: "mem-29", front: "Direct object", back: "DoÄŸrudan nesne" },
  { id: "mem-30", front: "Indirect object", back: "DolaylÄ± nesne" },
  { id: "mem-31", front: "Object pronoun", back: "Nesne zamiri" },
  { id: "mem-32", front: "Possessive adjective", back: "Ä°yelik sÄ±fatÄ±" },
  { id: "mem-33", front: "Possessive pronoun", back: "Ä°yelik zamiri" },
  { id: "mem-34", front: "Lend", back: "Ã–dÃ¼nÃ§ vermek" },
  { id: "mem-35", front: "Borrow", back: "Ã–dÃ¼nÃ§ almak" },
  { id: "mem-36", front: "Ambitious", back: "HÄ±rslÄ±" },
  { id: "mem-37", front: "Selfish", back: "Bencil" },
  { id: "mem-38", front: "Expensive", back: "PahalÄ±" },
  { id: "mem-39", front: "Cheap", back: "Ucuz" },
  { id: "mem-40", front: "Comfortable", back: "Rahat / konforlu" },
  { id: "mem-41", front: "Successful", back: "BaÅŸarÄ±lÄ±" },
  { id: "mem-42", front: "Friendly", back: "Dost canlÄ±sÄ±" },
  { id: "mem-43", front: "Stative verb", back: "Durum fiili" },
  { id: "mem-44", front: "Possession", back: "Sahiplik" },
  { id: "mem-45", front: "Opinion", back: "GÃ¶rÃ¼ÅŸ / fikir" },
  { id: "mem-46", front: "Arrangement", back: "Ã–nceden ayarlanmÄ±ÅŸ plan" },
  { id: "mem-47", front: "Timetable", back: "Tarife / zaman Ã§izelgesi" },
  { id: "mem-48", front: "Ownership", back: "Sahiplik" },
  { id: "mem-49", front: "Share", back: "PaylaÅŸmak" },
  { id: "mem-50", front: "Separate", back: "AyrÄ± / ayÄ±rmak" },
  { id: "mem-51", front: "Own", back: "Kendine ait" },
  { id: "mem-52", front: "Colleague", back: "Ä°ÅŸ arkadaÅŸÄ±" },
  { id: "mem-53", front: "Bakery", back: "FÄ±rÄ±n" },
  { id: "mem-54", front: "Habit", back: "AlÄ±ÅŸkanlÄ±k" },
  { id: "mem-55", front: "Interrupted", back: "BÃ¶lÃ¼nmÃ¼ÅŸ / kesintiye uÄŸramÄ±ÅŸ" },
  { id: "mem-56", front: "Background action", back: "Arka plan eylemi" },
  { id: "mem-57", front: "Across", back: "KarÅŸÄ±ya / bir uÃ§tan diÄŸer uca" },
  { id: "mem-58", front: "Through", back: "Ä°Ã§inden geÃ§erek" },
  { id: "mem-59", front: "Along", back: "Boyunca" },
  { id: "mem-60", front: "Towards", back: "-e doÄŸru" },
  { id: "mem-61", front: "Apply for", back: "BaÅŸvurmak" },
  { id: "mem-62", front: "Rely on", back: "GÃ¼venmek / bel baÄŸlamak" },
  { id: "mem-63", front: "Proud of", back: "Gurur duymak" },
  { id: "mem-64", front: "Worried about", back: "EndiÅŸeli olmak" },
  { id: "mem-65", front: "Prediction", back: "Tahmin" },
  { id: "mem-66", front: "Promise", back: "SÃ¶z vermek / vaat" },
  { id: "mem-67", front: "Offer", back: "Teklif etmek / teklif" },
  { id: "mem-68", front: "Instant decision", back: "AnÄ±nda verilen karar" },
  { id: "mem-69", front: "Intention", back: "Niyet" },
  { id: "mem-70", front: "Evidence-based", back: "KanÄ±ta dayalÄ±" },
  { id: "mem-71", front: "Conditional", back: "KoÅŸul yapÄ±sÄ±" },
  { id: "mem-72", front: "Imaginary", back: "Hayali / gerÃ§ek dÄ±ÅŸÄ±" },
  { id: "mem-73", front: "Consequence", back: "SonuÃ§" },
  { id: "mem-74", front: "Unless", back: "EÄŸer ... deÄŸilse" },
  { id: "mem-75", front: "Already", back: "Zaten / Ã§oktan" },
  { id: "mem-76", front: "Yet", back: "HenÃ¼z" },
  { id: "mem-77", front: "Recently", back: "YakÄ±n zamanda" },
  { id: "mem-78", front: "Lately", back: "Son zamanlarda" },
  { id: "mem-79", front: "Since", back: "-den beri" },
  { id: "mem-80", front: "Obligation", back: "Zorunluluk" },
  { id: "mem-81", front: "Necessity", back: "Gereklilik" },
  { id: "mem-82", front: "Prohibition", back: "Yasak" },
  { id: "mem-83", front: "Advice", back: "Tavsiye" },
  { id: "mem-84", front: "Ability", back: "Yetenek" },
  { id: "mem-85", front: "Permission", back: "Ä°zin" },
  { id: "mem-86", front: "Deduction", back: "MantÄ±ksal Ã§Ä±karÄ±m" },
  { id: "mem-87", front: "Manage to", back: "BaÅŸarmak" },
  { id: "mem-88", front: "Get up", back: "Kalkmak" },
  { id: "mem-89", front: "Set off", back: "Yola Ã§Ä±kmak" },
  { id: "mem-90", front: "Switch off", back: "Kapatmak" },
  { id: "mem-91", front: "Fill in", back: "Doldurmak" },
  { id: "mem-92", front: "Put away", back: "Yerine koymak" },
  { id: "mem-93", front: "Pay back", back: "Geri Ã¶demek" },
  { id: "mem-94", front: "Take after", back: "Birine benzemek" },
  { id: "mem-95", front: "Look after", back: "Bakmak / ilgilenmek" },
  { id: "mem-96", front: "Look forward to", back: "Heyecanla beklemek" },
  { id: "mem-97", front: "Give away", back: "Bedava vermek / daÄŸÄ±tmak" },
  { id: "mem-98", front: "Agree to", back: "Kabul etmek" },
  { id: "mem-99", front: "Decide to", back: "Karar vermek" },
  { id: "mem-100", front: "Avoid", back: "KaÃ§Ä±nmak" },
  { id: "mem-101", front: "Allow", back: "Ä°zin vermek" },
  { id: "mem-102", front: "Persuade", back: "Ä°kna etmek" },
  { id: "mem-103", front: "Have something done", back: "Bir iÅŸi birine yaptÄ±rmak" },
  { id: "mem-104", front: "Get something done", back: "Bir iÅŸi yaptÄ±rtmak" },
  { id: "mem-105", front: "Repair", back: "Tamir etmek" },
  { id: "mem-106", front: "Redecorate", back: "Yeniden dekore etmek" },
  { id: "mem-107", front: "Passive voice", back: "Edilgen yapÄ±" },
  { id: "mem-108", front: "Reported speech", back: "DolaylÄ± anlatÄ±m" },
  { id: "mem-109", front: "Whether", back: "Olup olmadÄ±ÄŸÄ±" },
  { id: "mem-110", front: "Request", back: "Rica / talep" },
  { id: "mem-111", front: "Third conditional", back: "ÃœÃ§Ã¼ncÃ¼ koÅŸul yapÄ±sÄ±" },
  { id: "mem-112", front: "Regret", back: "PiÅŸmanlÄ±k / piÅŸman olmak" },
  { id: "mem-113", front: "Auxiliary verb", back: "YardÄ±mcÄ± fiil" },
  { id: "mem-114", front: "Main verb", back: "Ana fiil" }
];

const EXTRA_MEMORIZATION_CARDS = [
  { id: "mem-29", front: "Direct object", back: "Dogrudan nesne" },
  { id: "mem-30", front: "Indirect object", back: "Dolayli nesne" },
  { id: "mem-31", front: "Object pronoun", back: "Nesne zamiri" },
  { id: "mem-32", front: "Possessive adjective", back: "Iyelik sifati" },
  { id: "mem-33", front: "Possessive pronoun", back: "Iyelik zamiri" },
  { id: "mem-34", front: "Lend", back: "Odunc vermek" },
  { id: "mem-35", front: "Borrow", back: "Odunc almak" },
  { id: "mem-36", front: "Ambitious", back: "Hirsli" },
  { id: "mem-37", front: "Selfish", back: "Bencil" },
  { id: "mem-38", front: "Expensive", back: "Pahali" },
  { id: "mem-39", front: "Cheap", back: "Ucuz" },
  { id: "mem-40", front: "Comfortable", back: "Rahat / konforlu" },
  { id: "mem-41", front: "Successful", back: "Basarili" },
  { id: "mem-42", front: "Friendly", back: "Dost canlisi" },
  { id: "mem-43", front: "Stative verb", back: "Durum fiili" },
  { id: "mem-44", front: "Possession", back: "Sahiplik" },
  { id: "mem-45", front: "Opinion", back: "Gorus / fikir" },
  { id: "mem-46", front: "Arrangement", back: "Onceden ayarlanmis plan" },
  { id: "mem-47", front: "Timetable", back: "Tarife / zaman cizelgesi" },
  { id: "mem-48", front: "Ownership", back: "Sahiplik" },
  { id: "mem-49", front: "Share", back: "Paylasmak" },
  { id: "mem-50", front: "Separate", back: "Ayri / ayirmak" },
  { id: "mem-51", front: "Own", back: "Kendine ait" },
  { id: "mem-52", front: "Colleague", back: "Is arkadasi" },
  { id: "mem-53", front: "Bakery", back: "Firin" },
  { id: "mem-54", front: "Habit", back: "Aliskanlik" },
  { id: "mem-55", front: "Interrupted", back: "Bolunmus / kesintiye ugramis" },
  { id: "mem-56", front: "Background action", back: "Arka plan eylemi" },
  { id: "mem-57", front: "Across", back: "Karsiya / bir uctan diger uca" },
  { id: "mem-58", front: "Through", back: "Icinden gecerek" },
  { id: "mem-59", front: "Along", back: "Boyunca" },
  { id: "mem-60", front: "Towards", back: "-e dogru" },
  { id: "mem-61", front: "Apply for", back: "Basvurmak" },
  { id: "mem-62", front: "Rely on", back: "Guvenmek / bel baglamak" },
  { id: "mem-63", front: "Proud of", back: "Gurur duymak" },
  { id: "mem-64", front: "Worried about", back: "Endiseli olmak" },
  { id: "mem-65", front: "Prediction", back: "Tahmin" },
  { id: "mem-66", front: "Promise", back: "Soz vermek / vaat" },
  { id: "mem-67", front: "Offer", back: "Teklif etmek / teklif" },
  { id: "mem-68", front: "Instant decision", back: "Aninda verilen karar" },
  { id: "mem-69", front: "Intention", back: "Niyet" },
  { id: "mem-70", front: "Evidence-based", back: "Kanita dayali" },
  { id: "mem-71", front: "Conditional", back: "Kosul yapisi" },
  { id: "mem-72", front: "Imaginary", back: "Hayali / gercek disi" },
  { id: "mem-73", front: "Consequence", back: "Sonuc" },
  { id: "mem-74", front: "Unless", back: "Eger ... degilse" },
  { id: "mem-75", front: "Already", back: "Zaten / coktan" },
  { id: "mem-76", front: "Yet", back: "Henuz" },
  { id: "mem-77", front: "Recently", back: "Yakin zamanda" },
  { id: "mem-78", front: "Lately", back: "Son zamanlarda" },
  { id: "mem-79", front: "Since", back: "-den beri" },
  { id: "mem-80", front: "Obligation", back: "Zorunluluk" },
  { id: "mem-81", front: "Necessity", back: "Gereklilik" },
  { id: "mem-82", front: "Prohibition", back: "Yasak" },
  { id: "mem-83", front: "Advice", back: "Tavsiye" },
  { id: "mem-84", front: "Ability", back: "Yetenek" },
  { id: "mem-85", front: "Permission", back: "Izin" },
  { id: "mem-86", front: "Deduction", back: "Mantiksal cikarim" },
  { id: "mem-87", front: "Manage to", back: "Basarmak" },
  { id: "mem-88", front: "Get up", back: "Kalkmak" },
  { id: "mem-89", front: "Set off", back: "Yola cikmak" },
  { id: "mem-90", front: "Switch off", back: "Kapatmak" },
  { id: "mem-91", front: "Fill in", back: "Doldurmak" },
  { id: "mem-92", front: "Put away", back: "Yerine koymak" },
  { id: "mem-93", front: "Pay back", back: "Geri odemek" },
  { id: "mem-94", front: "Take after", back: "Birine benzemek" },
  { id: "mem-95", front: "Look after", back: "Bakmak / ilgilenmek" },
  { id: "mem-96", front: "Look forward to", back: "Heyecanla beklemek" },
  { id: "mem-97", front: "Give away", back: "Bedava vermek / dagitmak" },
  { id: "mem-98", front: "Agree to", back: "Kabul etmek" },
  { id: "mem-99", front: "Decide to", back: "Karar vermek" },
  { id: "mem-100", front: "Avoid", back: "Kacinmak" },
  { id: "mem-101", front: "Allow", back: "Izin vermek" },
  { id: "mem-102", front: "Persuade", back: "Ikna etmek" },
  { id: "mem-103", front: "Have something done", back: "Bir isi birine yaptirmak" },
  { id: "mem-104", front: "Get something done", back: "Bir isi yaptirtmak" },
  { id: "mem-105", front: "Repair", back: "Tamir etmek" },
  { id: "mem-106", front: "Redecorate", back: "Yeniden dekore etmek" },
  { id: "mem-107", front: "Passive voice", back: "Edilgen yapi" },
  { id: "mem-108", front: "Reported speech", back: "Dolayli anlatim" },
  { id: "mem-109", front: "Whether", back: "Olup olmadigi" },
  { id: "mem-110", front: "Request", back: "Rica / talep" },
  { id: "mem-111", front: "Third conditional", back: "Ucuncu kosul yapisi" },
  { id: "mem-112", front: "Regret", back: "Pismanlik / pisman olmak" },
  { id: "mem-113", front: "Auxiliary verb", back: "Yardimci fiil" },
  { id: "mem-114", front: "Main verb", back: "Ana fiil" }
];

MEMORIZATION_CARDS.splice(28, MEMORIZATION_CARDS.length - 28, ...EXTRA_MEMORIZATION_CARDS);

const RECAP_CARDS = [
  {
    unit: "1A",
    title: "Kelime Listesi",
    formula: "evidence / survey / stand out / maiden name",
    rule: "Kelimeyi sadece anlamıyla değil, örnek cümlesiyle beraber ezberle.",
    example: "There is strong evidence that exercise improves mental health.",
    trap: "Benzer kelimeleri karıştırma: proof daha çok somut ispat, evidence ise destekleyici kanıt gibi kullanılır."
  },
  {
    unit: "1A",
    title: "Object Pronouns",
    formula: "verb + IO + DO / verb + DO + to-for + IO",
    rule: "Direct object şeydir; indirect object alan kişidir. Preposition sonrası object pronoun gelir.",
    example: "James will lend it to her. / Mary gave me some money.",
    trap: "I gave it to she değil, I gave it to her."
  },
  {
    unit: "1B",
    title: "Adjectives",
    formula: "a bit + comparative / much + comparative / the best-the worst",
    rule: "Tekil sayılabilen noun önünde adjective varsa çoğu zaman a/an gerekir.",
    example: "She is a very ambitious person. / Cats are much more selfish than dogs.",
    trap: "the most bad değil, the worst. Uncountable noun ile one/ones kullanma."
  },
  {
    unit: "2A",
    title: "Present Tenses",
    formula: "stative -> present simple / arrangement -> present continuous / timetable -> present simple",
    rule: "Anlama göre seç: opinion-possession-understanding simple; süreç ve ayarlanmış plan continuous olabilir.",
    example: "I think it's a good idea. / I'm meeting my friends tonight. / The train leaves at 6.30.",
    trap: "I'm knowing, I'm wanting gibi stative continuous hatalarından kaçın."
  },
  {
    unit: "2B",
    title: "Possessives",
    formula: "person + 's / plural s' / of + thing / own",
    rule: "Kişi sahipliğinde 's, cansız yapılarda çoğu zaman of, vurgu için own kullanılır.",
    example: "my friend's car / the end of the film / their own company",
    trap: "Shared possession varsa sadece ikinci isme 's gelir: Emma and Mia's house."
  },
  {
    unit: "3A",
    title: "Past Tenses & Used To",
    formula: "past simple / past continuous / used to",
    rule: "Finished action için past simple, arka plan veya bölünen eylem için past continuous, eski alışkanlık için used to.",
    example: "I was reading when the phone rang. / We used to go to the beach every weekend.",
    trap: "Did you went değil, Did you go. Didn't used to değil, didn't use to."
  },
  {
    unit: "3B",
    title: "Prepositions",
    formula: "place / movement / dependent preposition",
    rule: "Bazı verb ve adjective kalıpları sabit preposition ister; preposition sonrası fiil gelirse -ing alır.",
    example: "interested in science / good at painting / looking forward to seeing you",
    trap: "discuss about yanlış; discuss the problem doğru."
  },
  {
    unit: "4A",
    title: "Future Forms",
    formula: "will / be going to / present continuous / was-were going to",
    rule: "Anlık karar ve sözler için will, plan ve evidence için going to, ayarlanmış randevu için present continuous.",
    example: "I'll get it. / It's going to rain. / I'm seeing the doctor on Friday.",
    trap: "Failed plan anlatırken was/were going to kullan: I was going to call you, but..."
  },
  {
    unit: "4B",
    title: "First Conditional",
    formula: "if + present simple, will + verb1",
    rule: "Gerçek veya muhtemel gelecek sonucu anlatır.",
    example: "If it rains, we'll stay at home.",
    trap: "If clause içinde will kullanma. Gerekirse ana cümlede imperative veya can da gelebilir."
  },
  {
    unit: "4B",
    title: "Second Conditional",
    formula: "if + past simple, would-could + verb1",
    rule: "Şimdiki veya gelecekteki hayali-gerçek dışı durumları anlatır.",
    example: "If I won the lottery, I would travel more. / If I spoke Spanish, I could work in Spain.",
    trap: "Bu past form geçmiş zaman anlamı taşımaz. Tavsiye kalıbı: If I were you..."
  },
  {
    unit: "5A",
    title: "Present Perfect Simple",
    formula: "have-has + V3 / just-already-yet / for-since",
    rule: "Belirsiz zamanlı deneyim, yeni olmuş haber ve şimdiye bağlanan durumlar için kullanılır.",
    example: "I've just sent the email. / Have you ever been to Edinburgh?",
    trap: "Yesterday, last week, in 2020 gibi net geçmiş zamanı varsa past simple kullan."
  },
  {
    unit: "5B",
    title: "Present Perfect Continuous",
    formula: "have-has been + V-ing",
    rule: "Geçmişte başlayıp etkisi şimdi süren süreçleri veya tekrar eden son dönem aktivitelerini vurgular.",
    example: "I've been working too hard lately. / We've been living here since last year.",
    trap: "know, believe, want gibi stative verbs ile genelde continuous kullanma."
  },
  {
    unit: "6A",
    title: "Modals of Obligation",
    formula: "must / have to / don't have to / mustn't / should",
    rule: "mustn't yasak, don't have to gereklilik yok, should tavsiye, had to geçmiş zorunluluktur.",
    example: "You mustn't be rude. / We don't have to leave yet. / You should rest.",
    trap: "mustn't ile don't have to anlamca zıttır; ikisini karıştırma."
  },
  {
    unit: "6B",
    title: "Ability & Deduction",
    formula: "can / could / be able to / must / can't",
    rule: "Genel geçmiş yetenekte could, tek zor başarılı olayda was-were able to veya managed to daha doğrudur.",
    example: "He could play the violin when he was four. / I was able to change the wheel.",
    trap: "Future ability için can değil, will be able to kullan."
  },
  {
    unit: "7A",
    title: "Phrasal Verbs",
    formula: "no object / separable / inseparable",
    rule: "Pronoun varsa separable phrasal verb içinde nesne fiil ile particle arasına girer.",
    example: "turn it off / pay it back / look after her / look forward to the trip",
    trap: "turn off it yanlış. Inseparable yapılarda ayırma: look after him."
  },
  {
    unit: "7B",
    title: "Verb Patterns",
    formula: "to-infinitive / gerund / bare infinitive / object + infinitive",
    rule: "Fiile göre devamındaki yapı değişir: enjoy doing, decide to do, let-make somebody do.",
    example: "We enjoy going to concerts. / Karen's teacher allowed her to leave early.",
    trap: "let ve make sonrasında to kullanma."
  },
  {
    unit: "8A",
    title: "Causative",
    formula: "have + object + V3 / get + object + V3",
    rule: "İşi kendin yapmadığında, birine yaptırdığında bu yapı kullanılır.",
    example: "I had my hair cut yesterday. / We're going to get the roof repaired.",
    trap: "I had cut my hair ile I had my hair cut aynı şey değildir."
  },
  {
    unit: "8B",
    title: "Passive Voice",
    formula: "be + V3",
    rule: "Passive'in çekirdeği hep be + past participle mantığıdır; tense sadece be kısmını değiştirir.",
    example: "The museum was opened in 1997. / The bridge has been repaired.",
    trap: "Active'i passive yaparken asıl odak nesneye geçer; gerekmedikçe by + agent ekleme."
  },
  {
    unit: "9A",
    title: "Reported Speech",
    formula: "say-tell / ask if-whether / ask-tell + object + to infinitive",
    rule: "Reported question içinde do-does-did kalkar ve kelime sırası düz cümle olur.",
    example: "He asked me where I lived. / They asked us to fill in the form.",
    trap: "where did I live değil, where I lived."
  },
  {
    unit: "9B",
    title: "Third Conditional & Past Perfect",
    formula: "if + had V3, would have + V3 / had + V3",
    rule: "Gerçekleşmemiş geçmiş ihtimal ve pişmanlıkları anlatır; earlier past action için de past perfect kullanılır.",
    example: "If I'd known, I would have called. / When we arrived, the film had started.",
    trap: "Third conditional'da hem if clause hem result clause geçmişe göre kurulur; would have şartlı ana cümlededir."
  },
  {
    unit: "10A",
    title: "Be / Do / Have",
    formula: "main verb vs auxiliary",
    rule: "Bu üç fiil hem ana fiil hem yardımcı fiil olabilir; doğru auxiliary seçimi tense'i belirler.",
    example: "Does she work here? / Is she working now? / Has she finished yet?",
    trap: "Aynı cümlede fiilin görevi değişebilir; soru kurarken anlam değil yapı üzerinden düşün."
  }
];

const EXTRA_RECAP_CARDS = [
  {
    unit: "1A",
    title: "Pronoun Map",
    formula: "I-me-my-mine / he-him-his-his / they-them-their-theirs",
    rule: "Subject, object, possessive adjective ve possessive pronoun formlarini birbirinden ayir.",
    example: "She gave it to him. / This bag is mine.",
    trap: "to she, for they gibi kullanimlar yanlistir.",
    compare: "Subject pronoun eylemi yapar; object pronoun eylemden etkilenir.",
    checklist: ["preposition sonrasi object pronoun kullan", "thing icin it / them dusun", "sahiplikte my ve mine farkini ayir"]
  },
  {
    unit: "1B",
    title: "One / Ones",
    formula: "singular -> one / plural -> ones",
    rule: "Countable noun tekrarini onlemek icin one / ones kullanilir.",
    example: "The blue one / the red ones",
    trap: "uncountable noun ile one / ones kullanma: bread, milk, money",
    compare: "one bir ismin yerine gecer; adjective'in yerine gecmez.",
    checklist: ["tekilse one", "cogulsa ones", "uncountable ise noun'u tekrar et"]
  },
  {
    unit: "1B",
    title: "Comparative vs Superlative",
    formula: "bigger than / the biggest / more interesting / the most interesting",
    rule: "Iki sey karsilastiriyorsan comparative, grup icinde en ust duzeyi soyluyorsan superlative kullan.",
    example: "Tom is taller than Jim. / Tom is the tallest in the class.",
    trap: "the most bad degil, the worst; more bored dogru ama bored-er yanlis.",
    compare: "comparative genelde than ile gider; superlative oncesinde the gelir.",
    checklist: ["than gorursen comparative kontrol et", "the varsa superlative dusun", "irregular: good-better-best / bad-worse-worst"]
  },
  {
    unit: "2A",
    title: "Stative Verbs",
    formula: "know / want / need / like / believe / understand",
    rule: "Durum, dusunce, sahiplik ve duygu anlatan fiiller genelde continuous almaz.",
    example: "I know the answer. / I want a coffee.",
    trap: "I'm knowing, I'm liking, I'm wanting tipik sinav hatalaridir.",
    compare: "Bazilari anlama gore degisir: I think so / I'm thinking about it.",
    checklist: ["opinion ise simple", "possession ise simple", "process ise continuous olabilir"]
  },
  {
    unit: "2A",
    title: "Arrangement vs Timetable",
    formula: "present continuous vs present simple",
    rule: "Ayarlanmis plan ve randevu present continuous; tarife, program ve sefer saatleri present simple olur.",
    example: "I'm meeting her at 7. / The flight leaves at 6.30.",
    trap: "Her future cumlede will veya going to kullanmak zorunda degilsin.",
    compare: "personal arrangement != public schedule",
    checklist: ["kisi-randevu varsa continuous dusun", "otobus-tren-ucak saatinde simple dusun", "soru formunu da ayni mantikla kur"]
  },
  {
    unit: "2B",
    title: "Shared vs Separate Possession",
    formula: "Emma and Mia's / Emma's and Mia's",
    rule: "Tek esya veya yer ortaksa sadece ikinci isme 's gelir; ayri sahiplikte ikisine de gelir.",
    example: "Emma and Mia's house / Emma's and Mia's bags",
    trap: "Ortak sahipligi iki kez 's ile yazma.",
    compare: "one house -> one apostrophe / two bags -> two apostrophes",
    checklist: ["once ortak mi ayri mi karar ver", "cansiz nesnelerde of yapisini da dusun", "own vurgusu ayrica kullanilabilir"]
  },
  {
    unit: "3A",
    title: "Past Simple vs Past Continuous",
    formula: "finished action vs background action",
    rule: "Kisa ve bitmis olay simple; o anda suren arka plan eylemi continuous olur.",
    example: "I was studying when the lights went out.",
    trap: "when ve while gordugunde once hangi eylem uzun-suruyor diye bak.",
    compare: "phone rang = short action / was reading = longer action",
    checklist: ["bir eylem digerini boluyorsa continuous + simple dusun", "specific time in the past continuous olabilir", "finished sequence simple olur"]
  },
  {
    unit: "3A",
    title: "Used To",
    formula: "used to / didn't use to / did ... use to",
    rule: "Artik devam etmeyen eski aliskanlik ve durumlarda kullanilir.",
    example: "We used to live near the sea. / Did you use to play tennis?",
    trap: "didn't used to yanlis; did'den sonra use gelir.",
    compare: "used to aliskanlik verir; past simple sadece olayi soyler.",
    checklist: ["eski durum mu? used to olabilir", "negative-question'da use kullan", "kisa sureli olaylar icin kullanma"]
  },
  {
    unit: "3B",
    title: "Place vs Movement",
    formula: "in-on-under / into-through-across-along",
    rule: "Yer belirten prepositions ile hareket belirtenleri ayir.",
    example: "The keys are on the table. / She walked across the road.",
    trap: "towards hedefe ulasmak zorunda degildir; to daha net varis verir.",
    compare: "place = static / movement = dynamic",
    checklist: ["hareket var mi? once bunu kontrol et", "path mi destination mi ayir", "after preposition + ing kuralini unutma"]
  },
  {
    unit: "4A",
    title: "Will vs Going To",
    formula: "instant decision vs prior plan-evidence",
    rule: "Konusma aninda karar verirsen will; onceden dusunulmus plan veya gorunur kanit varsa going to.",
    example: "I'll answer it. / We're going to buy a new phone.",
    trap: "Look at the clouds! will rain yerine going to rain daha dogal.",
    compare: "reaction now != plan before now",
    checklist: ["ani tepki -> will", "niyet-plan -> going to", "visible evidence -> going to"]
  },
  {
    unit: "4A",
    title: "Future in the Past",
    formula: "was / were going to",
    rule: "Gecmiste planlanmis ama gerceklesmemis niyetleri anlatir.",
    example: "I was going to call you, but I forgot.",
    trap: "Failed plan icin basit going to yetmez; was/were going to gerekir.",
    compare: "future in the past = o zaman gelecekti ama olmadi",
    checklist: ["gecmiste plan var mi", "gerceklesmedi mi", "iki bolumu but ile baglayabiliyor musun"]
  },
  {
    unit: "4B",
    title: "Would vs Could",
    formula: "would = result / could = ability-possibility",
    rule: "Second conditional'da would sonucu, could ise mumkunluk veya kapasiteyi gosterir.",
    example: "If I had more money, I would move. / I could travel more.",
    trap: "Ikisini ayni anlamda ezberleme; function farki vardir.",
    compare: "would happen vs could do",
    checklist: ["sonuc mu anlatiyor", "beceri-imkan mi anlatiyor", "ikisini ayni cumlede gerekirse ayir"]
  },
  {
    unit: "5A",
    title: "Just / Already / Yet",
    formula: "just = yeni oldu / already = coktan / yet = henuz",
    rule: "Bu zarflar present perfect simple ile cok sik kullanilir.",
    example: "I've just eaten. / She's already left. / I haven't finished yet.",
    trap: "yet genelde soru ve olumsuzda; already genelde olumluda daha dogaldir.",
    compare: "just ve already olumluya yakisir, yet ise eksik-beklenen sonuca gider.",
    checklist: ["new news mi", "beklenenden once mi", "hala olmadi mi"]
  },
  {
    unit: "5A",
    title: "For vs Since",
    formula: "for + period / since + starting point",
    rule: "Sure veriyorsan for, baslangic noktasi veriyorsan since kullan.",
    example: "for two years / since 2024 / since Monday",
    trap: "since two years yanlis; for two years dogru.",
    compare: "period vs point",
    checklist: ["two weeks -> for", "last summer -> since", "3 o'clock -> since"]
  },
  {
    unit: "5B",
    title: "Simple vs Continuous Perfect",
    formula: "have-has + V3 vs have-has been + V-ing",
    rule: "Simple sonuca veya deneyime, continuous surece ve son etkisine odaklanir.",
    example: "I've painted the kitchen. / I've been painting the kitchen.",
    trap: "stative verbs ile perfect continuous kullanma: I've known her for years.",
    compare: "finished result vs ongoing activity",
    checklist: ["sonuc mu onemli", "surec mu onemli", "visible effect var mi"]
  },
  {
    unit: "6A",
    title: "Mustn't vs Don't Have To",
    formula: "mustn't = yasak / don't have to = gerek yok",
    rule: "Bu iki yapi sinavda en sik karistirilan ciftlerden biridir.",
    example: "You mustn't smoke here. / You don't have to come early.",
    trap: "don't have to serbestlik verir; mustn't yasak koyar.",
    compare: "prohibition vs no necessity",
    checklist: ["yasak mi", "opsiyonel mi", "advice mi -> should dusun"]
  },
  {
    unit: "6B",
    title: "Could vs Was/Were Able To",
    formula: "general past ability vs one successful event",
    rule: "Genel gecmis yetenekte could, tek ve basarili spesifik olayda was/were able to daha iyidir.",
    example: "She could swim at five. / We were able to find the house.",
    trap: "specific success icin could bazen dogal gelmez.",
    compare: "general ability vs successful occasion",
    checklist: ["genel mi spesifik mi", "tek basarili olay mi", "future ise be able to dusun"]
  },
  {
    unit: "7A",
    title: "Separable vs Inseparable",
    formula: "turn it off / look after him",
    rule: "Pronoun varsa separable phrasal verb'de nesne ortada olur; inseparable yapida ayrilmaz.",
    example: "switch it off / pay it back / look after the baby",
    trap: "turn off it yanlis; look him after da yanlis.",
    compare: "type 2 separable vs type 3 inseparable",
    checklist: ["pronoun var mi", "fiil ayrilabiliyor mu", "iki-particle ise ayirmama ihtimalini dusun"]
  },
  {
    unit: "7B",
    title: "Let / Make / Allow",
    formula: "let-make + object + bare infinitive / allow + object + to infinitive",
    rule: "Bu uc kalip birlikte soruldugunda en cok to hatasi yapilir.",
    example: "They made us wait. / She let him go. / They allowed us to leave.",
    trap: "let him to go yanlis; allow him go yanlis.",
    compare: "let-make yalindir / allow to alir",
    checklist: ["let? to yok", "make? to yok", "allow? to var"]
  },
  {
    unit: "8A",
    title: "Have vs Get Something Done",
    formula: "have/get + object + V3",
    rule: "Ikisi de yaptirma verir; get gunluk dilde daha konusma diline yakindir.",
    example: "I had my phone repaired. / I'm going to get my hair cut.",
    trap: "Yapan kisi sen degilsen normal active cumle kullanma.",
    compare: "same meaning, different tone",
    checklist: ["object'i bul", "V3 kullan", "gerekirse tense'i auxiliary ile kur"]
  },
  {
    unit: "8B",
    title: "Passive Tense Map",
    formula: "is done / was done / is being done / has been done / will be done",
    rule: "Passive tense'i bulmak icin once active zamanini bul, sonra be kismini cevir.",
    example: "They are building it. -> It is being built.",
    trap: "V3'ten vazgecme; passive'in sabit parcasi odur.",
    compare: "tense changes in be, not in past participle",
    checklist: ["active tense'i bul", "subject-object odagini degistir", "be + V3 kalibini koru"]
  },
  {
    unit: "9A",
    title: "Reported Questions",
    formula: "ask + if-whether / question word + statement order",
    rule: "Yes-no question if/whether alir; wh-question kelimeyi korur ama duz cumle sirasi ister.",
    example: "She asked if I was ready. / He asked where I lived.",
    trap: "where did I live ve if was I ready yanlistir.",
    compare: "question mark mantigi gider, statement order gelir",
    checklist: ["do-does-did'i sil", "subject + verb sirasi kur", "if/whether gerekip gerekmedigini kontrol et"]
  },
  {
    unit: "9A",
    title: "Reported Requests",
    formula: "ask-tell + object + to infinitive",
    rule: "Emir, istek ve rica aktariminda object + to infinitive cok temel kaliptir.",
    example: "She told me to wait. / They asked us to close the door.",
    trap: "asked to close the door diyebilirsin ama kimin kapattigini object belirler.",
    compare: "statement degil, action request aktariliyor",
    checklist: ["speaker kimi yonlendiriyor", "object var mi", "to infinitive'i unutma"]
  },
  {
    unit: "9B",
    title: "Past Perfect Order",
    formula: "earlier past -> had + V3",
    rule: "Gecmiste iki olay varsa once olan olayi past perfect ile netlestir.",
    example: "When we arrived, the film had started.",
    trap: "Her gecmis cumlede past perfect gerekmez; daha once olan eylem varsa gerekir.",
    compare: "past perfect = daha once / past simple = sonra olan olay",
    checklist: ["iki gecmis olay var mi", "once olan hangisi", "hikaye sirasi karisiyor mu"]
  },
  {
    unit: "10A",
    title: "Auxiliary Choice",
    formula: "do for simple / be for continuous-passive / have for perfect",
    rule: "Soru veya olumsuz kurarken hangi auxiliary'nin tense'i tasidigini hizli secebilmelisin.",
    example: "Do you like it? / Are you working? / Have you finished?",
    trap: "Bir cumlede ana fiil gibi gorunen be-do-have baska cumlede auxiliary olabilir.",
    compare: "structure first, meaning second",
    checklist: ["simple mi continuous mu perfect mi", "question mi negative mi", "main verb hangisi auxiliary hangisi"]
  }
];

RECAP_CARDS.push(...EXTRA_RECAP_CARDS);

const TOTAL = TOPICS.length;
const QUESTION_BANK = TOPICS.flatMap((topic) =>
  topic.quiz.map((question, index) => ({
    ...question,
    topicId: topic.id,
    topicTitle: topic.title,
    unit: topic.unit,
    uid: `${topic.id}-${index}`
  }))
);

const progressRef = doc(db, "progress", "ravza");
let activeExam = null;
let examTimer = null;
let activeRecapUnits = [...new Set(RECAP_CARDS.map((card) => card.unit))];

function safeText(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getStudyKey(id) {
  return `eul_study_${id}`;
}

function getQuizKey(id) {
  return `eul_quiz_${id}`;
}

function isStudyDone(id) {
  return localStorage.getItem(getStudyKey(id)) === "true";
}

function isQuizDone(id) {
  return localStorage.getItem(getQuizKey(id)) === "true";
}

function setStudyDone(id, value) {
  localStorage.setItem(getStudyKey(id), value ? "true" : "false");
}

function setQuizDone(id, value) {
  localStorage.setItem(getQuizKey(id), value ? "true" : "false");
}

function getBestExam() {
  return Number(localStorage.getItem("eul_best_exam") || 0);
}

function setBestExam(value) {
  localStorage.setItem("eul_best_exam", String(value));
}

function getExamHistory() {
  try {
    const raw = localStorage.getItem("eul_exam_history");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setExamHistory(history) {
  localStorage.setItem("eul_exam_history", JSON.stringify(history.slice(0, 5)));
}

function countStudyDone() {
  return TOPICS.filter((topic) => isStudyDone(topic.id)).length;
}

function countQuizDone() {
  return TOPICS.filter((topic) => isQuizDone(topic.id)).length;
}

function formatPercent(score, total) {
  return total === 0 ? 0 : Math.round((score / total) * 100);
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildExamQuestions(questionCount) {
  const chosen = [];
  const used = new Set();

  shuffle(TOPICS).forEach((topic) => {
    if (chosen.length >= questionCount) return;
    const candidate = shuffle(
      QUESTION_BANK.filter((question) => question.topicId === topic.id && !used.has(question.uid))
    )[0];

    if (!candidate) return;
    chosen.push(candidate);
    used.add(candidate.uid);
  });

  shuffle(QUESTION_BANK).forEach((question) => {
    if (chosen.length >= questionCount || used.has(question.uid)) return;
    chosen.push(question);
    used.add(question.uid);
  });

  return shuffle(chosen).slice(0, questionCount).map((item, index) => ({
    ...item,
    uid: `${item.uid}-${Date.now()}-${index}`
  }));
}

function initTheme() {
  const saved = localStorage.getItem("eul_theme");
  if (saved === "dark") applyDark(true);
}

function applyDark(isDark) {
  document.body.classList.toggle("dark", isDark);
  const btn = document.getElementById("theme-switch");
  if (btn) {
    btn.setAttribute("aria-label", isDark ? "Gündüz moduna geç" : "Karanlık moda geç");
  }
  const topBtn = document.getElementById("topbar-theme-btn");
  if (topBtn) {
    topBtn.textContent = isDark ? "☀️" : "🌙";
  }
}

function toggleTheme() {
  const isDark = !document.body.classList.contains("dark");
  applyDark(isDark);
  localStorage.setItem("eul_theme", isDark ? "dark" : "light");
}

function closeMobileMenu() {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.classList.remove("open");
  document.body.classList.remove("nav-open");
}

function navigate(pageId) {
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  document.querySelectorAll(".nav-links button").forEach((button) => button.classList.remove("active"));

  const page = document.getElementById(pageId);
  if (page) {
    page.classList.add("active");
  }

  const navMap = {
    dashboard: "nav-dashboard",
    studyhub: "nav-studyhub",
    studydetail: "nav-studyhub",
    memoryhub: "nav-memoryhub",
    quizhub: "nav-quizhub",
    quizdetail: "nav-quizhub",
    examcenter: "nav-examcenter",
    recap: "nav-recap"
  };

  const navButton = document.getElementById(navMap[pageId]);
  if (navButton) {
    navButton.classList.add("active");
  }

  if (window.innerWidth <= 768) {
    closeMobileMenu();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toggleMenu() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  const isOpen = !sidebar.classList.contains("open");
  sidebar.classList.toggle("open", isOpen);
  document.body.classList.toggle("nav-open", isOpen);
}

function searchTopics(event) {
  if (event?.key && event.key !== "Enter") return;
  const input = document.getElementById("searchInput");
  if (!input) return;
  const q = input.value.trim().toLowerCase();
  if (q.length < 2) return;

  const found = TOPICS.find((topic) =>
    topic.title.toLowerCase().includes(q) ||
    topic.subtitle.toLowerCase().includes(q) ||
    topic.unit.toLowerCase().includes(q) ||
    topic.keyPoints.some((point) => point.toLowerCase().includes(q))
  );

  if (found) {
    openStudyTopic(found.id);
    return;
  }

  if (q.includes("sınav") || q.includes("exam")) {
    navigate("examcenter");
    return;
  }

  if (q.includes("quiz")) {
    navigate("quizhub");
    return;
  }

  if (q.includes("ezber") || q.includes("kelime") || q.includes("kart") || q.includes("vocabulary") || q.includes("word")) {
    navigate("memoryhub");
    return;
  }

  navigate("studyhub");
}

async function loadProgressFromFirebase() {
  try {
    const snap = await getDoc(progressRef);
    if (!snap.exists()) return;

    const data = snap.data();

    if (data.completedStudy) {
      Object.entries(data.completedStudy).forEach(([topicId, value]) => {
        setStudyDone(topicId, Boolean(value));
      });
    }

    if (data.completedQuiz) {
      Object.entries(data.completedQuiz).forEach(([topicId, value]) => {
        setQuizDone(topicId, Boolean(value));
      });
    }

    if (!data.completedStudy && data.completed) {
      Object.entries(data.completed).forEach(([topicId, value]) => {
        setStudyDone(topicId, Boolean(value));
      });
    }

    if (typeof data.bestExam === "number") {
      setBestExam(data.bestExam);
    }

    if (Array.isArray(data.examHistory)) {
      setExamHistory(data.examHistory);
    }
  } catch (error) {
    console.error("Firebase progress okunamadı:", error);
  }
}

async function saveProgressToFirebase() {
  try {
    const completedStudy = {};
    const completedQuiz = {};

    TOPICS.forEach((topic) => {
      completedStudy[topic.id] = isStudyDone(topic.id);
      completedQuiz[topic.id] = isQuizDone(topic.id);
    });

    await setDoc(
      progressRef,
      {
        completed: completedStudy,
        completedStudy,
        completedQuiz,
        bestExam: getBestExam(),
        examHistory: getExamHistory(),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Firebase progress kaydedilemedi:", error);
  }
}

function updateDashboardStats() {
  const studyCount = countStudyDone();
  const quizCount = countQuizDone();
  const bestExam = getBestExam();
  const studyPercent = formatPercent(studyCount, TOTAL);
  const quizPercent = formatPercent(quizCount, TOTAL);
  const latestExam = getExamHistory()[0];

  const statStudy = document.getElementById("stat-study-complete");
  const statQuiz = document.getElementById("stat-quiz-complete");
  const statBest = document.getElementById("stat-best-exam");
  const statBank = document.getElementById("stat-question-bank");

  if (statStudy) statStudy.textContent = `${studyCount}/${TOTAL}`;
  if (statQuiz) statQuiz.textContent = `${quizCount}/${TOTAL}`;
  if (statBest) statBest.textContent = `${bestExam}%`;
  if (statBank) statBank.textContent = String(QUESTION_BANK.length);

  const studyFill = document.getElementById("study-progress-fill");
  const studyLabel = document.getElementById("study-progress-label");
  const studyText = document.getElementById("study-progress-text");
  if (studyFill) studyFill.style.width = `${studyPercent}%`;
  if (studyLabel) studyLabel.textContent = `${studyPercent}%`;
  if (studyText) studyText.textContent = `${studyCount} / ${TOTAL} çalışma tamamlandı`;

  const quizFill = document.getElementById("quiz-progress-fill");
  const quizLabel = document.getElementById("quiz-progress-label");
  const quizText = document.getElementById("quiz-progress-text");
  if (quizFill) quizFill.style.width = `${quizPercent}%`;
  if (quizLabel) quizLabel.textContent = `${quizPercent}%`;
  if (quizText) quizText.textContent = `${quizCount} / ${TOTAL} quiz tamamlandı`;

  const latestExamBox = document.getElementById("latest-exam-box");
  if (latestExamBox) {
    latestExamBox.innerHTML = latestExam
      ? `<strong>${safeText(latestExam.label)}</strong><br>${latestExam.score}/${latestExam.total} doğru · ${latestExam.percentage}%<br><small>${safeText(formatDateTime(latestExam.date))}</small>`
      : "Henüz bir sınav sonucu yok.";
  }

  const examBankCount = document.getElementById("exam-bank-count");
  const examBestInline = document.getElementById("exam-best-inline");
  const examLastInline = document.getElementById("exam-last-inline");
  if (examBankCount) examBankCount.textContent = String(QUESTION_BANK.length);
  if (examBestInline) examBestInline.textContent = `${bestExam}%`;
  if (examLastInline) {
    examLastInline.textContent = latestExam ? `${latestExam.score}/${latestExam.total}` : "—";
  }
}

function renderStudyHub(filterText = "") {
  const grid = document.getElementById("studyHubGrid");
  if (!grid) return;
  const q = filterText.trim().toLowerCase();

  const filtered = TOPICS.filter((topic) =>
    topic.title.toLowerCase().includes(q) ||
    topic.subtitle.toLowerCase().includes(q) ||
    topic.unit.toLowerCase().includes(q)
  );

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-grid">Bu aramaya uygun konu bulunamadı.</div>`;
    return;
  }

  grid.innerHTML = filtered
    .map((topic) => {
      const done = isStudyDone(topic.id);
      const difficultyLabel = topic.difficulty === "easy" ? "Kolay" : topic.difficulty === "medium" ? "Orta" : "Zor";
      return `
        <article class="topic-card">
          <div class="topic-card-top">
            <span class="unit-badge">${safeText(topic.unit)}</span>
            <span class="status-chip ${done ? "done" : "waiting"}">${done ? "Tamamlandı" : "Bekliyor"}</span>
          </div>
          <div>
            <h3 class="topic-title">${safeText(topic.title)}</h3>
            <p>${safeText(topic.subtitle)}</p>
          </div>
          <div class="topic-meta">
            <span class="difficulty-chip ${topic.difficulty}">${difficultyLabel}</span>
            <span class="status-chip ready">${topic.time} dk</span>
          </div>
          <p class="helper-line">Bu bölüm yalnızca konu çalışmak için tasarlandı. Quiz kısmı ayrı sayfadadır.</p>
          <div class="topic-actions">
            <button class="primary-btn" onclick="openStudyTopic('${topic.id}')">Konuya Git</button>
            <button class="mark-btn ${done ? "done" : ""}" onclick="toggleStudyDone('${topic.id}')">${done ? "☑️ Tamamlandı" : "✅ Çalışmayı Bitirdim"}</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderQuizHub(filterText = "") {
  const grid = document.getElementById("quizHubGrid");
  if (!grid) return;
  const q = filterText.trim().toLowerCase();

  const filtered = TOPICS.filter((topic) =>
    topic.title.toLowerCase().includes(q) ||
    topic.subtitle.toLowerCase().includes(q) ||
    topic.unit.toLowerCase().includes(q)
  );

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-grid">Bu aramaya uygun quiz bulunamadı.</div>`;
    return;
  }

  grid.innerHTML = filtered
    .map((topic) => {
      const quizDone = isQuizDone(topic.id);
      const studyDone = isStudyDone(topic.id);
      return `
        <article class="topic-card">
          <div class="topic-card-top">
            <span class="unit-badge quiz-badge">${safeText(topic.unit)}</span>
            <span class="status-chip ${quizDone ? "done" : "ready"}">${quizDone ? "Çözüldü" : "Hazır"}</span>
          </div>
          <div>
            <h3 class="topic-title">${safeText(topic.title)} Quiz</h3>
            <p>${topic.quiz.length} soru · ${safeText(topic.subtitle)}</p>
          </div>
          <div class="topic-meta">
            <span class="status-chip ${studyDone ? "done" : "waiting"}">${studyDone ? "Konu çalışıldı" : "Önce konu çalış"}</span>
          </div>
          <p class="helper-line">Quiz ekranı, çalışma notlarından ayrı tutuldu. Böylece soru çözme daha temiz ve odaklı olur.</p>
          <div class="topic-actions">
            <button class="primary-btn soft" onclick="openQuizTopic('${topic.id}')">Quiz Çöz</button>
            <button class="mark-btn ${quizDone ? "done" : ""}" onclick="toggleQuizDone('${topic.id}')">${quizDone ? "☑️ Quiz Bitti" : "✅ Quiz Tamamlandı"}</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function openStudyTopic(topicId) {
  const topic = TOPICS.find((item) => item.id === topicId);
  if (!topic) return;

  const container = document.getElementById("studyDetailContent");
  if (!container) return;

  const done = isStudyDone(topic.id);
  const difficultyLabel = topic.difficulty === "easy" ? "Kolay" : topic.difficulty === "medium" ? "Orta" : "Zor";

  container.innerHTML = `
    <div class="detail-shell">
      <div class="detail-hero">
        <div class="detail-topbar">
          <button class="ghost-btn" onclick="navigate('studyhub')">← Çalışma Merkezine Dön</button>
          <div class="topic-meta">
            <span class="unit-badge">${safeText(topic.unit)}</span>
            <span class="difficulty-chip ${topic.difficulty}">${difficultyLabel}</span>
            <span class="status-chip ${done ? "done" : "waiting"}">${done ? "Tamamlandı" : "Çalışılıyor"}</span>
          </div>
        </div>
        <h2 class="detail-title">${safeText(topic.title)}</h2>
        <p class="detail-subtitle">${safeText(topic.subtitle)}</p>
      </div>

      <div class="detail-grid">
        <div class="study-content">
          ${topic.summaryHtml}
          <div class="content-card">
            <h3>Kritik noktalar</h3>
            <div class="keypoint-list">
              ${topic.keyPoints.map((point) => `<div class="keypoint-item">${safeText(point)}</div>`).join("")}
            </div>
          </div>
        </div>

        <aside class="study-sidebar">
          <div class="side-card">
            <h3>Çalışma kartı</h3>
            <p><strong>Tahmini süre:</strong> ${topic.time} dakika</p>
            <p><strong>Seviye:</strong> ${difficultyLabel}</p>
            <p><strong>Sonraki adım:</strong> Konuyu bitirince ilgili quiz sayfasına geç.</p><p><strong>Not:</strong> Uygun olan konularda verdiğin kaynak metinleri doğrudan bu sayfaya işlendi.</p>
            <div class="topic-actions" style="margin-top:14px">
              <button class="mark-btn ${done ? "done" : ""}" onclick="toggleStudyDone('${topic.id}', true)">${done ? "☑️ Tamamlandı" : "✅ Çalışmayı Bitirdim"}</button>
              <button class="secondary-btn" onclick="openQuizTopic('${topic.id}')">İlgili Quize Geç</button>
            </div>
          </div>

          <div class="side-card">
            <h3>Nasıl tekrar edilmeli?</h3>
            <ul>
              <li>Kuralı sesli oku.</li>
              <li>Örnek cümleyi kendin yeniden kur.</li>
              <li>Karıştığın noktayı küçük not halinde yaz.</li>
              <li>Ardından quiz sayfasına geç.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  `;

  navigate("studydetail");
}

function openQuizTopic(topicId) {
  const topic = TOPICS.find((item) => item.id === topicId);
  if (!topic) return;

  const container = document.getElementById("quizDetailContent");
  if (!container) return;

  const quizDone = isQuizDone(topic.id);
  const studyDone = isStudyDone(topic.id);

  container.innerHTML = `
    <div class="quiz-shell">
      <div class="quiz-hero">
        <div class="quiz-topbar">
          <button class="ghost-btn" onclick="navigate('quizhub')">← Quiz Merkezine Dön</button>
          <div class="topic-meta">
            <span class="unit-badge quiz-badge">${safeText(topic.unit)}</span>
            <span class="status-chip ${quizDone ? "done" : "ready"}">${quizDone ? "Daha önce çözüldü" : "Hazır"}</span>
          </div>
        </div>
        <h2 class="quiz-title">${safeText(topic.title)} Quiz</h2>
        <p class="quiz-subtitle">${topic.quiz.length} soruluk ayrı quiz alanı. Notlar çalışma merkezinde kaldı; burada sadece soru çözersin.</p>
      </div>

      <div class="quiz-layout">
        <div class="quiz-form">
          ${topic.quiz.map((q, index) => `
            <div class="question-card" data-question-index="${index}">
              <div class="question-meta">Soru ${index + 1}</div>
              <div class="question-title">${safeText(q.question)}</div>
              <div class="option-list">
                ${q.options.map((option, optionIndex) => `
                  <label class="option-item">
                    <input type="radio" name="quiz-${topic.id}-${index}" value="${optionIndex}">
                    ${safeText(option)}
                  </label>
                `).join("")}
              </div>
            </div>
          `).join("")}

          <div class="topic-actions">
            <button class="check-btn" onclick="submitTopicQuiz('${topic.id}')">Cevapları Kontrol Et</button>
            <button class="ghost-btn" onclick="openStudyTopic('${topic.id}')">Konuya Geri Dön</button>
          </div>

          <div id="quiz-result-${topic.id}" class="quiz-result"></div>
        </div>

        <aside class="quiz-sidebar">
          <div class="side-card">
            <h3>Quiz notu</h3>
            <p>${studyDone ? "Bu konunun çalışma kısmı tamamlanmış görünüyor. Şimdi soru çözmeye hazırsın." : "Öneri: Önce konu anlatımını çalışıp sonra bu quiz'e gir. Böylece daha verimli olur."}</p>
            <div class="topic-actions" style="margin-top:14px">
              <button class="mark-btn ${quizDone ? "done" : ""}" onclick="toggleQuizDone('${topic.id}', true)">${quizDone ? "☑️ Quiz Tamamlandı" : "✅ Quiz Bitti"}</button>
            </div>
          </div>
          <div class="side-card">
            <h3>Odak noktaları</h3>
            <ul>
              ${topic.keyPoints.map((point) => `<li>${safeText(point)}</li>`).join("")}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  `;

  navigate("quizdetail");
}

function submitTopicQuiz(topicId) {
  const topic = TOPICS.find((item) => item.id === topicId);
  if (!topic) return;

  let score = 0;
  const explanations = [];

  topic.quiz.forEach((question, questionIndex) => {
    const wrapper = document.querySelector(`#quizDetailContent .question-card[data-question-index="${questionIndex}"]`);
    if (!wrapper) return;

    const labels = wrapper.querySelectorAll(".option-item");
    labels.forEach((label) => label.classList.remove("correct", "wrong"));

    const selected = wrapper.querySelector(`input[name="quiz-${topic.id}-${questionIndex}"]:checked`);
    const correctIndex = question.answer;

    labels.forEach((label, labelIndex) => {
      const radio = label.querySelector("input");
      radio.disabled = true;
      if (labelIndex === correctIndex) {
        label.classList.add("correct");
      }
    });

    if (selected && Number(selected.value) === correctIndex) {
      score += 1;
      explanations.push(`<li><strong>Soru ${questionIndex + 1}:</strong> Doğru. ${safeText(question.explanation)}</li>`);
    } else {
      if (selected) {
        selected.closest(".option-item")?.classList.add("wrong");
      }
      explanations.push(`<li><strong>Soru ${questionIndex + 1}:</strong> ${safeText(question.explanation)}</li>`);
    }
  });

  const result = document.getElementById(`quiz-result-${topic.id}`);
  if (!result) return;

  const percent = formatPercent(score, topic.quiz.length);
  setQuizDone(topic.id, true);

  result.className = `quiz-result show ${score === topic.quiz.length ? "success" : "error"}`;
  result.innerHTML = `
    <h3 class="result-title">Quiz Sonucu</h3>
    <p><strong>Puan:</strong> ${score}/${topic.quiz.length} · ${percent}%</p>
    <p>${score === topic.quiz.length ? "Harika! Bu quiz'i tamamen doğru çözdün." : "Quiz tamamlandı. Aşağıdaki açıklamaları gözden geçirip tekrar denemek istersen sayfayı yenileyebilirsin."}</p>
    <ul style="padding-left:18px; margin-top:8px; display:grid; gap:8px;">
      ${explanations.join("")}
    </ul>
  `;

  updateDashboardStats();
  renderQuizHub(document.getElementById("quizFilter")?.value || "");
  saveProgressToFirebase();
}

function toggleStudyDone(topicId, rerender = false) {
  setStudyDone(topicId, !isStudyDone(topicId));
  updateDashboardStats();
  renderStudyHub(document.getElementById("studyFilter")?.value || "");
  if (rerender) openStudyTopic(topicId);
  saveProgressToFirebase();
}

function toggleQuizDone(topicId, rerender = false) {
  setQuizDone(topicId, !isQuizDone(topicId));
  updateDashboardStats();
  renderQuizHub(document.getElementById("quizFilter")?.value || "");
  if (rerender) openQuizTopic(topicId);
  saveProgressToFirebase();
}

function renderMemorizationHub(filterText = "") {
  const grid = document.getElementById("memoryHubGrid");
  if (!grid) return;

  const q = filterText.trim().toLowerCase();
  const filtered = MEMORIZATION_CARDS.filter((card) =>
    card.front.toLowerCase().includes(q) ||
    card.back.toLowerCase().includes(q)
  );

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-grid">Bu aramaya uygun ezber kartı bulunamadı.</div>`;
    return;
  }

  grid.innerHTML = filtered
    .map((card) => `
      <button
        type="button"
        class="memory-card"
        onclick="toggleMemoryCard('${safeText(card.id)}')"
        onkeydown="handleMemoryCardKey(event, '${safeText(card.id)}')"
        data-card-id="${safeText(card.id)}"
        aria-label="${safeText(card.front)} kartını çevir">
        <div class="memory-card-inner">
          <span class="memory-face memory-front">
            <small>İngilizce</small>
            <strong>${safeText(card.front)}</strong>
            <em>Kartı çevir</em>
          </span>
          <span class="memory-face memory-back">
            <small>Türkçe</small>
            <strong>${safeText(card.back)}</strong>
            <em>Tekrar tıkla</em>
          </span>
        </div>
      </button>
    `)
    .join("");
}

function toggleMemoryCard(cardId) {
  const card = document.querySelector(`[data-card-id="${cardId}"]`);
  if (!card) return;
  card.classList.toggle("flipped");
}

function handleMemoryCardKey(event, cardId) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    toggleMemoryCard(cardId);
  }
}

function getRecapSearchValue() {
  const input = document.getElementById("recapFilter");
  return input ? input.value.trim().toLowerCase() : "";
}

function getAllRecapUnits() {
  return [...new Set(RECAP_CARDS.map((card) => card.unit))];
}

function getRecapDropdownLabel(units) {
  if (!activeRecapUnits.length) return "Unite sec";
  if (activeRecapUnits.length === units.length) return "Tum Uniteler";
  if (activeRecapUnits.length <= 2) return activeRecapUnits.join(", ");
  return `${activeRecapUnits.length} unite secili`;
}

function matchesRecapCard(card, searchText, selectedUnits) {
  if (!selectedUnits.length) return false;
  if (!selectedUnits.includes(card.unit)) return false;
  if (!searchText) return true;

  const haystack = [
    card.unit,
    card.title,
    card.formula,
    card.rule,
    card.example,
    card.trap,
    card.compare,
    ...(Array.isArray(card.checklist) ? card.checklist : [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(searchText);
}

function toggleRecapUnitSelection(unit) {
  if (activeRecapUnits.includes(unit)) {
    activeRecapUnits = activeRecapUnits.filter((item) => item !== unit);
  } else {
    const unitOrder = getAllRecapUnits();
    activeRecapUnits = [...activeRecapUnits, unit].sort((a, b) => unitOrder.indexOf(a) - unitOrder.indexOf(b));
  }
  renderRecap();
}

function selectAllRecapUnits() {
  activeRecapUnits = getAllRecapUnits();
  renderRecap();
}

function clearRecapUnitSelections() {
  activeRecapUnits = [];
  renderRecap();
}

function resetRecapFilters() {
  const input = document.getElementById("recapFilter");
  if (input) input.value = "";
  activeRecapUnits = getAllRecapUnits();
  renderRecap();
}

function renderRecap() {
  const recapGrid = document.getElementById("recapGrid");
  if (!recapGrid) return;
  const recapUnits = document.getElementById("recapUnits");
  const recapCount = document.getElementById("recapCount");
  const searchText = getRecapSearchValue();
  const units = getAllRecapUnits();
  const dropdownWasOpen = Boolean(recapUnits?.querySelector(".recap-dropdown")?.open);
  const filteredCards = RECAP_CARDS.filter((card) => matchesRecapCard(card, searchText, activeRecapUnits));

  if (recapUnits) {
    recapUnits.innerHTML = `
      <details class="recap-dropdown" ${dropdownWasOpen ? "open" : ""}>
        <summary class="recap-dropdown-summary">
          <div class="recap-dropdown-copy">
            <span>Unite Filtresi</span>
            <strong>${safeText(getRecapDropdownLabel(units))}</strong>
          </div>
          <span class="recap-dropdown-icon">▾</span>
        </summary>
        <div class="recap-dropdown-menu">
          <div class="recap-dropdown-top">
            <div class="recap-dropdown-buttons">
              <button type="button" onclick="selectAllRecapUnits()">Tumunu Sec</button>
              <button type="button" onclick="clearRecapUnitSelections()">Secimi Temizle</button>
            </div>
            <span class="recap-dropdown-note">${activeRecapUnits.length}/${units.length} unite secili</span>
          </div>
          <div class="recap-dropdown-list">
            ${units.map((unit) => {
              const unitCount = RECAP_CARDS.filter((card) => card.unit === unit).length;
              return `
                <label class="recap-option">
                  <span class="recap-option-left">
                    <input
                      type="checkbox"
                      ${activeRecapUnits.includes(unit) ? "checked" : ""}
                      onchange="toggleRecapUnitSelection('${unit}')"
                    >
                    <span>${safeText(unit)}</span>
                  </span>
                  <strong class="recap-option-count">${unitCount}</strong>
                </label>
              `;
            }).join("")}
          </div>
        </div>
      </details>
    `;
  }

  if (recapCount) {
    const unitText = !activeRecapUnits.length
      ? "unite secimi yok"
      : activeRecapUnits.length === units.length
        ? "tum uniteler"
        : `${activeRecapUnits.length} unite secili`;
    recapCount.textContent = `${filteredCards.length} / ${RECAP_CARDS.length} kart - ${unitText}`;
  }

  if (!filteredCards.length) {
    recapGrid.innerHTML = `
      <div class="empty-grid">
        Aramaya uyan recap karti bulunamadi. Filtreleri temizleyip tekrar dene.
      </div>
    `;
    return;
  }

  recapGrid.innerHTML = filteredCards.map((card) => `
    <div class="flashcard">
      <div class="flashcard-head">
        <strong>${safeText(card.title)}</strong>
        <span class="fc-unit">${safeText(card.unit)}</span>
      </div>
      <div class="fc-formula">${safeText(card.formula)}</div>
      <div class="fc-row">
        <span class="fc-label">Kural</span>
        <span class="fc-rule">${safeText(card.rule)}</span>
      </div>
      <div class="fc-row">
        <span class="fc-label">Örnek</span>
        <span class="fc-example">${safeText(card.example)}</span>
      </div>
      ${card.compare ? `
        <div class="fc-row">
          <span class="fc-label">Karsilastirma</span>
          <span class="fc-compare">${safeText(card.compare)}</span>
        </div>
      ` : ""}
      ${Array.isArray(card.checklist) && card.checklist.length ? `
        <div class="fc-row">
          <span class="fc-label">Mini Liste</span>
          <ul class="fc-checklist">
            ${card.checklist.map((item) => `<li>${safeText(item)}</li>`).join("")}
          </ul>
        </div>
      ` : ""}
      <div class="fc-row fc-row-warning">
        <span class="fc-label">Dikkat</span>
        <span class="fc-trap">${safeText(card.trap)}</span>
      </div>
    </div>
  `).join("");
}

function startExam(questionCount, durationMinutes) {
  const selectedQuestions = buildExamQuestions(questionCount);

  activeExam = {
    label: questionCount === 10 ? "Mini Sınav" : questionCount === 20 ? "Orta Sınav" : "Tam Sınav",
    durationMinutes,
    questions: selectedQuestions,
    startedAt: Date.now(),
    endsAt: Date.now() + durationMinutes * 60 * 1000,
    submitted: false
  };

  renderActiveExam();
  navigate("examcenter");

  if (examTimer) clearInterval(examTimer);
  examTimer = setInterval(updateExamTimer, 1000);
  updateExamTimer();
}

function updateExamTimer() {
  if (!activeExam || activeExam.submitted) return;
  const timerEl = document.getElementById("exam-timer");
  if (!timerEl) return;

  const remaining = activeExam.endsAt - Date.now();
  if (remaining <= 0) {
    timerEl.textContent = "Süre doldu";
    submitExam(true);
    return;
  }

  const totalSeconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  timerEl.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function renderActiveExam() {
  const workspace = document.getElementById("examWorkspace");
  if (!workspace) return;

  if (!activeExam) {
    workspace.innerHTML = `
      <div class="empty-state">
        <h3>Henüz aktif bir sınav yok</h3>
        <p>Yukarıdan bir sınav türü seçip karışık grammar sınavını başlatabilirsin.</p>
      </div>
    `;
    return;
  }

  workspace.innerHTML = `
    <div class="exam-header">
      <div class="exam-info">
        <h3 class="section-title">${safeText(activeExam.label)}</h3>
        <p>${activeExam.questions.length} karışık soru · ${activeExam.durationMinutes} dakika süre</p>
      </div>
      <div class="timer-pill">⏱️ <span id="exam-timer">--:--</span></div>
    </div>

    <div class="exam-content">
      ${activeExam.questions.map((question, questionIndex) => `
        <div class="question-card" data-exam-question="${questionIndex}">
          <div class="question-meta">${safeText(question.unit)} · ${safeText(question.topicTitle)} · Soru ${questionIndex + 1}</div>
          <div class="question-title">${safeText(question.question)}</div>
          <div class="option-list">
            ${question.options.map((option, optionIndex) => `
              <label class="option-item">
                <input type="radio" name="exam-question-${questionIndex}" value="${optionIndex}">
                ${safeText(option)}
              </label>
            `).join("")}
          </div>
        </div>
      `).join("")}

      <div class="topic-actions">
        <button class="check-btn" onclick="submitExam(false)">Sınavı Bitir</button>
        <button class="ghost-btn" onclick="cancelExam()">Sınavı İptal Et</button>
      </div>
    </div>
  `;
}

function cancelExam() {
  if (examTimer) clearInterval(examTimer);
  activeExam = null;
  renderActiveExam();
}

function submitExam(autoSubmitted = false) {
  if (!activeExam || activeExam.submitted) return;
  if (examTimer) clearInterval(examTimer);

  const results = activeExam.questions.map((question, index) => {
    const selected = document.querySelector(`input[name="exam-question-${index}"]:checked`);
    const selectedIndex = selected ? Number(selected.value) : null;
    return {
      ...question,
      index,
      selectedIndex,
      isCorrect: selectedIndex === question.answer
    };
  });

  const score = results.filter((item) => item.isCorrect).length;
  const percentage = formatPercent(score, results.length);

  const topicStats = {};
  results.forEach((item) => {
    if (!topicStats[item.topicTitle]) {
      topicStats[item.topicTitle] = { correct: 0, total: 0 };
    }
    topicStats[item.topicTitle].total += 1;
    if (item.isCorrect) topicStats[item.topicTitle].correct += 1;
  });

  const history = getExamHistory();
  history.unshift({
    label: activeExam.label,
    score,
    total: results.length,
    percentage,
    date: new Date().toISOString()
  });
  setExamHistory(history);

  if (percentage > getBestExam()) {
    setBestExam(percentage);
  }

  activeExam.submitted = true;

  const workspace = document.getElementById("examWorkspace");
  if (!workspace) return;

  workspace.innerHTML = `
    <div class="result-box">
      <h3 class="result-title">${safeText(activeExam.label)} Sonucu</h3>
      <p>${autoSubmitted ? "Süre dolduğu için sınav otomatik olarak gönderildi." : "Sınav başarıyla tamamlandı."}</p>

      <div class="result-main">
        <div class="result-stat">
          <span>Doğru sayısı</span>
          <strong>${score}/${results.length}</strong>
        </div>
        <div class="result-stat">
          <span>Yüzde</span>
          <strong>${percentage}%</strong>
        </div>
        <div class="result-stat">
          <span>En iyi derece</span>
          <strong>${getBestExam()}%</strong>
        </div>
      </div>

      <div>
        <h3>Konu bazlı performans</h3>
        <div class="topic-score-grid">
          ${Object.entries(topicStats).map(([topicTitle, stats]) => `
            <div class="topic-score-card">
              <h4>${safeText(topicTitle)}</h4>
              <p>${stats.correct}/${stats.total} doğru · ${formatPercent(stats.correct, stats.total)}%</p>
            </div>
          `).join("")}
        </div>
      </div>

      <div>
        <h3>Cevap inceleme</h3>
        <div class="review-grid">
          ${results.map((item) => `
            <div class="review-card">
              <h4>${safeText(item.unit)} · ${safeText(item.topicTitle)} · Soru ${item.index + 1}</h4>
              <p>${safeText(item.question)}</p>
              <p class="review-answer"><strong>Senin cevabın:</strong> ${item.selectedIndex === null ? "Boş" : safeText(item.options[item.selectedIndex])}</p>
              <p class="review-answer"><strong>Doğru cevap:</strong> ${safeText(item.options[item.answer])}</p>
              <p>${safeText(item.explanation)}</p>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="topic-actions">
        <button class="primary-btn dark" onclick="startExam(${results.length}, ${activeExam.durationMinutes})">Aynı Türde Yeni Sınav</button>
        <button class="ghost-btn" onclick="navigate('quizhub')">Quiz Merkezine Git</button>
      </div>
    </div>
  `;

  activeExam = null;
  updateDashboardStats();
  saveProgressToFirebase();
}

window.navigate = navigate;
window.toggleMenu = toggleMenu;
window.closeMobileMenu = closeMobileMenu;
window.searchTopics = searchTopics;
window.toggleTheme = toggleTheme;
window.renderStudyHub = renderStudyHub;
window.renderMemorizationHub = renderMemorizationHub;
window.toggleMemoryCard = toggleMemoryCard;
window.handleMemoryCardKey = handleMemoryCardKey;
window.renderQuizHub = renderQuizHub;
window.renderRecap = renderRecap;
window.toggleRecapUnitSelection = toggleRecapUnitSelection;
window.selectAllRecapUnits = selectAllRecapUnits;
window.clearRecapUnitSelections = clearRecapUnitSelections;
window.resetRecapFilters = resetRecapFilters;
window.openStudyTopic = openStudyTopic;
window.openQuizTopic = openQuizTopic;
window.submitTopicQuiz = submitTopicQuiz;
window.toggleStudyDone = toggleStudyDone;
window.toggleQuizDone = toggleQuizDone;
window.startExam = startExam;
window.submitExam = submitExam;
window.cancelExam = cancelExam;

document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  await loadProgressFromFirebase();
  renderStudyHub();
  renderMemorizationHub();
  renderQuizHub();
  renderRecap();
  renderActiveExam();
  updateDashboardStats();
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 768) {
    closeMobileMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMobileMenu();
  }
});
