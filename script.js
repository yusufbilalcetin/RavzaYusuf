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

const TOPIC_ID_ALIASES = {
  unit6b: "ability",
  phrasalverbs: "phrasal"
};

function resolveTopicId(id) {
  return TOPIC_ID_ALIASES[id] || id;
}

function getTopicById(id) {
  const resolvedId = resolveTopicId(id);
  return TOPICS.find((topic) => topic.id === resolvedId);
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

function updateTopicData(id, updates) {
  const topic = getTopicById(id);
  if (!topic) return;
  Object.assign(topic, updates);
}

function stripHtml(html = "") {
  return String(html).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ");
}

function normalizeSearchText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function getTopicSearchIndex(topic) {
  return normalizeSearchText(
    [
      topic.title,
      topic.subtitle,
      topic.unit,
      ...(topic.keyPoints || []),
      stripHtml(topic.summaryHtml || ""),
      ...((topic.searchAliases || []))
    ].join(" ")
  );
}

function matchesTopicSearch(topic, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return getTopicSearchIndex(topic).includes(normalizedQuery);
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

const TOPIC_OVERRIDES = {
  ability: {
    subtitle: "Can / Could / Be able to · deduction modals",
    keyPoints: [
      "Use can for present ability, could for past general ability, and be able to for all tenses.",
      "For a single successful action in the past, was / were able to is usually better than could.",
      "For deduction, can't shows impossibility, must shows certainty, and might / could show possibility."
    ],
    searchAliases: [
      "unit6b",
      "unit 6b",
      "can could able to",
      "can could be able to",
      "deduction",
      "must cant might could",
      "being able to"
    ]
  },
  phrasal: {
    subtitle: "Type 1 · Type 2 · Type 3 · pronoun rule",
    keyPoints: [
      "Type 1 phrasal verbs do not take an object and stay inseparable: go away, eat out, get up.",
      "Type 2 phrasal verbs take an object and can separate: turn off the lights / turn the lights off.",
      "Type 3 phrasal verbs take an object but stay inseparable: look for the keys, look after her children."
    ],
    searchAliases: [
      "phrasal",
      "phrasal verb",
      "phrasal verbs",
      "phrasalverbs",
      "separable",
      "inseparable",
      "call her back",
      "look after",
      "look forward to"
    ]
  }
};

Object.entries(TOPIC_OVERRIDES).forEach(([id, updates]) => updateTopicData(id, updates));

const SUPPLEMENTAL_STUDY_CONTENT = {
  ability: `
<div class="content-card">
  <h3>Unit 6B overview</h3>
  <p><strong>Can</strong> is used for present ability, <strong>could</strong> is used for past general ability, and <strong>be able to</strong> is the flexible form we can use in different tenses.</p>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Meaning / time</th><th>Form</th><th>Example</th></tr></thead><tbody><tr><td>Present ability</td><td>can + verb1</td><td>She can swim very well.</td></tr><tr><td>Past ability</td><td>could + verb1</td><td>When I was 5, I could dance very well.</td></tr><tr><td>Present simple</td><td>am / is / are able to + verb1</td><td>They are able to speak Japanese.</td></tr><tr><td>Past simple</td><td>was / were able to + verb1</td><td>She was able to speak Arabic five years ago.</td></tr><tr><td>Future</td><td>will be able to + verb1</td><td>She will be able to join us tomorrow.</td></tr><tr><td>Present perfect</td><td>have / has been able to + verb1</td><td>I have been able to drive since 2011.</td></tr><tr><td>Gerund</td><td>being able to + verb1</td><td>I like being able to read quickly.</td></tr></tbody></table></div>
</div>
<div class="content-card">
  <h3>Be able to across tenses</h3>
  <ul>
    <li>Use <strong>be able to</strong> when <strong>can</strong> is not possible in the tense you need.</li>
    <li><strong>Can + verb1</strong> and <strong>could + verb1</strong> are simple and common, but they do not cover every tense.</li>
    <li>For a specific successful action in the past, <strong>was / were able to</strong> is usually more accurate than <strong>could</strong>.</li>
    <li>Example: <em>I got a puncture, but I was able to change the wheel myself.</em></li>
  </ul>
</div>
<div class="content-card">
  <h3>Deduction modals</h3>
  <p>We use deduction modals to show how certain we are about something from the evidence we have.</p>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Modal</th><th>Meaning</th><th>Example</th></tr></thead><tbody><tr><td>can't + verb1</td><td>We are sure something is not true.</td><td>She can't be Kate. She is in Italy.</td></tr><tr><td>must + verb1</td><td>We are sure something is true.</td><td>He must be at home. The lights are on.</td></tr><tr><td>might + verb1</td><td>It is possible.</td><td>She might be at home now.</td></tr><tr><td>could + verb1</td><td>Positive possibility.</td><td>It could be the right answer.</td></tr></tbody></table></div>
  <div class="info-box">
    <p><strong>After can't / must / might / could, use verb1.</strong></p>
    <p><strong>Correct:</strong> He must be tired. / She can't be at school.</p>
    <p><strong>Wrong:</strong> He must is tired. / She can't to be at school.</p>
  </div>
</div>
<div class="content-card">
  <h3>Common mistakes to avoid</h3>
  <div class="warning-box">
    <p><strong>Wrong:</strong> She can join us tomorrow after work.</p>
    <p><strong>Correct:</strong> She will be able to join us tomorrow after work.</p>
    <p><strong>Wrong:</strong> I like can read quickly.</p>
    <p><strong>Correct:</strong> I like being able to read quickly.</p>
    <p><strong>Wrong:</strong> He must is at home.</p>
    <p><strong>Correct:</strong> He must be at home.</p>
  </div>
</div>
`,
  phrasal: `
<div class="content-card">
  <h3>What is a phrasal verb?</h3>
  <p>A <strong>phrasal verb</strong> is a <strong>verb + particle</strong>. The particle can be a preposition or an adverb.</p>
  <p>Examples: <em>get off the bus</em>, <em>look for something</em>.</p>
</div>
<div class="content-card">
  <h3>Type 1, Type 2, Type 3</h3>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Type</th><th>Rule</th><th>Examples</th></tr></thead><tbody><tr><td>Type 1</td><td>No object, inseparable</td><td>go away, eat out, get up</td></tr><tr><td>Type 2</td><td>Takes an object, separable</td><td>turn off the lights / turn the lights off; turn down the music / turn the music down</td></tr><tr><td>Type 3</td><td>Takes an object, inseparable</td><td>look for the keys, get on the bus, look after her children, look forward to her wedding day</td></tr></tbody></table></div>
</div>
<div class="content-card">
  <h3>Separable vs inseparable</h3>
  <ul>
    <li><strong>Separable:</strong> the object can go after the particle or between the verb and particle.</li>
    <li><strong>Examples:</strong> turn off the lights / turn the lights off, turn down the music / turn the music down.</li>
    <li><strong>Inseparable:</strong> the object stays after the whole phrasal verb.</li>
    <li><strong>Examples:</strong> look for the keys, get on the bus, look after her children, look forward to her wedding day.</li>
  </ul>
</div>
<div class="content-card">
  <h3>Pronoun rule</h3>
  <div class="warning-box">
    <p>If the object is a pronoun in a <strong>separable</strong> phrasal verb, it must go between the verb and particle.</p>
    <p><strong>Correct:</strong> call her back / turn it off / turn it down</p>
    <p><strong>Wrong:</strong> call back her / turn off it / turn down it</p>
  </div>
</div>
<div class="content-card">
  <h3>Useful examples</h3>
  <div class="keypoint-list">
    <div class="keypoint-item">go away · eat out · get up</div>
    <div class="keypoint-item">turn off the lights / turn the lights off</div>
    <div class="keypoint-item">turn down the music / turn the music down</div>
    <div class="keypoint-item">call her back</div>
    <div class="keypoint-item">look for the keys · get on the bus</div>
    <div class="keypoint-item">look after her children · look forward to her wedding day</div>
  </div>
</div>
`
};

Object.entries(SUPPLEMENTAL_STUDY_CONTENT).forEach(([id, html]) => appendTopicHtml(id, html));

const SUPPLEMENTAL_QUIZ_QUESTIONS = {
  ability: [
    makeQuestion('When I was 5, I ________ dance very well.', ["could", "can", "will be able to"], 0, "Use could for past general ability."),
    makeQuestion('She ________ join us tomorrow after work.', ["can", "will be able to", "is able to"], 1, "Use will be able to for future ability."),
    makeQuestion("He ________ be at home; the lights are on.", ["must", "can't", "won't"], 0, "Must shows a strong deduction from evidence."),
    makeQuestion("She ________ be Kate. She is in Italy.", ["must", "could", "can't"], 2, "Can't shows that something is impossible or not true."),
    makeQuestion('I like ________ quickly in exams.', ["can read", "being able to read", "to can read"], 1, "After like here, use the gerund form being able to.")
  ],
  phrasal: [
    makeQuestion('"Turn ___ the music, please." Which particle completes the phrasal verb?', ["off", "after", "for"], 0, "Turn off means stop the sound or power."),
    makeQuestion("Why is 'I'll call her back' correct?", ["Because pronouns must go between the verb and particle in separable phrasal verbs.", "Because back must always come before the object.", "Because call back is an inseparable phrasal verb."], 0, "Call back is separable, so the pronoun goes in the middle."),
    makeQuestion("What does 'look after' mean?", ["take care of", "search for", "return"], 0, "Look after means take care of someone or something."),
    makeQuestion("Which phrasal verb is separable?", ["look after", "turn down", "look for"], 1, "Turn down can separate: turn the music down."),
    makeQuestion("Which sentence is wrong?", ["Turn the lights off.", "Look for the keys.", "Call back her."], 2, "With a pronoun, use call her back.")
  ]
};

Object.entries(SUPPLEMENTAL_QUIZ_QUESTIONS).forEach(([id, questions]) => addTopicQuestions(id, questions));

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

const ADDITIONAL_MEMORY_CARDS = [
  { id: "mem-115", front: "Phrasal verb", back: "verb + particle" },
  { id: "mem-116", front: "Type 1", back: "no object / inseparable" },
  { id: "mem-117", front: "Type 2", back: "takes an object / separable" },
  { id: "mem-118", front: "Type 3", back: "takes an object / inseparable" },
  { id: "mem-119", front: "Call her back", back: "pronoun goes between verb and particle" },
  { id: "mem-120", front: "Can", back: "present ability / permission" },
  { id: "mem-121", front: "Could", back: "past general ability" },
  { id: "mem-122", front: "Be able to", back: "used across different tenses" },
  { id: "mem-123", front: "Must", back: "strong deduction / sure it is true" },
  { id: "mem-124", front: "Can't", back: "impossible / sure it is not true" },
  { id: "mem-125", front: "Might / Could", back: "possibility" },
  { id: "mem-126", front: "Being able to", back: "gerund form after like / love / enjoy" }
];

MEMORIZATION_CARDS.push(...ADDITIONAL_MEMORY_CARDS);

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

const ADDITIONAL_RECAP_CARDS = [
  {
    unit: "6B",
    title: "Can / Could / Be able to",
    formula: "can + verb1 / could + verb1 / be able to + verb1",
    rule: "Use can for present ability, could for past general ability, and be able to when you need other tenses.",
    example: "She can swim. / When I was 5, I could dance well. / She will be able to join us tomorrow.",
    trap: "Future ability takes will be able to, not will can.",
    compare: "general past ability -> could / single successful past action -> was-were able to",
    checklist: ["present = can", "past general = could", "future-present perfect-gerund = be able to"]
  },
  {
    unit: "6B",
    title: "Deduction Modals",
    formula: "can't / must / might / could + verb1",
    rule: "Use can't for impossible, must for certainty, and might / could for possibility.",
    example: "She can't be Kate. / He must be at home. / She might be at home now.",
    trap: "After these modals, always use verb1: must be, can't be, might go.",
    compare: "can't = not true / must = sure / might-could = maybe",
    checklist: ["look at the evidence", "choose certainty level", "keep the base verb after the modal"]
  },
  {
    unit: "7A",
    title: "Phrasal Verb Types",
    formula: "type 1 / type 2 / type 3",
    rule: "Type 1 has no object, type 2 is separable with an object, and type 3 takes an object but stays inseparable.",
    example: "go away / turn the lights off / look after her children",
    trap: "Do not separate inseparable phrasal verbs like look after or look forward to.",
    compare: "type 2 can separate / type 1 and type 3 do not",
    checklist: ["is there an object", "can the object move", "is the phrasal verb fixed"]
  },
  {
    unit: "7A",
    title: "Pronoun Rule",
    formula: "call her back / turn it off",
    rule: "With a pronoun in a separable phrasal verb, put the pronoun between the verb and particle.",
    example: "call her back / turn it off / turn it down",
    trap: "call back her and turn off it are wrong.",
    compare: "noun object can move either way / pronoun object must stay in the middle",
    checklist: ["if the object is a pronoun", "use the middle position", "check whether the phrasal verb is separable"]
  }
];

RECAP_CARDS.push(...ADDITIONAL_RECAP_CARDS);

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
let memoryHubSection = "cards";
let memoryPracticeMode = "en-tr";
let activeMemoryPracticeQuestion = null;
let lastMemoryPracticeKey = "";
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
  return `eul_study_${resolveTopicId(id)}`;
}

function getQuizKey(id) {
  return `eul_quiz_${resolveTopicId(id)}`;
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
  localStorage.setItem("eul_exam_history", JSON.stringify(history.slice(0, 10)));
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

const THEME_STYLES = [
  "noel-ask",
  "gece-mavisi",
  "orman-yesili",
  "mor-isik",
  "klasik-koyu",
  "pembe-tema"
];

function normalizeThemeStyle(themeId) {
  if (themeId === "gun-isigi") return "pembe-tema";
  return THEME_STYLES.includes(themeId) ? themeId : "noel-ask";
}

function initTheme() {
  const savedMode = localStorage.getItem("eul_theme");
  const savedStyle = normalizeThemeStyle(localStorage.getItem("eul_theme_style") || "noel-ask");

  if (localStorage.getItem("eul_theme_style") === "gun-isigi") {
    localStorage.setItem("eul_theme_style", "pembe-tema");
  }

  applySiteTheme(savedStyle, false);
  applyDark(savedMode === "dark");
  updateThemeSelectionUi();
}

function refreshExamPerformanceChartAfterThemeChange() {
  const isExamPageActive = document.getElementById("examcenter")?.classList.contains("active");
  if (!isExamPageActive) return;

  const refresh = () => {
    if (typeof window.renderExamPerformanceChart === "function") {
      window.renderExamPerformanceChart();
    } else if (typeof renderExamPerformanceChart === "function") {
      renderExamPerformanceChart();
    }
  };

  requestAnimationFrame(() => {
    refresh();
    setTimeout(refresh, 80);
  });
}

function applySiteTheme(themeId, persist = true) {
  const normalized = normalizeThemeStyle(themeId);
  document.body.setAttribute("data-theme-style", normalized);
  if (persist) {
    localStorage.setItem("eul_theme_style", normalized);
  }
  updateThemeSelectionUi();
  refreshExamPerformanceChartAfterThemeChange();
}

function updateThemeSelectionUi() {
  const activeTheme = document.body.getAttribute("data-theme-style") || "noel-ask";
  document.querySelectorAll(".theme-choice-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.themeId === activeTheme);
  });
}

function openThemeSheet() {
  const sheet = document.getElementById("theme-sheet");
  const backdrop = document.getElementById("theme-sheet-backdrop");
  if (sheet) {
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
  }
  if (backdrop) backdrop.classList.add("open");

  // Tema paneli acikken Flashcard sticky arama bari ve scroll-top butonu
  // modalin ustune cikmasin. Bu class CSS tarafinda cakismani engeller.
  document.body.classList.add("theme-sheet-open");
}

function closeThemeSheet() {
  const sheet = document.getElementById("theme-sheet");
  const backdrop = document.getElementById("theme-sheet-backdrop");
  if (sheet) {
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
  }
  if (backdrop) backdrop.classList.remove("open");

  document.body.classList.remove("theme-sheet-open");
}

function selectTheme(themeId) {
  applySiteTheme(normalizeThemeStyle(themeId));
  // Tema secildikten sonra panel kapanir; sticky arama tekrar normal calisir.
  closeThemeSheet();
}

function applyDark(isDark) {
  document.body.classList.toggle("dark", isDark);
  const btn = document.getElementById("theme-switch");
  if (btn) {
    btn.setAttribute("aria-label", isDark ? "Gündüz moduna geç" : "Karanlık moda geç");
  }
  const topBtn = document.getElementById("topbar-theme-btn");
  if (topBtn) {
    topBtn.classList.toggle("is-dark", isDark);
    topBtn.setAttribute("aria-label", isDark ? "Gündüz moduna geç" : "Karanlık moda geç");
    const icon = topBtn.querySelector(".mode-toggle-icon");
    if (icon) icon.textContent = isDark ? "🌙" : "☀️";
  }
  refreshExamPerformanceChartAfterThemeChange();
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

  const found = TOPICS.find((topic) => matchesTopicSearch(topic, q));

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

  const filtered = TOPICS.filter((topic) => matchesTopicSearch(topic, q));

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

  const filtered = TOPICS.filter((topic) => matchesTopicSearch(topic, q));

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

// Ezber Merkezi'nde ayni anda sadece tek alt bolum gorunur.
function setMemoryHubSection(section) {
  if (section !== "cards" && section !== "practice") return;
  memoryHubSection = section;

  const cardsToolbar = document.querySelector("#memoryhub > .hub-toolbar");
  const cardsGrid = document.getElementById("memoryHubGrid");
  const practiceSection = document.getElementById("memoryPracticeSection");
  const cardsButton = document.getElementById("memoryViewCardsBtn");
  const practiceButton = document.getElementById("memoryViewPracticeBtn");

  if (cardsToolbar) cardsToolbar.hidden = memoryHubSection !== "cards";
  if (cardsGrid) cardsGrid.hidden = memoryHubSection !== "cards";
  if (practiceSection) practiceSection.hidden = memoryHubSection !== "practice";
  if (cardsButton) cardsButton.classList.toggle("active", memoryHubSection === "cards");
  if (practiceButton) practiceButton.classList.toggle("active", memoryHubSection === "practice");
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

function shuffleArray(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getAllMemoryPracticeCards() {
  return MEMORIZATION_CARDS.filter((card) => card.front && card.back);
}

function getMemoryPracticePool(mode) {
  const cards = getAllMemoryPracticeCards();

  // Turkce -> Ingilizce modunda tek dogru cevap garanti etmek icin
  // yalnizca benzersiz Turkce karsiliklari soru olarak kullan.
  if (mode === "tr-en") {
    const backCounts = cards.reduce((acc, card) => {
      const key = card.back.trim().toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return cards.filter((card) => backCounts[card.back.trim().toLowerCase()] === 1);
  }

  return cards;
}

function getMemoryPracticeQuestionKey(card, mode) {
  return `${mode}:${mode === "en-tr" ? card.front : card.back}`.toLowerCase();
}

function pickRandomMemoryCard(mode) {
  const pool = getMemoryPracticePool(mode);
  if (!pool.length) return null;

  let selected = pool[Math.floor(Math.random() * pool.length)];

  if (pool.length > 1) {
    let guard = 0;
    while (getMemoryPracticeQuestionKey(selected, mode) === lastMemoryPracticeKey && guard < 10) {
      selected = pool[Math.floor(Math.random() * pool.length)];
      guard += 1;
    }
  }

  return selected;
}

function buildMemoryPracticeQuestion(mode = memoryPracticeMode) {
  const correctCard = pickRandomMemoryCard(mode);
  if (!correctCard) return null;

  const prompt = mode === "en-tr" ? correctCard.front : correctCard.back;
  const correctLabel = mode === "en-tr" ? correctCard.back : correctCard.front;
  const wrongPool = mode === "en-tr"
    ? [...new Set(getAllMemoryPracticeCards().map((card) => card.back.trim()))]
        .filter((label) => label && label !== correctLabel)
    : getAllMemoryPracticeCards()
        .map((card) => card.front.trim())
        .filter((label) => label && label !== correctLabel);

  const wrongOptions = shuffleArray(wrongPool).slice(0, 3);
  const options = shuffleArray([
    { label: correctLabel, isCorrect: true },
    ...wrongOptions.map((label) => ({ label, isCorrect: false }))
  ]);

  lastMemoryPracticeKey = getMemoryPracticeQuestionKey(correctCard, mode);

  return {
    mode,
    prompt,
    correctLabel,
    options,
    answered: false,
    selectedIndex: null,
    isCorrect: false
  };
}

function setMemoryPracticeMode(mode) {
  if (mode !== "en-tr" && mode !== "tr-en") return;
  if (mode === memoryPracticeMode && activeMemoryPracticeQuestion) {
    renderMemoryPractice();
    return;
  }
  memoryPracticeMode = mode;
  activeMemoryPracticeQuestion = buildMemoryPracticeQuestion(mode);
  renderMemoryPractice();
}

function submitMemoryPracticeAnswer(optionIndex) {
  if (!activeMemoryPracticeQuestion || activeMemoryPracticeQuestion.answered) return;

  const selectedOption = activeMemoryPracticeQuestion.options[optionIndex];
  if (!selectedOption) return;

  activeMemoryPracticeQuestion = {
    ...activeMemoryPracticeQuestion,
    answered: true,
    selectedIndex: optionIndex,
    isCorrect: selectedOption.isCorrect
  };

  renderMemoryPractice();
}

function nextMemoryPracticeQuestion() {
  activeMemoryPracticeQuestion = buildMemoryPracticeQuestion(memoryPracticeMode);
  renderMemoryPractice();
}

function renderMemoryPractice() {
  const practiceCard = document.getElementById("memoryPracticeCard");
  if (!practiceCard) return;

  if (!activeMemoryPracticeQuestion) {
    activeMemoryPracticeQuestion = buildMemoryPracticeQuestion(memoryPracticeMode);
  }

  const enTrButton = document.getElementById("memoryModeEnTr");
  const trEnButton = document.getElementById("memoryModeTrEn");

  if (enTrButton) enTrButton.classList.toggle("active", memoryPracticeMode === "en-tr");
  if (trEnButton) trEnButton.classList.toggle("active", memoryPracticeMode === "tr-en");

  if (!activeMemoryPracticeQuestion) {
    practiceCard.innerHTML = `<div class="empty-grid">Calisma sorusu olusturulamadi.</div>`;
    return;
  }

  const question = activeMemoryPracticeQuestion;
  const promptLabel = question.mode === "en-tr" ? "Ingilizce kelime" : "Turkce anlam";
  const instruction = question.mode === "en-tr"
    ? "Dogru Turkce anlami sec."
    : "Dogru Ingilizce kelimeyi sec.";
  const feedbackClass = question.answered ? (question.isCorrect ? "success" : "error") : "";
  const feedbackText = !question.answered
    ? "Bir secenek isaretle ve cevabi kontrol et."
    : question.isCorrect
      ? "Dogru cevap."
      : `Yanlis cevap. Dogru cevap: ${question.correctLabel}`;

  practiceCard.innerHTML = `
    <div class="memory-practice-body">
      <div class="memory-prompt-box">
        <span class="memory-prompt-label">${safeText(promptLabel)}</span>
        <strong class="memory-prompt-text">${safeText(question.prompt)}</strong>
        <p class="helper-line">${safeText(instruction)}</p>
      </div>

      <div class="memory-option-list">
        ${question.options.map((option, index) => {
          let classes = "memory-option";
          if (question.answered && option.isCorrect) classes += " correct";
          if (question.answered && !option.isCorrect && question.selectedIndex === index) classes += " wrong";
          if (question.answered) classes += " locked";

          return `
            <button
              type="button"
              class="${classes}"
              onclick="submitMemoryPracticeAnswer(${index})"
              ${question.answered ? "disabled" : ""}
            >
              <small>Secenek ${index + 1}</small>
              <span>${safeText(option.label)}</span>
            </button>
          `;
        }).join("")}
      </div>

      <div class="memory-practice-footer">
        <div class="memory-feedback ${feedbackClass}">
          ${safeText(feedbackText)}
        </div>
        <button
          type="button"
          class="primary-btn soft memory-next-btn"
          onclick="nextMemoryPracticeQuestion()"
          ${question.answered ? "" : "disabled"}
        >
          Sonraki
        </button>
      </div>
    </div>
  `;
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
window.openThemeSheet = openThemeSheet;
window.closeThemeSheet = closeThemeSheet;
window.selectTheme = selectTheme;
window.renderStudyHub = renderStudyHub;
window.renderMemorizationHub = renderMemorizationHub;
window.setMemoryHubSection = setMemoryHubSection;
window.toggleMemoryCard = toggleMemoryCard;
window.handleMemoryCardKey = handleMemoryCardKey;
window.setMemoryPracticeMode = setMemoryPracticeMode;
window.submitMemoryPracticeAnswer = submitMemoryPracticeAnswer;
window.nextMemoryPracticeQuestion = nextMemoryPracticeQuestion;
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
  renderMemoryPractice();
  setMemoryHubSection(memoryHubSection);
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
    closeThemeSheet();
  }
});


/* ============================================================
 *  CONTINUATION PATCH — tek parca kapsamli study/quiz guncellemesi
 *  Bu bolum orijinal calisan script uzerine eklenir.
 *  UI ayni kalir, sadece 3B-10A konulari daha kapsamli hale gelir.
 * ============================================================ */

(function applyExpandedContinuationPatch() {
  function mergeKeyPoints(id, points) {
    const topic = getTopicById(id);
    if (!topic) return;
    const existing = Array.isArray(topic.keyPoints) ? topic.keyPoints : [];
    const merged = [...existing];
    points.forEach((point) => {
      if (!merged.includes(point)) merged.push(point);
    });
    topic.keyPoints = merged;
  }

  function injectQuestions(id, questions) {
    const topic = getTopicById(id);
    if (!topic || !Array.isArray(questions) || !questions.length) return;
    addTopicQuestions(id, questions);
    questions.forEach((question, index) => {
      QUESTION_BANK.push({
        ...question,
        topicId: topic.id,
        topicTitle: topic.title,
        unit: topic.unit,
        uid: `${topic.id}-patch-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`
      });
    });
  }

  const EXPANDED_STUDY_CONTENT = {
    prepositions: `
<div class="content-card">
  <h3>Ek anlatim — Place / Movement / Dependent Prepositions</h3>
  <p>Bu konuda 3 farkli preposition turunu ayirt etmen gerekir:</p>
  <ul>
    <li><strong>Place</strong> = bir seyin nerede oldugunu soyler.</li>
    <li><strong>Movement</strong> = hareket yonunu soyler.</li>
    <li><strong>Dependent</strong> = belirli fiil ve sifatlarla sabit kullanilan yapilar.</li>
  </ul>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Tur</th><th>Ornek</th><th>Anlam</th></tr></thead><tbody>
    <tr><td>Place</td><td>in / on / under / behind</td><td>konum</td></tr>
    <tr><td>Movement</td><td>into / across / through / towards</td><td>hareket</td></tr>
    <tr><td>Dependent</td><td>interested in / rely on / good at</td><td>sabit kalip</td></tr>
  </tbody></table></div>
</div>

<div class="content-card">
  <h3>towards ve to farki</h3>
  <div class="warning-box">
    <p><strong>towards</strong> = yone dogru, ama ulasmak zorunda degil.</p>
    <p><strong>to</strong> = hedefe ulasma anlami daha net.</p>
    <p>The dog ran <strong>towards</strong> me. → bana dogru kostu.</p>
    <p>The dog ran <strong>to</strong> me. → bana kadar geldi.</p>
  </div>
</div>

<div class="content-card">
  <h3>Preposition + V-ing</h3>
  <div class="info-box">
    <p>Preposition sonrasinda fiil gelirse genelde <strong>V-ing</strong> olur.</p>
    <p>I'm looking forward to <strong>seeing</strong> you.</p>
    <p>She believes in <strong>working</strong> hard.</p>
  </div>
</div>

<div class="content-card">
  <h3>Preposition almayan fiiller</h3>
  <div class="warning-box">
    <p><strong>discuss, enter, marry, ask</strong> gibi fiiller ekstra preposition istemez.</p>
    <p>Doğru: We discussed the problem.</p>
    <p>Yanlis: We discussed about the problem.</p>
  </div>
</div>
`,

    futureforms: `
<div class="content-card">
  <h3>Ek anlatim — Future Forms karsilastirmasi</h3>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Yapi</th><th>Kullanim</th><th>Ornek</th></tr></thead><tbody>
    <tr><td>will</td><td>anlik karar / soz / tahmin</td><td>I'll help you.</td></tr>
    <tr><td>be going to</td><td>onceden plan / kanitli tahmin</td><td>It's going to rain.</td></tr>
    <tr><td>present continuous</td><td>ayarlanmis plan</td><td>I'm meeting Ayse at 7.</td></tr>
    <tr><td>shall</td><td>teklif / oneri</td><td>Shall I open the window?</td></tr>
  </tbody></table></div>
</div>

<div class="content-card">
  <h3>Future in the past</h3>
  <div class="warning-box">
    <p><strong>was / were going to</strong> gecmiste planlanmis ama genelde gerceklesmemis olaylar icin kullanilir.</p>
    <p>I was going to call you, but I forgot.</p>
    <p>They were going to meet, but he had an important meeting.</p>
  </div>
</div>
`,

    conditionals12: `
<div class="content-card">
  <h3>Ek anlatim — 1st vs 2nd Conditional</h3>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Ozellik</th><th>1st Conditional</th><th>2nd Conditional</th></tr></thead><tbody>
    <tr><td>If clause</td><td>Present Simple</td><td>Past Simple</td></tr>
    <tr><td>Main clause</td><td>will / can + V1</td><td>would / could + V1</td></tr>
    <tr><td>Anlam</td><td>gercek / muhtemel gelecek</td><td>hayali / unreal durum</td></tr>
  </tbody></table></div>
</div>

<div class="content-card">
  <h3>would ve could farki</h3>
  <div class="source-panel">
    <p><strong>would</strong> = sonuc / ne yapardi</p>
    <p>If I had more money, I <strong>would buy</strong> a new phone.</p>
    <p><strong>could</strong> = imkan / yapabilirdi</p>
    <p>If I spoke Spanish, I <strong>could work</strong> in Spain.</p>
  </div>
</div>

<div class="content-card">
  <h3>unless</h3>
  <div class="info-box">
    <p><strong>unless = if not</strong></p>
    <p>I won't go unless you go too.</p>
  </div>
</div>
`,

    perfect: `
<div class="content-card">
  <h3>Ek anlatim — Present Perfect Simple</h3>
  <p>Bu zamanin temel mantigi: gecmiste oldu ama sonucu veya etkisi simdiyle baglantili.</p>
  <div class="info-box">
    <p><strong>Form:</strong> have / has + V3</p>
    <p>I've just finished my homework.</p>
    <p>Have you ever been to Italy?</p>
  </div>
</div>

<div class="content-card">
  <h3>for ve since</h3>
  <div class="source-panel">
    <p><strong>for</strong> + sure → for two days / for ten years</p>
    <p><strong>since</strong> + baslangic noktasi → since 2010 / since Monday</p>
  </div>
</div>

<div class="content-card">
  <h3>Past Simple ile karistirma</h3>
  <div class="warning-box">
    <p>Yesterday, last week, in 2020, two days ago gibi net gecmis zaman ifadeleri varsa genelde <strong>Past Simple</strong> gerekir.</p>
    <p>Yanlis: I've seen him yesterday.</p>
    <p>Dogru: I saw him yesterday.</p>
  </div>
</div>
`,

    perfectcont: `
<div class="content-card">
  <h3>Ek anlatim — Present Perfect Continuous</h3>
  <p>Gecmiste baslayip su ana kadar surebilen veya yeni bitmis olup sonucu gorulen eylemleri anlatir.</p>
  <div class="info-box">
    <p><strong>Form:</strong> have / has been + V-ing</p>
    <p>I've been studying all morning.</p>
  </div>
</div>

<div class="content-card">
  <h3>Simple ile farki</h3>
  <div class="source-panel">
    <p>I've written three emails. → sonuc</p>
    <p>I've been writing emails all morning. → surec</p>
  </div>
  <div class="warning-box">
    <p>Stative verbs genelde continuous almaz: I've known her for years.</p>
  </div>
</div>
`,

    modals: `
<div class="content-card">
  <h3>Ek anlatim — Zorunluluk, gereklilik, yasak, tavsiye</h3>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Yapi</th><th>Anlam</th><th>Ornek</th></tr></thead><tbody>
    <tr><td>must</td><td>kuvvetli zorunluluk</td><td>You must study harder.</td></tr>
    <tr><td>have to</td><td>dis kural / zorunluluk</td><td>I have to wear a uniform.</td></tr>
    <tr><td>need to</td><td>gereklilik</td><td>We need to leave now.</td></tr>
    <tr><td>should / ought to</td><td>tavsiye</td><td>You should rest.</td></tr>
    <tr><td>mustn't</td><td>yasak</td><td>You mustn't smoke here.</td></tr>
    <tr><td>don't have to</td><td>gerek yok</td><td>You don't have to come early.</td></tr>
  </tbody></table></div>
</div>

<div class="content-card">
  <h3>mustn't ve don't have to farki</h3>
  <div class="warning-box">
    <p><strong>mustn't</strong> = yapmak yasak</p>
    <p><strong>don't have to</strong> = yapmak zorunda degilsin</p>
  </div>
</div>
`,

    ability: `
<div class="content-card">
  <h3>Ek anlatim — Ability & Deduction</h3>
  <p><strong>can</strong> simdiki yetenek / izin, <strong>could</strong> gecmis genel yetenek, <strong>be able to</strong> ise diger tense'lerde kullanilir.</p>
</div>

<div class="content-card">
  <h3>Deduction modals</h3>
  <div class="source-panel">
    <p><strong>must</strong> = kesin dogru gibi gorunuyor</p>
    <p><strong>can't</strong> = kesin yanlis / imkansiz</p>
    <p><strong>might / could</strong> = olabilir</p>
  </div>
  <div class="warning-box">
    <p>Modal sonrasi daima <strong>V1</strong> gelir.</p>
  </div>
</div>
`,

    phrasal: `
<div class="content-card">
  <h3>Ek anlatim — Phrasal Verb Type 1 / 2 / 3</h3>
  <ul>
    <li><strong>Type 1:</strong> nesne almaz → get up, go away</li>
    <li><strong>Type 2:</strong> nesne alir, ayrilabilir → turn off the light / turn the light off</li>
    <li><strong>Type 3:</strong> nesne alir, ayrilmaz → look after the children</li>
  </ul>
</div>

<div class="content-card">
  <h3>Zamir kurali</h3>
  <div class="warning-box">
    <p>Type 2 yapida nesne bir <strong>pronoun</strong> ise mutlaka araya girer:</p>
    <p>turn it off ✅</p>
    <p>turn off it ❌</p>
  </div>
</div>
`,

    verbpatterns: `
<div class="content-card">
  <h3>Ek anlatim — Verb Patterns</h3>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Kalıp</th><th>Ornek fiiller</th></tr></thead><tbody>
    <tr><td>verb + to infinitive</td><td>want, need, plan, decide, hope, promise</td></tr>
    <tr><td>verb + gerund</td><td>enjoy, avoid, finish, mind, suggest, keep</td></tr>
    <tr><td>bare infinitive</td><td>let, make, modal verbs</td></tr>
    <tr><td>verb + object + to infinitive</td><td>ask, tell, want, allow, would like</td></tr>
  </tbody></table></div>
</div>

<div class="content-card">
  <h3>Ozel dikkat</h3>
  <div class="warning-box">
    <p>let / make sonrasi <strong>to</strong> gelmez: She made me cry.</p>
    <p>ask / tell / want sonrasi object + to infinitive gelebilir: She told me to wait.</p>
  </div>
</div>
`,

    causative: `
<div class="content-card">
  <h3>Ek anlatim — Have / Get Something Done</h3>
  <p>Bir isi kendin yapmadigin, birine yaptirdigin zaman bu yapilar kullanilir.</p>
  <div class="source-panel">
    <p>I cleaned my car. → ben yaptim</p>
    <p>I had my car cleaned. → birine yaptirdim</p>
  </div>
  <div class="info-box">
    <p><strong>Form:</strong> have / get + object + V3</p>
  </div>
</div>
`,

    passive: `
<div class="content-card">
  <h3>Ek anlatim — Passive Voice</h3>
  <p>Passive'de odak eylemi yapan kisi degil, eylemden etkilenen nesnedir.</p>
  <div class="info-box">
    <p><strong>Form:</strong> be + V3</p>
    <p>Active: They built the bridge.</p>
    <p>Passive: The bridge was built.</p>
  </div>
</div>

<div class="content-card">
  <h3>By kullanimi</h3>
  <div class="source-panel">
    <p>The Sagrada Familia was designed <strong>by</strong> Antoni Gaudi.</p>
  </div>
</div>
`,

    reported: `
<div class="content-card">
  <h3>Ek anlatim — Reported Speech</h3>
  <p>Birinin dedigini dolayli aktarmak icin kullanilir.</p>
  <div class="source-panel">
    <p>Direct: "I have a good memory."</p>
    <p>Reported: She said (that) she had a good memory.</p>
  </div>
</div>

<div class="content-card">
  <h3>Reported questions</h3>
  <div class="warning-box">
    <p>He asked me where I lived. ✅</p>
    <p>He asked me where did I live. ❌</p>
  </div>
  <p>Yes/No sorularinda <strong>if / whether</strong> kullanilir.</p>
</div>
`,

    conditionals3: `
<div class="content-card">
  <h3>Ek anlatim — Third Conditional</h3>
  <p>Gecmiste olmus ama farkli olsaydi sonucu da farkli olurdu dedigimiz durumlari anlatir.</p>
  <div class="info-box">
    <p><strong>Form:</strong> If + had + V3, would have + V3</p>
    <p>If I'd known his number, I would have called him.</p>
  </div>
</div>

<div class="content-card">
  <h3>Past Perfect</h3>
  <p>Gecmiste iki olay varsa daha once olan olayi gosterir.</p>
  <div class="source-panel">
    <p>When we arrived, the train had already left.</p>
  </div>
</div>
`,

    auxiliaries: `
<div class="content-card">
  <h3>Ek anlatim — Be / Do / Have</h3>
  <p>Bu uc fiil hem <strong>main verb</strong> hem <strong>auxiliary verb</strong> olabilir.</p>
  <div class="table-wrap"><table class="source-table"><thead><tr><th>Fiil</th><th>Main verb ornegi</th><th>Auxiliary ornegi</th></tr></thead><tbody>
    <tr><td>be</td><td>She is tired.</td><td>She is studying.</td></tr>
    <tr><td>do</td><td>I do my homework.</td><td>Do you like coffee?</td></tr>
    <tr><td>have</td><td>I have two sisters.</td><td>Have you ever been to Spain?</td></tr>
  </tbody></table></div>
</div>
`
  };

  Object.entries(EXPANDED_STUDY_CONTENT).forEach(([id, html]) => appendTopicHtml(id, html));

  const EXTRA_KEY_POINTS = {
    prepositions: [
      "towards yonu, to ise varisi daha net anlatir.",
      "Preposition sonrasinda fiil gelirse V-ing kullanilir.",
      "discuss ve enter gibi fiiller ekstra preposition istemez."
    ],
    futureforms: [
      "will = anlik karar ve soz verme.",
      "be going to = plan ve kanita dayali tahmin.",
      "was/were going to = gecmiste planlanmis ama gerceklesmemis durum."
    ],
    conditionals12: [
      "1st conditional gercek / muhtemel gelecek icindir.",
      "2nd conditional hayali veya unreal durum icindir.",
      "unless = if not."
    ],
    perfect: [
      "Present Perfect: have/has + V3.",
      "for = sure, since = baslangic noktasi.",
      "Net gecmis zaman ifadesi varsa Past Simple kullan."
    ],
    perfectcont: [
      "Present Perfect Continuous: have/has been + V-ing.",
      "Surece odaklanir, Perfect Simple sonuca odaklanir.",
      "Stative verbs genelde continuous almaz."
    ],
    modals: [
      "mustn't = yasak, don't have to = gereklilik yok.",
      "should / ought to = tavsiye.",
      "had to gecmis zorunluluktur."
    ],
    ability: [
      "be able to tum zamanlarda kullanilabilir.",
      "must = kesin cikarim, might/could = olasilik.",
      "Modal sonrasi her zaman V1 gelir."
    ],
    phrasal: [
      "Type 2 phrasal verbs pronoun ile birlikte araya zamir alir.",
      "Type 3 phrasal verbs ayrilmaz.",
      "look forward to yapisinda to preposition'dir; sonrasi V-ing olur."
    ],
    verbpatterns: [
      "Bazı fiiller to infinitive, bazıları gerund ister.",
      "let ve make sonrasi bare infinitive gelir.",
      "ask/tell/want gibi fiiller object + to infinitive alabilir."
    ],
    causative: [
      "have/get something done = bir işi yaptırmak.",
      "have cleaned ile cleaned ayni anlam degildir.",
      "get something done daha gunluk kullanimdir."
    ],
    passive: [
      "Passive form = be + V3.",
      "Zaman degistikce be degisir, V3 sabit kalir.",
      "by sadece gerekliyse kullanilir."
    ],
    reported: [
      "Reported question'da kelime sirasi duz cumle olur.",
      "yes/no sorularinda if veya whether kullanilir.",
      "ask/tell + object + to infinitive kalibina dikkat et."
    ],
    conditionals3: [
      "Third conditional gecmis unreal durumlar icindir.",
      "If + had V3, would have + V3 kalibi ezberlenmeli.",
      "Past Perfect gecmiste daha once olan olayi gosterir."
    ],
    auxiliaries: [
      "be, do, have hem main hem auxiliary olabilir.",
      "do simple tense soru ve olumsuzlarinda yardimci fiildir.",
      "have perfect tense, be continuous/passive icin yardimci olabilir."
    ]
  };

  Object.entries(EXTRA_KEY_POINTS).forEach(([id, points]) => mergeKeyPoints(id, points));

  const EXTRA_QUESTIONS = {
    prepositions: [
      makeQuestion('The dog ran ________ me, but it didn\'t reach me.', ["to", "towards", "into"], 1, "towards yone dogru demektir; ulasma garanti degildir."),
      makeQuestion('I\'m looking forward to ________ you again.', ["see", "seeing", "to see"], 1, "Preposition sonrasi V-ing gerekir."),
      makeQuestion('Which sentence is correct?', ["We discussed about the problem.", "We discussed the problem.", "We discussed on the problem."], 1, "discuss fiili ekstra preposition almaz.")
    ],
    futureforms: [
      makeQuestion('A: The phone\'s ringing. B: OK, I ________ it.', ["am going to answer", "will answer", "answer"], 1, "Anlik karar oldugu icin will kullanilir."),
      makeQuestion('Look at those black clouds! It ________.', ["will rain", "is raining", "is going to rain"], 2, "Kanita dayali tahminlerde going to kullanilir."),
      makeQuestion('I ________ my dentist on Friday at 3 p.m.', ["see", "am seeing", "will see"], 1, "Ayarlanmis randevu icin Present Continuous kullanilir.")
    ],
    conditionals12: [
      makeQuestion('If you heat ice, it ________.', ["will melt", "melts", "would melt"], 1, "Gercek sonuc veren durumda Present Simple de dogru olabilir; burada genel gercek anlatiliyor."),
      makeQuestion('If I were you, I ________ him the truth.', ["tell", "would tell", "will tell"], 1, "If I were you kalibi genelde would ile kullanilir."),
      makeQuestion('We won\'t be late ________ the train is delayed.', ["unless", "if", "when"], 1, "If clause ile olumsuz anlam kurulur; unless burada mantikli degil.")
    ],
    perfect: [
      makeQuestion('She has lived here ________ 2018.', ["for", "since", "from"], 1, "2018 baslangic noktasi oldugu icin since gerekir."),
      makeQuestion('I\'ve ________ finished my homework.', ["yet", "just", "ago"], 1, "Az once anlaminda just kullanilir."),
      makeQuestion('Which sentence is correct?', ["I\'ve seen him yesterday.", "I saw him yesterday.", "I have saw him yesterday."], 1, "Yesterday net gecmis zaman verir, Past Simple gerekir.")
    ],
    perfectcont: [
      makeQuestion('We ________ for over an hour.', ["have been waiting", "wait", "are waiting yesterday"], 0, "Sure ve halen baglanti oldugu icin Present Perfect Continuous kullanilir."),
      makeQuestion('He\'s very tired because he ________ all day.', ["has been working", "worked", "is working yesterday"], 0, "Gorunur sonuc + surec vurgusu vardir."),
      makeQuestion('Which sentence is wrong?', ["I\'ve been studying all morning.", "She\'s been living here since June.", "I\'ve been knowing him for years."], 2, "know stative fiildir, continuous almaz.")
    ],
    modals: [
      makeQuestion('You ________ pay now. You can pay later.', ["mustn\'t", "don\'t have to", "shouldn\'t"], 1, "Gerek yok anlaminda don\'t have to kullanilir."),
      makeQuestion('You ________ be rude to customers.', ["don\'t have to", "mustn\'t", "ought to"], 1, "mustn\'t yasak anlamindadir."),
      makeQuestion('You look tired. You ________ get some rest.', ["should", "mustn\'t", "don\'t have to"], 0, "Tavsiye icin should kullanilir.")
    ],
    ability: [
      makeQuestion('I haven\'t ________ sleep well recently.', ["can", "been able to", "could"], 1, "Perfect tense icin be able to kullanilir."),
      makeQuestion('She ________ be at home. Her car is outside.', ["can\'t", "must", "won\'t"], 1, "Guclu cikarim icin must kullanilir."),
      makeQuestion('When I was younger, I ________ run very fast.', ["can", "could", "am able to"], 1, "Gecmis genel yetenek icin could kullanilir.")
    ],
    phrasal: [
      makeQuestion('Can you ________ the TV? It\'s too loud.', ["turn it down", "turn down it", "down it turn"], 0, "Pronoun type 2 phrasal verbde ortada olur."),
      makeQuestion('I\'m looking ________ my keys.', ["after", "for", "forward"], 1, "look for = aramak"),
      makeQuestion('Which sentence is correct?', ["She looks after her brother.", "She looks her brother after.", "She after looks her brother."], 0, "look after inseparable bir yapidir.")
    ],
    verbpatterns: [
      makeQuestion('She decided ________ medicine.', ["study", "to study", "studying"], 1, "decide to infinitive alir."),
      makeQuestion('I enjoy ________ books in the evening.', ["read", "to read", "reading"], 2, "enjoy gerund alir."),
      makeQuestion('My parents made me ________ my room.', ["to tidy", "tidy", "tidying"], 1, "make sonrasi bare infinitive gelir.")
    ],
    causative: [
      makeQuestion('I\'m going to ________ my hair cut tomorrow.', ["do", "have", "make"], 1, "have something done yapisi gerekir."),
      makeQuestion('Which sentence means someone else repaired it for me?', ["I repaired my watch.", "I had my watch repaired.", "I was repairing my watch."], 1, "Had my watch repaired = yaptirdim."),
      makeQuestion('She got her passport ________ last week.', ["renew", "renewed", "renewing"], 1, "get + object + V3 kullanilir.")
    ],
    passive: [
      makeQuestion('The letters ________ yesterday.', ["sent", "were sent", "have sent"], 1, "Past Simple Passive = were sent."),
      makeQuestion('The bridge ________ at the moment.', ["is repaired", "is being repaired", "has repaired"], 1, "Su anda devam eden passive eylem = is being repaired."),
      makeQuestion('The Mona Lisa was painted ________ Leonardo da Vinci.', ["with", "from", "by"], 2, "Eylemi yapan kisi by ile verilir.")
    ],
    reported: [
      makeQuestion('"Where do you work?" → He asked me where I ________.', ["worked", "did I work", "work"], 0, "Reported question'da kelime sirasi duz cumledir."),
      makeQuestion('"Please wait here." → She told me ________ there.', ["wait", "to wait", "waiting"], 1, "tell + object + to infinitive kullanilir."),
      makeQuestion('"Are you tired?" → He asked me ________ tired.', ["if I was", "was I", "am I"], 0, "Yes/no sorular if ile aktarilabilir." )
    ],
    conditionals3: [
      makeQuestion('If I ________ earlier, I wouldn\'t have missed the bus.', ["left", "had left", "have left"], 1, "Third conditional if clause'da had + V3 kullanilir."),
      makeQuestion('When we got to the cinema, the film ________ already ________.', ["had / started", "was / starting", "has / started"], 0, "Daha once baslayan olay Past Perfect ile verilir."),
      makeQuestion('If she had studied more, she ________ the exam.', ["would pass", "would have passed", "will pass"], 1, "Third conditional sonuc kısmı would have + V3 olur." )
    ],
    auxiliaries: [
      makeQuestion('A: ________ you like jazz? B: Yes, I do.', ["Are", "Do", "Have"], 1, "Like simple present oldugu icin do yardimci fiili gerekir."),
      makeQuestion('She ________ working right now.', ["does", "has", "is"], 2, "Present Continuous icin be yardimci fiili gerekir."),
      makeQuestion('They ________ already finished the project.', ["do", "have", "are"], 1, "Present Perfect icin have yardimci fiili gerekir.")
    ]
  };

  Object.entries(EXTRA_QUESTIONS).forEach(([id, questions]) => injectQuestions(id, questions));
})();


/* ============================================================
 *  THEME + EXAM EXPANSION PATCH
 *  Tema sheet korunur, soru havuzu 500'e tamamlanir,
 *  60 ve 80 soruluk sinav modlari eklenir.
 * ============================================================ */
(function applyThemeAndExamExpansionPatch() {
  const EXAM_MODES = [
    { chip: "Mini", chipClass: "", label: "Mini Sınav", questionCount: 10, durationMinutes: 8, buttonClass: "primary-btn", description: "Hızlı tekrar sonrası ideal. Süre: 8 dakika." },
    { chip: "Orta", chipClass: " mid", label: "Orta Sınav", questionCount: 20, durationMinutes: 15, buttonClass: "primary-btn soft", description: "Günlük genel kontrol için iyi. Süre: 15 dakika." },
    { chip: "Tam", chipClass: " full", label: "Tam Sınav", questionCount: 30, durationMinutes: 25, buttonClass: "primary-btn dark", description: "Daha ciddi deneme için. Süre: 25 dakika." },
    { chip: "Mega", chipClass: " full", label: "60 Soruluk Sınav", questionCount: 60, durationMinutes: 90, buttonClass: "primary-btn dark", description: "Uzun deneme modu. Süre: 90 dakika (1.5 saat)." },
    { chip: "Ultra", chipClass: " full", label: "80 Soruluk Sınav", questionCount: 80, durationMinutes: 90, buttonClass: "primary-btn dark", description: "En kapsamlı deneme modu. Süre: 90 dakika (1.5 saat)." }
  ];

  function getExamMode(questionCount, durationMinutes) {
    return EXAM_MODES.find((mode) => mode.questionCount === questionCount && (!durationMinutes || mode.durationMinutes === durationMinutes))
      || EXAM_MODES.find((mode) => mode.questionCount === questionCount)
      || { label: `${questionCount} Soruluk Sınav`, questionCount, durationMinutes: durationMinutes || 90 };
  }

  function renderExamModes() {
    const shell = document.querySelector("#examcenter .exam-modes");
    if (!shell) return;
    shell.innerHTML = EXAM_MODES.map((mode) => `
      <div class="exam-mode-card">
        <div class="mode-top">
          <span class="mode-chip${mode.chipClass}">${mode.chip}</span>
          <strong>${mode.questionCount} soru</strong>
        </div>
        <p>${mode.description}</p>
        <button class="${mode.buttonClass}" onclick="startExam(${mode.questionCount}, ${mode.durationMinutes})">${mode.label} Başlat</button>
      </div>
    `).join("");
  }

  function addBankQuestion(topic, question, indexTag) {
    if (!topic || !question) return;
    const options = Array.isArray(question.options) ? question.options.slice(0, 4) : [];
    if (!question.question || options.length < 2 || typeof question.answer !== "number") return;

    QUESTION_BANK.push({
      question: String(question.question),
      options,
      answer: question.answer,
      explanation: question.explanation || "Doğru cevap konu kuralına göre belirlenir.",
      topicId: topic.id,
      topicTitle: topic.title,
      unit: topic.unit,
      uid: `${topic.id}-auto-${indexTag}-${QUESTION_BANK.length}-${Math.random().toString(36).slice(2, 8)}`
    });
  }

  function buildSupplementalQuestions() {
    const generated = [];

    if (Array.isArray(MEMORIZATION_CARDS) && MEMORIZATION_CARDS.length >= 4) {
      MEMORIZATION_CARDS.forEach((card, index) => {
        const distractorBacks = [];
        const distractorFronts = [];

        for (let step = 1; distractorBacks.length < 3 && step < MEMORIZATION_CARDS.length; step += 1) {
          const candidate = MEMORIZATION_CARDS[(index + step) % MEMORIZATION_CARDS.length];
          if (candidate.back !== card.back && !distractorBacks.includes(candidate.back)) distractorBacks.push(candidate.back);
          if (candidate.front !== card.front && !distractorFronts.includes(candidate.front)) distractorFronts.push(candidate.front);
        }

        if (distractorBacks.length === 3) {
          const options = shuffle([card.back, ...distractorBacks]);
          generated.push({
            topicHint: "wordlist1a",
            question: `"${card.front}" kelimesinin doğru Türkçe karşılığı hangisidir?`,
            options,
            answer: options.indexOf(card.back),
            explanation: `${card.front} = ${card.back}`
          });
        }

        if (distractorFronts.length === 3) {
          const options = shuffle([card.front, ...distractorFronts]);
          generated.push({
            topicHint: "wordlist1a",
            question: `"${card.back}" anlamına gelen doğru İngilizce kelime hangisidir?`,
            options,
            answer: options.indexOf(card.front),
            explanation: `${card.back} = ${card.front}`
          });
        }
      });
    }

    TOPICS.forEach((topic) => {
      (topic.quiz || []).forEach((item, idx) => {
        if (!Array.isArray(item.options) || item.options.length < 2) return;
        const rotated = item.options.length > 2 ? [...item.options.slice(1), item.options[0]] : [...item.options];
        const correctOption = item.options[item.answer];
        generated.push({
          topicHint: topic.id,
          question: `${item.question} (Karışık ${idx + 1})`,
          options: rotated,
          answer: rotated.indexOf(correctOption),
          explanation: item.explanation || "Doğru cevap konu kuralına göre belirlenir."
        });
      });
    });

    return generated;
  }

  function expandQuestionBankTo(targetSize = 500) {
    if (QUESTION_BANK.length >= targetSize) return;

    const supplemental = buildSupplementalQuestions();
    supplemental.forEach((item, index) => {
      if (QUESTION_BANK.length >= targetSize) return;
      const topic = getTopicById(item.topicHint) || TOPICS[index % TOPICS.length];
      addBankQuestion(topic, item, `supp-${index}`);
    });

    let cursor = 0;
    while (QUESTION_BANK.length < targetSize) {
      const base = QUESTION_BANK[cursor % QUESTION_BANK.length];
      const rotatedOptions = base.options.length > 2
        ? [...base.options.slice(1), base.options[0]]
        : [...base.options];
      const originalCorrect = base.options[base.answer];
      const newAnswer = rotatedOptions.indexOf(originalCorrect);
      QUESTION_BANK.push({
        ...base,
        options: rotatedOptions,
        answer: newAnswer >= 0 ? newAnswer : base.answer,
        question: `${base.question} (Ek Deneme ${cursor + 1})`,
        explanation: base.explanation || "Doğru cevap konu kuralına göre belirlenir.",
        uid: `${base.topicId}-filler-${cursor}-${Math.random().toString(36).slice(2, 8)}`
      });
      cursor += 1;
    }
  }

  function startExamPatched(questionCount, durationMinutes) {
    const selectedQuestions = buildExamQuestions(questionCount);
    const mode = getExamMode(questionCount, durationMinutes);

    activeExam = {
      label: mode.label,
      durationMinutes: mode.durationMinutes,
      questions: selectedQuestions,
      startedAt: Date.now(),
      endsAt: Date.now() + mode.durationMinutes * 60 * 1000,
      submitted: false
    };

    renderActiveExam();
    navigate("examcenter");

    if (examTimer) clearInterval(examTimer);
    examTimer = setInterval(updateExamTimer, 1000);
    updateExamTimer();
  }

  expandQuestionBankTo(500);
  window.startExam = startExamPatched;

  document.addEventListener("DOMContentLoaded", () => {
    renderExamModes();
    updateDashboardStats();
  });

  if (document.readyState !== "loading") {
    renderExamModes();
    updateDashboardStats();
  }
})();



/* =========================================================
   THEME SHEET / STICKY SEARCH Z-INDEX SAFETY PATCH
   ========================================================= */
(function syncThemeSheetOverlayState() {
  function sync() {
    const sheet = document.getElementById("theme-sheet");
    const isOpen = !!sheet && sheet.classList.contains("open");
    document.body.classList.toggle("theme-sheet-open", isOpen);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeThemeSheet();
  });

  document.addEventListener("DOMContentLoaded", sync);
  if (document.readyState !== "loading") sync();
})();


/* =========================================================
   MOBILE RESPONSIVE UX PATCH
   ========================================================= */
(function applyMobileResponsiveUxPatch() {
  const sheet = document.getElementById("theme-sheet");
  const backdrop = document.getElementById("theme-sheet-backdrop");
  const searchInput = document.getElementById("searchInput");

  function syncViewportState() {
    if (window.innerWidth > 1024) {
      closeMobileMenu();
    }
    if (window.innerWidth > 768 && sheet && !sheet.classList.contains("open")) {
      document.body.classList.remove("nav-open");
    }
  }

  window.addEventListener("orientationchange", () => {
    setTimeout(syncViewportState, 120);
  });

  document.addEventListener("click", (event) => {
    if (!sheet || !backdrop) return;
    const openBtn = document.getElementById("theme-open-btn");
    const clickedInsideSheet = sheet.contains(event.target);
    const clickedOpenBtn = openBtn && openBtn.contains(event.target);
    const clickedBackdrop = backdrop.contains(event.target);

    if (sheet.classList.contains("open") && !clickedInsideSheet && !clickedOpenBtn && clickedBackdrop) {
      closeThemeSheet();
    }
  });

  if (searchInput) {
    searchInput.setAttribute("enterkeyhint", "search");
  }

  syncViewportState();
})();



/* =========================================================
   EXAM FLOW EXPERIENCE PATCH
   Sinav baslat -> direkt aktif sinav alani
   Dogru / yanlis / bos durum renkleri
   Otomatik sonuc + sonraki adimlar
   ========================================================= */
(function applyExamFlowExperiencePatch() {
  let lastExamSession = null;

  function getExamLabel(questionCount) {
    if (questionCount === 10) return "Mini Sınav";
    if (questionCount === 20) return "Orta Sınav";
    if (questionCount === 30) return "Tam Sınav";
    if (questionCount === 60) return "60 Soruluk Sınav";
    if (questionCount === 80) return "80 Soruluk Sınav";
    return `${questionCount} Soruluk Sınav`;
  }

  function getExamCenterSection() {
    return document.getElementById("examcenter");
  }

  function setExamLiveState(isLive) {
    const section = getExamCenterSection();
    if (!section) return;
    section.classList.toggle("exam-live-state", !!isLive);
  }

  function scrollExamWorkspaceIntoView() {
    const workspace = document.getElementById("examWorkspace");
    if (!workspace) return;
    workspace.scrollIntoView({ behavior: "smooth", block: "start" });
    workspace.setAttribute("tabindex", "-1");
    setTimeout(() => {
      try { workspace.focus({ preventScroll: true }); } catch (e) {}
    }, 120);
  }

  function getAnsweredCount() {
    if (!activeExam || !Array.isArray(activeExam.answers)) return 0;
    return activeExam.answers.filter((value) => value !== null && value !== undefined).length;
  }

  function getBlankIndexes() {
    if (!activeExam || !Array.isArray(activeExam.answers)) return [];
    return activeExam.answers
      .map((value, index) => (value === null || value === undefined ? index : null))
      .filter((value) => value !== null);
  }

  function goToExamQuestion(index) {
    if (!activeExam) return;
    const nextIndex = Math.max(0, Math.min(index, activeExam.questions.length - 1));
    activeExam.currentIndex = nextIndex;
    renderEnhancedActiveExam();
    scrollExamWorkspaceIntoView();
  }

  function selectExamAnswer(questionIndex, optionIndex) {
    if (!activeExam || activeExam.submitted) return;
    if (!Array.isArray(activeExam.answers)) activeExam.answers = Array(activeExam.questions.length).fill(null);
    activeExam.answers[questionIndex] = optionIndex;
    renderEnhancedActiveExam();
  }

  function buildQuestionNavButtons(resultMap = null) {
    if (!activeExam) return "";

    // Her sayfada kaç soru gösterilsin? 5, 6, 10 yapabilirsin.
    const PAGE_SIZE = 10;

    const total = activeExam.questions.length;
    const currentIndex = activeExam.currentIndex ?? 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const currentPage = Math.floor(currentIndex / PAGE_SIZE);
    const pageStart = currentPage * PAGE_SIZE;
    const pageEnd = Math.min(pageStart + PAGE_SIZE, total);

    const buttons = [];

    // ‹ Önceki grup (önceki sayfanın son sorusuna atlar)
    if (totalPages > 1 && currentPage > 0) {
      const prevTarget = pageStart - 1;
      buttons.push(`
        <button
          type="button"
          class="exam-nav-btn exam-nav-arrow"
          onclick="goToExamQuestion(${prevTarget})"
          aria-label="Önceki sorular">
          <span>‹</span>
        </button>
      `);
    }

    // Aktif gruptaki soru numaraları
    for (let i = pageStart; i < pageEnd; i++) {
      const isActive = i === currentIndex;
      const selectedIndex = activeExam.answers?.[i] ?? null;

      let stateClass = "is-empty";
      let stateLabel = "Boş";

      if (resultMap && resultMap[i]) {
        const status = resultMap[i].status;
        stateClass = `is-${status}`;
        stateLabel = status === "correct" ? "Doğru" : status === "wrong" ? "Yanlış" : "Boş";
      } else if (selectedIndex !== null) {
        stateClass = "is-answered";
        stateLabel = "Cevaplandı";
      }

      buttons.push(`
        <button
          type="button"
          class="exam-nav-btn ${stateClass} ${isActive ? "is-current" : ""}"
          onclick="goToExamQuestion(${i})"
          aria-label="Soru ${i + 1} - ${stateLabel}">
          <span>${i + 1}</span>
        </button>
      `);
    }

    // › Sonraki grup (sonraki sayfanın ilk sorusuna atlar)
    if (totalPages > 1 && currentPage < totalPages - 1) {
      const nextTarget = pageEnd;
      buttons.push(`
        <button
          type="button"
          class="exam-nav-btn exam-nav-arrow"
          onclick="goToExamQuestion(${nextTarget})"
          aria-label="Sonraki sorular">
          <span>›</span>
        </button>
      `);
    }

    return buttons.join("");
  }

  let isExamCancelDialogOpen = false;

  function syncExamCancelDialogState() {
    document.body.classList.toggle("modal-open", !!isExamCancelDialogOpen);
  }

  function buildCancelExamDialog() {
    return `
      <div class="exam-cancel-backdrop ${isExamCancelDialogOpen ? "open" : ""}" onclick="closeCancelExamDialog()"></div>
      <div class="exam-cancel-dialog ${isExamCancelDialogOpen ? "open" : ""}" role="dialog" aria-modal="true" aria-labelledby="examCancelTitle" aria-describedby="examCancelDesc">
        <div class="exam-cancel-icon">⚠️</div>
        <h3 id="examCancelTitle">Sınavı İptal Et</h3>
        <p id="examCancelDesc">
          Sınavı iptal etmek istediğine emin misin?
          <strong>İptal edersen mevcut sınav ilerlemen kaybolabilir.</strong>
        </p>
        <div class="exam-cancel-actions">
          <button type="button" class="ghost-btn" onclick="closeCancelExamDialog()">Vazgeç</button>
          <button type="button" class="exam-cancel-confirm" onclick="confirmCancelExam()">Evet, İptal Et</button>
        </div>
      </div>
    `;
  }

  function openCancelExamDialog() {
    if (!activeExam) return;
    isExamCancelDialogOpen = true;
    syncExamCancelDialogState();
    renderEnhancedActiveExam();
  }

  function closeCancelExamDialog() {
    isExamCancelDialogOpen = false;
    syncExamCancelDialogState();
    renderEnhancedActiveExam();
  }

  function confirmCancelExam() {
    isExamCancelDialogOpen = false;
    syncExamCancelDialogState();

    if (examTimer) clearInterval(examTimer);
    activeExam = null;
    setExamLiveState(false);
    renderEnhancedActiveExam();
    updateDashboardStats();
  }

  function renderEnhancedActiveExam() {
    const workspace = document.getElementById("examWorkspace");
    if (!workspace) return;

    if (!activeExam || !activeExam.questions?.length) {
      setExamLiveState(false);
      isExamCancelDialogOpen = false;
      syncExamCancelDialogState();
      workspace.innerHTML = `
        <div class="empty-state exam-empty-state">
          <h3>Henüz aktif bir sınav yok</h3>
          <p>Yukarıdan bir sınav türü seç ve direkt aktif sınav ekranına geç.</p>
        </div>
      `;
      return;
    }

    setExamLiveState(true);

    const currentQuestion = activeExam.questions[activeExam.currentIndex] || activeExam.questions[0];
    const currentAnswer = activeExam.answers?.[activeExam.currentIndex] ?? null;
    const answeredCount = getAnsweredCount();
    const blankCount = activeExam.questions.length - answeredCount;
    const isLastQuestion = activeExam.currentIndex >= activeExam.questions.length - 1;

    workspace.innerHTML = `
      <div class="exam-shell premium-exam-shell">
        <div class="exam-shell-head">
          <div class="exam-shell-main">
            <span class="unit-badge exam-badge">AKTİF SINAV</span>
            <h3 class="section-title">${safeText(activeExam.label)}</h3>
            <p>${activeExam.questions.length} soru · ${activeExam.durationMinutes} dakika · Direkt aktif sınav ekranı</p>
          </div>

          <div class="exam-shell-side">
            <div class="timer-pill">⏱️ <span id="exam-timer">--:--</span></div>
            <div class="exam-progress-mini">
              <span><strong>${answeredCount}</strong> cevaplandı</span>
              <span><strong>${blankCount}</strong> boş</span>
            </div>
          </div>
        </div>

        <div class="exam-nav-grid" aria-label="Soru navigasyonu">
          ${buildQuestionNavButtons()}
        </div>

        <div class="exam-focus-card">
          <div class="exam-focus-top">
            <div class="question-meta">${safeText(currentQuestion.unit)} · ${safeText(currentQuestion.topicTitle)} · Soru ${activeExam.currentIndex + 1}</div>
            <div class="question-step-badge">${activeExam.currentIndex + 1} / ${activeExam.questions.length}</div>
          </div>

          <div class="exam-question-title">${safeText(currentQuestion.question)}</div>

          <div class="exam-options">
            ${currentQuestion.options.map((option, optionIndex) => `
              <button
                type="button"
                class="exam-option-btn ${currentAnswer === optionIndex ? "selected" : ""}"
                onclick="selectExamAnswer(${activeExam.currentIndex}, ${optionIndex})"
                aria-pressed="${currentAnswer === optionIndex ? "true" : "false"}">
                <span class="exam-option-letter">${String.fromCharCode(65 + optionIndex)}</span>
                <span class="exam-option-text">${safeText(option)}</span>
              </button>
            `).join("")}
          </div>

          <div class="exam-shell-actions">
            <button
              type="button"
              class="ghost-btn exam-prev-btn"
              ${activeExam.currentIndex === 0 ? "disabled" : ""}
              onclick="goToExamQuestion(${activeExam.currentIndex - 1})">
              ← Önceki Soru
            </button>

            ${!isLastQuestion
              ? `<button type="button" class="secondary-btn exam-next-btn" onclick="goToExamQuestion(${activeExam.currentIndex + 1})">Sonraki Soru →</button>`
              : `<button type="button" class="check-btn exam-finish-btn" onclick="submitEnhancedExam(false)">Sınavı Bitir</button>`
            }
          </div>

          <div class="exam-cancel-row">
            <button type="button" class="exam-cancel-btn" onclick="openCancelExamDialog()">Sınavı İptal Et</button>
          </div>
        </div>
      </div>

      ${buildCancelExamDialog()}
    `;

    syncExamCancelDialogState();
    updateExamTimer();
  }

  function buildResultsFromActiveExam() {
    return activeExam.questions.map((question, index) => {
      const selectedIndex = activeExam.answers?.[index] ?? null;
      const status = selectedIndex === null ? "empty" : selectedIndex === question.answer ? "correct" : "wrong";
      return {
        ...question,
        index,
        selectedIndex,
        status,
        isCorrect: status === "correct",
        isEmpty: status === "empty",
        isWrong: status === "wrong"
      };
    });
  }

  function getWeakestTopic(results) {
    const topicMap = {};

    results.forEach((item) => {
      if (!topicMap[item.topicId]) {
        topicMap[item.topicId] = {
          topicId: item.topicId,
          topicTitle: item.topicTitle,
          unit: item.unit,
          total: 0,
          wrong: 0,
          empty: 0,
          correct: 0
        };
      }

      const target = topicMap[item.topicId];
      target.total += 1;
      if (item.status === "wrong") target.wrong += 1;
      if (item.status === "empty") target.empty += 1;
      if (item.status === "correct") target.correct += 1;
    });

    return Object.values(topicMap).sort((a, b) => {
      const aPenalty = (a.wrong * 2) + a.empty;
      const bPenalty = (b.wrong * 2) + b.empty;
      if (bPenalty !== aPenalty) return bPenalty - aPenalty;
      return b.total - a.total;
    })[0] || null;
  }


  function getDetailedTurkishExamExplanation(item) {
    if (!item) return "Bu soru için açıklama bulunmuyor.";

    const questionText = String(item.question || "").trim();
    const topicTitle = String(item.topicTitle || "").trim();
    const unit = String(item.unit || "").trim();
    const selectedText = item.selectedIndex === null || item.selectedIndex === undefined
      ? "Boş bırakıldı"
      : String(item.options?.[item.selectedIndex] || "").trim();
    const correctText = String(item.options?.[item.answer] || "").trim();
    const baseExplanation = String(item.explanation || "").trim();
    const lowerTopic = topicTitle.toLowerCase();
    const lowerQuestion = questionText.toLowerCase();

    let rule = "Bu soruda doğru cevabı bulmak için önce cümlenin istediği yapıyı belirlemek gerekir.";
    let whyCorrect = `Doğru cevap “${correctText}” çünkü cümlenin anlamına ve konu kuralına en uygun seçenek budur.`;
    let whySelected = "";
    let tip = "Benzer sorularda önce anahtar kelimeyi, sonra cümlenin zamanını ve anlamını kontrol et.";

    if (lowerTopic.includes("future") || /will|going to|shall|tomorrow|cloud|plan|future/i.test(questionText)) {
      rule = "Future Forms sorularında önce kararın ne zaman verildiğine ve elimizde kanıt olup olmadığına bakılır.";
      whyCorrect = `“${correctText}” doğru cevaptır. Çünkü cümlede gelecek anlamı vardır ve yapı, bağlama göre doğru gelecek zaman formunu ister.`;
      tip = "Kanıt varsa genellikle be going to; anlık karar, söz verme veya teklif varsa will/shall; ayarlanmış plan varsa present continuous kullanılır.";
      if (/cloud|look at|evidence|kanıt/i.test(questionText + " " + baseExplanation)) {
        whyCorrect = `“${correctText}” doğru cevaptır. Çünkü cümlede görünen bir kanıt vardır. “Look at those black clouds” gibi ifadeler yağmurun olacağına dair kanıt verdiği için “be going to” kullanılır.`;
        tip = "İpucu: Gözle görülen kanıt = be going to. Sadece kişisel tahmin = will olabilir.";
      }
    } else if (lowerTopic.includes("passive") || lowerQuestion.includes("passive")) {
      rule = "Passive Voice sorularında odak eylemi yapan kişi değil, eylemden etkilenen nesnedir. Yapı genelde be + V3 şeklindedir.";
      whyCorrect = `“${correctText}” doğru cevaptır. Çünkü cümlenin passive karşılığı yapılırken nesne başa alınır ve fiil uygun zamanda be + V3 yapılır.`;
      tip = "Active cümledeki object passive cümlede subject olur. Present Simple passive için is/are + V3, Past Simple passive için was/were + V3 kullanılır.";
    } else if (lowerTopic.includes("present tense") || lowerTopic.includes("present tenses")) {
      rule = "Present Tenses sorularında fiilin durum fiili mi, eylem fiili mi olduğuna ve cümlenin şu an mı, genel alışkanlık mı, plan mı anlattığına bakılır.";
      whyCorrect = `“${correctText}” doğru cevaptır. Çünkü cümledeki zaman ve anlam bu present tense kullanımını gerektirir.`;
      tip = "Stative verbs genelde continuous almaz. Timetable için present simple, ayarlanmış gelecek plan için present continuous kullanılır.";
    } else if (lowerTopic.includes("condition")) {
      rule = "Conditional sorularında if cümlesinin zamanı ve sonuç cümlesindeki yardımcı yapı birlikte kontrol edilir.";
      whyCorrect = `“${correctText}” doğru cevaptır. Çünkü bu cümledeki koşul yapısı doğru zaman uyumunu ister.`;
      tip = "1st conditional: if + present simple, will + verb1. 2nd conditional: if + past simple, would + verb1. 3rd conditional: if + had V3, would have V3.";
    } else if (lowerTopic.includes("perfect")) {
      rule = "Perfect tense sorularında eylemin geçmişle bağlantısı, süresi ve şu ana etkisi kontrol edilir.";
      whyCorrect = `“${correctText}” doğru cevaptır. Çünkü cümle geçmişte başlayıp şimdiyle bağlantısı olan bir anlam taşıyor.`;
      tip = "for süreyi, since başlangıç noktasını gösterir. already/yet/just gibi kelimeler present perfect ile sık kullanılır.";
    } else if (lowerTopic.includes("modal") || lowerTopic.includes("can") || lowerTopic.includes("could") || lowerTopic.includes("able")) {
      rule = "Modal sorularında anlam çok önemlidir: yetenek, izin, zorunluluk, yasak veya mantıksal çıkarım olabilir.";
      whyCorrect = `“${correctText}” doğru cevaptır. Çünkü cümlenin anlamı bu modal yapıyı gerektirir.`;
      tip = "can şimdiki yetenek/izin, could geçmiş genel yetenek, be able to farklı zamanlarda yetenek için kullanılır. must güçlü çıkarım, can't imkansızlık anlatır.";
    } else if (lowerTopic.includes("phrasal")) {
      rule = "Phrasal verb sorularında fiil + particle birlikte düşünülür. Bazı phrasal verbler ayrılabilir, bazıları ayrılamaz.";
      whyCorrect = `“${correctText}” doğru cevaptır. Çünkü bu phrasal verb cümledeki anlamı doğru şekilde tamamlar.`;
      tip = "Nesne zamirse ayrılabilen phrasal verblerde zamir araya gelir: turn it off, call her back.";
    } else if (lowerTopic.includes("pronoun")) {
      rule = "Pronoun sorularında özne, nesne ve iyelik görevleri ayrılmalıdır.";
      whyCorrect = `“${correctText}” doğru cevaptır. Çünkü bu cümlede kelime nesne/iyelik görevine uygun biçimde kullanılmalıdır.`;
      tip = "Preposition sonrasında object pronoun kullanılır: to her, for them, with us.";
    } else if (lowerTopic.includes("adjective")) {
      rule = "Adjective sorularında sıfatın isimden önce geldiği, comparative/superlative yapısı ve one/ones kullanımı kontrol edilir.";
      whyCorrect = `“${correctText}” doğru cevaptır. Çünkü sıfat yapısı cümlenin karşılaştırma veya tanımlama anlamına uygundur.`;
      tip = "Tekil sayılabilir isimde a/an gerekir. Büyük fark için much + comparative, küçük fark için a bit + comparative kullanılır.";
    } else if (lowerTopic.includes("preposition")) {
      rule = "Preposition sorularında fiil/sıfat ile gelen sabit edat ve cümlenin hareket mi konum mu anlattığı kontrol edilir.";
      whyCorrect = `“${correctText}” doğru cevaptır. Çünkü bu kelime cümlenin istediği edat veya hareket anlamını verir.`;
      tip = "Preposition sonrası genelde -ing gelir. discuss, enter, marry gibi bazı fiiller ekstra preposition almaz.";
    } else if (lowerTopic.includes("reported")) {
      rule = "Reported Speech sorularında zaman kayması, kişi zamirleri ve soru kelime sırası kontrol edilir.";
      whyCorrect = `“${correctText}” doğru cevaptır. Çünkü aktarılmış cümlede doğru zaman ve düz cümle sırası kullanılmalıdır.`;
      tip = "Reported question içinde do/does/did kullanılmaz; kelime sırası düz cümle gibi olur: where I lived.";
    }

    if (item.status === "correct") {
      whySelected = `Sen “${selectedText}” seçtin ve bu doğru. Cümledeki anahtar bilgi doğru yapıyı seçmeni sağlamış.`;
    } else if (item.status === "empty") {
      whySelected = "Bu soruyu boş bıraktın. Boş sorularda önce seçenekleri elemek iyi olur: cümlenin zamanı, anlamı ve anahtar kelimesiyle uyuşmayan seçenekleri çıkar.";
    } else {
      whySelected = `Sen “${selectedText}” seçtin; ancak bu seçenek cümlenin istediği dilbilgisi/anlam kuralıyla tam uyuşmuyor. Doğru cevap “${correctText}” olmalı.`;
    }

    const base = baseExplanation
      ? `Kısa kaynak açıklaması: ${baseExplanation}`
      : "Kısa kaynak açıklaması: Bu soru için sistemde kısa açıklama yoktu; detaylı açıklama konu kuralına göre oluşturuldu.";

    return `${rule}\n\n${whyCorrect}\n\n${whySelected}\n\n${base}\n\n${tip}`;
  }


  function getOptionLetter(optionIndex) {
    return String.fromCharCode(65 + Number(optionIndex || 0));
  }

  function getQuestionRuleSummary(item) {
    if (!item) return "Bu soruda seçenekleri cümlenin anlamına ve dilbilgisi kuralına göre elemek gerekir.";
    const topicTitle = String(item.topicTitle || "").toLowerCase();
    const questionText = String(item.question || "").toLowerCase();
    const baseExplanation = String(item.explanation || "").toLowerCase();
    const merged = `${topicTitle} ${questionText} ${baseExplanation}`;

    if (topicTitle.includes("future") || /will|going to|shall|tomorrow|cloud|plan|future/.test(merged)) {
      if (/cloud|look at|kanıt|kanita|evidence/.test(merged)) {
        return "Bu soru Future Forms konusudur. Cümlede gözle görülen kanıt varsa gelecek tahmini için genellikle be going to kullanılır.";
      }
      return "Bu soru Future Forms konusudur. Will, be going to ve present continuous arasındaki fark cümlenin bağlamına göre seçilir.";
    }
    if (topicTitle.includes("passive") || questionText.includes("passive")) {
      return "Bu soru Passive Voice konusudur. Active cümledeki nesne passive cümlede özne olur ve fiil uygun zamanda be + V3 şeklinde kurulur.";
    }
    if (topicTitle.includes("present tense")) {
      return "Bu soru Present Tenses konusudur. Cümlenin alışkanlık, şu an olan eylem, timetable veya ayarlanmış gelecek plan anlamı taşıyıp taşımadığı kontrol edilir.";
    }
    if (topicTitle.includes("condition")) {
      return "Bu soru Conditional konusudur. If kısmındaki zaman ile sonuç kısmındaki yapı birbiriyle uyumlu olmalıdır.";
    }
    if (topicTitle.includes("perfect")) {
      return "Bu soru Perfect Tense konusudur. Eylemin geçmişle bağlantısı, şimdiye etkisi, for/since/yet/already gibi ipuçları kontrol edilir.";
    }
    if (topicTitle.includes("modal") || topicTitle.includes("can") || topicTitle.includes("could") || topicTitle.includes("able")) {
      return "Bu soru Modal konusudur. Seçenekler yetenek, izin, zorunluluk, yasak veya mantıksal çıkarım anlamına göre değerlendirilir.";
    }
    if (topicTitle.includes("phrasal")) {
      return "Bu soru Phrasal Verbs konusudur. Fiil ve particle birlikte düşünülür; bazı yapılar ayrılabilir, bazıları ayrılamaz.";
    }
    if (topicTitle.includes("pronoun")) {
      return "Bu soru Pronouns konusudur. Kelimenin cümlede özne, nesne veya iyelik görevi yapıp yapmadığına bakılır.";
    }
    if (topicTitle.includes("adjective")) {
      return "Bu soru Adjectives konusudur. Sıfatın isme göre konumu, one/ones, comparative veya superlative yapısı kontrol edilir.";
    }
    if (topicTitle.includes("preposition")) {
      return "Bu soru Prepositions konusudur. Fiil veya sıfatla gelen sabit edat ve hareket/konum anlamı kontrol edilir.";
    }
    if (topicTitle.includes("reported")) {
      return "Bu soru Reported Speech konusudur. Zaman kayması, kişi zamiri ve düz cümle kelime sırası kontrol edilir.";
    }

    return "Bu soruda doğru cevabı bulmak için cümlenin anlamını, zamanını ve konu kuralını birlikte kontrol etmek gerekir.";
  }

  function getDetailedOptionReason(item, optionIndex) {
    if (!item || !Array.isArray(item.options)) return "Bu şık için açıklama oluşturulamadı.";

    const optionText = String(item.options[optionIndex] || "").trim();
    const correctText = String(item.options[item.answer] || "").trim();
    const selectedIndex = item.selectedIndex;
    const isCorrect = optionIndex === item.answer;
    const isSelected = selectedIndex === optionIndex;
    const topicTitle = String(item.topicTitle || "").toLowerCase();
    const questionText = String(item.question || "").toLowerCase();
    const baseExplanation = String(item.explanation || "").trim();
    const merged = `${topicTitle} ${questionText} ${String(baseExplanation).toLowerCase()}`;

    let correctReason = `Bu seçenek cümlenin anlamına ve konu kuralına uyduğu için doğru cevaptır.`;
    let wrongReason = `Bu seçenek cümlenin istediği anlam veya dilbilgisi kuralıyla tam uyuşmadığı için doğru değildir.`;

    if (topicTitle.includes("future") || /will|going to|shall|tomorrow|cloud|plan|future/.test(merged)) {
      if (/cloud|look at|kanıt|kanita|evidence/.test(merged)) {
        correctReason = `Cümlede görünen kanıt vardır. Bu yüzden geleceğe dair tahmin “be going to” yapısıyla verilir.`;
        wrongReason = `Bu seçenek görünen kanıta dayalı gelecek tahmini mantığını tam karşılamaz. Bu bağlamda “${correctText}” daha uygundur.`;
      } else {
        correctReason = `Bu seçenek gelecek zaman bağlamını doğru kurduğu için uygundur.`;
        wrongReason = `Bu seçenek gelecek zaman kullanımındaki bağlama uymadığı için elenir.`;
      }
    } else if (topicTitle.includes("passive") || questionText.includes("passive")) {
      correctReason = `Passive yapıda nesne başa alınır ve fiil uygun zamanda be + V3 yapılır. Bu seçenek bu yapıyı doğru kurar.`;
      wrongReason = `Bu seçenek passive yapıyı doğru kurmaz; ya zaman, ya özne-fiil uyumu ya da V3 kullanımı hatalıdır.`;
    } else if (topicTitle.includes("present tense")) {
      correctReason = `Cümlenin zamanı ve anlamı bu present tense kullanımını gerektirir.`;
      wrongReason = `Bu seçenek cümlenin present tense anlamıyla uyuşmaz; stative/action, timetable veya arrangement ipuçlarına dikkat edilmelidir.`;
    } else if (topicTitle.includes("condition")) {
      correctReason = `Koşul cümlesindeki zaman uyumu bu seçenekte doğru kurulmuştur.`;
      wrongReason = `Bu seçenek conditional yapısındaki if kısmı ve sonuç kısmı zaman uyumunu bozduğu için doğru değildir.`;
    } else if (topicTitle.includes("perfect")) {
      correctReason = `Cümlede geçmişle şimdi arasında bağlantı kurulduğu için bu perfect tense yapısı uygundur.`;
      wrongReason = `Bu seçenek perfect tense ipuçlarıyla uyuşmaz. For/since/yet/already veya süre anlamına dikkat edilmelidir.`;
    } else if (topicTitle.includes("modal") || topicTitle.includes("can") || topicTitle.includes("could") || topicTitle.includes("able")) {
      correctReason = `Cümlenin anlamı bu modal yapıyı ister; seçenek yetenek/izin/zorunluluk/çıkarım anlamını doğru verir.`;
      wrongReason = `Bu seçenek cümlenin istediği modal anlamını doğru vermez veya modal sonrası fiil yapısını bozabilir.`;
    } else if (topicTitle.includes("phrasal")) {
      correctReason = `Bu phrasal verb cümlenin anlamını doğru tamamlar ve ayrılabilir/ayrılamaz kullanım kuralına uygundur.`;
      wrongReason = `Bu seçenek phrasal verb anlamına veya nesne zamiri yerleşimine uymadığı için doğru değildir.`;
    } else if (topicTitle.includes("pronoun")) {
      correctReason = `Bu seçenek cümlede gereken pronoun görevine uygundur.`;
      wrongReason = `Bu seçenek cümlede gereken özne/nesne/iyelik görevine uymadığı için elenir.`;
    } else if (topicTitle.includes("adjective")) {
      correctReason = `Bu seçenek sıfat yapısı, karşılaştırma veya one/ones kullanımını doğru kurar.`;
      wrongReason = `Bu seçenek sıfat dizilimi veya comparative/superlative kuralıyla uyuşmadığı için doğru değildir.`;
    } else if (topicTitle.includes("preposition")) {
      correctReason = `Bu seçenek cümlenin istediği sabit edatı veya hareket/konum anlamını doğru verir.`;
      wrongReason = `Bu seçenek fiil/sıfat ile kullanılan doğru edatı vermediği veya hareket/konum anlamını bozduğu için doğru değildir.`;
    } else if (topicTitle.includes("reported")) {
      correctReason = `Reported Speech yapısında zaman kayması ve düz cümle sırası bu seçenekte doğru kurulmuştur.`;
      wrongReason = `Bu seçenek reported speech kelime sırasını, zaman kaymasını veya yardımcı fiil kullanımını bozduğu için doğru değildir.`;
    }

    if (isCorrect && isSelected) {
      return `Bu şık senin seçimin ve doğru cevaptır. Neden doğru? ${correctReason}${baseExplanation ? ` Ek kural: ${baseExplanation}` : ""}`;
    }
    if (isCorrect) {
      return `Bu şık doğru cevaptır. Neden doğru? ${correctReason}${baseExplanation ? ` Ek kural: ${baseExplanation}` : ""}`;
    }
    if (isSelected) {
      return `Bu şık senin seçimin, fakat doğru değildir. Neden olmaz? ${wrongReason} Bu yüzden doğru cevap “${correctText}” olmalıdır.`;
    }
    return `Bu şık doğru değildir. Neden olmaz? ${wrongReason}`;
  }

  function renderDetailedExplanationParagraphs(text) {
    return String(text || "")
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => `<p>${safeText(part)}</p>`)
      .join("");
  }

  function renderOptionExplanationHtml(item) {
    if (!item || !Array.isArray(item.options)) return "";
    return `
      <div class="result-option-explanation-box">
        <strong>Şıklar Üzerinden Açıklama</strong>
        <div class="result-option-explanation-list">
          ${item.options.map((option, optionIndex) => {
            const isCorrect = optionIndex === item.answer;
            const isSelected = item.selectedIndex === optionIndex;
            let cls = "result-option-explanation-item";
            if (isCorrect) cls += " is-correct";
            if (isSelected && !isCorrect) cls += " is-selected-wrong";
            if (isSelected && isCorrect) cls += " is-selected-correct";

            return `
              <div class="${cls}">
                <div class="option-explanation-head">
                  <span class="option-explanation-letter">${getOptionLetter(optionIndex)}</span>
                  <strong>${safeText(option)}</strong>
                  ${isSelected ? `<em>Senin seçimin</em>` : ""}
                  ${isCorrect ? `<em>Doğru cevap</em>` : ""}
                </div>
                <p>${safeText(getDetailedOptionReason(item, optionIndex))}</p>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  function renderExamQuestionDetailHtml(item) {
    if (!item) return "";

    const statusLabel = item.status === "correct" ? "Doğru" : item.status === "wrong" ? "Yanlış" : "Boş";
    const selectedLabel = item.selectedIndex === null ? "Boş" : safeText(item.options[item.selectedIndex]);
    const correctLabel = safeText(item.options[item.answer]);

    return `
      <div class="exam-focus-card result-question-detail" id="examResultQuestionDetail">
        <div class="result-question-detail-head">
          <div>
            <span class="review-status-chip review-status-${item.status}">${statusLabel}</span>
            <h4>${safeText(item.unit)} · ${safeText(item.topicTitle)} · Soru ${item.index + 1}</h4>
          </div>
        </div>

        <p class="result-question-text">${safeText(item.question)}</p>

        <div class="result-option-list" aria-label="Soru seçenekleri">
          ${item.options.map((option, optionIndex) => {
            let cls = "result-option-review";
            const isSelected = item.selectedIndex === optionIndex;
            const isCorrect = item.answer === optionIndex;
            if (isCorrect) cls += " is-correct-answer";
            if (isSelected) cls += " is-selected-answer";
            if (isSelected && !isCorrect) cls += " is-wrong-selected";

            return `
              <div class="${cls}">
                <span class="result-option-letter">${String.fromCharCode(65 + optionIndex)}</span>
                <span class="result-option-text">${safeText(option)}</span>
                ${isSelected ? `<strong class="result-option-tag selected-tag">Senin seçimin</strong>` : ""}
                ${isCorrect ? `<strong class="result-option-tag correct-tag">Doğru cevap</strong>` : ""}
              </div>
            `;
          }).join("")}
        </div>

        <div class="result-detail-summary">
          <div class="review-answer-row review-answer-${item.status}">
            <strong>Senin cevabın:</strong>
            <span>${selectedLabel}</span>
          </div>
          <div class="review-answer-row review-answer-correct">
            <strong>Doğru cevap:</strong>
            <span>${correctLabel}</span>
          </div>
        </div>

        ${renderOptionExplanationHtml(item)}
      </div>
    `;
  }

  function renderExamResultView(filter = "all", focusedIndex = null) {
    const workspace = document.getElementById("examWorkspace");
    if (!workspace || !lastExamSession) return;

    setExamLiveState(false);

    const { label, durationMinutes, results, score, total, percentage, autoSubmitted, blankCount, wrongCount, weakestTopic } = lastExamSession;

    const resultMap = {};
    results.forEach((item) => {
      resultMap[item.index] = { status: item.status };
    });

    const numericFocusIndex = focusedIndex === null || focusedIndex === undefined ? null : Number(focusedIndex);
    const focusedResult = Number.isFinite(numericFocusIndex)
      ? results.find((item) => item.index === numericFocusIndex)
      : null;

    const filteredResults = results.filter((item) => {
      if (filter === "wrong") return item.status === "wrong";
      if (filter === "empty") return item.status === "empty";
      if (filter === "correct") return item.status === "correct";
      return true;
    });

    const weaknessText = weakestTopic
      ? `${safeText(weakestTopic.topicTitle)} (${weakestTopic.wrong} yanlış${weakestTopic.empty ? `, ${weakestTopic.empty} boş` : ""})`
      : "Belirgin bir zayıf konu bulunamadı.";

    workspace.innerHTML = `
      <div class="result-box premium-result-box">
        <div class="result-box-top">
          <div>
            <span class="unit-badge exam-badge">SINAV SONUCU</span>
            <h3 class="result-title">${safeText(label)} Sonucu</h3>
            <p>${autoSubmitted ? "Süre dolduğu için sınav otomatik olarak gönderildi." : "Sınav tamamlandı ve sonuç ekranı otomatik olarak açıldı."}</p>
          </div>

          <div class="result-score-circle">
            <strong>${percentage}%</strong>
            <span>Başarı</span>
          </div>
        </div>

        <div class="result-main premium-result-main">
          <div class="result-stat success">
            <span>Doğru</span>
            <strong>${score}</strong>
          </div>
          <div class="result-stat danger">
            <span>Yanlış</span>
            <strong>${wrongCount}</strong>
          </div>
          <div class="result-stat neutral">
            <span>Boş</span>
            <strong>${blankCount}</strong>
          </div>
          <div class="result-stat">
            <span>Sınav Türü</span>
            <strong>${total} Soru</strong>
          </div>
        </div>

        <div class="result-insight-card">
          <h4>Kısa yorum</h4>
          <p>${blankCount > 0
            ? `Bu sınavda ${blankCount} soruyu boş bıraktın. Önce boşları ve yanlışları tekrar etmek faydalı olur.`
            : wrongCount > 0
            ? `Yanlışlarını inceleyip zayıf olduğun konuya dönersen sonraki sınavda skorun hızlı artar.`
            : `Harika! Tüm soruları doğru yaptın. Şimdi istersen daha büyük bir sınav çözebilirsin.`
          }</p>
          <p><strong>Zayıf konu önerisi:</strong> ${weaknessText}</p>
        </div>

        <div class="exam-nav-grid result-nav-grid" aria-label="Sonuç soru navigasyonu">
          ${results.map((item) => `
            <button
              type="button"
              class="exam-nav-btn is-${item.status}${focusedResult && focusedResult.index === item.index ? " is-focused-result" : ""}"
              onclick="showExamResultQuestion(${item.index})"
              aria-label="Soru ${item.index + 1} detayını aç - ${item.status === "correct" ? "Doğru" : item.status === "wrong" ? "Yanlış" : "Boş"}">
              <span>${item.index + 1}</span>
            </button>
          `).join("")}
        </div>

        ${focusedResult ? renderExamQuestionDetailHtml(focusedResult) : ""}

        <div class="exam-result-actions simple" aria-label="Sınav sonucu hızlı işlemleri">
          <button type="button" class="exam-action-btn primary" onclick="showExamResultFilter('wrong')">
            Yanlışlarımı Gör
          </button>
          <button type="button" class="exam-action-btn secondary" onclick="retryLastExam()">
            Tekrar Sınavı Çöz
          </button>
          <button type="button" class="exam-action-btn ghost" onclick="openWeakTopicFromLastExam()">
            Zayıf Konuyu Aç
          </button>
          <button type="button" class="exam-action-btn ghost" onclick="navigate('memoryhub')">
            Ezber Merkezine Git
          </button>
        </div>
      </div>
    `;
  }

  function submitEnhancedExam(autoSubmitted = false) {
    if (!activeExam || activeExam.submitted) return;

    isExamCancelDialogOpen = false;
    syncExamCancelDialogState();

    const blankIndexes = getBlankIndexes();
    if (!autoSubmitted && blankIndexes.length > 0) {
      const confirmMessage = `${blankIndexes.length} soru boş bırakıldı.\n\nTamam dersen sınav bitecek.\nİptal dersen boş sorulara döneceksin.`;
      const confirmed = window.confirm(confirmMessage);
      if (!confirmed) {
        activeExam.currentIndex = blankIndexes[0];
        renderEnhancedActiveExam();
        scrollExamWorkspaceIntoView();
        return;
      }
    }

    if (examTimer) clearInterval(examTimer);

    const results = buildResultsFromActiveExam();
    const score = results.filter((item) => item.isCorrect).length;
    const blankCount = results.filter((item) => item.isEmpty).length;
    const wrongCount = results.filter((item) => item.isWrong).length;
    const percentage = formatPercent(score, results.length);
    const weakestTopic = getWeakestTopic(results);

    const history = getExamHistory();
    const examHistoryRecord = {
      id: `exam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: activeExam.label,
      durationMinutes: activeExam.durationMinutes,
      score,
      total: results.length,
      percentage,
      blankCount,
      wrongCount,
      correctCount: score,
      autoSubmitted,
      weakestTopic,
      results: results.map((item) => ({
        question: item.question,
        options: Array.isArray(item.options) ? item.options.slice() : [],
        answer: item.answer,
        explanation: item.explanation || "",
        topicId: item.topicId,
        topicTitle: item.topicTitle,
        unit: item.unit,
        uid: item.uid,
        index: item.index,
        selectedIndex: item.selectedIndex,
        status: item.status,
        isCorrect: item.isCorrect,
        isEmpty: item.isEmpty,
        isWrong: item.isWrong
      })),
      date: new Date().toISOString()
    };
    history.unshift(examHistoryRecord);
    setExamHistory(history);

    if (percentage > getBestExam()) {
      setBestExam(percentage);
    }

    lastExamSession = {
      label: activeExam.label,
      durationMinutes: activeExam.durationMinutes,
      total: results.length,
      score,
      wrongCount,
      blankCount,
      percentage,
      results,
      autoSubmitted,
      weakestTopic
    };

    activeExam.submitted = true;
    activeExam = null;

    renderExamResultView("all");
    updateDashboardStats();
    saveProgressToFirebase();
  }

  function cancelEnhancedExam() {
    openCancelExamDialog();
  }

  function retryLastExam() {
    if (!lastExamSession) return;
    window.startExam(lastExamSession.total, lastExamSession.durationMinutes);
  }

  function startWrongRetryExam(limit = 5) {
    if (!lastExamSession) return;

    isExamCancelDialogOpen = false;
    syncExamCancelDialogState();
    const wrongQuestions = lastExamSession.results.filter((item) => item.status !== "correct");
    if (!wrongQuestions.length) {
      alert("Yanlış veya boş soru bulunmuyor.");
      return;
    }

    const selected = shuffle(wrongQuestions.slice()).slice(0, Math.min(limit, wrongQuestions.length)).map((item) => ({
      question: item.question,
      options: item.options.slice(),
      answer: item.answer,
      explanation: item.explanation,
      topicId: item.topicId,
      topicTitle: item.topicTitle,
      unit: item.unit,
      uid: item.uid || `${item.topicId}-retry-${item.index}`
    }));

    activeExam = {
      label: `Yanlışlardan ${selected.length} Soru`,
      durationMinutes: Math.max(5, Math.min(20, selected.length * 2)),
      questions: selected,
      answers: Array(selected.length).fill(null),
      currentIndex: 0,
      startedAt: Date.now(),
      endsAt: Date.now() + Math.max(5, Math.min(20, selected.length * 2)) * 60 * 1000,
      submitted: false
    };

    navigate("examcenter");
    if (examTimer) clearInterval(examTimer);
    examTimer = setInterval(updateExamTimer, 1000);
    renderEnhancedActiveExam();
    updateExamTimer();
    scrollExamWorkspaceIntoView();
  }

  function openWeakTopicFromLastExam() {
    if (!lastExamSession?.weakestTopic?.topicId) {
      navigate("studyhub");
      return;
    }
    openStudyTopic(lastExamSession.weakestTopic.topicId);
  }

  function showExamResultFilter(filter = "all") {
    if (!lastExamSession) return;

    if (filter === "wrong" || filter === "empty" || filter === "correct") {
      const target = lastExamSession.results.find((item) => item.status === filter);
      renderExamResultView(filter, target ? target.index : null);
    } else {
      renderExamResultView(filter);
    }

    scrollExamWorkspaceIntoView();
  }

  function showExamResultQuestion(questionIndex) {
    renderExamResultView("all", Number(questionIndex));
    requestAnimationFrame(() => {
      const detail = document.getElementById("examResultQuestionDetail");
      if (detail) detail.scrollIntoView({ behavior: "smooth", block: "center" });
      else scrollExamWorkspaceIntoView();
    });
  }

  function enhancedStartExam(questionCount, durationMinutes) {
    isExamCancelDialogOpen = false;
    syncExamCancelDialogState();

    const selectedQuestions = buildExamQuestions(questionCount);

    activeExam = {
      label: getExamLabel(questionCount),
      durationMinutes,
      questions: selectedQuestions,
      answers: Array(selectedQuestions.length).fill(null),
      currentIndex: 0,
      startedAt: Date.now(),
      endsAt: Date.now() + durationMinutes * 60 * 1000,
      submitted: false
    };

    navigate("examcenter");
    if (examTimer) clearInterval(examTimer);
    examTimer = setInterval(updateExamTimer, 1000);
    renderEnhancedActiveExam();
    updateExamTimer();
    scrollExamWorkspaceIntoView();
  }

  // Dashboard son sinav kutusunu daha yonlendirici hale getir
  const originalUpdateDashboardStats = updateDashboardStats;
  updateDashboardStats = function patchedUpdateDashboardStats() {
    originalUpdateDashboardStats();

    const latestExamBox = document.getElementById("latest-exam-box");
    if (!latestExamBox) return;

    if (lastExamSession) {
      latestExamBox.innerHTML = `
        <strong>${safeText(lastExamSession.label)}</strong><br>
        ${lastExamSession.score}/${lastExamSession.total} doğru · ${lastExamSession.percentage}%<br>
        <small>${lastExamSession.wrongCount} yanlış · ${lastExamSession.blankCount} boş</small>
        <div class="latest-exam-actions">
          <button type="button" class="ghost-btn small" onclick="navigate('examcenter'); showExamResultFilter('wrong')">Yanlışları Aç</button>
          <button type="button" class="ghost-btn small" onclick="retryLastExam()">Tekrar Çöz</button>
        </div>
      `;
    }
  };

  window.startExam = enhancedStartExam;
  window.renderActiveExam = renderEnhancedActiveExam;
  window.submitExam = submitEnhancedExam;
  window.cancelExam = cancelEnhancedExam;
  window.goToExamQuestion = goToExamQuestion;
  window.selectExamAnswer = selectExamAnswer;
  window.submitEnhancedExam = submitEnhancedExam;
  window.cancelEnhancedExam = cancelEnhancedExam;
  window.openCancelExamDialog = openCancelExamDialog;
  window.closeCancelExamDialog = closeCancelExamDialog;
  window.confirmCancelExam = confirmCancelExam;
  window.showExamResultFilter = showExamResultFilter;
  window.showExamResultQuestion = showExamResultQuestion;
  window.retryLastExam = retryLastExam;
  window.openWeakTopicFromLastExam = openWeakTopicFromLastExam;
  window.startWrongRetryExam = startWrongRetryExam;

  if (document.readyState !== "loading") {
    renderEnhancedActiveExam();
    updateDashboardStats();
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      renderEnhancedActiveExam();
      updateDashboardStats();
    });
  }
})();



/* =========================================================
   MOBILE EXAM UX PATCH
   ========================================================= */
(function applyMobileExamUxPatch() {
  function syncMobileUiState() {
    if (window.innerWidth > 1024) {
      closeMobileMenu();
    }
  }

  window.addEventListener("orientationchange", () => {
    setTimeout(syncMobileUiState, 120);
  });

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.setAttribute("enterkeyhint", "search");
  }

  syncMobileUiState();
})();


/* =========================================================
   MEMORY HUB UPGRADE PATCH
   - Sekme sistemi (practice / cards / matching / typing / weak)
   - MEMORIZATION_CARDS Türkçe düzeltmesi + augment (word/meaning/example/unit/category)
   - Kelime eşleştirme oyunu
   - Yazma testi (normalizeTypedAnswer ile esnek kontrol)
   - Zayıf kelimeler modu (eul_memory_stats)
   - Bugünün 10 kelimesi
   - Favori kelimeler (eul_favorite_words)
   - Firestore: progress/ravza.memoryStats / favoriteWords senkronizasyonu
   ========================================================= */
(function applyMemoryHubUpgradePatch() {
  // ---- 1. Türkçe anlam düzeltme haritası ----
  // EXTRA_MEMORIZATION_CARDS ASCII'ye çevirdiği için tüm Türkçe karakterleri geri yükle.
  // Aynı zamanda zenginleştirilmiş alan (alternativeMeanings, example, unit, category) de ekle.
  const MEMORY_FIXES = {
    "mem-1":  { word: "researchers", meaning: "araştırmacılar", alt: ["bilim insanları"], example: "Researchers are working on new ways to reduce air pollution.", unit: "1A", category: "Vocabulary" },
    "mem-2":  { word: "evidence", meaning: "kanıt", alt: ["delil"], example: "There is strong evidence that exercise improves mental health.", unit: "1A", category: "Vocabulary" },
    "mem-3":  { word: "survey", meaning: "anket", alt: ["araştırma"], example: "The teacher did a survey to find out students' favourite books.", unit: "1A", category: "Vocabulary" },
    "mem-4":  { word: "the average", meaning: "ortalama", alt: [], example: "The average score in the exam was 75.", unit: "1A", category: "Vocabulary" },
    "mem-5":  { word: "scale", meaning: "ölçek", alt: ["skala"], example: "The pain is measured on a scale from 1 to 10.", unit: "1A", category: "Vocabulary" },
    "mem-6":  { word: "rank", meaning: "sıralamak", alt: ["derecelendirmek"], example: "Students were ranked according to their results.", unit: "1A", category: "Vocabulary" },
    "mem-7":  { word: "likely", meaning: "muhtemel", alt: ["olası"], example: "It is likely that it will rain tomorrow.", unit: "1A", category: "Vocabulary" },
    "mem-8":  { word: "overall", meaning: "genel olarak", alt: ["bütünüyle"], example: "Overall, the project was a success.", unit: "1A", category: "Vocabulary" },
    "mem-9":  { word: "beyond", meaning: "ötesinde", alt: ["dışında"], example: "His kindness goes beyond what we imagined.", unit: "1A", category: "Vocabulary" },
    "mem-10": { word: "create a new image", meaning: "yeni bir imaj oluşturmak", alt: [], example: "The company tried to create a new image after the scandal.", unit: "1A", category: "Phrase" },
    "mem-11": { word: "go about", meaning: "bir işi ele almak", alt: ["bir şeye girişmek"], example: "How should we go about solving this problem?", unit: "1A", category: "Phrasal Verb" },
    "mem-12": { word: "proof", meaning: "ispat", alt: ["kanıt"], example: "She showed proof of her identity at the airport.", unit: "1A", category: "Vocabulary" },
    "mem-13": { word: "seek to", meaning: "amaçlamak", alt: ["çalışmak"], example: "The organization seeks to help poor communities.", unit: "1A", category: "Phrase" },
    "mem-14": { word: "stand out", meaning: "öne çıkmak", alt: ["dikkat çekmek"], example: "Her bright dress made her stand out in the crowd.", unit: "1A", category: "Phrasal Verb" },
    "mem-15": { word: "solicitor", meaning: "avukat", alt: ["hukuk müşaviri"], example: "He contacted a solicitor for help with his contract.", unit: "1A", category: "Vocabulary" },
    "mem-16": { word: "for fun", meaning: "eğlence için", alt: [], example: "She paints for fun in her free time.", unit: "1A", category: "Phrase" },
    "mem-17": { word: "birth certificate", meaning: "doğum belgesi", alt: [], example: "You need a birth certificate to apply for a passport.", unit: "1A", category: "Vocabulary" },
    "mem-18": { word: "feel sorry", meaning: "üzülmek", alt: ["acımak"], example: "I feel sorry for him because he lost his job.", unit: "1A", category: "Phrase" },
    "mem-19": { word: "maiden name", meaning: "kızlık soyadı", alt: [], example: "She still uses her maiden name at work.", unit: "1A", category: "Vocabulary" },
    "mem-20": { word: "full name", meaning: "tam ad", alt: ["ad ve soyad"], example: "Please write your full name on the form.", unit: "1A", category: "Vocabulary" },
    "mem-21": { word: "nickname", meaning: "lakap", alt: ["takma ad"], example: "His nickname at school was Ace.", unit: "1A", category: "Vocabulary" },
    "mem-22": { word: "be named after", meaning: "adını birinden almak", alt: [], example: "She was named after her grandmother.", unit: "1A", category: "Phrase" },
    "mem-23": { word: "initials", meaning: "baş harfler", alt: [], example: "His initials are A.K.", unit: "1A", category: "Vocabulary" },
    "mem-24": { word: "brand name", meaning: "marka adı", alt: [], example: "This brand name is known worldwide.", unit: "1A", category: "Vocabulary" },
    "mem-25": { word: "common", meaning: "yaygın", alt: ["sık görülen"], example: "It is common to see tourists in this area.", unit: "1A", category: "Adjective" },
    "mem-26": { word: "old-fashioned", meaning: "eski tarz", alt: ["demode", "modası geçmiş"], example: "That style of clothing looks old-fashioned now.", unit: "1A", category: "Adjective" },
    "mem-27": { word: "celebrity", meaning: "ünlü", alt: ["şöhret"], example: "The restaurant is popular with celebrities.", unit: "1A", category: "Vocabulary" },
    "mem-28": { word: "suit", meaning: "yakışmak", alt: ["uygun olmak"], example: "That colour really suits you.", unit: "1A", category: "Verb" },
    "mem-29": { word: "direct object", meaning: "doğrudan nesne", alt: ["dolaysız nesne"], example: "In 'I bought a book', a book is the direct object.", unit: "1A", category: "Grammar" },
    "mem-30": { word: "indirect object", meaning: "dolaylı nesne", alt: [], example: "In 'I gave him a pen', him is the indirect object.", unit: "1A", category: "Grammar" },
    "mem-31": { word: "object pronoun", meaning: "nesne zamiri", alt: [], example: "me, you, him, her, us, them.", unit: "1A", category: "Grammar" },
    "mem-32": { word: "possessive adjective", meaning: "iyelik sıfatı", alt: [], example: "my, your, his, her, our, their.", unit: "2B", category: "Grammar" },
    "mem-33": { word: "possessive pronoun", meaning: "iyelik zamiri", alt: [], example: "mine, yours, his, hers, ours, theirs.", unit: "2B", category: "Grammar" },
    "mem-34": { word: "lend", meaning: "ödünç vermek", alt: ["borç vermek"], example: "Can you lend me your pen?", unit: "1A", category: "Verb" },
    "mem-35": { word: "borrow", meaning: "ödünç almak", alt: [], example: "I borrowed a book from the library.", unit: "1A", category: "Verb" },
    "mem-36": { word: "ambitious", meaning: "hırslı", alt: ["azimli", "tutkulu"], example: "She is a very ambitious person.", unit: "1B", category: "Adjective" },
    "mem-37": { word: "selfish", meaning: "bencil", alt: [], example: "Cats are more selfish than dogs.", unit: "1B", category: "Adjective" },
    "mem-38": { word: "expensive", meaning: "pahalı", alt: [], example: "iPhones are much more expensive than Redmi.", unit: "1B", category: "Adjective" },
    "mem-39": { word: "cheap", meaning: "ucuz", alt: [], example: "I bought a cheap ticket online.", unit: "1B", category: "Adjective" },
    "mem-40": { word: "comfortable", meaning: "rahat", alt: ["konforlu"], example: "This sofa is very comfortable.", unit: "1B", category: "Adjective" },
    "mem-41": { word: "successful", meaning: "başarılı", alt: [], example: "She is a successful engineer.", unit: "1B", category: "Adjective" },
    "mem-42": { word: "friendly", meaning: "dost canlısı", alt: ["arkadaş canlısı"], example: "The staff were really friendly.", unit: "1B", category: "Adjective" },
    "mem-43": { word: "stative verb", meaning: "durum fiili", alt: [], example: "Know, want and believe are stative verbs.", unit: "2A", category: "Grammar" },
    "mem-44": { word: "possession", meaning: "sahiplik", alt: ["sahip olma"], example: "He has many possessions.", unit: "2B", category: "Grammar" },
    "mem-45": { word: "opinion", meaning: "görüş", alt: ["fikir"], example: "What is your opinion on this?", unit: "2A", category: "Vocabulary" },
    "mem-46": { word: "arrangement", meaning: "önceden ayarlanmış plan", alt: ["düzenleme"], example: "I have an arrangement with the dentist.", unit: "2A", category: "Vocabulary" },
    "mem-47": { word: "timetable", meaning: "tarife", alt: ["zaman çizelgesi"], example: "The flight timetable changed.", unit: "2A", category: "Vocabulary" },
    "mem-48": { word: "ownership", meaning: "sahiplik", alt: ["mülkiyet"], example: "Ownership of the house is shared.", unit: "2B", category: "Vocabulary" },
    "mem-49": { word: "share", meaning: "paylaşmak", alt: ["bölüşmek"], example: "Emma and Mia share a flat.", unit: "2B", category: "Verb" },
    "mem-50": { word: "separate", meaning: "ayrı", alt: ["ayırmak"], example: "They have separate bedrooms.", unit: "2B", category: "Adjective" },
    "mem-51": { word: "own", meaning: "kendine ait", alt: ["sahip olmak"], example: "She has her own room.", unit: "2B", category: "Adjective" },
    "mem-52": { word: "colleague", meaning: "iş arkadaşı", alt: ["meslektaş"], example: "My colleague helped me with the project.", unit: "2B", category: "Vocabulary" },
    "mem-53": { word: "bakery", meaning: "fırın", alt: [], example: "I bought fresh bread at the bakery.", unit: "3A", category: "Vocabulary" },
    "mem-54": { word: "habit", meaning: "alışkanlık", alt: [], example: "Reading before bed is a good habit.", unit: "3A", category: "Vocabulary" },
    "mem-55": { word: "interrupted", meaning: "bölünmüş", alt: ["kesintiye uğramış"], example: "I was reading when she interrupted me.", unit: "3A", category: "Adjective" },
    "mem-56": { word: "background action", meaning: "arka plan eylemi", alt: [], example: "Past continuous shows a background action.", unit: "3A", category: "Grammar" },
    "mem-57": { word: "across", meaning: "karşıya", alt: ["bir uçtan diğer uca"], example: "She swam across the lake.", unit: "3B", category: "Preposition" },
    "mem-58": { word: "through", meaning: "içinden geçerek", alt: [], example: "The car drove through the tunnel.", unit: "3B", category: "Preposition" },
    "mem-59": { word: "along", meaning: "boyunca", alt: [], example: "We walked along the beach.", unit: "3B", category: "Preposition" },
    "mem-60": { word: "towards", meaning: "-e doğru", alt: [], example: "The child ran towards her mother.", unit: "3B", category: "Preposition" },
    "mem-61": { word: "apply for", meaning: "başvurmak", alt: [], example: "She applied for the job.", unit: "3B", category: "Phrasal Verb" },
    "mem-62": { word: "rely on", meaning: "güvenmek", alt: ["bel bağlamak"], example: "You can rely on me.", unit: "3B", category: "Phrasal Verb" },
    "mem-63": { word: "proud of", meaning: "gurur duymak", alt: [], example: "I am proud of you.", unit: "3B", category: "Phrase" },
    "mem-64": { word: "worried about", meaning: "endişeli olmak", alt: [], example: "She is worried about the exam.", unit: "3B", category: "Phrase" },
    "mem-65": { word: "prediction", meaning: "tahmin", alt: [], example: "The prediction came true.", unit: "4A", category: "Vocabulary" },
    "mem-66": { word: "promise", meaning: "söz vermek", alt: ["vaat"], example: "I promise I will call you.", unit: "4A", category: "Verb" },
    "mem-67": { word: "offer", meaning: "teklif etmek", alt: ["teklif"], example: "I'll offer you a hand.", unit: "4A", category: "Verb" },
    "mem-68": { word: "instant decision", meaning: "anında verilen karar", alt: [], example: "I'll get it. (instant decision with will)", unit: "4A", category: "Grammar" },
    "mem-69": { word: "intention", meaning: "niyet", alt: ["amaç"], example: "She has good intentions.", unit: "4A", category: "Vocabulary" },
    "mem-70": { word: "evidence-based", meaning: "kanıta dayalı", alt: [], example: "We need an evidence-based approach.", unit: "4A", category: "Adjective" },
    "mem-71": { word: "conditional", meaning: "koşul yapısı", alt: ["şart kipi"], example: "The first conditional uses if + present simple.", unit: "4B", category: "Grammar" },
    "mem-72": { word: "imaginary", meaning: "hayali", alt: ["gerçek dışı"], example: "The second conditional describes imaginary situations.", unit: "4B", category: "Adjective" },
    "mem-73": { word: "consequence", meaning: "sonuç", alt: [], example: "Every action has a consequence.", unit: "4B", category: "Vocabulary" },
    "mem-74": { word: "unless", meaning: "eğer ... değilse", alt: [], example: "Unless it rains, we will go out.", unit: "4B", category: "Conjunction" },
    "mem-75": { word: "already", meaning: "zaten", alt: ["çoktan"], example: "I have already finished.", unit: "5A", category: "Adverb" },
    "mem-76": { word: "yet", meaning: "henüz", alt: ["şimdiye kadar"], example: "Have you finished yet?", unit: "5A", category: "Adverb" },
    "mem-77": { word: "recently", meaning: "yakın zamanda", alt: [], example: "I have recently moved.", unit: "5A", category: "Adverb" },
    "mem-78": { word: "lately", meaning: "son zamanlarda", alt: [], example: "What have you been doing lately?", unit: "5B", category: "Adverb" },
    "mem-79": { word: "since", meaning: "-den beri", alt: [], example: "I have lived here since 2010.", unit: "5A", category: "Preposition" },
    "mem-80": { word: "obligation", meaning: "zorunluluk", alt: ["yükümlülük"], example: "You have an obligation to attend.", unit: "6A", category: "Vocabulary" },
    "mem-81": { word: "necessity", meaning: "gereklilik", alt: ["ihtiyaç"], example: "Water is a necessity.", unit: "6A", category: "Vocabulary" },
    "mem-82": { word: "prohibition", meaning: "yasak", alt: [], example: "There is a prohibition on smoking here.", unit: "6A", category: "Vocabulary" },
    "mem-83": { word: "advice", meaning: "tavsiye", alt: ["öğüt"], example: "Can I give you some advice?", unit: "6A", category: "Vocabulary" },
    "mem-84": { word: "ability", meaning: "yetenek", alt: ["beceri"], example: "She has the ability to learn quickly.", unit: "6B", category: "Vocabulary" },
    "mem-85": { word: "permission", meaning: "izin", alt: [], example: "May I have permission to leave?", unit: "6B", category: "Vocabulary" },
    "mem-86": { word: "deduction", meaning: "mantıksal çıkarım", alt: ["çıkarsama"], example: "He must be at home — that's a deduction.", unit: "6B", category: "Grammar" },
    "mem-87": { word: "manage to", meaning: "başarmak", alt: ["üstesinden gelmek"], example: "I managed to finish on time.", unit: "6B", category: "Phrase" },
    "mem-88": { word: "get up", meaning: "kalkmak", alt: [], example: "I get up at 7 every day.", unit: "7A", category: "Phrasal Verb" },
    "mem-89": { word: "set off", meaning: "yola çıkmak", alt: ["harekete geçmek"], example: "We set off early in the morning.", unit: "7A", category: "Phrasal Verb" },
    "mem-90": { word: "switch off", meaning: "kapatmak", alt: ["söndürmek"], example: "Please switch off the lights.", unit: "7A", category: "Phrasal Verb" },
    "mem-91": { word: "fill in", meaning: "doldurmak", alt: [], example: "Please fill in the form.", unit: "7A", category: "Phrasal Verb" },
    "mem-92": { word: "put away", meaning: "yerine koymak", alt: ["kaldırmak"], example: "Put away your toys.", unit: "7A", category: "Phrasal Verb" },
    "mem-93": { word: "pay back", meaning: "geri ödemek", alt: [], example: "I will pay you back tomorrow.", unit: "7A", category: "Phrasal Verb" },
    "mem-94": { word: "take after", meaning: "birine benzemek", alt: [], example: "She takes after her mother.", unit: "7A", category: "Phrasal Verb" },
    "mem-95": { word: "look after", meaning: "bakmak", alt: ["ilgilenmek"], example: "She looks after her children.", unit: "7A", category: "Phrasal Verb" },
    "mem-96": { word: "look forward to", meaning: "heyecanla beklemek", alt: ["dört gözle beklemek"], example: "I look forward to seeing you.", unit: "7A", category: "Phrasal Verb" },
    "mem-97": { word: "give away", meaning: "bedava vermek", alt: ["dağıtmak"], example: "She gave away her old clothes.", unit: "7A", category: "Phrasal Verb" },
    "mem-98": { word: "agree to", meaning: "kabul etmek", alt: ["razı olmak"], example: "He agreed to help us.", unit: "7B", category: "Phrase" },
    "mem-99": { word: "decide to", meaning: "karar vermek", alt: [], example: "I decided to study harder.", unit: "7B", category: "Phrase" },
    "mem-100": { word: "avoid", meaning: "kaçınmak", alt: ["sakınmak"], example: "She avoids eating sugar.", unit: "7B", category: "Verb" },
    "mem-101": { word: "allow", meaning: "izin vermek", alt: [], example: "Smoking is not allowed here.", unit: "7B", category: "Verb" },
    "mem-102": { word: "persuade", meaning: "ikna etmek", alt: ["razı etmek"], example: "She persuaded me to go.", unit: "7B", category: "Verb" },
    "mem-103": { word: "have something done", meaning: "bir işi birine yaptırmak", alt: [], example: "I had my hair cut yesterday.", unit: "8A", category: "Grammar" },
    "mem-104": { word: "get something done", meaning: "bir işi yaptırtmak", alt: [], example: "I got my car repaired.", unit: "8A", category: "Grammar" },
    "mem-105": { word: "repair", meaning: "tamir etmek", alt: ["onarmak"], example: "Can you repair my watch?", unit: "8A", category: "Verb" },
    "mem-106": { word: "redecorate", meaning: "yeniden dekore etmek", alt: [], example: "We are redecorating the kitchen.", unit: "8A", category: "Verb" },
    "mem-107": { word: "passive voice", meaning: "edilgen yapı", alt: ["edilgen çatı"], example: "The cake was eaten by the children.", unit: "8B", category: "Grammar" },
    "mem-108": { word: "reported speech", meaning: "dolaylı anlatım", alt: ["aktarılmış anlatım"], example: "She said that she was tired.", unit: "9A", category: "Grammar" },
    "mem-109": { word: "whether", meaning: "olup olmadığı", alt: [], example: "I don't know whether he is coming.", unit: "9A", category: "Conjunction" },
    "mem-110": { word: "request", meaning: "rica", alt: ["talep"], example: "Can I make a request?", unit: "9A", category: "Vocabulary" },
    "mem-111": { word: "third conditional", meaning: "üçüncü koşul yapısı", alt: [], example: "If I had studied, I would have passed.", unit: "9B", category: "Grammar" },
    "mem-112": { word: "regret", meaning: "pişmanlık", alt: ["pişman olmak"], example: "I regret not studying harder.", unit: "9B", category: "Vocabulary" },
    "mem-113": { word: "auxiliary verb", meaning: "yardımcı fiil", alt: [], example: "Be, do and have are auxiliary verbs.", unit: "10A", category: "Grammar" },
    "mem-114": { word: "main verb", meaning: "ana fiil", alt: [], example: "In 'I am running', running is the main verb.", unit: "10A", category: "Grammar" },
    "mem-115": { word: "phrasal verb", meaning: "edatlı fiil", alt: ["fiil + edat"], example: "Look up, turn off and go away are phrasal verbs.", unit: "7A", category: "Grammar" },
    "mem-116": { word: "type 1", meaning: "nesnesiz / ayrılmaz", alt: [], example: "Go away, eat out, get up.", unit: "7A", category: "Grammar" },
    "mem-117": { word: "type 2", meaning: "nesneli / ayrılabilir", alt: [], example: "Turn off the lights / turn the lights off.", unit: "7A", category: "Grammar" },
    "mem-118": { word: "type 3", meaning: "nesneli / ayrılmaz", alt: [], example: "Look for the keys.", unit: "7A", category: "Grammar" },
    "mem-119": { word: "call her back", meaning: "zamir fiil ile edat arasına gelir", alt: [], example: "Call her back, not call back her.", unit: "7A", category: "Grammar" },
    "mem-120": { word: "can", meaning: "şimdiki yetenek / izin", alt: ["yapabilmek"], example: "She can swim.", unit: "6B", category: "Modal" },
    "mem-121": { word: "could", meaning: "geçmişteki genel yetenek", alt: [], example: "When I was 5, I could dance.", unit: "6B", category: "Modal" },
    "mem-122": { word: "be able to", meaning: "yapabilmek (tüm zamanlarda)", alt: [], example: "I have been able to drive since 2011.", unit: "6B", category: "Modal" },
    "mem-123": { word: "must", meaning: "kesinlikle öyle olmalı", alt: ["güçlü çıkarım"], example: "He must be at home; the lights are on.", unit: "6B", category: "Modal" },
    "mem-124": { word: "can't", meaning: "imkansız / öyle olamaz", alt: [], example: "She can't be Kate. She is in Italy.", unit: "6B", category: "Modal" },
    "mem-125": { word: "might / could", meaning: "olasılık", alt: ["belki"], example: "He might be at school.", unit: "6B", category: "Modal" },
    "mem-126": { word: "being able to", meaning: "yapabilmek (gerund hali)", alt: [], example: "I like being able to read quickly.", unit: "6B", category: "Modal" }
  };

  // ---- 2. MEMORIZATION_CARDS'ı in-place augment et ----
  MEMORIZATION_CARDS.forEach((card) => {
    const fix = MEMORY_FIXES[card.id];
    if (!fix) return;
    card.front = fix.word.charAt(0).toUpperCase() + fix.word.slice(1);
    card.back = fix.meaning;
    card.word = fix.word;
    card.meaning = fix.meaning;
    card.alternativeMeanings = fix.alt || [];
    card.example = fix.example || "";
    card.unit = fix.unit || "";
    card.category = fix.category || "";
  });

  // Eksik kartlar varsa güvence için doldur (defensive)
  MEMORIZATION_CARDS.forEach((card) => {
    if (!card.word) card.word = (card.front || "").toLowerCase();
    if (!card.meaning) card.meaning = card.back || "";
    if (!Array.isArray(card.alternativeMeanings)) card.alternativeMeanings = [];
    if (typeof card.example !== "string") card.example = "";
    if (typeof card.unit !== "string") card.unit = "";
    if (typeof card.category !== "string") card.category = "";
  });

  // ---- 3. localStorage helpers ----
  const STATS_KEY = "eul_memory_stats";
  const FAV_KEY = "eul_favorite_words";
  const DAILY_KEY = "eul_daily_ten";
  const FAV_FILTER_KEY = "eul_flashcard_favorites_only";
  let flashcardFavoritesOnly = false;
  try {
    flashcardFavoritesOnly = localStorage.getItem(FAV_FILTER_KEY) === "true";
  } catch {
    flashcardFavoritesOnly = false;
  }

  function safeParse(raw, fallback) {
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function getMemoryStats() {
    return safeParse(localStorage.getItem(STATS_KEY), {});
  }
  function saveMemoryStats(stats) {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (e) {
      console.warn("memoryStats kaydedilemedi:", e);
    }
    syncMemoryStatsToFirebase(stats);
  }

  function getFavorites() {
    const arr = safeParse(localStorage.getItem(FAV_KEY), []);
    return Array.isArray(arr) ? arr : [];
  }
  function saveFavorites(list) {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn("favorites kaydedilemedi:", e);
    }
    syncFavoritesToFirebase(list);
  }

  async function syncMemoryStatsToFirebase(stats) {
    try {
      await setDoc(progressRef, { memoryStats: stats, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) {
      // sessizce localStorage'a fallback
    }
  }
  async function syncFavoritesToFirebase(list) {
    try {
      await setDoc(progressRef, { favoriteWords: list, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) { /* fallback */ }
  }

  async function loadMemoryExtrasFromFirebase() {
    try {
      const snap = await getDoc(progressRef);
      if (!snap.exists()) return;
      const data = snap.data();
      if (data.memoryStats && typeof data.memoryStats === "object") {
        try { localStorage.setItem(STATS_KEY, JSON.stringify(data.memoryStats)); } catch {}
      }
      if (Array.isArray(data.favoriteWords)) {
        try { localStorage.setItem(FAV_KEY, JSON.stringify(data.favoriteWords)); } catch {}
      }
    } catch { /* offline ok */ }
  }

  // ---- 4. Mastery hesaplama ----
  function computeMastery(stat) {
    const total = (stat.correctCount || 0) + (stat.wrongCount || 0);
    if (total === 0) return "weak";
    const ratio = (stat.correctCount || 0) / total;
    const streak = stat.streak || 0;
    if (streak >= 5 && ratio >= 0.9) return "mastered";
    if (streak >= 3 && ratio >= 0.75) return "strong";
    if (ratio >= 0.6) return "medium";
    if (ratio >= 0.3) return "learning";
    return "weak";
  }

  function recordMemoryAttempt(cardId, isCorrect, typedAnswer) {
    if (!cardId) return;
    const card = MEMORIZATION_CARDS.find((c) => c.id === cardId);
    if (!card) return;

    const stats = getMemoryStats();
    const existing = stats[cardId] || {
      cardId,
      word: card.word,
      meaning: card.meaning,
      correctCount: 0,
      wrongCount: 0,
      streak: 0,
      mastery: "weak",
      selectedWrongAnswers: [],
      lastCorrectAt: null,
      lastWrongAt: null
    };

    const now = new Date().toISOString();
    if (isCorrect) {
      existing.correctCount += 1;
      existing.streak = (existing.streak || 0) + 1;
      existing.lastCorrectAt = now;
    } else {
      existing.wrongCount += 1;
      existing.streak = 0;
      existing.lastWrongAt = now;
      if (typedAnswer && existing.selectedWrongAnswers.length < 20) {
        existing.selectedWrongAnswers.push(String(typedAnswer).slice(0, 80));
      }
    }
    existing.word = card.word;
    existing.meaning = card.meaning;
    existing.mastery = computeMastery(existing);

    stats[cardId] = existing;
    saveMemoryStats(stats);
  }

  function clearMemoryStats() {
    if (!confirm("Tüm kelime istatistiklerini sıfırlamak istediğinden emin misin?")) return;
    try { localStorage.removeItem(STATS_KEY); } catch {}
    syncMemoryStatsToFirebase({});
    if (currentMemoryTab === "weak") renderWeakWords();
  }

  // ---- 5. Türkçe-uyumlu cevap normalizasyonu ----
  function normalizeTypedAnswer(value) {
    if (value === null || value === undefined) return "";
    let s = String(value);
    // Mojibake / unicode normalize
    try { s = s.normalize("NFKC"); } catch {}
    s = s.toLowerCase();
    // Apostrof / tire varyasyonları
    s = s.replace(/[‘’ʼ‛`´]/g, "'");
    s = s.replace(/[–—−]/g, "-");
    // Türkçe → ASCII eşlemeleri (klavye farkı toleransı için)
    const map = {
      "ı": "i", "İ": "i", "i̇": "i",
      "ş": "s", "Ş": "s",
      "ç": "c", "Ç": "c",
      "ğ": "g", "Ğ": "g",
      "ü": "u", "Ü": "u",
      "ö": "o", "Ö": "o"
    };
    s = s.replace(/[ışçğüöİŞÇĞÜÖ]/g, (ch) => map[ch] || ch);
    // Tire-boşluk normalize: "well-paid" ile "well paid" eşit kabul edilsin
    s = s.replace(/-/g, " ");
    // Çift boşlukları teke indir
    s = s.replace(/\s+/g, " ").trim();
    return s;
  }

  function checkTypedAnswer(card, typed) {
    const target = normalizeTypedAnswer(card.word);
    const candidate = normalizeTypedAnswer(typed);
    if (!candidate) return false;
    if (candidate === target) return true;
    const accepted = (card.acceptedAnswers || []).map(normalizeTypedAnswer);
    return accepted.includes(candidate);
  }

  // ---- 6. Tab yönetimi ----
  let currentMemoryTab = "practice";

  const TAB_TO_SECTION = {
    practice: "memoryPracticeSection",
    cards: "memoryCardsSection",
    matching: "memoryMatchingSection",
    typing: "memoryTypingSection",
    weak: "memoryWeakSection"
  };

  function setMemoryTab(tab) {
    if (!TAB_TO_SECTION[tab]) return;
    currentMemoryTab = tab;

    // Tüm panelleri kesin gizle: hem 'hidden' attribute hem 'is-hidden' class hem inline style
    Object.entries(TAB_TO_SECTION).forEach(([key, sectionId]) => {
      const el = document.getElementById(sectionId);
      if (!el) return;
      const shouldShow = key === tab;
      if (shouldShow) {
        el.hidden = false;
        el.classList.remove("is-hidden");
        el.style.display = "";
        el.setAttribute("aria-hidden", "false");
      } else {
        el.hidden = true;
        el.classList.add("is-hidden");
        el.setAttribute("aria-hidden", "true");
      }
    });

    // Flashcard sekmesinde, eski toolbar/grid'in `hidden` attribute'unu temizle
    // (orijinal setMemoryHubSection bunları kendi kapatmış olabilir)
    const cardsToolbar = document.querySelector("#memoryhub > .hub-toolbar, #memoryCardsSection .hub-toolbar");
    const cardsGrid = document.getElementById("memoryHubGrid");
    if (tab === "cards") {
      if (cardsToolbar) cardsToolbar.hidden = false;
      if (cardsGrid) cardsGrid.hidden = false;
    }

    // Aktif buton stilini güncelle
    document.querySelectorAll(".memory-tab-btn").forEach((btn) => {
      const isActive = btn.dataset.memTab === tab;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    // Eski 4-şıklı / flashcard global state'ini de senkron tut
    // (ama setMemoryHubSection'ı çağırma — o panel görünürlüğünü tekrar değiştirir)
    if (tab === "practice") memoryHubSection = "practice";
    if (tab === "cards") memoryHubSection = "cards";

    if (tab === "matching") {
      if (!matchingState.cards.length) resetMatchingGame();
    }
    if (tab === "typing") {
      if (!typingState.activeCard) nextTypingQuestion();
    }
    if (tab === "weak") renderWeakWords();
    if (tab === "cards") renderMemorizationHub(document.getElementById("memoryFilter")?.value || "");
  }

  // ---- 7. KELİME EŞLEŞTİRME (MATCHING) ----
  // englishOrder ve turkishOrder bir kere oluşturulur, tıklamada asla yeniden karılmaz
  const matchingState = {
    cards: [],            // çift listesi (her bir öğe: {id, word, meaning})
    englishOrder: [],     // sabit sıra: [{id, label}]
    turkishOrder: [],     // sabit sıra: [{id, label}]
    leftSelected: null,
    rightSelected: null,
    matched: new Set(),
    wrongAttempts: 0,
    pairCount: 8,
    startedAt: null,
    timer: null,
    finished: false,
    weakOnly: false
  };

  function pickMatchingCards(count) {
    const valid = MEMORIZATION_CARDS.filter((c) => c.word && c.meaning && c.meaning.length < 60);
    const seenMeaning = new Set();
    const unique = valid.filter((c) => {
      const key = c.meaning.toLowerCase();
      if (seenMeaning.has(key)) return false;
      seenMeaning.add(key);
      return true;
    });
    return shuffleArray(unique).slice(0, count);
  }

  function pickWeakMatchingCards(count) {
    const stats = getMemoryStats();
    const weakIds = Object.values(stats)
      .filter((s) => (s.wrongCount || 0) > 0)
      .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0))
      .map((s) => s.cardId);
    const cards = weakIds
      .map((id) => MEMORIZATION_CARDS.find((c) => c.id === id))
      .filter(Boolean);
    if (cards.length >= count) return cards.slice(0, count);
    // Yeterli zayıf yoksa rastgele ile tamamla
    const filler = pickMatchingCards(count * 2).filter((c) => !cards.find((x) => x.id === c.id));
    return [...cards, ...filler].slice(0, count);
  }

  function startMatchingTimer() {
    matchingState.startedAt = Date.now();
    if (matchingState.timer) clearInterval(matchingState.timer);
    matchingState.timer = setInterval(() => {
      const el = document.getElementById("matchingTimer");
      if (!el || !matchingState.startedAt) return;
      const sec = Math.floor((Date.now() - matchingState.startedAt) / 1000);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      el.textContent = `${m}:${String(s).padStart(2, "0")}`;
    }, 1000);
  }
  function stopMatchingTimer() {
    if (matchingState.timer) clearInterval(matchingState.timer);
    matchingState.timer = null;
  }

  function changeMatchingSize(value) {
    const n = Number(value) || 8;
    matchingState.pairCount = Math.max(4, Math.min(12, n));
    resetMatchingGame();
  }

  function resetMatchingGame() {
    const board = document.getElementById("matchingBoard");
    const result = document.getElementById("matchingResult");
    if (!board) return;

    // YALNIZCA reset/yenile çağrıldığında shuffle çalışır
    matchingState.cards = matchingState.weakOnly
      ? pickWeakMatchingCards(matchingState.pairCount)
      : pickMatchingCards(matchingState.pairCount);

    // Sıraları bir kere oluştur — sonraki tıklamalarda asla değişmez
    matchingState.englishOrder = matchingState.cards.map((c) => ({
      id: c.id,
      label: c.word.charAt(0).toUpperCase() + c.word.slice(1)
    }));
    matchingState.turkishOrder = shuffleArray(
      matchingState.cards.map((c) => ({ id: c.id, label: c.meaning }))
    );

    matchingState.leftSelected = null;
    matchingState.rightSelected = null;
    matchingState.matched = new Set();
    matchingState.wrongAttempts = 0;
    matchingState.finished = false;

    if (result) {
      result.hidden = true;
      result.innerHTML = "";
    }
    startMatchingTimer();
    renderMatchingBoard();
  }

  function renderMatchingBoard() {
    const board = document.getElementById("matchingBoard");
    if (!board) return;

    // Sabit sıra üzerinden render — shuffle YOK
    const leftItems = matchingState.englishOrder.map((c) => ({ ...c, side: "left" }));
    const rightItems = matchingState.turkishOrder.map((c) => ({ ...c, side: "right" }));

    board.innerHTML = `
      <div class="matching-column english-column">
        <div class="matching-column-title">İngilizce</div>
        ${leftItems.map((c) => renderMatchingCard(c)).join("")}
      </div>
      <div class="matching-column turkish-column">
        <div class="matching-column-title">Türkçe</div>
        ${rightItems.map((c) => renderMatchingCard(c)).join("")}
      </div>
    `;

    const left = document.getElementById("matchingPairsLeft");
    const wrong = document.getElementById("matchingWrongCount");
    if (left) left.textContent = String(matchingState.cards.length - matchingState.matched.size);
    if (wrong) wrong.textContent = String(matchingState.wrongAttempts);
  }

  // Yalnızca seçim/match/wrong durumunu güncelle — DOM'u yeniden inşa etme
  function updateMatchingCardStates() {
    const board = document.getElementById("matchingBoard");
    if (!board) return;
    board.querySelectorAll("[data-match-id]").forEach((el) => {
      const id = el.dataset.matchId;
      const side = el.dataset.matchSide;
      const matched = matchingState.matched.has(id);
      const isSel =
        (side === "left" && matchingState.leftSelected === id) ||
        (side === "right" && matchingState.rightSelected === id);
      el.classList.toggle("matched", matched);
      el.classList.toggle("selected", !!isSel && !matched);
      el.classList.remove("wrong");
      if (matched) el.setAttribute("disabled", "true");
      else el.removeAttribute("disabled");
    });
    const left = document.getElementById("matchingPairsLeft");
    const wrong = document.getElementById("matchingWrongCount");
    if (left) left.textContent = String(matchingState.cards.length - matchingState.matched.size);
    if (wrong) wrong.textContent = String(matchingState.wrongAttempts);
  }

  function renderMatchingCard(card) {
    const matched = matchingState.matched.has(card.id);
    const isLeftSel = matchingState.leftSelected === card.id && card.side === "left";
    const isRightSel = matchingState.rightSelected === card.id && card.side === "right";
    let cls = "matching-card";
    if (matched) cls += " matched";
    if (isLeftSel || isRightSel) cls += " selected";
    return `
      <button type="button" class="${cls}"
        data-match-id="${safeText(card.id)}"
        data-match-side="${card.side}"
        onclick="selectMatchingCard('${safeText(card.id)}','${card.side}')"
        ${matched ? "disabled" : ""}>
        ${safeText(card.label)}
      </button>
    `;
  }

  function selectMatchingCard(cardId, side) {
    if (matchingState.matched.has(cardId)) return;
    if (matchingState.finished) return;

    if (side === "left") matchingState.leftSelected = cardId;
    else matchingState.rightSelected = cardId;

    // Tek seçim varsa sadece state güncelle, shuffle YOK
    if (!matchingState.leftSelected || !matchingState.rightSelected) {
      updateMatchingCardStates();
      return;
    }

    const isMatch = matchingState.leftSelected === matchingState.rightSelected;

    if (isMatch) {
      const matchedId = matchingState.leftSelected;
      matchingState.matched.add(matchedId);
      matchingState.leftSelected = null;
      matchingState.rightSelected = null;

      // Doğru: correctCount artar, streak artar (recordMemoryAttempt halleder)
      recordMemoryAttempt(matchedId, true, null);

      // Yanlış selectedWrongAnswers kayıtlarını temiz tutmak için sadece ana yapıyı güncelle
      updateMatchingCardStates();

      if (matchingState.matched.size >= matchingState.cards.length) {
        finishMatchingGame();
      }
    } else {
      // Yanlış: ilgili İngilizce kart için memoryStats güncelle, yanlış Türkçe anlamı kaydet
      matchingState.wrongAttempts += 1;
      const wrongEnglishId = matchingState.leftSelected;
      const selectedTurkish = matchingState.turkishOrder.find(
        (t) => t.id === matchingState.rightSelected
      );
      const wrongMeaningLabel = selectedTurkish ? selectedTurkish.label : "matching";
      recordMemoryAttempt(wrongEnglishId, false, wrongMeaningLabel);

      // Geçici görsel feedback — kartların POZİSYONU değişmez, sadece class eklenir
      const board = document.getElementById("matchingBoard");
      if (board) {
        const leftEl = board.querySelector(
          `[data-match-side="left"][data-match-id="${matchingState.leftSelected}"]`
        );
        const rightEl = board.querySelector(
          `[data-match-side="right"][data-match-id="${matchingState.rightSelected}"]`
        );
        if (leftEl) leftEl.classList.add("wrong");
        if (rightEl) rightEl.classList.add("wrong");
      }
      updateMatchingCardStates._skipWrongClear = true;

      setTimeout(() => {
        matchingState.leftSelected = null;
        matchingState.rightSelected = null;
        updateMatchingCardStates();
      }, 600);
    }
  }

  function finishMatchingGame() {
    matchingState.finished = true;
    stopMatchingTimer();
    const result = document.getElementById("matchingResult");
    if (!result) return;

    const sec = Math.floor((Date.now() - matchingState.startedAt) / 1000);
    const totalAttempts = matchingState.cards.length + matchingState.wrongAttempts;
    const accuracy = totalAttempts === 0 ? 100 : Math.round((matchingState.cards.length / totalAttempts) * 100);

    result.hidden = false;
    result.innerHTML = `
      <h4>🎉 Tüm eşleşmeler tamam!</h4>
      <div class="matching-result-grid">
        <div class="matching-result-stat"><strong>${matchingState.cards.length}</strong><small>doğru</small></div>
        <div class="matching-result-stat"><strong>${matchingState.wrongAttempts}</strong><small>yanlış</small></div>
        <div class="matching-result-stat"><strong>${accuracy}%</strong><small>başarı</small></div>
        <div class="matching-result-stat"><strong>${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}</strong><small>süre</small></div>
      </div>
      <div class="matching-result-actions">
        <button type="button" class="primary-btn" onclick="resetMatchingGame()">🔄 Tekrar Oyna</button>
        <button type="button" class="primary-btn soft" onclick="startWeakWordPractice('matching')">💔 Zayıf Kelimelerle</button>
        <button type="button" class="ghost-btn" onclick="setMemoryTab('weak')">Zayıfları İncele</button>
      </div>
    `;
  }

  // ---- 8. YAZMA TESTİ ----
  const typingState = {
    activeCard: null,
    answered: false,
    isCorrect: false,
    correctCount: 0,
    wrongCount: 0,
    streak: 0,
    weakOnly: false,
    typedValue: ""
  };

  function pickTypingCard() {
    let pool;
    if (typingState.weakOnly) {
      const stats = getMemoryStats();
      const weakIds = Object.entries(stats)
        .filter(([, s]) => (s.wrongCount || 0) > 0)
        .sort((a, b) => (b[1].wrongCount || 0) - (a[1].wrongCount || 0))
        .map(([id]) => id);
      pool = weakIds.map((id) => MEMORIZATION_CARDS.find((c) => c.id === id)).filter(Boolean);
      if (pool.length === 0) pool = MEMORIZATION_CARDS.filter((c) => c.word && c.meaning);
    } else {
      pool = MEMORIZATION_CARDS.filter((c) => c.word && c.meaning);
    }
    if (!pool.length) return null;
    let chosen = pool[Math.floor(Math.random() * pool.length)];
    let guard = 0;
    while (typingState.activeCard && chosen.id === typingState.activeCard.id && pool.length > 1 && guard < 8) {
      chosen = pool[Math.floor(Math.random() * pool.length)];
      guard += 1;
    }
    return chosen;
  }

  function nextTypingQuestion() {
    typingState.activeCard = pickTypingCard();
    typingState.answered = false;
    typingState.isCorrect = false;
    typingState.typedValue = "";
    renderTypingTest();
    setTimeout(() => {
      const input = document.getElementById("typingInput");
      if (input) input.focus();
    }, 50);
  }

  function submitTypingAnswer() {
    if (!typingState.activeCard || typingState.answered) return;
    const input = document.getElementById("typingInput");
    if (!input) return;
    const typed = input.value;
    typingState.typedValue = typed;

    const isCorrect = checkTypedAnswer(typingState.activeCard, typed);
    typingState.answered = true;
    typingState.isCorrect = isCorrect;

    if (isCorrect) {
      typingState.correctCount += 1;
      typingState.streak += 1;
    } else {
      typingState.wrongCount += 1;
      typingState.streak = 0;
    }

    recordMemoryAttempt(typingState.activeCard.id, isCorrect, typed);
    renderTypingTest();
  }

  function handleTypingKeydown(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (!typingState.answered) {
      submitTypingAnswer();
    } else {
      nextTypingQuestion();
    }
  }

  function renderTypingTest() {
    const card = document.getElementById("typingCard");
    if (!card) return;

    const corr = document.getElementById("typingCorrectCount");
    const wr = document.getElementById("typingWrongCount");
    const sk = document.getElementById("typingStreak");
    if (corr) corr.textContent = String(typingState.correctCount);
    if (wr) wr.textContent = String(typingState.wrongCount);
    if (sk) sk.textContent = String(typingState.streak);

    if (!typingState.activeCard) {
      card.innerHTML = `<div class="empty-grid">Kelime bulunamadı.</div>`;
      return;
    }

    const c = typingState.activeCard;
    const meaningLine = c.alternativeMeanings && c.alternativeMeanings.length
      ? `${safeText(c.meaning)} <small style="opacity:.7;">(${safeText(c.alternativeMeanings.join(", "))})</small>`
      : safeText(c.meaning);

    let inputCls = "typing-input";
    if (typingState.answered) inputCls += typingState.isCorrect ? " success" : " error";

    let feedbackHtml = "";
    if (typingState.answered) {
      if (typingState.isCorrect) {
        feedbackHtml = `<div class="typing-feedback success">✅ Doğru! ${safeText(c.word)}<small>${safeText(c.example || "")}</small></div>`;
      } else {
        feedbackHtml = `<div class="typing-feedback error">❌ Yanlış. Doğru cevap: <strong>${safeText(c.word)}</strong><small>${safeText(c.example || "")}</small></div>`;
      }
    }

    const weakBadge = typingState.weakOnly ? `<span class="matching-pill" style="background:rgba(239,68,68,.14);">💔 Zayıf mod</span>` : "";

    card.innerHTML = `
      <div>
        <span class="typing-prompt-label">Türkçe anlam ${weakBadge}</span>
        <h3 class="typing-prompt">${meaningLine}</h3>
        <p class="typing-hint">İngilizce karşılığını yaz, <kbd>Enter</kbd> ile gönder.</p>
      </div>
      <div class="typing-input-row">
        <input
          type="text"
          id="typingInput"
          class="${inputCls}"
          placeholder="İngilizce yaz…"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="send"
          value="${safeText(typingState.typedValue || "")}"
          ${typingState.answered ? "disabled" : ""}
        />
        ${feedbackHtml}
        <div class="typing-actions">
          ${typingState.answered
            ? `<button type="button" class="primary-btn" onclick="nextTypingQuestion()">➡️ Sonraki Kelime</button>`
            : `<button type="button" class="primary-btn" onclick="submitTypingAnswer()">✅ Kontrol Et</button>`
          }
          <button type="button" class="ghost-btn small" onclick="skipTypingQuestion()">⏭️ Atla</button>
        </div>
      </div>
    `;

    const input = document.getElementById("typingInput");
    if (input && !typingState.answered) {
      input.addEventListener("keydown", handleTypingKeydown);
      input.addEventListener("input", (e) => { typingState.typedValue = e.target.value; });
    }
  }

  function skipTypingQuestion() {
    if (typingState.activeCard && !typingState.answered) {
      // Atlanan kelimeyi de hafif zayıf say
      recordMemoryAttempt(typingState.activeCard.id, false, "(atlandı)");
    }
    nextTypingQuestion();
  }

  // ---- 9. ZAYIF KELİMELER MODU ----
  function renderWeakWords() {
    const list = document.getElementById("weakWordList");
    if (!list) return;
    const stats = getMemoryStats();
    const rows = Object.values(stats)
      .filter((s) => (s.wrongCount || 0) > 0)
      .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0));

    if (!rows.length) {
      list.innerHTML = `<div class="weak-empty">Henüz zayıf kelime yok. 4 Şıklı Test, Eşleştirme veya Yazma Testinde yanlış yapınca burada görünür.</div>`;
      return;
    }

    list.innerHTML = rows.slice(0, 50).map((s) => {
      const card = MEMORIZATION_CARDS.find((c) => c.id === s.cardId);
      const word = card ? card.word : s.word || s.cardId;
      const meaning = card ? card.meaning : s.meaning || "";
      return `
        <div class="weak-word-row">
          <div class="weak-word-info">
            <strong>${safeText(word)}</strong>
            <small>${safeText(meaning)}${card?.example ? " · " + safeText(card.example) : ""}</small>
          </div>
          <div class="weak-word-stats">
            <span>❌ ${s.wrongCount || 0}</span>
            <span class="good">✅ ${s.correctCount || 0}</span>
            <span class="mastery">${safeText(s.mastery || "weak")}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  function startWeakWordPractice(mode) {
    if (mode === "practice") {
      setMemoryTab("practice");
      // 4 şıklı test mevcut sistemi kullanır; kullanıcı zayıfları görmek isterse de "weak" sekmesine gider
      activeMemoryPracticeQuestion = buildMemoryPracticeQuestion(memoryPracticeMode);
      renderMemoryPractice();
    } else if (mode === "matching") {
      matchingState.weakOnly = true;
      setMemoryTab("matching");
      resetMatchingGame();
      // bir tur sonra normale dönsün
      setTimeout(() => { matchingState.weakOnly = false; }, 100);
    } else if (mode === "typing") {
      typingState.weakOnly = true;
      setMemoryTab("typing");
      nextTypingQuestion();
    }
  }

  // ---- 10. BUGÜNÜN 10 KELİMESİ ----
  function getDailyTen() {
    const todayKey = new Date().toISOString().slice(0, 10);
    const cached = safeParse(localStorage.getItem(DAILY_KEY), null);
    if (cached && cached.date === todayKey && Array.isArray(cached.ids)) {
      const cards = cached.ids.map((id) => MEMORIZATION_CARDS.find((c) => c.id === id)).filter(Boolean);
      if (cards.length === cached.ids.length) return cards.map((c, i) => ({ ...c, _tag: cached.tags[i] || "Yeni" }));
    }

    const stats = getMemoryStats();
    const weak = Object.values(stats)
      .filter((s) => (s.wrongCount || 0) > 0)
      .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0))
      .slice(0, 4)
      .map((s) => ({ id: s.cardId, tag: "Zayıf" }));

    const now = Date.now();
    const stale = Object.values(stats)
      .filter((s) => s.lastCorrectAt && (now - new Date(s.lastCorrectAt).getTime()) > 1000 * 60 * 60 * 24 * 5)
      .slice(0, 3)
      .map((s) => ({ id: s.cardId, tag: "Tekrar" }));

    const seenIds = new Set([...weak.map((x) => x.id), ...stale.map((x) => x.id)]);
    const fresh = shuffleArray(MEMORIZATION_CARDS.filter((c) => !stats[c.id] && !seenIds.has(c.id)))
      .slice(0, 10 - weak.length - stale.length)
      .map((c) => ({ id: c.id, tag: "Yeni" }));

    let combined = [...weak, ...stale, ...fresh];
    if (combined.length < 10) {
      const filler = shuffleArray(MEMORIZATION_CARDS.filter((c) => !combined.find((x) => x.id === c.id)))
        .slice(0, 10 - combined.length)
        .map((c) => ({ id: c.id, tag: "Yeni" }));
      combined = [...combined, ...filler];
    }

    const ids = combined.slice(0, 10).map((x) => x.id);
    const tags = combined.slice(0, 10).map((x) => x.tag);

    try {
      localStorage.setItem(DAILY_KEY, JSON.stringify({ date: todayKey, ids, tags }));
    } catch {}

    return ids.map((id, i) => {
      const c = MEMORIZATION_CARDS.find((cc) => cc.id === id);
      return c ? { ...c, _tag: tags[i] } : null;
    }).filter(Boolean);
  }

  function renderDailyTen() {
    const box = document.getElementById("dailyTenCard");
    if (!box) return;
    const list = getDailyTen();
    if (!list.length) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML = `
      <div class="daily-ten-head">
        <h3 class="daily-ten-title">🌟 Bugünün 10 Kelimesi</h3>
        <button type="button" class="ghost-btn small" onclick="setMemoryTab('typing')">Yazma Testi ile Çalış</button>
      </div>
      <div class="daily-ten-list">
        ${list.map((c) => `
          <div class="daily-ten-pill">
            <strong>${safeText(c.word)}</strong>
            <small>${safeText(c.meaning)}</small>
            <span class="daily-ten-tag">${safeText(c._tag)}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  // ---- 11. FAVORİ KELİMELER ----
  function isFavorite(cardId) {
    return getFavorites().includes(cardId);
  }

  function getFlashcardSearchText() {
    return document.getElementById("memoryFilter")?.value || "";
  }

  function updateFavoriteFilterButton() {
    const btn = document.getElementById("memoryFavFilterBtn");
    if (!btn) return;
    btn.classList.toggle("active", flashcardFavoritesOnly);
    btn.setAttribute("aria-pressed", flashcardFavoritesOnly ? "true" : "false");
    btn.title = flashcardFavoritesOnly ? "Tüm kelimeleri göster" : "Sadece favori kelimeleri göster";
    const icon = btn.querySelector(".fav-filter-icon");
    const text = btn.querySelector(".fav-filter-text");
    if (icon) icon.textContent = flashcardFavoritesOnly ? "❤️" : "♡";
    if (text) text.textContent = flashcardFavoritesOnly ? "Favoriler" : "Favoriler";
  }

  function applyFlashcardFavoriteFilter() {
    const grid = document.getElementById("memoryHubGrid");
    if (!grid) return;

    updateFavoriteFilterButton();
    if (!flashcardFavoritesOnly) return;

    const favoriteIds = new Set(getFavorites());
    if (!favoriteIds.size) {
      grid.innerHTML = `
        <div class="empty-grid">
          Henüz favori kelime yok. Kartlardaki kalbe dokunarak favori ekleyebilirsin.
        </div>
      `;
      return;
    }

    const cards = Array.from(grid.querySelectorAll(".memory-card[data-card-id]"));
    let visibleCount = 0;
    cards.forEach((cardEl) => {
      const cardId = cardEl.getAttribute("data-card-id");
      const shouldShow = favoriteIds.has(cardId);
      cardEl.hidden = !shouldShow;
      cardEl.classList.toggle("is-filter-hidden", !shouldShow);
      if (shouldShow) visibleCount += 1;
    });

    if (!visibleCount) {
      grid.innerHTML = `
        <div class="empty-grid">
          Bu aramada favori kelime bulunamadı. Arama metnini temizleyebilir veya Favoriler filtresini kapatabilirsin.
        </div>
      `;
    }
  }

  function toggleFlashcardFavoriteFilter() {
    flashcardFavoritesOnly = !flashcardFavoritesOnly;
    try {
      localStorage.setItem(FAV_FILTER_KEY, flashcardFavoritesOnly ? "true" : "false");
    } catch {}
    updateFavoriteFilterButton();
    renderMemorizationHub(getFlashcardSearchText());
  }

  function toggleFavoriteWord(cardId, event) {
    if (event && typeof event.stopPropagation === "function") event.stopPropagation();
    const list = getFavorites();
    const idx = list.indexOf(cardId);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(cardId);
    saveFavorites(list);

    // Kalp butonunu güncelle
    document.querySelectorAll(`.memory-fav-btn[data-fav-id="${cardId}"]`).forEach((btn) => {
      btn.classList.toggle("active", isFavorite(cardId));
      btn.textContent = isFavorite(cardId) ? "❤️" : "🤍";
    });

    // Favoriler filtresi açıksa, favoriden çıkarılan kart anında listeden kaybolsun.
    if (flashcardFavoritesOnly) {
      requestAnimationFrame(() => renderMemorizationHub(getFlashcardSearchText()));
    }
  }

  // Favori butonunu mevcut flashcard render'ına enjekte et — orijinal renderMemorizationHub'ı sarmalayarak
  const originalRenderMemorizationHub = renderMemorizationHub;
  renderMemorizationHub = function patchedRenderMemorizationHub(filterText = "") {
    originalRenderMemorizationHub(filterText);
    const grid = document.getElementById("memoryHubGrid");
    if (!grid) return;
    grid.querySelectorAll(".memory-card").forEach((cardEl) => {
      const cardId = cardEl.getAttribute("data-card-id");
      if (!cardId || cardEl.querySelector(".memory-fav-btn")) return;
      const fav = isFavorite(cardId);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "memory-fav-btn" + (fav ? " active" : "");
      btn.dataset.favId = cardId;
      btn.textContent = fav ? "❤️" : "🤍";
      btn.setAttribute("aria-label", fav ? "Favoriden çıkar" : "Favoriye ekle");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleFavoriteWord(cardId, e);
      });
      cardEl.appendChild(btn);
    });
    applyFlashcardFavoriteFilter();
  };
  window.renderMemorizationHub = renderMemorizationHub;
  window.toggleFlashcardFavoriteFilter = toggleFlashcardFavoriteFilter;

  // ---- 12. Window globals ----
  window.setMemoryTab = setMemoryTab;
  window.resetMatchingGame = resetMatchingGame;
  window.changeMatchingSize = changeMatchingSize;
  window.selectMatchingCard = selectMatchingCard;
  window.submitTypingAnswer = submitTypingAnswer;
  window.nextTypingQuestion = nextTypingQuestion;
  window.skipTypingQuestion = skipTypingQuestion;
  window.startWeakWordPractice = startWeakWordPractice;
  window.clearMemoryStats = clearMemoryStats;
  window.toggleFavoriteWord = toggleFavoriteWord;
  window.normalizeTypedAnswer = normalizeTypedAnswer;
  window.recordMemoryAttempt = recordMemoryAttempt;

  // 4 Şıklı test'in mevcut submitMemoryPracticeAnswer'ını sarmala — istatistik kaydı ekle
  const originalSubmitPractice = submitMemoryPracticeAnswer;
  submitMemoryPracticeAnswer = function patchedSubmit(optionIndex) {
    if (activeMemoryPracticeQuestion && !activeMemoryPracticeQuestion.answered) {
      const opt = activeMemoryPracticeQuestion.options[optionIndex];
      // Mevcut kart bul: prompt'tan kartı bul
      const promptVal = activeMemoryPracticeQuestion.prompt;
      const card = MEMORIZATION_CARDS.find((c) =>
        activeMemoryPracticeQuestion.mode === "en-tr"
          ? c.front === promptVal
          : c.back === promptVal
      );
      if (card && opt) {
        recordMemoryAttempt(card.id, !!opt.isCorrect, opt.label);
      }
    }
    originalSubmitPractice(optionIndex);
  };
  window.submitMemoryPracticeAnswer = submitMemoryPracticeAnswer;

  // ---- 13. İlk yükleme ----
  function bootstrap() {
    // Orijinal setMemoryHubSection çağrısı bu noktada zaten çalıştı; biz son söz olarak
    // sekme sistemini uyguluyoruz. Bu yüzden setMemoryTab her zaman kazanır.
    setMemoryTab("practice");
    renderWeakWords();
    // Eski 4-şıklı render'ını yeni HTML ile yenile
    if (typeof activeMemoryPracticeQuestion !== "undefined" && !activeMemoryPracticeQuestion) {
      activeMemoryPracticeQuestion = buildMemoryPracticeQuestion(memoryPracticeMode);
    }
    renderMemoryPracticeRedesigned();
  }

  // ---- "Bugünün 10 Kelimesi" devre dışı: render no-op ----
  // (Eski fonksiyon adı çağrılırsa çakışmaması için override)
  function renderDailyTenNoop() {
    const box = document.getElementById("dailyTenCard");
    if (box && box.parentNode) box.parentNode.removeChild(box);
  }
  // Patch içindeki orijinal renderDailyTen'i no-op'a çevir
  // (sonraki çağrılar boşa düşsün)
  // eslint-disable-next-line no-func-assign
  renderDailyTen = renderDailyTenNoop;

  // ---- 4 Şıklı Test — yeni mobil-uyumlu render ----
  function renderMemoryPracticeRedesigned() {
    const practiceCard = document.getElementById("memoryPracticeCard");
    if (!practiceCard) return;

    if (!activeMemoryPracticeQuestion) {
      activeMemoryPracticeQuestion = buildMemoryPracticeQuestion(memoryPracticeMode);
    }

    const enTrButton = document.getElementById("memoryModeEnTr");
    const trEnButton = document.getElementById("memoryModeTrEn");
    if (enTrButton) {
      enTrButton.classList.toggle("active", memoryPracticeMode === "en-tr");
      enTrButton.setAttribute("aria-pressed", memoryPracticeMode === "en-tr" ? "true" : "false");
    }
    if (trEnButton) {
      trEnButton.classList.toggle("active", memoryPracticeMode === "tr-en");
      trEnButton.setAttribute("aria-pressed", memoryPracticeMode === "tr-en" ? "true" : "false");
    }

    if (!activeMemoryPracticeQuestion) {
      practiceCard.innerHTML = `<div class="empty-grid">Çalışma sorusu oluşturulamadı.</div>`;
      return;
    }

    const q = activeMemoryPracticeQuestion;
    const promptLabel = q.mode === "en-tr" ? "İNGİLİZCE KELİME" : "TÜRKÇE ANLAM";
    const instruction = q.mode === "en-tr" ? "Doğru Türkçe anlamı seç." : "Doğru İngilizce kelimeyi seç.";

    let feedbackHtml = "";
    if (q.answered) {
      if (q.isCorrect) {
        feedbackHtml = `<div class="memory-feedback success" role="status">✅ Doğru cevap!</div>`;
      } else {
        feedbackHtml = `<div class="memory-feedback error" role="status">❌ Yanlış. Doğru cevap: <strong>${safeText(q.correctLabel)}</strong></div>`;
      }
    }

    practiceCard.innerHTML = `
      <div class="memory-practice-redesign">
        <div class="memory-question-card">
          <span class="memory-question-label">${safeText(promptLabel)}</span>
          <strong class="memory-question-text">${safeText(q.prompt)}</strong>
          <p class="memory-question-hint">${safeText(instruction)}</p>
        </div>

        <div class="memory-options-grid" role="radiogroup" aria-label="Cevap seçenekleri">
          ${q.options.map((option, index) => {
            let cls = "memory-option-card";
            if (q.answered && option.isCorrect) cls += " correct";
            if (q.answered && !option.isCorrect && q.selectedIndex === index) cls += " wrong";
            if (q.answered) cls += " locked";
            return `
              <button
                type="button"
                class="${cls}"
                onclick="submitMemoryPracticeAnswer(${index})"
                ${q.answered ? "disabled" : ""}
                role="radio"
                aria-checked="${q.selectedIndex === index ? "true" : "false"}">
                <span class="memory-option-tag">SEÇENEK ${index + 1}</span>
                <span class="memory-option-label">${safeText(option.label)}</span>
              </button>
            `;
          }).join("")}
        </div>

        ${feedbackHtml}

        <button
          type="button"
          class="primary-btn memory-next-btn"
          onclick="nextMemoryPracticeQuestion()"
          ${q.answered ? "" : "disabled"}>
          ➡️ Sonraki Kelime
        </button>
      </div>
    `;
  }

  // Mevcut renderMemoryPractice'i sarmala — yeni redesign'a yönlendir
  // (orijinal fonksiyon eskiden mod butonlarını da yönetiyordu; redesign aynısını yapıyor)
  // eslint-disable-next-line no-func-assign
  renderMemoryPractice = renderMemoryPracticeRedesigned;
  window.renderMemoryPractice = renderMemoryPractice;
  window.renderMemoryPracticeRedesigned = renderMemoryPracticeRedesigned;

  // ---- 14. SCROLL TOP BUTON ----
  function initScrollTopButton() {
    const btn = document.getElementById("scrollTopBtn");
    if (!btn) return;
    let visible = false;
    const onScroll = () => {
      const shouldShow = (window.scrollY || document.documentElement.scrollTop) > 300;
      if (shouldShow !== visible) {
        visible = shouldShow;
        btn.classList.toggle("show", shouldShow);
      }
    };
    btn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initScrollTopButton);
  } else {
    initScrollTopButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      // Microtask ile orijinal init'ten sonra çalış
      Promise.resolve()
        .then(() => loadMemoryExtrasFromFirebase())
        .finally(() => {
          // İki rAF ekleyerek orijinal renderların bitmesini bekle
          requestAnimationFrame(() => requestAnimationFrame(bootstrap));
        });
    });
  } else {
    loadMemoryExtrasFromFirebase().finally(() => {
      requestAnimationFrame(() => requestAnimationFrame(bootstrap));
    });
  }
})();


/* ============================================================
   PROFESSIONAL EXAM CENTER DASHBOARD LOGIC
   Sadece Sınav Merkezi görsel dashboard alanını besler.
   ============================================================ */
(function professionalExamCenterDashboard() {
  function safeExamHistory() {
    try {
      return typeof getExamHistory === "function" ? getExamHistory() : [];
    } catch {
      return [];
    }
  }

  function examPercentLabel(value) {
    const n = Number(value) || 0;
    return `${Math.max(0, Math.min(100, Math.round(n)))}%`;
  }

  function formatShortExamDate(dateValue) {
    try {
      return new Intl.DateTimeFormat("tr-TR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(dateValue));
    } catch {
      return "Tarih yok";
    }
  }

  function getQualityMeta(percentage) {
    if (percentage >= 90) return { text: "Mükemmel", cls: "" };
    if (percentage >= 75) return { text: "İyi", cls: "mid" };
    return { text: "Orta", cls: "low" };
  }

  function getThisWeekExamCount(history) {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return history.filter((item) => {
      const d = new Date(item.date || 0);
      return d >= start && d <= now;
    }).length;
  }

  function updateProfessionalExamDashboardStats() {
    const history = safeExamHistory();
    const total = history.length;
    const totalCorrect = history.reduce((sum, item) => sum + (Number(item.score) || 0), 0);
    const avg = total
      ? Math.round(history.reduce((sum, item) => sum + (Number(item.percentage) || 0), 0) / total)
      : 0;
    const highest = total
      ? Math.max(...history.map((item) => Number(item.percentage) || 0), 0)
      : (typeof getBestExam === "function" ? getBestExam() : 0);
    const weekCount = getThisWeekExamCount(history);
    const weeklyGoal = Math.min(100, Math.round((weekCount / 5) * 100));
    const avgGoal = Math.min(100, Math.round((avg / 85) * 100));

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    const setWidth = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.style.width = `${Math.max(0, Math.min(100, value))}%`;
    };

    setText("exam-total-count", String(total));
    setText("exam-weekly-change", `Bu hafta +${weekCount}`);
    setText("exam-average-score", examPercentLabel(avg));
    setText("exam-highest-score", examPercentLabel(highest));
    setText("exam-total-correct", String(totalCorrect));
    setText("exam-weekly-goal", examPercentLabel(weeklyGoal));
    setText("exam-average-goal-label", examPercentLabel(avg));
    setWidth("exam-weekly-goal-bar", weeklyGoal);
    setWidth("exam-average-goal-bar", avgGoal);

    renderProfessionalRecentExams(history);
    renderExamPerformanceChart();
  }

  function renderProfessionalRecentExams(history = safeExamHistory()) {
    const list = document.getElementById("examRecentList");
    if (!list) return;

    const recent = history.slice(0, 4);
    if (!recent.length) {
      list.innerHTML = `<div class="exam-empty-mini">Henüz sınav geçmişi yok. İlk denemeni başlatınca burada görünecek.</div>`;
      return;
    }

    list.innerHTML = recent.map((item, index) => {
      const percentage = Number(item.percentage) || 0;
      const quality = getQualityMeta(percentage);
      const icon = index % 4 === 0 ? "📖" : index % 4 === 1 ? "🧠" : index % 4 === 2 ? "🎧" : "📄";
      return `
        <button type="button" class="exam-recent-item" onclick="openExamHistorySession(${index})" aria-label="${safeText(item.label || "Sınav")} sonucunu aç">
          <span class="exam-recent-icon">${icon}</span>
          <span class="exam-recent-title">
            <strong>${safeText(item.label || "Sınav")}</strong>
            <small>${safeText(formatShortExamDate(item.date))}</small>
          </span>
          <span class="exam-score-ring" style="--p:${percentage}"><span>${percentage}%</span></span>
          <span class="exam-recent-score">
            <strong>${Number(item.score) || 0} / ${Number(item.total) || 0}</strong>
            <small>Doğru</small>
          </span>
          <span class="exam-quality-pill ${quality.cls}">${quality.text}</span>
        </button>
      `;
    }).join("");
  }

  function getCssVar(name, fallback) {
    try {
      const value = getComputedStyle(document.body).getPropertyValue(name).trim();
      return value || fallback;
    } catch {
      return fallback;
    }
  }

  function getExamChartThemePalette() {
    const body = document.body;
    const isDark = body?.classList?.contains("dark");
    const theme = body?.dataset?.themeStyle || "noel-ask";
    const cssPink = getCssVar("--pink", "#d85f93");
    const cssBright = getCssVar("--pink-bright", "#ef8bb3");
    const cssNavy = getCssVar("--navy", "#7b1731");
    // SVG içine renkler inline basıldığı için dark/light değişince grafik yeniden çizilir.
    // Dark mode'da yazıların silik kalmaması için CSS değişkenlerinin üstüne
    // daha yüksek kontrastlı güvenli renkler uygulanır.
    const cssText = isDark ? "#fff7fb" : getCssVar("--text", "#3f1f2d");
    const cssTextLight = isDark ? "#f0cfdb" : getCssVar("--text-light", "#765367");
    const cssBorder = getCssVar("--card-border", isDark ? "#5b2a3c" : "#efc9d8");
    const cssCard = isDark ? "#150b12" : getCssVar("--white", "#ffffff");

    const themeMap = {
      "gece-mavisi": {
        line1: "#60a5fa",
        line2: "#38bdf8",
        line3: "#818cf8",
        goal: "#22c55e",
        danger: "#fb7185"
      },
      "orman-yesili": {
        line1: "#34d399",
        line2: "#22c55e",
        line3: "#a3e635",
        goal: "#14b8a6",
        danger: "#f97316"
      },
      "mor-isik": {
        line1: "#a78bfa",
        line2: "#c084fc",
        line3: "#f0abfc",
        goal: "#22c55e",
        danger: "#fb7185"
      },
      "klasik-koyu": {
        line1: "#94a3b8",
        line2: "#60a5fa",
        line3: "#c084fc",
        goal: "#22c55e",
        danger: "#fb7185"
      },
      "pembe-tema": {
        line1: "#d85f93",
        line2: "#ef8bb3",
        line3: "#fb7185",
        goal: "#10b981",
        danger: "#f97316"
      },
      "noel-ask": {
        line1: "#dc5f86",
        line2: "#ff9db8",
        line3: "#f59e0b",
        goal: "#14b8a6",
        danger: "#ef4444"
      }
    };

    const themeColors = themeMap[theme] || themeMap["noel-ask"];
    return {
      isDark,
      theme,
      text: cssText,
      textLight: cssTextLight,
      card: cssCard,
      border: cssBorder,
      navy: cssNavy,
      accent: themeColors.line1 || cssPink,
      accent2: themeColors.line2 || cssBright,
      accent3: themeColors.line3 || cssNavy,
      goal: themeColors.goal,
      danger: themeColors.danger,
      bg: isDark ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.74)",
      grid: isDark ? "rgba(255,255,255,0.16)" : "rgba(123,23,49,0.12)",
      axis: isDark ? "rgba(255,255,255,0.28)" : "rgba(123,23,49,0.22)",
      cardStroke: isDark ? "rgba(255,255,255,0.18)" : "rgba(123,23,49,0.14)",
      tooltipBg: isDark ? "rgba(21,11,18,.98)" : "rgba(255,255,255,.96)",
      tooltipText: isDark ? "#fff7fb" : "#3f1f2d"
    };
  }

  function formatChartDate(dateValue) {
    try {
      return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(new Date(dateValue));
    } catch {
      return "—";
    }
  }

  function renderExamPerformanceChart() {
    const svg = document.getElementById("examPerformanceSvg");
    const insights = document.getElementById("examChartInsights");
    const legend = document.getElementById("examChartLegend");
    if (!svg) return;

    const palette = getExamChartThemePalette();
    const rangeValue = Number(document.getElementById("examChartRange")?.value || 7);
    const mode = document.getElementById("examChartMode")?.value || "score";
    const rawHistory = safeExamHistory().filter((item) => typeof item.percentage !== "undefined");
    const limitedHistory = rawHistory
      .slice(0, rangeValue >= 999 ? rawHistory.length : Math.max(7, rangeValue))
      .map((item, originalIndex) => ({ item, originalIndex }))
      .reverse();

    const isChartMobile = window.matchMedia("(max-width: 640px)").matches;
    const isChartTablet = window.matchMedia("(max-width: 900px)").matches;
    const width = isChartMobile ? 560 : isChartTablet ? 680 : 800;
    const height = mode === "topics"
      ? (isChartMobile ? 450 : 360)
      : (isChartMobile ? 360 : 350);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.classList.toggle("is-mobile-chart", isChartMobile);

    const emptySvg = () => {
      if (insights) {
        insights.innerHTML = `
          <div class="exam-chart-mini-card">
            <span>Durum</span><strong>Veri yok</strong><small>Grafik için önce bir sınav çöz.</small>
          </div>
          <div class="exam-chart-mini-card">
            <span>İpucu</span><strong>Mini sınav</strong><small>10 soruluk sınavla hızlı başlangıç yap.</small>
          </div>
        `;
      }
      if (legend) legend.innerHTML = "";
      svg.innerHTML = `
        <defs>
          <linearGradient id="examEmptyThemeBg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="${palette.accent}" stop-opacity="${palette.isDark ? ".16" : ".12"}"/>
            <stop offset=".52" stop-color="${palette.accent2}" stop-opacity="${palette.isDark ? ".10" : ".08"}"/>
            <stop offset="1" stop-color="${palette.card}" stop-opacity=".92"/>
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${width}" height="${height}" rx="28" fill="url(#examEmptyThemeBg)" stroke="${palette.cardStroke}"/>
        <circle cx="${width / 2}" cy="130" r="36" fill="${palette.accent}" opacity=".16"></circle>
        <text x="${width / 2}" y="140" text-anchor="middle" fill="${palette.accent}" font-size="32" font-weight="900">↗</text>
        <text x="${width / 2}" y="198" text-anchor="middle" fill="${palette.text}" font-size="18" font-weight="900">Henüz grafik için sınav sonucu yok.</text>
        <text x="${width / 2}" y="228" text-anchor="middle" fill="${palette.textLight}" font-size="13" font-weight="700">Bir sınav çözünce seçtiğin analiz modu burada görünecek.</text>
      `;
    };

    if (!limitedHistory.length) {
      emptySvg();
      return;
    }

    const data = limitedHistory.map(({ item, originalIndex }) => {
      const total = Number(item.total) || 0;
      const correct = Number(item.score) || 0;
      const blank = Number(item.blankCount ?? 0) || 0;
      const wrong = Number(item.wrongCount ?? Math.max(0, total - correct - blank)) || 0;
      const percentage = Math.max(0, Math.min(100, Math.round(Number(item.percentage) || 0)));
      return {
        originalIndex,
        label: item.label || "Sınav",
        date: item.date,
        percentage,
        correct,
        wrong,
        blank,
        total,
        results: Array.isArray(item.results) ? item.results : []
      };
    });

    const values = data.map((item) => item.percentage);
    const avg = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    const best = Math.max(...values);
    const lowest = Math.min(...values);
    const last = values[values.length - 1];
    const goal = 85;
    const trend = values.length > 1 ? last - values[0] : 0;
    const totalCorrect = data.reduce((sum, item) => sum + item.correct, 0);
    const totalWrong = data.reduce((sum, item) => sum + item.wrong, 0);
    const totalBlank = data.reduce((sum, item) => sum + item.blank, 0);
    const totalQuestions = data.reduce((sum, item) => sum + item.total, 0);
    const trendLabel = trend > 4 ? "Yükseliyor" : trend < -4 ? "Düşüyor" : "Sabit";
    const trendIcon = trend > 4 ? "↗" : trend < -4 ? "↘" : "→";
    const trendColor = trend >= 0 ? palette.goal : palette.danger;

    function setInsights(extra = "") {
      if (!insights) return;
      insights.innerHTML = `
        <div class="exam-chart-mini-card">
          <span>Ortalama</span><strong>${avg}%</strong><small>${data.length} sınav üzerinden</small>
        </div>
        <div class="exam-chart-mini-card success">
          <span>En iyi</span><strong>${best}%</strong><small>Hedef: %${goal}</small>
        </div>
        <div class="exam-chart-mini-card danger">
          <span>En düşük</span><strong>${lowest}%</strong><small>Tekrar edilmesi gereken seviye</small>
        </div>
        <div class="exam-chart-mini-card trend">
          <span>Trend</span><strong>${trendIcon} ${trendLabel}</strong><small>${trend > 0 ? "+" : ""}${trend} puan değişim</small>
        </div>
        ${extra}
      `;
    }

    function setLegend(items) {
      if (!legend) return;
      legend.innerHTML = items.map((item) => `
        <span><i style="background:${item.color}"></i>${item.label}</span>
      `).join("");
    }

    const left = isChartMobile ? 46 : 62;
    const right = isChartMobile ? 20 : 42;
    const top = isChartMobile ? 52 : 44;
    const bottom = isChartMobile ? 62 : 68;
    const innerW = width - left - right;
    const innerH = height - top - bottom;
    const yFor = (value) => top + innerH - ((Math.max(0, Math.min(100, value)) / 100) * innerH);
    const xFor = (index) => data.length === 1
      ? left + innerW / 2
      : left + (index * (innerW / (data.length - 1)));

    const defs = `
      <defs>
        <linearGradient id="examThemeBgGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${palette.accent}" stop-opacity="${palette.isDark ? ".16" : ".10"}"/>
          <stop offset=".5" stop-color="${palette.accent2}" stop-opacity="${palette.isDark ? ".08" : ".06"}"/>
          <stop offset="1" stop-color="${palette.card}" stop-opacity=".92"/>
        </linearGradient>
        <linearGradient id="examThemeLineGradient" x1="0" x2="1">
          <stop offset="0" stop-color="${palette.accent3}"/>
          <stop offset=".52" stop-color="${palette.accent}"/>
          <stop offset="1" stop-color="${palette.accent2}"/>
        </linearGradient>
        <linearGradient id="examThemeAreaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${palette.accent2}" stop-opacity="${palette.isDark ? ".34" : ".26"}"/>
          <stop offset=".72" stop-color="${palette.accent}" stop-opacity="${palette.isDark ? ".08" : ".07"}"/>
          <stop offset="1" stop-color="${palette.accent}" stop-opacity="0"/>
        </linearGradient>
        <filter id="examChartGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="9" flood-color="${palette.accent}" flood-opacity="${palette.isDark ? ".32" : ".20"}"/>
        </filter>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" rx="28" fill="url(#examThemeBgGradient)" stroke="${palette.cardStroke}"></rect>
      <circle cx="${width - 92}" cy="64" r="62" fill="${palette.accent2}" opacity="${palette.isDark ? ".10" : ".12"}"></circle>
      <circle cx="86" cy="${height - 62}" r="76" fill="${palette.accent}" opacity="${palette.isDark ? ".08" : ".07"}"></circle>
    `;

    const yGrid = [0, 25, 50, 75, 100].map((value) => {
      const y = yFor(value);
      return `
        <line x1="${left}" x2="${left + innerW}" y1="${y}" y2="${y}" stroke="${palette.grid}" stroke-width="1"/>
        <text x="${left - 16}" y="${y + 4}" text-anchor="end" fill="${palette.textLight}" font-size="11" font-weight="800">%${value}</text>
      `;
    }).join("");

    const axis = `
      ${yGrid}
      <line x1="${left}" x2="${left + innerW}" y1="${top + innerH}" y2="${top + innerH}" stroke="${palette.axis}" stroke-width="2"/>
      <line x1="${left}" x2="${left}" y1="${top}" y2="${top + innerH}" stroke="${palette.axis}" stroke-width="2"/>
    `;

    function renderScoreLine(title = "Başarı yüzdesi") {
      const points = data.map((item, index) => ({ ...item, x: xFor(index), y: yFor(item.percentage) }));
      const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
      const area = `${left},${top + innerH} ${line} ${left + innerW},${top + innerH}`;
      const avgY = yFor(avg);
      const goalY = yFor(goal);
      const xLabels = points.map((p, index) => {
        if (isChartMobile && data.length > 5 && index % 2 === 1 && index !== data.length - 1) return "";
        if (!isChartMobile && data.length > 10 && index % 2 === 1 && index !== data.length - 1) return "";
        return `<text x="${p.x}" y="${height - 28}" text-anchor="middle" fill="${palette.textLight}" font-size="${isChartMobile ? "9.5" : "10.5"}" font-weight="800">${safeText(formatChartDate(p.date))}</text>`;
      }).join("");
      const lastPoint = points[points.length - 1];
      const tooltipX = Math.max(left + 10, Math.min(width - 168, lastPoint.x + 18));
      const tooltipY = Math.max(18, Math.min(height - 124, lastPoint.y - 54));

      svg.innerHTML = `
        ${defs}
        ${axis}
        <line x1="${left}" x2="${left + innerW}" y1="${goalY}" y2="${goalY}" stroke="${palette.goal}" stroke-width="2" stroke-dasharray="8 8" opacity=".82"/>
        <text x="${left + 8}" y="${goalY - 9}" fill="${palette.goal}" font-size="11" font-weight="900">Hedef %${goal}</text>
        <line x1="${left}" x2="${left + innerW}" y1="${avgY}" y2="${avgY}" stroke="${palette.accent}" stroke-width="2" stroke-dasharray="5 7" opacity=".76"/>
        <text x="${left + innerW - 6}" y="${avgY - 9}" text-anchor="end" fill="${palette.accent}" font-size="11" font-weight="900">Ortalama %${avg}</text>
        <polyline points="${area}" fill="url(#examThemeAreaGradient)"></polyline>
        <polyline points="${line}" fill="none" stroke="url(#examThemeLineGradient)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" filter="url(#examChartGlow)"></polyline>
        ${points.map((p) => {
          const pointColor = p.percentage >= goal ? palette.goal : p.percentage < 50 ? palette.danger : palette.accent;
          return `
            <g class="exam-chart-point" onclick="openExamHistorySession(${p.originalIndex})" style="cursor:pointer">
              <circle cx="${p.x}" cy="${p.y}" r="11" fill="${pointColor}" opacity=".16"></circle>
              <circle cx="${p.x}" cy="${p.y}" r="6" fill="${pointColor}" stroke="${palette.card}" stroke-width="4"></circle>
              <title>${safeText(p.label)} · ${p.percentage}% · ${safeText(formatShortExamDate(p.date))}</title>
            </g>
          `;
        }).join("")}
        ${xLabels}
        <text x="${left}" y="${isChartMobile ? 24 : 26}" fill="${palette.text}" font-size="${isChartMobile ? "12" : "13"}" font-weight="900">${safeText(title)}</text>
        <text x="${left + innerW}" y="${isChartMobile ? 24 : 26}" text-anchor="end" fill="${palette.textLight}" font-size="${isChartMobile ? "10" : "12"}" font-weight="800">${data.length} sınav · En düşük %${lowest}</text>
      `;
    }

    function renderAnswerBars() {
      const maxTotal = Math.max(1, ...data.map((item) => item.total || 1));
      const barGap = Math.max(10, Math.min(26, innerW / Math.max(1, data.length) * 0.18));
      const barW = Math.max(20, Math.min(48, (innerW - barGap * (data.length - 1)) / data.length));
      const startX = left + Math.max(0, (innerW - (barW * data.length + barGap * (data.length - 1))) / 2);
      const colorCorrect = palette.goal;
      const colorWrong = palette.danger;
      const colorBlank = palette.accent2;
      const bars = data.map((item, index) => {
        const x = startX + index * (barW + barGap);
        const correctH = (item.correct / maxTotal) * innerH;
        const wrongH = (item.wrong / maxTotal) * innerH;
        const blankH = (item.blank / maxTotal) * innerH;
        let y = top + innerH;
        const correctY = y - correctH; y = correctY;
        const wrongY = y - wrongH; y = wrongY;
        const blankY = y - blankH;
        return `
          <g onclick="openExamHistorySession(${item.originalIndex})" style="cursor:pointer">
            <rect x="${x}" y="${correctY}" width="${barW}" height="${correctH}" rx="8" fill="${colorCorrect}" opacity=".88"></rect>
            <rect x="${x}" y="${wrongY}" width="${barW}" height="${wrongH}" rx="8" fill="${colorWrong}" opacity=".82"></rect>
            <rect x="${x}" y="${blankY}" width="${barW}" height="${blankH}" rx="8" fill="${colorBlank}" opacity=".75"></rect>
            <text x="${x + barW / 2}" y="${height - 28}" text-anchor="middle" fill="${palette.textLight}" font-size="${isChartMobile ? "9" : "10"}" font-weight="800">${safeText(formatChartDate(item.date))}</text>
            <title>${safeText(item.label)} · ${item.correct} doğru · ${item.wrong} yanlış · ${item.blank} boş</title>
          </g>
        `;
      }).join("");
      svg.innerHTML = `
        ${defs}
        ${axis}
        ${bars}
        <text x="${left}" y="${isChartMobile ? 24 : 26}" fill="${palette.text}" font-size="${isChartMobile ? "12" : "13"}" font-weight="900">Doğru / Yanlış / Boş</text>
        <text x="${left + innerW}" y="${isChartMobile ? 24 : 26}" text-anchor="end" fill="${palette.textLight}" font-size="${isChartMobile ? "10" : "12"}" font-weight="800">${totalCorrect} D · ${totalWrong} Y · ${totalBlank} B</text>
      `;
      setLegend([
        { color: colorCorrect, label: "Doğru" },
        { color: colorWrong, label: "Yanlış" },
        { color: colorBlank, label: "Boş" }
      ]);
    }

    function getWeakTopicStats() {
      const map = new Map();
      data.forEach((session) => {
        session.results.forEach((result) => {
          const status = result.status || (result.isCorrect ? "correct" : result.isEmpty ? "empty" : "wrong");
          if (status === "correct") return;
          const key = result.topicTitle || result.unit || "Bilinmeyen konu";
          const current = map.get(key) || { topic: key, wrong: 0, blank: 0, total: 0 };
          if (status === "empty" || result.isEmpty) current.blank += 1;
          else current.wrong += 1;
          current.total += 1;
          map.set(key, current);
        });
      });
      return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 6);
    }

    function renderWeakTopics() {
      const topics = getWeakTopicStats();
      const max = Math.max(1, ...topics.map((item) => item.total));
      if (!topics.length) {
        svg.innerHTML = `
          ${defs}
          <text x="${width / 2}" y="150" text-anchor="middle" fill="${palette.text}" font-size="18" font-weight="900">Zayıf konu verisi yok.</text>
          <text x="${width / 2}" y="178" text-anchor="middle" fill="${palette.textLight}" font-size="13" font-weight="700">Yanlış veya boş sorular olduğunda konu analizi burada görünecek.</text>
        `;
        setLegend([]);
        return;
      }
      const rowH = isChartMobile ? 58 : 42;
      const startY = isChartMobile ? 78 : 70;
      const barX = isChartMobile ? left : 260;
      const barYShift = isChartMobile ? 24 : 0;
      const barMax = isChartMobile ? width - left - right - 82 : width - 310;
      const rows = topics.map((item, index) => {
        const y = startY + index * rowH;
        const barW = Math.max(18, (item.total / max) * barMax);
        const topicText = isChartMobile && item.topic.length > 24 ? `${item.topic.slice(0, 23)}…` : item.topic;
        return `
          <g>
            <text x="${left}" y="${y + 16}" fill="${palette.text}" font-size="${isChartMobile ? "11.5" : "13"}" font-weight="900">${safeText(topicText)}</text>
            <rect x="${barX}" y="${y + barYShift}" width="${barMax}" height="22" rx="11" fill="${palette.grid}"></rect>
            <rect x="${barX}" y="${y + barYShift}" width="${barW}" height="22" rx="11" fill="${palette.danger}" opacity=".86"></rect>
            <text x="${Math.min(barX + barW + 8, width - right - 52)}" y="${y + barYShift + 15}" fill="${palette.textLight}" font-size="${isChartMobile ? "10" : "12"}" font-weight="900">${item.total} hata</text>
            <text x="${width - right}" y="${y + barYShift + 15}" text-anchor="end" fill="${palette.textLight}" font-size="${isChartMobile ? "9.5" : "11"}" font-weight="800">${item.wrong}Y · ${item.blank}B</text>
          </g>
        `;
      }).join("");
      svg.innerHTML = `
        ${defs}
        <text x="${left}" y="30" fill="${palette.text}" font-size="${isChartMobile ? "12.5" : "14"}" font-weight="900">En çok hata yapılan konular</text>
        <text x="${left}" y="50" fill="${palette.textLight}" font-size="${isChartMobile ? "10.5" : "12"}" font-weight="800">Yanlış ve boşların konu dağılımı</text>
        ${rows}
      `;
      setLegend([{ color: palette.danger, label: "Yanlış / boş yoğunluğu" }]);
    }

    function renderTrend() {
      renderScoreLine("Trend analizi");
      const extra = `
        <div class="exam-chart-mini-card trend-wide">
          <span>Yorum</span><strong>${trendIcon} ${trendLabel}</strong><small>${trend >= 0 ? "Sonuçların başlangıca göre daha iyi görünüyor." : "Son sınavlar düşüş gösteriyor; zayıf konulara dön."}</small>
        </div>
      `;
      setInsights(extra);
    }

    if (mode === "answers") {
      setInsights();
      renderAnswerBars();
      return;
    }

    if (mode === "topics") {
      const topics = getWeakTopicStats();
      const topTopic = topics[0];
      setInsights(topTopic ? `
        <div class="exam-chart-mini-card danger trend-wide">
          <span>En zayıf konu</span><strong>${safeText(topTopic.topic)}</strong><small>${topTopic.wrong} yanlış · ${topTopic.blank} boş</small>
        </div>
      ` : "");
      renderWeakTopics();
      return;
    }

    if (mode === "trend") {
      setLegend([
        { color: palette.accent, label: "Skor" },
        { color: palette.goal, label: "Hedef %85" },
        { color: trendColor, label: "Trend" }
      ]);
      renderTrend();
      return;
    }

    if (mode === "summary") {
      setInsights(`
        <div class="exam-chart-mini-card success trend-wide">
          <span>Toplam cevap</span><strong>${totalCorrect} doğru</strong><small>${totalWrong} yanlış · ${totalBlank} boş · ${totalQuestions} toplam</small>
        </div>
      `);
      setLegend([
        { color: palette.accent, label: "Skor" },
        { color: palette.goal, label: "Hedef" },
        { color: palette.danger, label: "Riskli skor" }
      ]);
      renderScoreLine("Genel performans özeti");
      return;
    }

    setInsights();
    setLegend([
      { color: palette.accent, label: "Başarı skoru" },
      { color: palette.goal, label: "Hedef %85" },
      { color: palette.accent2, label: "Ortalama" }
    ]);
    renderScoreLine("Başarı yüzdesi");
  }

  function renderExamHistoryModalList(history = safeExamHistory()) {
    const list = document.getElementById("examHistoryModalList");
    if (!list) return;

    const recent = history.slice(0, 10);
    if (!recent.length) {
      list.innerHTML = `<div class="exam-empty-mini">Henüz sınav geçmişi yok. İlk sınavını çözdüğünde burada son 10 sınav görünecek.</div>`;
      return;
    }

    list.innerHTML = recent.map((item, index) => {
      const percentage = Number(item.percentage) || 0;
      const quality = getQualityMeta(percentage);
      const correct = Number(item.score) || 0;
      const total = Number(item.total) || 0;
      const wrong = Math.max(0, total - correct);
      return `
        <button type="button" class="exam-history-modal-item" onclick="openExamHistorySession(${index})" aria-label="${safeText(item.label || "Sınav")} geçmiş sınavını aç">
          <span class="exam-history-order">${index + 1}</span>
          <span class="exam-history-info">
            <strong>${safeText(item.label || "Sınav")}</strong>
            <small>${safeText(formatShortExamDate(item.date))}</small>
          </span>
          <span class="exam-history-score">
            <strong>${percentage}%</strong>
            <small>${correct}/${total} doğru${wrong ? ` · ${wrong} yanlış` : ""}</small>
          </span>
          <span class="exam-quality-pill ${quality.cls}">${quality.text}</span>
          <span class="exam-history-open-label">Detayı aç →</span>
        </button>
      `;
    }).join("");
  }

  let selectedHistorySession = null;

  function normalizeHistoryExamSession(item) {
    if (!item) return null;
    const results = Array.isArray(item.results) ? item.results.map((result, index) => {
      const selectedIndex = result.selectedIndex === undefined ? null : result.selectedIndex;
      const answer = Number(result.answer);
      const status = result.status || (selectedIndex === null ? "empty" : selectedIndex === answer ? "correct" : "wrong");
      return {
        ...result,
        index: Number.isFinite(Number(result.index)) ? Number(result.index) : index,
        selectedIndex,
        answer,
        status,
        isCorrect: status === "correct",
        isEmpty: status === "empty",
        isWrong: status === "wrong"
      };
    }) : [];

    const total = Number(item.total) || results.length || 0;
    const score = Number(item.score) || results.filter((r) => r.isCorrect).length;
    const blankCount = Number(item.blankCount ?? results.filter((r) => r.isEmpty).length) || 0;
    const wrongCount = Number(item.wrongCount ?? results.filter((r) => r.isWrong).length) || Math.max(0, total - score - blankCount);
    const percentage = Number(item.percentage) || formatPercent(score, total || 1);

    return {
      label: item.label || "Geçmiş Sınav",
      durationMinutes: Number(item.durationMinutes) || 0,
      total,
      score,
      wrongCount,
      blankCount,
      percentage,
      results,
      autoSubmitted: Boolean(item.autoSubmitted),
      weakestTopic: item.weakestTopic || null,
      date: item.date || null,
      fromHistory: true
    };
  }

  function getHistoryOptionReason(item, optionIndex) {
    if (!item || !Array.isArray(item.options)) return "Bu şık için açıklama oluşturulamadı.";
    const optionText = String(item.options[optionIndex] || "").trim();
    const correctText = String(item.options[item.answer] || "").trim();
    const isCorrect = optionIndex === item.answer;
    const isSelected = item.selectedIndex === optionIndex;
    const topic = String(item.topicTitle || "").toLowerCase();
    const question = String(item.question || "").toLowerCase();
    const base = String(item.explanation || "").trim();
    const merged = `${topic} ${question} ${base.toLowerCase()}`;

    let correctReason = "Bu şık cümlenin istediği anlam ve dilbilgisi kuralıyla uyumlu olduğu için doğru cevaptır.";
    let wrongReason = "Bu şık cümlenin istediği anlam veya dilbilgisi kuralıyla tam uyuşmadığı için doğru değildir.";

    if (topic.includes("future") || /will|going to|shall|tomorrow|cloud|plan|future/.test(merged)) {
      if (/cloud|look at|kanıt|kanita|evidence/.test(merged)) {
        correctReason = "Cümlede görünen kanıt vardır. Görünen kanıta dayalı gelecek tahminlerinde genellikle be going to kullanılır.";
        wrongReason = `Bu seçenek görünen kanıta dayalı gelecek tahmini mantığını tam karşılamaz. Bu bağlamda “${correctText}” daha uygundur.`;
      } else {
        correctReason = "Bu seçenek cümlenin gelecek zaman bağlamını doğru kurar.";
        wrongReason = "Bu seçenek gelecek zaman kullanımındaki bağlama uymadığı için elenir.";
      }
    } else if (topic.includes("passive") || question.includes("passive")) {
      correctReason = "Passive yapıda nesne başa alınır ve fiil uygun zamanda be + V3 şeklinde kurulur. Bu seçenek bu yapıyı doğru verir.";
      wrongReason = "Bu seçenek passive yapıyı doğru kurmaz; zaman, özne-fiil uyumu veya V3 kullanımı hatalı olabilir.";
    } else if (topic.includes("condition")) {
      correctReason = "Koşul cümlesindeki if kısmı ve sonuç kısmı bu seçenekte doğru zaman uyumuyla kurulmuştur.";
      wrongReason = "Bu seçenek conditional yapısındaki zaman uyumunu bozduğu için doğru değildir.";
    } else if (topic.includes("perfect")) {
      correctReason = "Cümlede geçmişle şimdi arasında bağlantı veya süre anlamı olduğu için bu perfect yapı uygundur.";
      wrongReason = "Bu seçenek perfect tense ipuçlarıyla uyuşmaz. for/since/yet/already gibi ipuçlarına dikkat edilmelidir.";
    } else if (topic.includes("modal") || topic.includes("can") || topic.includes("could") || topic.includes("able")) {
      correctReason = "Cümlenin anlamı bu modal yapıyı ister; seçenek yetenek, izin, zorunluluk veya çıkarım anlamını doğru verir.";
      wrongReason = "Bu seçenek cümlenin istediği modal anlamını doğru vermez veya modal sonrası fiil yapısını bozabilir.";
    } else if (topic.includes("phrasal")) {
      correctReason = "Bu phrasal verb cümlenin anlamını doğru tamamlar ve kullanım kuralına uygundur.";
      wrongReason = "Bu seçenek phrasal verb anlamına veya nesne yerleşimine uymadığı için doğru değildir.";
    }

    if (isCorrect && isSelected) return `Bu şık senin seçimin ve doğru cevaptır. ${correctReason}${base ? ` Ek açıklama: ${base}` : ""}`;
    if (isCorrect) return `Bu şık doğru cevaptır. ${correctReason}${base ? ` Ek açıklama: ${base}` : ""}`;
    if (isSelected) return `Bu şık senin seçimin, fakat doğru değildir. ${wrongReason} Bu yüzden doğru cevap “${correctText}” olmalıdır.`;
    return `Bu şık doğru değildir. ${wrongReason}`;
  }

  function renderHistoryQuestionDetail(item) {
    if (!item) return "";
    const statusLabel = item.status === "correct" ? "Doğru" : item.status === "wrong" ? "Yanlış" : "Boş";
    const selectedLabel = item.selectedIndex === null || item.selectedIndex === undefined ? "Boş" : safeText(item.options?.[item.selectedIndex] || "—");
    const correctLabel = safeText(item.options?.[item.answer] || "—");

    return `
      <div class="exam-focus-card result-question-detail history-question-detail" id="examResultQuestionDetail">
        <div class="result-question-detail-head">
          <div>
            <span class="review-status-chip review-status-${item.status}">${statusLabel}</span>
            <h4>${safeText(item.unit || "Ünite")} · ${safeText(item.topicTitle || "Konu")} · Soru ${item.index + 1}</h4>
          </div>
        </div>
        <p class="result-question-text">${safeText(item.question || "Soru metni bulunamadı.")}</p>
        <div class="result-option-list" aria-label="Soru seçenekleri">
          ${(item.options || []).map((option, optionIndex) => {
            const isSelected = item.selectedIndex === optionIndex;
            const isCorrect = item.answer === optionIndex;
            let cls = "result-option-review";
            if (isCorrect) cls += " is-correct-answer";
            if (isSelected) cls += " is-selected-answer";
            if (isSelected && !isCorrect) cls += " is-wrong-selected";
            return `
              <div class="${cls}">
                <span class="result-option-letter">${String.fromCharCode(65 + optionIndex)}</span>
                <span class="result-option-text">${safeText(option)}</span>
                ${isSelected ? `<strong class="result-option-tag selected-tag">Senin seçimin</strong>` : ""}
                ${isCorrect ? `<strong class="result-option-tag correct-tag">Doğru cevap</strong>` : ""}
              </div>
            `;
          }).join("")}
        </div>
        <div class="result-detail-summary">
          <div class="review-answer-row review-answer-${item.status}"><strong>Senin cevabın:</strong><span>${selectedLabel}</span></div>
          <div class="review-answer-row review-answer-correct"><strong>Doğru cevap:</strong><span>${correctLabel}</span></div>
        </div>
        <div class="result-option-explanation-box compact-option-explain">
          <strong>Şıklar Üzerinden Açıklama</strong>
          <div class="result-option-explanation-list">
            ${(item.options || []).map((option, optionIndex) => {
              const isCorrect = optionIndex === item.answer;
              const isSelected = item.selectedIndex === optionIndex;
              let cls = "result-option-explanation-item";
              if (isCorrect) cls += " is-correct";
              if (isSelected && !isCorrect) cls += " is-selected-wrong";
              if (isSelected && isCorrect) cls += " is-selected-correct";
              return `
                <div class="${cls}">
                  <div class="option-explanation-head">
                    <span class="option-explanation-letter">${String.fromCharCode(65 + optionIndex)}</span>
                    <strong>${safeText(option)}</strong>
                    ${isSelected ? `<em>Senin seçimin</em>` : ""}
                    ${isCorrect ? `<em>Doğru cevap</em>` : ""}
                  </div>
                  <p>${safeText(getHistoryOptionReason(item, optionIndex))}</p>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function renderHistoryExamResultView(focusedIndex = null) {
    const workspace = document.getElementById("examWorkspace");
    if (!workspace || !selectedHistorySession) return;

    const s = selectedHistorySession;
    const results = s.results || [];
    const focus = Number.isFinite(Number(focusedIndex))
      ? Number(focusedIndex)
      : (results.find((item) => item.status !== "correct") || results[0] || {}).index;
    const focusedResult = results.find((item) => item.index === focus) || results[0] || null;
    const weaknessText = s.weakestTopic
      ? `${safeText(s.weakestTopic.topicTitle)} (${Number(s.weakestTopic.wrong) || 0} yanlış${s.weakestTopic.empty ? `, ${s.weakestTopic.empty} boş` : ""})`
      : (s.wrongCount > 0 || s.blankCount > 0 ? "Aşağıdaki soru numaralarından yanlış/boş sorularını tek tek inceleyebilirsin." : "Bu sınavda belirgin hata yok.");

    workspace.innerHTML = `
      <div class="result-box premium-result-box history-result-box">
        <div class="result-box-top">
          <div>
            <span class="unit-badge exam-badge">GEÇMİŞ SINAV</span>
            <h3 class="result-title">${safeText(s.label)} · ${safeText(formatShortExamDate(s.date))}</h3>
            <p>Bu geçmiş sınavda hangi soruları doğru yaptığını, hangi sorularda hata yaptığını ve şıkları nedenleriyle görebilirsin.</p>
          </div>
          <div class="result-score-circle"><strong>${s.percentage}%</strong><span>Başarı</span></div>
        </div>
        <div class="result-main premium-result-main">
          <div class="result-stat success"><span>Doğru</span><strong>${s.score}</strong></div>
          <div class="result-stat danger"><span>Yanlış</span><strong>${s.wrongCount}</strong></div>
          <div class="result-stat neutral"><span>Boş</span><strong>${s.blankCount}</strong></div>
          <div class="result-stat"><span>Toplam</span><strong>${s.total} Soru</strong></div>
        </div>
        <div class="result-insight-card">
          <h4>Geçmiş sınav yorumu</h4>
          <p><strong>Hata odağı:</strong> ${weaknessText}</p>
          <p>Yeşil numaralar doğru, kırmızı numaralar yanlış, gri/koyu numaralar boş soruları gösterir. Bir numaraya tıklayınca sorunun kendisi ve şık açıklamaları açılır.</p>
        </div>
        ${results.length ? `
          <div class="exam-nav-grid result-nav-grid" aria-label="Geçmiş sınav soru navigasyonu">
            ${results.map((item) => `
              <button type="button" class="exam-nav-btn is-${item.status}${focusedResult && focusedResult.index === item.index ? " is-focused-result" : ""}" onclick="openExamHistoryQuestion(${item.index})" aria-label="Soru ${item.index + 1} detayını aç">
                <span>${item.index + 1}</span>
              </button>
            `).join("")}
          </div>
          ${renderHistoryQuestionDetail(focusedResult)}
        ` : `
          <div class="exam-empty-mini">Bu eski sınav kaydında soru detayları tutulmamış. Yeni çözdüğün sınavlarda tüm sorular ve şık açıklamaları kaydedilecek.</div>
        `}
      </div>
    `;

    requestAnimationFrame(() => {
      document.getElementById("examWorkspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openExamHistorySession(index) {
    const session = normalizeHistoryExamSession(safeExamHistory()[Number(index)]);
    if (!session) return;
    selectedHistorySession = session;
    closeExamHistoryModal();
    navigate("examcenter");
    renderHistoryExamResultView();
  }

  function openExamHistoryQuestion(questionIndex) {
    renderHistoryExamResultView(Number(questionIndex));
  }

  function showExamHistoryPanel() {
    const modal = document.getElementById("examHistoryModal");
    const backdrop = document.getElementById("examHistoryModalBackdrop");
    if (!modal || !backdrop) return;

    renderExamHistoryModalList();
    modal.classList.add("open");
    backdrop.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("exam-history-modal-open");
  }

  function closeExamHistoryModal() {
    const modal = document.getElementById("examHistoryModal");
    const backdrop = document.getElementById("examHistoryModalBackdrop");
    if (!modal || !backdrop) return;

    modal.classList.remove("open");
    backdrop.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("exam-history-modal-open");
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeExamHistoryModal();
  });

  window.showExamHistoryPanel = showExamHistoryPanel;
  window.closeExamHistoryModal = closeExamHistoryModal;
  window.openExamHistorySession = openExamHistorySession;
  window.openExamHistoryQuestion = openExamHistoryQuestion;
  window.renderExamPerformanceChart = renderExamPerformanceChart;

  if (!window.__examChartResponsiveResizeReady) {
    window.__examChartResponsiveResizeReady = true;
    let examChartResizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(examChartResizeTimer);
      examChartResizeTimer = setTimeout(() => {
        if (document.getElementById("examcenter")?.classList.contains("active")) {
          renderExamPerformanceChart();
        }
      }, 140);
    }, { passive: true });
  }

  // Dark/light veya tema değişimi dışarıdan da yapılırsa performans grafiğini
  // otomatik yeniden çiz. Böylece SVG içindeki yazılar eski tema renginde kalmaz.
  if (!window.__examChartThemeObserverReady) {
    window.__examChartThemeObserverReady = true;
    const observer = new MutationObserver((mutations) => {
      const shouldRefresh = mutations.some((mutation) =>
        mutation.type === "attributes" &&
        (mutation.attributeName === "class" || mutation.attributeName === "data-theme-style")
      );
      if (shouldRefresh) refreshExamPerformanceChartAfterThemeChange();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme-style"] });
  }
  window.updateProfessionalExamDashboardStats = updateProfessionalExamDashboardStats;

  if (typeof updateDashboardStats === "function" && !updateDashboardStats.__professionalExamWrapped) {
    const previousUpdateDashboardStats = updateDashboardStats;
    updateDashboardStats = function updateDashboardStatsWithProfessionalExam() {
      previousUpdateDashboardStats();
      updateProfessionalExamDashboardStats();
    };
    updateDashboardStats.__professionalExamWrapped = true;
  }

  if (typeof submitExam === "function" && !submitExam.__professionalExamWrapped) {
    const previousSubmitExam = submitExam;
    submitExam = function submitExamWithProfessionalDashboard(autoSubmitted = false) {
      previousSubmitExam(autoSubmitted);
      setTimeout(updateProfessionalExamDashboardStats, 0);
    };
    window.submitExam = submitExam;
    submitExam.__professionalExamWrapped = true;
  }

  const boot = () => requestAnimationFrame(updateProfessionalExamDashboardStats);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

/* ================= PROFESSIONAL FILL GAP MODULE ================= */
const FILL_GAP_FILTERS = [
  { id: "all", label: "Tümü" },
  { id: "Vocabulary", label: "Vocabulary" },
  { id: "Grammar", label: "Grammar" },
  { id: "Present Perfect", label: "Present Perfect" },
  { id: "Phrasal Verbs", label: "Phrasal Verbs" },
  { id: "Verb Patterns", label: "Verb Patterns" },
  { id: "Prepositions", label: "Prepositions" },
  { id: "Modals", label: "Modals" },
  { id: "Passive", label: "Passive" },
  { id: "Reported Speech", label: "Reported Speech" },
  { id: "Conditionals", label: "Conditionals" }
];

const FILL_GAP_EXERCISES = [
  {
    id: "fg-vocabulary-wordlist", title: "Vocabulary / Word List", category: "Vocabulary", topicId: "wordlist1a", level: "Easy",
    description: "Akademik kelimeleri cümle içinde doğru bağlama yerleştir.",
    items: [
      { id: "fg-vocab-1", sentence: "Researchers found strong ________ that regular exercise improves mental health.", answer: "evidence", hintType: "noun", hintFirstLetter: "e", hintTr: "kanıt", explanation: "Evidence, bir düşünceyi destekleyen bilgi veya kanıt anlamındadır." },
      { id: "fg-vocab-2", sentence: "The teacher did a ________ to learn students’ favourite books.", answer: "survey", hintType: "noun", hintFirstLetter: "s", hintTr: "anket", explanation: "Survey, insanlara soru sorarak bilgi toplama yöntemidir." },
      { id: "fg-vocab-3", sentence: "Her bright dress made her ________ in the crowd.", answer: "stand out", hintType: "phrasal verb", hintFirstLetter: "s", hintTr: "öne çıkmak", explanation: "Stand out, diğerlerinden farklı ya da dikkat çekici olmak demektir." },
      { id: "fg-vocab-4", sentence: "Overall, the project was a great ________.", answer: "success", hintType: "noun", hintFirstLetter: "s", hintTr: "başarı", explanation: "Success, başarılı sonuç anlamındadır." },
      { id: "fg-vocab-5", sentence: "It is ________ that it will rain tomorrow.", answer: "likely", hintType: "adjective", hintFirstLetter: "l", hintTr: "muhtemel", explanation: "Likely, gerçekleşme ihtimali yüksek olan durumlar için kullanılır." }
    ]
  },
  {
    id: "fg-object-pronouns", title: "Object Pronouns", category: "Grammar", topicId: "objectpronouns", level: "Easy",
    description: "Direct object, indirect object ve object pronoun sırasını çalış.",
    items: [
      { id: "fg-obj-1", sentence: "I bought a book and gave ________ to Ravza.", answer: "it", hintType: "object pronoun", hintFirstLetter: "i", hintTr: "onu", explanation: "Book tekil nesne olduğu için object pronoun olarak it kullanılır." },
      { id: "fg-obj-2", sentence: "Yusuf sent ________ a postcard from Istanbul.", answer: "her", hintType: "object pronoun", hintFirstLetter: "h", hintTr: "ona", explanation: "Ravza için object pronoun her kullanılır." },
      { id: "fg-obj-3", sentence: "Please give the keys to ________.", answer: "me", hintType: "object pronoun", hintFirstLetter: "m", hintTr: "bana", explanation: "Preposition to’dan sonra object pronoun gelir: to me." },
      { id: "fg-obj-4", sentence: "She found the answer and showed ________ to us.", answer: "it", hintType: "object pronoun", hintFirstLetter: "i", hintTr: "onu", explanation: "Answer tekil nesne olduğu için it kullanılır." },
      { id: "fg-obj-5", sentence: "They invited ________ to the party.", answer: "us", hintType: "object pronoun", hintFirstLetter: "u", hintTr: "bizi", explanation: "Invite fiilinden sonra object pronoun gerekir: us." }
    ]
  },
  {
    id: "fg-adjectives", title: "Adjectives", category: "Grammar", topicId: "adjectives", level: "Easy",
    description: "Adjective, comparative, superlative ve one/ones kullanımını çalış.",
    items: [
      { id: "fg-adj-1", sentence: "Suzan is ________ beautiful girl.", answer: "a", hintType: "article", hintFirstLetter: "a", hintTr: "bir", explanation: "Tekil countable noun önünde article gerekir: a beautiful girl." },
      { id: "fg-adj-2", sentence: "This book is ________ expensive than that pen.", answer: "more", hintType: "comparative", hintFirstLetter: "m", hintTr: "daha", explanation: "Expensive uzun sıfat olduğu için comparative yapısı more expensive olur." },
      { id: "fg-adj-3", sentence: "That is the ________ film I have ever seen.", answer: "worst", hintType: "superlative", hintFirstLetter: "w", hintTr: "en kötü", explanation: "Bad kelimesinin superlative hali worst’tür." },
      { id: "fg-adj-4", sentence: "Can you give me the blue ________?", answer: "one", hintType: "pronoun", hintFirstLetter: "o", hintTr: "olan", explanation: "Tekil countable noun tekrarlanmasın diye one kullanılır." },
      { id: "fg-adj-5", sentence: "iPhones are ________ more expensive than many phones.", answer: "much", hintType: "intensifier", hintFirstLetter: "m", hintTr: "çok daha", explanation: "Büyük farkı vurgulamak için much + comparative kullanılır." }
    ]
  },
  {
    id: "fg-present-tenses", title: "Present Tenses", category: "Grammar", topicId: "presenttenses", level: "Medium",
    description: "Present simple, present continuous ve stative verb farklarını pekiştir.",
    items: [
      { id: "fg-pres-1", sentence: "I ________ it is a good idea.", answer: "think", hintType: "stative verb", hintFirstLetter: "t", hintTr: "düşünüyorum", explanation: "Think opinion anlamındaysa present simple kullanılır." },
      { id: "fg-pres-2", sentence: "I ________ about moving abroad these days.", answer: "am thinking", hintType: "present continuous", hintFirstLetter: "a", hintTr: "düşünüyorum/süreç", explanation: "Think düşünme süreci anlamındaysa continuous kullanılabilir." },
      { id: "fg-pres-3", sentence: "The flight ________ at 6.50 tomorrow morning.", answer: "leaves", hintType: "present simple", hintFirstLetter: "l", hintTr: "kalkar", explanation: "Timetable için present simple kullanılır." },
      { id: "fg-pres-4", sentence: "We ________ in an airport hotel tonight.", answer: "are staying", hintType: "future arrangement", hintFirstLetter: "a", hintTr: "kalıyoruz", explanation: "Önceden ayarlanmış gelecek planlarda present continuous kullanılır." },
      { id: "fg-pres-5", sentence: "She ________ the dentist tomorrow.", answer: "is seeing", hintType: "arrangement", hintFirstLetter: "i", hintTr: "görüşüyor/randevusu var", explanation: "See randevu anlamındaysa present continuous ile kullanılabilir." }
    ]
  },
  {
    id: "fg-possessives", title: "Possessives", category: "Grammar", topicId: "possessives", level: "Easy",
    description: "Possessive 's, of yapısı ve own kullanımını çalış.",
    items: [
      { id: "fg-pos-1", sentence: "This is ________ car.", answer: "Tom's", hintType: "possessive 's", hintFirstLetter: "T", hintTr: "Tom'un", explanation: "Kişi sahipliğinde possessive 's kullanılır." },
      { id: "fg-pos-2", sentence: "The ________ room is upstairs.", answer: "teachers'", hintType: "plural possessive", hintFirstLetter: "t", hintTr: "öğretmenlerin", explanation: "Plural noun s ile bitiyorsa sadece apostrophe eklenir: teachers'." },
      { id: "fg-pos-3", sentence: "The door ________ the car was open.", answer: "of", hintType: "preposition", hintFirstLetter: "o", hintTr: "-in", explanation: "Cansız nesnelerde of yapısı doğaldır." },
      { id: "fg-pos-4", sentence: "She has her ________ room.", answer: "own", hintType: "emphasis", hintFirstLetter: "o", hintTr: "kendi", explanation: "Own sahipliği vurgular." },
      { id: "fg-pos-5", sentence: "Emma and Mia’s ________ is very modern.", answer: "house", hintType: "noun", hintFirstLetter: "h", hintTr: "ev", explanation: "İki kişi aynı şeye sahipse 's ikinci isme gelir: Emma and Mia's house." }
    ]
  },
  {
    id: "fg-past-tenses", title: "Past Tenses & Used To", category: "Grammar", topicId: "pasttenses", level: "Medium",
    description: "Past simple, past continuous ve used to yapılarını çalış.",
    items: [
      { id: "fg-past-1", sentence: "Did you ________ to school yesterday?", answer: "go", hintType: "past simple question", hintFirstLetter: "g", hintTr: "gitmek", explanation: "Did ile soru kurulduğunda fiil yalın halde olur." },
      { id: "fg-past-2", sentence: "I ________ a book when the phone rang.", answer: "was reading", hintType: "past continuous", hintFirstLetter: "w", hintTr: "okuyordum", explanation: "Geçmişte devam eden eylem past continuous ile anlatılır." },
      { id: "fg-past-3", sentence: "We ________ to the beach every weekend when we were children.", answer: "used to go", hintType: "used to", hintFirstLetter: "u", hintTr: "giderdik", explanation: "Geçmişte düzenli yapılan ama artık yapılmayan alışkanlık used to ile kurulur." },
      { id: "fg-past-4", sentence: "She ________ dinner at 6 PM yesterday.", answer: "was cooking", hintType: "past continuous", hintFirstLetter: "w", hintTr: "pişiriyordu", explanation: "Belirli geçmiş anda devam eden eylem past continuous ister." },
      { id: "fg-past-5", sentence: "I didn’t ________ to like broccoli.", answer: "use", hintType: "negative used to", hintFirstLetter: "u", hintTr: "eskiden", explanation: "Olumsuzda didn’t use to kullanılır; used değil." }
    ]
  },
  {
    id: "fg-prepositions", title: "Prepositions", category: "Prepositions", topicId: "prepositions", level: "Medium",
    description: "Place, movement ve dependent preposition yapılarını çalış.",
    items: [
      { id: "fg-prep-1", sentence: "She is waiting ________ the bus.", answer: "for", hintType: "dependent preposition", hintFirstLetter: "f", hintTr: "için/beklemek", explanation: "Wait fiili for preposition ile kullanılır: wait for." },
      { id: "fg-prep-2", sentence: "I am interested ________ learning English.", answer: "in", hintType: "adjective + preposition", hintFirstLetter: "i", hintTr: "ile ilgilenmek", explanation: "Interested in sabit bir yapıdır." },
      { id: "fg-prep-3", sentence: "We walked ________ the beach.", answer: "along", hintType: "movement", hintFirstLetter: "a", hintTr: "boyunca", explanation: "Along, bir çizgi veya yol boyunca hareketi anlatır." },
      { id: "fg-prep-4", sentence: "The cat is ________ the bed.", answer: "under", hintType: "place", hintFirstLetter: "u", hintTr: "altında", explanation: "Under, bir şeyin altında olma durumunu anlatır." },
      { id: "fg-prep-5", sentence: "I am looking forward to ________ you.", answer: "seeing", hintType: "verb + ing", hintFirstLetter: "s", hintTr: "görmeyi", explanation: "Preposition to’dan sonra verb + ing gelir: looking forward to seeing." }
    ]
  },
  {
    id: "fg-future-forms", title: "Future Forms", category: "Grammar", topicId: "futureforms", level: "Medium",
    description: "Will, going to, present continuous ve future in the past yapılarını çalış.",
    items: [
      { id: "fg-fut-1", sentence: "The room is hot. I ________ open the window.", answer: "will", hintType: "instant decision", hintFirstLetter: "w", hintTr: "-ecek", explanation: "O anda verilen kararlarda will kullanılır." },
      { id: "fg-fut-2", sentence: "Look at those clouds! It ________ rain.", answer: "is going to", hintType: "evidence prediction", hintFirstLetter: "i", hintTr: "yağacak", explanation: "Görünen kanıta dayalı tahminde going to kullanılır." },
      { id: "fg-fut-3", sentence: "I ________ my friend at 6 PM tomorrow.", answer: "am meeting", hintType: "arrangement", hintFirstLetter: "a", hintTr: "buluşuyorum", explanation: "Ayarlanmış gelecek plan için present continuous kullanılır." },
      { id: "fg-fut-4", sentence: "The sun ________ rise tomorrow.", answer: "will", hintType: "future fact", hintFirstLetter: "w", hintTr: "doğacak", explanation: "Gelecek gerçekleri için will kullanılır." },
      { id: "fg-fut-5", sentence: "I ________ visit my uncle, but he was abroad.", answer: "was going to", hintType: "failed plan", hintFirstLetter: "w", hintTr: "gidecektim", explanation: "Gerçekleşmeyen geçmiş planlar was/were going to ile anlatılır." }
    ]
  },
  {
    id: "fg-conditionals-12", title: "1st & 2nd Conditionals", category: "Conditionals", topicId: "conditionals12", level: "Hard",
    description: "Gerçek gelecek ve hayali durum koşullarını çalış.",
    items: [
      { id: "fg-cond12-1", sentence: "If it rains tomorrow, we ________ stay at home.", answer: "will", hintType: "first conditional", hintFirstLetter: "w", hintTr: "kalacağız", explanation: "First conditional: If + present simple, will + verb1." },
      { id: "fg-cond12-2", sentence: "If I won the lottery, I ________ travel the world.", answer: "would", hintType: "second conditional", hintFirstLetter: "w", hintTr: "seyahat ederdim", explanation: "Second conditional: If + past simple, would + verb1." },
      { id: "fg-cond12-3", sentence: "If I ________ you, I wouldn’t do that.", answer: "were", hintType: "advice phrase", hintFirstLetter: "w", hintTr: "senin yerinde olsam", explanation: "Tavsiye verirken If I were you kalıbı kullanılır." },
      { id: "fg-cond12-4", sentence: "We can’t help you ________ you tell us the problem.", answer: "unless", hintType: "if not", hintFirstLetter: "u", hintTr: "-mezsen", explanation: "Unless = if not anlamındadır." },
      { id: "fg-cond12-5", sentence: "If she knew the answer, she ________ help us.", answer: "could", hintType: "possibility", hintFirstLetter: "c", hintTr: "yardım edebilirdi", explanation: "Could olasılık veya yetenek anlatır." }
    ]
  },
  {
    id: "fg-present-perfect-simple", title: "Present Perfect Simple", category: "Present Perfect", topicId: "perfect", level: "Medium",
    description: "Have/has + V3, for/since ve yet/already kullanımını çalış.",
    items: [
      { id: "fg-pps-1", sentence: "I ________ Ravza for many years.", answer: "have known", hintType: "present perfect simple", hintFirstLetter: "h", hintTr: "tanıyorum", explanation: "Know stative verb olduğu için continuous değil, Present Perfect Simple kullanılır." },
      { id: "fg-pps-2", sentence: "The film ________ already started.", answer: "has", hintType: "auxiliary", hintFirstLetter: "h", hintTr: "başladı", explanation: "The film tekil olduğu için has kullanılır." },
      { id: "fg-pps-3", sentence: "We have lived here ________ Monday.", answer: "since", hintType: "time marker", hintFirstLetter: "s", hintTr: "-den beri", explanation: "Since başlangıç noktası ile kullanılır." },
      { id: "fg-pps-4", sentence: "They have been married ________ six months.", answer: "for", hintType: "time marker", hintFirstLetter: "f", hintTr: "boyunca", explanation: "For süre miktarı ile kullanılır." },
      { id: "fg-pps-5", sentence: "Have you finished your homework ________?", answer: "yet", hintType: "adverb", hintFirstLetter: "y", hintTr: "henüz", explanation: "Yet genellikle soru ve olumsuzlarda kullanılır." }
    ]
  },
  {
    id: "fg-present-perfect-continuous", title: "Present Perfect Continuous", category: "Present Perfect", topicId: "perfectcont", level: "Medium",
    description: "Have/has been + V-ing yapısını ve süreç vurgusunu çalış.",
    items: [
      { id: "fg-ppc-1", sentence: "I ________ working too hard lately.", answer: "have been", hintType: "present perfect continuous", hintFirstLetter: "h", hintTr: "çalışıyorum", explanation: "Lately ve süreç vurgusu Present Perfect Continuous ister." },
      { id: "fg-ppc-2", sentence: "She ________ travelling a lot since February.", answer: "has been", hintType: "present perfect continuous", hintFirstLetter: "h", hintTr: "seyahat ediyor", explanation: "She tekil olduğu için has been kullanılır." },
      { id: "fg-ppc-3", sentence: "How long have you ________ looking for a job?", answer: "been", hintType: "auxiliary", hintFirstLetter: "b", hintTr: "olmak", explanation: "Present Perfect Continuous soru yapısı have/has + been + V-ing şeklindedir." },
      { id: "fg-ppc-4", sentence: "They have been waiting ________ an hour.", answer: "for", hintType: "duration", hintFirstLetter: "f", hintTr: "boyunca", explanation: "For süre miktarı ile kullanılır." },
      { id: "fg-ppc-5", sentence: "I have been studying English ________ morning.", answer: "all", hintType: "time phrase", hintFirstLetter: "a", hintTr: "bütün", explanation: "All morning, günün belli bir bölümünde süren eylemi anlatır." }
    ]
  },
  {
    id: "fg-modals-obligation", title: "Modals of Obligation", category: "Modals", topicId: "modals", level: "Medium",
    description: "Have to, must, mustn’t, don’t have to ve should farklarını çalış.",
    items: [
      { id: "fg-mod-1", sentence: "I ________ buy a new fridge last week.", answer: "had to", hintType: "past obligation", hintFirstLetter: "h", hintTr: "zorunda kaldım", explanation: "Geçmiş zorunluluk için had to kullanılır." },
      { id: "fg-mod-2", sentence: "You ________ spill anything on the sofa.", answer: "mustn't", hintType: "prohibition", hintFirstLetter: "m", hintTr: "yapmamalısın/yasak", explanation: "Mustn’t yasak veya güçlü uyarı bildirir." },
      { id: "fg-mod-3", sentence: "We ________ be at the airport until 5.00.", answer: "don't have to", hintType: "no necessity", hintFirstLetter: "d", hintTr: "zorunda değiliz", explanation: "Don’t have to gerekli değil anlamına gelir." },
      { id: "fg-mod-4", sentence: "You ________ study a little every day.", answer: "should", hintType: "advice", hintFirstLetter: "s", hintTr: "yapmalısın", explanation: "Should tavsiye vermek için kullanılır." },
      { id: "fg-mod-5", sentence: "Students ________ be quiet during the exam.", answer: "must", hintType: "strong obligation", hintFirstLetter: "m", hintTr: "zorunda", explanation: "Must güçlü zorunluluk bildirir." }
    ]
  },
  {
    id: "fg-ability-deduction", title: "Can / Could / Be Able To", category: "Modals", topicId: "ability", level: "Medium",
    description: "Yetenek, izin ve deduction modallarını çalış.",
    items: [
      { id: "fg-abil-1", sentence: "When I was five, I ________ swim well.", answer: "could", hintType: "past ability", hintFirstLetter: "c", hintTr: "yapabiliyordum", explanation: "Geçmiş genel yetenek için could kullanılır." },
      { id: "fg-abil-2", sentence: "She ________ join us tomorrow.", answer: "will be able to", hintType: "future ability", hintFirstLetter: "w", hintTr: "katılabilecek", explanation: "Future ability için will be able to kullanılır." },
      { id: "fg-abil-3", sentence: "He ________ be at home; the lights are on.", answer: "must", hintType: "deduction", hintFirstLetter: "m", hintTr: "olmalı", explanation: "Must güçlü olumlu tahmin bildirir." },
      { id: "fg-abil-4", sentence: "She ________ be Kate. Kate is in Italy.", answer: "can't", hintType: "negative deduction", hintFirstLetter: "c", hintTr: "olamaz", explanation: "Can’t güçlü olumsuz tahmin veya imkânsızlık bildirir." },
      { id: "fg-abil-5", sentence: "I like ________ able to read quickly.", answer: "being", hintType: "gerund", hintFirstLetter: "b", hintTr: "olabilmek", explanation: "Like sonrası burada gerund yapı kullanılır: being able to." }
    ]
  },
  {
    id: "fg-phrasal-verbs", title: "Phrasal Verbs", category: "Phrasal Verbs", topicId: "phrasal", level: "Hard",
    description: "Separable, inseparable ve pronoun kuralını çalış.",
    items: [
      { id: "fg-phr-1", sentence: "Your phone is ringing. Please turn ________ off.", answer: "it", hintType: "pronoun rule", hintFirstLetter: "i", hintTr: "onu", explanation: "Separable phrasal verb’de pronoun araya girer: turn it off." },
      { id: "fg-phr-2", sentence: "I am looking ________ my keys.", answer: "for", hintType: "inseparable phrasal verb", hintFirstLetter: "f", hintTr: "aramak", explanation: "Look for = aramak anlamındadır ve ayrılmaz." },
      { id: "fg-phr-3", sentence: "She looks ________ her little brother.", answer: "after", hintType: "phrasal verb", hintFirstLetter: "a", hintTr: "ilgilenmek", explanation: "Look after = bakmak/ilgilenmek anlamındadır." },
      { id: "fg-phr-4", sentence: "We are looking forward ________ seeing you.", answer: "to", hintType: "three-word phrasal verb", hintFirstLetter: "t", hintTr: "dört gözle beklemek", explanation: "Look forward to + V-ing kullanılır." },
      { id: "fg-phr-5", sentence: "The pasta was cold, so I sent ________ back.", answer: "it", hintType: "pronoun rule", hintFirstLetter: "i", hintTr: "onu", explanation: "Send back separable olabilir; pronoun araya girer: sent it back." }
    ]
  },
  {
    id: "fg-verb-patterns", title: "Verb Patterns", category: "Verb Patterns", topicId: "verbpatterns", level: "Hard",
    description: "To-infinitive, gerund, bare infinitive ve object + infinitive yapılarını çalış.",
    items: [
      { id: "fg-vp-1", sentence: "We enjoy ________ to concerts.", answer: "going", hintType: "gerund", hintFirstLetter: "g", hintTr: "gitmek", explanation: "Enjoy fiili gerund alır." },
      { id: "fg-vp-2", sentence: "I want ________ English better.", answer: "to learn", hintType: "to-infinitive", hintFirstLetter: "t", hintTr: "öğrenmek", explanation: "Want fiili to-infinitive alır." },
      { id: "fg-vp-3", sentence: "The teacher let her ________ early.", answer: "leave", hintType: "bare infinitive", hintFirstLetter: "l", hintTr: "çıkmak", explanation: "Let + object + bare infinitive kullanılır." },
      { id: "fg-vp-4", sentence: "My mother told me ________ careful.", answer: "to be", hintType: "object + infinitive", hintFirstLetter: "t", hintTr: "olmak", explanation: "Tell somebody to do something yapısı kullanılır." },
      { id: "fg-vp-5", sentence: "She avoided ________ late.", answer: "arriving", hintType: "gerund", hintFirstLetter: "a", hintTr: "varmak", explanation: "Avoid fiili gerund alır." }
    ]
  },
  {
    id: "fg-causative", title: "Have Something Done", category: "Grammar", topicId: "causative", level: "Medium",
    description: "Have/get something done yapısını çalış.",
    items: [
      { id: "fg-caus-1", sentence: "I had my hair ________ yesterday.", answer: "cut", hintType: "past participle", hintFirstLetter: "c", hintTr: "kestirdim", explanation: "Causative yapı have + object + V3 şeklindedir." },
      { id: "fg-caus-2", sentence: "We need to have the roof ________.", answer: "repaired", hintType: "past participle", hintFirstLetter: "r", hintTr: "tamir ettirmek", explanation: "Have + object + V3: have the roof repaired." },
      { id: "fg-caus-3", sentence: "She is going to have her photo ________.", answer: "taken", hintType: "past participle", hintFirstLetter: "t", hintTr: "çektirmek", explanation: "Photo taken kalıbında take fiilinin V3 hali taken kullanılır." },
      { id: "fg-caus-4", sentence: "They had the kitchen ________ last week.", answer: "painted", hintType: "past participle", hintFirstLetter: "p", hintTr: "boyatmak", explanation: "İşi başkasına yaptırma anlamı causative yapı ile verilir." },
      { id: "fg-caus-5", sentence: "I got my phone ________ yesterday.", answer: "fixed", hintType: "get causative", hintFirstLetter: "f", hintTr: "tamir ettirdim", explanation: "Get something done konuşma dilinde yaygın causative yapıdır." }
    ]
  },
  {
    id: "fg-passive", title: "Passive Voice", category: "Passive", topicId: "passive", level: "Hard",
    description: "Farklı zamanlarda passive voice yapılarını çalış.",
    items: [
      { id: "fg-pass-1", sentence: "Rice ________ grown in Valencia.", answer: "is", hintType: "present simple passive", hintFirstLetter: "i", hintTr: "yetiştirilir", explanation: "Present simple passive: is/are + V3." },
      { id: "fg-pass-2", sentence: "The museum was ________ in 1997.", answer: "opened", hintType: "past participle", hintFirstLetter: "o", hintTr: "açıldı", explanation: "Past simple passive: was/were + V3." },
      { id: "fg-pass-3", sentence: "A new bridge will be ________ next year.", answer: "built", hintType: "future passive", hintFirstLetter: "b", hintTr: "inşa edilecek", explanation: "Future passive: will be + V3." },
      { id: "fg-pass-4", sentence: "The road is being ________ at the moment.", answer: "cleaned", hintType: "present continuous passive", hintFirstLetter: "c", hintTr: "temizleniyor", explanation: "Present continuous passive: is/are being + V3." },
      { id: "fg-pass-5", sentence: "The bridge has been ________.", answer: "repaired", hintType: "present perfect passive", hintFirstLetter: "r", hintTr: "tamir edildi", explanation: "Present perfect passive: has/have been + V3." }
    ]
  },
  {
    id: "fg-reported-speech", title: "Reported Speech", category: "Reported Speech", topicId: "reported", level: "Hard",
    description: "Backshift, reported questions ve requests yapılarını çalış.",
    items: [
      { id: "fg-rep-1", sentence: "She said that she ________ find her purse.", answer: "couldn't", hintType: "backshift", hintFirstLetter: "c", hintTr: "bulamadı", explanation: "Can reported speech’te could olur." },
      { id: "fg-rep-2", sentence: "He asked me where I ________.", answer: "lived", hintType: "reported question", hintFirstLetter: "l", hintTr: "yaşadım", explanation: "Reported question’da düz cümle sırası kullanılır." },
      { id: "fg-rep-3", sentence: "They asked us ________ fill in the form.", answer: "to", hintType: "request", hintFirstLetter: "t", hintTr: "-mek", explanation: "Request yapısı ask + object + to infinitive şeklindedir." },
      { id: "fg-rep-4", sentence: "He said he would see me the ________ day.", answer: "next", hintType: "time change", hintFirstLetter: "n", hintTr: "ertesi", explanation: "Tomorrow reported speech’te the next day olur." },
      { id: "fg-rep-5", sentence: "She asked me ________ I was coming with them.", answer: "if", hintType: "yes/no reported question", hintFirstLetter: "i", hintTr: "-ip -mediğimi", explanation: "Yes/no reported questions için if veya whether kullanılır." }
    ]
  },
  {
    id: "fg-third-conditional", title: "Third Conditional", category: "Conditionals", topicId: "conditionals3", level: "Hard",
    description: "Geçmişte gerçekleşmeyen durumlar ve pişmanlıkları çalış.",
    items: [
      { id: "fg-third-1", sentence: "If I had known his number, I would have ________ him.", answer: "called", hintType: "third conditional", hintFirstLetter: "c", hintTr: "arardım", explanation: "Third conditional result: would have + V3." },
      { id: "fg-third-2", sentence: "If we had missed the bus, we ________ have got home late.", answer: "would", hintType: "third conditional", hintFirstLetter: "w", hintTr: "olurdu", explanation: "Third conditional ana cümlede would have + V3 kullanılır." },
      { id: "fg-third-3", sentence: "When we arrived, the train had ________.", answer: "left", hintType: "past perfect", hintFirstLetter: "l", hintTr: "ayrılmıştı", explanation: "Daha önce olan geçmiş olay past perfect ile anlatılır." },
      { id: "fg-third-4", sentence: "If they had been invited, they would have ________.", answer: "gone", hintType: "third conditional", hintFirstLetter: "g", hintTr: "giderlerdi", explanation: "Go fiilinin V3 hali gone’dır." },
      { id: "fg-third-5", sentence: "If she had studied, she would have ________ the exam.", answer: "passed", hintType: "third conditional", hintFirstLetter: "p", hintTr: "geçerdi", explanation: "Would have + V3 yapısı kullanılır." }
    ]
  },
  {
    id: "fg-auxiliaries", title: "Be / Do / Have", category: "Grammar", topicId: "auxiliaries", level: "Medium",
    description: "Auxiliary verb ve main verb farklarını çalış.",
    items: [
      { id: "fg-aux-1", sentence: "________ he like living in the UK?", answer: "Does", hintType: "auxiliary", hintFirstLetter: "D", hintTr: "yardımcı fiil", explanation: "Present simple he/she/it sorularında does kullanılır." },
      { id: "fg-aux-2", sentence: "Is he ________ homesick?", answer: "feeling", hintType: "present continuous", hintFirstLetter: "f", hintTr: "hissediyor", explanation: "Present continuous: is + V-ing." },
      { id: "fg-aux-3", sentence: "What have you been ________ since I last saw you?", answer: "doing", hintType: "perfect continuous", hintFirstLetter: "d", hintTr: "yapıyorsun", explanation: "Present perfect continuous: have been + V-ing." },
      { id: "fg-aux-4", sentence: "She ________ two brothers and a sister.", answer: "has", hintType: "main verb", hintFirstLetter: "h", hintTr: "sahip", explanation: "Have possession anlamındaysa main verb olarak has kullanılır." },
      { id: "fg-aux-5", sentence: "Did you ________ the beginning of the film?", answer: "miss", hintType: "past simple question", hintFirstLetter: "m", hintTr: "kaçırmak", explanation: "Did ile fiil yalın halde kullanılır." }
    ]
  }
];

let fillGapActiveFilter = "all";
let activeFillGapExerciseId = null;
let fillGapAnswers = {};
let selectedFillGapWordId = null;
let fillGapChecked = false;
let fillGapIsWrongPractice = false;
const FILL_GAP_WRONG_KEY = "ravza_fill_gap_wrong_items";

function fillGapEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getFillGapExercisesWithWords() {
  return FILL_GAP_EXERCISES.map((exercise) => ({
    ...exercise,
    words: exercise.items.map((item, index) => ({
      id: `${exercise.id}-word-${index}`,
      text: item.answer,
      itemId: item.id,
      hintTr: item.hintTr || item.answer
    }))
  }));
}

function getActiveFillGapExercise() {
  if (fillGapIsWrongPractice) return buildWrongFillGapExercise();
  return getFillGapExercisesWithWords().find((exercise) => exercise.id === activeFillGapExerciseId) || null;
}

function buildWrongFillGapExercise() {
  const wrongItems = getStoredFillGapWrongItems();
  return {
    id: "fg-wrong-practice",
    title: "Yanlışları Tekrar Et",
    category: "Tekrar",
    topicId: "wrong-practice",
    level: "Review",
    description: "Daha önce yanlış yapılan boşlukları tekrar çöz.",
    items: wrongItems.map((item, index) => ({
      id: item.itemId || `wrong-${index}`,
      sentence: item.sentence,
      answer: item.answer,
      hintType: item.topic || "Tekrar",
      hintFirstLetter: String(item.answer || "").charAt(0),
      hintTr: item.hintTr || item.answer,
      explanation: item.explanation || "Bu soru daha önce yanlış yapıldığı için tekrar listesine eklendi."
    })),
    words: wrongItems.map((item, index) => ({
      id: `fg-wrong-word-${index}`,
      text: item.answer,
      itemId: item.itemId || `wrong-${index}`,
      hintTr: item.hintTr || item.answer
    }))
  };
}

function syncFillGapWordsToMemoryCards() {
  if (!Array.isArray(MEMORIZATION_CARDS)) return;
  const existing = new Set(MEMORIZATION_CARDS.map((card) => String(card.front || "").toLowerCase()));
  FILL_GAP_EXERCISES.forEach((exercise) => {
    exercise.items.forEach((item) => {
      const front = String(item.answer || "").trim();
      if (!front || existing.has(front.toLowerCase())) return;
      MEMORIZATION_CARDS.push({
        id: `fg-mem-${exercise.id}-${item.id}`,
        front,
        back: item.hintTr || exercise.title || "Fill Gap",
        source: "Fill Gap",
        category: exercise.category
      });
      existing.add(front.toLowerCase());
    });
  });
}

function setFillGapFocusMode(isActive) {
  const page = document.getElementById("fillgaphub");
  if (!page) return;
  page.classList.toggle("fill-gap-focus-mode", Boolean(isActive));
}

function renderFillGapHub(filter = fillGapActiveFilter) {
  fillGapActiveFilter = filter || fillGapActiveFilter || "all";
  const filtersEl = document.getElementById("fillGapFilters");
  const grid = document.getElementById("fillGapGrid");
  const workspace = document.getElementById("fillGapWorkspace");
  const searchEl = document.getElementById("fillGapSearch");
  if (!filtersEl || !grid) return;

  const hasActiveExercise = Boolean(activeFillGapExerciseId || fillGapIsWrongPractice);
  setFillGapFocusMode(hasActiveExercise);
  if (hasActiveExercise) {
    grid.innerHTML = "";
    filtersEl.innerHTML = "";
    return;
  }

  const wrongCount = getStoredFillGapWrongItems().length;
  const heroStats = document.getElementById("fillGapHeroStats");
  if (heroStats) {
    heroStats.innerHTML = `
      <span><strong>${FILL_GAP_EXERCISES.length}</strong> konu</span>
      <span><strong>${FILL_GAP_EXERCISES.reduce((sum, ex) => sum + ex.items.length, 0)}</strong> boşluk</span>
      <span><strong>${wrongCount}</strong> tekrar</span>
    `;
  }

  const q = String(searchEl?.value || "").trim().toLowerCase();
  const activeFilterLower = String(fillGapActiveFilter || "all").toLowerCase();
  const exercises = getFillGapExercisesWithWords().filter((exercise) => {
    const searchableText = [exercise.title, exercise.category, exercise.description, exercise.level, ...exercise.items.map((item) => `${item.sentence} ${item.answer} ${item.hintTr}`)].join(" ").toLowerCase();
    const matchesFilter = activeFilterLower === "all"
      || String(exercise.category || "").toLowerCase() === activeFilterLower
      || String(exercise.title || "").toLowerCase().includes(activeFilterLower);
    return matchesFilter && (!q || searchableText.includes(q));
  });

  filtersEl.innerHTML = `
    <div class="fill-gap-filter-wrap">
      <label for="fillGapFilterSelect" class="fill-gap-filter-label">Konu filtresi</label>
      <div class="fill-gap-filter-control">
        <select id="fillGapFilterSelect" class="fill-gap-filter-select" onchange="renderFillGapHub(this.value)">
          ${FILL_GAP_FILTERS.map((filterItem) => `<option value="${fillGapEscape(filterItem.id)}" ${fillGapActiveFilter === filterItem.id ? "selected" : ""}>${fillGapEscape(filterItem.label)}</option>`).join("")}
        </select>
        <span class="fill-gap-filter-count">${exercises.length} egzersiz</span>
      </div>
    </div>
  `;

  if (!exercises.length) {
    grid.innerHTML = `<div class="fill-gap-empty">Bu filtreye uygun boşluk doldurma egzersizi bulunamadı.</div>`;
  } else {
    grid.innerHTML = exercises.map((exercise) => `
      <article class="fill-gap-card">
        <div class="fill-gap-card-top">
          <span class="fill-gap-chip">${fillGapEscape(exercise.category)}</span>
          <span class="fill-gap-level">${fillGapEscape(exercise.level)}</span>
        </div>
        <h3>${fillGapEscape(exercise.title)}</h3>
        <p>${fillGapEscape(exercise.description)}</p>
        <div class="fill-gap-card-meta">
          <span>${exercise.items.length} boşluk</span>
          <span>${exercise.words.length} kelime</span>
        </div>
        <button type="button" class="primary-btn fill-gap-start-btn" onclick="startFillGapExercise('${fillGapEscape(exercise.id)}')">Başla</button>
      </article>
    `).join("");
  }

  if (workspace && !activeFillGapExerciseId && !fillGapIsWrongPractice) workspace.hidden = true;
}

function startFillGapExercise(exerciseId) {
  activeFillGapExerciseId = exerciseId;
  fillGapIsWrongPractice = false;
  resetFillGapStateOnly();
  setFillGapFocusMode(true);
  renderFillGapWorkspace();

  setTimeout(() => {
    document.getElementById("fillgaphub")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }, 50);
}

function closeFillGapExercise() {
  activeFillGapExerciseId = null;
  fillGapIsWrongPractice = false;
  resetFillGapStateOnly();
  setFillGapFocusMode(false);
  const workspace = document.getElementById("fillGapWorkspace");
  if (workspace) {
    workspace.hidden = true;
    workspace.innerHTML = "";
  }
  renderFillGapHub(fillGapActiveFilter);
  document.getElementById("fillgaphub")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function backToFillGapTopics() {
  closeFillGapExercise();
}


function resetFillGapStateOnly() {
  fillGapAnswers = {};
  selectedFillGapWordId = null;
  fillGapChecked = false;
}

function renderFillGapWorkspace() {
  const workspace = document.getElementById("fillGapWorkspace");
  const exercise = getActiveFillGapExercise();
  if (!workspace || !exercise) return;
  workspace.hidden = false;

  const score = getFillGapScore(exercise);
  workspace.innerHTML = `
    <div class="fill-gap-focus-actions">
      <button type="button" class="ghost-btn fill-gap-back-btn" onclick="backToFillGapTopics()">
        ← Konulara Dön
      </button>
    </div>

    <div class="fill-gap-wordbar">
      <div class="fill-gap-word-pills" id="fillGapWordBox">
        ${renderFillGapWordBox(exercise)}
      </div>
    </div>

    <div class="fill-gap-work-head">
      <div>
        <span class="fill-gap-chip">${fillGapEscape(exercise.category)}</span>
        <h3>${fillGapEscape(exercise.title)}</h3>
        <p>${fillGapEscape(exercise.description || "Kelimeyi seç, boşluğa dokun ve kontrol et.")}</p>
      </div>

      <div class="fill-gap-score" id="fillGapScoreBox">
        ${renderFillGapScore(score, fillGapChecked)}
      </div>
    </div>

    <div class="fill-gap-sentences-wrap">
      <div class="fill-gap-sentences">
        ${exercise.items.map((item, index) => renderFillGapItem(item, index)).join("")}
      </div>
    </div>

    <div class="fill-gap-actions">
      <button type="button" class="check-btn" onclick="checkFillGapAnswers()">Kontrol Et</button>
      <button type="button" class="secondary-btn" onclick="showFillGapAnswers()">Cevapları Göster</button>
      <button type="button" class="ghost-btn" onclick="resetFillGapExercise()">Tekrar Çöz</button>
      <button type="button" class="ghost-btn" onclick="startFillGapWrongPractice()">Yanlışlarımı Tekrar Et</button>
      <button type="button" class="primary-btn soft" onclick="nextFillGapExercise()">Sonraki Egzersiz</button>
    </div>
  `;
  updateFillGapWordBoxState();
}

function renderFillGapScore(score, checked) {
  if (!checked) {
    return `
      <span><strong>${score.total}</strong> boşluk</span>
      <span><strong>${score.filled}</strong> dolu</span>
      <span><strong>${score.empty}</strong> boş</span>
    `;
  }
  return `
    <span class="is-correct"><strong>${score.correct}</strong> doğru</span>
    <span class="is-wrong"><strong>${score.wrong}</strong> yanlış</span>
    <span><strong>${score.empty}</strong> boş</span>
    <span><strong>%${score.percent}</strong> başarı</span>
  `;
}

function renderFillGapWordBox(exercise) {
  return `
    <div class="fill-gap-words" aria-label="Boşluk doldurma kelime seçenekleri">
      ${exercise.words.map((word) => {
        const used = Object.values(fillGapAnswers).some((answer) => answer.wordId === word.id);
        const selected = selectedFillGapWordId === word.id;
        return `
          <button
            type="button"
            class="fill-gap-word ${selected ? "selected" : ""} ${used ? "used" : ""}"
            draggable="true"
            data-word-id="${fillGapEscape(word.id)}"
            onclick="selectFillGapWord('${fillGapEscape(word.id)}')"
            ondragstart="handleFillGapDragStart(event, '${fillGapEscape(word.id)}')">
            ${fillGapEscape(word.text)}
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderFillGapItem(item, index) {
  const answer = fillGapAnswers[item.id];
  const value = answer?.text || "";
  const status = getFillGapItemStatus(item);
  const parts = String(item.sentence).split("________");
  const sentenceHtml = `${fillGapEscape(parts[0] || "")}<button type="button" tabindex="0" class="fill-gap-drop ${value ? "filled" : ""} ${status}" onclick="placeSelectedWord('${fillGapEscape(item.id)}')" ondragover="handleFillGapDragOver(event)" ondrop="handleFillGapDrop(event, '${fillGapEscape(item.id)}')" aria-label="${index + 1}. boşluk">${value ? fillGapEscape(value) : "Cevap seç"}</button>${fillGapEscape(parts.slice(1).join("________"))}`;
  return `
    <article class="fill-gap-sentence-card" data-fill-item-id="${fillGapEscape(item.id)}">
      <div class="fill-gap-question-line">
        <span class="fill-gap-number">${index + 1}</span>
        <p>${sentenceHtml}</p>
      </div>
      <div class="fill-gap-hints">
        <span>Tür: ${fillGapEscape(item.hintType || "-")}</span>
        <span>İlk harf: ${fillGapEscape(item.hintFirstLetter || "-")}</span>
        <span>TR: ${fillGapEscape(item.hintTr || "-")}</span>
      </div>
      ${fillGapChecked ? `<div class="fill-gap-explanation ${status}"><strong>Doğru cevap:</strong> ${fillGapEscape(item.answer)}<br>${fillGapEscape(item.explanation || "")}</div>` : ""}
    </article>
  `;
}

function getFillGapItemStatus(item) {
  if (!fillGapChecked) return "";
  const userAnswer = (fillGapAnswers[item.id]?.text || "").trim().toLowerCase();
  const correctAnswer = String(item.answer || "").trim().toLowerCase();
  if (!userAnswer) return "empty";
  return userAnswer === correctAnswer ? "correct" : "wrong";
}

function selectFillGapWord(wordId) {
  const exercise = getActiveFillGapExercise();
  if (!exercise) return;
  const usedItemId = Object.entries(fillGapAnswers).find(([, answer]) => answer.wordId === wordId)?.[0];
  if (usedItemId) {
    delete fillGapAnswers[usedItemId];
    selectedFillGapWordId = null;
    fillGapChecked = false;
    renderFillGapWorkspace();
    return;
  }
  selectedFillGapWordId = selectedFillGapWordId === wordId ? null : wordId;
  updateFillGapWordBoxState();
  document.querySelectorAll(".fill-gap-drop").forEach((drop) => drop.classList.toggle("active", Boolean(selectedFillGapWordId)));
}

function placeSelectedWord(itemId) {
  const exercise = getActiveFillGapExercise();
  if (!exercise) return;
  if (fillGapAnswers[itemId] && !selectedFillGapWordId) {
    removeFillGapAnswer(itemId);
    return;
  }
  if (!selectedFillGapWordId) return;
  const word = exercise.words.find((wordItem) => wordItem.id === selectedFillGapWordId);
  if (!word) return;
  Object.keys(fillGapAnswers).forEach((key) => {
    if (fillGapAnswers[key].wordId === word.id) delete fillGapAnswers[key];
  });
  fillGapAnswers[itemId] = { wordId: word.id, text: word.text };
  selectedFillGapWordId = null;
  fillGapChecked = false;
  renderFillGapWorkspace();
  requestAnimationFrame(() => {
    const card = document.querySelector(`[data-fill-item-id="${CSS.escape(itemId)}"] .fill-gap-drop`);
    if (card) {
      card.classList.add("pop");
      setTimeout(() => card.classList.remove("pop"), 260);
    }
  });
}

function removeFillGapAnswer(itemId) {
  delete fillGapAnswers[itemId];
  fillGapChecked = false;
  renderFillGapWorkspace();
}

function handleFillGapDragStart(event, wordId) {
  selectedFillGapWordId = wordId;
  event.dataTransfer?.setData("text/plain", wordId);
  event.dataTransfer?.setData("application/x-fill-gap-word", wordId);
  updateFillGapWordBoxState();
}

function handleFillGapDragOver(event) {
  event.preventDefault();
  event.currentTarget?.classList.add("active");
}

function handleFillGapDrop(event, itemId) {
  event.preventDefault();
  const wordId = event.dataTransfer?.getData("application/x-fill-gap-word") || event.dataTransfer?.getData("text/plain") || selectedFillGapWordId;
  if (!wordId) return;
  selectedFillGapWordId = wordId;
  placeSelectedWord(itemId);
}

function checkFillGapAnswers() {
  const exercise = getActiveFillGapExercise();
  if (!exercise) return;
  fillGapChecked = true;
  saveFillGapWrongItems();
  renderFillGapWorkspace();
}

function showFillGapAnswers() {
  const exercise = getActiveFillGapExercise();
  if (!exercise) return;
  fillGapAnswers = {};
  exercise.items.forEach((item, index) => {
    const word = exercise.words.find((wordItem) => wordItem.itemId === item.id) || { id: `${exercise.id}-answer-${index}`, text: item.answer };
    fillGapAnswers[item.id] = { wordId: word.id, text: item.answer };
  });
  selectedFillGapWordId = null;
  fillGapChecked = true;
  renderFillGapWorkspace();
  const scoreBox = document.getElementById("fillGapScoreBox");
  if (scoreBox) scoreBox.insertAdjacentHTML("beforeend", `<span class="is-info"><strong>Cevaplar</strong> gösterildi</span>`);
}

function resetFillGapExercise() {
  resetFillGapStateOnly();
  renderFillGapWorkspace();
}

function nextFillGapExercise() {
  const exercises = getFillGapExercisesWithWords();
  const currentIndex = exercises.findIndex((exercise) => exercise.id === activeFillGapExerciseId);
  const next = exercises[(currentIndex + 1 + exercises.length) % exercises.length];
  if (next) startFillGapExercise(next.id);
}

function getFillGapScore(exercise) {
  let correct = 0;
  let wrong = 0;
  let empty = 0;
  exercise.items.forEach((item) => {
    const userAnswer = (fillGapAnswers[item.id]?.text || "").trim().toLowerCase();
    const correctAnswer = String(item.answer || "").trim().toLowerCase();
    if (!userAnswer) empty += 1;
    else if (userAnswer === correctAnswer) correct += 1;
    else wrong += 1;
  });
  const total = exercise.items.length;
  const filled = total - empty;
  const percent = total ? Math.round((correct / total) * 100) : 0;
  return { correct, wrong, empty, total, filled, percent };
}

function getFillGapWordUsage() {
  return Object.values(fillGapAnswers).reduce((acc, answer) => {
    acc[answer.wordId] = (acc[answer.wordId] || 0) + 1;
    return acc;
  }, {});
}

function updateFillGapWordBoxState() {
  const exercise = getActiveFillGapExercise();
  const box = document.getElementById("fillGapWordBox");
  if (!exercise || !box) return;
  box.innerHTML = renderFillGapWordBox(exercise);
}

function getStoredFillGapWrongItems() {
  try {
    return JSON.parse(localStorage.getItem(FILL_GAP_WRONG_KEY) || "[]");
  } catch (error) {
    return [];
  }
}

function setStoredFillGapWrongItems(items) {
  localStorage.setItem(FILL_GAP_WRONG_KEY, JSON.stringify(items));
}

function saveFillGapWrongItems() {
  const exercise = getActiveFillGapExercise();
  if (!exercise) return;
  const stored = getStoredFillGapWrongItems();
  const byId = new Map(stored.map((item) => [`${item.exerciseId}:${item.itemId}`, item]));

  exercise.items.forEach((item) => {
    const userAnswer = (fillGapAnswers[item.id]?.text || "").trim();
    const isCorrect = userAnswer.toLowerCase() === String(item.answer || "").trim().toLowerCase();
    const key = `${exercise.id}:${item.id}`;
    if (isCorrect) {
      byId.delete(key);
      return;
    }
    if (userAnswer) {
      byId.set(key, {
        exerciseId: exercise.id,
        itemId: item.id,
        sentence: item.sentence,
        answer: item.answer,
        userAnswer,
        topic: exercise.title,
        hintTr: item.hintTr,
        explanation: item.explanation
      });
    }
  });

  setStoredFillGapWrongItems([...byId.values()].slice(-80));
  renderFillGapHub(fillGapActiveFilter);
}

function startFillGapWrongPractice() {
  const wrongItems = getStoredFillGapWrongItems();
  if (!wrongItems.length) {
    alert("Henüz tekrar edilecek yanlış boşluk yok. Önce bir egzersiz çözebilirsin.");
    return;
  }
  fillGapIsWrongPractice = true;
  activeFillGapExerciseId = "fg-wrong-practice";
  resetFillGapStateOnly();
  setFillGapFocusMode(true);
  renderFillGapWorkspace();
  navigate("fillgaphub");
  document.getElementById("fillGapWorkspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const originalRavzaNavigate = window.navigate;
window.navigate = function ravzaFillGapNavigate(pageId) {
  if (typeof originalRavzaNavigate === "function") originalRavzaNavigate(pageId);
  if (pageId === "fillgaphub") {
    document.querySelectorAll(".nav-links button").forEach((button) => button.classList.remove("active"));
    document.getElementById("nav-fillgaphub")?.classList.add("active");
    renderFillGapHub(fillGapActiveFilter);
  }
};

window.renderFillGapHub = renderFillGapHub;
window.startFillGapExercise = startFillGapExercise;
window.renderFillGapWorkspace = renderFillGapWorkspace;
window.closeFillGapExercise = closeFillGapExercise;
window.backToFillGapTopics = backToFillGapTopics;
window.selectFillGapWord = selectFillGapWord;
window.placeSelectedWord = placeSelectedWord;
window.removeFillGapAnswer = removeFillGapAnswer;
window.handleFillGapDragStart = handleFillGapDragStart;
window.handleFillGapDragOver = handleFillGapDragOver;
window.handleFillGapDrop = handleFillGapDrop;
window.checkFillGapAnswers = checkFillGapAnswers;
window.showFillGapAnswers = showFillGapAnswers;
window.resetFillGapExercise = resetFillGapExercise;
window.nextFillGapExercise = nextFillGapExercise;
window.saveFillGapWrongItems = saveFillGapWrongItems;
window.startFillGapWrongPractice = startFillGapWrongPractice;
window.syncFillGapWordsToMemoryCards = syncFillGapWordsToMemoryCards;
window.getFillGapWordUsage = getFillGapWordUsage;
window.updateFillGapWordBoxState = updateFillGapWordBoxState;

try {
  syncFillGapWordsToMemoryCards();
} catch (error) {
  console.warn("Fill gap words could not sync to memory cards", error);
}

document.addEventListener("DOMContentLoaded", () => {
  syncFillGapWordsToMemoryCards();
  renderFillGapHub();
  if (typeof renderMemorizationHub === "function") {
    renderMemorizationHub(document.getElementById("memoryFilter")?.value || "");
  }
});


/* =========================================================
   DUOLINGO TARZI STREAK MODÜLÜ
   - Mevcut özellikleri değiştirmez.
   - Çalışma tamamlanınca, quiz bitince, sınav bitince veya ezber/fill-gap pratiği yapılınca bugünü kaydeder.
   - Veriyi localStorage içinde saklar.
   ========================================================= */
(function initDuolingoStyleStreakModule() {
  const STORAGE_KEY = "ravza_study_streak_v1";
  const DAY_MS = 24 * 60 * 60 * 1000;

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function toLocalDateKey(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function fromLocalDateKey(key) {
    const [year, month, day] = String(key).split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function getMonday(date = new Date()) {
    const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = copy.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    copy.setDate(copy.getDate() + diff);
    return copy;
  }

  function readStreakData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        days: Array.isArray(parsed.days) ? parsed.days.filter(Boolean) : [],
        best: Number(parsed.best || 0),
        lastAction: parsed.lastAction || null
      };
    } catch (error) {
      return { days: [], best: 0, lastAction: null };
    }
  }

  function writeStreakData(data) {
    const normalized = {
      days: [...new Set(data.days || [])].sort(),
      best: Number(data.best || 0),
      lastAction: data.lastAction || null
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }

  function calculateCurrentStreak(days) {
    const daySet = new Set(days || []);
    const today = new Date();
    const todayKey = toLocalDateKey(today);
    const yesterday = new Date(today.getTime() - DAY_MS);
    const yesterdayKey = toLocalDateKey(yesterday);

    if (!daySet.has(todayKey) && !daySet.has(yesterdayKey)) return 0;

    let cursor = daySet.has(todayKey) ? today : yesterday;
    let count = 0;

    while (daySet.has(toLocalDateKey(cursor))) {
      count += 1;
      cursor = new Date(cursor.getTime() - DAY_MS);
    }

    return count;
  }

  function markStudyStreakToday(action = "study") {
    const data = readStreakData();
    const todayKey = toLocalDateKey();

    if (!data.days.includes(todayKey)) {
      data.days.push(todayKey);
    }

    const current = calculateCurrentStreak(data.days);
    data.best = Math.max(Number(data.best || 0), current);
    data.lastAction = action;
    writeStreakData(data);
    renderStudyStreak();
  }

  function getStreakMessage(current, isTodayDone) {
    if (!isTodayDone && current === 0) return "Bugün bir çalışma yap, serin başlasın.";
    if (!isTodayDone) return "Seriyi kaybetmemek için bugün kısa bir tekrar yap.";
    if (current === 1) return "Harika başlangıç! Bugün streak aktif.";
    if (current < 4) return "Güzel gidiyorsun, küçük adımlar seri oluşturur.";
    if (current < 7) return "Mükemmel! Çalışma alışkanlığı oluşuyor.";
    return "Efsane seri! Ravza için çalışma ritmi oturdu.";
  }

  function renderStudyStreak() {
    const data = readStreakData();
    const todayKey = toLocalDateKey();
    const isTodayDone = data.days.includes(todayKey);
    const current = calculateCurrentStreak(data.days);
    const best = Math.max(Number(data.best || 0), current);

    if (best !== data.best) {
      data.best = best;
      writeStreakData(data);
    }

    const currentEl = document.getElementById("streakCurrent");
    const messageEl = document.getElementById("streakMessage");
    const statusEl = document.getElementById("streakStatusPill");
    const bestEl = document.getElementById("streakBestLabel");
    const fireEl = document.getElementById("streakFireIcon");
    const dayEls = document.querySelectorAll("#streakDays [data-day]");

    if (currentEl) currentEl.textContent = String(current);
    if (messageEl) messageEl.textContent = getStreakMessage(current, isTodayDone);
    if (bestEl) bestEl.textContent = `En iyi seri: ${best} gün`;

    if (statusEl) {
      statusEl.textContent = isTodayDone ? "Bugün tamamlandı" : "Bugün bekliyor";
      statusEl.classList.toggle("done", isTodayDone);
    }

    if (fireEl) {
      fireEl.classList.toggle("is-active", isTodayDone);
      fireEl.textContent = isTodayDone ? "🔥" : "🕯️";
    }

    const monday = getMonday();
    const todayIndex = (new Date().getDay() + 6) % 7;
    const daySet = new Set(data.days || []);

    dayEls.forEach((el) => {
      const index = Number(el.dataset.day || 0);
      const date = new Date(monday.getTime() + index * DAY_MS);
      const key = toLocalDateKey(date);
      el.classList.toggle("done", daySet.has(key));
      el.classList.toggle("today", index === todayIndex);
      el.title = `${key}${daySet.has(key) ? " - tamamlandı" : " - bekliyor"}`;
    });
  }

  function wrapFunction(name, afterRun, options = {}) {
    const current = window[name];
    if (typeof current !== "function" || current.__streakWrapped) return;

    const wrapped = function streakWrappedFunction(...args) {
      const result = current.apply(this, args);
      const runAfter = () => {
        try { afterRun(args, result); } catch (error) { console.warn("Streak güncellenemedi:", error); }
      };

      if (options.delay) setTimeout(runAfter, options.delay);
      else runAfter();

      return result;
    };

    wrapped.__streakWrapped = true;
    window[name] = wrapped;
  }

  function attachStreakHooks() {
    wrapFunction("toggleStudyDone", ([topicId]) => {
      if (typeof isStudyDone === "function" && isStudyDone(topicId)) {
        markStudyStreakToday("study-complete");
      }
    }, { delay: 0 });

    wrapFunction("toggleQuizDone", ([topicId]) => {
      if (typeof isQuizDone === "function" && isQuizDone(topicId)) {
        markStudyStreakToday("quiz-complete");
      }
    }, { delay: 0 });

    wrapFunction("submitTopicQuiz", () => markStudyStreakToday("quiz-submit"), { delay: 0 });
    wrapFunction("submitExam", () => markStudyStreakToday("exam-submit"), { delay: 0 });
    wrapFunction("submitMemoryPracticeAnswer", () => markStudyStreakToday("memory-practice"), { delay: 0 });
    wrapFunction("checkFillGapAnswers", () => markStudyStreakToday("fill-gap"), { delay: 0 });
    wrapFunction("finishFillGapPractice", () => markStudyStreakToday("fill-gap-finish"), { delay: 0 });

    if (typeof updateDashboardStats === "function" && !updateDashboardStats.__streakRenderWrapped) {
      const previousUpdateDashboardStats = updateDashboardStats;
      updateDashboardStats = function updateDashboardStatsWithStreak(...args) {
        const result = previousUpdateDashboardStats.apply(this, args);
        renderStudyStreak();
        return result;
      };
      updateDashboardStats.__streakRenderWrapped = true;
    }
  }

  window.markStudyStreakToday = markStudyStreakToday;
  window.renderStudyStreak = renderStudyStreak;

  const boot = () => {
    attachStreakHooks();
    renderStudyStreak();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 0));
  } else {
    setTimeout(boot, 0);
  }
})();
