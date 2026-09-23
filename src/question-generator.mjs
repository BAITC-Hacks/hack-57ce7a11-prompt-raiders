// Единый справочник полей не даёт фронтенду, AI и базе использовать разные имена.
export const CARD_FIELDS = {
  context: "Контекст",
  need: "Потребность",
  users: "Пользователи",
  data: "Данные и материалы",
  constraints: "Ограничения",
  expectedResult: "Ожидаемый результат",
  successCriteria: "Критерии успеха",
  contact: "Контакт",
  interactionFormat: "Формат взаимодействия",
};

const DEFAULT_FIELDS = Object.keys(CARD_FIELDS);

// Для каждого поля есть безопасный вопрос-заглушка.
// Эти вопросы используются без API-ключа и при любой ошибке внешнего AI.
const QUESTION_TEMPLATES = {
  context: "Что происходит сейчас и в какой ситуации возникает основная проблема?",
  need: "Что именно необходимо изменить в текущем процессе и почему это важно?",
  users: "Кто будет пользоваться решением и в какой ситуации?",
  data: "Какие данные, материалы или примеры вы сможете предоставить команде?",
  constraints: "Какие сроки, технологии, доступы или другие ограничения нужно учесть?",
  expectedResult: "Какой конкретный результат должна представить команда?",
  successCriteria: "По каким измеримым признакам вы поймёте, что задача решена успешно?",
  contact: "Кто со стороны бизнеса сможет отвечать на вопросы команды?",
  interactionFormat: "Как часто и в каком формате бизнес сможет консультировать команду?",
};

// Эти поля дают наиболее полезные вопросы, если входной список оказался слишком коротким.
const QUESTION_PRIORITY = [
  "users",
  "data",
  "expectedResult",
  "successCriteria",
  "constraints",
  "context",
  "need",
  "contact",
  "interactionFormat",
];

// Нормализация защищает промпт и интерфейс от случайно огромных или пустых строк.
export function normalizeText(value, maxLength = 4000) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeKnownFields(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    DEFAULT_FIELDS.map((field) => [field, normalizeText(source[field], 2000)]),
  );
}

function normalizeFieldsToCheck(value) {
  const requested = Array.isArray(value)
    ? [...new Set(value.filter((field) => DEFAULT_FIELDS.includes(field)))]
    : [];

  // Требование кейса — задать минимум три вопроса.
  // Поэтому дополняем слишком короткий список наиболее важными полями.
  for (const field of QUESTION_PRIORITY) {
    if (requested.length >= 3) break;
    if (!requested.includes(field)) requested.push(field);
  }

  return requested.length ? requested : [...DEFAULT_FIELDS];
}

// Эта функция создаёт чистый и предсказуемый вход для AI или локальной заглушки.
export function prepareQuestionInput(rawInput = {}) {
  const input = {
    description: normalizeText(rawInput.description),
    industry: normalizeText(rawInput.industry, 200),
    knownFields: normalizeKnownFields(rawInput.knownFields),
    fieldsToCheck: normalizeFieldsToCheck(rawInput.fieldsToCheck),
  };

  if (input.description.length < 10) {
    throw new Error("Описание задачи должно содержать минимум 10 символов.");
  }

  return input;
}

function findMissingFields(input) {
  return input.fieldsToCheck
    .filter((field) => !input.knownFields[field])
    .map((field) => ({ field, label: CARD_FIELDS[field] }));
}

function chooseQuestionFields(input, missingFields) {
  const result = missingFields.map((item) => item.field);

  // Если пропусков меньше трёх, задаём вопросы на уточнение важных известных полей.
  // Это сохраняет контракт «от 3 до 5 вопросов» даже для почти готовой карточки.
  for (const field of QUESTION_PRIORITY) {
    if (result.length >= 3) break;
    if (input.fieldsToCheck.includes(field) && !result.includes(field)) result.push(field);
  }

  return result.slice(0, 5);
}

function collectSafeFacts(input) {
  const facts = [
    {
      field: "description",
      value: input.description,
      source: "description",
      evidence: input.description,
    },
  ];

  if (input.industry) {
    facts.push({
      field: "industry",
      value: input.industry,
      source: "industry",
      evidence: input.industry,
    });
  }

  // Локальная версия считает фактом только то, что явно пришло во входных данных.
  for (const [field, value] of Object.entries(input.knownFields)) {
    if (value) facts.push({ field, value, source: "knownFields", evidence: value });
  }

  return facts;
}

// Детерминированный fallback позволяет демонстрировать проект без интернета и API-ключа.
export function generateTemplateQuestions(rawInput) {
  const input = prepareQuestionInput(rawInput);
  const missingFields = findMissingFields(input);
  const questionFields = chooseQuestionFields(input, missingFields);

  return {
    missingFields,
    questions: questionFields.map((field, index) => ({
      id: `question-${index + 1}`,
      targetField: field,
      question: QUESTION_TEMPLATES[field],
    })),
    extractedFacts: collectSafeFacts(input),
  };
}

function inputEvidence(input) {
  return [
    input.description,
    input.industry,
    ...Object.values(input.knownFields),
  ].filter(Boolean);
}

// Даже при строгой JSON-схеме ответ AI дополнительно проверяется приложением.
// Особенно важно убедиться, что «извлечённый факт» действительно присутствует во входе.
export function validateAiQuestionResult(rawResult, rawInput) {
  const input = prepareQuestionInput(rawInput);
  const allowedEvidence = inputEvidence(input);
  const result = rawResult && typeof rawResult === "object" ? rawResult : {};

  if (!Array.isArray(result.questions) || result.questions.length < 3 || result.questions.length > 5) {
    throw new Error("AI должен вернуть от 3 до 5 вопросов.");
  }

  const questions = result.questions.map((item, index) => {
    const targetField = item?.targetField;
    const question = normalizeText(item?.question, 500);
    if (!input.fieldsToCheck.includes(targetField) || !question) {
      throw new Error(`Некорректный вопрос AI под номером ${index + 1}.`);
    }
    return { id: `question-${index + 1}`, targetField, question };
  });

  if (new Set(questions.map((item) => item.targetField)).size !== questions.length) {
    throw new Error("AI повторил поле в нескольких уточняющих вопросах.");
  }

  const missingFields = Array.isArray(result.missingFields)
    ? result.missingFields.map((item) => {
        const field = item?.field;
        if (!input.fieldsToCheck.includes(field) || input.knownFields[field]) {
          throw new Error("AI неверно определил отсутствующее поле.");
        }
        return { field, label: CARD_FIELDS[field] };
      })
    : [];

  const extractedFacts = Array.isArray(result.extractedFacts)
    ? result.extractedFacts.map((item) => {
        const field = normalizeText(item?.field, 100);
        const value = normalizeText(item?.value, 2000);
        const source = item?.source;
        const evidence = normalizeText(item?.evidence, 2000);
        const sourceIsKnown = ["description", "industry", "knownFields"].includes(source);
        const evidenceExists = evidence && allowedEvidence.some((text) => text.includes(evidence));

        // В MVP значение факта должно буквально совпадать с цитатой.
        // Это жёсткое правило уменьшает риск незаметной выдумки со стороны модели.
        if (!field || !value || value !== evidence || !sourceIsKnown || !evidenceExists) {
          throw new Error("AI вернул факт без подтверждения во входных данных.");
        }
        return { field, value, source, evidence };
      })
    : [];

  return { missingFields, questions, extractedFacts };
}
