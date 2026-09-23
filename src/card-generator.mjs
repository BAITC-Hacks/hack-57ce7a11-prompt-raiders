import { CARD_FIELDS, normalizeText, prepareQuestionInput } from "./question-generator.mjs";

// Эти поля совпадают с моделью задачи в models.mjs.
// Благодаря единому списку AI не сможет вернуть произвольную структуру карточки.
export const EDITABLE_CARD_FIELDS = Object.keys(CARD_FIELDS);
export const CARD_OUTPUT_FIELDS = [
  "title",
  "topic",
  "originalDescription",
  ...EDITABLE_CARD_FIELDS,
];

function normalizeQuestion(rawQuestion, index) {
  const question = rawQuestion && typeof rawQuestion === "object" ? rawQuestion : {};
  const id = normalizeText(question.id, 100) || `question-${index + 1}`;
  const targetField = question.targetField;
  const text = normalizeText(question.question, 500);

  if (!EDITABLE_CARD_FIELDS.includes(targetField) || !text) {
    throw new Error(`Некорректный уточняющий вопрос под номером ${index + 1}.`);
  }

  return { id, targetField, question: text };
}

function normalizeAnswers(rawAnswers, questions) {
  if (!Array.isArray(rawAnswers)) return [];

  // Поддерживаются два формата:
  // 1) рекомендуемый: { questionId, answer };
  // 2) временный: строки, расположенные в том же порядке, что и вопросы.
  return rawAnswers
    .map((rawAnswer, index) => {
      if (typeof rawAnswer === "string") {
        return {
          questionId: questions[index]?.id ?? "",
          answer: normalizeText(rawAnswer, 3000),
        };
      }

      return {
        questionId: normalizeText(rawAnswer?.questionId, 100),
        answer: normalizeText(rawAnswer?.answer, 3000),
      };
    })
    .filter((item) => item.questionId && item.answer);
}

// Готовим один безопасный контракт для локального генератора и OpenAI.
export function prepareCardInput(rawInput = {}) {
  const baseInput = prepareQuestionInput(rawInput);
  const rawQuestions = Array.isArray(rawInput.questions) ? rawInput.questions : [];

  if (rawQuestions.length < 3 || rawQuestions.length > 5) {
    throw new Error("Для карточки нужно передать от 3 до 5 уточняющих вопросов.");
  }

  const questions = rawQuestions.map(normalizeQuestion);
  if (new Set(questions.map((item) => item.id)).size !== questions.length) {
    throw new Error("Идентификаторы уточняющих вопросов не должны повторяться.");
  }
  if (new Set(questions.map((item) => item.targetField)).size !== questions.length) {
    throw new Error("Каждый уточняющий вопрос должен относиться к отдельному полю карточки.");
  }

  const answers = normalizeAnswers(rawInput.answers, questions);
  if (new Set(answers.map((item) => item.questionId)).size !== answers.length) {
    throw new Error("На один уточняющий вопрос нельзя передать несколько ответов.");
  }
  const answersByQuestionId = new Map(answers.map((item) => [item.questionId, item.answer]));

  // Ответ должен относиться к реально переданному вопросу.
  if (answers.some((item) => !questions.some((question) => question.id === item.questionId))) {
    throw new Error("Получен ответ на неизвестный уточняющий вопрос.");
  }

  const interview = questions
    .map((question) => ({
      ...question,
      answer: answersByQuestionId.get(question.id) ?? "",
    }))
    .filter((item) => item.answer);

  // Основной сценарий использует три ответа. Если операция 1 вернула 4–5 вопросов,
  // пользователь может ответить на остальные позже — карточка всё равно сформируется.
  if (interview.length < 3) {
    throw new Error("Для формирования карточки нужно минимум 3 заполненных ответа.");
  }

  return {
    description: baseInput.description,
    industry: baseInput.industry,
    knownFields: baseInput.knownFields,
    interview,
  };
}

function titleFromDescription(description) {
  const firstSentence = description.split(/[.!?]/u)[0];
  const withoutIntro = firstSentence.replace(/^(мы\s+)?хотим\s+/iu, "");
  const title = normalizeText(withoutIntro, 120) || normalizeText(description, 120);
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function addSource(fieldSources, field, sourceType, sourceId, evidence) {
  if (!evidence) return;
  fieldSources.push({ field, sourceType, sourceId, evidence });
}

function calculateMissingFields(card) {
  return EDITABLE_CARD_FIELDS
    .filter((field) => !card[field])
    .map((field) => ({ field, label: CARD_FIELDS[field] }));
}

// Локальная версия обеспечивает рабочую демонстрацию без API-ключа.
// Она не придумывает текст: карточка собирается только из описания,
// уже известных полей и ответов пользователя.
export function generateTemplateCard(rawInput) {
  const input = prepareCardInput(rawInput);
  const card = {
    title: titleFromDescription(input.description),
    topic: input.industry,
    originalDescription: input.description,
    ...input.knownFields,
  };
  const fieldSources = [];

  addSource(fieldSources, "title", "description", "description", input.description);
  if (input.industry) addSource(fieldSources, "topic", "industry", "industry", input.industry);

  for (const [field, value] of Object.entries(input.knownFields)) {
    if (value) addSource(fieldSources, field, "knownField", field, value);
  }

  for (const item of input.interview) {
    const currentValue = card[item.targetField];

    // Известное значение сохраняем, а новый ответ добавляем как уточнение.
    // Так AI-операция 2 не стирает сведения, введённые до интервью.
    card[item.targetField] = currentValue
      ? `${currentValue}\n${item.answer}`
      : item.answer;

    addSource(fieldSources, item.targetField, "answer", item.id, item.answer);
  }

  return {
    card,
    missingFields: calculateMissingFields(card),
    fieldSources,
  };
}

function sourceText(input, source) {
  if (source.sourceType === "description" && source.sourceId === "description") return input.description;
  if (source.sourceType === "industry" && source.sourceId === "industry") return input.industry;
  if (source.sourceType === "knownField" && EDITABLE_CARD_FIELDS.includes(source.sourceId)) {
    return input.knownFields[source.sourceId] ?? "";
  }
  if (source.sourceType === "answer") {
    return input.interview.find((item) => item.id === source.sourceId)?.answer ?? "";
  }
  return "";
}

// Строгая JSON-схема проверяет форму ответа, а эта функция проверяет его смысл:
// каждая заполненная часть карточки должна ссылаться на реальную цитату пользователя.
export function validateAiCardResult(rawResult, rawInput) {
  const input = prepareCardInput(rawInput);
  const result = rawResult && typeof rawResult === "object" ? rawResult : {};
  const rawCard = result.card && typeof result.card === "object" ? result.card : {};

  const card = Object.fromEntries(
    CARD_OUTPUT_FIELDS.map((field) => [field, normalizeText(rawCard[field], 4000)]),
  );

  if (!card.title) throw new Error("AI не сформировал название карточки.");
  if (card.originalDescription !== input.description) {
    throw new Error("AI изменил первоначальное описание пользователя.");
  }
  if (card.topic !== input.industry) {
    throw new Error("AI изменил тему или отрасль пользователя.");
  }

  if (!Array.isArray(result.fieldSources)) {
    throw new Error("AI не указал источники полей карточки.");
  }

  const fieldSources = result.fieldSources.map((rawSource) => {
    const field = rawSource?.field;
    const sourceType = rawSource?.sourceType;
    const sourceId = normalizeText(rawSource?.sourceId, 100);
    const evidence = normalizeText(rawSource?.evidence, 3000);

    if (!CARD_OUTPUT_FIELDS.includes(field) || !sourceId || !evidence) {
      throw new Error("AI вернул некорректный источник поля карточки.");
    }

    const originalText = sourceText(input, { sourceType, sourceId });
    if (!originalText || !originalText.includes(evidence)) {
      throw new Error("AI использовал факт, которого нет в описании или ответах.");
    }

    return { field, sourceType, sourceId, evidence };
  });

  // Любое непустое сгенерированное поле должно иметь хотя бы один источник.
  for (const field of ["title", "topic", ...EDITABLE_CARD_FIELDS]) {
    if (card[field] && !fieldSources.some((source) => source.field === field)) {
      throw new Error(`Для поля ${field} AI не указал подтверждающий источник.`);
    }
  }

  return {
    card,
    missingFields: calculateMissingFields(card),
    fieldSources,
  };
}
