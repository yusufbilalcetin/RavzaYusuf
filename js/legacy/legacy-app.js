import { db } from "../config/firebase-config.js";
import { KONU_LISTESI } from "../../data/konu-listesi.js";
import { loadAllQuizzes } from "../services/quiz-service.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  getDocs,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const makeQuestion = (question, options, answer, explanation) => ({ question, options, answer, explanation });

const TOPIC_ID_ALIASES = {
  unit6b: "ability",
  phrasalverbs: "phrasal"
};

function resolveTopicId(id) {
  return TOPIC_ID_ALIASES[id] || id;
}

const TOPICS = KONU_LISTESI.map((topic) => ({
  ...topic,
  summaryHtml: "",
  quiz: []
}));

window.TOPICS = TOPICS;

function getTopicById(id) {
  const resolvedId = resolveTopicId(id);
  return TOPICS.find((topic) => topic.id === resolvedId);
}

function appendTopicHtml(id, html) {
  const topic = getTopicById(id);
  if (!topic) return;
  topic.summaryHtml = String(topic.summaryHtml || "") + String(html || "");
}

function addTopicQuestions(id, questions) {
  const topic = getTopicById(id);
  if (!topic || !Array.isArray(questions)) return;
  topic.quiz.push(...questions);
  topic.quizCount = topic.quiz.length;
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
  return normalizeSearchText([
    topic.title,
    topic.subtitle,
    topic.unit,
    topic.category,
    ...(topic.keyPoints || []),
    ...((topic.searchAliases || []))
  ].join(" "));
}

function matchesTopicSearch(topic, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return getTopicSearchIndex(topic).includes(normalizedQuery);
}

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
  { id: "mem-29", front: "Direct object", back: "Doğrudan nesne" },
  { id: "mem-30", front: "Indirect object", back: "Dolaylı nesne" },
  { id: "mem-31", front: "Object pronoun", back: "Nesne zamiri" },
  { id: "mem-32", front: "Possessive adjective", back: "İyelik sıfatı" },
  { id: "mem-33", front: "Possessive pronoun", back: "İyelik zamiri" },
  { id: "mem-34", front: "Lend", back: "Ödünç vermek" },
  { id: "mem-35", front: "Borrow", back: "Ödünç almak" },
  { id: "mem-36", front: "Ambitious", back: "Hırslı" },
  { id: "mem-37", front: "Selfish", back: "Bencil" },
  { id: "mem-38", front: "Expensive", back: "Pahalı" },
  { id: "mem-39", front: "Cheap", back: "Ucuz" },
  { id: "mem-40", front: "Comfortable", back: "Rahat / konforlu" },
  { id: "mem-41", front: "Successful", back: "Başarılı" },
  { id: "mem-42", front: "Friendly", back: "Dost canlısı" },
  { id: "mem-43", front: "Stative verb", back: "Durum fiili" },
  { id: "mem-44", front: "Possession", back: "Sahiplik" },
  { id: "mem-45", front: "Opinion", back: "Görüş / fikir" },
  { id: "mem-46", front: "Arrangement", back: "Önceden ayarlanmış plan" },
  { id: "mem-47", front: "Timetable", back: "Tarife / zaman çizelgesi" },
  { id: "mem-48", front: "Ownership", back: "Sahiplik" },
  { id: "mem-49", front: "Share", back: "Paylaşmak" },
  { id: "mem-50", front: "Separate", back: "Ayrı / ayırmak" },
  { id: "mem-51", front: "Own", back: "Kendine ait" },
  { id: "mem-52", front: "Colleague", back: "İş arkadaşı" },
  { id: "mem-53", front: "Bakery", back: "Fırın" },
  { id: "mem-54", front: "Habit", back: "Alışkanlık" },
  { id: "mem-55", front: "Interrupted", back: "Bölünmüş / kesintiye uğramış" },
  { id: "mem-56", front: "Background action", back: "Arka plan eylemi" },
  { id: "mem-57", front: "Across", back: "Karşıya / bir uçtan diğer uca" },
  { id: "mem-58", front: "Through", back: "İçinden geçerek" },
  { id: "mem-59", front: "Along", back: "Boyunca" },
  { id: "mem-60", front: "Towards", back: "-e doğru" },
  { id: "mem-61", front: "Apply for", back: "Başvurmak" },
  { id: "mem-62", front: "Rely on", back: "Güvenmek / bel bağlamak" },
  { id: "mem-63", front: "Proud of", back: "Gurur duymak" },
  { id: "mem-64", front: "Worried about", back: "Endişeli olmak" },
  { id: "mem-65", front: "Prediction", back: "Tahmin" },
  { id: "mem-66", front: "Promise", back: "Söz vermek / vaat" },
  { id: "mem-67", front: "Offer", back: "Teklif etmek / teklif" },
  { id: "mem-68", front: "Instant decision", back: "Anında verilen karar" },
  { id: "mem-69", front: "Intention", back: "Niyet" },
  { id: "mem-70", front: "Evidence-based", back: "Kanıta dayalı" },
  { id: "mem-71", front: "Conditional", back: "Koşul yapısı" },
  { id: "mem-72", front: "Imaginary", back: "Hayali / gerçek dışı" },
  { id: "mem-73", front: "Consequence", back: "Sonuç" },
  { id: "mem-74", front: "Unless", back: "Eğer ... değilse" },
  { id: "mem-75", front: "Already", back: "Zaten / çoktan" },
  { id: "mem-76", front: "Yet", back: "Henüz" },
  { id: "mem-77", front: "Recently", back: "Yakın zamanda" },
  { id: "mem-78", front: "Lately", back: "Son zamanlarda" },
  { id: "mem-79", front: "Since", back: "-den beri" },
  { id: "mem-80", front: "Obligation", back: "Zorunluluk" },
  { id: "mem-81", front: "Necessity", back: "Gereklilik" },
  { id: "mem-82", front: "Prohibition", back: "Yasak" },
  { id: "mem-83", front: "Advice", back: "Tavsiye" },
  { id: "mem-84", front: "Ability", back: "Yetenek" },
  { id: "mem-85", front: "Permission", back: "İzin" },
  { id: "mem-86", front: "Deduction", back: "Mantıksal çıkarım" },
  { id: "mem-87", front: "Manage to", back: "Başarmak" },
  { id: "mem-88", front: "Get up", back: "Kalkmak" },
  { id: "mem-89", front: "Set off", back: "Yola çıkmak" },
  { id: "mem-90", front: "Switch off", back: "Kapatmak" },
  { id: "mem-91", front: "Fill in", back: "Doldurmak" },
  { id: "mem-92", front: "Put away", back: "Yerine koymak" },
  { id: "mem-93", front: "Pay back", back: "Geri ödemek" },
  { id: "mem-94", front: "Take after", back: "Birine benzemek" },
  { id: "mem-95", front: "Look after", back: "Bakmak / ilgilenmek" },
  { id: "mem-96", front: "Look forward to", back: "Heyecanla beklemek" },
  { id: "mem-97", front: "Give away", back: "Bedava vermek / dağıtmak" },
  { id: "mem-98", front: "Agree to", back: "Kabul etmek" },
  { id: "mem-99", front: "Decide to", back: "Karar vermek" },
  { id: "mem-100", front: "Avoid", back: "Kaçınmak" },
  { id: "mem-101", front: "Allow", back: "İzin vermek" },
  { id: "mem-102", front: "Persuade", back: "İkna etmek" },
  { id: "mem-103", front: "Have something done", back: "Bir işi birine yaptırmak" },
  { id: "mem-104", front: "Get something done", back: "Bir işi yaptırtmak" },
  { id: "mem-105", front: "Repair", back: "Tamir etmek" },
  { id: "mem-106", front: "Redecorate", back: "Yeniden dekore etmek" },
  { id: "mem-107", front: "Passive voice", back: "Edilgen yapı" },
  { id: "mem-108", front: "Reported speech", back: "Dolaylı anlatım" },
  { id: "mem-109", front: "Whether", back: "Olup olmadığı" },
  { id: "mem-110", front: "Request", back: "Rica / talep" },
  { id: "mem-111", front: "Third conditional", back: "Üçüncü koşul yapısı" },
  { id: "mem-112", front: "Regret", back: "Pişmanlık / pişman olmak" },
  { id: "mem-113", front: "Auxiliary verb", back: "Yardımcı fiil" },
  { id: "mem-114", front: "Main verb", back: "Ana fiil" }
];

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

const SOURCE_MEMORY_CARDS = [
  { id: "mem-127", front: "Heal", back: "İyileştirmek" },
  { id: "mem-128", front: "Unusual", back: "Alışılmadık" },
  { id: "mem-129", front: "Punishment", back: "Ceza" },
  { id: "mem-130", front: "On purpose", back: "Bilerek / kasten" },
  { id: "mem-131", front: "Deny", back: "İnkar etmek" },
  { id: "mem-132", front: "Be allowed to", back: "İzinli olmak" },
  { id: "mem-133", front: "According to", back: "-e göre" },
  { id: "mem-134", front: "Bride", back: "Gelin" },
  { id: "mem-135", front: "Opportunity", back: "Fırsat" },
  { id: "mem-136", front: "Ticklish", back: "Gıdıklanan / gıdıklanmaya hassas" },
  { id: "mem-137", front: "Reputation", back: "İtibar / ün" },
  { id: "mem-138", front: "Unconscious", back: "Bilinci kapalı" },
  { id: "mem-139", front: "Make up", back: "Barışmak / uydurmak" },
  { id: "mem-140", front: "Unaware", back: "Habersiz / farkında olmayan" },
  { id: "mem-141", front: "Trust", back: "Güvenmek / güven" },
  { id: "mem-142", front: "Postpone", back: "Ertelemek" },
  { id: "mem-143", front: "Fall out", back: "Kavga etmek / arası bozulmak" },
  { id: "mem-144", front: "Lawyer", back: "Avukat" },
  { id: "mem-145", front: "Take on", back: "Üstlenmek" },
  { id: "mem-146", front: "Reject", back: "Reddetmek" },
  { id: "mem-147", front: "Undisputed", back: "Tartışmasız" },
  { id: "mem-148", front: "Aim", back: "Amaç / hedef" },
  { id: "mem-149", front: "Keen on", back: "Meraklı / düşkün" },
  { id: "mem-150", front: "Upmarket", back: "Lüks / üst segment" },
  { id: "mem-151", front: "Eager to", back: "Hevesli / istekli" },
  { id: "mem-152", front: "Soak up", back: "Tadını çıkarmak / içine çekmek" },
  { id: "mem-153", front: "Hotelier", back: "Otelci" },
  { id: "mem-154", front: "Frugal", back: "Tutumlu" },
  { id: "mem-155", front: "At the bottom of", back: "En altında" },
  { id: "mem-156", front: "Achievement", back: "Başarı" },
  { id: "mem-157", front: "Remote", back: "Uzak / kumanda" },
  { id: "mem-158", front: "Follower", back: "Takipçi" },
  { id: "mem-159", front: "Tweet", back: "Tweet atmak / paylaşmak" },
  { id: "mem-160", front: "High-speed train", back: "Yüksek hızlı tren" },
  { id: "mem-161", front: "One-way flight", back: "Tek yön uçuş" },
  { id: "mem-162", front: "Final leg", back: "Yolculuğun son bölümü" },
  { id: "mem-163", front: "Make it", back: "Başarmak / varmak" },
  { id: "mem-164", front: "Big hug", back: "Sıkı sarılma" },
  { id: "mem-165", front: "Item", back: "Ürün / madde" },
  { id: "mem-166", front: "Security screener", back: "Güvenlik kontrol görevlisi" },
  { id: "mem-167", front: "Go on", back: "Devam etmek" },
  { id: "mem-168", front: "Particular", back: "Titiz / seçici" },
  { id: "mem-169", front: "Call off", back: "İptal etmek" },
  { id: "mem-170", front: "Get on with", back: "İyi geçinmek" },
  { id: "mem-171", front: "Meet expectations", back: "Beklentileri karşılamak" },
  { id: "mem-172", front: "Get over", back: "Atlatmak / aşmak" },
  { id: "mem-173", front: "Accused of", back: "İle suçlanmış" },
  { id: "mem-174", front: "Run into", back: "Tesadüfen karşılaşmak" },
  { id: "mem-175", front: "Due to", back: "Nedeniyle" },
  { id: "mem-176", front: "Prevent from", back: "Alıkoymak / engellemek" },
  { id: "mem-177", front: "Afford", back: "Parası yetmek" },
  { id: "mem-178", front: "Annoy", back: "Rahatsız etmek" },
  { id: "mem-179", front: "Set up", back: "Kurmak" },
  { id: "mem-180", front: "Keep in touch", back: "İletişimde kalmak" },
  { id: "mem-181", front: "Remind of", back: "Hatırlatmak / benzetmek" },
  { id: "mem-182", front: "As soon as", back: "-er ermez" },
  { id: "mem-183", front: "Hand in", back: "Teslim etmek" },
  { id: "mem-184", front: "Apologize for", back: "İçin özür dilemek" },
  { id: "mem-185", front: "Interested in", back: "İlgili / meraklı" },
  { id: "mem-186", front: "Look up", back: "Sözlükte aramak" },
  { id: "mem-187", front: "Make a decision", back: "Karar vermek" },
  { id: "mem-188", front: "Would rather", back: "Tercih etmek" },
  { id: "mem-189", front: "Good at", back: "-de iyi" },
  { id: "mem-190", front: "Save money", back: "Para biriktirmek" },
  { id: "mem-191", front: "Bizarre", back: "Çok tuhaf" },
  { id: "mem-192", front: "A wide range", back: "Geniş yelpaze" },
  { id: "mem-193", front: "Subtle shade", back: "İnce renk tonu" },
  { id: "mem-194", front: "Slight hint", back: "Hafif ipucu / ton" },
  { id: "mem-195", front: "Torch", back: "El feneri" },
  { id: "mem-196", front: "Reveal", back: "Ortaya çıkarmak" },
  { id: "mem-197", front: "Synchronized", back: "Eş zamanlı" },
  { id: "mem-198", front: "Consultation", back: "Danışma / görüşme" },
  { id: "mem-199", front: "Promote", back: "Desteklemek / geliştirmek" },
  { id: "mem-200", front: "Treatment", back: "Tedavi" },
  { id: "mem-201", front: "Analysis", back: "Analiz" },
  { id: "mem-202", front: "Exchange", back: "Değiş tokuş yapmak" },
  { id: "mem-203", front: "Support yourself", back: "Kendi geçimini sağlamak" },
  { id: "mem-204", front: "Civil partner", back: "Resmi partner" },
  { id: "mem-205", front: "Qualify for", back: "Hak kazanmak / şartları sağlamak" },
  { id: "mem-206", front: "Restriction", back: "Kısıtlama" },
  { id: "mem-207", front: "Remote work", back: "Uzaktan çalışma" },
  { id: "mem-208", front: "Commute", back: "İşe gidip gelmek" },
  { id: "mem-209", front: "Gig economy", back: "Kısa süreli iş ekonomisi" },
  { id: "mem-210", front: "Automation", back: "Otomasyon" },
  { id: "mem-211", front: "Lifelong learning", back: "Hayat boyu öğrenme" },
  { id: "mem-212", front: "Adapt", back: "Uyum sağlamak" },
  { id: "mem-213", front: "Potential buyer", back: "Potansiyel alıcı" },
  { id: "mem-214", front: "Feedback", back: "Geri bildirim" },
  { id: "mem-215", front: "Reliable review", back: "Güvenilir yorum" }
];

MEMORIZATION_CARDS.push(...SOURCE_MEMORY_CARDS);

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

RECAP_CARDS.push(
  {
    unit: "Reading",
    title: "Online Reviews",
    formula: "main idea + reference + inference",
    rule: "Metnin ortak mesajı online yorumların müşteri kararlarını etkilediğidir. this / it gibi referanslarda bir önceki fikre dön.",
    example: "Online reviews influence customer decisions and force companies to improve.",
    trap: "Fake reviews kısmı 'all reviews are reliable' sonucunu değil, dikkatli okuma gerektiğini gösterir."
  },
  {
    unit: "Reading",
    title: "Changing World of Work",
    formula: "remote work + gig economy + automation + lifelong learning",
    rule: "Metin değişimi dengeli anlatır: avantajlar ve zorluklar birlikte gelir.",
    example: "Workers need to develop new skills to remain competitive.",
    trap: "Yazar değişimi tamamen kötü veya tamamen iyi demiyor; both advantages and challenges."
  },
  {
    unit: "Vocabulary",
    title: "Context Vocabulary",
    formula: "meaning + collocation + grammar pattern",
    rule: "Kelimeleri tek başına değil kalıpla çalış: keen on + V-ing, eager to + V1, prevent from + V-ing.",
    example: "She is keen on learning languages. / The noise prevented me from concentrating.",
    trap: "keen on learn değil; keen on learning."
  }
);

const TOTAL = TOPICS.length;
let QUESTION_BANK = [];
let questionBankLoaded = false;
const STATIC_QUIZ_COUNT = KONU_LISTESI.reduce((sum, topic) => sum + Number(topic.quizCount || 0), 0);

function getQuestionBankDisplayCount() {
  return QUESTION_BANK.length || STATIC_QUIZ_COUNT;
}

async function ensureQuestionBankLoaded() {
  if (questionBankLoaded && QUESTION_BANK.length) return QUESTION_BANK;
  const quizEntries = await loadAllQuizzes(TOPICS.map((topic) => topic.id));
  const nextBank = [];
  quizEntries.forEach(({ topicId, questions }) => {
    const topic = getTopicById(topicId);
    if (!topic) return;
    topic.quiz = Array.isArray(questions) ? questions : [];
    topic.quizCount = topic.quiz.length;
    topic.quiz.forEach((question, index) => {
      nextBank.push({
        ...question,
        topicId: topic.id,
        topicTitle: topic.title,
        unit: topic.unit,
        uid: topic.id + "-" + index
      });
    });
  });
  QUESTION_BANK = nextBank;
  questionBankLoaded = true;
  window.QUESTION_BANK = QUESTION_BANK;
  return QUESTION_BANK;
}

window.ensureQuestionBankLoaded = ensureQuestionBankLoaded;
window.QUESTION_BANK = QUESTION_BANK;
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
  const toggleBtn = document.querySelector(".menu-toggle");
  if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
}

function navigate(pageId) {
  const isLeavingMemoryHub = pageId !== "memoryhub" && document.getElementById("memoryhub")?.classList.contains("active");
  if (isLeavingMemoryHub && typeof stopMemorySpeech === "function") stopMemorySpeech();

  const isRavzaLingoPage = pageId === "ravzalingo";
  document.documentElement.classList.toggle("is-ravzalingo-page", isRavzaLingoPage);
  document.body.classList.toggle("is-ravzalingo-page", isRavzaLingoPage);
  document.body.classList.toggle("rlz5-page-active", isRavzaLingoPage);
  document.body.classList.toggle("studydetail-active", pageId === "studydetail");

  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  document.querySelectorAll(".nav-links button").forEach((button) => button.classList.remove("active"));

  const page = document.getElementById(pageId);
  if (page) {
    page.classList.add("active");
  }

  const navMap = {
    dashboard: "nav-dashboard",
    ravzalingo: "nav-ravzalingo",
    studyhub: "nav-studyhub",
    studydetail: "nav-studyhub",
    memoryhub: "nav-memoryhub",
    fillgaphub: "nav-fillgaphub",
    quizhub: "nav-quizhub",
    quizdetail: "nav-quizhub",
    examcenter: "nav-examcenter",
    recap: "nav-recap"
  };

  const navButton = document.getElementById(navMap[pageId]);
  if (navButton) {
    navButton.classList.add("active");
  }

  closeMobileMenu();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toggleMenu() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  const isOpen = !sidebar.classList.contains("open");
  sidebar.classList.toggle("open", isOpen);
  document.body.classList.toggle("nav-open", isOpen);
  const toggleBtn = document.querySelector(".menu-toggle");
  if (toggleBtn) toggleBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

if (typeof document !== "undefined" && !window.__RAVZA_ESC_HOOKED__) {
  window.__RAVZA_ESC_HOOKED__ = true;
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const sidebar = document.getElementById("sidebar");
    if (sidebar?.classList.contains("open")) { closeMobileMenu(); return; }
    const themeSheet = document.getElementById("theme-sheet");
    if (themeSheet?.classList.contains("open") && typeof window.closeThemeSheet === "function") { window.closeThemeSheet(); return; }
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 1024) closeMobileMenu();
  });
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

  if (q.includes("boşluk") || q.includes("bosluk") || q.includes("gap") || q.includes("fill")) {
    navigate("fillgaphub");
    return;
  }

  if (q.includes("ravzalingo") || q.includes("duolingo") || q.includes("lingo")) {
    navigate("ravzalingo");
    return;
  }

  if (q.includes("hızlı") || q.includes("hizli") || q.includes("recap") || q.includes("tekrar")) {
    navigate("recap");
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
  if (statBank) statBank.textContent = String(getQuestionBankDisplayCount());

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
  if (examBankCount) examBankCount.textContent = String(getQuestionBankDisplayCount());
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
          </div>
          <div>
            <h3 class="topic-title">${safeText(topic.title)}</h3>
            <p>${safeText(topic.subtitle)}</p>
          </div>
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
          </div>
          <div>
            <h3 class="topic-title">${safeText(topic.title)} Quiz</h3>
            <p>${topic.quizCount || topic.quiz.length || 0} soru · ${safeText(topic.subtitle)}</p>
          </div>
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
    <div class="study-detail-panel">

      <section class="study-detail-hero">
        <div class="study-detail-top">
          <button class="ghost-btn detail-back-btn" onclick="navigate('studyhub')">← Çalışma Merkezine Dön</button>
          <div class="topic-meta detail-badges">
            <span class="unit-badge">${safeText(topic.unit)}</span>
            <span class="difficulty-chip ${topic.difficulty}">${difficultyLabel}</span>
            <span class="status-chip ${done ? "done" : "waiting"}">${done ? "Tamamlandı" : "Çalışılıyor"}</span>
          </div>
        </div>
        <div class="study-detail-title-block">
          <h2 class="detail-title">${safeText(topic.title)}</h2>
          <p class="detail-subtitle">${safeText(topic.subtitle)}</p>
        </div>
      </section>

      <section class="study-detail-content-card">
        <div class="study-content">
          ${topic.summaryHtml}
          <div class="content-card critical-card">
            <h3>Kritik noktalar</h3>
            <div class="keypoint-list">
              ${topic.keyPoints.map((point) => `<div class="keypoint-item">${safeText(point)}</div>`).join("")}
            </div>
          </div>
        </div>
      </section>

      <div class="study-detail-actionbar">
        <button class="mark-btn ${done ? "done" : ""}" onclick="toggleStudyDone('${topic.id}', true)">
          ${done ? "☑️ Tamamlandı" : "✅ Çalışmayı Bitirdim"}
        </button>
        <button class="secondary-btn detail-quiz-btn" onclick="openQuizTopic('${topic.id}')">
          → İlgili Quize Geç
        </button>
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
        <p class="quiz-subtitle">${topic.quizCount || topic.quiz.length || 0} soruluk ayrı quiz alanı. Notlar çalışma merkezinde kaldı; burada sadece soru çözersin.</p>
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
  stopMemorySpeech();

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

  attachMemorySpeakButtons(grid, filtered);
}

function updateMemorySpeakButtonState(cardEl) {
  const button = cardEl?.querySelector(".memory-speak-btn");
  if (!button) return;
  const isBackVisible = cardEl.classList.contains("flipped");
  button.dataset.speakText = isBackVisible ? button.dataset.speakBack : button.dataset.speakFront;
  button.dataset.speakLang = isBackVisible ? "tr" : "en";
  button.classList.toggle("is-back-side", isBackVisible);
  button.setAttribute(
    "aria-label",
    isBackVisible ? "Türkçe anlamı sesli oku" : "İngilizce kelimeyi sesli oku"
  );
}

function createMemorySpeakButton(card) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "memory-speak-btn";
  button.dataset.speakFront = card.front || "";
  button.dataset.speakBack = card.back || "";
  button.dataset.speakText = card.front || "";
  button.dataset.speakLang = "en";
  button.setAttribute("aria-label", "İngilizce kelimeyi sesli oku");
  button.textContent = "🔊";
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    updateMemorySpeakButtonState(button.closest(".memory-card"));
    speakMemoryCardText(event, button.dataset.speakText, button.dataset.speakLang);
  });
  return button;
}

function attachMemorySpeakButtons(grid, cards) {
  const cardsById = new Map(cards.map((card) => [String(card.id), card]));
  grid.querySelectorAll(".memory-card[data-card-id]").forEach((cardEl) => {
    const card = cardsById.get(cardEl.getAttribute("data-card-id"));
    if (!card) return;

    if (!cardEl.querySelector(".memory-speak-btn")) {
      cardEl.appendChild(createMemorySpeakButton(card));
    }
    updateMemorySpeakButtonState(cardEl);
  });
}

function toggleMemoryCard(cardId) {
  const card = document.querySelector(`[data-card-id="${cardId}"]`);
  if (!card) return;
  stopMemorySpeech();
  card.classList.toggle("flipped");
  updateMemorySpeakButtonState(card);
}

function handleMemoryCardKey(event, cardId) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    toggleMemoryCard(cardId);
  }
}

function getSpeechVoice(langType) {
  if (!window.speechSynthesis) return null;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null;
  if (langType === "en") {
    return (
      voices.find((v) => v.lang === "en-US") ||
      voices.find((v) => v.lang === "en-GB") ||
      voices.find((v) => v.lang.startsWith("en")) ||
      null
    );
  }
  if (langType === "tr") {
    return (
      voices.find((v) => v.lang === "tr-TR") ||
      voices.find((v) => v.lang.startsWith("tr")) ||
      null
    );
  }
  return null;
}

function speakMemoryCardText(event, text, langType) {
  event.preventDefault();
  event.stopPropagation();
  if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") {
    console.warn("Web Speech API bu tarayıcıda desteklenmiyor.");
    return;
  }
  const spokenText = String(text || "").trim();
  if (!spokenText) return;
  stopMemorySpeech();
  const utterance = new SpeechSynthesisUtterance(spokenText);
  utterance.lang = langType === "tr" ? "tr-TR" : "en-US";
  utterance.rate = 0.9;
  utterance.pitch = 1;
  utterance.volume = 1;
  const voice = getSpeechVoice(langType);
  if (voice) utterance.voice = voice;
  const btn = event.target.closest(".memory-speak-btn") || event.currentTarget;
  if (btn) btn.classList.add("speaking");
  utterance.onend = () => { if (btn) btn.classList.remove("speaking"); };
  utterance.onerror = () => { if (btn) btn.classList.remove("speaking"); };
  speechSynthesis.speak(utterance);
}

function stopMemorySpeech() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  document.querySelectorAll(".memory-speak-btn.speaking").forEach((btn) => {
    btn.classList.remove("speaking");
  });
}

if (typeof window !== "undefined" && !window.__MEMORY_SPEECH_STOP_HOOKED__) {
  window.__MEMORY_SPEECH_STOP_HOOKED__ = true;
  window.addEventListener("pagehide", stopMemorySpeech);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopMemorySpeech();
  });
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

async function startExam(questionCount, durationMinutes) {
  try {
    await ensureQuestionBankLoaded();
  } catch (error) {
    console.error(error);
    alert("Quiz soruları yüklenemedi.");
    return;
  }
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
window.speakMemoryCardText = speakMemoryCardText;
window.stopMemorySpeech = stopMemorySpeech;
window.setMemoryPracticeMode = setMemoryPracticeMode;
window.submitMemoryPracticeAnswer = submitMemoryPracticeAnswer;
window.nextMemoryPracticeQuestion = nextMemoryPracticeQuestion;
window.renderQuizHub = renderQuizHub;
window.updateDashboardStats = updateDashboardStats;
window.renderMemoryPractice = renderMemoryPractice;
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
window.__saveProgressToFirebase = saveProgressToFirebase;

async function bootLegacyApp() {
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
}

window.__bootLegacyApp = bootLegacyApp;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootLegacyApp, { once: true });
}

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


/* Topic continuation content moved to content/topics/*.html and data/quizzes/*.js. */

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

  async function startExamPatched(questionCount, durationMinutes) {
    await ensureQuestionBankLoaded();
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

  window.expandQuestionBankTo = expandQuestionBankTo;
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
    let whyCorrect = `Doğru cevap "${correctText}" çünkü cümlenin anlamına ve konu kuralına en uygun seçenek budur.`;
    let whySelected = "";
    let tip = "Benzer sorularda önce anahtar kelimeyi, sonra cümlenin zamanını ve anlamını kontrol et.";

    if (lowerTopic.includes("future") || /will|going to|shall|tomorrow|cloud|plan|future/i.test(questionText)) {
      rule = "Future Forms sorularında önce kararın ne zaman verildiğine ve elimizde kanıt olup olmadığına bakılır.";
      whyCorrect = `"${correctText}" doğru cevaptır. Çünkü cümlede gelecek anlamı vardır ve yapı, bağlama göre doğru gelecek zaman formunu ister.`;
      tip = "Kanıt varsa genellikle be going to; anlık karar, söz verme veya teklif varsa will/shall; ayarlanmış plan varsa present continuous kullanılır.";
      if (/cloud|look at|evidence|kanıt/i.test(questionText + " " + baseExplanation)) {
        whyCorrect = `"${correctText}" doğru cevaptır. Çünkü cümlede görünen bir kanıt vardır. "Look at those black clouds" gibi ifadeler yağmurun olacağına dair kanıt verdiği için "be going to" kullanılır.`;
        tip = "İpucu: Gözle görülen kanıt = be going to. Sadece kişisel tahmin = will olabilir.";
      }
    } else if (lowerTopic.includes("passive") || lowerQuestion.includes("passive")) {
      rule = "Passive Voice sorularında odak eylemi yapan kişi değil, eylemden etkilenen nesnedir. Yapı genelde be + V3 şeklindedir.";
      whyCorrect = `"${correctText}" doğru cevaptır. Çünkü cümlenin passive karşılığı yapılırken nesne başa alınır ve fiil uygun zamanda be + V3 yapılır.`;
      tip = "Active cümledeki object passive cümlede subject olur. Present Simple passive için is/are + V3, Past Simple passive için was/were + V3 kullanılır.";
    } else if (lowerTopic.includes("present tense") || lowerTopic.includes("present tenses")) {
      rule = "Present Tenses sorularında fiilin durum fiili mi, eylem fiili mi olduğuna ve cümlenin şu an mı, genel alışkanlık mı, plan mı anlattığına bakılır.";
      whyCorrect = `"${correctText}" doğru cevaptır. Çünkü cümledeki zaman ve anlam bu present tense kullanımını gerektirir.`;
      tip = "Stative verbs genelde continuous almaz. Timetable için present simple, ayarlanmış gelecek plan için present continuous kullanılır.";
    } else if (lowerTopic.includes("condition")) {
      rule = "Conditional sorularında if cümlesinin zamanı ve sonuç cümlesindeki yardımcı yapı birlikte kontrol edilir.";
      whyCorrect = `"${correctText}" doğru cevaptır. Çünkü bu cümledeki koşul yapısı doğru zaman uyumunu ister.`;
      tip = "1st conditional: if + present simple, will + verb1. 2nd conditional: if + past simple, would + verb1. 3rd conditional: if + had V3, would have V3.";
    } else if (lowerTopic.includes("perfect")) {
      rule = "Perfect tense sorularında eylemin geçmişle bağlantısı, süresi ve şu ana etkisi kontrol edilir.";
      whyCorrect = `"${correctText}" doğru cevaptır. Çünkü cümle geçmişte başlayıp şimdiyle bağlantısı olan bir anlam taşıyor.`;
      tip = "for süreyi, since başlangıç noktasını gösterir. already/yet/just gibi kelimeler present perfect ile sık kullanılır.";
    } else if (lowerTopic.includes("modal") || lowerTopic.includes("can") || lowerTopic.includes("could") || lowerTopic.includes("able")) {
      rule = "Modal sorularında anlam çok önemlidir: yetenek, izin, zorunluluk, yasak veya mantıksal çıkarım olabilir.";
      whyCorrect = `"${correctText}" doğru cevaptır. Çünkü cümlenin anlamı bu modal yapıyı gerektirir.`;
      tip = "can şimdiki yetenek/izin, could geçmiş genel yetenek, be able to farklı zamanlarda yetenek için kullanılır. must güçlü çıkarım, can't imkansızlık anlatır.";
    } else if (lowerTopic.includes("phrasal")) {
      rule = "Phrasal verb sorularında fiil + particle birlikte düşünülür. Bazı phrasal verbler ayrılabilir, bazıları ayrılamaz.";
      whyCorrect = `"${correctText}" doğru cevaptır. Çünkü bu phrasal verb cümledeki anlamı doğru şekilde tamamlar.`;
      tip = "Nesne zamirse ayrılabilen phrasal verblerde zamir araya gelir: turn it off, call her back.";
    } else if (lowerTopic.includes("pronoun")) {
      rule = "Pronoun sorularında özne, nesne ve iyelik görevleri ayrılmalıdır.";
      whyCorrect = `"${correctText}" doğru cevaptır. Çünkü bu cümlede kelime nesne/iyelik görevine uygun biçimde kullanılmalıdır.`;
      tip = "Preposition sonrasında object pronoun kullanılır: to her, for them, with us.";
    } else if (lowerTopic.includes("adjective")) {
      rule = "Adjective sorularında sıfatın isimden önce geldiği, comparative/superlative yapısı ve one/ones kullanımı kontrol edilir.";
      whyCorrect = `"${correctText}" doğru cevaptır. Çünkü sıfat yapısı cümlenin karşılaştırma veya tanımlama anlamına uygundur.`;
      tip = "Tekil sayılabilir isimde a/an gerekir. Büyük fark için much + comparative, küçük fark için a bit + comparative kullanılır.";
    } else if (lowerTopic.includes("preposition")) {
      rule = "Preposition sorularında fiil/sıfat ile gelen sabit edat ve cümlenin hareket mi konum mu anlattığı kontrol edilir.";
      whyCorrect = `"${correctText}" doğru cevaptır. Çünkü bu kelime cümlenin istediği edat veya hareket anlamını verir.`;
      tip = "Preposition sonrası genelde -ing gelir. discuss, enter, marry gibi bazı fiiller ekstra preposition almaz.";
    } else if (lowerTopic.includes("reported")) {
      rule = "Reported Speech sorularında zaman kayması, kişi zamirleri ve soru kelime sırası kontrol edilir.";
      whyCorrect = `"${correctText}" doğru cevaptır. Çünkü aktarılmış cümlede doğru zaman ve düz cümle sırası kullanılmalıdır.`;
      tip = "Reported question içinde do/does/did kullanılmaz; kelime sırası düz cümle gibi olur: where I lived.";
    }

    if (item.status === "correct") {
      whySelected = `Sen "${selectedText}" seçtin ve bu doğru. Cümledeki anahtar bilgi doğru yapıyı seçmeni sağlamış.`;
    } else if (item.status === "empty") {
      whySelected = "Bu soruyu boş bıraktın. Boş sorularda önce seçenekleri elemek iyi olur: cümlenin zamanı, anlamı ve anahtar kelimesiyle uyuşmayan seçenekleri çıkar.";
    } else {
      whySelected = `Sen "${selectedText}" seçtin; ancak bu seçenek cümlenin istediği dilbilgisi/anlam kuralıyla tam uyuşmuyor. Doğru cevap "${correctText}" olmalı.`;
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
        correctReason = `Cümlede görünen kanıt vardır. Bu yüzden geleceğe dair tahmin "be going to" yapısıyla verilir.`;
        wrongReason = `Bu seçenek görünen kanıta dayalı gelecek tahmini mantığını tam karşılamaz. Bu bağlamda "${correctText}" daha uygundur.`;
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
      return `Bu şık senin seçimin, fakat doğru değildir. Neden olmaz? ${wrongReason} Bu yüzden doğru cevap "${correctText}" olmalıdır.`;
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

  async function enhancedStartExam(questionCount, durationMinutes) {
    try {
      await ensureQuestionBankLoaded();
    } catch (error) {
      console.error(error);
      alert("Quiz soruları yüklenemedi.");
      return;
    }
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
    s = s.replace(/[''''`´]/g, "'");
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
    if (typeof window.stopMemorySpeech === "function") window.stopMemorySpeech();
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
        wrongReason = `Bu seçenek görünen kanıta dayalı gelecek tahmini mantığını tam karşılamaz. Bu bağlamda "${correctText}" daha uygundur.`;
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
    if (isSelected) return `Bu şık senin seçimin, fakat doğru değildir. ${wrongReason} Bu yüzden doğru cevap "${correctText}" olmalıdır.`;
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
      { id: "fg-vocab-2", sentence: "The teacher did a ________ to learn students' favourite books.", answer: "survey", hintType: "noun", hintFirstLetter: "s", hintTr: "anket", explanation: "Survey, insanlara soru sorarak bilgi toplama yöntemidir." },
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
      { id: "fg-obj-3", sentence: "Please give the keys to ________.", answer: "me", hintType: "object pronoun", hintFirstLetter: "m", hintTr: "bana", explanation: "Preposition to'dan sonra object pronoun gelir: to me." },
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
      { id: "fg-adj-3", sentence: "That is the ________ film I have ever seen.", answer: "worst", hintType: "superlative", hintFirstLetter: "w", hintTr: "en kötü", explanation: "Bad kelimesinin superlative hali worst'tür." },
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
      { id: "fg-pos-5", sentence: "Emma and Mia's ________ is very modern.", answer: "house", hintType: "noun", hintFirstLetter: "h", hintTr: "ev", explanation: "İki kişi aynı şeye sahipse 's ikinci isme gelir: Emma and Mia's house." }
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
      { id: "fg-past-5", sentence: "I didn't ________ to like broccoli.", answer: "use", hintType: "negative used to", hintFirstLetter: "u", hintTr: "eskiden", explanation: "Olumsuzda didn't use to kullanılır; used değil." }
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
      { id: "fg-prep-5", sentence: "I am looking forward to ________ you.", answer: "seeing", hintType: "verb + ing", hintFirstLetter: "s", hintTr: "görmeyi", explanation: "Preposition to'dan sonra verb + ing gelir: looking forward to seeing." }
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
      { id: "fg-cond12-3", sentence: "If I ________ you, I wouldn't do that.", answer: "were", hintType: "advice phrase", hintFirstLetter: "w", hintTr: "senin yerinde olsam", explanation: "Tavsiye verirken If I were you kalıbı kullanılır." },
      { id: "fg-cond12-4", sentence: "We can't help you ________ you tell us the problem.", answer: "unless", hintType: "if not", hintFirstLetter: "u", hintTr: "-mezsen", explanation: "Unless = if not anlamındadır." },
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
    description: "Have to, must, mustn't, don't have to ve should farklarını çalış.",
    items: [
      { id: "fg-mod-1", sentence: "I ________ buy a new fridge last week.", answer: "had to", hintType: "past obligation", hintFirstLetter: "h", hintTr: "zorunda kaldım", explanation: "Geçmiş zorunluluk için had to kullanılır." },
      { id: "fg-mod-2", sentence: "You ________ spill anything on the sofa.", answer: "mustn't", hintType: "prohibition", hintFirstLetter: "m", hintTr: "yapmamalısın/yasak", explanation: "Mustn't yasak veya güçlü uyarı bildirir." },
      { id: "fg-mod-3", sentence: "We ________ be at the airport until 5.00.", answer: "don't have to", hintType: "no necessity", hintFirstLetter: "d", hintTr: "zorunda değiliz", explanation: "Don't have to gerekli değil anlamına gelir." },
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
      { id: "fg-abil-4", sentence: "She ________ be Kate. Kate is in Italy.", answer: "can't", hintType: "negative deduction", hintFirstLetter: "c", hintTr: "olamaz", explanation: "Can't güçlü olumsuz tahmin veya imkânsızlık bildirir." },
      { id: "fg-abil-5", sentence: "I like ________ able to read quickly.", answer: "being", hintType: "gerund", hintFirstLetter: "b", hintTr: "olabilmek", explanation: "Like sonrası burada gerund yapı kullanılır: being able to." }
    ]
  },
  {
    id: "fg-phrasal-verbs", title: "Phrasal Verbs", category: "Phrasal Verbs", topicId: "phrasal", level: "Hard",
    description: "Separable, inseparable ve pronoun kuralını çalış.",
    items: [
      { id: "fg-phr-1", sentence: "Your phone is ringing. Please turn ________ off.", answer: "it", hintType: "pronoun rule", hintFirstLetter: "i", hintTr: "onu", explanation: "Separable phrasal verb'de pronoun araya girer: turn it off." },
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
      { id: "fg-rep-1", sentence: "She said that she ________ find her purse.", answer: "couldn't", hintType: "backshift", hintFirstLetter: "c", hintTr: "bulamadı", explanation: "Can reported speech'te could olur." },
      { id: "fg-rep-2", sentence: "He asked me where I ________.", answer: "lived", hintType: "reported question", hintFirstLetter: "l", hintTr: "yaşadım", explanation: "Reported question'da düz cümle sırası kullanılır." },
      { id: "fg-rep-3", sentence: "They asked us ________ fill in the form.", answer: "to", hintType: "request", hintFirstLetter: "t", hintTr: "-mek", explanation: "Request yapısı ask + object + to infinitive şeklindedir." },
      { id: "fg-rep-4", sentence: "He said he would see me the ________ day.", answer: "next", hintType: "time change", hintFirstLetter: "n", hintTr: "ertesi", explanation: "Tomorrow reported speech'te the next day olur." },
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
      { id: "fg-third-4", sentence: "If they had been invited, they would have ________.", answer: "gone", hintType: "third conditional", hintFirstLetter: "g", hintTr: "giderlerdi", explanation: "Go fiilinin V3 hali gone'dır." },
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

FILL_GAP_EXERCISES.push(
  {
    id: "fg-reading-reviews",
    title: "Reading 1 / Online Reviews",
    category: "Vocabulary",
    topicId: "readingreviews",
    level: "Medium",
    description: "Reading 1 metnindeki ana kelimeleri cümle içinde tamamla.",
    items: [
      { id: "fg-read1-1", sentence: "Customers often ________ other users more than advertisements.", answer: "trust", hintType: "reading vocabulary", hintFirstLetter: "t", hintTr: "güvenmek", explanation: "Reading 1'in ilk paragrafında trust, müşterilerin diğer kullanıcıların yorumlarına güvenmesini anlatır." },
      { id: "fg-read1-2", sentence: "A single negative review can ________ many potential buyers.", answer: "affect", hintType: "verb", hintFirstLetter: "a", hintTr: "etkilemek", explanation: "Affect = influence, yani etkilemek." },
      { id: "fg-read1-3", sentence: "Businesses must pay more attention to customer ________.", answer: "satisfaction", hintType: "noun", hintFirstLetter: "s", hintTr: "memnuniyet", explanation: "Customer satisfaction, müşteri memnuniyeti demektir." },
      { id: "fg-read1-4", sentence: "Not all reviews are ________.", answer: "reliable", hintType: "adjective", hintFirstLetter: "r", hintTr: "güvenilir", explanation: "Metin bazı yorumların sahte olabileceğini, bu yüzden hepsinin güvenilir olmadığını söyler." },
      { id: "fg-read1-5", sentence: "Online reviews have become an ________ part of modern shopping.", answer: "essential", hintType: "adjective", hintFirstLetter: "e", hintTr: "çok önemli", explanation: "Essential, gerekli/çok önemli anlamındadır." }
    ]
  },
  {
    id: "fg-reading-work",
    title: "Reading 2 / Changing World of Work",
    category: "Vocabulary",
    topicId: "readingwork",
    level: "Medium",
    description: "Remote work, gig economy ve automation kelimelerini reading bağlamında çalış.",
    items: [
      { id: "fg-read2-1", sentence: "The rise of ________ work is one of the biggest changes in recent years.", answer: "remote", hintType: "adjective", hintFirstLetter: "r", hintTr: "uzaktan", explanation: "Remote work, uzaktan çalışma anlamındadır." },
      { id: "fg-read2-2", sentence: "Employees can save time because they do not need to ________ every day.", answer: "commute", hintType: "verb", hintFirstLetter: "c", hintTr: "işe gidip gelmek", explanation: "Commute, ev ile iş arasında gidip gelmek demektir." },
      { id: "fg-read2-3", sentence: "Some employees feel ________ because they do not interact face-to-face.", answer: "isolated", hintType: "adjective", hintFirstLetter: "i", hintTr: "yalnız", explanation: "Isolated, yalnız/izole hissetmek demektir." },
      { id: "fg-read2-4", sentence: "In the gig ________, people take short-term jobs or projects.", answer: "economy", hintType: "noun phrase", hintFirstLetter: "e", hintTr: "ekonomi", explanation: "Gig economy, kısa süreli iş/proje sistemidir." },
      { id: "fg-read2-5", sentence: "Automation and artificial intelligence are replacing some ________ jobs.", answer: "traditional", hintType: "adjective", hintFirstLetter: "t", hintTr: "geleneksel", explanation: "Metinde automation'ın bazı traditional jobs türlerini değiştirdiği anlatılır." },
      { id: "fg-read2-6", sentence: "Workers need to ________ to new technologies.", answer: "adapt", hintType: "verb", hintFirstLetter: "a", hintTr: "uyum sağlamak", explanation: "Adapt to, bir şeye uyum sağlamak demektir." }
    ]
  },
  {
    id: "fg-source-vocabulary",
    title: "Source Vocabulary / Mixed Practice",
    category: "Vocabulary",
    topicId: "vocabcontext",
    level: "Medium",
    description: "Fill in the gaps, Vocabulary Practice ve Vocab Test kaynaklarındaki kelimelerle karışık pratik.",
    items: [
      { id: "fg-src-1", sentence: "The result of the match was ________; everyone agreed on it.", answer: "undisputed", hintType: "adjective", hintFirstLetter: "u", hintTr: "tartışmasız", explanation: "Undisputed, kimsenin itiraz etmediği sonuçlar için kullanılır." },
      { id: "fg-src-2", sentence: "She is very keen ________ learning about different cultures.", answer: "on", hintType: "preposition", hintFirstLetter: "o", hintTr: "-e meraklı", explanation: "Kalıp: keen on + noun/V-ing." },
      { id: "fg-src-3", sentence: "I am eager ________ start my new course next week.", answer: "to", hintType: "verb pattern", hintFirstLetter: "t", hintTr: "-meye hevesli", explanation: "Kalıp: eager to + verb1." },
      { id: "fg-src-4", sentence: "We had to ________ our trip because of the bad weather.", answer: "call off", hintType: "phrasal verb", hintFirstLetter: "c", hintTr: "iptal etmek", explanation: "Call off, plan/seyahat/toplantı iptal etmek demektir." },
      { id: "fg-src-5", sentence: "The noise prevented me from ________.", answer: "concentrating", hintType: "preposition + ing", hintFirstLetter: "c", hintTr: "odaklanmak", explanation: "Prevent someone from + V-ing kalıbı kullanılır." },
      { id: "fg-src-6", sentence: "Please ________ the form before submitting it.", answer: "fill in", hintType: "phrasal verb", hintFirstLetter: "f", hintTr: "doldurmak", explanation: "Fill in a form, form doldurmak demektir." },
      { id: "fg-src-7", sentence: "Let's ________ the meeting until tomorrow.", answer: "postpone", hintType: "verb", hintFirstLetter: "p", hintTr: "ertelemek", explanation: "Postpone, bir etkinliği daha sonraya almak demektir." },
      { id: "fg-src-8", sentence: "She decided to ________ a new project at work.", answer: "take on", hintType: "phrasal verb", hintFirstLetter: "t", hintTr: "üstlenmek", explanation: "Take on a project, bir projeyi üstlenmek demektir." }
    ]
  }
);

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
   - Veriyi Firestore'da (progress/ravza.studyStreak) saklar; localStorage kapatıldı.
   ========================================================= */
(function initDuolingoStyleStreakModule() {
  const STORAGE_KEY = "ravza_study_streak_v1";
  const STREAK_FB_FIELD = "studyStreak";
  const DAY_MS = 24 * 60 * 60 * 1000;

  let STREAK_STATE = null;        // bellek içi tek kaynak
  let STREAK_FB_READY = false;    // Firebase ilk yükleme tamamlandı mı
  let STREAK_SAVE_TIMER = null;   // debounce zamanlayıcısı

  function normalizeStreakData(raw) {
    const src = (raw && typeof raw === "object") ? raw : {};
    return {
      days: [...new Set((Array.isArray(src.days) ? src.days : []).filter(Boolean))].sort(),
      best: Number(src.best || 0),
      lastAction: src.lastAction || null
    };
  }
  async function saveStreakToFirebase(data) {
    try {
      await setDoc(progressRef, { [STREAK_FB_FIELD]: data, updatedAt: serverTimestamp() }, { merge: true });
    } catch (error) { console.warn("Streak Firebase kaydedilemedi:", error); }
  }
  async function loadStreakFromFirebase() {
    let remote = null;
    try {
      const snap = await getDoc(progressRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data && data[STREAK_FB_FIELD] && typeof data[STREAK_FB_FIELD] === "object") remote = data[STREAK_FB_FIELD];
      }
    } catch (error) { console.warn("Streak Firebase okunamadı:", error); }

    if (remote) {
      STREAK_STATE = normalizeStreakData(remote);
    } else {
      // İlk kez: varsa eski yerel veriyi taşı
      let legacy = null;
      try { legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (_) {}
      STREAK_STATE = normalizeStreakData(legacy);
      try { await saveStreakToFirebase(STREAK_STATE); } catch (_) {}
    }
    STREAK_FB_READY = true;
    // localStorage kapatıldı: eski anahtarı temizle
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    return STREAK_STATE;
  }

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
    if (STREAK_STATE) return STREAK_STATE;
    STREAK_STATE = normalizeStreakData(null);
    return STREAK_STATE;
  }

  function writeStreakData(data) {
    STREAK_STATE = normalizeStreakData(data);
    if (!STREAK_FB_READY) return; // ilk Firebase yüklemesi bitmeden yazma
    if (STREAK_SAVE_TIMER) clearTimeout(STREAK_SAVE_TIMER);
    STREAK_SAVE_TIMER = setTimeout(() => { STREAK_SAVE_TIMER = null; saveStreakToFirebase(STREAK_STATE); }, 600);
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
    loadStreakFromFirebase().then(() => renderStudyStreak()).catch(() => {});
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 0));
  } else {
    setTimeout(boot, 0);
  }
})();


/* =========================================================
   PROFESSIONAL DEVICE ANALYTICS CONSENT
   Cookie-style permission banner; no model question.
   Firestore collection: user_visits
   ========================================================= */
(function professionalDeviceAnalyticsConsent() {
  const VISITOR_KEY = "ravza_user_visitor_id";
  const SESSION_KEY = "ravza_user_session_id";
  const SESSION_LOGGED_KEY = "ravza_user_session_logged_at";
  const CONSENT_KEY = "ravza_device_analytics_consent";
  const LEGACY_CONSENT_KEY = "ravza_device_tracking_consent";
  const LEGACY_MODEL_KEY = "ravza_confirmed_device_model";
  const LEGACY_MODEL_NOTE_KEY = "ravza_confirmed_device_note";
  const SESSION_LOG_PREFIX = "visit_logged_";
  const MAX_SESSION_AGE = 1000 * 60 * 30;

  function uid(prefix = "id") {
    if (window.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function getOrCreateVisitorId() {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = uid("visitor");
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  }

  function getOrCreateSessionId() {
    const last = Number(sessionStorage.getItem(SESSION_LOGGED_KEY) || 0);
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id || Date.now() - last > MAX_SESSION_AGE) {
      id = uid("session");
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  function normalizeScreenPair() {
    const sw = Number(window.screen?.width || window.innerWidth || 0);
    const sh = Number(window.screen?.height || window.innerHeight || 0);
    const width = Math.min(sw, sh);
    const height = Math.max(sw, sh);
    return `${width}x${height}`;
  }

  function getBrowserName(ua) {
    if (/Edg\//i.test(ua)) return "Microsoft Edge";
    if (/OPR\//i.test(ua)) return "Opera";
    if (/CriOS/i.test(ua)) return "Chrome iOS";
    if (/FxiOS/i.test(ua)) return "Firefox iOS";
    if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome";
    if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
    if (/Firefox\//i.test(ua)) return "Firefox";
    return "Bilinmeyen Tarayıcı";
  }

  function getOsName(ua, platform = navigator.platform || "") {
    if (/Windows NT/i.test(ua)) return "Windows";
    if (/iPhone/i.test(ua)) return "iOS";
    if (/iPad/i.test(ua) || (platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "iPadOS";
    if (/Android/i.test(ua)) return "Android";
    if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
    if (/Linux/i.test(ua)) return "Linux";
    return platform || "Bilinmeyen OS";
  }

  function getAndroidModel(ua) {
    const match = ua.match(/Android[^;]*;\s*([^;)]+)\s*(?:Build|\))/i);
    if (!match) return "Android cihaz";
    return match[1].replace(/wv|Mobile|;|\)/gi, "").trim() || "Android cihaz";
  }

  function guessAppleModel(ua) {
    const pair = normalizeScreenPair();
    const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
    const iphone = /iPhone/i.test(ua);
    const ipad = /iPad/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (ipad) return "iPad / iPadOS cihaz grubu";
    if (!iphone) return null;

    const map = {
      "440x956@3": "iPhone 16 Pro Max ekran grubu",
      "402x874@3": "iPhone 16 Pro ekran grubu",
      "430x932@3": "iPhone Plus / Pro Max ekran grubu",
      "393x852@3": "iPhone Pro ekran grubu",
      "390x844@3": "iPhone standart ekran grubu",
      "414x896@3": "iPhone Max ekran grubu",
      "414x896@2": "iPhone XR / 11 ekran grubu",
      "375x812@3": "iPhone X / mini / eski Pro ekran grubu",
      "375x667@2": "iPhone SE / 6 / 7 / 8 ekran grubu",
      "414x736@3": "iPhone Plus eski ekran grubu"
    };

    return map[`${pair}@${dpr}`] || `iPhone ekran grubu (${pair}, DPR ${dpr})`;
  }

  function getDeviceType(ua, highEntropy = {}) {
    const isTablet = /iPad|Tablet/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isTablet) return "Tablet";
    const isMobile = Boolean(highEntropy.mobile ?? /Mobi|Android|iPhone|iPod/i.test(ua));
    return isMobile ? "Mobil" : "Masaüstü";
  }

  async function getHighEntropyValues() {
    const highEntropy = {};
    if (navigator.userAgentData?.getHighEntropyValues) {
      try {
        Object.assign(highEntropy, await navigator.userAgentData.getHighEntropyValues([
          "platform",
          "platformVersion",
          "model",
          "mobile",
          "architecture",
          "bitness",
          "uaFullVersion",
          "fullVersionList"
        ]));
      } catch (error) {
        highEntropy.error = error?.message || String(error);
      }
    }
    return highEntropy;
  }

  async function collectRawDeviceInfo() {
    const ua = navigator.userAgent || "";
    const highEntropy = await getHighEntropyValues();
    const os = highEntropy.platform || getOsName(ua);
    const appleGuess = guessAppleModel(ua);
    const androidModel = /Android/i.test(ua) ? getAndroidModel(ua) : "";

    let automaticModel = highEntropy.model || appleGuess || androidModel || os || "Bilinmeyen cihaz";
    let modelAccuracy = "automatic";

    if (highEntropy.model) modelAccuracy = "browser-provided";
    else if (appleGuess) modelAccuracy = "estimated-screen-group";
    else if (androidModel) modelAccuracy = "user-agent-estimated";

    return {
      ua,
      highEntropy,
      os,
      browser: getBrowserName(ua),
      deviceType: getDeviceType(ua, highEntropy),
      automaticModel,
      modelAccuracy,
      screenText: `${window.screen?.width || "?"}×${window.screen?.height || "?"} / DPR ${window.devicePixelRatio || 1}`
    };
  }

  function getConsent() {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (consent) return consent;

    // Eski sürümden kalan izin varsa yeni sisteme taşı; model seçimi bilgilerini kullanma.
    const legacy = localStorage.getItem(LEGACY_CONSENT_KEY);
    if (legacy === "granted") {
      localStorage.setItem(CONSENT_KEY, "granted");
      localStorage.removeItem(LEGACY_MODEL_KEY);
      localStorage.removeItem(LEGACY_MODEL_NOTE_KEY);
      return "granted";
    }
    if (legacy === "denied") {
      localStorage.setItem(CONSENT_KEY, "denied");
      localStorage.removeItem(LEGACY_MODEL_KEY);
      localStorage.removeItem(LEGACY_MODEL_NOTE_KEY);
      return "denied";
    }

    return "unknown";
  }

  function setConsent(value) {
    localStorage.setItem(CONSENT_KEY, value);
    localStorage.removeItem(LEGACY_CONSENT_KEY);
    localStorage.removeItem(LEGACY_MODEL_KEY);
    localStorage.removeItem(LEGACY_MODEL_NOTE_KEY);
  }

  function injectPermissionBanner(raw) {
    return new Promise((resolve) => {
      const old = document.getElementById("devicePermissionModal");
      if (old) old.remove();

      const modal = document.createElement("div");
      modal.id = "devicePermissionModal";
      modal.className = "device-permission-modal device-cookie-style";
      modal.innerHTML = `
        <div class="device-permission-card" role="dialog" aria-modal="true" aria-labelledby="devicePermissionTitle">
          <div class="device-permission-head">
            <div class="device-permission-icon" aria-hidden="true">📱</div>
            <div class="device-permission-copy">
              <span class="device-permission-badge">CİHAZ ANALİZ İZNİ</span>
              <h3 id="devicePermissionTitle">Cihaz deneyimi izni</h3>
              <p>
                Bu siteyi hangi cihazlarda daha iyi çalıştırmamız gerektiğini anlamak için
                cihaz türü, işletim sistemi, tarayıcı ve ekran bilgilerini analiz etmek istiyoruz.
                Telefon modelini sana sormayız; izin verirsen teknik bilgiler kod ile otomatik analiz edilir.
              </p>
            </div>
          </div>

          <div class="device-detected-box" aria-label="Algılanan teknik cihaz özeti">
            <strong>Otomatik algılanan teknik özet</strong>
            <span>${raw.automaticModel || "Bilinmeyen cihaz"}</span>
            <small>${raw.deviceType || "-"} • ${raw.os || "-"} • ${raw.browser || "-"} • ${raw.screenText}</small>
          </div>

          <div class="device-permission-actions">
            <button type="button" class="device-btn device-btn-ghost" id="denyDeviceTrackingBtn">Reddet</button>
            <button type="button" class="device-btn device-btn-primary" id="allowDeviceTrackingBtn">İzin ver</button>
          </div>

          <p class="device-permission-note">
            İzin vermezsen hiçbir cihaz kaydı oluşturulmaz. Bu izin aynı tarayıcıda hatırlanır; istersen daha sonra tarayıcı verilerini temizleyebilirsin.
          </p>
        </div>
      `;

      document.body.appendChild(modal);
      document.body.classList.add("device-permission-open");

      modal.querySelector("#allowDeviceTrackingBtn").addEventListener("click", () => {
        setConsent("granted");
        close();
        resolve(true);
      });

      modal.querySelector("#denyDeviceTrackingBtn").addEventListener("click", () => {
        setConsent("denied");
        close();
        resolve(false);
      });

      function close() {
        document.body.classList.remove("device-permission-open");
        modal.classList.add("closing");
        setTimeout(() => modal.remove(), 180);
      }
    });
  }

  async function getConsentResult(raw) {
    const consent = getConsent();
    if (consent === "denied") return false;
    if (consent === "granted") return true;
    // Ana ekran ilk açılışta sadece görsel kalsın; açık izin yoksa cihaz analizi kapalıdır.
    setConsent("denied");
    return false;
  }

  async function collectDeviceInfo(raw) {
    return {
      visitorId: getOrCreateVisitorId(),
      sessionId: getOrCreateSessionId(),
      deviceModel: raw.automaticModel,
      automaticDeviceModel: raw.automaticModel,
      confirmedModel: "",
      modelAccuracy: raw.modelAccuracy,
      userPermission: "granted",
      permissionText: "Kullanıcı cihaz türü, işletim sistemi, tarayıcı ve ekran bilgilerinin analiz edilmesine izin verdi.",
      consentVersion: "device-analytics-v2-no-model-question",
      os: raw.os,
      browser: raw.browser,
      deviceType: raw.deviceType,
      userAgent: raw.ua,
      screen: {
        width: window.screen?.width || null,
        height: window.screen?.height || null,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
        colorDepth: window.screen?.colorDepth || null,
        orientation: screen.orientation?.type || "unknown"
      },
      capabilities: {
        touchPoints: navigator.maxTouchPoints || 0,
        standalone: Boolean(window.navigator.standalone),
        cookiesEnabled: navigator.cookieEnabled
      },
      language: navigator.language || "tr-TR",
      languages: navigator.languages || [],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Istanbul",
      pagePath: location.pathname,
      pageTitle: document.title,
      referrer: document.referrer || "direct",
      highEntropy: raw.highEntropy,
      createdAt: serverTimestamp(),
      clientCreatedAt: new Date().toISOString()
    };
  }

  async function logVisitOncePerSession() {
    try {
      const sessionId = getOrCreateSessionId();
      const alreadyLogged = sessionStorage.getItem(`${SESSION_LOG_PREFIX}${sessionId}`);
      if (alreadyLogged) return;

      const raw = await collectRawDeviceInfo();
      const allowed = await getConsentResult(raw);
      if (!allowed) return;

      const payload = await collectDeviceInfo(raw);
      await addDoc(collection(db, "user_visits"), payload);
      sessionStorage.setItem(`${SESSION_LOG_PREFIX}${sessionId}`, "1");
      sessionStorage.setItem(SESSION_LOGGED_KEY, String(Date.now()));
    } catch (error) {
      console.warn("Kullanıcı cihaz bilgisi kaydedilemedi:", error);
    }
  }

  window.resetDeviceTrackingPermission = function resetDeviceTrackingPermission() {
    localStorage.removeItem(CONSENT_KEY);
    localStorage.removeItem(LEGACY_CONSENT_KEY);
    localStorage.removeItem(LEGACY_MODEL_KEY);
    localStorage.removeItem(LEGACY_MODEL_NOTE_KEY);
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith(SESSION_LOG_PREFIX)) sessionStorage.removeItem(key);
    });
    logVisitOncePerSession();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(logVisitOncePerSession, 700));
  } else {
    setTimeout(logVisitOncePerSession, 700);
  }
})();

/* ============================================================
   RAVZALINGO — DUOLINGO BENZERİ ÖĞRENME MOTORU
   Tüm içerik kullanıcının kendi modüllerinden gelir:
     - TOPICS (Çalışma Merkezi)         → ünite + quiz
     - MEMORIZATION_CARDS (Ezber)       → kelime havuzu
     - FILL_GAP_EXERCISES (Boşluk)      → boşluk doldurma
     - QUESTION_BANK (Sınav Merkezi)    → karma quiz
   Hiçbir sahte/fallback veri yok.
   ============================================================ */
(function () {
  "use strict";
  if (window.__RAVZALINGO_V5__) return;
  window.__RAVZALINGO_V5__ = true;

  const RLZ_STATE_KEY = "ravzalingo_v5_state";
  const RLZ_MAX_HEARTS = 5;
  const RLZ_HEART_REFILL_MS = 10 * 60 * 1000;
  const RLZ_LESSON_LENGTH = 6;
  const RLZ_LESSONS_PER_UNIT = 5;
  const RLZ_XP_PER_CORRECT = 10;
  const RLZ_XP_LESSON_BONUS = 15;
  const RLZ_GEMS_LESSON_BONUS = 5;

  let RLZ_CONTENT_CACHE = null;
  let RLZ_SESSION = null;
  let RLZ_CLICK_LOCK = false;

  /* --- HELPERS --- */
  function rlzShuffle(list) {
    const arr = [...(list || [])];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function rlzPickRandom(list, n) {
    if (!list || !list.length) return n === 1 ? null : [];
    const s = rlzShuffle(list);
    return n === 1 ? s[0] : s.slice(0, n);
  }
  function rlzEsc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function rlzNorm(value) {
    return String(value || "").toLowerCase()
      .replace(/[ıİ]/g, "i").replace(/[ğĞ]/g, "g").replace(/[üÜ]/g, "u")
      .replace(/[şŞ]/g, "s").replace(/[öÖ]/g, "o").replace(/[çÇ]/g, "c")
      .replace(/[^a-z0-9' -]+/g, " ").replace(/\s+/g, " ").trim();
  }

  /* --- CONTENT BUILDER --- */
  function rlzBuildContent() {
    if (RLZ_CONTENT_CACHE) return RLZ_CONTENT_CACHE;

    const topics = (typeof TOPICS !== "undefined" && Array.isArray(TOPICS)) ? TOPICS : [];
    const memCards = (typeof MEMORIZATION_CARDS !== "undefined" && Array.isArray(MEMORIZATION_CARDS)) ? MEMORIZATION_CARDS : [];
    const gapEx = (typeof FILL_GAP_EXERCISES !== "undefined" && Array.isArray(FILL_GAP_EXERCISES)) ? FILL_GAP_EXERCISES : [];

    const lexemes = memCards.filter((c) => c?.front && c?.back).map((c) => ({
      id: `lex_${c.id}`, en: String(c.front).trim(), tr: String(c.back).trim()
    }));

    const gapsByTopic = {};
    gapEx.forEach((set) => {
      if (!set?.items?.length) return;
      const tid = set.topicId || "_general";
      if (!gapsByTopic[tid]) gapsByTopic[tid] = [];
      set.items.forEach((it) => {
        if (it?.sentence && it?.answer) {
          gapsByTopic[tid].push({
            id: `gap_${it.id || Math.random().toString(36).slice(2)}`,
            sentence: it.sentence,
            answer: String(it.answer).trim(),
            hintTr: it.hintTr || "",
            explanation: it.explanation || ""
          });
        }
      });
    });

    const quizByTopic = {};
    topics.forEach((t) => {
      const arr = [];
      (t.quiz || []).forEach((q, i) => {
        if (!q?.question || !Array.isArray(q?.options)) return;
        const ans = typeof q.answer === "number" ? q.answer : -1;
        if (ans < 0 || ans >= q.options.length) return;
        arr.push({
          id: `quiz_${t.id}_${i}`,
          question: q.question,
          options: q.options.map(String),
          answer: ans,
          explanation: q.explanation || ""
        });
      });
      if (arr.length) quizByTopic[t.id] = arr;
    });

    const sectionsMap = {};
    topics.forEach((t, idx) => {
      const unitMatch = String(t.unit || "").match(/(\d+)/);
      const sectionNum = unitMatch ? parseInt(unitMatch[1], 10) : Math.floor(idx / 2) + 1;
      if (!sectionsMap[sectionNum]) sectionsMap[sectionNum] = { number: sectionNum, units: [] };
      sectionsMap[sectionNum].units.push({
        id: t.id,
        title: t.title || t.id,
        subtitle: t.subtitle || "",
        unit: t.unit || `Unit ${sectionNum}`,
        icon: rlzPickIcon(t.title || t.id, sectionsMap[sectionNum].units.length),
        topic: t,
        gapPool: gapsByTopic[t.id] || [],
        quizPool: quizByTopic[t.id] || []
      });
    });

    const sections = Object.values(sectionsMap)
      .sort((a, b) => a.number - b.number)
      .map((s, i) => ({
        ...s,
        id: `section_${s.number}`,
        title: `Bölüm ${s.number}`,
        kicker: `SECTION ${s.number}`,
        color: rlzSectionColor(i)
      }));

    RLZ_CONTENT_CACHE = { sections, lexemes, gapsByTopic, quizByTopic };
    return RLZ_CONTENT_CACHE;
  }

  function rlzPickIcon(title, fallbackIndex) {
    const t = String(title).toLowerCase();
    if (/word|kelime|vocab/.test(t)) return "📚";
    if (/object|pronoun|zamir/.test(t)) return "🎯";
    if (/adjective|comparative|sıfat/.test(t)) return "✨";
    if (/present|şimdiki/.test(t)) return "⏰";
    if (/possess|sahip/.test(t)) return "🔑";
    if (/past|geçmiş/.test(t)) return "📜";
    if (/preposition|edat/.test(t)) return "🧭";
    if (/future|gelecek/.test(t)) return "🚀";
    if (/conditional|koşul/.test(t)) return "🌀";
    if (/perfect/.test(t)) return "💎";
    if (/modal/.test(t)) return "🛡️";
    if (/phrasal/.test(t)) return "🧩";
    if (/passive|edilgen/.test(t)) return "🌊";
    if (/reported|aktarım/.test(t)) return "💬";
    if (/causative|ettirgen/.test(t)) return "🛠️";
    if (/auxiliary|yardımcı/.test(t)) return "🪄";
    return ["🌱", "⚡", "🎨", "🎁", "🔥", "🌈", "🍀"][fallbackIndex % 7];
  }

  function rlzSectionColor(index) {
    const palette = [
      { main: "#58cc02", deep: "#2d7600", light: "#7ee000" },
      { main: "#1cb0f6", deep: "#0b75a2", light: "#4cc9ff" },
      { main: "#ce82ff", deep: "#7a3fb0", light: "#e0a9ff" },
      { main: "#ff9600", deep: "#a35a00", light: "#ffb84d" },
      { main: "#ff4b4b", deep: "#a52a2a", light: "#ff7b7b" },
      { main: "#ffd000", deep: "#a37d00", light: "#ffe566" },
      { main: "#46d5ff", deep: "#1e7ea0", light: "#7eecff" },
      { main: "#ff6dca", deep: "#a13a87", light: "#ff9bd9" }
    ];
    return palette[index % palette.length];
  }

  /* --- STATE (Firebase: progress/ravza.ravzaLingo) --- */
  const RLZ_FB_FIELD = "ravzaLingo";
  let RLZ_STATE = null;          // bellek içi tek kaynak
  let RLZ_FB_READY = false;      // Firebase ilk yükleme tamamlandı mı
  let RLZ_SAVE_TIMER = null;     // debounce zamanlayıcısı

  function rlzSafeJson(value, fallback) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }
  function rlzDefaultState() {
    return {
      version: 5, xp: 0, gems: 0, hearts: RLZ_MAX_HEARTS, heartsRefilledAt: Date.now(),
      streakDays: [], lastPlayedAt: null, unitProgress: {},
      totalCorrect: 0, totalWrong: 0, lessonsCompleted: 0
    };
  }
  function rlzNormalizeState(loaded) {
    const base = rlzDefaultState();
    const src = (loaded && typeof loaded === "object") ? loaded : {};
    return {
      ...base, ...src,
      unitProgress: { ...(src.unitProgress || {}) },
      streakDays: Array.isArray(src.streakDays) ? src.streakDays.slice(-365) : []
    };
  }
  function rlzLoad() {
    if (RLZ_STATE) return RLZ_STATE;
    RLZ_STATE = rlzNormalizeState(null);
    return RLZ_STATE;
  }
  function rlzSave(state) {
    RLZ_STATE = state;
    if (!RLZ_FB_READY) return; // ilk Firebase yüklemesi bitmeden yazma (çakışmayı önler)
    if (RLZ_SAVE_TIMER) clearTimeout(RLZ_SAVE_TIMER);
    RLZ_SAVE_TIMER = setTimeout(() => { RLZ_SAVE_TIMER = null; rlzSaveToFirebase(RLZ_STATE); }, 600);
  }
  async function rlzSaveToFirebase(state) {
    try {
      await setDoc(progressRef, { [RLZ_FB_FIELD]: state, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) { console.warn("RavzaLingo Firebase kaydedilemedi", e); }
  }
  // Kullanıcının kaldığı yer: 1. Bölüm'ün ilk 2 ünitesi (Kelime Listesi, Object Pronouns) tam;
  // 3. ünite Adjectives'in 1. dersi yapıldı, 2. derste duruyor.
  const RLZ_SEED_VERSION = 4;
  function rlzApplyBaselineProgress(state) {
    try {
      const content = rlzBuildContent();
      const sec = content.sections && content.sections[0];
      if (!sec || !sec.units) return;
      if (sec.units[0]) state.unitProgress[sec.units[0].id] = { stars: 5, lessonsDone: RLZ_LESSONS_PER_UNIT };
      if (sec.units[1]) state.unitProgress[sec.units[1].id] = { stars: 5, lessonsDone: RLZ_LESSONS_PER_UNIT };
      if (sec.units[2]) state.unitProgress[sec.units[2].id] = { stars: 0, lessonsDone: 1 };
      state.lessonsCompleted = Math.max(Number(state.lessonsCompleted || 0), RLZ_LESSONS_PER_UNIT * 2 + 1);
    } catch (_) {}
  }
  async function rlzLoadFromFirebase() {
    let remote = null;
    try {
      const snap = await getDoc(progressRef);
      if (snap.exists()) {
        const data = snap.data();
        if (data && data[RLZ_FB_FIELD] && typeof data[RLZ_FB_FIELD] === "object") remote = data[RLZ_FB_FIELD];
      }
    } catch (e) { console.warn("RavzaLingo Firebase okunamadı", e); }

    let needsWrite = false;
    if (remote) {
      RLZ_STATE = rlzNormalizeState(remote);
    } else {
      // İlk kez: varsa eski yerel veriyi taşı
      let legacy = null;
      try {
        const raw = localStorage.getItem(RLZ_STATE_KEY);
        if (raw) legacy = rlzSafeJson(raw, null);
      } catch (_) {}
      RLZ_STATE = rlzNormalizeState(legacy);
      needsWrite = true;
    }
    // Baseline ilerlemeyi (Adjectives'e kadar tamam) bir kez uygula
    if (Number(RLZ_STATE.seedVersion || 0) < RLZ_SEED_VERSION) {
      rlzApplyBaselineProgress(RLZ_STATE);
      RLZ_STATE.seedVersion = RLZ_SEED_VERSION;
      needsWrite = true;
    }
    if (needsWrite) { try { await rlzSaveToFirebase(RLZ_STATE); } catch (_) {} }
    RLZ_FB_READY = true;
    // localStorage kapatıldı: eski anahtarı temizle
    try { localStorage.removeItem(RLZ_STATE_KEY); } catch (_) {}
    return RLZ_STATE;
  }
  function rlzToday() { return new Date().toISOString().slice(0, 10); }
  function rlzMarkDaily(state) {
    const today = rlzToday();
    if (!state.streakDays.includes(today)) state.streakDays.push(today);
    state.streakDays = state.streakDays.slice(-365);
    state.lastPlayedAt = Date.now();
    return state;
  }
  function rlzStreakCount(state) {
    const days = [...new Set(state.streakDays || [])].sort().reverse();
    let check = new Date();
    let count = 0;
    for (const day of days) {
      const target = check.toISOString().slice(0, 10);
      if (day === target) {
        count += 1;
        check.setDate(check.getDate() - 1);
      } else if (count === 0) {
        const yesterday = new Date(check.getTime() - 86400000).toISOString().slice(0, 10);
        if (day === yesterday) {
          count += 1;
          check.setDate(check.getDate() - 2);
        } else break;
      } else break;
    }
    return count;
  }
  function rlzSyncExternalStreak() {
    const names = ["markTodayAsStudied", "markStreakToday", "recordStreakActivity", "completeDailyStreak"];
    for (const name of names) {
      if (typeof window[name] === "function") {
        try { window[name]("ravzalingo"); return; } catch (_) {}
      }
    }
  }
  function rlzRefillHearts(state) {
    if (state.hearts >= RLZ_MAX_HEARTS) {
      state.heartsRefilledAt = Date.now();
      return state;
    }
    const last = state.heartsRefilledAt || Date.now();
    const elapsed = Date.now() - last;
    const gained = Math.floor(elapsed / RLZ_HEART_REFILL_MS);
    if (gained > 0) {
      state.hearts = Math.min(RLZ_MAX_HEARTS, state.hearts + gained);
      state.heartsRefilledAt = last + gained * RLZ_HEART_REFILL_MS;
    }
    return state;
  }
  function rlzMsToNextHeart(state) {
    if (state.hearts >= RLZ_MAX_HEARTS) return 0;
    const last = state.heartsRefilledAt || Date.now();
    const elapsed = Date.now() - last;
    return Math.max(0, RLZ_HEART_REFILL_MS - (elapsed % RLZ_HEART_REFILL_MS));
  }
  function rlzFmtMs(ms) {
    const total = Math.ceil(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }
  function rlzGetUnitProgress(state, unitId) {
    return state.unitProgress[unitId] || { stars: 0, lessonsDone: 0 };
  }
  function rlzIsUnitUnlocked(state, sections, sectionIdx, unitIdx) {
    if (sectionIdx === 0 && unitIdx === 0) return true;
    if (unitIdx > 0) {
      const prev = sections[sectionIdx].units[unitIdx - 1];
      return rlzGetUnitProgress(state, prev.id).stars >= 1;
    }
    if (sectionIdx > 0) {
      const prevSection = sections[sectionIdx - 1];
      const last = prevSection.units[prevSection.units.length - 1];
      return rlzGetUnitProgress(state, last.id).stars >= 1;
    }
    return false;
  }

  /* --- LESSON BUILDER --- */
  function rlzBuildLesson(unit, content, isUnitTest) {
    const length = isUnitTest ? Math.min(8, RLZ_LESSON_LENGTH + 2) : RLZ_LESSON_LENGTH;
    const challenges = [];
    const lexemes = content.lexemes;
    const order = isUnitTest
      ? ["quiz", "gap", "translate", "match", "quiz", "listen", "gap", "quiz"]
      : ["translate", "gap", "quiz", "match", "listen", "quiz"];
    for (let i = 0; i < length; i += 1) {
      const ch = rlzMakeChallenge(order[i % order.length], unit, lexemes, i);
      if (ch) challenges.push(ch);
    }
    return { unitId: unit.id, unitTitle: unit.title, isUnitTest: !!isUnitTest, challenges, current: 0, correct: 0, wrong: 0 };
  }

  function rlzMakeChallenge(type, unit, lexemes, slot) {
    const stamp = `${Date.now()}_${slot}_${Math.random().toString(36).slice(2, 7)}`;
    if (type === "gap" && unit.gapPool.length) {
      const item = rlzPickRandom(unit.gapPool, 1);
      const wrongs = lexemes.filter((l) => rlzNorm(l.en) !== rlzNorm(item.answer));
      const distractors = rlzPickRandom(wrongs, 7).map((l) => l.en);
      const bank = rlzShuffle([item.answer, ...distractors]).slice(0, 8);
      return { type: "gap", id: `gap_${stamp}`, item, bank, selected: null, topic: unit.title };
    }
    if (type === "quiz" && unit.quizPool.length) {
      const item = rlzPickRandom(unit.quizPool, 1);
      return { type: "quiz", id: `quiz_${stamp}`, item, selected: null, topic: unit.title };
    }
    if (type === "translate" && lexemes.length) {
      const item = rlzPickRandom(lexemes, 1);
      const wrongs = lexemes.filter((l) => l.id !== item.id);
      const distractors = rlzPickRandom(wrongs, 7).map((l) => l.en);
      const bank = rlzShuffle([item.en, ...distractors]).slice(0, 8);
      return { type: "translate", id: `translate_${stamp}`, item, bank, selected: null, topic: unit.title };
    }
    if (type === "match" && lexemes.length >= 4) {
      const pairs = rlzPickRandom(lexemes, Math.min(5, lexemes.length));
      return {
        type: "match", id: `match_${stamp}`, topic: unit.title, pairs,
        left: rlzShuffle(pairs.map((p) => ({ id: p.id, text: p.en }))),
        right: rlzShuffle(pairs.map((p) => ({ id: p.id, text: p.tr }))),
        selectedLeft: null, selectedRight: null, matched: [], wrong: []
      };
    }
    if (type === "listen" && lexemes.length >= 4) {
      const item = rlzPickRandom(lexemes, 1);
      const wrongs = rlzPickRandom(lexemes.filter((l) => l.id !== item.id), 3);
      const options = rlzShuffle([
        { text: item.tr, correct: true },
        ...wrongs.map((w) => ({ text: w.tr, correct: false }))
      ]);
      return { type: "listen", id: `listen_${stamp}`, item, options, selected: null, played: false, topic: unit.title };
    }
    if (unit.quizPool.length) return rlzMakeChallenge("quiz", unit, lexemes, slot);
    if (lexemes.length) return rlzMakeChallenge("translate", unit, lexemes, slot);
    return null;
  }

  /* --- EVALUATE --- */
  function rlzCanCheck(c) {
    if (!c) return false;
    if (c.checked) return true;
    if (c.type === "gap" || c.type === "translate") return !!c.selected;
    if (c.type === "quiz" || c.type === "listen") return c.selected !== null && c.selected !== undefined;
    if (c.type === "match") return c.matched.length === c.pairs.length;
    return false;
  }
  function rlzEvaluate(c) {
    if (c.type === "gap") return { ok: rlzNorm(c.selected) === rlzNorm(c.item.answer), correctText: c.item.answer, hint: c.item.explanation || c.item.hintTr };
    if (c.type === "translate") return { ok: rlzNorm(c.selected) === rlzNorm(c.item.en), correctText: c.item.en, hint: c.item.tr };
    if (c.type === "quiz") return { ok: c.selected === c.item.answer, correctText: c.item.options[c.item.answer], hint: c.item.explanation };
    if (c.type === "listen") return { ok: c.options[c.selected]?.correct === true, correctText: c.item.tr, hint: c.item.en };
    if (c.type === "match") return { ok: c.matched.length === c.pairs.length && c.wrong.length === 0, correctText: "Tüm eşleştirmeler doğru!", hint: "" };
    return { ok: false, correctText: "-", hint: "" };
  }
  function rlzSpeak(text, slow) {
    if (!text || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = slow ? 0.55 : 0.9;
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }

  /* --- DOM --- */
  function rlzEnsureMarkup() {
    const nav = document.querySelector(".nav-links");
    if (nav && !document.getElementById("nav-ravzalingo")) {
      const li = document.createElement("li");
      li.innerHTML = `<button onclick="navigate('ravzalingo')" id="nav-ravzalingo"><span class="nav-icon">🟢</span>RavzaLingo</button>`;
      const study = document.getElementById("nav-studyhub")?.closest("li");
      if (study) nav.insertBefore(li, study); else nav.appendChild(li);
    }
    if (!document.getElementById("ravzalingo")) {
      const sec = document.createElement("section");
      sec.id = "ravzalingo";
      sec.className = "page ravzalingo-page";
      sec.innerHTML = `<div id="ravzaLingoRoot"></div>`;
      const study = document.getElementById("studyhub");
      const wrap = document.querySelector(".content-wrapper") || document.body;
      if (study?.parentNode) study.parentNode.insertBefore(sec, study); else wrap.appendChild(sec);
    }
  }
  function rlzRoot() { return document.getElementById("ravzaLingoRoot"); }

  /* --- RENDER --- */
  function rlzRenderHome() {
    rlzEnsureMarkup();
    const root = rlzRoot();
    if (!root) return;
    const content = rlzBuildContent();
    const state = rlzRefillHearts(rlzLoad());
    rlzSave(state);
    const streak = rlzStreakCount(state);

    if (!content.sections.length) {
      root.innerHTML = `<div class="rlz5-empty"><div class="rlz5-empty-card"><h2>Henüz içerik yok</h2><p>Çalışma Merkezi, Ezber Merkezi, Boşluk Doldurma veya Sınav Merkezi'ne içerik ekledikten sonra RavzaLingo otomatik dolacak.</p><button type="button" class="rlz5-btn-primary" onclick="navigate('studyhub')">Çalışma Merkezi'ne Git</button></div></div>`;
      return;
    }

    let totalUnits = 0, doneUnits = 0;
    content.sections.forEach((s) => {
      totalUnits += s.units.length;
      s.units.forEach((u) => { if (rlzGetUnitProgress(state, u.id).stars >= 1) doneUnits += 1; });
    });
    const overallPct = Math.round((doneUnits / Math.max(1, totalUnits)) * 100);
    const heartTimer = state.hearts < RLZ_MAX_HEARTS ? `<small>${rlzFmtMs(rlzMsToNextHeart(state))}</small>` : "";

    root.innerHTML = `
      <div class="rlz5-shell">
        <header class="rlz5-topbar">
          <div class="rlz5-stat fire"><span>🔥</span><div><b>${streak}</b><small>Seri</small></div></div>
          <div class="rlz5-stat heart"><span>❤️</span><div><b>${state.hearts}/${RLZ_MAX_HEARTS}</b>${heartTimer}</div></div>
          <div class="rlz5-stat xp"><span>⚡</span><div><b>${state.xp || 0}</b><small>XP</small></div></div>
          <div class="rlz5-stat gem"><span>💎</span><div><b>${state.gems || 0}</b><small>Kristal</small></div></div>
          <div class="rlz5-stat progress"><span>📊</span><div><b>${overallPct}%</b><small>İlerleme</small></div></div>
        </header>
        <div class="rlz5-path">${content.sections.map((s, i) => rlzRenderSection(s, i, state, content)).join("")}</div>
        <footer class="rlz5-footer-info">
          <p>Kaynak: <strong>Çalışma · Ezber · Boşluk · Sınav</strong> Merkezleri</p>
          <p>${content.sections.length} bölüm · ${totalUnits} ünite · ${content.lexemes.length} kelime</p>
        </footer>
      </div>`;
    requestAnimationFrame(() => { rlzUpdateNavButtons(); rlzUpdateStickyTopbar(); });
  }

  /* Düğüm tipini lesson sırasına göre belirle (yıldız/kitap/video/dumbbell/sandık/star) */
  function rlzNodeType(lessonIdx, totalLessons) {
    if (lessonIdx === totalLessons) return "test";   // ünite testi
    const cycle = ["star", "book", "dumbbell", "video", "star"];
    return cycle[lessonIdx % cycle.length];
  }

  function rlzNodeIcon(type, status) {
    if (status === "locked") return "🔒";
    if (status === "done") return "⭐";
    if (type === "test") return "🏆";
    if (type === "book") return "📖";
    if (type === "dumbbell") return "🏋️";
    if (type === "video") return "🎬";
    if (type === "chest") return "🎁";
    return "⭐";
  }

  /* Yatay ofset: 0=orta, -2..+2 sağ-sol salınım */
  function rlzNodeOffset(globalIdx) {
    const wave = [0, 1, 2, 1, 0, -1, -2, -1];
    return wave[globalIdx % wave.length];
  }

  function rlzRenderSection(section, sectionIdx, state, content) {
    const sectionDone = section.units.every((u) => rlzGetUnitProgress(state, u.id).stars >= 1);
    let pathHtml = "";
    let globalIdx = 0;

    section.units.forEach((unit, unitIdx) => {
      const progress = rlzGetUnitProgress(state, unit.id);
      const unlocked = rlzIsUnitUnlocked(state, content.sections, sectionIdx, unitIdx);
      const lessonsDone = Math.min(RLZ_LESSONS_PER_UNIT, progress.lessonsDone || 0);
      const isUnitDone = progress.stars >= 5;
      const safeUnitId = unit.id.replace(/'/g, "\\'");

      // Unit banner: the wide area opens all topics, the icon opens this unit's study pop-up.
      pathHtml += `
        <div class="rlz5-unit-banner ${isUnitDone ? "is-done" : ""} ${unlocked ? "" : "is-locked"}" data-unit-id="${safeUnitId}" title="${rlzEsc(unit.title)}">
          <button type="button" class="rlz5-banner-main" data-unit-id="${safeUnitId}" onclick="rlz5ShowAllTopicsModal('${safeUnitId}')" aria-label="Bütün konuları aç">
            <span class="rlz5-banner-text">
              <span class="rlz5-banner-kicker">${rlzEsc(section.kicker)}, ${unitIdx + 1}. ÜNİTE</span>
              <strong>${rlzEsc(unit.title)}</strong>
            </span>
          </button>
          <button type="button" class="rlz5-banner-guide" data-unit-id="${safeUnitId}" onclick="event.stopPropagation(); rlz5ShowStudyTopicModal('${safeUnitId}')" aria-label="${rlzEsc(unit.title)} çalışma pop-up'ını aç" title="Çalışma pop-up">📋</button>
        </div>`;

      // Ders düğümleri (5 ders + 1 ünite testi = 6 düğüm)
      for (let lIdx = 0; lIdx <= RLZ_LESSONS_PER_UNIT; lIdx += 1) {
        const isTest = lIdx === RLZ_LESSONS_PER_UNIT;
        const done = isTest ? isUnitDone : lIdx < lessonsDone;
        const current = !done && unlocked && (isTest ? lessonsDone >= RLZ_LESSONS_PER_UNIT : lIdx === lessonsDone);
        const status = done ? "done" : current ? "current" : "locked";
        const type = rlzNodeType(lIdx, RLZ_LESSONS_PER_UNIT);
        const offset = rlzNodeOffset(globalIdx);
        const onclick = (status !== "locked")
          ? `onclick="rlz5StartLesson('${safeUnitId}', ${isTest ? -1 : lIdx}, ${isTest})"`
          : "";
        const ariaLabel = isTest ? `Ünite ${unitIdx + 1} testi` : `${unit.title} - Ders ${lIdx + 1}`;
        const showMascot = current ? `<div class="rlz5-mascot-bubble">🦉</div>` : "";

        pathHtml += `
          <div class="rlz5-path-row" data-offset="${offset}">
            <div class="rlz5-node-wrap ${status === "current" ? "is-current" : ""}">
              ${showMascot}
              <button type="button" class="rlz5-node rlz5-node-${type} is-${status}" ${status === "locked" ? "disabled" : onclick} aria-label="${rlzEsc(ariaLabel)}">
                <span class="rlz5-node-icon">${rlzNodeIcon(type, status)}</span>
              </button>
              ${current && !done ? `<div class="rlz5-node-cta">BAŞLAT</div>` : ""}
            </div>
          </div>`;
        globalIdx += 1;
      }

      // Hazine sandığı (her ünite sonunda)
      const chestStatus = isUnitDone ? "done" : (unlocked && lessonsDone >= RLZ_LESSONS_PER_UNIT ? "current" : "locked");
      pathHtml += `
        <div class="rlz5-path-row" data-offset="${rlzNodeOffset(globalIdx)}">
          <div class="rlz5-node-wrap">
            <button type="button" class="rlz5-node rlz5-node-chest is-${chestStatus}" disabled aria-label="Hazine sandığı (otomatik açılır)">
              <span class="rlz5-node-icon">${chestStatus === "done" ? "📦" : "🎁"}</span>
            </button>
          </div>
        </div>`;
      globalIdx += 1;
    });

    return `
      <section class="rlz5-section" style="--rlz-main:${section.color.main};--rlz-deep:${section.color.deep};--rlz-light:${section.color.light}">
        <header class="rlz5-section-divider">
          <span></span>
          <div>
            <span class="rlz5-section-kicker">${rlzEsc(section.kicker)}</span>
            <h2>${rlzEsc(section.title)}${sectionDone ? " 🏆" : ""}</h2>
          </div>
          <span></span>
        </header>
        <div class="rlz5-path-track">${pathHtml}</div>
      </section>`;
  }

  // Geri uyumluluk için (artık doğrudan kullanılmıyor)
  function rlzRenderUnit() { return ""; }

  /* --- LESSON SCREEN --- */
  function rlzRenderLesson() {
    const root = rlzRoot();
    if (!root || !RLZ_SESSION) return;
    const { lesson, state } = RLZ_SESSION;
    const c = lesson.challenges[lesson.current];
    const total = lesson.challenges.length;
    const pct = Math.round((lesson.current / total) * 100);
    root.innerHTML = `
      <div class="rlz5-lesson-shell">
        <header class="rlz5-lesson-head">
          <button type="button" class="rlz5-close" onclick="rlz5Quit()" aria-label="Çık">×</button>
          <div class="rlz5-progress"><i style="width:${pct}%"></i></div>
          <div class="rlz5-lesson-hearts">❤️ <b>${state.hearts}</b></div>
        </header>
        <main class="rlz5-challenge-area">
          <div class="rlz5-challenge-meta">
            <span>${rlzEsc(c.topic || lesson.unitTitle)}</span>
            <b>${rlzTypeLabel(c.type)} · ${lesson.current + 1}/${total}</b>
          </div>
          ${rlzRenderChallenge(c)}
          ${c.feedback ? rlzRenderFeedback(c) : ""}
        </main>
        <footer class="rlz5-lesson-footer">
          <button type="button" class="rlz5-skip" onclick="rlz5Skip()">${c.checked ? "" : "Atla"}</button>
          <button type="button" class="rlz5-check ${rlzCanCheck(c) ? "ready" : ""}" onclick="rlz5Check()">${c.checked ? "Devam Et" : "Kontrol Et"}</button>
        </footer>
      </div>`;
  }

  function rlzTypeLabel(type) {
    return ({ gap: "Boşluğu Tamamla", match: "Eşleştirme", quiz: "Çoktan Seçmeli", translate: "Çeviri", listen: "Dinle ve Anla" })[type] || "Etkinlik";
  }

  function rlzRenderChallenge(c) {
    if (c.type === "gap") {
      const parts = String(c.item.sentence).split(/_+/);
      return `
        <h2 class="rlz5-prompt">Boşluğu doldur</h2>
        <div class="rlz5-mascot-row"><div class="rlz5-mascot">🦉</div><div class="rlz5-speech">${rlzEsc(parts[0])}<span class="rlz5-blank ${c.selected ? "filled" : ""}">${c.selected ? rlzEsc(c.selected) : "______"}</span>${rlzEsc(parts[1] || "")}</div></div>
        ${c.item.hintTr ? `<p class="rlz5-hint">İpucu: ${rlzEsc(c.item.hintTr)}</p>` : ""}
        <div class="rlz5-bank">${c.bank.map((w, i) => `<button type="button" class="rlz5-word ${c.selected === w ? "selected" : ""}" onclick="rlz5SelectWord(${i})" ${c.checked ? "disabled" : ""}>${rlzEsc(w)}</button>`).join("")}</div>`;
    }
    if (c.type === "translate") {
      return `
        <h2 class="rlz5-prompt">Türkçeden İngilizceye çevir</h2>
        <div class="rlz5-mascot-row"><div class="rlz5-mascot">📚</div><div class="rlz5-speech"><small>Türkçe</small>${rlzEsc(c.item.tr)}</div></div>
        <div class="rlz5-answer-slot ${c.selected ? "filled" : ""}">${c.selected ? rlzEsc(c.selected) : "İngilizce karşılığını seç"}</div>
        <div class="rlz5-bank">${c.bank.map((w, i) => `<button type="button" class="rlz5-word ${c.selected === w ? "selected" : ""}" onclick="rlz5SelectWord(${i})" ${c.checked ? "disabled" : ""}>${rlzEsc(w)}</button>`).join("")}</div>`;
    }
    if (c.type === "quiz") {
      return `
        <h2 class="rlz5-prompt">Doğru cevabı seç</h2>
        <div class="rlz5-speech question">${rlzEsc(c.item.question)}</div>
        <div class="rlz5-options">
          ${c.item.options.map((opt, i) => `
            <button type="button" class="rlz5-option ${c.selected === i ? "selected" : ""} ${c.checked && i === c.item.answer ? "correct" : ""} ${c.checked && c.selected === i && i !== c.item.answer ? "wrong" : ""}" onclick="rlz5SelectQuiz(${i})" ${c.checked ? "disabled" : ""}>
              <span class="rlz5-option-key">${String.fromCharCode(65 + i)}</span>${rlzEsc(opt)}
            </button>`).join("")}
        </div>`;
    }
    if (c.type === "listen") {
      return `
        <h2 class="rlz5-prompt">Dinle ve Türkçe anlamı seç</h2>
        <div class="rlz5-listen-bar">
          <button type="button" class="rlz5-listen-big" onclick="rlz5Listen(false)" aria-label="Dinle">🔊</button>
          <button type="button" class="rlz5-listen-small" onclick="rlz5Listen(true)" aria-label="Yavaş">🐢</button>
        </div>
        <div class="rlz5-options">
          ${c.options.map((opt, i) => `
            <button type="button" class="rlz5-option ${c.selected === i ? "selected" : ""} ${c.checked && opt.correct ? "correct" : ""} ${c.checked && c.selected === i && !opt.correct ? "wrong" : ""}" onclick="rlz5SelectListen(${i})" ${c.checked ? "disabled" : ""}>
              ${rlzEsc(opt.text)}
            </button>`).join("")}
        </div>`;
    }
    if (c.type === "match") {
      return `
        <h2 class="rlz5-prompt">Eşleşen kelimeleri bul</h2>
        <p class="rlz5-helper">Önce İngilizce, sonra Türkçe karşılığını seç. Eşleşen: ${c.matched.length}/${c.pairs.length}${c.wrong.length ? ` · Hata: ${c.wrong.length}` : ""}</p>
        <div class="rlz5-match">
          <div>${c.left.map((it) => `<button type="button" class="rlz5-match-btn ${c.selectedLeft === it.id ? "selected" : ""} ${c.matched.includes(it.id) ? "done" : ""}" onclick="rlz5Match('left','${rlzEsc(it.id)}')" ${c.matched.includes(it.id) || c.checked ? "disabled" : ""}>${rlzEsc(it.text)}</button>`).join("")}</div>
          <div>${c.right.map((it) => `<button type="button" class="rlz5-match-btn ${c.selectedRight === it.id ? "selected" : ""} ${c.matched.includes(it.id) ? "done" : ""}" onclick="rlz5Match('right','${rlzEsc(it.id)}')" ${c.matched.includes(it.id) || c.checked ? "disabled" : ""}>${rlzEsc(it.text)}</button>`).join("")}</div>
        </div>`;
    }
    return `<h2 class="rlz5-prompt">Etkinlik bulunamadı</h2>`;
  }

  function rlzRenderFeedback(c) {
    const cls = c.correct ? "ok" : "bad";
    const title = c.correct ? "Harika! Doğru" : "Üzgünüm, doğru cevap:";
    const xp = c.correct ? `<span class="rlz5-fb-xp">+${c.earnedXp || RLZ_XP_PER_CORRECT} XP${c.earnedGems ? ` · +${c.earnedGems} 💎` : ""}</span>` : "";
    return `
      <div class="rlz5-feedback ${cls}">
        <div class="rlz5-fb-icon">${c.correct ? "✓" : "✕"}</div>
        <div class="rlz5-fb-body">
          <strong>${title}</strong>
          ${!c.correct ? `<div class="rlz5-fb-correct">${rlzEsc(c.feedback?.correctText || "")}</div>` : ""}
          ${c.feedback?.hint ? `<div class="rlz5-fb-hint">${rlzEsc(c.feedback.hint)}</div>` : ""}
          ${xp}
        </div>
      </div>`;
  }

  function rlzCompleteLesson() {
    const session = RLZ_SESSION;
    if (!session) return;
    const { state, unit, isUnitTest } = session;
    const lesson = session.lesson;
    const accuracy = lesson.correct / Math.max(1, lesson.correct + lesson.wrong);
    const progress = rlzGetUnitProgress(state, unit.id);
    if (isUnitTest) {
      progress.stars = Math.max(progress.stars || 0, accuracy >= 0.9 ? 5 : accuracy >= 0.75 ? 4 : 3);
    } else {
      const lessonNum = Math.max(progress.lessonsDone || 0, session.lessonIdx + 1);
      progress.lessonsDone = lessonNum;
      const baseStars = Math.min(4, Math.floor((lessonNum / RLZ_LESSONS_PER_UNIT) * 4));
      progress.stars = Math.max(progress.stars || 0, baseStars);
    }
    state.unitProgress[unit.id] = progress;
    state.lessonsCompleted = (state.lessonsCompleted || 0) + 1;
    const bonusXp = RLZ_XP_LESSON_BONUS + (accuracy >= 0.95 ? 10 : 0);
    const bonusGems = RLZ_GEMS_LESSON_BONUS + (accuracy >= 0.9 ? 3 : 0);
    state.xp = (state.xp || 0) + bonusXp;
    state.gems = (state.gems || 0) + bonusGems;
    rlzMarkDaily(state);
    rlzSyncExternalStreak();
    rlzSave(state);
    rlzRenderLessonComplete({
      accuracyPct: Math.round(accuracy * 100),
      bonusXp, bonusGems,
      lessonXp: lesson.correct * RLZ_XP_PER_CORRECT,
      durationSec: Math.round((Date.now() - session.startedAt) / 1000),
      isUnitTest, stars: progress.stars
    });
  }

  function rlzRenderLessonComplete(info) {
    const root = rlzRoot();
    if (!root) return;
    const stars = "⭐".repeat(info.stars || 0) + "☆".repeat(Math.max(0, 5 - (info.stars || 0)));
    root.innerHTML = `
      <div class="rlz5-complete">
        <div class="rlz5-complete-card">
          <div class="rlz5-complete-rays"></div>
          <div class="rlz5-complete-icon">${info.isUnitTest ? "🏆" : "🎉"}</div>
          <h2>${info.isUnitTest ? "Ünite testini tamamladın!" : "Ders tamamlandı!"}</h2>
          <p>${info.accuracyPct}% doğru oranı · ${info.durationSec} saniye</p>
          <div class="rlz5-complete-stats">
            <div class="rlz5-cs xp"><strong>+${info.lessonXp + info.bonusXp}</strong><span>XP</span></div>
            <div class="rlz5-cs gem"><strong>+${info.bonusGems}</strong><span>Kristal</span></div>
            <div class="rlz5-cs star"><strong>${stars}</strong><span>Yıldız</span></div>
          </div>
          <button type="button" class="rlz5-btn-primary" onclick="rlz5Home()">Devam Et</button>
        </div>
      </div>`;
  }

  function rlzShowOutOfHearts(state) {
    const root = rlzRoot();
    if (!root) return;
    const ms = rlzMsToNextHeart(state);
    root.innerHTML = `
      <div class="rlz5-empty">
        <div class="rlz5-empty-card">
          <div class="rlz5-broken-heart">💔</div>
          <h2>Canların bitti!</h2>
          <p>Yeni can için <strong id="rlz5HeartCountdown">${rlzFmtMs(ms)}</strong> bekle ya da kristal kullan.</p>
          <div class="rlz5-empty-actions">
            <button type="button" class="rlz5-btn-secondary" onclick="rlz5Home()">Geri Dön</button>
            <button type="button" class="rlz5-btn-primary" onclick="rlz5BuyHearts()">Tüm Canları Doldur (50 💎)</button>
          </div>
        </div>
      </div>`;
  }

  /* --- ACTIONS (window-exposed) --- */
  function rlz5StartLesson(unitId, lessonIdx, isUnitTest) {
    const content = rlzBuildContent();
    const state = rlzRefillHearts(rlzLoad());
    if (state.hearts <= 0) { rlzShowOutOfHearts(state); return; }
    let unit = null;
    let sectionIdx = 0;
    for (let s = 0; s < content.sections.length; s += 1) {
      const found = content.sections[s].units.find((u) => u.id === unitId);
      if (found) { unit = found; sectionIdx = s; break; }
    }
    if (!unit) return;
    const lesson = rlzBuildLesson(unit, content, !!isUnitTest);
    if (!lesson.challenges.length) {
      const root = rlzRoot();
      if (root) root.innerHTML = `<div class="rlz5-empty"><div class="rlz5-empty-card"><h2>Bu ünite için soru yok</h2><p>Çalışma/Ezber/Boşluk/Sınav modüllerine bu konuyla ilgili içerik ekle.</p><button type="button" class="rlz5-btn-primary" onclick="rlz5Home()">Geri Dön</button></div></div>`;
      return;
    }
    RLZ_SESSION = { state, unit, sectionIdx, lessonIdx, isUnitTest, lesson, startedAt: Date.now() };
    rlzRenderLesson();
  }

  function rlz5SelectWord(index) {
    const c = RLZ_SESSION?.lesson?.challenges[RLZ_SESSION.lesson.current];
    if (!c || c.checked) return;
    if (c.type === "gap" || c.type === "translate") c.selected = c.bank[index];
    rlzRenderLesson();
  }
  function rlz5SelectQuiz(index) {
    const c = RLZ_SESSION?.lesson?.challenges[RLZ_SESSION.lesson.current];
    if (!c || c.checked || c.type !== "quiz") return;
    c.selected = index;
    rlzRenderLesson();
  }
  function rlz5SelectListen(index) {
    const c = RLZ_SESSION?.lesson?.challenges[RLZ_SESSION.lesson.current];
    if (!c || c.checked || c.type !== "listen") return;
    c.selected = index;
    rlzRenderLesson();
  }
  function rlz5Match(side, id) {
    const c = RLZ_SESSION?.lesson?.challenges[RLZ_SESSION.lesson.current];
    if (!c || c.type !== "match" || c.checked || c.matched.includes(id)) return;
    if (side === "left") c.selectedLeft = id;
    if (side === "right") c.selectedRight = id;
    if (c.selectedLeft && c.selectedRight) {
      if (c.selectedLeft === c.selectedRight) c.matched.push(c.selectedLeft);
      else c.wrong.push([c.selectedLeft, c.selectedRight]);
      c.selectedLeft = null;
      c.selectedRight = null;
    }
    rlzRenderLesson();
  }
  function rlz5Listen(slow) {
    const c = RLZ_SESSION?.lesson?.challenges[RLZ_SESSION.lesson.current];
    if (!c || c.type !== "listen") return;
    c.played = true;
    rlzSpeak(c.item.en, !!slow);
    rlzRenderLesson();
  }
  function rlz5Check() {
    if (RLZ_CLICK_LOCK) return;
    RLZ_CLICK_LOCK = true;
    setTimeout(() => { RLZ_CLICK_LOCK = false; }, 220);

    const session = RLZ_SESSION;
    if (!session) return;
    const lesson = session.lesson;
    const c = lesson.challenges[lesson.current];
    if (!c) return;

    if (c.checked) {
      lesson.current += 1;
      if (lesson.current >= lesson.challenges.length) { rlzCompleteLesson(); return; }
      rlzRenderLesson();
      return;
    }
    if (!rlzCanCheck(c)) return;

    const result = rlzEvaluate(c);
    c.checked = true;
    c.correct = result.ok;
    c.feedback = result;
    c.earnedXp = result.ok ? RLZ_XP_PER_CORRECT : 0;
    c.earnedGems = (result.ok && (lesson.correct + 1) % 5 === 0) ? 1 : 0;

    const state = session.state;
    if (result.ok) {
      lesson.correct += 1;
      state.totalCorrect = (state.totalCorrect || 0) + 1;
      state.xp = (state.xp || 0) + c.earnedXp;
      if (c.earnedGems) state.gems = (state.gems || 0) + c.earnedGems;
    } else {
      lesson.wrong += 1;
      state.totalWrong = (state.totalWrong || 0) + 1;
      state.hearts = Math.max(0, (state.hearts || RLZ_MAX_HEARTS) - 1);
      if (state.hearts === RLZ_MAX_HEARTS - 1) state.heartsRefilledAt = Date.now();
      lesson.challenges.push(JSON.parse(JSON.stringify({
        ...c,
        id: `${c.id}_retry`,
        selected: null, selectedLeft: null, selectedRight: null,
        matched: c.type === "match" ? [] : undefined,
        wrong: c.type === "match" ? [] : undefined,
        checked: false, correct: false, feedback: null, retry: true
      })));
    }
    rlzSave(state);
    rlzRenderLesson();
    if (state.hearts <= 0) setTimeout(() => rlzShowOutOfHearts(state), 800);
  }
  function rlz5Skip() {
    const session = RLZ_SESSION;
    if (!session) return;
    const c = session.lesson.challenges[session.lesson.current];
    if (!c || c.checked) { rlz5Check(); return; }
    c.selected = c.type === "quiz" || c.type === "listen" ? -1 : "__SKIP__";
    rlz5Check();
  }
  function rlz5Quit() {
    if (!RLZ_SESSION) { rlz5Home(); return; }
    if (confirm("Dersten çıkmak istediğine emin misin? İlerlemen kaydedilmez.")) {
      RLZ_SESSION = null;
      rlzRenderHome();
    }
  }
  function rlz5Home() {
    RLZ_SESSION = null;
    rlzRenderHome();
  }
  function rlz5BuyHearts() {
    const state = rlzLoad();
    if ((state.gems || 0) < 50) { alert("Yeterli kristalin yok. Ders çözerek kristal kazan."); return; }
    state.gems -= 50;
    state.hearts = RLZ_MAX_HEARTS;
    state.heartsRefilledAt = Date.now();
    rlzSave(state);
    rlzRenderHome();
  }

  /* --- CSS --- */
  function rlzInjectCss() {
    if (document.getElementById("ravzalingo-v5-css-r3")) return;
    document.getElementById("ravzalingo-v4-css")?.remove();
    document.getElementById("ravzalingo-v5-css")?.remove();
    const style = document.createElement("style");
    style.id = "ravzalingo-v5-css-r3";
    style.textContent = `
      .ravzalingo-page{background:#131f24;border-radius:0;overflow:visible;min-height:calc(100vh - 130px);width:100%;max-width:none;margin:0}
      #ravzaLingoRoot,#ravzaLingoRoot *{box-sizing:border-box;font-family:'Plus Jakarta Sans',system-ui,sans-serif}
      .rlz5-shell{min-height:calc(100vh - 130px);padding:20px clamp(18px,4vw,56px) 28px;color:#fff;background:radial-gradient(circle at 0% 38%,rgba(255,77,148,.16),transparent 30%),radial-gradient(circle at 100% 36%,rgba(255,77,148,.16),transparent 30%),linear-gradient(180deg,#1a2a32,#0f1a20);width:100%;max-width:none}
      .rlz5-empty{min-height:calc(100vh - 130px);display:grid;place-items:center;padding:24px}
      .rlz5-empty-card{width:min(100%,440px);padding:30px 24px;border-radius:24px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);text-align:center;color:#fff}
      .rlz5-empty-card h2{font-size:24px;margin-bottom:10px;font-weight:900}
      .rlz5-empty-card p{color:rgba(255,255,255,.7);line-height:1.6;margin-bottom:18px}
      .rlz5-empty-actions{display:grid;gap:10px;grid-template-columns:1fr 1fr}
      .rlz5-broken-heart{font-size:64px;margin-bottom:8px}
      .rlz5-btn-primary{border:0;border-radius:14px;padding:14px 22px;background:linear-gradient(180deg,#7ee000,#58cc02);color:#fff;font-weight:900;cursor:pointer;box-shadow:0 5px 0 #2f7d00;font-size:14px;letter-spacing:.04em;text-transform:uppercase;width:100%}
      .rlz5-btn-secondary{border:0;border-radius:14px;padding:14px 22px;background:#384956;color:rgba(255,255,255,.85);font-weight:900;cursor:pointer;font-size:14px;letter-spacing:.04em;text-transform:uppercase;width:100%}

      .rlz5-topbar{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:0;padding:14px 16px;border-radius:18px;background:rgba(13,21,26,.97);border:1px solid rgba(255,255,255,.08);box-shadow:0 10px 26px rgba(0,0,0,.32);backdrop-filter:blur(8px);position:fixed;top:78px;z-index:60}
      .rlz5-topbar-spacer{height:0;flex-shrink:0}
      .rlz5-stat{display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center;min-height:44px}
      .rlz5-stat span{font-size:24px;line-height:1}
      .rlz5-stat b{display:block;font-size:16px;font-weight:900;line-height:1}
      .rlz5-stat small{display:block;font-size:10px;font-weight:800;color:rgba(255,255,255,.5);letter-spacing:.06em;text-transform:uppercase;margin-top:2px}
      .rlz5-stat.fire b{color:#ff9600}
      .rlz5-stat.heart b{color:#ff4b4b}
      .rlz5-stat.xp b{color:#ffd000}
      .rlz5-stat.gem b{color:#46d5ff}
      .rlz5-stat.progress b{color:#7ee000}

      /* PATH (gerçek Duolingo görünümü) */
      .rlz5-path{display:grid;gap:8px}
      .rlz5-section{position:relative}
      .rlz5-section-divider{display:grid;grid-template-columns:1fr auto 1fr;gap:18px;align-items:center;padding:36px 8px 20px}
      .rlz5-section-divider>span{height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.05) 15%,var(--rlz-main) 50%,rgba(255,255,255,.05) 85%,transparent);opacity:.45}
      .rlz5-section-divider>div{text-align:center;padding:13px 30px;border-radius:20px;background:linear-gradient(180deg,#1e2d36,#15222b);border:1px solid rgba(255,255,255,.1);box-shadow:0 10px 30px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.07);position:relative}
      .rlz5-section-divider>div::before{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;border-radius:0 0 20px 20px;background:linear-gradient(90deg,transparent,var(--rlz-main),transparent);opacity:.85}
      .rlz5-section-divider .rlz5-section-kicker{display:block;height:auto;background:none;font-size:11px;letter-spacing:.26em;font-weight:900;color:var(--rlz-main);margin:0 0 7px;text-transform:uppercase;line-height:1}
      .rlz5-section-divider h2{font-family:'Playfair Display',serif;font-size:23px;letter-spacing:.01em;color:#fff;font-weight:800;line-height:1.15;margin:0}

      .rlz5-path-track{position:relative;display:grid;gap:18px;padding:8px 0 30px}
      .rlz5-unit-banner{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:18px 0 10px;padding:10px 12px 10px 18px;border-radius:16px;background:linear-gradient(135deg,var(--rlz-main),var(--rlz-deep));box-shadow:0 6px 0 var(--rlz-deep),0 14px 30px rgba(0,0,0,.25);transition:transform .15s ease,filter .15s ease;-webkit-tap-highlight-color:transparent;outline:none}
      .rlz5-unit-banner:hover{filter:brightness(1.07)}
      .rlz5-unit-banner:active{transform:translateY(2px);box-shadow:0 3px 0 var(--rlz-deep),0 8px 18px rgba(0,0,0,.3)}
      .rlz5-unit-banner:focus-visible{box-shadow:0 6px 0 var(--rlz-deep),0 0 0 3px rgba(255,255,255,.4)}
      .rlz5-unit-banner.is-locked{cursor:default}
      /* Yapışkan (kayan) ünite banner'ı — stat barının hemen altında durur, JS konumlandırır */
      .rlz5-unit-sticky{margin:0;box-shadow:0 6px 0 var(--rlz-deep),0 12px 26px rgba(0,0,0,.42)}
      .rlz5-unit-banner.is-done{background:linear-gradient(135deg,#7d5500,#ae8500)}
      .rlz5-unit-banner.is-locked{background:linear-gradient(135deg,#3a4a55,#1d2b31);box-shadow:0 6px 0 #0b141a}
      .rlz5-banner-main{flex:1;min-width:0;align-self:stretch;border:0;border-radius:12px;background:transparent;color:#fff;text-align:left;cursor:pointer;display:flex;align-items:center;padding:4px 6px 4px 0;outline:none}
      .rlz5-banner-main:hover{background:rgba(255,255,255,.08)}
      .rlz5-banner-main:focus-visible,.rlz5-banner-guide:focus-visible{box-shadow:0 0 0 3px rgba(255,255,255,.38)}
      .rlz5-banner-text{display:grid;gap:2px;color:#fff;min-width:0}
      .rlz5-banner-kicker{display:block;font-size:10px;font-weight:900;letter-spacing:.14em;color:rgba(255,255,255,.85)}
      .rlz5-banner-text strong{display:block;font-size:18px;font-weight:900;line-height:1.2;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .rlz5-banner-guide{flex-shrink:0;width:42px;height:42px;border:0;border-radius:12px;background:rgba(255,255,255,.18);color:#fff;font-size:18px;cursor:pointer;display:grid;place-items:center;box-shadow:0 4px 0 rgba(0,0,0,.18)}
      .rlz5-banner-guide:hover{background:rgba(255,255,255,.28)}

      .rlz5-path-row{display:flex;justify-content:center;padding:10px 0;position:relative}
      .rlz5-path-row[data-offset="-2"]{transform:translateX(-110px)}
      .rlz5-path-row[data-offset="-1"]{transform:translateX(-58px)}
      .rlz5-path-row[data-offset="0"]{transform:translateX(0)}
      .rlz5-path-row[data-offset="1"]{transform:translateX(58px)}
      .rlz5-path-row[data-offset="2"]{transform:translateX(110px)}

      .rlz5-node-wrap{position:relative;display:grid;justify-items:center;gap:10px}
      .rlz5-node{position:relative;width:78px;height:78px;border:0;border-radius:50%;background:linear-gradient(180deg,var(--rlz-light),var(--rlz-main));box-shadow:0 8px 0 var(--rlz-deep),0 18px 30px rgba(0,0,0,.28),inset 0 8px 12px rgba(255,255,255,.22);color:#fff;cursor:pointer;display:grid;place-items:center;transition:transform .15s ease}
      .rlz5-node:hover:not(:disabled){transform:translateY(-3px)}
      .rlz5-node:active:not(:disabled){transform:translateY(2px);box-shadow:0 4px 0 var(--rlz-deep),0 8px 12px rgba(0,0,0,.2)}
      .rlz5-node:disabled{cursor:not-allowed}
      .rlz5-node.is-locked{background:linear-gradient(180deg,#4d5e69,#384956);box-shadow:0 6px 0 #1d2b31;color:rgba(255,255,255,.35)}
      .rlz5-node.is-done{background:linear-gradient(180deg,#ffe066,#ffd000);box-shadow:0 8px 0 #ae8500,0 18px 30px rgba(255,208,0,.22),inset 0 8px 12px rgba(255,255,255,.34);color:#7d5500}
      .rlz5-node.is-current{animation:rlz5NodePulse 1.4s ease-in-out infinite}
      .rlz5-node-icon{font-size:34px;line-height:1;display:block}
      .rlz5-node.is-locked .rlz5-node-icon{filter:grayscale(1) opacity(.7)}

      /* Düğüm tipine göre renk varyasyonu (test ve sandık altın) */
      .rlz5-node-test{background:linear-gradient(180deg,#ffe066,#ff9600);box-shadow:0 8px 0 #a35a00,0 18px 30px rgba(255,150,0,.22),inset 0 8px 12px rgba(255,255,255,.3)}
      .rlz5-node-test.is-locked{background:linear-gradient(180deg,#4d5e69,#384956);box-shadow:0 6px 0 #1d2b31}
      .rlz5-node-chest{background:linear-gradient(180deg,#d49a5e,#a07033);box-shadow:0 8px 0 #6b4818,0 18px 30px rgba(212,154,94,.22),inset 0 8px 12px rgba(255,230,180,.3)}
      .rlz5-node-chest.is-locked{background:linear-gradient(180deg,#4d5e69,#384956);box-shadow:0 6px 0 #1d2b31;opacity:.6}
      .rlz5-node-chest.is-done{background:linear-gradient(180deg,#7ee000,#58cc02);box-shadow:0 8px 0 #2f7d00}

      @keyframes rlz5NodePulse{0%,100%{box-shadow:0 8px 0 var(--rlz-deep),0 0 0 0 rgba(255,255,255,.6),0 18px 30px rgba(0,0,0,.28),inset 0 8px 12px rgba(255,255,255,.22)}50%{box-shadow:0 8px 0 var(--rlz-deep),0 0 0 18px rgba(255,255,255,0),0 18px 30px rgba(0,0,0,.28),inset 0 8px 12px rgba(255,255,255,.22)}}

      .rlz5-node-cta{position:absolute;top:-30px;left:50%;transform:translateX(-50%);background:#fff;color:var(--rlz-deep);font-weight:900;font-size:11px;padding:6px 12px;border-radius:10px;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;box-shadow:0 4px 0 rgba(0,0,0,.18),0 8px 18px rgba(0,0,0,.25)}
      .rlz5-node-cta:after{content:"";position:absolute;left:50%;bottom:-8px;transform:translateX(-50%);width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:8px solid #fff}

      .rlz5-mascot-bubble{position:absolute;left:-78px;top:50%;transform:translateY(-50%);width:64px;height:64px;display:grid;place-items:center;font-size:48px;animation:rlz5Bob 2.4s ease-in-out infinite;filter:drop-shadow(0 6px 6px rgba(0,0,0,.32));pointer-events:none}
      @keyframes rlz5Bob{0%,100%{transform:translateY(-50%) rotate(-3deg)}50%{transform:translateY(calc(-50% - 4px)) rotate(3deg)}}

      .rlz5-footer-info{margin-top:30px;padding:16px;border-radius:16px;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.05);text-align:center;color:rgba(255,255,255,.6);font-size:12px;line-height:1.6}
      .rlz5-footer-info p{margin:4px 0}

      .rlz5-lesson-shell{min-height:calc(100vh - 130px);display:grid;grid-template-rows:auto 1fr auto;gap:18px;padding:20px;color:#fff;background:linear-gradient(180deg,#1a2a32,#0f1a20)}
      .rlz5-lesson-head{display:grid;grid-template-columns:44px 1fr 80px;align-items:center;gap:12px}
      .rlz5-close{border:0;background:transparent;color:rgba(255,255,255,.7);font-size:36px;line-height:1;cursor:pointer;padding:0;width:44px;height:44px}
      .rlz5-progress{height:14px;border-radius:999px;background:#2c3e48;overflow:hidden}
      .rlz5-progress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#7ee000,#58cc02);transition:width .35s ease}
      .rlz5-lesson-hearts{text-align:right;font-weight:900;font-size:18px;color:#ff4b4b}

      .rlz5-challenge-area{display:grid;gap:16px;align-content:start}
      .rlz5-challenge-meta{display:flex;justify-content:space-between;gap:10px;color:rgba(255,255,255,.55);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
      .rlz5-prompt{font-size:clamp(20px,3.5vw,30px);font-weight:900;line-height:1.15;color:#fff}
      .rlz5-mascot-row{display:grid;grid-template-columns:60px 1fr;gap:14px;align-items:center}
      .rlz5-mascot{font-size:48px;line-height:1}
      .rlz5-speech{padding:18px;border:2px solid #2c3e48;border-radius:18px;background:rgba(255,255,255,.03);font-size:clamp(18px,2.6vw,26px);font-weight:800;line-height:1.4;color:#fff}
      .rlz5-speech small{display:block;font-size:11px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;font-weight:800}
      .rlz5-speech.question{font-size:clamp(17px,2.6vw,22px)}
      .rlz5-blank{display:inline-block;min-width:90px;text-align:center;color:#7ee000;border-bottom:3px solid #647987;padding:0 8px}
      .rlz5-blank.filled{color:#7ee000;border-bottom-color:#58cc02}
      .rlz5-hint{font-size:13px;color:rgba(255,255,255,.55);font-weight:700}
      .rlz5-answer-slot{min-height:54px;display:grid;place-items:center;border:2px dashed #41555f;border-radius:16px;color:rgba(255,255,255,.4);font-size:18px;font-weight:900;padding:12px}
      .rlz5-answer-slot.filled{color:#7ee000;border-style:solid;border-color:#58cc02}
      .rlz5-bank{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}
      .rlz5-word{flex:0 1 auto;border:2px solid #2c3e48;background:#1d2e36;color:#fff;min-height:50px;padding:8px 16px;border-radius:14px;font-weight:900;cursor:pointer;box-shadow:0 4px 0 #0e1a20;font-size:14px;transition:.12s}
      .rlz5-word:hover{transform:translateY(-1px)}
      .rlz5-word.selected{border-color:#1cb0f6;color:#1cb0f6;background:rgba(28,176,246,.08)}
      .rlz5-word:disabled{cursor:default;opacity:.55}

      .rlz5-options{display:grid;gap:10px}
      .rlz5-option{display:flex;align-items:center;gap:12px;border:2px solid #2c3e48;background:#1d2e36;color:#fff;min-height:54px;padding:10px 16px;border-radius:14px;font-size:15px;font-weight:800;cursor:pointer;text-align:left;box-shadow:0 4px 0 #0e1a20;transition:.12s}
      .rlz5-option:hover:not(:disabled){transform:translateY(-1px)}
      .rlz5-option:disabled{cursor:default}
      .rlz5-option-key{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.08);color:rgba(255,255,255,.65);font-size:12px;font-weight:900;flex-shrink:0}
      .rlz5-option.selected{border-color:#1cb0f6;color:#fff;background:rgba(28,176,246,.1)}
      .rlz5-option.selected .rlz5-option-key{background:#1cb0f6;color:#fff}
      .rlz5-option.correct{border-color:#58cc02;background:rgba(88,204,2,.12);color:#7ee000}
      .rlz5-option.correct .rlz5-option-key{background:#58cc02;color:#fff}
      .rlz5-option.wrong{border-color:#ff4b4b;background:rgba(255,75,75,.12);color:#ff7b7b}
      .rlz5-option.wrong .rlz5-option-key{background:#ff4b4b;color:#fff}

      .rlz5-listen-bar{display:flex;gap:10px;margin:8px 0 4px}
      .rlz5-listen-big{flex:1;border:0;border-radius:18px;padding:18px 22px;background:linear-gradient(180deg,#46d5ff,#1cb0f6);color:#fff;font-size:36px;cursor:pointer;box-shadow:0 6px 0 #0b75a2;line-height:1}
      .rlz5-listen-small{border:0;border-radius:18px;padding:14px 18px;background:#1d2e36;border:2px solid #2c3e48;color:#fff;font-size:28px;cursor:pointer}

      .rlz5-match{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .rlz5-match>div{display:grid;gap:8px}
      .rlz5-match-btn{border:2px solid #2c3e48;background:#1d2e36;color:#fff;min-height:54px;padding:10px;border-radius:14px;font-size:14px;font-weight:900;cursor:pointer;box-shadow:0 4px 0 #0e1a20}
      .rlz5-match-btn.selected{border-color:#1cb0f6;color:#1cb0f6;background:rgba(28,176,246,.08)}
      .rlz5-match-btn.done{opacity:.4;border-color:#58cc02;color:#7ee000;background:rgba(88,204,2,.08)}
      .rlz5-match-btn:disabled{cursor:default}
      .rlz5-helper{color:rgba(255,255,255,.55);font-size:12px;font-weight:800}

      .rlz5-feedback{display:flex;gap:14px;align-items:flex-start;padding:14px 16px;border-radius:16px;margin-top:12px}
      .rlz5-feedback.ok{background:rgba(88,204,2,.12);border:2px solid rgba(88,204,2,.22);color:#7ee000}
      .rlz5-feedback.bad{background:rgba(255,75,75,.12);border:2px solid rgba(255,75,75,.22);color:#ff7b7b}
      .rlz5-fb-icon{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-weight:900;font-size:20px;flex-shrink:0}
      .rlz5-feedback.ok .rlz5-fb-icon{background:#58cc02;color:#fff}
      .rlz5-feedback.bad .rlz5-fb-icon{background:#ff4b4b;color:#fff}
      .rlz5-fb-body{flex:1;display:grid;gap:4px;color:#fff}
      .rlz5-fb-body strong{font-size:14px;color:#fff}
      .rlz5-fb-correct{font-size:15px;font-weight:900}
      .rlz5-feedback.ok .rlz5-fb-correct{color:#7ee000}
      .rlz5-feedback.bad .rlz5-fb-correct{color:#ff7b7b}
      .rlz5-fb-hint{font-size:12px;color:rgba(255,255,255,.65);font-weight:700}
      .rlz5-fb-xp{display:inline-flex;margin-top:4px;padding:4px 10px;border-radius:999px;background:rgba(255,208,0,.16);color:#ffd000;font-size:11px;font-weight:900;width:max-content}

      .rlz5-lesson-footer{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center}
      .rlz5-skip{border:0;border-radius:14px;background:transparent;color:rgba(255,255,255,.55);font-weight:900;font-size:13px;cursor:pointer;padding:14px 16px;text-transform:uppercase;letter-spacing:.06em;min-height:54px}
      .rlz5-check{border:0;border-radius:14px;min-height:54px;padding:0 22px;font-weight:900;cursor:pointer;background:#2c3e48;color:rgba(255,255,255,.45);font-size:15px;text-transform:uppercase;letter-spacing:.06em;transition:.12s}
      .rlz5-check.ready{background:linear-gradient(180deg,#7ee000,#58cc02);color:#fff;box-shadow:0 5px 0 #2f7d00}
      .rlz5-check.ready:hover{transform:translateY(-1px)}

      .rlz5-complete{min-height:calc(100vh - 130px);display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 25%,rgba(126,224,0,.18),transparent 35%),linear-gradient(180deg,#1a2a32,#0f1a20);color:#fff}
      .rlz5-complete-card{position:relative;width:min(100%,460px);padding:32px 26px;border-radius:30px;text-align:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);overflow:hidden}
      .rlz5-complete-rays{position:absolute;inset:-80px;background:conic-gradient(from 0deg,transparent,rgba(126,224,0,.18),transparent 25%,rgba(255,255,255,.06),transparent 45%);animation:rlz5Spin 8s linear infinite}
      .rlz5-complete-icon,.rlz5-complete-card h2,.rlz5-complete-card p,.rlz5-complete-stats,.rlz5-btn-primary{position:relative}
      .rlz5-complete-icon{font-size:72px;margin-bottom:8px;animation:rlz5Pop .5s ease}
      .rlz5-complete-card h2{font-family:'Playfair Display',serif;font-size:28px;letter-spacing:-.02em;margin-bottom:6px}
      .rlz5-complete-card p{color:rgba(255,255,255,.65);margin-bottom:20px}
      .rlz5-complete-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:22px}
      .rlz5-cs{padding:14px 8px;border-radius:16px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08)}
      .rlz5-cs strong{display:block;font-size:22px;font-weight:900}
      .rlz5-cs span{display:block;margin-top:4px;font-size:11px;font-weight:900;color:rgba(255,255,255,.55);letter-spacing:.06em;text-transform:uppercase}
      .rlz5-cs.xp strong{color:#ffd000}
      .rlz5-cs.gem strong{color:#46d5ff}
      .rlz5-cs.star strong{color:#ffd000;font-size:18px;letter-spacing:2px}
      @keyframes rlz5Spin{to{transform:rotate(360deg)}}
      @keyframes rlz5Pop{from{transform:scale(.7);opacity:.2}to{transform:scale(1);opacity:1}}

      /* ===== MOBİL & TABLET RESPONSIVE ===== */
      /* Sticky (yapışkan üst bar) bozulmasın: ata kapsayıcılar overflow:visible olmalı */
      #ravzaLingoRoot,.rlz5-shell,.rlz5-section{overflow:visible!important}
      /* Salınımlı yol + maskot yatay taşmasını kırp (clip → sticky'yi bozmaz) */
      .rlz5-path-track{overflow-x:clip}
      .rlz5-path-row{will-change:transform}

      /* Tablet ve küçük masaüstü */
      @media(max-width:1024px){
        .rlz5-shell{padding:18px 16px}
        .rlz5-topbar{padding:12px 14px;gap:10px}
        .rlz5-stat span{font-size:22px}
        .rlz5-stat b{font-size:15px}
      }

      /* Mobil (≤760px) */
      @media(max-width:760px){
        .ravzalingo-page{border-radius:0;min-height:calc(100dvh - 80px)}
        .rlz5-shell{padding:14px 12px;min-height:calc(100dvh - 80px)}
        .rlz5-lesson-shell{padding:14px 12px;min-height:calc(100dvh - 80px);grid-template-rows:auto 1fr;padding-bottom:90px;position:relative}

        /* TOPBAR: 4 sütun (progress'i sakla, kristali tut) — site barının altına yapışır */
        .rlz5-topbar{grid-template-columns:repeat(4,1fr);padding:10px 8px;gap:6px;backdrop-filter:blur(8px);top:70px}
        .rlz5-stat{grid-template-columns:1fr;justify-items:center;text-align:center;gap:2px;min-height:auto}
        .rlz5-stat span{font-size:20px;line-height:1}
        .rlz5-stat b{font-size:13px}
        .rlz5-stat small{display:none}
        /* Kalp geri sayımı mobilde de her zaman görünsün */
        .rlz5-stat.heart small{display:block!important;margin-top:1px;font-size:9.5px;color:#ff6b6b;letter-spacing:.04em;font-variant-numeric:tabular-nums}
        .rlz5-stat.progress{display:none}

        /* SECTION + BANNER */
        .rlz5-section-divider{padding:22px 4px 12px}
        .rlz5-section-divider h2{font-size:18px}
        .rlz5-section-divider>div{padding:9px 20px;border-radius:16px}
        .rlz5-section-divider>div::before{border-radius:0 0 16px 16px}
        .rlz5-section-divider .rlz5-section-kicker{font-size:10px;letter-spacing:.22em;margin-bottom:5px}
        .rlz5-unit-banner{padding:11px 12px;border-radius:14px;top:calc(124px + env(safe-area-inset-top,0px));gap:8px}
        .rlz5-banner-text strong{font-size:14px}
        .rlz5-banner-kicker{font-size:9px}
        .rlz5-banner-guide{width:38px;height:38px;font-size:15px}

        /* PATH NODE'LARI — viewport-relative offset (taşma yok) */
        .rlz5-path-track{padding:6px 0 24px}
        .rlz5-path-row{padding:8px 0}
        .rlz5-node{width:62px;height:62px;box-shadow:0 6px 0 var(--rlz-deep),0 12px 20px rgba(0,0,0,.28),inset 0 6px 10px rgba(255,255,255,.22)}
        .rlz5-node-icon{font-size:24px}
        .rlz5-path-row[data-offset="-2"]{transform:translateX(min(-22vw,-70px))}
        .rlz5-path-row[data-offset="-1"]{transform:translateX(min(-12vw,-38px))}
        .rlz5-path-row[data-offset="0"]{transform:none}
        .rlz5-path-row[data-offset="1"]{transform:translateX(max(12vw,38px))}
        .rlz5-path-row[data-offset="2"]{transform:translateX(max(22vw,70px))}

        /* MASKOT: ekran dışına taşmasın — node altında konumla */
        .rlz5-mascot-bubble{position:absolute;left:auto;right:-58px;top:-6px;transform:none;width:50px;height:50px;font-size:38px}
        .rlz5-path-row[data-offset="1"] .rlz5-mascot-bubble,
        .rlz5-path-row[data-offset="2"] .rlz5-mascot-bubble{right:auto;left:-58px}

        .rlz5-node-cta{font-size:10px;padding:5px 10px;top:-28px}

        /* DERS EKRANI */
        .rlz5-mascot-row{grid-template-columns:44px 1fr;gap:10px}
        .rlz5-mascot{font-size:34px}
        .rlz5-speech{padding:14px;font-size:16px;border-radius:14px;word-break:break-word}
        .rlz5-prompt{font-size:20px}
        .rlz5-bank{gap:8px}
        .rlz5-word{padding:8px 12px;font-size:13px;min-height:48px}
        .rlz5-option{padding:10px 12px;min-height:52px;font-size:14px;gap:10px}
        .rlz5-option-key{width:24px;height:24px;font-size:11px}
        .rlz5-match{grid-template-columns:1fr 1fr;gap:8px}
        .rlz5-match-btn{min-height:50px;font-size:13px;padding:8px 6px}
        .rlz5-listen-big{font-size:32px;padding:18px 20px}
        .rlz5-listen-small{font-size:26px;padding:14px;width:64px}
        .rlz5-lesson-head{grid-template-columns:40px 1fr 64px;gap:8px;align-items:center}
        .rlz5-close{font-size:30px;width:40px;height:40px}
        .rlz5-lesson-hearts{font-size:14px}

        /* FOOTER ALT YAPIŞTIR (scroll esnasında "Kontrol Et" görünsün) */
        .rlz5-lesson-footer{position:fixed;left:0;right:0;bottom:0;padding:12px 12px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(15,26,32,.0),#0f1a20 32%);grid-template-columns:auto 1fr;gap:10px;z-index:10}
        .rlz5-skip{padding:14px 12px;font-size:12px;min-height:50px}
        .rlz5-check{padding:0 16px;font-size:14px;min-height:50px}

        .rlz5-empty-actions{grid-template-columns:1fr}
        .rlz5-complete-card{padding:24px 18px;width:100%}
        .rlz5-complete-icon{font-size:60px}
        .rlz5-complete-card h2{font-size:22px}
        .rlz5-complete-stats{grid-template-columns:repeat(3,1fr);gap:8px}
        .rlz5-cs strong{font-size:18px}
        .rlz5-cs span{font-size:10px}

        .rlz5-feedback{padding:12px;gap:10px}
        .rlz5-fb-icon{width:32px;height:32px;font-size:16px}
        .rlz5-fb-body strong{font-size:13px}
        .rlz5-fb-correct{font-size:14px}

        .rlz5-footer-info{margin-top:20px;padding:12px;font-size:11px}
      }

      /* Küçük telefonlar (≤480px) */
      @media(max-width:480px){
        .rlz5-shell{padding:12px 10px}
        .rlz5-lesson-shell{padding:12px 10px;padding-bottom:90px}
        .rlz5-topbar{padding:8px 6px;gap:4px;border-radius:14px}
        .rlz5-stat span{font-size:18px}
        .rlz5-stat b{font-size:12px}

        .rlz5-section-divider{padding:20px 4px 10px}
        .rlz5-section-divider h2{font-size:17px}
        .rlz5-section-divider>div{padding:8px 18px}
        .rlz5-unit-banner{padding:10px 12px}
        .rlz5-banner-text strong{font-size:13px;white-space:normal;line-height:1.25}
        .rlz5-banner-guide{width:36px;height:36px;font-size:14px}

        .rlz5-prompt{font-size:18px}
        .rlz5-speech{font-size:15px;padding:12px}
        .rlz5-blank{min-width:60px;font-size:15px;padding:0 6px}
        .rlz5-bank{gap:6px}
        .rlz5-word{padding:7px 10px;font-size:12px;min-height:46px}
        .rlz5-option{padding:10px;min-height:50px;font-size:13px}
        .rlz5-match-btn{min-height:48px;font-size:12px}
        .rlz5-listen-big{font-size:28px;padding:16px}
        .rlz5-listen-small{font-size:22px;padding:12px;width:54px}

        /* Daha küçük node'lar ve daha sıkı offset */
        .rlz5-node{width:56px;height:56px;box-shadow:0 5px 0 var(--rlz-deep),0 10px 16px rgba(0,0,0,.28),inset 0 5px 8px rgba(255,255,255,.22)}
        .rlz5-node-icon{font-size:22px}
        .rlz5-path-row{padding:6px 0}
        .rlz5-path-row[data-offset="-2"]{transform:translateX(min(-20vw,-56px))}
        .rlz5-path-row[data-offset="-1"]{transform:translateX(min(-11vw,-30px))}
        .rlz5-path-row[data-offset="1"]{transform:translateX(max(11vw,30px))}
        .rlz5-path-row[data-offset="2"]{transform:translateX(max(20vw,56px))}
        .rlz5-mascot-bubble{width:42px;height:42px;font-size:32px;right:-46px;top:-2px}
        .rlz5-path-row[data-offset="1"] .rlz5-mascot-bubble,
        .rlz5-path-row[data-offset="2"] .rlz5-mascot-bubble{left:-46px}
        .rlz5-node-cta{font-size:9px;padding:4px 8px;top:-22px}

        .rlz5-complete-stats{grid-template-columns:1fr;gap:8px}
        .rlz5-cs{padding:10px 8px}

        .rlz5-skip{padding:12px 8px;font-size:11px}
        .rlz5-check{font-size:13px}
      }

      /* Çok dar telefon (≤360px) */
      @media(max-width:360px){
        .rlz5-shell{padding:10px 8px}
        .rlz5-topbar{grid-template-columns:repeat(3,1fr)}
        .rlz5-stat.gem{display:none}
        .rlz5-banner-text strong{font-size:12px}
        .rlz5-node{width:50px;height:50px}
        .rlz5-node-icon{font-size:19px}
        .rlz5-mascot-bubble{width:36px;height:36px;font-size:28px;right:-40px}
        .rlz5-path-row[data-offset="1"] .rlz5-mascot-bubble,
        .rlz5-path-row[data-offset="2"] .rlz5-mascot-bubble{left:-40px}
      }

      /* Yatay (landscape) telefon — ders ekranı çok yüksek olmasın */
      @media(max-height:500px) and (orientation:landscape){
        .rlz5-lesson-shell{min-height:auto;padding-bottom:80px}
        .rlz5-prompt{font-size:18px}
        .rlz5-mascot{font-size:30px}
        .rlz5-speech{padding:10px;font-size:15px}
        .rlz5-bank{gap:6px}
        .rlz5-word{min-height:40px;padding:6px 10px;font-size:12px}
        .rlz5-options{grid-template-columns:1fr 1fr;gap:8px}
        .rlz5-match{grid-template-columns:1fr 1fr}
      }

      /* --- KONU ÖZETİ POPUP --- */
      .rlz5-modal-overlay{position:fixed;inset:0;z-index:100000;background:rgba(8,14,18,.72);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:18px;opacity:0;visibility:hidden;transition:opacity .2s ease,visibility .2s ease}
      .rlz5-modal-overlay.is-open{opacity:1;visibility:visible}
      .rlz5-modal{width:min(100%,640px);max-height:88vh;display:flex;flex-direction:column;background:#16242c;color:#fff;border:1px solid rgba(255,255,255,.1);border-radius:22px;box-shadow:0 24px 60px rgba(0,0,0,.5);overflow:hidden;transform:translateY(14px) scale(.97);transition:transform .2s ease}
      .rlz5-modal-overlay.is-open .rlz5-modal{transform:translateY(0) scale(1)}
      .rlz5-modal-units{width:min(100%,860px)}
      .rlz5-modal-head{position:relative;display:flex;align-items:center;gap:14px;padding:20px 56px 18px 22px;background:linear-gradient(180deg,#1f2c34,#16222a);border-bottom:1px solid rgba(255,255,255,.08)}
      .rlz5-modal-icon{flex-shrink:0;width:54px;height:54px;border-radius:50%;display:grid;place-items:center;font-size:25px;background:linear-gradient(135deg,#ffc15e,#dd8a1c);box-shadow:0 6px 18px rgba(221,138,28,.35)}
      .rlz5-modal-headtext{min-width:0}
      .rlz5-modal-head h2{font-size:22px;font-weight:900;margin:0 0 3px;color:#fff}
      .rlz5-modal-head p{font-size:13px;color:rgba(255,255,255,.6);line-height:1.4;margin:0}
      .rlz5-modal-close{position:absolute;top:16px;right:16px;width:34px;height:34px;border:0;border-radius:50%;background:rgba(255,255,255,.08);color:#fff;font-size:15px;cursor:pointer;display:grid;place-items:center;transition:background .15s}
      .rlz5-modal-close:hover{background:rgba(255,255,255,.18)}
      .rlz5-modal-body{padding:16px 18px;overflow-y:auto;-webkit-overflow-scrolling:touch}
      .rlz5-modal-study{width:min(100%,920px)}
      .rlz5-modal-keypoints{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:14px 16px;margin-bottom:14px}
      .rlz5-modal-keypoints h3{font-size:15px;font-weight:900;margin:0 0 8px;color:#fff}
      .rlz5-modal-keypoints ul{margin:0;padding-left:18px}
      .rlz5-modal-keypoints li{font-size:13.5px;line-height:1.55;margin-bottom:6px;color:rgba(255,255,255,.9)}
      .rlz5-modal-summary{font-size:13.5px;line-height:1.62;color:rgba(255,255,255,.86)}
      .rlz5-modal-summary .content-card,.rlz5-modal-summary .lesson-hero,.rlz5-modal-summary .mini-summary-card,.rlz5-modal-summary .visual-note{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:13px 15px;margin-bottom:12px;color:rgba(255,255,255,.88)}
      .rlz5-modal-summary h3,.rlz5-modal-summary h4{font-size:15px;margin:0 0 8px;color:#fff}
      .rlz5-modal-summary p,.rlz5-modal-summary li{color:rgba(255,255,255,.84)}
      .rlz5-modal-summary strong{color:#fff}
      .rlz5-modal-summary .table-wrap{overflow-x:auto}
      .rlz5-modal-summary table{width:100%;border-collapse:collapse;font-size:12px}
      .rlz5-modal-summary th,.rlz5-modal-summary td{border:1px solid rgba(255,255,255,.12);padding:7px 8px;text-align:left;vertical-align:top;color:rgba(255,255,255,.82)}
      .rlz5-modal-summary th{color:#fff;background:rgba(255,255,255,.06)}
      .rlz5-modal-summary ul,.rlz5-modal-summary ol{padding-left:18px}

      /* Ünite içerikleri tablosu */
      .rlz5-uc-head,.rlz5-uc-row{display:grid;grid-template-columns:64px 96px 1fr 138px 22px;gap:12px;align-items:center}
      .rlz5-uc-head{padding:0 16px 8px;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.42)}
      .rlz5-uc-list{display:flex;flex-direction:column;gap:8px}
      .rlz5-uc-row{width:100%;text-align:left;padding:12px 16px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025);color:#fff;cursor:pointer;transition:background .14s,border-color .14s,transform .1s}
      .rlz5-uc-row:hover{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.2)}
      .rlz5-uc-row:active{transform:scale(.995)}
      .rlz5-uc-row.is-current{background:linear-gradient(135deg,rgba(88,204,2,.24),rgba(45,118,0,.18));border-color:rgba(88,204,2,.6);box-shadow:0 0 20px rgba(88,204,2,.16)}
      .rlz5-uc-row.is-locked{opacity:.62}
      .rlz5-uc-secbadge{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:900;font-size:14px;border:2px solid rgba(255,255,255,.22);color:rgba(255,255,255,.78)}
      .rlz5-uc-row.is-current .rlz5-uc-secbadge{background:#58cc02;border-color:#9be64f;color:#0a2a05}
      .rlz5-uc-unit{font-weight:800;font-size:14px;color:rgba(255,255,255,.92)}
      .rlz5-uc-topic{display:flex;align-items:center;gap:11px;min-width:0;font-weight:800;font-size:15px}
      .rlz5-uc-ico{flex-shrink:0;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;font-size:16px;background:rgba(255,255,255,.08)}
      .rlz5-uc-row.is-current .rlz5-uc-ico{background:rgba(88,204,2,.28)}
      .rlz5-uc-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .rlz5-uc-status{justify-self:start;display:inline-flex;align-items:center;gap:6px;padding:6px 13px;border-radius:999px;font-size:12px;font-weight:800;border:1px solid transparent;white-space:nowrap}
      .rlz5-uc-status-done{background:rgba(88,204,2,.18);color:#8be63c;border-color:rgba(88,204,2,.4)}
      .rlz5-uc-status-ready{background:rgba(28,176,246,.16);color:#5bccff;border-color:rgba(28,176,246,.35)}
      .rlz5-uc-status-progress{background:rgba(255,150,0,.16);color:#ffb84d;border-color:rgba(255,150,0,.35)}
      .rlz5-uc-status-locked{background:rgba(255,255,255,.05);color:rgba(255,255,255,.5);border-color:rgba(255,255,255,.12)}
      .rlz5-uc-chev{justify-self:end;font-size:21px;line-height:1;color:rgba(255,255,255,.4);transition:transform .14s,color .14s}
      .rlz5-uc-row:hover .rlz5-uc-chev{color:#fff;transform:translateX(3px)}
      .rlz5-uc-foot{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
      .rlz5-uc-note{flex:1;min-width:200px;display:flex;align-items:center;gap:10px;font-size:12.5px;color:rgba(255,255,255,.6);line-height:1.4}
      .rlz5-uc-noteico{flex-shrink:0;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:900;font-style:italic;border:1px solid rgba(255,255,255,.25);color:rgba(255,255,255,.7)}
      .rlz5-uc-foot .rlz5-uc-progbtn{flex:0 0 auto;width:auto;padding:11px 18px;color:#ffd54f;border:1px solid rgba(255,213,79,.4);background:rgba(255,213,79,.08);text-transform:none;letter-spacing:0;font-size:13px}
      .rlz5-uc-foot .rlz5-uc-progbtn:hover{background:rgba(255,213,79,.15)}
      .rlz5-all-list{display:grid;gap:16px}
      .rlz5-all-section{display:grid;gap:9px}
      .rlz5-all-title{display:flex;align-items:center;gap:10px;margin:2px 4px 0;color:rgba(255,255,255,.86);font-size:13px;font-weight:900;letter-spacing:.09em;text-transform:uppercase}
      .rlz5-all-title::after{content:"";height:1px;flex:1;background:rgba(255,255,255,.10)}
      .rlz5-all-topic{width:100%;display:grid;grid-template-columns:42px 1fr auto;gap:12px;align-items:center;text-align:left;padding:12px 14px;border-radius:16px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025);color:#fff;cursor:pointer;transition:background .14s,border-color .14s,transform .1s}
      .rlz5-all-topic:hover{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.2);transform:translateY(-1px)}
      .rlz5-all-topic.is-current{background:linear-gradient(135deg,rgba(255,213,79,.18),rgba(255,150,0,.10));border-color:rgba(255,213,79,.45)}
      .rlz5-all-ico{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:rgba(255,255,255,.08);font-size:20px}
      .rlz5-all-copy{display:grid;gap:3px;min-width:0}
      .rlz5-all-copy strong{font-size:15px;font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .rlz5-all-copy small{color:rgba(255,255,255,.55);font-size:12px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .rlz5-all-status{justify-self:end;font-size:12px;font-weight:900;color:#ffd54f;white-space:nowrap}
      .rlz5-modal-foot{display:flex;gap:10px;padding:14px 18px;border-top:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.18)}
      .rlz5-modal-foot button{flex:1}
      @media(max-width:620px){
        .rlz5-modal-units{width:100%;max-height:92vh}
        .rlz5-modal-head{padding:16px 50px 14px 16px;gap:11px}
        .rlz5-modal-icon{width:44px;height:44px;font-size:21px}
        .rlz5-modal-head h2{font-size:18px}
        .rlz5-modal-head p{font-size:12px}
        .rlz5-modal-body{padding:12px 12px}
        .rlz5-uc-head{display:none}
        .rlz5-uc-row{grid-template-columns:auto 1fr;gap:8px 10px;padding:10px 12px;align-items:center}
        .rlz5-uc-secbadge{display:none}
        .rlz5-uc-chev{display:none}
        .rlz5-uc-unit{grid-row:1;font-size:11px;color:rgba(255,255,255,.5);font-weight:800;letter-spacing:.06em;text-transform:uppercase}
        .rlz5-uc-topic{grid-row:2;grid-column:1/-1;font-size:14px;gap:9px}
        .rlz5-uc-ico{width:27px;height:27px;font-size:14px}
        .rlz5-uc-status{grid-row:1;grid-column:2;justify-self:end;padding:4px 10px;font-size:11px}
        .rlz5-uc-foot{padding:12px}
        .rlz5-uc-note{font-size:11.5px;min-width:140px}
        .rlz5-uc-progbtn{width:100%;flex:1 1 100%}
        .rlz5-all-topic{grid-template-columns:34px 1fr;padding:10px 12px;gap:10px}
        .rlz5-all-ico{width:34px;height:34px;border-radius:11px;font-size:17px}
        .rlz5-all-copy strong{font-size:14px;white-space:normal}
        .rlz5-all-copy small{font-size:11.5px;white-space:normal}
        .rlz5-all-status{grid-column:2;justify-self:start}
      }

      /* Tema uyumlu RavzaLingo pop-up ve banner finali */
      .rlz5-unit-banner{
        background:
          radial-gradient(circle at 92% 20%, color-mix(in srgb,var(--rlz-main) 26%, transparent), transparent 34%),
          linear-gradient(135deg, color-mix(in srgb,var(--white) 94%, var(--rlz-main) 6%), color-mix(in srgb,var(--input-bg) 86%, var(--rlz-deep) 14%));
        border:1px solid color-mix(in srgb,var(--rlz-main) 34%, var(--card-border) 66%);
        box-shadow:0 16px 38px rgba(15,23,42,.16), inset 0 1px 0 rgba(255,255,255,.18);
      }
      .rlz5-unit-banner.is-done{
        background:
          radial-gradient(circle at 92% 20%, color-mix(in srgb,var(--success) 22%, transparent), transparent 34%),
          linear-gradient(135deg, color-mix(in srgb,var(--white) 92%, var(--success) 8%), color-mix(in srgb,var(--input-bg) 88%, var(--success) 12%));
        border-color:color-mix(in srgb,var(--success) 38%, var(--card-border) 62%);
      }
      .rlz5-unit-banner.is-locked{
        background:linear-gradient(135deg, color-mix(in srgb,var(--white) 88%, #64748b 12%), color-mix(in srgb,var(--input-bg) 88%, #64748b 12%));
        border-color:color-mix(in srgb,var(--card-border) 78%, #64748b 22%);
        box-shadow:0 12px 28px rgba(15,23,42,.12);
      }
      .rlz5-banner-main{color:var(--text);border:1px solid transparent}
      .rlz5-banner-main:hover{background:color-mix(in srgb,var(--rlz-main) 10%, transparent)}
      .rlz5-banner-main:focus-visible,.rlz5-banner-guide:focus-visible{box-shadow:0 0 0 3px color-mix(in srgb,var(--pink) 26%, transparent)}
      .rlz5-banner-text,.rlz5-banner-text strong{color:var(--text)}
      .rlz5-banner-kicker{color:color-mix(in srgb,var(--text) 72%, var(--rlz-main) 28%)}
      .rlz5-banner-guide{
        background:linear-gradient(135deg, color-mix(in srgb,var(--pink) 72%, var(--navy-light) 28%), var(--pink-bright));
        border:1px solid color-mix(in srgb,var(--pink-bright) 52%, transparent);
        color:#fff;
        box-shadow:0 10px 22px color-mix(in srgb,var(--pink) 24%, transparent);
      }
      .rlz5-banner-guide:hover{
        background:linear-gradient(135deg, var(--pink), var(--pink-bright));
        filter:brightness(1.04);
      }
      body.dark .rlz5-unit-banner{
        background:
          radial-gradient(circle at 92% 20%, color-mix(in srgb,var(--rlz-main) 20%, transparent), transparent 34%),
          linear-gradient(135deg, color-mix(in srgb,var(--white) 88%, var(--rlz-main) 12%), color-mix(in srgb,var(--input-bg) 84%, var(--rlz-deep) 16%));
        border-color:color-mix(in srgb,var(--rlz-main) 30%, var(--card-border) 70%);
        box-shadow:0 18px 44px rgba(0,0,0,.26), inset 0 1px 0 rgba(255,255,255,.06);
      }
      body.dark .rlz5-banner-text,
      body.dark .rlz5-banner-text strong{color:#fff7fb}
      body.dark .rlz5-banner-kicker{color:color-mix(in srgb,#fff7fb 74%, var(--rlz-main) 26%)}

      .rlz5-modal-overlay{
        background:rgba(6,10,18,.66);
        backdrop-filter:blur(14px) saturate(1.12);
        -webkit-backdrop-filter:blur(14px) saturate(1.12);
      }
      .rlz5-modal{
        width:min(100%,940px);
        max-height:min(88vh,820px);
        color:var(--text);
        background:
          radial-gradient(circle at 8% 0%, color-mix(in srgb,var(--pink) 14%, transparent), transparent 30%),
          linear-gradient(180deg, color-mix(in srgb,var(--white) 96%, transparent), color-mix(in srgb,var(--input-bg) 92%, transparent));
        border:1px solid color-mix(in srgb,var(--card-border) 72%, var(--pink) 28%);
        border-radius:28px;
        box-shadow:0 34px 90px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.18);
      }
      .rlz5-modal-units,.rlz5-modal-study{width:min(100%,980px)}
      .rlz5-modal-head{
        background:transparent;
        border-bottom:1px solid color-mix(in srgb,var(--card-border) 82%, var(--pink) 18%);
        padding:22px 62px 20px 24px;
      }
      .rlz5-modal-icon{
        background:linear-gradient(135deg, var(--pink), var(--pink-bright));
        color:#fff;
        border-radius:20px;
        box-shadow:0 16px 34px color-mix(in srgb,var(--pink) 28%, transparent);
      }
      .rlz5-modal-head h2{color:var(--text);font-size:25px;letter-spacing:0}
      .rlz5-modal-head p{color:var(--text-light);font-weight:700}
      .rlz5-modal-close{
        background:var(--input-bg);
        color:var(--text);
        border:1px solid var(--card-border);
        box-shadow:var(--shadow-xs);
      }
      .rlz5-modal-close:hover{background:color-mix(in srgb,var(--pink-pale) 56%, var(--input-bg))}
      .rlz5-modal-body{padding:18px 20px;scrollbar-color:var(--pink) transparent}
      .rlz5-uc-head{color:color-mix(in srgb,var(--text-light) 88%, var(--text) 12%)}
      .rlz5-uc-row,.rlz5-all-topic{
        background:color-mix(in srgb,var(--input-bg) 86%, transparent);
        color:var(--text);
        border-color:color-mix(in srgb,var(--card-border) 78%, var(--pink) 22%);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.08);
      }
      .rlz5-uc-row:hover,.rlz5-all-topic:hover{
        background:color-mix(in srgb,var(--pink-pale) 42%, var(--input-bg));
        border-color:color-mix(in srgb,var(--pink) 44%, var(--card-border));
      }
      .rlz5-uc-row.is-current,.rlz5-all-topic.is-current{
        background:
          radial-gradient(circle at 0 0, color-mix(in srgb,var(--pink) 18%, transparent), transparent 34%),
          color-mix(in srgb,var(--pink-pale) 54%, var(--input-bg));
        border-color:color-mix(in srgb,var(--pink) 58%, var(--card-border));
        box-shadow:0 14px 28px color-mix(in srgb,var(--pink) 13%, transparent), inset 0 1px 0 rgba(255,255,255,.10);
      }
      .rlz5-uc-row.is-locked,.rlz5-all-topic.is-locked{opacity:.72;filter:saturate(.82)}
      .rlz5-uc-secbadge,.rlz5-uc-ico,.rlz5-all-ico{
        background:color-mix(in srgb,var(--pink-pale) 54%, var(--input-bg));
        color:var(--text);
        border:1px solid color-mix(in srgb,var(--pink) 20%, var(--card-border));
      }
      .rlz5-uc-row.is-current .rlz5-uc-secbadge,.rlz5-uc-row.is-current .rlz5-uc-ico,.rlz5-all-topic.is-current .rlz5-all-ico{
        background:linear-gradient(135deg,var(--pink),var(--pink-bright));
        border-color:transparent;
        color:#fff;
      }
      .rlz5-uc-unit,.rlz5-uc-topic,.rlz5-uc-name,.rlz5-all-copy strong{color:var(--text)}
      .rlz5-all-copy small{color:var(--text-light)}
      .rlz5-uc-chev{color:color-mix(in srgb,var(--text-light) 72%, transparent)}
      .rlz5-uc-row:hover .rlz5-uc-chev{color:var(--pink);transform:translateX(3px)}
      .rlz5-uc-status,.rlz5-all-status{border:1px solid transparent;border-radius:999px;padding:6px 11px;font-size:12px;font-weight:900}
      .rlz5-uc-status-done,.rlz5-all-status-done,.rlz5-uc-status-ready,.rlz5-all-status-ready{
        color:var(--success);
        background:color-mix(in srgb,var(--success) 12%, transparent);
        border-color:color-mix(in srgb,var(--success) 28%, transparent);
      }
      .rlz5-uc-status-progress,.rlz5-all-status-progress{
        color:var(--warning);
        background:color-mix(in srgb,var(--warning) 13%, transparent);
        border-color:color-mix(in srgb,var(--warning) 28%, transparent);
      }
      .rlz5-uc-status-locked,.rlz5-all-status-locked{
        color:var(--text-light);
        background:color-mix(in srgb,var(--text-light) 10%, transparent);
        border-color:color-mix(in srgb,var(--text-light) 22%, transparent);
      }
      .rlz5-all-title{
        color:color-mix(in srgb,var(--text) 76%, var(--pink) 24%);
      }
      .rlz5-all-title::after{background:color-mix(in srgb,var(--card-border) 78%, var(--pink) 22%)}
      .rlz5-modal-keypoints,.rlz5-modal-summary .content-card,.rlz5-modal-summary .lesson-hero,.rlz5-modal-summary .mini-summary-card,.rlz5-modal-summary .visual-note{
        background:color-mix(in srgb,var(--input-bg) 86%, transparent);
        border-color:color-mix(in srgb,var(--card-border) 78%, var(--pink) 22%);
        color:var(--text);
      }
      .rlz5-modal-keypoints h3,.rlz5-modal-summary h3,.rlz5-modal-summary h4,.rlz5-modal-summary strong{color:var(--text)}
      .rlz5-modal-keypoints li,.rlz5-modal-summary,.rlz5-modal-summary p,.rlz5-modal-summary li,.rlz5-modal-summary td{color:var(--text)}
      .rlz5-modal-summary th{color:var(--text);background:color-mix(in srgb,var(--pink-pale) 48%, var(--input-bg))}
      .rlz5-modal-summary th,.rlz5-modal-summary td{border-color:color-mix(in srgb,var(--card-border) 82%, var(--pink) 18%)}
      .rlz5-modal-foot{
        background:color-mix(in srgb,var(--input-bg) 92%, transparent);
        border-top:1px solid color-mix(in srgb,var(--card-border) 82%, var(--pink) 18%);
      }
      .rlz5-uc-note{color:var(--text-light)}
      .rlz5-uc-noteico{border-color:var(--card-border);color:var(--pink);background:var(--white)}
      .rlz5-uc-foot .rlz5-uc-progbtn,.rlz5-modal-foot .rlz5-btn-secondary{
        color:var(--pink);
        background:color-mix(in srgb,var(--pink-pale) 58%, var(--input-bg));
        border:1px solid color-mix(in srgb,var(--pink) 32%, var(--card-border));
        box-shadow:none;
      }
      .rlz5-modal-foot .rlz5-btn-primary{
        background:linear-gradient(135deg,var(--pink),var(--pink-bright));
        color:#fff;
        box-shadow:0 12px 28px color-mix(in srgb,var(--pink) 24%, transparent);
      }
      body.dark .rlz5-modal{
        background:
          radial-gradient(circle at 8% 0%, color-mix(in srgb,var(--pink-bright) 12%, transparent), transparent 30%),
          linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.018)),
          var(--white);
        border-color:rgba(255,255,255,.12);
        box-shadow:0 36px 92px rgba(0,0,0,.48), inset 0 1px 0 rgba(255,255,255,.06);
      }
      body.dark .rlz5-modal-head h2,
      body.dark .rlz5-uc-unit,
      body.dark .rlz5-uc-topic,
      body.dark .rlz5-uc-name,
      body.dark .rlz5-all-copy strong,
      body.dark .rlz5-modal-keypoints h3,
      body.dark .rlz5-modal-summary h3,
      body.dark .rlz5-modal-summary h4,
      body.dark .rlz5-modal-summary strong{color:#fff7fb}
      body.dark .rlz5-modal-summary,
      body.dark .rlz5-modal-keypoints li,
      body.dark .rlz5-modal-summary p,
      body.dark .rlz5-modal-summary li,
      body.dark .rlz5-modal-summary td{color:#f1d6e1}

      /* RavzaLingo teması: iki pop-up ve iki banner aksiyonu aynı oyun dili */
      #ravzaLingoRoot .rlz5-unit-banner{
        background:
          radial-gradient(circle at 92% 16%, rgba(255,255,255,.13), transparent 25%),
          linear-gradient(135deg,var(--rlz-main),var(--rlz-deep));
        border:1px solid color-mix(in srgb,var(--rlz-light) 46%, transparent);
        box-shadow:0 6px 0 var(--rlz-deep),0 18px 36px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.15);
      }
      #ravzaLingoRoot .rlz5-unit-banner.is-done{
        background:
          radial-gradient(circle at 92% 16%, rgba(255,255,255,.16), transparent 25%),
          linear-gradient(135deg,#ffd000,#ae8500);
        border-color:rgba(255,224,102,.48);
        box-shadow:0 6px 0 #7d5500,0 18px 36px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.18);
      }
      #ravzaLingoRoot .rlz5-unit-banner.is-locked{
        background:linear-gradient(135deg,#40525e,#1d2b31);
        border-color:rgba(255,255,255,.08);
        box-shadow:0 6px 0 #0b141a,0 18px 36px rgba(0,0,0,.25);
      }
      #ravzaLingoRoot .rlz5-banner-main{
        color:#fff;
        border-radius:13px;
      }
      #ravzaLingoRoot .rlz5-banner-main:hover{
        background:rgba(255,255,255,.10);
      }
      #ravzaLingoRoot .rlz5-banner-main:focus-visible,
      #ravzaLingoRoot .rlz5-banner-guide:focus-visible{
        box-shadow:0 0 0 3px rgba(126,224,0,.34);
      }
      #ravzaLingoRoot .rlz5-banner-text,
      #ravzaLingoRoot .rlz5-banner-text strong,
      body.dark #ravzaLingoRoot .rlz5-banner-text,
      body.dark #ravzaLingoRoot .rlz5-banner-text strong{
        color:#fff;
      }
      #ravzaLingoRoot .rlz5-banner-kicker,
      body.dark #ravzaLingoRoot .rlz5-banner-kicker{
        color:rgba(255,255,255,.86);
      }
      #ravzaLingoRoot .rlz5-banner-guide{
        background:
          radial-gradient(circle at 35% 25%, rgba(255,255,255,.22), transparent 34%),
          linear-gradient(180deg,#ffe066,#ffb800);
        color:#7d5500;
        border:1px solid rgba(255,255,255,.20);
        box-shadow:0 5px 0 #a37d00,0 12px 24px rgba(0,0,0,.20);
      }
      #ravzaLingoRoot .rlz5-banner-guide:hover{
        background:linear-gradient(180deg,#fff0a3,#ffd000);
        filter:none;
        transform:translateY(-1px);
      }

      .rlz5-modal-overlay{
        background:rgba(5,12,16,.74);
        backdrop-filter:blur(15px) saturate(1.1);
        -webkit-backdrop-filter:blur(15px) saturate(1.1);
      }
      .rlz5-modal,
      body.dark .rlz5-modal{
        color:#fff;
        background:
          radial-gradient(circle at 8% 0%, rgba(126,224,0,.10), transparent 30%),
          radial-gradient(circle at 96% 4%, rgba(28,176,246,.10), transparent 26%),
          linear-gradient(180deg,#1a2a32,#101a20);
        border:1px solid rgba(126,151,163,.36);
        border-radius:28px;
        box-shadow:0 34px 92px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.07);
      }
      .rlz5-modal-units,
      .rlz5-modal-study{
        width:min(100%,980px);
      }
      .rlz5-modal-head{
        background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.015));
        border-bottom:1px solid rgba(255,255,255,.08);
      }
      .rlz5-modal-icon{
        background:
          radial-gradient(circle at 34% 24%,rgba(255,255,255,.28),transparent 34%),
          linear-gradient(180deg,#ffe066,#ff9600);
        color:#7d5500;
        border:1px solid rgba(255,255,255,.18);
        box-shadow:0 7px 0 #a35a00,0 18px 36px rgba(255,150,0,.20);
      }
      .rlz5-modal-head h2,
      body.dark .rlz5-modal-head h2{
        color:#fff;
        font-weight:950;
      }
      .rlz5-modal-head p{
        color:rgba(255,255,255,.66);
      }
      .rlz5-modal-close{
        background:rgba(255,255,255,.08);
        color:#fff;
        border:1px solid rgba(255,255,255,.09);
        box-shadow:0 8px 18px rgba(0,0,0,.22);
      }
      .rlz5-modal-close:hover{
        background:rgba(255,255,255,.15);
      }
      .rlz5-modal-body{
        scrollbar-color:#7ee000 transparent;
      }
      .rlz5-modal-body::-webkit-scrollbar{width:10px}
      .rlz5-modal-body::-webkit-scrollbar-track{background:transparent}
      .rlz5-modal-body::-webkit-scrollbar-thumb{
        background:linear-gradient(180deg,#7ee000,#58cc02);
        border-radius:999px;
        border:3px solid #101a20;
      }
      .rlz5-uc-head{
        color:rgba(255,255,255,.58);
      }
      .rlz5-uc-row,
      .rlz5-all-topic{
        background:rgba(255,255,255,.035);
        color:#fff;
        border:1px solid rgba(255,255,255,.09);
        box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
      }
      .rlz5-uc-row:hover,
      .rlz5-all-topic:hover{
        background:rgba(255,255,255,.065);
        border-color:rgba(126,224,0,.36);
      }
      .rlz5-uc-row.is-current,
      .rlz5-all-topic.is-current{
        background:
          radial-gradient(circle at 0 0,rgba(255,224,102,.16),transparent 35%),
          linear-gradient(135deg,rgba(255,208,0,.22),rgba(163,125,0,.12));
        border-color:rgba(255,208,0,.72);
        box-shadow:0 16px 32px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.10);
      }
      .rlz5-uc-row.is-locked,
      .rlz5-all-topic.is-locked{
        opacity:.70;
        filter:saturate(.78);
      }
      .rlz5-uc-secbadge,
      .rlz5-uc-ico,
      .rlz5-all-ico{
        background:rgba(255,255,255,.08);
        color:#fff;
        border:1px solid rgba(255,255,255,.10);
      }
      .rlz5-uc-row.is-current .rlz5-uc-secbadge,
      .rlz5-uc-row.is-current .rlz5-uc-ico,
      .rlz5-all-topic.is-current .rlz5-all-ico{
        background:linear-gradient(180deg,#ffe066,#ffd000);
        color:#7d5500;
        border-color:rgba(255,255,255,.22);
      }
      .rlz5-uc-unit,
      .rlz5-uc-topic,
      .rlz5-uc-name,
      .rlz5-all-copy strong,
      body.dark .rlz5-uc-unit,
      body.dark .rlz5-uc-topic,
      body.dark .rlz5-uc-name,
      body.dark .rlz5-all-copy strong{
        color:#fff;
      }
      .rlz5-all-copy small{
        color:rgba(255,255,255,.58);
      }
      .rlz5-uc-chev{
        color:rgba(255,255,255,.52);
      }
      .rlz5-uc-row:hover .rlz5-uc-chev{
        color:#7ee000;
      }
      .rlz5-uc-status-done,
      .rlz5-all-status-done,
      .rlz5-uc-status-ready,
      .rlz5-all-status-ready{
        color:#7ee000;
        background:rgba(88,204,2,.14);
        border-color:rgba(126,224,0,.34);
      }
      .rlz5-uc-status-progress,
      .rlz5-all-status-progress{
        color:#ffd000;
        background:rgba(255,208,0,.13);
        border-color:rgba(255,208,0,.32);
      }
      .rlz5-uc-status-locked,
      .rlz5-all-status-locked{
        color:rgba(255,255,255,.55);
        background:rgba(255,255,255,.05);
        border-color:rgba(255,255,255,.10);
      }
      .rlz5-all-title{
        color:rgba(255,255,255,.86);
      }
      .rlz5-all-title::after{
        background:linear-gradient(90deg,rgba(255,255,255,.10),transparent);
      }
      .rlz5-modal-keypoints,
      .rlz5-modal-summary .content-card,
      .rlz5-modal-summary .lesson-hero,
      .rlz5-modal-summary .mini-summary-card,
      .rlz5-modal-summary .visual-note{
        background:rgba(255,255,255,.035);
        border-color:rgba(126,224,0,.18);
        color:rgba(255,255,255,.88);
      }
      .rlz5-modal-keypoints h3,
      .rlz5-modal-summary h3,
      .rlz5-modal-summary h4,
      .rlz5-modal-summary strong,
      body.dark .rlz5-modal-keypoints h3,
      body.dark .rlz5-modal-summary h3,
      body.dark .rlz5-modal-summary h4,
      body.dark .rlz5-modal-summary strong{
        color:#fff;
      }
      .rlz5-modal-keypoints li,
      .rlz5-modal-summary,
      .rlz5-modal-summary p,
      .rlz5-modal-summary li,
      .rlz5-modal-summary td,
      body.dark .rlz5-modal-summary,
      body.dark .rlz5-modal-keypoints li,
      body.dark .rlz5-modal-summary p,
      body.dark .rlz5-modal-summary li,
      body.dark .rlz5-modal-summary td{
        color:rgba(255,255,255,.86);
      }
      .rlz5-modal-summary th{
        color:#fff;
        background:rgba(126,224,0,.09);
      }
      .rlz5-modal-summary th,
      .rlz5-modal-summary td{
        border-color:rgba(126,224,0,.16);
      }
      .rlz5-modal-foot{
        background:rgba(0,0,0,.22);
        border-top:1px solid rgba(255,255,255,.08);
      }
      .rlz5-uc-note{
        color:rgba(255,255,255,.62);
      }
      .rlz5-uc-noteico{
        background:rgba(255,255,255,.07);
        border-color:rgba(255,255,255,.14);
        color:#7ee000;
      }
      .rlz5-uc-foot .rlz5-uc-progbtn,
      .rlz5-modal-foot .rlz5-btn-secondary{
        color:#7ee000;
        background:rgba(88,204,2,.10);
        border:1px solid rgba(126,224,0,.30);
        box-shadow:none;
      }
      .rlz5-uc-foot .rlz5-uc-progbtn:hover,
      .rlz5-modal-foot .rlz5-btn-secondary:hover{
        background:rgba(88,204,2,.16);
      }
      .rlz5-modal-foot .rlz5-btn-primary{
        background:linear-gradient(180deg,#7ee000,#58cc02);
        color:#fff;
        border:0;
        box-shadow:0 5px 0 #2f7d00,0 14px 26px rgba(40,120,0,.28);
      }
      .rlz5-modal-foot .rlz5-btn-primary:hover{
        filter:brightness(1.04);
      }

      /* RavzaLingo beyaz oyun teması: tüm konu listesi + çalışma pop-up + banner */
      #ravzaLingoRoot .rlz5-unit-banner{
        background:
          radial-gradient(circle at 95% 18%,rgba(88,204,2,.12),transparent 25%),
          linear-gradient(180deg,#fffefa,#fffdf5);
        color:#2b2d33;
        border:2px solid #e5e5df;
        border-radius:22px;
        box-shadow:0 5px 0 #d9ddd1,0 18px 34px rgba(20,24,32,.10),inset 0 1px 0 rgba(255,255,255,.95);
      }
      #ravzaLingoRoot .rlz5-unit-banner.is-done{
        background:
          radial-gradient(circle at 95% 18%,rgba(88,204,2,.16),transparent 25%),
          linear-gradient(180deg,#ffffff,#f7fff1);
        border-color:#b7eaa0;
        box-shadow:0 5px 0 #8fd476,0 18px 34px rgba(45,118,0,.12),inset 0 1px 0 rgba(255,255,255,.95);
      }
      #ravzaLingoRoot .rlz5-unit-banner.is-locked{
        background:linear-gradient(180deg,#ffffff,#f7f7f2);
        border-color:#e3e3df;
        box-shadow:0 5px 0 #d7d7d2,0 14px 28px rgba(20,24,32,.08);
      }
      #ravzaLingoRoot .rlz5-banner-main{
        color:#2b2d33;
        border-radius:18px;
      }
      #ravzaLingoRoot .rlz5-banner-main:hover{
        background:#f2ffe9;
      }
      #ravzaLingoRoot .rlz5-banner-text,
      #ravzaLingoRoot .rlz5-banner-text strong,
      body.dark #ravzaLingoRoot .rlz5-banner-text,
      body.dark #ravzaLingoRoot .rlz5-banner-text strong{
        color:#2b2d33;
      }
      #ravzaLingoRoot .rlz5-banner-kicker,
      body.dark #ravzaLingoRoot .rlz5-banner-kicker{
        color:#58cc02;
      }
      #ravzaLingoRoot .rlz5-banner-main:focus-visible,
      #ravzaLingoRoot .rlz5-banner-guide:focus-visible{
        box-shadow:0 0 0 4px rgba(88,204,2,.22);
      }
      #ravzaLingoRoot .rlz5-banner-guide{
        background:
          radial-gradient(circle at 35% 24%,rgba(255,255,255,.36),transparent 34%),
          linear-gradient(180deg,#7ee000,#58cc02);
        color:#fff;
        border:0;
        border-radius:18px;
        box-shadow:0 5px 0 #2f7d00,0 12px 24px rgba(88,204,2,.22);
      }
      #ravzaLingoRoot .rlz5-banner-guide:hover{
        background:linear-gradient(180deg,#8eed12,#58cc02);
        transform:translateY(-1px);
      }

      .rlz5-modal-overlay{
        background:rgba(11,18,22,.54);
        backdrop-filter:blur(18px) saturate(1.08);
        -webkit-backdrop-filter:blur(18px) saturate(1.08);
      }
      .rlz5-modal,
      body.dark .rlz5-modal{
        color:#2b2d33;
        background:
          radial-gradient(circle at 12% 0%,rgba(126,224,0,.13),transparent 26%),
          radial-gradient(circle at 100% 8%,rgba(255,208,0,.12),transparent 24%),
          linear-gradient(180deg,#fffefa,#fffdf7 62%,#fbfaf3);
        border:3px solid #ecece7;
        border-radius:32px;
        box-shadow:0 30px 80px rgba(20,24,32,.26),inset 0 1px 0 rgba(255,255,255,.98);
      }
      .rlz5-modal-units,
      .rlz5-modal-study{
        width:min(100%,1040px);
      }
      .rlz5-modal-head{
        padding:24px 72px 22px 30px;
        background:transparent;
        border-bottom:2px solid #ecece7;
      }
      .rlz5-modal-icon{
        width:76px;
        height:76px;
        border-radius:28px;
        background:
          radial-gradient(circle at 35% 24%,rgba(255,255,255,.55),transparent 34%),
          linear-gradient(180deg,#ffe86a,#ffb800);
        color:#805c00;
        border:0;
        box-shadow:0 8px 0 #e5a400,0 18px 32px rgba(255,184,0,.22);
        font-size:34px;
      }
      .rlz5-modal-units .rlz5-modal-icon{
        border-radius:50%;
        background:
          radial-gradient(circle at 35% 24%,rgba(255,255,255,.50),transparent 34%),
          linear-gradient(180deg,#7ee000,#58cc02);
        color:#fff;
        box-shadow:0 8px 0 #2f7d00,0 18px 32px rgba(88,204,2,.22);
      }
      .rlz5-modal-head h2,
      body.dark .rlz5-modal-head h2{
        color:#2b2d33;
        font-size:clamp(30px,4vw,48px);
        line-height:1;
        font-weight:950;
        letter-spacing:0;
      }
      .rlz5-modal-head p{
        color:#777a81;
        font-size:clamp(16px,2vw,22px);
        font-weight:900;
      }
      .rlz5-modal-close{
        width:58px;
        height:58px;
        top:22px;
        right:24px;
        background:#fffefa;
        color:#6a6d73;
        border:3px solid #e7e7e2;
        box-shadow:0 8px 18px rgba(20,24,32,.10);
        font-size:28px;
      }
      .rlz5-modal-close:hover{
        background:#f7f7f1;
        color:#2b2d33;
      }
      .rlz5-modal-body{
        padding:24px 34px;
        scrollbar-color:#58cc02 #efefe8;
      }
      .rlz5-modal-body::-webkit-scrollbar{width:14px}
      .rlz5-modal-body::-webkit-scrollbar-track{background:#efefe8;border-radius:999px}
      .rlz5-modal-body::-webkit-scrollbar-thumb{
        background:linear-gradient(180deg,#7ee000,#58cc02);
        border-radius:999px;
        border:3px solid #efefe8;
      }
      .rlz5-modal-body::-webkit-scrollbar-button:single-button{
        height:16px;
        background:#58cc02;
        border-radius:999px;
      }

      .rlz5-uc-head{
        color:#6f737a;
        font-size:14px;
        font-weight:950;
        padding:0 18px 10px;
      }
      .rlz5-uc-row,
      .rlz5-all-topic{
        min-height:92px;
        padding:16px 20px;
        border-radius:24px;
        background:rgba(255,255,255,.88);
        color:#2b2d33;
        border:2px solid #e6e6df;
        box-shadow:0 3px 0 #e3e3dc,0 12px 26px rgba(20,24,32,.055);
      }
      .rlz5-uc-row:hover,
      .rlz5-all-topic:hover{
        background:#fbfff7;
        border-color:#bcefa4;
        transform:translateY(-1px);
      }
      .rlz5-uc-row.is-current,
      .rlz5-all-topic.is-current{
        background:
          radial-gradient(circle at 0 0,rgba(255,208,0,.15),transparent 34%),
          linear-gradient(180deg,#fffef8,#fffaf0);
        border-color:#ffc800;
        box-shadow:0 4px 0 #f0b900,0 18px 32px rgba(255,184,0,.12);
      }
      .rlz5-uc-row.is-locked,
      .rlz5-all-topic.is-locked{
        opacity:1;
        filter:grayscale(.2) saturate(.8);
        background:#fbfbf8;
      }
      .rlz5-uc-secbadge{
        width:48px;
        height:48px;
        border:3px solid #c9f0b9;
        background:#f5fff0;
        color:#58cc02;
        font-size:21px;
      }
      .rlz5-uc-ico,
      .rlz5-all-ico{
        width:64px;
        height:64px;
        border-radius:20px;
        background:linear-gradient(180deg,#f2ffe9,#e2ffd5);
        color:#2b2d33;
        border:1px solid #daf4cb;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.9);
        font-size:30px;
      }
      .rlz5-uc-row.is-current .rlz5-uc-secbadge,
      .rlz5-uc-row.is-current .rlz5-uc-ico,
      .rlz5-all-topic.is-current .rlz5-all-ico{
        background:linear-gradient(180deg,#fff3b0,#ffe066);
        color:#8a6500;
        border-color:#ffd000;
      }
      .rlz5-uc-unit,
      .rlz5-uc-topic,
      .rlz5-uc-name,
      .rlz5-all-copy strong,
      body.dark .rlz5-uc-unit,
      body.dark .rlz5-uc-topic,
      body.dark .rlz5-uc-name,
      body.dark .rlz5-all-copy strong{
        color:#2b2d33;
      }
      .rlz5-uc-unit{
        font-size:18px;
        font-weight:950;
      }
      .rlz5-uc-topic,
      .rlz5-all-copy strong{
        font-size:clamp(19px,2vw,25px);
        font-weight:950;
      }
      .rlz5-all-copy small{
        color:#777a81;
        font-size:clamp(14px,1.45vw,18px);
        font-weight:750;
      }
      .rlz5-uc-chev{
        color:#2b2d33;
        font-size:30px;
      }
      .rlz5-uc-row:hover .rlz5-uc-chev{
        color:#58cc02;
      }
      .rlz5-uc-status,
      .rlz5-all-status{
        justify-self:end;
        min-height:42px;
        display:inline-flex;
        align-items:center;
        border-radius:999px;
        padding:8px 16px;
        font-size:16px;
        font-weight:950;
      }
      .rlz5-uc-status-done,
      .rlz5-all-status-done,
      .rlz5-uc-status-ready,
      .rlz5-all-status-ready{
        color:#58cc02;
        background:#f2ffe9;
        border:2px solid #c9efb8;
      }
      .rlz5-uc-status-progress,
      .rlz5-all-status-progress{
        color:#ff9600;
        background:#fff8e5;
        border:2px solid #ffe2a0;
      }
      .rlz5-uc-status-locked,
      .rlz5-all-status-locked{
        color:#777a81;
        background:#f7f7f4;
        border:2px solid #e2e2dc;
      }
      .rlz5-all-title{
        color:#58cc02;
        font-size:clamp(17px,2vw,23px);
        font-weight:950;
        letter-spacing:.06em;
        margin:12px 2px 10px;
      }
      .rlz5-all-title::after{
        background:#e3e3dc;
      }

      .rlz5-modal-keypoints{
        display:grid;
        grid-template-columns:auto 1fr;
        gap:0 22px;
        padding:24px 26px;
        border-radius:28px;
        background:linear-gradient(180deg,#fbfff7,#f7fff1);
        border:2px solid #bdeba8;
        box-shadow:0 14px 28px rgba(88,204,2,.10);
      }
      .rlz5-modal-keypoints::before{
        content:"🎯";
        grid-row:1 / span 2;
        width:72px;
        height:72px;
        display:grid;
        place-items:center;
        border-radius:22px;
        background:linear-gradient(180deg,#e9ffd9,#ccf9b7);
        font-size:34px;
      }
      .rlz5-modal-keypoints h3,
      body.dark .rlz5-modal-keypoints h3{
        color:#2f7d00;
        font-size:clamp(24px,2.5vw,34px);
        margin:0 0 8px;
      }
      .rlz5-modal-keypoints ul{
        display:grid;
        gap:12px;
        margin:0;
        padding:0;
        list-style:none;
      }
      .rlz5-modal-keypoints li,
      body.dark .rlz5-modal-keypoints li{
        position:relative;
        padding-left:40px;
        color:#2b2d33;
        font-size:clamp(16px,1.7vw,20px);
        line-height:1.55;
      }
      .rlz5-modal-keypoints li::before{
        content:"✓";
        position:absolute;
        left:0;
        top:.1em;
        width:26px;
        height:26px;
        border-radius:50%;
        display:grid;
        place-items:center;
        color:#fff;
        background:#58cc02;
        font-weight:950;
        font-size:16px;
      }
      .rlz5-modal-summary,
      body.dark .rlz5-modal-summary{
        color:#2b2d33;
        font-size:clamp(15px,1.45vw,19px);
      }
      .rlz5-modal-summary .content-card,
      .rlz5-modal-summary .lesson-hero,
      .rlz5-modal-summary .mini-summary-card,
      .rlz5-modal-summary .visual-note{
        position:relative;
        padding:24px 26px;
        border-radius:28px;
        background:linear-gradient(180deg,#fff7fb,#fff1f6);
        border:2px solid #ffb8ca;
        box-shadow:0 14px 28px rgba(255,75,123,.08);
        color:#2b2d33;
      }
      .rlz5-modal-summary .content-card:nth-of-type(3n+2){
        background:linear-gradient(180deg,#f5fbff,#eef8ff);
        border-color:#a9d7ff;
        box-shadow:0 14px 28px rgba(28,176,246,.08);
      }
      .rlz5-modal-summary .content-card:nth-of-type(3n+3){
        background:linear-gradient(180deg,#fbfff7,#f3ffeb);
        border-color:#bdeba8;
        box-shadow:0 14px 28px rgba(88,204,2,.08);
      }
      .rlz5-modal-summary h3,
      .rlz5-modal-summary h4,
      .rlz5-modal-summary strong,
      body.dark .rlz5-modal-summary h3,
      body.dark .rlz5-modal-summary h4,
      body.dark .rlz5-modal-summary strong{
        color:#2b2d33;
      }
      .rlz5-modal-summary h3{
        font-size:clamp(22px,2.4vw,32px);
        line-height:1.08;
        margin-bottom:12px;
      }
      .rlz5-modal-summary .content-card:nth-of-type(3n+1) h3{color:#9b153f}
      .rlz5-modal-summary .content-card:nth-of-type(3n+2) h3{color:#1267b8}
      .rlz5-modal-summary .content-card:nth-of-type(3n+3) h3{color:#2f7d00}
      .rlz5-modal-summary p,
      .rlz5-modal-summary li,
      .rlz5-modal-summary td,
      body.dark .rlz5-modal-summary p,
      body.dark .rlz5-modal-summary li,
      body.dark .rlz5-modal-summary td{
        color:#2b2d33;
        line-height:1.65;
      }
      .rlz5-modal-summary .source-panel,
      .rlz5-modal-summary .info-box,
      .rlz5-modal-summary .warning-box{
        border-radius:22px;
        border:2px solid rgba(255,75,123,.16);
        background:rgba(255,255,255,.55);
        padding:16px 18px;
      }
      .rlz5-modal-summary table{
        overflow:hidden;
        border-radius:20px;
        background:#fff;
        box-shadow:0 0 0 2px #cde5ff;
        font-size:clamp(14px,1.3vw,17px);
      }
      .rlz5-modal-summary th{
        color:#1267b8;
        background:#eef8ff;
        font-weight:950;
      }
      .rlz5-modal-summary th,
      .rlz5-modal-summary td{
        border-color:#cde5ff;
        padding:12px 14px;
      }
      .rlz5-modal-foot{
        gap:18px;
        padding:18px 34px 22px;
        background:rgba(255,255,255,.84);
        border-top:2px solid #ecece7;
      }
      .rlz5-uc-note{
        color:#565b63;
        font-size:clamp(14px,1.5vw,18px);
      }
      .rlz5-uc-noteico{
        width:52px;
        height:52px;
        background:linear-gradient(180deg,#7ee000,#58cc02);
        color:#fff;
        border:0;
        font-size:28px;
        font-weight:950;
      }
      .rlz5-uc-foot .rlz5-uc-progbtn,
      .rlz5-modal-foot .rlz5-btn-secondary{
        min-height:62px;
        border-radius:22px;
        color:#2f7d00;
        background:#fff;
        border:3px solid #58cc02;
        box-shadow:0 5px 0 #b7eaa0;
        font-size:clamp(16px,1.7vw,22px);
        font-weight:950;
      }
      .rlz5-uc-foot .rlz5-uc-progbtn:hover,
      .rlz5-modal-foot .rlz5-btn-secondary:hover{
        background:#f3ffe9;
      }
      .rlz5-modal-foot .rlz5-btn-primary{
        min-height:62px;
        border-radius:22px;
        background:linear-gradient(180deg,#7ee000,#58cc02);
        color:#fff;
        border:0;
        box-shadow:0 6px 0 #2f7d00,0 16px 28px rgba(88,204,2,.22);
        font-size:clamp(16px,1.7vw,22px);
        font-weight:950;
      }
      .rlz5-modal-foot .rlz5-btn-primary:hover{
        filter:brightness(1.03);
      }
      .rlz5-progress-modal .rlz5-modal-body{
        background:
          radial-gradient(circle at 12% 4%,rgba(126,224,0,.10),transparent 28%),
          radial-gradient(circle at 96% 10%,rgba(255,208,0,.12),transparent 24%);
      }
      .rlz5-progress-hero{
        display:grid;
        grid-template-columns:180px 1fr;
        gap:22px;
        align-items:center;
        margin-bottom:24px;
        padding:22px;
        border-radius:28px;
        background:linear-gradient(135deg,#f5ffe9,#fff8d9);
        border:2px solid #c9efb8;
        box-shadow:0 16px 34px rgba(88,204,2,.10);
      }
      .rlz5-progress-ring{
        --pct:0;
        width:156px;
        aspect-ratio:1;
        border-radius:50%;
        display:grid;
        place-items:center;
        position:relative;
        background:conic-gradient(#58cc02 calc(var(--pct) * 1%), #e7e7df 0);
        box-shadow:0 8px 0 #b7eaa0,0 18px 34px rgba(88,204,2,.16),inset 0 1px 0 rgba(255,255,255,.9);
      }
      .rlz5-progress-ring::after{
        content:"";
        position:absolute;
        inset:15px;
        border-radius:50%;
        background:#fffefa;
        box-shadow:inset 0 3px 12px rgba(20,24,32,.08);
      }
      .rlz5-progress-ring span{
        position:relative;
        z-index:1;
        display:grid;
        gap:2px;
        text-align:center;
      }
      .rlz5-progress-ring strong{
        color:#2f7d00;
        font-size:36px;
        line-height:1;
        font-weight:950;
      }
      .rlz5-progress-ring small{
        color:#777a81;
        font-size:12px;
        font-weight:950;
        text-transform:uppercase;
        letter-spacing:.04em;
      }
      .rlz5-progress-summary{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:12px;
      }
      .rlz5-progress-summary div{
        min-height:76px;
        display:grid;
        align-content:center;
        gap:4px;
        padding:14px 16px;
        border-radius:20px;
        background:rgba(255,255,255,.82);
        border:2px solid rgba(255,255,255,.82);
        box-shadow:0 3px 0 rgba(183,234,160,.72);
      }
      .rlz5-progress-summary b{
        color:#2b2d33;
        font-size:clamp(18px,2vw,25px);
        line-height:1.1;
        font-weight:950;
      }
      .rlz5-progress-summary small{
        color:#777a81;
        font-size:13px;
        font-weight:900;
      }
      .rlz5-progress-chart{
        display:grid;
        gap:18px;
      }
      .rlz5-progress-section{
        padding:18px;
        border-radius:28px;
        background:rgba(255,255,255,.84);
        border:2px solid #e6e6df;
        box-shadow:0 4px 0 #e3e3dc,0 14px 28px rgba(20,24,32,.055);
      }
      .rlz5-progress-section-head{
        display:flex;
        align-items:end;
        justify-content:space-between;
        gap:14px;
        margin-bottom:12px;
      }
      .rlz5-progress-section-head div{
        display:grid;
        gap:3px;
        min-width:0;
      }
      .rlz5-progress-section-head span{
        color:#58cc02;
        font-size:13px;
        font-weight:950;
        letter-spacing:.08em;
        text-transform:uppercase;
      }
      .rlz5-progress-section-head strong{
        color:#2b2d33;
        font-size:24px;
        line-height:1.1;
        font-weight:950;
      }
      .rlz5-progress-section-head b{
        color:#2f7d00;
        font-size:24px;
        line-height:1;
        font-weight:950;
      }
      .rlz5-progress-section-bar,
      .rlz5-progress-track{
        display:block;
        overflow:hidden;
        border-radius:999px;
        background:#e7e7df;
      }
      .rlz5-progress-section-bar{
        height:14px;
        margin-bottom:14px;
      }
      .rlz5-progress-section-bar span{
        display:block;
        width:calc(var(--section-pct) * 1%);
        height:100%;
        border-radius:inherit;
        background:linear-gradient(90deg,#7ee000,#58cc02);
      }
      .rlz5-progress-units{
        display:grid;
        gap:10px;
      }
      .rlz5-progress-unit{
        width:100%;
        display:grid;
        gap:10px;
        padding:14px;
        border:2px solid #ecece7;
        border-radius:22px;
        background:#fffefa;
        color:#2b2d33;
        text-align:left;
        cursor:pointer;
        transition:transform .14s ease,border-color .14s ease,background .14s ease;
      }
      .rlz5-progress-unit:hover{
        transform:translateY(-1px);
        background:#fbfff7;
        border-color:#bcefa4;
      }
      .rlz5-progress-unit.is-locked{
        opacity:.78;
      }
      .rlz5-progress-unit-head{
        display:grid;
        grid-template-columns:48px 1fr auto;
        gap:12px;
        align-items:center;
      }
      .rlz5-progress-unit-icon{
        width:48px;
        height:48px;
        display:grid;
        place-items:center;
        border-radius:16px;
        background:linear-gradient(180deg,#f2ffe9,#e2ffd5);
        border:1px solid #daf4cb;
        font-size:24px;
      }
      .rlz5-progress-unit-copy{
        display:grid;
        gap:3px;
        min-width:0;
      }
      .rlz5-progress-unit-copy strong{
        overflow:hidden;
        color:#2b2d33;
        font-size:18px;
        line-height:1.15;
        font-weight:950;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      .rlz5-progress-unit-copy small{
        color:#777a81;
        font-size:13px;
        font-weight:850;
      }
      .rlz5-progress-unit-head b{
        color:#2f7d00;
        font-size:18px;
        font-weight:950;
      }
      .rlz5-progress-track{
        height:10px;
      }
      .rlz5-progress-fill{
        display:block;
        height:100%;
        border-radius:inherit;
        background:linear-gradient(90deg,#7ee000,#58cc02);
        box-shadow:0 0 14px rgba(88,204,2,.22);
      }
      .rlz5-progress-stars{
        display:flex;
        gap:3px;
        color:#d7d7cf;
        font-size:17px;
        line-height:1;
      }
      .rlz5-progress-stars .is-on{
        color:#ffd000;
        text-shadow:0 1px 0 #b38300;
      }
      @media(max-width:760px){
        .rlz5-modal-head{padding:18px 58px 16px 18px}
        .rlz5-modal-icon{width:58px;height:58px;border-radius:22px;font-size:27px}
        .rlz5-modal-head h2{font-size:30px}
        .rlz5-modal-head p{font-size:15px}
        .rlz5-modal-close{width:44px;height:44px;top:16px;right:14px;font-size:23px}
        .rlz5-modal-body{padding:16px}
        .rlz5-uc-row,.rlz5-all-topic{min-height:78px;border-radius:20px;padding:13px}
        .rlz5-uc-ico,.rlz5-all-ico{width:48px;height:48px;border-radius:16px;font-size:23px}
        .rlz5-modal-keypoints{grid-template-columns:1fr;padding:18px;border-radius:22px}
        .rlz5-modal-keypoints::before{width:54px;height:54px;border-radius:18px;font-size:26px;margin-bottom:10px}
        .rlz5-modal-summary .content-card,
        .rlz5-modal-summary .lesson-hero,
        .rlz5-modal-summary .mini-summary-card,
        .rlz5-modal-summary .visual-note{padding:18px;border-radius:22px}
        .rlz5-progress-hero{grid-template-columns:1fr;padding:16px;justify-items:center;text-align:center}
        .rlz5-progress-ring{width:136px}
        .rlz5-progress-summary{width:100%;grid-template-columns:1fr}
        .rlz5-progress-section{padding:14px;border-radius:22px}
        .rlz5-progress-section-head strong{font-size:20px}
        .rlz5-progress-unit-head{grid-template-columns:42px 1fr auto;gap:10px}
        .rlz5-progress-unit-icon{width:42px;height:42px;border-radius:14px;font-size:21px}
        .rlz5-progress-unit-copy strong{font-size:16px;white-space:normal}
        .rlz5-progress-unit-copy small{font-size:12px}
        .rlz5-modal-foot{padding:14px 16px;grid-template-columns:1fr;display:grid}
      }

      /* RavzaLingo dark mode uyumluluğu */
      body.dark #ravzaLingoRoot .rlz5-unit-banner{
        background:
          radial-gradient(circle at 95% 18%,rgba(126,224,0,.12),transparent 26%),
          linear-gradient(180deg,#1d2e36,#142228);
        color:#f8fafc;
        border-color:#2c3e48;
        box-shadow:0 5px 0 #0e1a20,0 18px 34px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.06);
      }
      body.dark #ravzaLingoRoot .rlz5-unit-banner.is-done{
        background:
          radial-gradient(circle at 95% 18%,rgba(126,224,0,.18),transparent 26%),
          linear-gradient(180deg,#203a22,#162619);
        border-color:rgba(126,224,0,.36);
        box-shadow:0 5px 0 #244f13,0 18px 34px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.06);
      }
      body.dark #ravzaLingoRoot .rlz5-unit-banner.is-locked{
        background:linear-gradient(180deg,#24333b,#18242b);
        border-color:#344a55;
        box-shadow:0 5px 0 #0e1a20,0 14px 28px rgba(0,0,0,.30);
      }
      body.dark #ravzaLingoRoot .rlz5-banner-main:hover{
        background:rgba(126,224,0,.08);
      }
      body.dark #ravzaLingoRoot .rlz5-banner-text,
      body.dark #ravzaLingoRoot .rlz5-banner-text strong{
        color:#f8fafc;
      }
      body.dark #ravzaLingoRoot .rlz5-banner-kicker{
        color:#7ee000;
      }
      body.dark #ravzaLingoRoot .rlz5-banner-guide{
        background:
          radial-gradient(circle at 35% 24%,rgba(255,255,255,.22),transparent 34%),
          linear-gradient(180deg,#7ee000,#58cc02);
        color:#fff;
        box-shadow:0 5px 0 #2f7d00,0 12px 24px rgba(88,204,2,.20);
      }

      body.dark .rlz5-modal-overlay{
        background:rgba(3,8,11,.78);
      }
      body.dark .rlz5-modal{
        color:#f8fafc;
        background:
          radial-gradient(circle at 12% 0%,rgba(126,224,0,.10),transparent 28%),
          radial-gradient(circle at 100% 8%,rgba(28,176,246,.10),transparent 24%),
          linear-gradient(180deg,#1a2a32,#0f1a20 64%,#0b1418);
        border-color:#2c3e48;
        box-shadow:0 34px 92px rgba(0,0,0,.64),inset 0 1px 0 rgba(255,255,255,.06);
      }
      body.dark .rlz5-modal-head{
        background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.01));
        border-bottom-color:#2c3e48;
      }
      body.dark .rlz5-modal-head h2{
        color:#f8fafc;
      }
      body.dark .rlz5-modal-head p{
        color:#9fb0bb;
      }
      body.dark .rlz5-modal-close{
        background:#1d2e36;
        color:#f8fafc;
        border-color:#2c3e48;
        box-shadow:0 8px 18px rgba(0,0,0,.26);
      }
      body.dark .rlz5-modal-close:hover{
        background:#243844;
        color:#fff;
      }
      body.dark .rlz5-modal-body{
        scrollbar-color:#7ee000 #17242b;
      }
      body.dark .rlz5-modal-body::-webkit-scrollbar-track{
        background:#17242b;
      }
      body.dark .rlz5-modal-body::-webkit-scrollbar-thumb{
        background:linear-gradient(180deg,#7ee000,#58cc02);
        border-color:#17242b;
      }
      body.dark .rlz5-modal-body::-webkit-scrollbar-button:single-button{
        background:#58cc02;
      }

      body.dark .rlz5-uc-head{
        color:#9fb0bb;
      }
      body.dark .rlz5-uc-row,
      body.dark .rlz5-all-topic{
        background:#1d2e36;
        color:#f8fafc;
        border-color:#2c3e48;
        box-shadow:0 4px 0 #0e1a20,0 12px 26px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.04);
      }
      body.dark .rlz5-uc-row:hover,
      body.dark .rlz5-all-topic:hover{
        background:#223845;
        border-color:rgba(126,224,0,.34);
      }
      body.dark .rlz5-uc-row.is-current,
      body.dark .rlz5-all-topic.is-current{
        background:
          radial-gradient(circle at 0 0,rgba(255,208,0,.16),transparent 34%),
          linear-gradient(180deg,#2c321e,#1e2518);
        border-color:rgba(255,208,0,.58);
        box-shadow:0 4px 0 #7d5500,0 16px 32px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.05);
      }
      body.dark .rlz5-uc-row.is-locked,
      body.dark .rlz5-all-topic.is-locked{
        background:#18262d;
        filter:saturate(.72);
      }
      body.dark .rlz5-uc-secbadge,
      body.dark .rlz5-uc-ico,
      body.dark .rlz5-all-ico{
        background:#243844;
        color:#f8fafc;
        border-color:#2c3e48;
      }
      body.dark .rlz5-uc-row.is-current .rlz5-uc-secbadge,
      body.dark .rlz5-uc-row.is-current .rlz5-uc-ico,
      body.dark .rlz5-all-topic.is-current .rlz5-all-ico{
        background:linear-gradient(180deg,#ffe066,#ffd000);
        color:#7d5500;
        border-color:rgba(255,255,255,.14);
      }
      body.dark .rlz5-uc-unit,
      body.dark .rlz5-uc-topic,
      body.dark .rlz5-uc-name,
      body.dark .rlz5-all-copy strong{
        color:#f8fafc;
      }
      body.dark .rlz5-all-copy small{
        color:#9fb0bb;
      }
      body.dark .rlz5-uc-chev{
        color:#d4e3ea;
      }
      body.dark .rlz5-uc-row:hover .rlz5-uc-chev{
        color:#7ee000;
      }
      body.dark .rlz5-uc-status-done,
      body.dark .rlz5-all-status-done,
      body.dark .rlz5-uc-status-ready,
      body.dark .rlz5-all-status-ready{
        color:#7ee000;
        background:rgba(88,204,2,.12);
        border-color:rgba(126,224,0,.30);
      }
      body.dark .rlz5-uc-status-progress,
      body.dark .rlz5-all-status-progress{
        color:#ffd000;
        background:rgba(255,208,0,.12);
        border-color:rgba(255,208,0,.30);
      }
      body.dark .rlz5-uc-status-locked,
      body.dark .rlz5-all-status-locked{
        color:#9fb0bb;
        background:rgba(255,255,255,.05);
        border-color:rgba(255,255,255,.10);
      }
      body.dark .rlz5-all-title{
        color:#7ee000;
      }
      body.dark .rlz5-all-title::after{
        background:#2c3e48;
      }

      body.dark .rlz5-modal-keypoints{
        background:linear-gradient(180deg,rgba(88,204,2,.12),rgba(88,204,2,.055));
        border-color:rgba(126,224,0,.26);
        box-shadow:0 14px 28px rgba(0,0,0,.22);
      }
      body.dark .rlz5-modal-keypoints::before{
        background:linear-gradient(180deg,#7ee000,#58cc02);
        color:#fff;
      }
      body.dark .rlz5-modal-keypoints h3{
        color:#7ee000;
      }
      body.dark .rlz5-modal-keypoints li{
        color:#f8fafc;
      }
      body.dark .rlz5-modal-summary{
        color:#f8fafc;
      }
      body.dark .rlz5-modal-summary .content-card,
      body.dark .rlz5-modal-summary .lesson-hero,
      body.dark .rlz5-modal-summary .mini-summary-card,
      body.dark .rlz5-modal-summary .visual-note{
        background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.018));
        border-color:#2c3e48;
        box-shadow:0 14px 28px rgba(0,0,0,.20);
        color:#f8fafc;
      }
      body.dark .rlz5-modal-summary .content-card:nth-of-type(3n+1){
        border-color:rgba(255,109,202,.22);
        background:linear-gradient(180deg,rgba(255,109,202,.09),rgba(255,109,202,.035));
      }
      body.dark .rlz5-modal-summary .content-card:nth-of-type(3n+2){
        border-color:rgba(28,176,246,.24);
        background:linear-gradient(180deg,rgba(28,176,246,.10),rgba(28,176,246,.035));
      }
      body.dark .rlz5-modal-summary .content-card:nth-of-type(3n+3){
        border-color:rgba(126,224,0,.24);
        background:linear-gradient(180deg,rgba(126,224,0,.10),rgba(126,224,0,.035));
      }
      body.dark .rlz5-modal-summary h3,
      body.dark .rlz5-modal-summary h4,
      body.dark .rlz5-modal-summary strong{
        color:#f8fafc;
      }
      body.dark .rlz5-modal-summary .content-card:nth-of-type(3n+1) h3{color:#ff9bd9}
      body.dark .rlz5-modal-summary .content-card:nth-of-type(3n+2) h3{color:#4cc9ff}
      body.dark .rlz5-modal-summary .content-card:nth-of-type(3n+3) h3{color:#7ee000}
      body.dark .rlz5-modal-summary p,
      body.dark .rlz5-modal-summary li,
      body.dark .rlz5-modal-summary td{
        color:#e4eef3;
      }
      body.dark .rlz5-modal-summary .source-panel,
      body.dark .rlz5-modal-summary .info-box,
      body.dark .rlz5-modal-summary .warning-box{
        background:rgba(0,0,0,.16);
        border-color:rgba(255,255,255,.10);
      }
      body.dark .rlz5-modal-summary table{
        background:#101a20;
        box-shadow:0 0 0 2px #2c3e48;
      }
      body.dark .rlz5-modal-summary th{
        color:#4cc9ff;
        background:#172833;
      }
      body.dark .rlz5-modal-summary th,
      body.dark .rlz5-modal-summary td{
        border-color:#2c3e48;
      }
      body.dark .rlz5-modal-foot{
        background:rgba(0,0,0,.25);
        border-top-color:#2c3e48;
      }
      body.dark .rlz5-uc-note{
        color:#b8c8d0;
      }
      body.dark .rlz5-uc-noteico{
        background:linear-gradient(180deg,#7ee000,#58cc02);
        color:#fff;
      }
      body.dark .rlz5-uc-foot .rlz5-uc-progbtn,
      body.dark .rlz5-modal-foot .rlz5-btn-secondary{
        color:#7ee000;
        background:#101a20;
        border-color:#58cc02;
        box-shadow:0 5px 0 #244f13;
      }
      body.dark .rlz5-uc-foot .rlz5-uc-progbtn:hover,
      body.dark .rlz5-modal-foot .rlz5-btn-secondary:hover{
        background:#162619;
      }
      body.dark .rlz5-modal-foot .rlz5-btn-primary{
        background:linear-gradient(180deg,#7ee000,#58cc02);
        color:#fff;
        box-shadow:0 6px 0 #2f7d00,0 16px 28px rgba(40,120,0,.24);
      }
      body.dark .rlz5-progress-hero{
        background:linear-gradient(135deg,rgba(88,204,2,.12),rgba(255,208,0,.07));
        border-color:rgba(126,224,0,.24);
        box-shadow:0 16px 34px rgba(0,0,0,.24);
      }
      body.dark .rlz5-progress-ring{
        background:conic-gradient(#7ee000 calc(var(--pct) * 1%), #2c3e48 0);
        box-shadow:0 8px 0 #244f13,0 18px 34px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.05);
      }
      body.dark .rlz5-progress-ring::after{
        background:#101a20;
        box-shadow:inset 0 3px 12px rgba(0,0,0,.34);
      }
      body.dark .rlz5-progress-ring strong,
      body.dark .rlz5-progress-section-head b,
      body.dark .rlz5-progress-unit-head b{
        color:#7ee000;
      }
      body.dark .rlz5-progress-ring small,
      body.dark .rlz5-progress-summary small,
      body.dark .rlz5-progress-unit-copy small{
        color:#9fb0bb;
      }
      body.dark .rlz5-progress-summary div,
      body.dark .rlz5-progress-section,
      body.dark .rlz5-progress-unit{
        background:#1d2e36;
        color:#f8fafc;
        border-color:#2c3e48;
        box-shadow:0 4px 0 #0e1a20,0 12px 26px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.04);
      }
      body.dark .rlz5-progress-unit:hover{
        background:#223845;
        border-color:rgba(126,224,0,.34);
      }
      body.dark .rlz5-progress-summary b,
      body.dark .rlz5-progress-section-head strong,
      body.dark .rlz5-progress-unit-copy strong{
        color:#f8fafc;
      }
      body.dark .rlz5-progress-unit-icon{
        background:#243844;
        color:#f8fafc;
        border-color:#2c3e48;
      }
      body.dark .rlz5-progress-section-bar,
      body.dark .rlz5-progress-track{
        background:#2c3e48;
      }
      body.dark .rlz5-progress-stars{
        color:#41535d;
      }

      /* RavzaLingo modal final düzen: daha ince başlık/alt bar ve çakışmayan konu satırları */
      .rlz5-modal-units .rlz5-modal-head{
        gap:14px;
        min-height:92px;
        padding:16px 58px 16px 22px;
      }
      .rlz5-modal-units .rlz5-modal-icon{
        width:54px;
        height:54px;
        border-radius:18px;
        font-size:25px;
        box-shadow:0 5px 0 #2f7d00,0 12px 22px rgba(88,204,2,.16);
      }
      .rlz5-modal-units .rlz5-modal-head h2,
      body.dark .rlz5-modal-units .rlz5-modal-head h2{
        font-size:clamp(26px,3vw,34px);
        line-height:1.05;
        margin:0 0 2px;
      }
      .rlz5-modal-units .rlz5-modal-head p{
        font-size:clamp(13px,1.35vw,16px);
        line-height:1.25;
        margin:0;
      }
      .rlz5-modal-units .rlz5-modal-close{
        width:42px;
        height:42px;
        top:15px;
        right:18px;
        border-width:2px;
        font-size:22px;
        box-shadow:0 5px 14px rgba(0,0,0,.16);
      }
      .rlz5-modal-units .rlz5-modal-body{
        padding:16px 22px;
      }
      .rlz5-modal-units .rlz5-modal-foot{
        gap:12px;
        align-items:center;
        padding:12px 22px 14px;
      }
      .rlz5-modal-units .rlz5-uc-note{
        min-width:0;
        gap:10px;
        font-size:13px;
        line-height:1.35;
      }
      .rlz5-modal-units .rlz5-uc-noteico{
        width:38px;
        height:38px;
        font-size:21px;
      }
      .rlz5-modal-units .rlz5-uc-foot .rlz5-uc-progbtn,
      .rlz5-modal-units .rlz5-modal-foot .rlz5-btn-secondary,
      .rlz5-modal-units .rlz5-modal-foot .rlz5-btn-primary{
        min-height:44px;
        border-radius:16px;
        border-width:2px;
        padding:8px 16px;
        font-size:clamp(14px,1.35vw,17px);
        box-shadow:0 3px 0 rgba(88,204,2,.42);
      }
      .rlz5-modal-units .rlz5-all-topic{
        grid-template-columns:52px minmax(0,1fr) auto;
        gap:14px;
        min-height:76px;
        padding:12px 16px;
        border-radius:18px;
      }
      .rlz5-modal-units .rlz5-all-ico{
        width:52px;
        height:52px;
        border-radius:15px;
        font-size:24px;
      }
      .rlz5-modal-units .rlz5-all-copy{
        min-width:0;
        gap:4px;
        align-self:center;
      }
      .rlz5-modal-units .rlz5-all-copy strong{
        display:block;
        overflow:visible;
        color:inherit;
        font-size:clamp(17px,1.75vw,21px);
        line-height:1.14;
        text-overflow:clip;
        white-space:normal;
        overflow-wrap:anywhere;
      }
      .rlz5-modal-units .rlz5-all-copy small{
        display:block;
        overflow:visible;
        font-size:clamp(12px,1.22vw,15px);
        line-height:1.28;
        text-overflow:clip;
        white-space:normal;
        overflow-wrap:anywhere;
      }
      .rlz5-modal-units .rlz5-all-status{
        min-height:34px;
        padding:6px 12px;
        font-size:13px;
        border-width:2px;
      }
      .rlz5-modal-units .rlz5-all-title{
        margin:8px 2px 8px;
        font-size:clamp(15px,1.6vw,20px);
        line-height:1.2;
      }
      @media(max-width:760px){
        .rlz5-modal-units .rlz5-modal-head{
          min-height:78px;
          padding:13px 52px 13px 14px;
          gap:10px;
        }
        .rlz5-modal-units .rlz5-modal-icon{
          width:44px;
          height:44px;
          border-radius:15px;
          font-size:21px;
        }
        .rlz5-modal-units .rlz5-modal-head h2,
        body.dark .rlz5-modal-units .rlz5-modal-head h2{
          font-size:26px;
        }
        .rlz5-modal-units .rlz5-modal-head p{
          font-size:13px;
        }
        .rlz5-modal-units .rlz5-modal-close{
          width:38px;
          height:38px;
          top:13px;
          right:12px;
          font-size:20px;
        }
        .rlz5-modal-units .rlz5-modal-body{
          padding:12px;
        }
        .rlz5-modal-units .rlz5-all-topic{
          grid-template-columns:44px minmax(0,1fr);
          gap:10px;
          min-height:72px;
          padding:11px;
          border-radius:16px;
        }
        .rlz5-modal-units .rlz5-all-ico{
          width:44px;
          height:44px;
          border-radius:13px;
          font-size:21px;
        }
        .rlz5-modal-units .rlz5-all-copy strong{
          font-size:16px;
          line-height:1.16;
        }
        .rlz5-modal-units .rlz5-all-copy small{
          font-size:12px;
        }
        .rlz5-modal-units .rlz5-all-status{
          grid-column:2;
          justify-self:start;
          min-height:28px;
          padding:4px 10px;
          font-size:12px;
        }
        .rlz5-modal-units .rlz5-modal-foot{
          padding:11px 12px 12px;
          gap:10px;
        }
        .rlz5-modal-units .rlz5-uc-note{
          font-size:12px;
        }
        .rlz5-modal-units .rlz5-uc-noteico{
          width:32px;
          height:32px;
          font-size:18px;
        }
        .rlz5-modal-units .rlz5-uc-foot .rlz5-uc-progbtn,
        .rlz5-modal-units .rlz5-modal-foot .rlz5-btn-secondary,
        .rlz5-modal-units .rlz5-modal-foot .rlz5-btn-primary{
          min-height:40px;
          width:100%;
          font-size:14px;
        }
      }

      /* Çalışma pop-up'ı: daha minimalist üst/alt alan ve düzenli içerik */
      .rlz5-modal-study{
        width:min(100%,1020px);
      }
      .rlz5-modal-study .rlz5-modal-head{
        gap:14px;
        min-height:92px;
        padding:16px 58px 16px 22px;
      }
      .rlz5-modal-study .rlz5-modal-icon{
        width:54px;
        height:54px;
        border-radius:18px;
        font-size:25px;
        box-shadow:0 5px 0 #c48f00,0 12px 22px rgba(255,184,0,.16);
      }
      .rlz5-modal-study .rlz5-modal-head h2,
      body.dark .rlz5-modal-study .rlz5-modal-head h2{
        font-size:clamp(26px,3.2vw,38px);
        line-height:1.05;
        margin:0 0 2px;
      }
      .rlz5-modal-study .rlz5-modal-head p{
        font-size:clamp(13px,1.38vw,17px);
        line-height:1.25;
        margin:0;
      }
      .rlz5-modal-study .rlz5-modal-close{
        width:42px;
        height:42px;
        top:15px;
        right:18px;
        border-width:2px;
        font-size:22px;
        box-shadow:0 5px 14px rgba(0,0,0,.16);
      }
      .rlz5-modal-study .rlz5-modal-body{
        padding:18px 24px;
      }
      .rlz5-modal-study .rlz5-modal-keypoints{
        grid-template-columns:58px minmax(0,1fr);
        gap:0 18px;
        padding:18px 20px;
        border-radius:22px;
        margin-bottom:14px;
      }
      .rlz5-modal-study .rlz5-modal-keypoints::before{
        width:52px;
        height:52px;
        border-radius:16px;
        font-size:24px;
      }
      .rlz5-modal-study .rlz5-modal-keypoints h3,
      body.dark .rlz5-modal-study .rlz5-modal-keypoints h3{
        font-size:clamp(21px,2.2vw,28px);
        line-height:1.12;
        margin:0 0 10px;
      }
      .rlz5-modal-study .rlz5-modal-keypoints ul{
        gap:9px;
      }
      .rlz5-modal-study .rlz5-modal-keypoints li,
      body.dark .rlz5-modal-study .rlz5-modal-keypoints li{
        padding-left:32px;
        font-size:clamp(14px,1.35vw,17px);
        line-height:1.42;
        overflow-wrap:anywhere;
      }
      .rlz5-modal-study .rlz5-modal-keypoints li::before{
        width:22px;
        height:22px;
        font-size:14px;
      }
      .rlz5-modal-study .rlz5-modal-summary,
      body.dark .rlz5-modal-study .rlz5-modal-summary{
        font-size:clamp(13.5px,1.25vw,16px);
        line-height:1.55;
      }
      .rlz5-modal-study .rlz5-modal-summary .content-card,
      .rlz5-modal-study .rlz5-modal-summary .lesson-hero,
      .rlz5-modal-study .rlz5-modal-summary .mini-summary-card,
      .rlz5-modal-study .rlz5-modal-summary .visual-note{
        padding:18px 20px;
        border-radius:20px;
        margin-bottom:12px;
      }
      .rlz5-modal-study .rlz5-modal-summary h3,
      .rlz5-modal-study .rlz5-modal-summary h4,
      body.dark .rlz5-modal-study .rlz5-modal-summary h3,
      body.dark .rlz5-modal-study .rlz5-modal-summary h4{
        font-size:clamp(20px,2.1vw,27px);
        line-height:1.14;
        margin:0 0 10px;
      }
      .rlz5-modal-study .rlz5-modal-summary p,
      .rlz5-modal-study .rlz5-modal-summary li,
      .rlz5-modal-study .rlz5-modal-summary td{
        font-size:clamp(13px,1.2vw,15.5px);
        line-height:1.55;
        overflow-wrap:anywhere;
      }
      .rlz5-modal-study .rlz5-modal-summary .table-wrap{
        overflow-x:auto;
      }
      .rlz5-modal-study .rlz5-modal-summary table{
        min-width:720px;
        table-layout:fixed;
        font-size:13px;
      }
      .rlz5-modal-study .rlz5-modal-summary th,
      .rlz5-modal-study .rlz5-modal-summary td{
        padding:10px 12px;
      }
      .rlz5-modal-study .rlz5-modal-foot{
        gap:12px;
        align-items:center;
        padding:12px 22px 14px;
      }
      .rlz5-modal-study .rlz5-modal-foot .rlz5-btn-secondary,
      .rlz5-modal-study .rlz5-modal-foot .rlz5-btn-primary{
        min-height:44px;
        border-radius:16px;
        border-width:2px;
        padding:8px 16px;
        font-size:clamp(14px,1.35vw,17px);
        font-weight:950;
        box-shadow:0 3px 0 rgba(88,204,2,.42);
      }
      @media(max-width:760px){
        .rlz5-modal-study .rlz5-modal-head{
          min-height:78px;
          padding:13px 52px 13px 14px;
          gap:10px;
        }
        .rlz5-modal-study .rlz5-modal-icon{
          width:44px;
          height:44px;
          border-radius:15px;
          font-size:21px;
        }
        .rlz5-modal-study .rlz5-modal-head h2,
        body.dark .rlz5-modal-study .rlz5-modal-head h2{
          font-size:26px;
        }
        .rlz5-modal-study .rlz5-modal-head p{
          font-size:13px;
        }
        .rlz5-modal-study .rlz5-modal-close{
          width:38px;
          height:38px;
          top:13px;
          right:12px;
          font-size:20px;
        }
        .rlz5-modal-study .rlz5-modal-body{
          padding:12px;
        }
        .rlz5-modal-study .rlz5-modal-keypoints{
          grid-template-columns:1fr;
          padding:16px;
          border-radius:18px;
        }
        .rlz5-modal-study .rlz5-modal-keypoints::before{
          width:44px;
          height:44px;
          border-radius:14px;
          font-size:21px;
          margin-bottom:10px;
        }
        .rlz5-modal-study .rlz5-modal-keypoints h3,
        body.dark .rlz5-modal-study .rlz5-modal-keypoints h3{
          font-size:22px;
        }
        .rlz5-modal-study .rlz5-modal-summary .content-card,
        .rlz5-modal-study .rlz5-modal-summary .lesson-hero,
        .rlz5-modal-study .rlz5-modal-summary .mini-summary-card,
        .rlz5-modal-study .rlz5-modal-summary .visual-note{
          padding:15px;
          border-radius:18px;
        }
        .rlz5-modal-study .rlz5-modal-summary h3,
        .rlz5-modal-study .rlz5-modal-summary h4,
        body.dark .rlz5-modal-study .rlz5-modal-summary h3,
        body.dark .rlz5-modal-study .rlz5-modal-summary h4{
          font-size:21px;
        }
        .rlz5-modal-study .rlz5-modal-summary table{
          min-width:620px;
        }
        .rlz5-modal-study .rlz5-modal-foot{
          display:grid;
          grid-template-columns:1fr;
          gap:10px;
          padding:11px 12px 12px;
        }
        .rlz5-modal-study .rlz5-modal-foot .rlz5-btn-secondary,
        .rlz5-modal-study .rlz5-modal-foot .rlz5-btn-primary{
          width:100%;
          min-height:40px;
          font-size:14px;
        }
      }

      /* --- "KALDIĞIM ETKİNLİĞE GİT" BUTONU --- */
      body.rlz5-page-active .scroll-top-btn,
      body.rlz5-page-active .rlz5-goto-activity{
        right:calc(18px + env(safe-area-inset-right,0px))!important;
        width:48px;
        height:48px;
      }
      .rlz5-goto-activity{position:fixed;right:calc(18px + env(safe-area-inset-right,0px));bottom:calc(18px + env(safe-area-inset-bottom,0px));width:48px;height:48px;border-radius:50%;border:0;background:linear-gradient(135deg,#7ee000,#58cc02);color:#fff;font-size:24px;font-weight:900;line-height:1;cursor:pointer;box-shadow:0 12px 28px rgba(40,120,0,.4);z-index:150;display:none;align-items:center;justify-content:center;padding:0;touch-action:manipulation;transition:transform .18s ease}
      .rlz5-goto-activity:hover{transform:translateY(-3px) scale(1.04)}
      /* Aşağı butonu yalnızca kaldığın etkinlik ekranda görünmüyorken (aşağıdayken) çıkar; ona gelince gizlenir */
      body.rlz5-page-active.rlz5-show-goto .rlz5-goto-activity{display:flex}
      body.rlz5-page-active.rlz5-show-goto .scroll-top-btn{bottom:calc(78px + env(safe-area-inset-bottom,0px))}
      /* Etkinliğin altına inince: yukarı butonu yeşile döner ve etkinliğe götürür */
      .scroll-top-btn.rlz5-up-green{background:linear-gradient(135deg,#7ee000,#58cc02)!important;box-shadow:0 12px 28px rgba(40,120,0,.42)}
      .scroll-top-btn.rlz5-up-green:hover{box-shadow:0 16px 32px rgba(40,120,0,.5)}
      @media(max-width:480px){
        body.rlz5-page-active .scroll-top-btn,
        body.rlz5-page-active .rlz5-goto-activity{
          right:calc(14px + env(safe-area-inset-right,0px))!important;
          width:44px;
          height:44px;
        }
        .rlz5-goto-activity{right:calc(14px + env(safe-area-inset-right,0px));bottom:calc(14px + env(safe-area-inset-bottom,0px));width:44px;height:44px;font-size:21px}
        body.rlz5-page-active.rlz5-show-goto .scroll-top-btn{bottom:calc(70px + env(safe-area-inset-bottom,0px))}
      }


/* =========================================================
   FINAL FIX — RAVZALINGO DESKTOP + MOBILE BACKGROUND
   Sadece RavzaLingo aktifken çalışır.
   Dosya yolları:
   - assets/calisma-bolumu/optimized/ravzalingo-desktop.webp
   - assets/calisma-bolumu/optimized/ravzalingo-mobile.webp
   ========================================================= */
body.is-ravzalingo-page,
body.rlz5-page-active {
  background: var(--bg) !important;
}

body.is-ravzalingo-page .content-wrapper,
body.rlz5-page-active .content-wrapper {
  width: 100% !important;
  max-width: none !important;
  padding: 0 !important;
  position: relative !important;
  isolation: isolate !important;
  background: transparent !important;
}

body.is-ravzalingo-page .page.ravzalingo-page,
body.rlz5-page-active .page.ravzalingo-page,
body.is-ravzalingo-page .page.ravzalingo-page.active,
body.rlz5-page-active .page.ravzalingo-page.active {
  position: relative !important;
  isolation: isolate !important;
  z-index: 0 !important;
  width: 100% !important;
  max-width: none !important;
  min-height: calc(100svh - 78px) !important;
  margin: 0 !important;
  border-radius: 0 !important;
  overflow: visible !important;
  background: transparent !important;
}

body.is-ravzalingo-page .page.ravzalingo-page.active::before,
body.rlz5-page-active .page.ravzalingo-page.active::before {
  content: "" !important;
  position: fixed !important;
  top: 78px !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  z-index: 0 !important;
  pointer-events: none !important;
  background-image: url("assets/calisma-bolumu/optimized/ravzalingo-desktop.webp") !important;
  background-size: cover !important;
  background-position: center center !important;
  background-repeat: no-repeat !important;
  background-attachment: scroll !important;
  transform: translateZ(0) !important;
}

body.is-ravzalingo-page .page.ravzalingo-page.active::after,
body.rlz5-page-active .page.ravzalingo-page.active::after {
  content: "" !important;
  position: fixed !important;
  top: 78px !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  z-index: 1 !important;
  pointer-events: none !important;
  background:
    radial-gradient(circle at 50% 30%, rgba(16, 185, 129, .08), transparent 36%),
    linear-gradient(180deg, rgba(5, 18, 18, .16), rgba(5, 18, 18, .42)) !important;
}

body.is-ravzalingo-page #ravzaLingoRoot,
body.rlz5-page-active #ravzaLingoRoot {
  position: relative !important;
  z-index: 2 !important;
  width: 100% !important;
  max-width: none !important;
  display: block !important;
  background: transparent !important;
}

body.is-ravzalingo-page #ravzaLingoRoot .rlz5-shell,
body.rlz5-page-active #ravzaLingoRoot .rlz5-shell,
body.is-ravzalingo-page #ravzaLingoRoot .rlz5-lesson-shell,
body.rlz5-page-active #ravzaLingoRoot .rlz5-lesson-shell {
  position: relative !important;
  z-index: 2 !important;
  width: 100% !important;
  max-width: none !important;
  min-height: calc(100svh - 78px) !important;
  background: transparent !important;
}

/* Kartlar okunabilir kalsın; arka plan tamamen kapanmasın */
body.is-ravzalingo-page #ravzaLingoRoot .rlz5-section-divider > div,
body.rlz5-page-active #ravzaLingoRoot .rlz5-section-divider > div,
body.is-ravzalingo-page #ravzaLingoRoot .rlz5-empty-card,
body.rlz5-page-active #ravzaLingoRoot .rlz5-empty-card,
body.is-ravzalingo-page #ravzaLingoRoot .rlz5-lesson-card,
body.rlz5-page-active #ravzaLingoRoot .rlz5-lesson-card,
body.is-ravzalingo-page #ravzaLingoRoot .rlz5-summary-card,
body.rlz5-page-active #ravzaLingoRoot .rlz5-summary-card {
  backdrop-filter: blur(12px) saturate(1.12) !important;
  -webkit-backdrop-filter: blur(12px) saturate(1.12) !important;
}

@media (max-width: 1024px) {
  body.is-ravzalingo-page .page.ravzalingo-page.active::before,
  body.rlz5-page-active .page.ravzalingo-page.active::before,
  body.is-ravzalingo-page .page.ravzalingo-page.active::after,
  body.rlz5-page-active .page.ravzalingo-page.active::after {
    left: 0 !important;
  }
}

@media (max-width: 900px) {
  body.is-ravzalingo-page .page.ravzalingo-page,
  body.rlz5-page-active .page.ravzalingo-page,
  body.is-ravzalingo-page .page.ravzalingo-page.active,
  body.rlz5-page-active .page.ravzalingo-page.active {
    min-height: calc(100svh - 70px) !important;
  }

  body.is-ravzalingo-page .page.ravzalingo-page.active::before,
  body.rlz5-page-active .page.ravzalingo-page.active::before {
    top: 70px !important;
    left: 0 !important;
    background-image: url("assets/calisma-bolumu/optimized/ravzalingo-mobile.webp") !important;
    background-size: cover !important;
    background-position: center top !important;
    background-repeat: no-repeat !important;
    background-attachment: scroll !important;
  }

  body.is-ravzalingo-page .page.ravzalingo-page.active::after,
  body.rlz5-page-active .page.ravzalingo-page.active::after {
    top: 70px !important;
    left: 0 !important;
    background:
      linear-gradient(180deg, rgba(5, 18, 18, .12), rgba(5, 18, 18, .42)) !important;
  }

  body.is-ravzalingo-page #ravzaLingoRoot .rlz5-shell,
  body.rlz5-page-active #ravzaLingoRoot .rlz5-shell,
  body.is-ravzalingo-page #ravzaLingoRoot .rlz5-lesson-shell,
  body.rlz5-page-active #ravzaLingoRoot .rlz5-lesson-shell {
    min-height: calc(100svh - 70px) !important;
  }
}

@media (max-width: 900px) and (orientation: landscape) {
  body.is-ravzalingo-page .page.ravzalingo-page.active::before,
  body.rlz5-page-active .page.ravzalingo-page.active::before {
    background-image: url("assets/calisma-bolumu/optimized/ravzalingo-desktop.webp") !important;
    background-position: center center !important;
  }
}

@media (max-width: 480px) {
  body.is-ravzalingo-page .page.ravzalingo-page.active::before,
  body.rlz5-page-active .page.ravzalingo-page.active::before {
    background-position: center top !important;
  }
}


    `;
    document.head.appendChild(style);
  }

  function rlzHookNavigate() {
    if (typeof window.navigate !== "function" || window.__RLZ5_NAV_HOOKED__) return;
    window.__RLZ5_NAV_HOOKED__ = true;
    const original = window.navigate;
    window.navigate = function patchedNavigate(page, ...args) {
      const result = original.apply(this, [page, ...args]);
      document.documentElement.classList.toggle("is-ravzalingo-page", page === "ravzalingo");
      document.body.classList.toggle("rlz5-page-active", page === "ravzalingo");
      document.body.classList.toggle("is-ravzalingo-page", page === "ravzalingo");
      if (page === "ravzalingo") requestAnimationFrame(() => { RLZ_SESSION = null; rlzRenderHome(); rlzUpdateNavButtons(); rlzUpdateStickyTopbar(); });
      else { rlz5CloseTopicModal(); rlzUpdateNavButtons(); rlzUpdateStickyTopbar(); }
      return result;
    };
  }

  /* --- "ÜNİTE İÇERİKLERİ" POPUP (bir bölümün tüm ünite listesi) --- */
  function rlzFindUnit(unitId) {
    const content = rlzBuildContent();
    for (const s of content.sections) {
      const u = s.units.find((x) => x.id === unitId);
      if (u) return { unit: u, section: s };
    }
    return null;
  }
  function rlzUnitStatus(state, sections, sectionIdx, unitIdx, unit) {
    const prog = rlzGetUnitProgress(state, unit.id);
    const unlocked = rlzIsUnitUnlocked(state, sections, sectionIdx, unitIdx);
    if ((prog.stars || 0) >= 5) return { cls: "done", label: "Tamamlandı", icon: "✓" };
    if (!unlocked) return { cls: "locked", label: "Kilitli", icon: "🔒" };
    if ((prog.lessonsDone || 0) > 0) return { cls: "progress", label: "Devam ediyor", icon: "▸" };
    return { cls: "ready", label: "Hazır", icon: "✓" };
  }
  function rlz5ShowStudyTopicModal(unitId) {
    const found = rlzFindUnit(unitId);
    if (!found) return;
    const unit = found.unit;
    const topic = unit.topic || {};
    const keyPoints = Array.isArray(topic.keyPoints) ? topic.keyPoints : [];
    const safeId = String(topic.id || unit.id || unitId).replace(/'/g, "\\'");
    rlz5CloseTopicModal();
    const overlay = document.createElement("div");
    overlay.className = "rlz5-modal-overlay";
    overlay.id = "rlz5TopicModal";
    overlay.innerHTML = `
      <div class="rlz5-modal rlz5-modal-study" role="dialog" aria-modal="true" aria-label="${rlzEsc(unit.title)} çalışma pop-up">
        <div class="rlz5-modal-head">
          <span class="rlz5-modal-icon" aria-hidden="true">📋</span>
          <div class="rlz5-modal-headtext">
            <h2>${rlzEsc(unit.title)}</h2>
            <p>${rlzEsc(unit.subtitle || unit.unit || found.section.title)}</p>
          </div>
          <button type="button" class="rlz5-modal-close" onclick="rlz5CloseTopicModal()" aria-label="Kapat">✕</button>
        </div>
        <div class="rlz5-modal-body">
          ${keyPoints.length ? `<div class="rlz5-modal-keypoints"><h3>Kritik Noktalar</h3><ul>${keyPoints.map((p) => `<li>${rlzEsc(p)}</li>`).join("")}</ul></div>` : ""}
          ${topic.summaryHtml ? `<div class="rlz5-modal-summary">${topic.summaryHtml}</div>` : (keyPoints.length ? "" : `<p>Bu konu için henüz çalışma içeriği eklenmemiş.</p>`)}
        </div>
        <div class="rlz5-modal-foot">
          <button type="button" class="rlz5-btn-secondary" onclick="rlz5CloseTopicModal()">Kapat</button>
          <button type="button" class="rlz5-btn-primary" onclick="rlz5OpenStudyCenterTopic('${safeId}')">Çalışma Merkezi'nde Aç</button>
        </div>
      </div>`;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) rlz5CloseTopicModal(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("is-open"));
  }
  function rlz5ShowTopicModal(unitId) {
    const found = rlzFindUnit(unitId);
    if (!found) return;
    const content = rlzBuildContent();
    const section = found.section;
    const sectionIdx = content.sections.indexOf(section);
    const state = rlzLoad();
    const units = section.units || [];
    rlz5CloseTopicModal();
    const rowsHtml = units.map((u, i) => {
      const st = rlzUnitStatus(state, content.sections, sectionIdx, i, u);
      const sid = String(u.id).replace(/'/g, "\\'");
      const isCur = u.id === unitId;
      return `
        <button type="button" class="rlz5-uc-row${isCur ? " is-current" : ""}${st.cls === "locked" ? " is-locked" : ""}" onclick="rlz5GoToUnit('${sid}')" title="${rlzEsc(u.title)}">
          <span class="rlz5-uc-secbadge">${section.number}</span>
          <span class="rlz5-uc-unit">${i + 1}. Ünite</span>
          <span class="rlz5-uc-topic"><span class="rlz5-uc-ico">${rlzEsc(u.icon || "📄")}</span><span class="rlz5-uc-name">${rlzEsc(u.title)}</span></span>
          <span class="rlz5-uc-status rlz5-uc-status-${st.cls}">${st.icon} ${st.label}</span>
          <span class="rlz5-uc-chev" aria-hidden="true">›</span>
        </button>`;
    }).join("");
    const overlay = document.createElement("div");
    overlay.className = "rlz5-modal-overlay";
    overlay.id = "rlz5TopicModal";
    overlay.innerHTML = `
      <div class="rlz5-modal rlz5-modal-units" role="dialog" aria-modal="true" aria-label="${rlzEsc(section.title)} ünite içerikleri">
        <div class="rlz5-modal-head">
          <span class="rlz5-modal-icon" aria-hidden="true">📖</span>
          <div class="rlz5-modal-headtext">
            <h2>Ünite İçerikleri</h2>
            <p>${rlzEsc(section.kicker || section.title)} ders listesi</p>
          </div>
          <button type="button" class="rlz5-modal-close" onclick="rlz5CloseTopicModal()" aria-label="Kapat">✕</button>
        </div>
        <div class="rlz5-modal-body">
          <div class="rlz5-uc-head">
            <span>Section</span><span>Ünite</span><span>Konu</span><span>Durum</span><span></span>
          </div>
          <div class="rlz5-uc-list">${rowsHtml}</div>
        </div>
        <div class="rlz5-modal-foot rlz5-uc-foot">
          <span class="rlz5-uc-note"><span class="rlz5-uc-noteico">i</span> Tüm üniteleri tamamlayarak bölümü bitirmeye bir adım daha yaklaşırsın.</span>
          <button type="button" class="rlz5-btn-secondary rlz5-uc-progbtn" onclick="rlz5UnitsProgressView()">📊 İlerlemeyi Görüntüle</button>
        </div>
      </div>`;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) rlz5CloseTopicModal(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("is-open"));
  }
  function rlz5ShowAllTopicsModal(activeUnitId = "") {
    const content = rlzBuildContent();
    const state = rlzLoad();
    rlz5CloseTopicModal();
    const sectionsHtml = content.sections.map((section, sectionIdx) => {
      const rows = (section.units || []).map((u, i) => {
        const st = rlzUnitStatus(state, content.sections, sectionIdx, i, u);
        const sid = String(u.id).replace(/'/g, "\\'");
        const isCur = u.id === activeUnitId;
        return `
          <button type="button" class="rlz5-all-topic${isCur ? " is-current" : ""}${st.cls === "locked" ? " is-locked" : ""}" onclick="rlz5GoToUnit('${sid}')" title="${rlzEsc(u.title)}">
            <span class="rlz5-all-ico">${rlzEsc(u.icon || "📄")}</span>
            <span class="rlz5-all-copy">
              <strong>${rlzEsc(u.title)}</strong>
              <small>${rlzEsc(u.unit || section.title)}${u.subtitle ? " · " + rlzEsc(u.subtitle) : ""}</small>
            </span>
            <span class="rlz5-all-status rlz5-all-status-${st.cls}">${st.icon} ${st.label}</span>
          </button>`;
      }).join("");
      return `
        <section class="rlz5-all-section">
          <div class="rlz5-all-title">${rlzEsc(section.kicker || section.title)} · ${rlzEsc(section.title)}</div>
          ${rows}
        </section>`;
    }).join("");
    const overlay = document.createElement("div");
    overlay.className = "rlz5-modal-overlay";
    overlay.id = "rlz5TopicModal";
    overlay.innerHTML = `
      <div class="rlz5-modal rlz5-modal-units" role="dialog" aria-modal="true" aria-label="Bütün konular">
        <div class="rlz5-modal-head">
          <span class="rlz5-modal-icon" aria-hidden="true">📚</span>
          <div class="rlz5-modal-headtext">
            <h2>Bütün Konular</h2>
            <p>Çalışmak istediğin konuyu seç</p>
          </div>
          <button type="button" class="rlz5-modal-close" onclick="rlz5CloseTopicModal()" aria-label="Kapat">✕</button>
        </div>
        <div class="rlz5-modal-body">
          <div class="rlz5-all-list">${sectionsHtml}</div>
        </div>
        <div class="rlz5-modal-foot rlz5-uc-foot">
          <span class="rlz5-uc-note"><span class="rlz5-uc-noteico">i</span> Konuya tıklayınca RavzaLingo içindeki başlığına gider; çalışma merkezi açılmaz.</span>
          <button type="button" class="rlz5-btn-secondary rlz5-uc-progbtn" onclick="rlz5UnitsProgressView()">📊 İlerlemeyi Görüntüle</button>
        </div>
      </div>`;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) rlz5CloseTopicModal(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("is-open"));
  }
  function rlz5CloseTopicModal() {
    const el = document.getElementById("rlz5TopicModal");
    if (!el) return;
    el.classList.remove("is-open");
    setTimeout(() => { el.remove(); }, 220);
  }
  function rlz5FindUnitBanner(unitId) {
    const root = rlzRoot();
    if (!root) return null;
    const id = String(unitId || "");
    return Array.prototype.slice.call(root.querySelectorAll(".rlz5-unit-banner[data-unit-id]"))
      .find((banner) => banner.id !== "rlz5UnitSticky" && banner.dataset.unitId === id) || null;
  }
  function rlz5ScrollToUnitBanner(unitId) {
    const banner = rlz5FindUnitBanner(unitId);
    if (!banner) return;
    const top = banner.getBoundingClientRect().top + window.scrollY - rlzTopbarBottom() - 18;
    window.scrollTo({ top: Math.max(0, Math.round(top)), behavior: "smooth" });
  }
  function rlz5GoToUnit(unitId) {
    rlz5CloseTopicModal();
    const go = () => rlz5ScrollToUnitBanner(unitId);
    const page = document.getElementById("ravzalingo");
    if (page && !page.classList.contains("active") && typeof window.navigate === "function") {
      window.navigate("ravzalingo");
      setTimeout(go, 300);
    } else {
      setTimeout(go, 60);
    }
  }
  function rlz5UnitProgressPercent(progress) {
    const lessonsPct = Math.min(RLZ_LESSONS_PER_UNIT, Math.max(0, progress.lessonsDone || 0)) / RLZ_LESSONS_PER_UNIT;
    const starsPct = Math.min(5, Math.max(0, progress.stars || 0)) / 5;
    return Math.round(Math.max(lessonsPct, starsPct) * 100);
  }
  function rlz5ShowProgressGraphModal() {
    const content = rlzBuildContent();
    const state = rlzLoad();
    const unitsFlat = [];
    content.sections.forEach((section, sectionIdx) => {
      (section.units || []).forEach((unit, unitIdx) => {
        const progress = rlzGetUnitProgress(state, unit.id);
        const pct = rlz5UnitProgressPercent(progress);
        const unlocked = rlzIsUnitUnlocked(state, content.sections, sectionIdx, unitIdx);
        unitsFlat.push({ section, sectionIdx, unit, unitIdx, progress, pct, unlocked });
      });
    });
    const totalUnits = unitsFlat.length;
    const completedUnits = unitsFlat.filter((item) => (item.progress.stars || 0) >= 5).length;
    const startedUnits = unitsFlat.filter((item) => (item.progress.stars || 0) > 0 || (item.progress.lessonsDone || 0) > 0).length;
    const totalStars = unitsFlat.reduce((sum, item) => sum + Math.min(5, Math.max(0, item.progress.stars || 0)), 0);
    const overallPct = totalUnits ? Math.round(unitsFlat.reduce((sum, item) => sum + item.pct, 0) / totalUnits) : 0;
    const currentItem = unitsFlat.find((item) => item.unlocked && (item.progress.stars || 0) < 5) || unitsFlat[unitsFlat.length - 1];
    const sectionsHtml = content.sections.map((section, sectionIdx) => {
      const items = (section.units || []).map((unit, unitIdx) => {
        const progress = rlzGetUnitProgress(state, unit.id);
        const pct = rlz5UnitProgressPercent(progress);
        const status = rlzUnitStatus(state, content.sections, sectionIdx, unitIdx, unit);
        const sid = String(unit.id).replace(/'/g, "\\'");
        const stars = Math.min(5, Math.max(0, progress.stars || 0));
        const starsHtml = Array.from({ length: 5 }, (_, i) => `<span class="${i < stars ? "is-on" : ""}">★</span>`).join("");
        return `
          <button type="button" class="rlz5-progress-unit is-${status.cls}" onclick="rlz5GoToUnit('${sid}')" title="${rlzEsc(unit.title)}">
            <span class="rlz5-progress-unit-head">
              <span class="rlz5-progress-unit-icon">${rlzEsc(unit.icon || "📄")}</span>
              <span class="rlz5-progress-unit-copy">
                <strong>${rlzEsc(unit.title)}</strong>
                <small>${unitIdx + 1}. Ünite · ${status.icon} ${status.label}</small>
              </span>
              <b>${pct}%</b>
            </span>
            <span class="rlz5-progress-track" aria-hidden="true"><span class="rlz5-progress-fill" style="width:${pct}%"></span></span>
            <span class="rlz5-progress-stars" aria-label="${stars}/5 yıldız">${starsHtml}</span>
          </button>`;
      }).join("");
      const sectionItems = unitsFlat.filter((item) => item.sectionIdx === sectionIdx);
      const sectionPct = sectionItems.length ? Math.round(sectionItems.reduce((sum, item) => sum + item.pct, 0) / sectionItems.length) : 0;
      return `
        <section class="rlz5-progress-section" style="--section-pct:${sectionPct}">
          <div class="rlz5-progress-section-head">
            <div>
              <span>${rlzEsc(section.kicker || section.title)}</span>
              <strong>${rlzEsc(section.title)}</strong>
            </div>
            <b>${sectionPct}%</b>
          </div>
          <div class="rlz5-progress-section-bar" aria-hidden="true"><span></span></div>
          <div class="rlz5-progress-units">${items}</div>
        </section>`;
    }).join("");
    const overlay = document.createElement("div");
    overlay.className = "rlz5-modal-overlay";
    overlay.id = "rlz5TopicModal";
    overlay.innerHTML = `
      <div class="rlz5-modal rlz5-modal-units rlz5-progress-modal" role="dialog" aria-modal="true" aria-label="İlerleme grafiği">
        <div class="rlz5-modal-head">
          <span class="rlz5-modal-icon" aria-hidden="true">📊</span>
          <div class="rlz5-modal-headtext">
            <h2>İlerleme Grafiği</h2>
            <p>RavzaLingo konu tamamlama durumu</p>
          </div>
          <button type="button" class="rlz5-modal-close" onclick="rlz5CloseTopicModal()" aria-label="Kapat">✕</button>
        </div>
        <div class="rlz5-modal-body">
          <div class="rlz5-progress-hero">
            <div class="rlz5-progress-ring" style="--pct:${overallPct}">
              <span><strong>${overallPct}%</strong><small>genel ilerleme</small></span>
            </div>
            <div class="rlz5-progress-summary">
              <div><b>${completedUnits}/${totalUnits}</b><small>Tamamlanan konu</small></div>
              <div><b>${startedUnits}</b><small>Başlanan konu</small></div>
              <div><b>${totalStars}</b><small>Toplam yıldız</small></div>
              <div><b>${currentItem ? rlzEsc(currentItem.unit.title) : "-"}</b><small>Sıradaki başlık</small></div>
            </div>
          </div>
          <div class="rlz5-progress-chart">${sectionsHtml}</div>
        </div>
        <div class="rlz5-modal-foot rlz5-uc-foot">
          <span class="rlz5-uc-note"><span class="rlz5-uc-noteico">i</span> Grafikteki konu kartına tıklayınca RavzaLingo'daki başlığına gidersin.</span>
          <button type="button" class="rlz5-btn-secondary rlz5-uc-progbtn" onclick="rlz5CloseTopicModal()">Kapat</button>
        </div>
      </div>`;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) rlz5CloseTopicModal(); });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("is-open"));
  }
  function rlz5UnitsProgressView() {
    rlz5CloseTopicModal();
    const show = () => rlz5ShowProgressGraphModal();
    const page = document.getElementById("ravzalingo");
    if (page && !page.classList.contains("active") && typeof window.navigate === "function") {
      try { window.navigate("ravzalingo"); } catch (_) {}
      setTimeout(show, 320);
    } else {
      setTimeout(show, 240);
    }
  }
  // Geriye uyumluluk (eski isim)
  function rlz5OpenFullTopic(topicId) {
    rlz5GoToUnit(topicId);
  }
  function rlz5OpenStudyCenterTopic(topicId) {
    rlz5CloseTopicModal();
    if (typeof window.openStudyTopic === "function") {
      try { window.openStudyTopic(topicId); } catch (_) {}
    }
  }

  /* --- "KALDIĞIM ETKİNLİĞE GİT" BUTONU --- */
  function rlzEnsureGotoActivityBtn() {
    if (document.getElementById("rlz5GotoActivity")) return;
    const btn = document.createElement("button");
    btn.id = "rlz5GotoActivity";
    btn.type = "button";
    btn.className = "rlz5-goto-activity";
    btn.setAttribute("aria-label", "Kaldığım etkinliğe git");
    btn.title = "Kaldığım etkinliğe git";
    btn.textContent = "⌄";
    btn.addEventListener("click", rlz5GotoActivity);
    document.body.appendChild(btn);
  }
  function rlz5GotoActivity() {
    const page = document.getElementById("ravzalingo");
    if (!page) return;
    if (!page.classList.contains("active") && typeof window.navigate === "function") {
      window.navigate("ravzalingo");
      setTimeout(() => { rlz5ScrollToCurrentNode(); setTimeout(rlzUpdateNavButtons, 500); }, 250);
      return;
    }
    rlz5ScrollToCurrentNode();
    setTimeout(rlzUpdateNavButtons, 500);
  }
  function rlzCurrentActivityNode() {
    const root = rlzRoot();
    if (!root) return null;
    return root.querySelector(".rlz5-node-wrap.is-current")
      || root.querySelector(".rlz5-node.is-current")?.closest(".rlz5-path-row")
      || [...root.querySelectorAll(".rlz5-node:not(.is-locked)")].pop()
      || null;
  }
  function rlz5ScrollToCurrentNode() {
    const target = rlzCurrentActivityNode();
    if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function rlzScrollY() { return window.scrollY || document.documentElement.scrollTop || 0; }
  // Kullanıcı kaldığı etkinliğin belirgin şekilde aşağısında mı?
  function rlzIsBelowActivity() {
    if (RLZ_SESSION) return false;
    if (!document.body.classList.contains("rlz5-page-active")) return false;
    const node = rlzCurrentActivityNode();
    if (!node) return false;
    const nodeTop = node.getBoundingClientRect().top + rlzScrollY();
    return rlzScrollY() > nodeTop - 60;
  }
  // Kaldığın etkinlik ekranın belirgin şekilde aşağısında mı (yani henüz oraya gelmedin mi)?
  function rlzActivityBelowViewport() {
    if (RLZ_SESSION) return false;
    const node = rlzCurrentActivityNode();
    if (!node) return false;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    return node.getBoundingClientRect().top >= vh - 80;
  }
  // Buton durumları: aşağı butonunun görünürlüğü / yukarı butonun rengi & başlığı
  function rlzUpdateNavButtons() {
    const onPage = document.body.classList.contains("rlz5-page-active");
    const below = onPage && rlzIsBelowActivity();
    const showGoto = onPage && !below && rlzActivityBelowViewport();
    document.body.classList.toggle("rlz5-below-activity", below);
    document.body.classList.toggle("rlz5-show-goto", showGoto);
    const upBtn = document.getElementById("scrollTopBtn");
    if (upBtn) {
      upBtn.classList.toggle("rlz5-up-green", below);
      upBtn.title = below ? "Kaldığın etkinliğe çık" : "Yukarı çık";
    }
  }
  // Global "yukarı çık" butonunu RavzaLingo'da iki aşamalı yap:
  // 1) kaldığın etkinliğin altındaysan → yeşil olur, basınca önce oraya çıkar
  // 2) etkinlikteysen/üstündeysen → tema rengine döner, en yukarı çıkar (orijinal davranış)
  function rlzHookScrollTopBtn() {
    if (window.__RLZ5_SCROLLTOP_HOOKED__) return;
    window.__RLZ5_SCROLLTOP_HOOKED__ = true;
    document.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest && e.target.closest("#scrollTopBtn");
      if (!btn) return;
      if (!rlzIsBelowActivity()) return; // bırak, orijinal handler en üste götürsün
      e.preventDefault();
      e.stopImmediatePropagation();      // butondaki global click handler çalışmasın
      rlz5ScrollToCurrentNode();
      setTimeout(rlzUpdateNavButtons, 500); // gidince yeşil → tema rengine dönsün
    }, true); // capture: butondaki dinleyicilerden önce çalışır
    window.addEventListener("scroll", rlzUpdateNavButtons, { passive: true });
    rlzUpdateNavButtons();
  }

  /* --- YAPIŞKAN ÜST BAR: kalıcı olarak position:fixed + yer tutucu (overflow/sticky sorunlarından bağımsız) --- */
  let RLZ_FIXBAR_RAF = null;
  function rlzSiteHeaderH() {
    const h = document.querySelector(".main-content > .topbar") || document.querySelector(".topbar");
    return h ? Math.round(h.getBoundingClientRect().height) : 0;
  }
  function rlzLayoutFixedTopbar() {
    RLZ_FIXBAR_RAF = null;
    const root = rlzRoot();
    if (!root) return;
    const bar = root.querySelector(".rlz5-topbar");
    if (!bar) return;
    if (!document.body.classList.contains("rlz5-page-active")) return; // sayfa açık değilse dokunma
    let spacer = root.querySelector(".rlz5-topbar-spacer");
    if (!spacer) {
      spacer = document.createElement("div");
      spacer.className = "rlz5-topbar-spacer";
      bar.parentNode.insertBefore(spacer, bar.nextSibling);
    }
    // spacer (akışta, block, width:auto) → içerik kutusunun sol/genişliğini yansıtır
    const sr = spacer.getBoundingClientRect();
    bar.style.left = Math.round(sr.left) + "px";
    bar.style.width = Math.round(sr.width) + "px";
    bar.style.top = rlzSiteHeaderH() + "px";
    // genişlik atandıktan sonra gerçek yüksekliği ölç ve yer tutucuyu ayarla (+ margin payı)
    spacer.style.height = (Math.round(bar.getBoundingClientRect().height) + 20) + "px";
    rlzUpdateUnitSticky();
  }
  // Stat barının alt kenarının ekrandaki konumu
  function rlzTopbarBottom() {
    const root = rlzRoot();
    const bar = root && root.querySelector(".rlz5-topbar");
    if (bar) { const r = bar.getBoundingClientRect(); if (r.height) return Math.round(r.bottom); }
    return rlzSiteHeaderH();
  }
  function rlzEnsureUnitStickyBanner() {
    const root = rlzRoot();
    if (!root) return null;
    let el = root.querySelector("#rlz5UnitSticky");
    if (!el) {
      el = document.createElement("div");
      el.id = "rlz5UnitSticky";
      el.className = "rlz5-unit-banner rlz5-unit-sticky";
      el.style.display = "none";
      root.appendChild(el);
    }
    return el;
  }
  // Kayan ünite banner'ı: stat barının altına gizlenen ünitenin başlığını orada gösterir
  function rlzUpdateUnitSticky() {
    const sticky = (rlzRoot() ? rlzRoot().querySelector("#rlz5UnitSticky") : null);
    if (!document.body.classList.contains("rlz5-page-active") || RLZ_SESSION) {
      if (sticky) sticky.style.display = "none";
      return;
    }
    const root = rlzRoot();
    if (!root) return;
    const el = rlzEnsureUnitStickyBanner();
    if (!el) return;
    const banners = Array.prototype.slice.call(root.querySelectorAll(".rlz5-unit-banner")).filter((b) => b.id !== "rlz5UnitSticky");
    if (!banners.length) { el.style.display = "none"; return; }
    const lineTop = rlzTopbarBottom() + 6;
    let active = null, next = null;
    for (let i = 0; i < banners.length; i += 1) {
      const r = banners[i].getBoundingClientRect();
      if (r.bottom <= lineTop) active = banners[i];
      else { next = banners[i]; break; }
    }
    if (!active) { el.style.display = "none"; return; }
    const ar = active.getBoundingClientRect();
    el.innerHTML = active.innerHTML;
    let cls = "rlz5-unit-banner rlz5-unit-sticky";
    if (active.classList.contains("is-done")) cls += " is-done";
    if (active.classList.contains("is-locked")) cls += " is-locked";
    el.className = cls;
    el.id = "rlz5UnitSticky";
    el.dataset.unitId = active.dataset.unitId || "";
    el.title = active.title || "";
    const stickyMain = el.querySelector(".rlz5-banner-main");
    if (stickyMain) {
      stickyMain.setAttribute("aria-label", "RavzaLingo konu başlığına git");
      stickyMain.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (el.dataset.unitId) rlz5GoToUnit(el.dataset.unitId);
      };
    }
    el.onclick = function (event) {
      if (event?.target?.closest?.(".rlz5-banner-guide")) return;
      if (el.dataset.unitId) rlz5GoToUnit(el.dataset.unitId);
    };
    const section = active.closest(".rlz5-section");
    if (section) {
      const cs = getComputedStyle(section);
      el.style.setProperty("--rlz-main", cs.getPropertyValue("--rlz-main"));
      el.style.setProperty("--rlz-deep", cs.getPropertyValue("--rlz-deep"));
      el.style.setProperty("--rlz-light", cs.getPropertyValue("--rlz-light"));
    }
    const stickyLeft = Math.max(0, Math.round(ar.left));
    const stickyWidth = Math.max(0, Math.min(Math.round(ar.width), Math.round(window.innerWidth - stickyLeft - 12)));
    el.style.setProperty("position", "fixed", "important");
    el.style.setProperty("left", stickyLeft + "px", "important");
    el.style.setProperty("right", "auto", "important");
    el.style.setProperty("width", stickyWidth + "px", "important");
    el.style.setProperty("max-width", stickyWidth + "px", "important");
    el.style.setProperty("z-index", "55", "important");
    el.style.setProperty("display", "flex", "important");
    // sıradaki banner yaklaşırsa "yukarı it" efekti
    let y = lineTop;
    const sh = el.getBoundingClientRect().height || ar.height;
    if (next) {
      const nr = next.getBoundingClientRect();
      if (nr.top < lineTop + sh) y = Math.max(rlzTopbarBottom() - sh + 6, nr.top - sh);
    }
    el.style.setProperty("top", Math.round(y) + "px", "important");
  }
  function rlzScheduleFixedTopbar() {
    if (RLZ_FIXBAR_RAF != null) return;
    RLZ_FIXBAR_RAF = requestAnimationFrame(rlzLayoutFixedTopbar);
  }
  // Eski isimlerle uyumluluk (çağrı yerleri korunsun)
  function rlzUpdateStickyTopbar() { rlzLayoutFixedTopbar(); }
  function rlzHookStickyTopbar() {
    if (window.__RLZ5_FIXBAR__) return;
    window.__RLZ5_FIXBAR__ = true;
    window.addEventListener("resize", rlzScheduleFixedTopbar, { passive: true });
    window.addEventListener("scroll", rlzScheduleFixedTopbar, { passive: true });
  }

  /* --- WINDOW EXPORTS --- */
  window.rlz5StartLesson = rlz5StartLesson;
  window.rlz5SelectWord = rlz5SelectWord;
  window.rlz5SelectQuiz = rlz5SelectQuiz;
  window.rlz5SelectListen = rlz5SelectListen;
  window.rlz5Match = rlz5Match;
  window.rlz5Listen = rlz5Listen;
  window.rlz5Check = rlz5Check;
  window.rlz5Skip = rlz5Skip;
  window.rlz5Quit = rlz5Quit;
  window.rlz5Home = rlz5Home;
  window.rlz5BuyHearts = rlz5BuyHearts;
  window.rlz5ShowStudyTopicModal = rlz5ShowStudyTopicModal;
  window.rlz5ShowTopicModal = rlz5ShowTopicModal;
  window.rlz5ShowAllTopicsModal = rlz5ShowAllTopicsModal;
  window.rlz5CloseTopicModal = rlz5CloseTopicModal;
  window.rlz5OpenFullTopic = rlz5OpenFullTopic;
  window.rlz5OpenStudyCenterTopic = rlz5OpenStudyCenterTopic;
  window.rlz5GoToUnit = rlz5GoToUnit;
  window.rlz5UnitsProgressView = rlz5UnitsProgressView;
  window.rlz5GotoActivity = rlz5GotoActivity;
  window.renderRavzaLingo = rlzRenderHome;
  window.refreshRavzaLingoContent = function refreshRavzaLingoContent() { RLZ_CONTENT_CACHE = null; return rlzRenderHome(); };
  window.resetRavzaLingoV5 = function () {
    RLZ_STATE = rlzNormalizeState(null);
    RLZ_SESSION = null; RLZ_CONTENT_CACHE = null;
    if (RLZ_FB_READY) rlzSaveToFirebase(RLZ_STATE);
    try { localStorage.removeItem(RLZ_STATE_KEY); } catch (_) {}
    rlzRenderHome();
  };

  /* --- CAN GERİ SAYIM (gerçek zamanlı) --- */
  let RLZ_HEART_TICK = null;
  function rlzStartHeartTicker() {
    if (RLZ_HEART_TICK) clearInterval(RLZ_HEART_TICK);
    RLZ_HEART_TICK = setInterval(() => {
      const page = document.getElementById("ravzalingo");
      if (!page || !page.classList.contains("active")) return; // sadece görünürken çalış
      if (RLZ_SESSION) return;                                  // ders ekranındaysa dokunma
      const root = rlzRoot();
      const state = RLZ_STATE;
      if (!root || !state) return;
      const onHome = !!root.querySelector(".rlz5-topbar");
      const outOfHeartsEl = document.getElementById("rlz5HeartCountdown");
      if (!onHome && !outOfHeartsEl) return;                    // başka ekran (ders/özet) ise atla

      if (state.hearts < RLZ_MAX_HEARTS) {
        const before = state.hearts;
        rlzRefillHearts(state);
        if (state.hearts !== before) { rlzSave(state); rlzRenderHome(); return; }
      }
      const text = rlzFmtMs(rlzMsToNextHeart(state));
      if (onHome) {
        const heartDiv = root.querySelector(".rlz5-stat.heart > div");
        const small = heartDiv && heartDiv.querySelector("small");
        if (state.hearts >= RLZ_MAX_HEARTS) { if (small) small.remove(); }
        else if (small) small.textContent = text;
        else if (heartDiv) heartDiv.insertAdjacentHTML("beforeend", `<small>${text}</small>`);
      }
      if (outOfHeartsEl) outOfHeartsEl.textContent = text;
    }, 1000);
  }

  function rlzInit() {
    rlzInjectCss();
    rlzEnsureMarkup();
    rlzEnsureGotoActivityBtn();
    rlzHookNavigate();
    rlzHookScrollTopBtn();
    rlzHookStickyTopbar();
    rlzStartHeartTicker();
    const activeRavza = !!document.getElementById("ravzalingo")?.classList.contains("active");
    document.documentElement.classList.toggle("is-ravzalingo-page", activeRavza);
    document.body.classList.toggle("rlz5-page-active", activeRavza);
    document.body.classList.toggle("is-ravzalingo-page", activeRavza);
    rlzUpdateNavButtons();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { rlz5CloseTopicModal(); return; }
      if (e.key === "Enter" || e.key === " ") {
        const guide = e.target && e.target.closest && e.target.closest(".rlz5-banner-guide[data-unit-id]");
        if (guide && guide.dataset.unitId) { e.preventDefault(); rlz5ShowStudyTopicModal(guide.dataset.unitId); return; }
        const main = e.target && e.target.closest && e.target.closest(".rlz5-banner-main[data-unit-id]");
        if (main && main.dataset.unitId) {
          e.preventDefault();
          if (main.closest("#rlz5UnitSticky")) rlz5GoToUnit(main.dataset.unitId);
          else rlz5ShowAllTopicsModal(main.dataset.unitId);
        }
      }
    });
    rlzLoadFromFirebase().then(() => {
      const page = document.getElementById("ravzalingo");
      if (page?.classList.contains("active")) rlzRenderHome();
    }).catch(() => {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", rlzInit);
  else rlzInit();
})();
/* =========================================================
   RAVZA KAHOOT BÖLÜMÜ
   - RavzaLingo'nun altına ayrı Kahoot sayfası ekler.
   - Mevcut özellikleri değiştirmez.
   - navigate('kahoot') ile ayrı bölüm olarak açılır.
   ========================================================= */
(function ravzaKahootModule() {
  const STORAGE_KEY = "ravza_kahoot_stats_v2";
  const ACTIVE_KEY = "ravza_kahoot_active_category_v1";

  const CATEGORIES = [
    { id: "word", icon: "📖", title: "Kelime Quizleri", desc: "Kelime anlamı, definition ve örnek cümleleri hızlıca pekiştir.", count: 12, color: "purple" },
    { id: "grammar", icon: "🧩", title: "Dil Bilgisi Quizleri", desc: "Tense, pronoun, adjective ve preposition konularını çalış.", count: 9, color: "blue" },
    { id: "unit", icon: "🎓", title: "Ünite Quizleri", desc: "Üniteleri kapsayan konu bazlı yarışma quizleri çöz.", count: 8, color: "green" },
    { id: "mixed", icon: "🎯", title: "Karma Quizler", desc: "Farklı konulardan karışık, hızlı ve eğlenceli sorular.", count: 15, color: "orange" },
    { id: "favorite", icon: "⭐", title: "Favorilerim", desc: "Tekrar edilmesi gereken özel sorularını burada topla.", count: 6, color: "pink" }
  ];

  const FALLBACK_QUESTIONS = [
    {
      question: "Which word means 'kanıt' in Turkish?",
      options: ["Evidence", "Survey", "Nickname", "Scale"],
      answer: 0,
      explanation: "Evidence, bir iddiayı destekleyen kanıt veya bilgi anlamına gelir."
    },
    {
      question: "Choose the correct sentence.",
      options: ["She is a beautiful girl.", "She is beautiful girl.", "She a beautiful girl.", "She beautiful is girl."],
      answer: 0,
      explanation: "Tekil isimden önce article gerekir: a beautiful girl."
    },
    {
      question: "Which sentence uses Present Continuous for a future arrangement?",
      options: ["I meet him yesterday.", "I am meeting him tonight.", "I met him tomorrow.", "I meeting him now."],
      answer: 1,
      explanation: "Önceden ayarlanmış gelecek planlarında Present Continuous kullanılabilir."
    },
    {
      question: "Complete the sentence: I am tired ___ waiting.",
      options: ["of", "for", "at", "to"],
      answer: 0,
      explanation: "Doğru kullanım tired of şeklindedir."
    },
    {
      question: "Which one is an object pronoun?",
      options: ["she", "her", "herselfs", "they"],
      answer: 1,
      explanation: "Her, object pronoun olarak kullanılabilir."
    },
    {
      question: "What is the superlative form of bad?",
      options: ["baddest", "most bad", "worst", "worse"],
      answer: 2,
      explanation: "Bad kelimesinin superlative formu worst'tür."
    },
    {
      question: "Choose the correct dependent preposition: interested ___ science.",
      options: ["on", "in", "for", "at"],
      answer: 1,
      explanation: "Interested in doğru kullanımdır."
    },
    {
      question: "Complete: The flight ___ at 6.50 tomorrow morning.",
      options: ["leaves", "is leaving", "leave", "leaving"],
      answer: 0,
      explanation: "Timetable / schedule anlatırken Present Simple kullanılır."
    }
  ];

  let currentQuiz = null;

  function safeParse(json, fallback) {
    try { return JSON.parse(json) || fallback; } catch (_) { return fallback; }
  }

  function loadStats() {
    return safeParse(localStorage.getItem(STORAGE_KEY), {
      xp: 265,
      crystals: 18,
      bestScore: 0,
      played: []
    });
  }

  function saveStats(stats) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getCategory(categoryId) {
    return CATEGORIES.find((category) => category.id === categoryId) || CATEGORIES.find((category) => category.id === "mixed") || CATEGORIES[0];
  }

  function normalizeTopicQuestion(topic, quizItem, index) {
    if (!quizItem || !Array.isArray(quizItem.options) || quizItem.options.length < 2) return null;
    const answerIndex = Number.isInteger(quizItem.answer) ? quizItem.answer : 0;
    return {
      id: `${topic?.id || "topic"}-${index}`,
      question: quizItem.question || `${topic?.title || "Konu"} sorusu`,
      options: quizItem.options.slice(0, 4),
      answer: Math.max(0, Math.min(answerIndex, quizItem.options.length - 1)),
      explanation: quizItem.explanation || `${topic?.title || "Bu konu"} için kısa tekrar yap.`
    };
  }

  function buildQuestionPool(categoryId) {
    const pool = [];

    try {
      if (Array.isArray(TOPICS)) {
        TOPICS.forEach((topic) => {
          if (!Array.isArray(topic.quiz)) return;
          topic.quiz.forEach((quizItem, index) => {
            const normalized = normalizeTopicQuestion(topic, quizItem, index);
            if (normalized) pool.push(normalized);
          });
        });
      }
    } catch (_) {}

    const base = pool.length ? pool : FALLBACK_QUESTIONS;
    const sizeMap = { word: 6, grammar: 7, unit: 8, mixed: 8, favorite: 5 };
    const size = sizeMap[categoryId] || 8;

    const rotated = base.map((item, index) => ({ item, sort: (index * 17 + categoryId.length * 13) % 37 }))
      .sort((a, b) => a.sort - b.sort)
      .map((entry) => entry.item);

    return rotated.slice(0, size).map((question, index) => ({ ...question, no: index + 1 }));
  }

  function ensureMarkup() {
    const nav = document.querySelector(".nav-links");
    if (nav && !document.getElementById("nav-kahoot")) {
      const li = document.createElement("li");
      li.innerHTML = `
        <button onclick="navigate('kahoot')" id="nav-kahoot">
          <span class="nav-icon kahoot-nav-mark">K!</span>
          Kahoot
        </button>
      `;
      const ravzaLingo = document.getElementById("nav-ravzalingo")?.closest("li");
      const studyHub = document.getElementById("nav-studyhub")?.closest("li");

      if (ravzaLingo?.parentNode) ravzaLingo.parentNode.insertBefore(li, ravzaLingo.nextSibling);
      else if (studyHub?.parentNode) studyHub.parentNode.insertBefore(li, studyHub);
      else nav.appendChild(li);
    }

    if (!document.getElementById("kahoot")) {
      const section = document.createElement("section");
      section.id = "kahoot";
      section.className = "page kahoot-page";
      section.innerHTML = `<div id="kahootRoot" class="kahoot-root"></div>`;

      const ravzaPage = document.getElementById("ravzalingo");
      const studyPage = document.getElementById("studyhub");
      const wrapper = document.querySelector(".content-wrapper") || document.body;

      if (ravzaPage?.parentNode) ravzaPage.parentNode.insertBefore(section, ravzaPage.nextSibling);
      else if (studyPage?.parentNode) studyPage.parentNode.insertBefore(section, studyPage);
      else wrapper.appendChild(section);
    }
  }

  function setKahootActiveNav() {
    document.querySelectorAll(".nav-links button").forEach((button) => button.classList.remove("active"));
    document.getElementById("nav-kahoot")?.classList.add("active");
  }

  function root() {
    ensureMarkup();
    return document.getElementById("kahootRoot");
  }

  function categoryCardsHtml() {
    return CATEGORIES.map((category) => `
      <button class="kahoot-category-card ${category.color}" type="button" onclick="startKahootQuiz('${category.id}')">
        <span class="kahoot-category-icon">${category.icon}</span>
        <span class="kahoot-category-text">
          <strong>${escapeHtml(category.title)}</strong>
          <small>${escapeHtml(category.desc)}</small>
          <em>${category.count} Quiz</em>
        </span>
        <span class="kahoot-arrow">→</span>
      </button>
    `).join("");
  }

  function recentHtml(stats) {
    if (!stats.played.length) {
      return `<div class="kahoot-empty-mini">Henüz Kahoot oynanmadı. Bir kategori seçip yarışmaya başla.</div>`;
    }

    return stats.played.slice(0, 4).map((item) => `
      <button class="kahoot-recent-item" type="button" onclick="startKahootQuiz('${item.categoryId || "mixed"}')">
        <span class="kahoot-k-badge">K!</span>
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${item.questionCount} soru • ${escapeHtml(item.date)}</small>
        </span>
        <b>%${item.score}</b>
      </button>
    `).join("");
  }

  function renderHome() {
    const target = root();
    if (!target) return;
    const stats = loadStats();

    target.innerHTML = `
      <div class="kahoot-shell">
        <div class="kahoot-top-stats">
          <div><span>❤️</span><strong>5/5</strong><small>Enerji</small></div>
          <div><span>⚡</span><strong>${stats.xp}</strong><small>XP</small></div>
          <div><span>💎</span><strong>${stats.crystals}</strong><small>Kristal</small></div>
          <div><span>📊</span><strong>${Math.max(stats.bestScore || 0, 13)}%</strong><small>İlerleme</small></div>
        </div>

        <div class="kahoot-hero-card">
          <div class="kahoot-hero-copy">
            <div class="kahoot-title-line">
              <span class="kahoot-big-logo">K!</span>
              <div>
                <h1>Kahoot</h1>
                <h2>Eğlenceli quizlerle bilgini test et!</h2>
              </div>
            </div>
            <p>Kahoot tarzı canlı ve renkli quizlerle konuları pekiştir, yarış, puan topla ve liderlik tablosunda zirveye çık.</p>
            <div class="kahoot-hero-actions">
              <button class="kahoot-primary-btn" type="button" onclick="startKahootQuiz('mixed')">Hızlı Yarışma Başlat</button>
              <button class="kahoot-secondary-btn" type="button" onclick="startKahootQuiz('favorite')">Favorilerden Başla</button>
            </div>
          </div>

          <div class="kahoot-device-art" aria-hidden="true">
            <div class="kahoot-confetti c1"></div>
            <div class="kahoot-confetti c2"></div>
            <div class="kahoot-confetti c3"></div>
            <div class="kahoot-device">
              <strong>Kahoot!</strong>
              <div class="kahoot-mini-grid">
                <span class="red">▲</span><span class="blue">◆</span><span class="yellow">●</span><span class="green">■</span>
              </div>
            </div>
            <div class="kahoot-trophy">🏆</div>
          </div>
        </div>

        <div class="kahoot-section-head">
          <h3>Quiz Kategorileri</h3>
          <button class="kahoot-create-btn" type="button" onclick="openKahootCreateModal()">+ Yeni Kahoot Oluştur</button>
        </div>

        <div class="kahoot-category-grid">
          ${categoryCardsHtml()}
        </div>

        <div class="kahoot-bottom-grid">
          <div class="kahoot-panel kahoot-recent-panel">
            <div class="kahoot-panel-head"><h3>Son Oynadıkların</h3><span>⏱️</span></div>
            <div class="kahoot-recent-list">${recentHtml(stats)}</div>
          </div>

          <div class="kahoot-panel">
            <div class="kahoot-panel-head"><h3>Liderlik Tablosu</h3><button type="button" onclick="resetKahootStats()">Sıfırla</button></div>
            <div class="kahoot-leaderboard">
              <div><b>1</b><span>👑 Yusuf</span><strong>${Math.max(2450, stats.xp + 2100)} XP</strong></div>
              <div><b>2</b><span>💗 Ravza</span><strong>${Math.max(1890, stats.xp + 1500)} XP</strong></div>
              <div><b>3</b><span>⭐ A.</span><strong>1250 XP</strong></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function startQuiz(categoryId = "mixed") {
    ensureMarkup();
    localStorage.setItem(ACTIVE_KEY, categoryId);
    const category = getCategory(categoryId);
    currentQuiz = {
      categoryId,
      category,
      questions: buildQuestionPool(categoryId),
      index: 0,
      selected: null,
      correct: 0,
      answers: [],
      startedAt: Date.now()
    };
    if (typeof window.navigate === "function") window.navigate("kahoot");
    renderQuiz();
  }

  function renderQuiz() {
    const target = root();
    if (!target || !currentQuiz) return;
    const q = currentQuiz.questions[currentQuiz.index];
    const total = currentQuiz.questions.length;
    const progress = Math.round(((currentQuiz.index) / total) * 100);
    const shapes = ["▲", "◆", "●", "■"];
    const colorClasses = ["red", "blue", "yellow", "green"];

    target.innerHTML = `
      <div class="kahoot-play-shell">
        <div class="kahoot-play-top">
          <button type="button" onclick="renderKahootHome()">← Kahoot Ana Sayfa</button>
          <div>
            <strong>${escapeHtml(currentQuiz.category.title)}</strong>
            <small>Soru ${currentQuiz.index + 1} / ${total}</small>
          </div>
          <span>${progress}%</span>
        </div>

        <div class="kahoot-progress"><span style="width:${Math.max(5, progress)}%"></span></div>

        <div class="kahoot-question-card">
          <div class="kahoot-question-meta">
            <span class="kahoot-k-badge">K!</span>
            <span>Canlı Quiz Modu</span>
          </div>
          <h2>${escapeHtml(q.question)}</h2>
        </div>

        <div class="kahoot-answer-grid">
          ${q.options.map((option, index) => `
            <button type="button" class="kahoot-answer ${colorClasses[index] || "blue"}" onclick="selectKahootAnswer(${index})">
              <span>${shapes[index] || "◆"}</span>
              <strong>${escapeHtml(option)}</strong>
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }

  function selectAnswer(index) {
    if (!currentQuiz) return;
    const q = currentQuiz.questions[currentQuiz.index];
    const isCorrect = index === q.answer;
    if (isCorrect) currentQuiz.correct += 1;
    currentQuiz.answers.push({
      question: q.question,
      selected: q.options[index],
      correct: q.options[q.answer],
      isCorrect,
      explanation: q.explanation || ""
    });
    renderFeedback(index, isCorrect);
  }

  function renderFeedback(selectedIndex, isCorrect) {
    const target = root();
    if (!target || !currentQuiz) return;
    const q = currentQuiz.questions[currentQuiz.index];
    const selectedText = q.options[selectedIndex];

    target.innerHTML = `
      <div class="kahoot-feedback-shell ${isCorrect ? "is-correct" : "is-wrong"}">
        <div class="kahoot-feedback-card">
          <span class="kahoot-feedback-icon">${isCorrect ? "✅" : "❌"}</span>
          <h2>${isCorrect ? "Doğru cevap!" : "Yanlış cevap"}</h2>
          <p><strong>Seçilen:</strong> ${escapeHtml(selectedText)}</p>
          <p><strong>Doğru cevap:</strong> ${escapeHtml(q.options[q.answer])}</p>
          <small>${escapeHtml(q.explanation || "Bu soruyu tekrar ederek konuyu pekiştirebilirsin.")}</small>
          <button type="button" onclick="nextKahootQuestion()">${currentQuiz.index + 1 >= currentQuiz.questions.length ? "Sonucu Gör" : "Sonraki Soru"}</button>
        </div>
      </div>
    `;
  }

  function nextQuestion() {
    if (!currentQuiz) return;
    currentQuiz.index += 1;
    if (currentQuiz.index >= currentQuiz.questions.length) renderResult();
    else renderQuiz();
  }

  function renderResult() {
    const target = root();
    if (!target || !currentQuiz) return;
    const total = currentQuiz.questions.length;
    const score = Math.round((currentQuiz.correct / total) * 100);
    const gainedXp = Math.max(10, currentQuiz.correct * 15);
    const stats = loadStats();
    stats.xp = (stats.xp || 0) + gainedXp;
    stats.crystals = (stats.crystals || 0) + Math.floor(gainedXp / 30);
    stats.bestScore = Math.max(stats.bestScore || 0, score);
    stats.played = [
      {
        title: currentQuiz.category.title,
        categoryId: currentQuiz.categoryId,
        score,
        questionCount: total,
        date: new Date().toLocaleDateString("tr-TR")
      },
      ...(stats.played || [])
    ].slice(0, 8);
    saveStats(stats);

    const review = currentQuiz.answers.map((answer, index) => `
      <div class="kahoot-review-item ${answer.isCorrect ? "ok" : "bad"}">
        <b>${index + 1}</b>
        <span>
          <strong>${escapeHtml(answer.question)}</strong>
          <small>Senin cevabın: ${escapeHtml(answer.selected)} • Doğru: ${escapeHtml(answer.correct)}</small>
        </span>
      </div>
    `).join("");

    target.innerHTML = `
      <div class="kahoot-result-shell">
        <div class="kahoot-result-card">
          <span class="kahoot-result-cup">🏆</span>
          <h2>Quiz Tamamlandı!</h2>
          <p>${escapeHtml(currentQuiz.category.title)} bölümünde skorun:</p>
          <strong class="kahoot-score">%${score}</strong>
          <div class="kahoot-result-stats">
            <div><b>${currentQuiz.correct}/${total}</b><small>Doğru</small></div>
            <div><b>+${gainedXp}</b><small>XP</small></div>
            <div><b>${stats.bestScore}%</b><small>En iyi</small></div>
          </div>
          <div class="kahoot-result-actions">
            <button type="button" onclick="startKahootQuiz('${currentQuiz.categoryId}')">Tekrar Oyna</button>
            <button type="button" onclick="renderKahootHome()">Kahoot Ana Sayfa</button>
          </div>
        </div>
        <div class="kahoot-panel kahoot-review-panel">
          <div class="kahoot-panel-head"><h3>Soru İncelemesi</h3><span>📝</span></div>
          ${review}
        </div>
      </div>
    `;
  }

  function openCreateModal() {
    ensureMarkup();
    const old = document.getElementById("kahootCreateModal");
    if (old) old.remove();
    const modal = document.createElement("div");
    modal.id = "kahootCreateModal";
    modal.className = "kahoot-modal-backdrop";
    modal.innerHTML = `
      <div class="kahoot-modal" role="dialog" aria-modal="true" aria-labelledby="kahootModalTitle">
        <button class="kahoot-modal-close" type="button" onclick="closeKahootCreateModal()">✕</button>
        <span class="kahoot-k-badge">K!</span>
        <h2 id="kahootModalTitle">Yeni Kahoot Oluştur</h2>
        <p>Bu panel şu an tasarım ve hazırlık alanı olarak eklendi. İstersen sonraki adımda buraya soru ekleme, kategori seçme ve Firebase kaydetme sistemi bağlanabilir.</p>
        <div class="kahoot-modal-fields">
          <input type="text" placeholder="Quiz adı: Unit 1A Kelime Yarışması">
          <input type="text" placeholder="Kategori: Kelime / Grammar / Karma">
          <textarea placeholder="Soru taslağı yaz..."></textarea>
        </div>
        <button type="button" onclick="closeKahootCreateModal()">Şimdilik Kapat</button>
      </div>
    `;
    document.body.appendChild(modal);
  }

  function closeCreateModal() {
    document.getElementById("kahootCreateModal")?.remove();
  }

  function resetStats() {
    localStorage.removeItem(STORAGE_KEY);
    renderHome();
  }

  function hookNavigate() {
    if (window.__RAVZA_KAHOOT_NAV_HOOKED__) return;
    window.__RAVZA_KAHOOT_NAV_HOOKED__ = true;
    const originalNavigate = window.navigate;

    window.navigate = function kahootPatchedNavigate(pageId, ...args) {
      ensureMarkup();
      const result = typeof originalNavigate === "function" ? originalNavigate.call(this, pageId, ...args) : undefined;

      const isKahoot = pageId === "kahoot";
      document.documentElement.classList.toggle("is-kahoot-page", isKahoot);
      document.body.classList.toggle("is-kahoot-page", isKahoot);

      if (isKahoot) {
        setKahootActiveNav();
        if (!currentQuiz) renderHome();
      }
      return result;
    };
  }

  function init() {
    ensureMarkup();
    hookNavigate();
    if (location.hash === "#kahoot") {
      try { window.navigate("kahoot"); } catch (_) { renderHome(); }
    }
  }

  window.renderKahootHome = function () { currentQuiz = null; renderHome(); if (typeof window.navigate === "function") window.navigate("kahoot"); };
  window.startKahootQuiz = startQuiz;
  window.selectKahootAnswer = selectAnswer;
  window.nextKahootQuestion = nextQuestion;
  window.openKahootCreateModal = openCreateModal;
  window.closeKahootCreateModal = closeCreateModal;
  window.resetKahootStats = resetStats;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

/* =========================================================
   RAVZA KAHOOT — ÇOK CİHAZLI ODA + QR (FIRESTORE REALTIME)
   - Eski localStorage tabanlı oda sistemi kaldırıldı.
   - Tüm canlı oda durumu Firestore'da: kahootRooms/{roomId} (+ players, answers subcoll).
   - QR ile başka cihazlardan katılım: ?page=kahoot&room=ROOM_ID&role=player
   - Public URL <meta name="kahoot-public-url" content="..."> ile zorlanabilir.
   - QRCode CDN yüklenemese sistem yerel canvas QR üretir; son çare link fallback'i gösterir.
   - Mevcut tek-kişilik kahoot akışı (ravzaKahootModule) korunur.
   - Firestore security rules için NOTLAR aşağıda mevcuttur.
   ========================================================= */
(function ravzaKahootRoomModule() {
  if (window.__RAVZA_KAHOOT_ROOM_MODULE_READY__) return;
  window.__RAVZA_KAHOOT_ROOM_MODULE_READY__ = true;

  /*
    -------- FIRESTORE SECURITY RULES (geliştirme) --------
    match /kahootRooms/{roomId} {
      allow read, write: if true;
      match /players/{playerId} { allow read, write: if true; }
      match /answers/{answerId} { allow read, write: if true; }
    }
    Production'da `if true` KULLANMA.
    En azından roomPin doğrulaması veya App Check + auth ekle.
  */

  const QR_CDN = "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js";
  const QR_CDN_FALLBACKS = [
    QR_CDN,
    "https://unpkg.com/qrcode@1.5.4/build/qrcode.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.4/qrcode.min.js"
  ];
  const ROOM_COLLECTION = "kahootRooms";
  const DEFAULT_QUESTION_TIME = 20;
  const DEFAULT_QUESTION_COUNT = 10;
  const MAX_QUESTION_POINTS = 1000;
  const COUNTDOWN_MS = 3000;

  const PLAYER_PROFILE_KEY = "ravzaKahootPlayerProfile_v2";
  const HOST_ID_KEY = "ravzaKahootHostId_v1";

  /* ---------- State (tab-local) ---------- */
  const state = {
    mode: null,         // "host" | "player" | null
    roomId: null,
    playerId: null,
    hostId: getOrCreateHostId(),
    roomData: null,
    playersData: [],
    answersData: [],
    unsubs: [],
    tickId: null,
    answeredForIndex: -1,
    joining: false,
    pendingError: null,
    lastRenderSig: null
  };

  /* ---------- HTML escape ---------- */
  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /* ---------- Persistent IDs (player & host) ---------- */
  function getOrCreateHostId() {
    try {
      let id = localStorage.getItem(HOST_ID_KEY);
      if (!id) {
        id = "h_" + Math.random().toString(36).slice(2, 12);
        localStorage.setItem(HOST_ID_KEY, id);
      }
      return id;
    } catch (_) {
      return "h_" + Math.random().toString(36).slice(2, 12);
    }
  }
  function getOrCreatePlayerId() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(PLAYER_PROFILE_KEY) || "null");
      if (stored?.id) return stored.id;
    } catch (_) {}
    return "p_" + Math.random().toString(36).slice(2, 12);
  }
  function savePlayerProfile(profile) {
    try { sessionStorage.setItem(PLAYER_PROFILE_KEY, JSON.stringify(profile)); }
    catch (_) {}
  }
  function loadPlayerProfile() {
    try { return JSON.parse(sessionStorage.getItem(PLAYER_PROFILE_KEY) || "null"); }
    catch (_) { return null; }
  }

  function generateRoomId() {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let id = "";
    for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
    return id;
  }
  function generateRoomPin() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /* ---------- Public base URL ---------- */
  function getKahootPublicBaseUrl() {
    const fromWindow = (window.RAVZA_KAHOOT_PUBLIC_URL || "").trim();
    const meta = document.querySelector('meta[name="kahoot-public-url"]')?.content?.trim() || "";
    const explicit = fromWindow || meta;
    if (explicit) {
      return explicit.replace(/[?#].*$/, "").replace(/\/+$/, "") + "/";
    }
    const origin = window.location.origin || "";
    const path = window.location.pathname || "/";
    return `${origin}${path}`;
  }

  function isLocalEnvironment() {
    if (!window.location) return false;
    if (window.location.protocol === "file:") return true;
    const host = (window.location.hostname || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "" || host.endsWith(".local");
  }

  function hasPublicUrlOverride() {
    if ((window.RAVZA_KAHOOT_PUBLIC_URL || "").trim()) return true;
    const meta = document.querySelector('meta[name="kahoot-public-url"]')?.content?.trim() || "";
    return Boolean(meta);
  }

  function generateKahootJoinUrl(roomId, role) {
    const base = getKahootPublicBaseUrl();
    const cleanBase = String(base).split("?")[0].split("#")[0];
    return `${cleanBase}?page=kahoot&room=${encodeURIComponent(roomId)}&role=${encodeURIComponent(role || "player")}`;
  }

  /* ---------- QR rendering with bulletproof fallback ---------- */
  let qrLoadingPromise = null;

  function loadQrScriptOnce(src) {
    return new Promise((resolve) => {
      const existing = Array.from(document.scripts).find((script) => script.src === src);
      if (existing?.dataset.loaded === "true") {
        resolve(true);
        return;
      }
      if (existing && window.QRCode?.toCanvas) {
        existing.dataset.loaded = "true";
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => {
        script.dataset.loaded = "true";
        resolve(true);
      };
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }

  function ensureQrLibrary() {
    if (window.QRCode?.toCanvas) return Promise.resolve(true);
    if (qrLoadingPromise) return qrLoadingPromise;
    qrLoadingPromise = (async () => {
      for (const src of QR_CDN_FALLBACKS) {
        const loaded = await loadQrScriptOnce(src);
        if (loaded && window.QRCode?.toCanvas) return true;
      }
      return false;
    })();
    return qrLoadingPromise;
  }

  const LOCAL_QR_VERSION = 5;
  const LOCAL_QR_SIZE = 17 + LOCAL_QR_VERSION * 4;
  const LOCAL_QR_DATA_CODEWORDS = 108;
  const LOCAL_QR_ECC_CODEWORDS = 26;
  const LOCAL_QR_TOTAL_CODEWORDS = LOCAL_QR_DATA_CODEWORDS + LOCAL_QR_ECC_CODEWORDS;
  const QR_GF_EXP = (() => {
    const exp = new Array(512);
    let value = 1;
    for (let i = 0; i < 255; i++) {
      exp[i] = value;
      value <<= 1;
      if (value & 0x100) value ^= 0x11d;
    }
    for (let i = 255; i < exp.length; i++) exp[i] = exp[i - 255];
    return exp;
  })();
  const QR_GF_LOG = (() => {
    const log = new Array(256).fill(0);
    for (let i = 0; i < 255; i++) log[QR_GF_EXP[i]] = i;
    return log;
  })();

  function qrGfMultiply(a, b) {
    if (!a || !b) return 0;
    return QR_GF_EXP[QR_GF_LOG[a] + QR_GF_LOG[b]];
  }

  function qrGeneratorPolynomial(degree) {
    let poly = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= qrGfMultiply(poly[j], QR_GF_EXP[i]);
      }
      poly = next;
    }
    return poly.slice(1);
  }

  function qrReedSolomonRemainder(data, degree) {
    const generator = qrGeneratorPolynomial(degree);
    const result = new Array(degree).fill(0);
    data.forEach((byte) => {
      const factor = byte ^ result.shift();
      result.push(0);
      for (let i = 0; i < degree; i++) {
        result[i] ^= qrGfMultiply(generator[i], factor);
      }
    });
    return result;
  }

  function getQrUtf8Bytes(value) {
    if (window.TextEncoder) return Array.from(new TextEncoder().encode(value));
    return Array.from(unescape(encodeURIComponent(value))).map((ch) => ch.charCodeAt(0));
  }

  function buildQrDataCodewords(value) {
    const bytes = getQrUtf8Bytes(value);
    const bits = [];
    const pushBits = (num, length) => {
      for (let i = length - 1; i >= 0; i--) bits.push((num >>> i) & 1);
    };
    pushBits(0x4, 4);
    pushBits(bytes.length, 8);
    bytes.forEach((byte) => pushBits(byte, 8));
    const maxBits = LOCAL_QR_DATA_CODEWORDS * 8;
    if (bits.length > maxBits) return null;
    for (let i = 0, count = Math.min(4, maxBits - bits.length); i < count; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      codewords.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
    }
    for (let pad = 0xec; codewords.length < LOCAL_QR_DATA_CODEWORDS; pad = pad === 0xec ? 0x11 : 0xec) {
      codewords.push(pad);
    }
    return codewords;
  }

  function qrFormatBits(mask) {
    const errorLevelLow = 1;
    const data = (errorLevelLow << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) {
      rem = (rem << 1) ^ (((rem >>> 9) & 1) ? 0x537 : 0);
    }
    return ((data << 10) | rem) ^ 0x5412;
  }

  function createLocalQrMatrix(value) {
    const dataCodewords = buildQrDataCodewords(value);
    if (!dataCodewords) return null;
    const size = LOCAL_QR_SIZE;
    const modules = Array.from({ length: size }, () => Array(size).fill(false));
    const reserved = Array.from({ length: size }, () => Array(size).fill(false));
    const setFunction = (row, col, dark) => {
      if (row < 0 || row >= size || col < 0 || col >= size) return;
      modules[row][col] = !!dark;
      reserved[row][col] = true;
    };
    const drawFinder = (row, col) => {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const rr = row + r;
          const cc = col + c;
          const inFinder = r >= 0 && r <= 6 && c >= 0 && c <= 6;
          const edge = r === 0 || r === 6 || c === 0 || c === 6;
          const center = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          setFunction(rr, cc, inFinder && (edge || center));
        }
      }
    };
    const drawAlignment = (centerRow, centerCol) => {
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const dist = Math.max(Math.abs(r), Math.abs(c));
          setFunction(centerRow + r, centerCol + c, dist === 2 || dist === 0);
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);
    for (let i = 8; i < size - 8; i++) {
      setFunction(6, i, i % 2 === 0);
      setFunction(i, 6, i % 2 === 0);
    }
    drawAlignment(30, 30);

    const format = qrFormatBits(0);
    const getBit = (num, index) => ((num >>> index) & 1) !== 0;
    for (let i = 0; i <= 5; i++) setFunction(i, 8, getBit(format, i));
    setFunction(7, 8, getBit(format, 6));
    setFunction(8, 8, getBit(format, 7));
    setFunction(8, 7, getBit(format, 8));
    for (let i = 9; i < 15; i++) setFunction(8, 14 - i, getBit(format, i));
    for (let i = 0; i < 8; i++) setFunction(8, size - 1 - i, getBit(format, i));
    for (let i = 8; i < 15; i++) setFunction(size - 15 + i, 8, getBit(format, i));
    setFunction(size - 8, 8, true);

    const ecc = qrReedSolomonRemainder(dataCodewords, LOCAL_QR_ECC_CODEWORDS);
    const allCodewords = dataCodewords.concat(ecc);
    if (allCodewords.length !== LOCAL_QR_TOTAL_CODEWORDS) return null;
    const dataBits = [];
    allCodewords.forEach((byte) => {
      for (let i = 7; i >= 0; i--) dataBits.push((byte >>> i) & 1);
    });

    let bitIndex = 0;
    let upward = true;
    for (let col = size - 1; col >= 1; col -= 2) {
      if (col === 6) col--;
      for (let i = 0; i < size; i++) {
        const row = upward ? size - 1 - i : i;
        for (let j = 0; j < 2; j++) {
          const cc = col - j;
          if (reserved[row][cc]) continue;
          const bit = bitIndex < dataBits.length ? dataBits[bitIndex++] : 0;
          const masked = bit ^ (((row + cc) % 2 === 0) ? 1 : 0);
          modules[row][cc] = !!masked;
        }
      }
      upward = !upward;
    }
    return modules;
  }

  function drawKahootQrLocally(canvas, value) {
    try {
      const matrix = createLocalQrMatrix(value);
      if (!canvas || !matrix) return false;
      const width = 260;
      const ctx = canvas.getContext("2d");
      const size = matrix.length;
      const scale = Math.max(1, Math.floor(width / (size + 8)));
      const offset = Math.floor((width - size * scale) / 2);
      canvas.width = width;
      canvas.height = width;
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, width);
      ctx.fillStyle = "#1a1330";
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (matrix[row][col]) ctx.fillRect(offset + col * scale, offset + row * scale, scale, scale);
        }
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  async function renderKahootQRCode(canvas, joinUrl) {
    const fallbackBox = document.getElementById("kahootQrFallback");

    function showLinkFallback(message) {
      if (!fallbackBox) return;
      fallbackBox.hidden = false;
      fallbackBox.innerHTML = `
        <strong>${esc(message)}</strong>
        <span>Katılım linki:</span>
        <a href="${esc(joinUrl)}" target="_blank" rel="noopener">${esc(joinUrl)}</a>
      `;
    }

    function showImageFallback(message) {
      if (!fallbackBox) return;
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&format=svg&data=${encodeURIComponent(joinUrl)}`;
      fallbackBox.hidden = false;
      fallbackBox.innerHTML = `
        <img class="kahoot-qr-fallback-img" src="${esc(qrImageUrl)}" width="260" height="260" alt="Kahoot oda QR kodu">
        <span>${esc(message)}</span>
        <a href="${esc(joinUrl)}" target="_blank" rel="noopener">${esc(joinUrl)}</a>
      `;
      const image = fallbackBox.querySelector("img");
      image?.addEventListener("error", () => showLinkFallback("QR kod görseli yüklenemedi."));
    }

    function showLocalCanvas() {
      if (!canvas || !drawKahootQrLocally(canvas, joinUrl)) return false;
      canvas.style.display = "";
      if (fallbackBox) fallbackBox.hidden = true;
      return true;
    }

    try {
      if (!canvas) return;
      const ok = await ensureQrLibrary();
      if (!ok || !window.QRCode || typeof window.QRCode.toCanvas !== "function") {
        if (showLocalCanvas()) return;
        canvas.style.display = "none";
        showImageFallback("QR kod otomatik oluşturuldu.");
        return;
      }
      canvas.style.display = "";
      await window.QRCode.toCanvas(canvas, joinUrl, {
        width: 260,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#1a1330", light: "#ffffff" }
      });
      if (fallbackBox) fallbackBox.hidden = true;
    } catch (err) {
      console.error("[Kahoot] QR oluşturulamadı:", err);
      if (showLocalCanvas()) return;
      if (canvas) canvas.style.display = "none";
      showImageFallback("QR kod otomatik oluşturuldu.");
    }
  }

  /* ---------- Question pool (mevcut TOPICS'ten) ---------- */
  const FALLBACK_QS = [
    { question: "Which word means 'kanıt'?", options: ["Evidence", "Survey", "Nickname", "Scale"], answer: 0, explanation: "Evidence = kanıt" },
    { question: "Choose the correct sentence.", options: ["She is a beautiful girl.", "She is beautiful girl.", "She a beautiful girl.", "She beautiful is girl."], answer: 0, explanation: "Tekil sayılabilir isimden önce article gerekir." },
    { question: "I am tired ___ waiting.", options: ["of", "for", "at", "to"], answer: 0, explanation: "Doğru kullanım: tired of." },
    { question: "Object pronoun olan hangisidir?", options: ["she", "her", "herselfs", "they"], answer: 1, explanation: "Her, object pronoun olarak kullanılır." },
    { question: "Superlative of 'bad' is...", options: ["baddest", "most bad", "worst", "worse"], answer: 2, explanation: "bad → worse → worst." },
    { question: "Interested ___ science.", options: ["on", "in", "for", "at"], answer: 1, explanation: "Interested in doğru kullanımdır." },
    { question: "The flight ___ at 6.50 tomorrow morning.", options: ["leaves", "is leaving", "leave", "leaving"], answer: 0, explanation: "Timetable için Present Simple." },
    { question: "Present Continuous for future arrangement:", options: ["I meet him yesterday.", "I am meeting him tonight.", "I met him tomorrow.", "I meeting him now."], answer: 1, explanation: "Önceden ayarlanmış planlar için Present Continuous." },
    { question: "Comparative of 'good'?", options: ["gooder", "better", "best", "more good"], answer: 1, explanation: "good → better → best." },
    { question: "She ___ to school every day.", options: ["go", "goes", "going", "gone"], answer: 1, explanation: "Third person singular için -s eklenir." },
    { question: "Which is a possessive adjective?", options: ["me", "my", "mine", "I"], answer: 1, explanation: "my, possessive adjective'dir." },
    { question: "How long ___ you been here?", options: ["have", "has", "do", "are"], answer: 0, explanation: "Present Perfect ile 'have'." }
  ];

  function buildKahootQuestions(categoryId, count) {
    const target = Math.max(3, Math.min(30, count || DEFAULT_QUESTION_COUNT));
    const pool = [];
    try {
      const topicsRef = window.TOPICS || (typeof TOPICS !== "undefined" ? TOPICS : null);
      if (Array.isArray(topicsRef)) {
        topicsRef.forEach((topic) => {
          if (!topic || !Array.isArray(topic.quiz)) return;
          topic.quiz.forEach((q, i) => {
            if (!q || !Array.isArray(q.options) || q.options.length < 2) return;
            const a = Number.isInteger(q.answer) ? q.answer : 0;
            pool.push({
              id: `${topic.id || "t"}-${i}`,
              question: String(q.question || "").trim() || `${topic.title || "Konu"} sorusu`,
              options: q.options.slice(0, 4).map(String),
              answer: Math.max(0, Math.min(a, q.options.length - 1)),
              explanation: q.explanation || ""
            });
          });
        });
      }
    } catch (_) {}
    const base = pool.length ? pool : FALLBACK_QS;
    const shuffled = base.map((q) => ({ q, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .map((e) => e.q);
    return shuffled.slice(0, target).map((q, i) => ({ ...q, no: i + 1 }));
  }

  function getCategoryTitle(categoryId) {
    const map = {
      word: "Kelime Quizleri",
      grammar: "Dil Bilgisi Quizleri",
      unit: "Ünite Quizleri",
      mixed: "Karma Quizler",
      favorite: "Favorilerim"
    };
    return map[categoryId] || "Karma Quizler";
  }

  /* ---------- DOM helpers ---------- */
  function root() {
    let el = document.getElementById("kahootRoot");
    if (!el) {
      const section = document.getElementById("kahoot");
      if (section) {
        el = document.createElement("div");
        el.id = "kahootRoot";
        el.className = "kahoot-root";
        section.appendChild(el);
      }
    }
    return el;
  }

  function gotoKahoot() {
    if (typeof window.navigate === "function") {
      try { window.navigate("kahoot"); return; } catch (_) {}
    }
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    document.getElementById("kahoot")?.classList.add("active");
  }

  /* ---------- Firestore subscriptions ---------- */
  function unsubscribeKahootListeners() {
    if (Array.isArray(state.unsubs)) {
      state.unsubs.forEach((unsub) => { try { unsub(); } catch (_) {} });
    }
    state.unsubs = [];
  }

  function subscribeHostRoom(roomId) {
    unsubscribeKahootListeners();
    const roomRef = doc(db, ROOM_COLLECTION, roomId);
    const playersRef = collection(db, ROOM_COLLECTION, roomId, "players");
    const answersRef = collection(db, ROOM_COLLECTION, roomId, "answers");

    state.unsubs.push(onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) {
        state.roomData = null;
        renderKahootError("Oda bulunamadı veya silinmiş.");
        return;
      }
      state.roomData = snap.data();
      renderForCurrentMode();
    }, (err) => {
      console.error("[Kahoot] Room listen error:", err);
      renderKahootError("Oda dinlenemiyor: " + (err?.message || err));
    }));

    state.unsubs.push(onSnapshot(playersRef, (snap) => {
      state.playersData = snap.docs.map((d) => d.data()).sort((a, b) => (a.joinedAt?.seconds || 0) - (b.joinedAt?.seconds || 0));
      renderForCurrentMode();
    }, (err) => console.error("[Kahoot] Players listen error:", err)));

    state.unsubs.push(onSnapshot(answersRef, (snap) => {
      state.answersData = snap.docs.map((d) => d.data());
      renderForCurrentMode();
    }, (err) => console.error("[Kahoot] Answers listen error:", err)));
  }

  function subscribePlayerRoom(roomId, playerId) {
    unsubscribeKahootListeners();
    const roomRef = doc(db, ROOM_COLLECTION, roomId);
    const playerRef = doc(db, ROOM_COLLECTION, roomId, "players", playerId);

    state.unsubs.push(onSnapshot(roomRef, (snap) => {
      if (!snap.exists()) {
        state.roomData = null;
        renderKahootError("Oda kapatıldı veya silindi.");
        return;
      }
      state.roomData = snap.data();
      renderForCurrentMode();
    }, (err) => {
      console.error("[Kahoot] Player room listen error:", err);
      renderKahootError("Oda dinlenemiyor: " + (err?.message || err));
    }));

    state.unsubs.push(onSnapshot(playerRef, (snap) => {
      if (snap.exists()) state.playerData = snap.data();
      renderForCurrentMode();
    }, (err) => console.error("[Kahoot] Player listen error:", err)));
  }

  /* ---------- Host: Create / Start / Advance / Finish ---------- */
  async function createKahootRoom(opts) {
    const options = opts || {};
    const categoryId = options.categoryId || "mixed";
    const questionDuration = Math.max(8, Math.min(60, options.questionDuration || DEFAULT_QUESTION_TIME));
    const questionCount = Math.max(3, Math.min(30, options.questionCount || DEFAULT_QUESTION_COUNT));
    const hostName = (options.hostName || "Host").trim().slice(0, 24) || "Host";
    const title = `Ravza Kahoot • ${getCategoryTitle(categoryId)}`;
    const questions = buildKahootQuestions(categoryId, questionCount);

    let roomId = generateRoomId();
    let safety = 0;
    while (safety < 5) {
      const probe = await getDoc(doc(db, ROOM_COLLECTION, roomId));
      if (!probe.exists()) break;
      roomId = generateRoomId();
      safety += 1;
    }

    const roomData = {
      roomId,
      pin: generateRoomPin(),
      title,
      categoryId,
      categoryTitle: getCategoryTitle(categoryId),
      hostId: state.hostId,
      hostName,
      status: "waiting",
      currentQuestionIndex: 0,
      questionDuration,
      questions,
      countdownStartedAt: null,
      questionStartedAt: null,
      finishedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, ROOM_COLLECTION, roomId), roomData);

    state.mode = "host";
    state.roomId = roomId;
    state.playerId = null;
    state.roomData = roomData;
    state.playersData = [];
    state.answersData = [];
    state.lastRenderSig = null;
    subscribeHostRoom(roomId);
    return roomId;
  }

  async function hostStartGame() {
    if (!state.roomId) return;
    if (!state.playersData?.length) {
      alert("Önce en az 1 oyuncunun katılması lazım.");
      return;
    }
    const roomRef = doc(db, ROOM_COLLECTION, state.roomId);
    const now = Date.now();

    // Optimistic UI: ekranı HEMEN countdown'a çevir, server confirm beklenmesin
    if (state.roomData) {
      state.roomData = { ...state.roomData, status: "countdown", currentQuestionIndex: 0, countdownStartedAt: now };
      state.lastRenderSig = null;
      renderForCurrentMode();
    }

    try {
      await updateDoc(roomRef, {
        status: "countdown",
        currentQuestionIndex: 0,
        countdownStartedAt: now,
        updatedAt: Date.now()
      });
      setTimeout(async () => {
        const startedAt = Date.now();
        // Optimistic UI: host kendi ekranında hemen soru ekranına geçsin
        if (state.roomData) {
          state.roomData = { ...state.roomData, status: "playing", currentQuestionIndex: 0, questionStartedAt: startedAt };
          state.lastRenderSig = null;
          renderForCurrentMode();
        }
        try {
          await updateDoc(roomRef, {
            status: "playing",
            currentQuestionIndex: 0,
            questionStartedAt: startedAt,
            updatedAt: Date.now()
          });
        } catch (e) {
          console.error("[Kahoot] start game (phase 2) error:", e);
        }
      }, COUNTDOWN_MS);
    } catch (e) {
      console.error("[Kahoot] start game error:", e);
      alert("Oyun başlatılamadı: " + (e?.message || e));
    }
  }

  async function hostAdvanceQuestion() {
    if (!state.roomId || !state.roomData) return;
    const nextIndex = Number(state.roomData.currentQuestionIndex || 0) + 1;
    const total = (state.roomData.questions || []).length;
    const roomRef = doc(db, ROOM_COLLECTION, state.roomId);
    const now = Date.now();
    try {
      if (nextIndex >= total) {
        // Optimistic: hemen final ekranına geç
        state.roomData = { ...state.roomData, status: "finished", finishedAt: now };
        state.lastRenderSig = null;
        renderForCurrentMode();

        await updateDoc(roomRef, {
          status: "finished",
          finishedAt: now,
          updatedAt: Date.now()
        });
        return;
      }
      // Optimistic: hemen yeni soruya geç
      state.roomData = { ...state.roomData, currentQuestionIndex: nextIndex, status: "playing", questionStartedAt: now };
      state.lastRenderSig = null;
      state.answeredForIndex = -1;
      renderForCurrentMode();

      await updateDoc(roomRef, {
        currentQuestionIndex: nextIndex,
        status: "playing",
        questionStartedAt: now,
        updatedAt: Date.now()
      });
    } catch (e) {
      console.error("[Kahoot] advance error:", e);
    }
  }

  async function cancelKahootRoom() {
    if (!state.roomId) return;
    if (!confirm("Odayı kapatmak istediğine emin misin?")) return;
    try {
      await updateDoc(doc(db, ROOM_COLLECTION, state.roomId), {
        status: "finished",
        finishedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error("[Kahoot] cancel error:", e);
    }
  }

  async function hostRefreshQR() {
    if (!state.roomId) return;
    try {
      await updateDoc(doc(db, ROOM_COLLECTION, state.roomId), {
        pin: generateRoomPin(),
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.error("[Kahoot] refresh pin error:", e);
    }
  }

  async function hostPlayAgain() {
    const prev = state.roomData;
    if (!prev) return;
    leaveKahootHost(/* silent */ true);
    const roomId = await createKahootRoom({
      hostName: prev.hostName,
      categoryId: prev.categoryId,
      questionCount: (prev.questions || []).length,
      questionDuration: prev.questionDuration
    });
    renderForCurrentMode();
  }

  function leaveKahootHost(silent) {
    unsubscribeKahootListeners();
    stopTimerTick();
    state.mode = null;
    state.roomId = null;
    state.playerId = null;
    state.roomData = null;
    state.playersData = [];
    state.answersData = [];
    state.lastRenderSig = null;
    if (!silent) renderKahootHomeSafe();
  }

  /* ---------- Player: Join / Submit / Leave ---------- */
  async function joinKahootRoom(roomId, playerName) {
    const name = String(playerName || "").trim().slice(0, 20);
    if (!name) return { ok: false, error: "Lütfen bir isim yaz." };
    try {
      const roomRef = doc(db, ROOM_COLLECTION, roomId);
      const snap = await getDoc(roomRef);
      if (!snap.exists()) return { ok: false, error: "Oda bulunamadı veya kapanmış." };
      const data = snap.data();
      if (data.status === "finished") return { ok: false, error: "Bu oda kapanmış. Host'tan yeni oda iste." };

      const playerId = getOrCreatePlayerId();

      // Optimistic: lokal state'i HEMEN güncelle, ekranı bekleme moduna al, sonra Firestore'a yaz
      savePlayerProfile({ id: playerId, name, roomId });
      state.mode = "player";
      state.roomId = roomId;
      state.playerId = playerId;
      state.answeredForIndex = -1;
      state.roomData = data;
      state.playerData = { playerId, name, score: 0, correctCount: 0, wrongCount: 0 };
      state.playersData = [state.playerData, ...(state.playersData || []).filter((p) => p.playerId !== playerId)];
      state.lastRenderSig = null;
      subscribePlayerRoom(roomId, playerId);
      renderForCurrentMode();

      // Arka planda Firestore write (await ETME — fire-and-forget gibi davran)
      setDoc(doc(db, ROOM_COLLECTION, roomId, "players", playerId), {
        playerId,
        name,
        score: 0,
        correctCount: 0,
        wrongCount: 0,
        joinedAt: Date.now(),
        lastSeenAt: Date.now()
      }, { merge: true }).catch((e) => {
        console.error("[Kahoot] player write error:", e);
      });

      return { ok: true, playerId };
    } catch (e) {
      console.error("[Kahoot] join error:", e);
      return { ok: false, error: "Katılım hatası: " + (e?.message || e) };
    }
  }

  function calculateKahootScore(isCorrect, msUsed, questionDurationSec) {
    if (!isCorrect) return 0;
    const totalMs = Math.max(1000, (questionDurationSec || DEFAULT_QUESTION_TIME) * 1000);
    const elapsed = Math.max(0, Math.min(totalMs, msUsed || totalMs));
    const ratio = 1 - elapsed / totalMs;
    return Math.round(500 + (MAX_QUESTION_POINTS - 500) * ratio);
  }

  async function submitPlayerAnswer(optionIndex) {
    const roomId = state.roomId;
    const playerId = state.playerId;
    if (!roomId || !playerId) return;
    const room = state.roomData;
    if (!room || room.status !== "playing") return;
    const idx = Number(room.currentQuestionIndex || 0);
    if (state.answeredForIndex === idx) return;
    state.answeredForIndex = idx;

    const q = (room.questions || [])[idx];
    if (!q) return;
    const isCorrect = optionIndex === q.answer;
    const msUsed = Date.now() - (room.questionStartedAt || Date.now());
    const score = calculateKahootScore(isCorrect, msUsed, room.questionDuration);
    const answerId = `${playerId}_${idx}`;

    // Optimistic: feedback ekranını HEMEN göster, server confirm beklenmesin
    const optimisticAnswer = { playerId, questionIndex: idx, selectedIndex: optionIndex, isCorrect, score };
    state.answersData = [...(state.answersData || []).filter((a) => !(a.playerId === playerId && a.questionIndex === idx)), optimisticAnswer];
    if (state.playerData) {
      state.playerData = {
        ...state.playerData,
        score: (state.playerData.score || 0) + score,
        correctCount: (state.playerData.correctCount || 0) + (isCorrect ? 1 : 0),
        wrongCount: (state.playerData.wrongCount || 0) + (isCorrect ? 0 : 1)
      };
    }
    state.lastRenderSig = null;
    renderForCurrentMode();

    // Arka planda Firestore write
    try {
      setDoc(doc(db, ROOM_COLLECTION, roomId, "answers", answerId), {
        playerId,
        questionIndex: idx,
        selectedIndex: optionIndex,
        isCorrect,
        score,
        answeredAt: Date.now()
      }).catch((e) => console.error("[Kahoot] answer write error:", e));

      updateDoc(doc(db, ROOM_COLLECTION, roomId, "players", playerId), {
        score: increment(score),
        correctCount: increment(isCorrect ? 1 : 0),
        wrongCount: increment(isCorrect ? 0 : 1),
        lastSeenAt: Date.now()
      }).catch((e) => console.error("[Kahoot] player score write error:", e));
    } catch (e) {
      console.error("[Kahoot] submit answer error:", e);
    }
  }

  /* ---------- Render gate / Signature ---------- */
  function renderSignature() {
    const r = state.roomData;
    if (!r) return "none";
    const players = (state.playersData || [])
      .map((p) => `${p.playerId}:${p.name}:${p.score || 0}`).join("|");
    const answers = (state.answersData || [])
      .filter((a) => a.questionIndex === r.currentQuestionIndex)
      .map((a) => `${a.playerId}:${a.selectedIndex}`).join("|");
    let extra = "";
    if (r.status === "playing") {
      const elapsed = Math.floor((Date.now() - (r.questionStartedAt || Date.now())) / 1000);
      extra = `|t=${elapsed}`;
    } else if (r.status === "countdown") {
      const cd = Math.ceil(Math.max(0, COUNTDOWN_MS - (Date.now() - (r.countdownStartedAt || Date.now()))) / 1000);
      extra = `|c=${cd}`;
    }
    return `${state.mode}|${r.roomId}|${r.status}|${r.currentQuestionIndex}|${players}|${answers}${extra}`;
  }

  function renderForCurrentMode() {
    const sig = renderSignature();
    if (sig === state.lastRenderSig) return;
    state.lastRenderSig = sig;
    if (state.mode === "host") renderKahootHostRoom();
    else if (state.mode === "player") renderKahootPlayerForCurrentRoom();
  }

  function startTimerTick() {
    stopTimerTick();
    // 500ms → 120ms: timer/countdown anında güncellenir, signature check sayesinde gereksiz redraw yok
    state.tickId = setInterval(() => {
      if (!state.mode) return;
      renderForCurrentMode();
    }, 120);
  }
  function stopTimerTick() {
    if (state.tickId) { clearInterval(state.tickId); state.tickId = null; }
  }

  /* ---------- HOST RENDERS ---------- */
  function renderKahootHostRoom() {
    if (!state.roomData) return;
    const status = state.roomData.status;
    if (status === "waiting") return renderHostWaiting();
    if (status === "countdown") return renderHostCountdown();
    if (status === "playing") return renderHostPlaying();
    if (status === "finished") return renderHostFinal();
  }

  function renderHostWaiting() {
    const target = root(); if (!target) return;
    const room = state.roomData;
    const joinUrl = generateKahootJoinUrl(room.roomId, "player");
    const playerCount = state.playersData.length;
    const localWarn = (isLocalEnvironment() && !hasPublicUrlOverride())
      ? `<div class="kahoot-localhost-warning">
          ⚠️ <strong>Bu QR sadece public domain üzerinde başka cihazlardan çalışır.</strong>
          Site Vercel / Netlify / Firebase Hosting'e yüklendikten sonra QR gerçek telefonlardan açılır.
          Public URL'ini <code>index.html</code> içindeki <code>&lt;meta name="kahoot-public-url"&gt;</code> alanına yaz.
        </div>` : "";

    target.innerHTML = `
      <div class="kahoot-host-shell">
        <div class="kahoot-host-head">
          <button type="button" class="kahoot-secondary-btn" onclick="leaveKahootHost()">← Ana Sayfa</button>
          <div class="kahoot-host-title">
            <strong>Canlı Oda • ${esc(room.categoryTitle)}</strong>
            <small>${(room.questions || []).length} soru • Her soru ${room.questionDuration}s</small>
          </div>
          <button type="button" class="kahoot-secondary-btn" onclick="cancelKahootRoom()">Odayı Kapat</button>
        </div>

        ${localWarn}

        <div class="kahoot-host-grid">
          <div class="kahoot-host-info-card">
            <span class="kahoot-room-tag">QR KOD</span>
            <h2>Kahoot Odasına Katıl</h2>
            <p>Telefonun kamerasıyla QR kodu okut ve oyuna katıl.</p>

            <div class="kahoot-pin-block">
              <small>Oda PIN'i</small>
              <div class="kahoot-pin-value">${esc(room.pin)}</div>
              <div class="kahoot-room-code">Oda Kodu: <strong>${esc(room.roomId)}</strong></div>
            </div>

            <div class="kahoot-join-link-row">
              <input type="text" readonly value="${esc(joinUrl)}" id="kahootJoinUrlInput" aria-label="Katılım linki">
              <button type="button" class="kahoot-secondary-btn" onclick="copyKahootJoinLink()">📋 Kopyala</button>
            </div>

            <div class="kahoot-host-actions">
              <button type="button" class="kahoot-primary-btn kahoot-host-start" onclick="hostStartGame()" ${playerCount === 0 ? "disabled" : ""}>
                ▶ Oyunu Başlat (${playerCount})
              </button>
              <button type="button" class="kahoot-secondary-btn" onclick="hostRefreshQR()">🔄 PIN'i Yenile</button>
            </div>
            <small class="kahoot-host-hint">${playerCount === 0 ? "Henüz oyuncu yok — QR'ı okutturmayı bekliyoruz." : `${playerCount} oyuncu bağlandı, başlatabilirsin.`}</small>
          </div>

          <div class="kahoot-host-qr-card">
            <div class="kahoot-qr-stage">
              <div class="kahoot-qr-top-badge">
                <span>OYUNA KATIL!</span>
                <span class="kahoot-qr-bolt" aria-hidden="true">⚡</span>
              </div>

              <span class="kahoot-qr-sparkle s1" aria-hidden="true">✦</span>
              <span class="kahoot-qr-sparkle s2" aria-hidden="true">✧</span>
              <span class="kahoot-qr-sparkle s3" aria-hidden="true">✦</span>
              <span class="kahoot-qr-sparkle s4" aria-hidden="true">✧</span>
              <span class="kahoot-qr-confetti c1" aria-hidden="true"></span>
              <span class="kahoot-qr-confetti c2" aria-hidden="true"></span>
              <span class="kahoot-qr-confetti c3" aria-hidden="true"></span>
              <span class="kahoot-qr-confetti c4" aria-hidden="true"></span>

              <div class="kahoot-qr-panel">
                <canvas id="kahootQrCanvas" width="260" height="260" aria-label="Kahoot oda QR kodu"></canvas>
                <div id="kahootQrFallback" class="kahoot-qr-fallback" hidden></div>
                <div class="kahoot-qr-logo-badge" aria-hidden="true">
                  <span class="kahoot-qr-logo-text">K!</span>
                  <span class="kahoot-qr-logo-confetti lc1"></span>
                  <span class="kahoot-qr-logo-confetti lc2"></span>
                  <span class="kahoot-qr-logo-confetti lc3"></span>
                </div>
              </div>

              <p class="kahoot-qr-helper">📱 Telefonunla okut ve oyuna katıl</p>
              <p class="kahoot-qr-link">${esc(joinUrl)}</p>
            </div>
          </div>
        </div>

        <div class="kahoot-host-players">
          <div class="kahoot-host-players-head">
            <h3>Bekleyen Oyuncular</h3>
            <span class="kahoot-host-players-count">${playerCount}</span>
          </div>
          ${playerCount === 0
            ? `<div class="kahoot-empty-mini">Oyuncular katılınca burada görünecek.</div>`
            : `<div class="kahoot-players-grid">
                ${state.playersData.map((p) => `
                  <div class="kahoot-player-chip">
                    <span class="kahoot-player-chip-avatar">👤</span>
                    <strong>${esc(p.name)}</strong>
                    <small>katıldı</small>
                  </div>
                `).join("")}
              </div>`}
        </div>
      </div>
    `;

    const canvas = document.getElementById("kahootQrCanvas");
    renderKahootQRCode(canvas, joinUrl);
  }

  function renderHostCountdown() {
    const target = root(); if (!target) return;
    const room = state.roomData;
    const cd = Math.ceil(Math.max(0, COUNTDOWN_MS - (Date.now() - (room.countdownStartedAt || Date.now()))) / 1000);
    target.innerHTML = `
      <div class="kahoot-host-shell">
        <div class="kahoot-host-countdown">
          <p>Oyun başlıyor...</p>
          <div class="kahoot-countdown-num">${cd <= 0 ? "GO!" : cd}</div>
          <small>${state.playersData.length} oyuncu hazır</small>
        </div>
      </div>
    `;
  }

  function renderHostPlaying() {
    const target = root(); if (!target) return;
    const room = state.roomData;
    const idx = Number(room.currentQuestionIndex || 0);
    const q = (room.questions || [])[idx];
    if (!q) return;
    const totalPlayers = state.playersData.length;
    const answersForQ = state.answersData.filter((a) => a.questionIndex === idx);
    const answeredCount = answersForQ.length;
    const elapsed = (Date.now() - (room.questionStartedAt || Date.now())) / 1000;
    const remaining = Math.max(0, Math.round((room.questionDuration || DEFAULT_QUESTION_TIME) - elapsed));
    const sorted = [...state.playersData].sort((a, b) => (b.score || 0) - (a.score || 0));
    const colors = ["red", "blue", "yellow", "green"];
    const shapes = ["▲", "◆", "●", "■"];

    target.innerHTML = `
      <div class="kahoot-host-shell">
        <div class="kahoot-host-play-head">
          <div>
            <strong>Soru ${idx + 1} / ${(room.questions || []).length}</strong>
            <small>${esc(room.categoryTitle)}</small>
          </div>
          <div class="kahoot-timer-pill big">⏱ ${remaining}s</div>
          <div class="kahoot-host-answered">
            ${answeredCount}/${totalPlayers} <small>cevapladı</small>
          </div>
        </div>

        <div class="kahoot-question-card kahoot-host-q">
          <h2>${esc(q.question)}</h2>
        </div>

        <div class="kahoot-answer-grid kahoot-host-answers">
          ${q.options.map((opt, i) => {
            const count = answersForQ.filter((a) => a.selectedIndex === i).length;
            return `
              <div class="kahoot-answer ${colors[i] || "blue"} kahoot-host-answer-pill">
                <span>${shapes[i] || "◆"}</span>
                <strong>${esc(opt)}</strong>
                <em class="kahoot-host-answer-count">${count}</em>
              </div>
            `;
          }).join("")}
        </div>

        <div class="kahoot-host-controls">
          <button type="button" class="kahoot-primary-btn" onclick="hostAdvanceQuestion()">
            ${idx + 1 >= (room.questions || []).length ? "🏁 Bitir" : "Sonraki Soru →"}
          </button>
          <button type="button" class="kahoot-secondary-btn" onclick="cancelKahootRoom()">Oyunu Bitir</button>
        </div>

        <div class="kahoot-host-mini-lb">
          <h3>Anlık Sıralama</h3>
          ${sorted.slice(0, 5).map((p, i) => `
            <div class="kahoot-lb-row ${i === 0 ? "is-first" : ""}">
              <b>${i + 1}</b>
              <span>${i === 0 ? "👑 " : ""}${esc(p.name)}</span>
              <strong>${p.score || 0}</strong>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderHostFinal() {
    const target = root(); if (!target) return;
    const room = state.roomData;
    const sorted = [...state.playersData].sort((a, b) => (b.score || 0) - (a.score || 0));
    target.innerHTML = `
      <div class="kahoot-host-shell">
        <div class="kahoot-host-final">
          <span class="kahoot-result-cup">🏆</span>
          <h2>Oyun Tamamlandı</h2>
          <p>${esc(room.categoryTitle)} • ${(room.questions || []).length} soru</p>
          ${sorted.length >= 1 ? `<div class="kahoot-podium">
            ${sorted[1] ? `<div class="kahoot-podium-spot second"><div class="kahoot-podium-medal">🥈</div><strong>${esc(sorted[1].name)}</strong><span>${sorted[1].score || 0}</span></div>` : ""}
            <div class="kahoot-podium-spot first"><div class="kahoot-podium-medal">🥇</div><strong>${esc(sorted[0].name)}</strong><span>${sorted[0].score || 0}</span></div>
            ${sorted[2] ? `<div class="kahoot-podium-spot third"><div class="kahoot-podium-medal">🥉</div><strong>${esc(sorted[2].name)}</strong><span>${sorted[2].score || 0}</span></div>` : ""}
          </div>` : `<div class="kahoot-empty-mini">Skor kaydı bulunamadı.</div>`}
          ${renderLeaderboardHtml(sorted, null)}
          <div class="kahoot-host-final-actions">
            <button type="button" class="kahoot-primary-btn" onclick="hostPlayAgain()">🔁 Yeni Oda Aç</button>
            <button type="button" class="kahoot-secondary-btn" onclick="leaveKahootHost()">Ana Sayfa</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderLeaderboardHtml(sortedPlayers, mePlayerId) {
    if (!sortedPlayers.length) return "";
    return `
      <div class="kahoot-leaderboard-final">
        <h3>Leaderboard</h3>
        ${sortedPlayers.slice(0, 10).map((p, i) => `
          <div class="kahoot-lb-row ${i === 0 ? "is-first" : ""} ${p.playerId === mePlayerId ? "is-me" : ""}">
            <b>${i + 1}</b>
            <span>${i === 0 ? "👑 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : ""}${esc(p.name)}</span>
            <strong>${p.score || 0}</strong>
          </div>
        `).join("")}
      </div>
    `;
  }

  /* ---------- PLAYER RENDERS ---------- */
  function renderKahootPlayerForCurrentRoom() {
    if (!state.roomData) return;
    const status = state.roomData.status;
    if (status === "waiting") return renderPlayerWaiting();
    if (status === "countdown") return renderPlayerCountdown();
    if (status === "playing") return renderPlayerQuestion();
    if (status === "finished") return renderPlayerFinal();
  }

  function renderPlayerNameScreen(roomId, preRoomData) {
    const target = root(); if (!target) return;
    const profile = loadPlayerProfile();
    const prefillName = profile && profile.roomId === roomId && profile.name ? profile.name : "";
    const room = preRoomData || state.roomData;
    target.innerHTML = `
      <div class="kahoot-player-shell">
        <div class="kahoot-player-card">
          <span class="kahoot-k-badge">K!</span>
          <h2>Odaya Katıl</h2>
          ${room ? `<p>Oda: <strong>${esc(room.roomId)}</strong> • PIN: <strong>${esc(room.pin)}</strong></p>` : `<p>Oda: <strong>${esc(roomId)}</strong></p>`}
          <p class="kahoot-player-sub">Adını yaz ve oyuna başlamayı bekle.</p>
          <div class="kahoot-player-input-row">
            <input type="text" id="kahootPlayerName" maxlength="20" placeholder="Adın..." value="${esc(prefillName)}" autocomplete="off">
            <button type="button" class="kahoot-primary-btn" onclick="confirmKahootJoin()">Oyuna Katıl</button>
          </div>
          <div id="kahootJoinError" class="kahoot-player-error" role="alert" hidden></div>
        </div>
      </div>
    `;
    const input = document.getElementById("kahootPlayerName");
    setTimeout(() => input?.focus(), 60);
    input?.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmKahootJoin(); });
  }

  async function openKahootJoinMode(roomId) {
    state.mode = "player";
    state.roomId = roomId;
    state.playerId = null;
    state.lastRenderSig = null;
    gotoKahoot();
    // Önce oda var mı kontrol et
    try {
      const snap = await getDoc(doc(db, ROOM_COLLECTION, roomId));
      if (!snap.exists()) {
        renderKahootError("Oda bulunamadı veya oyun bitmiş olabilir.");
        return;
      }
      renderPlayerNameScreen(roomId, snap.data());
    } catch (e) {
      console.error("[Kahoot] open join mode error:", e);
      renderKahootError("Odaya ulaşılamadı: " + (e?.message || e));
    }
  }

  async function confirmKahootJoin() {
    if (state.joining) return;
    state.joining = true;
    setTimeout(() => { state.joining = false; }, 600);
    const name = document.getElementById("kahootPlayerName")?.value || "";
    const result = await joinKahootRoom(state.roomId, name);
    if (!result.ok) {
      const err = document.getElementById("kahootJoinError");
      if (err) { err.hidden = false; err.textContent = result.error; }
      return;
    }
    renderForCurrentMode();
  }

  function renderPlayerWaiting() {
    const target = root(); if (!target) return;
    const room = state.roomData;
    const me = state.playerData || (state.playersData.find((p) => p.playerId === state.playerId));
    target.innerHTML = `
      <div class="kahoot-player-shell">
        <div class="kahoot-player-card kahoot-player-wait">
          <span class="kahoot-k-badge">K!</span>
          <div class="kahoot-player-avatar">👤</div>
          <h2>${esc(me?.name || "Oyuncu")}</h2>
          <p>Odaya bağlandın! Host oyunu başlattığında ilk soru gelecek.</p>
          <div class="kahoot-player-loader"><span></span><span></span><span></span></div>
          <small>Oda: <strong>${esc(room.roomId)}</strong> • PIN: <strong>${esc(room.pin)}</strong></small>
        </div>
      </div>
    `;
  }

  function renderPlayerCountdown() {
    const target = root(); if (!target) return;
    const room = state.roomData;
    const cd = Math.ceil(Math.max(0, COUNTDOWN_MS - (Date.now() - (room.countdownStartedAt || Date.now()))) / 1000);
    target.innerHTML = `
      <div class="kahoot-player-shell">
        <div class="kahoot-player-card kahoot-player-count">
          <span class="kahoot-k-badge">K!</span>
          <p>Hazır ol...</p>
          <div class="kahoot-countdown-num">${cd <= 0 ? "GO!" : cd}</div>
        </div>
      </div>
    `;
  }

  function renderPlayerQuestion() {
    const target = root(); if (!target) return;
    const room = state.roomData;
    const idx = Number(room.currentQuestionIndex || 0);
    const q = (room.questions || [])[idx];
    if (!q) return;
    const me = state.playerData || state.playersData.find((p) => p.playerId === state.playerId);
    const myAnswer = state.answersData.find((a) => a.playerId === state.playerId && a.questionIndex === idx);
    const colors = ["red", "blue", "yellow", "green"];
    const shapes = ["▲", "◆", "●", "■"];
    const elapsed = (Date.now() - (room.questionStartedAt || Date.now())) / 1000;
    const remaining = Math.max(0, Math.round((room.questionDuration || DEFAULT_QUESTION_TIME) - elapsed));

    if (myAnswer) {
      target.innerHTML = `
        <div class="kahoot-player-shell">
          <div class="kahoot-player-card kahoot-player-locked ${myAnswer.isCorrect ? "is-correct" : "is-wrong"}">
            <span class="kahoot-feedback-icon">${myAnswer.isCorrect ? "✅" : "❌"}</span>
            <h2>${myAnswer.isCorrect ? "Süpersin!" : "Bir dahaki soruda yakalarsın"}</h2>
            <p><strong>+${myAnswer.score}</strong> puan kazandın</p>
            <small>Diğer oyuncular cevaplıyor... Host sonraki soruya geçecek.</small>
            <div class="kahoot-player-score-pill">Toplam: ${me?.score || 0} puan</div>
          </div>
        </div>
      `;
      return;
    }

    target.innerHTML = `
      <div class="kahoot-player-shell">
        <div class="kahoot-player-question">
          <div class="kahoot-player-qhead">
            <span>Soru ${idx + 1} / ${(room.questions || []).length}</span>
            <span class="kahoot-timer-pill">⏱ ${remaining}s</span>
          </div>
          <h2 class="kahoot-player-qtext">${esc(q.question)}</h2>
          <div class="kahoot-player-answer-grid">
            ${q.options.map((opt, i) => `
              <button type="button" class="kahoot-answer ${colors[i] || "blue"} kahoot-player-answer-btn" onclick="submitPlayerAnswer(${i})">
                <span>${shapes[i] || "◆"}</span>
                <strong>${esc(opt)}</strong>
              </button>
            `).join("")}
          </div>
        </div>
      </div>
    `;
  }

  function renderPlayerFinal() {
    const target = root(); if (!target) return;
    const sorted = [...state.playersData].sort((a, b) => (b.score || 0) - (a.score || 0));
    const me = sorted.find((p) => p.playerId === state.playerId);
    const myRank = sorted.findIndex((p) => p.playerId === state.playerId) + 1;
    target.innerHTML = `
      <div class="kahoot-player-shell">
        <div class="kahoot-player-card kahoot-player-result">
          <span class="kahoot-result-cup">${myRank === 1 ? "🏆" : myRank === 2 ? "🥈" : myRank === 3 ? "🥉" : "🎯"}</span>
          <h2>Oyun Bitti!</h2>
          <p><strong>${esc(me?.name || "Oyuncu")}</strong>${myRank > 0 ? ` • ${myRank}. sıra` : ""}</p>
          <div class="kahoot-score-big">${me?.score || 0}</div>
          <small>puan</small>
          ${renderLeaderboardHtml(sorted, state.playerId)}
          <button type="button" class="kahoot-primary-btn" onclick="leaveKahootHost()">Ana Sayfa</button>
        </div>
      </div>
    `;
  }

  function renderKahootError(message) {
    const target = root(); if (!target) return;
    target.innerHTML = `
      <div class="kahoot-player-shell">
        <div class="kahoot-player-card">
          <span class="kahoot-k-badge">K!</span>
          <h2>Bir Sorun Oluştu</h2>
          <p>${esc(message)}</p>
          <button type="button" class="kahoot-primary-btn" onclick="leaveKahootHost()">Ana Sayfa</button>
        </div>
      </div>
    `;
  }

  /* ---------- SETUP MODALS ---------- */
  function openKahootHostSetup() {
    closeKahootHostSetup();
    const modal = document.createElement("div");
    modal.id = "kahootRoomSetupModal";
    modal.className = "kahoot-modal-backdrop";
    modal.innerHTML = `
      <div class="kahoot-modal kahoot-setup-modal" role="dialog" aria-modal="true">
        <button class="kahoot-modal-close" type="button" onclick="closeKahootHostSetup()" aria-label="Kapat">✕</button>
        <span class="kahoot-k-badge">K!</span>
        <h2>Yeni Kahoot Odası</h2>
        <p>Hızlıca bir oda kur, QR ile arkadaşlarını davet et.</p>
        <div class="kahoot-setup-fields">
          <label class="kahoot-setup-label">Host Adı
            <input type="text" id="kahootHostName" maxlength="24" placeholder="Örn: Yusuf" value="">
          </label>
          <label class="kahoot-setup-label">Kategori
            <select id="kahootHostCategory">
              <option value="mixed">🎯 Karma Quizler</option>
              <option value="word">📖 Kelime Quizleri</option>
              <option value="grammar">🧩 Dil Bilgisi</option>
              <option value="unit">🎓 Ünite Quizleri</option>
              <option value="favorite">⭐ Favorilerim</option>
            </select>
          </label>
          <div class="kahoot-setup-row">
            <label class="kahoot-setup-label">Soru Sayısı
              <select id="kahootHostQCount">
                <option value="5">5 soru</option>
                <option value="10" selected>10 soru</option>
                <option value="15">15 soru</option>
                <option value="20">20 soru</option>
              </select>
            </label>
            <label class="kahoot-setup-label">Soru Süresi
              <select id="kahootHostQTime">
                <option value="10">10 sn</option>
                <option value="20" selected>20 sn</option>
                <option value="30">30 sn</option>
                <option value="45">45 sn</option>
              </select>
            </label>
          </div>
        </div>
        <div class="kahoot-setup-actions">
          <button type="button" class="kahoot-secondary-btn" onclick="closeKahootHostSetup()">Vazgeç</button>
          <button type="button" class="kahoot-primary-btn" id="kahootHostSetupConfirmBtn" onclick="confirmKahootHostSetup()">🎉 Odayı Aç</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById("kahootHostName")?.focus(), 80);
  }
  function closeKahootHostSetup() {
    document.getElementById("kahootRoomSetupModal")?.remove();
  }
  async function confirmKahootHostSetup() {
    const hostName = document.getElementById("kahootHostName")?.value?.trim() || "Host";
    const categoryId = document.getElementById("kahootHostCategory")?.value || "mixed";
    const questionCount = parseInt(document.getElementById("kahootHostQCount")?.value || "10", 10);
    const questionDuration = parseInt(document.getElementById("kahootHostQTime")?.value || "20", 10);
    const btn = document.getElementById("kahootHostSetupConfirmBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Oluşturuluyor..."; }
    try {
      await createKahootRoom({ hostName, categoryId, questionCount, questionDuration });
      closeKahootHostSetup();
      gotoKahoot();
      renderForCurrentMode();
    } catch (e) {
      console.error("[Kahoot] setup error:", e);
      if (btn) { btn.disabled = false; btn.textContent = "🎉 Odayı Aç"; }
      alert("Oda oluşturulamadı: " + (e?.message || e) + "\nFirebase Firestore'a erişim olduğundan emin ol.");
    }
  }

  function openKahootJoinPrompt() {
    const old = document.getElementById("kahootJoinModal");
    if (old) old.remove();
    const modal = document.createElement("div");
    modal.id = "kahootJoinModal";
    modal.className = "kahoot-modal-backdrop";
    modal.innerHTML = `
      <div class="kahoot-modal kahoot-join-modal" role="dialog" aria-modal="true">
        <button class="kahoot-modal-close" type="button" onclick="closeKahootJoinPrompt()" aria-label="Kapat">✕</button>
        <span class="kahoot-k-badge">K!</span>
        <h2>Oda Koduyla Katıl</h2>
        <p>Host'un sana verdiği 6 haneli kodu veya PIN'i yaz.</p>
        <div class="kahoot-setup-fields">
          <label class="kahoot-setup-label">Oda Kodu
            <input type="text" id="kahootJoinRoomCode" maxlength="6" placeholder="Örn: AB23CD" autocapitalize="characters" autocomplete="off">
          </label>
        </div>
        <div class="kahoot-setup-actions">
          <button type="button" class="kahoot-secondary-btn" onclick="closeKahootJoinPrompt()">Vazgeç</button>
          <button type="button" class="kahoot-primary-btn" onclick="confirmKahootJoinPrompt()">Devam</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => document.getElementById("kahootJoinRoomCode")?.focus(), 80);
  }
  function closeKahootJoinPrompt() {
    document.getElementById("kahootJoinModal")?.remove();
  }
  async function confirmKahootJoinPrompt() {
    const codeRaw = (document.getElementById("kahootJoinRoomCode")?.value || "").trim().toUpperCase();
    if (!codeRaw) return;
    try {
      // 1) doğrudan roomId dene
      const direct = await getDoc(doc(db, ROOM_COLLECTION, codeRaw));
      if (direct.exists()) {
        closeKahootJoinPrompt();
        openKahootJoinMode(codeRaw);
        return;
      }
      // 2) PIN ile arama (waiting/playing/countdown durumundakileri öncele)
      const qRef = query(collection(db, ROOM_COLLECTION), where("pin", "==", codeRaw));
      const found = await getDocs(qRef);
      if (!found.empty) {
        const room = found.docs[0].data();
        closeKahootJoinPrompt();
        openKahootJoinMode(room.roomId || found.docs[0].id);
        return;
      }
      alert("Bu kod ile aktif bir oda bulunamadı.");
    } catch (e) {
      console.error("[Kahoot] join prompt error:", e);
      alert("Hata: " + (e?.message || e));
    }
  }

  /* ---------- Copy link ---------- */
  function copyKahootJoinLink() {
    const input = document.getElementById("kahootJoinUrlInput");
    const url = input?.value || (state.roomId ? generateKahootJoinUrl(state.roomId, "player") : "");
    if (!url) return;
    const done = () => {
      const btn = document.querySelector(".kahoot-join-link-row .kahoot-secondary-btn");
      if (!btn) return;
      const original = btn.textContent;
      btn.textContent = "✓ Kopyalandı";
      setTimeout(() => { btn.textContent = original; }, 1400);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(() => {
        input?.select(); document.execCommand?.("copy"); done();
      });
    } else {
      input?.select(); document.execCommand?.("copy"); done();
    }
  }

  /* ---------- Home decoration + nav hook ---------- */
  function decorateKahootHome() {
    const r = root();
    if (!r) return;
    if (r.querySelector(".kahoot-room-launch-card")) return;
    const card = document.createElement("div");
    card.className = "kahoot-room-launch-card";
    card.innerHTML = `
      <div class="kahoot-room-launch-inner">
        <div class="kahoot-room-launch-copy">
          <span class="kahoot-room-tag">CANLI MOD • FIREBASE</span>
          <h2>QR ile Çok Cihazlı Kahoot Odası</h2>
          <p>Yeni oda oluştur, QR kodu göster — telefondan okutan herkes <strong>kendi cihazından</strong> aynı odaya katılır. Realtime Firestore ile çalışır; her oyuncu kendi telefonunda sorular, süre, hız puanı ve canlı leaderboard görür.</p>
          <div class="kahoot-room-launch-actions">
            <button type="button" class="kahoot-primary-btn" onclick="openKahootHostSetup()">+ Yeni Oda Oluştur</button>
            <button type="button" class="kahoot-secondary-btn" onclick="openKahootJoinPrompt()">Oda Koduyla Katıl</button>
          </div>
          ${(isLocalEnvironment() && !hasPublicUrlOverride())
            ? `<div class="kahoot-localhost-warning compact">
                ⚠️ Şu an local adres üzerindesin. QR ile başka telefonlardan katılım için
                siteyi public bir adrese (Vercel / Netlify / Firebase Hosting) yükle.
              </div>` : ""}
        </div>
        <div class="kahoot-room-launch-art" aria-hidden="true">
          <div class="kahoot-room-launch-qr-mock">
            <div class="kahoot-qr-corner tl"></div>
            <div class="kahoot-qr-corner tr"></div>
            <div class="kahoot-qr-corner bl"></div>
            <div class="kahoot-qr-center">K!</div>
          </div>
          <div class="kahoot-room-launch-floats">
            <span>🎮</span><span>📱</span><span>⚡</span>
          </div>
        </div>
      </div>
    `;
    const hero = r.querySelector(".kahoot-hero-card");
    if (hero && hero.nextSibling) hero.parentNode.insertBefore(card, hero.nextSibling);
    else r.insertBefore(card, r.firstChild);
  }

  function renderKahootHomeSafe() {
    if (typeof window.renderKahootHome === "function") {
      try { window.renderKahootHome(); } catch (_) {}
    }
    decorateKahootHome();
  }

  function hookNavigateForDecoration() {
    if (window.__RAVZA_KAHOOT_ROOM_NAV_HOOKED__) return;
    window.__RAVZA_KAHOOT_ROOM_NAV_HOOKED__ = true;
    const original = window.navigate;
    window.navigate = function patchedKahootRoomNav(pageId, ...args) {
      const res = typeof original === "function" ? original.call(this, pageId, ...args) : undefined;
      if (pageId === "kahoot") {
        setTimeout(() => {
          if (!state.mode) decorateKahootHome();
          else renderForCurrentMode();
        }, 30);
      }
      return res;
    };
  }

  /* ---------- URL Routing (?page=kahoot&room=XXX&role=player) ---------- */
  function handleInitialKahootRoute() {
    let page = null, room = null, role = null;
    try {
      const params = new URLSearchParams(window.location.search || "");
      page = params.get("page");
      room = params.get("room");
      role = params.get("role");
    } catch (_) {}

    if (!room && location.hash) {
      const hash = location.hash.replace(/^#/, "");
      if (hash.startsWith("kahoot")) {
        page = "kahoot";
        const q = hash.split("?")[1] || "";
        const hp = new URLSearchParams(q);
        room = hp.get("room");
        role = hp.get("role");
      }
    }

    if (page !== "kahoot" && !room) return;

    gotoKahoot();
    setTimeout(() => {
      if (room) {
        openKahootJoinMode(room);
      } else {
        renderKahootHomeSafe();
      }
    }, 100);
  }

  /* ---------- Init ---------- */
  function init() {
    hookNavigateForDecoration();
    startTimerTick();
    setTimeout(() => {
      if (document.getElementById("kahoot")?.classList.contains("active")) decorateKahootHome();
    }, 200);
    if (!window.__KAHOOT_INITIAL_ROUTE_DONE__) {
      window.__KAHOOT_INITIAL_ROUTE_DONE__ = true;
      handleInitialKahootRoute();
    }
  }

  /* ---------- Global API ---------- */
  window.openKahootHostSetup = openKahootHostSetup;
  window.closeKahootHostSetup = closeKahootHostSetup;
  window.confirmKahootHostSetup = confirmKahootHostSetup;
  window.openKahootJoinPrompt = openKahootJoinPrompt;
  window.closeKahootJoinPrompt = closeKahootJoinPrompt;
  window.confirmKahootJoinPrompt = confirmKahootJoinPrompt;
  window.openKahootJoinMode = openKahootJoinMode;
  window.confirmKahootJoin = confirmKahootJoin;
  window.submitPlayerAnswer = submitPlayerAnswer;
  window.hostStartGame = hostStartGame;
  window.hostAdvanceQuestion = hostAdvanceQuestion;
  window.hostRefreshQR = hostRefreshQR;
  window.copyKahootJoinLink = copyKahootJoinLink;
  window.cancelKahootRoom = cancelKahootRoom;
  window.hostPlayAgain = hostPlayAgain;
  window.leaveKahootHost = leaveKahootHost;
  window.generateKahootJoinUrl = generateKahootJoinUrl;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
