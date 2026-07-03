const quizCache = new Map();

export async function loadQuiz(topicId) {
  if (quizCache.has(topicId)) return quizCache.get(topicId);

  try {
    const module = await import(`../../data-js/quizzes/${topicId}.js`);
    const questions = Array.isArray(module.default) ? module.default : [];
    quizCache.set(topicId, questions);
    return questions;
  } catch (error) {
    console.error(error);
    throw new Error("Quiz soruları yüklenemedi.");
  }
}

export async function loadAllQuizzes(topicIds) {
  return Promise.all(topicIds.map(async (topicId) => ({
    topicId,
    questions: await loadQuiz(topicId)
  })));
}

export function clearQuizCache() {
  quizCache.clear();
}
