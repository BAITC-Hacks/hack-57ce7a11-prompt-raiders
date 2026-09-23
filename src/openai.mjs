import { CARD_FIELDS } from "./question-generator.mjs";
import { CARD_OUTPUT_FIELDS } from "./card-generator.mjs";

const API_URL = "https://api.openai.com/v1/responses";
const cardFieldNames = Object.keys(CARD_FIELDS);
const factFieldNames = ["description", "industry", ...cardFieldNames];

const questionsSchema = {
  type: "object",
  properties: {
    missingFields: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string", enum: cardFieldNames },
        },
        required: ["field"],
        additionalProperties: false,
      },
    },
    questions: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          targetField: { type: "string", enum: cardFieldNames },
          question: { type: "string" },
        },
        required: ["targetField", "question"],
        additionalProperties: false,
      },
    },
    extractedFacts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string", enum: factFieldNames },
          value: { type: "string" },
          source: {
            type: "string",
            enum: ["description", "industry", "knownFields"],
          },
          evidence: { type: "string" },
        },
        required: ["field", "value", "source", "evidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["missingFields", "questions", "extractedFacts"],
  additionalProperties: false,
};

const taskCardProperties = Object.fromEntries(
  CARD_OUTPUT_FIELDS.map((field) => [field, { type: "string" }]),
);

// Структура AI-операции 2 полностью совпадает с карточкой в models.mjs.
// fieldSources нужны для автоматической проверки, что модель не выдумала факты.
const taskCardSchema = {
  type: "object",
  properties: {
    card: {
      type: "object",
      properties: taskCardProperties,
      required: CARD_OUTPUT_FIELDS,
      additionalProperties: false,
    },
    fieldSources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string", enum: CARD_OUTPUT_FIELDS },
          sourceType: {
            type: "string",
            enum: ["description", "industry", "knownField", "answer"],
          },
          sourceId: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["field", "sourceType", "sourceId", "evidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["card", "fieldSources"],
  additionalProperties: false,
};

function extractOutputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "refusal") throw new Error(content.refusal || "Модель отказалась отвечать");
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  throw new Error("ИИ не вернул текстовый ответ");
}

async function structuredResponse({ apiKey, model, instructions, input, schema, name }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions,
        input,
        text: { format: { type: "json_schema", name, strict: true, schema } },
      }),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error?.message || `OpenAI API вернул ${response.status}`);
    }
    return JSON.parse(extractOutputText(body));
  } finally {
    clearTimeout(timeout);
  }
}

// Генератор получает уже очищенный объект, а не произвольный текст из HTTP-запроса.
// Это упрощает промпт и делает формат одинаковым для AI и локальной заглушки.
export async function generateAiQuestions({ apiKey, model, input }) {
  const result = await structuredResponse({
    apiKey,
    model,
    name: "clarification_questions",
    schema: questionsSchema,
    instructions: [
      "Ты анализируешь черновик бизнес-задачи для студенческого хакатона.",
      "Используй только факты, явно присутствующие во входном JSON.",
      "Не придумывай пользователей, данные, сроки, метрики, контакты или ограничения.",
      "Определи незаполненные поля только из fieldsToCheck и верни их в missingFields.",
      "Задай от 3 до 5 коротких, конкретных и неповторяющихся вопросов на русском языке.",
      "Каждый вопрос должен уточнять ровно одно поле и содержать его имя в targetField.",
      "Для каждого извлечённого факта value и evidence должны быть одной и той же точной цитатой из входного JSON.",
      "Не предлагай решение задачи и не добавляй пояснения вне JSON.",
    ].join(" "),
    input: JSON.stringify(input),
  });
  return result;
}

// AI-операция 2 получает уже проверенный контракт из card-generator.mjs.
// Она возвращает одну карточку бизнес-задачи, а не варианты решения для команды.
export async function generateAiTaskCard({ apiKey, model, input }) {
  return structuredResponse({
    apiKey,
    model,
    name: "business_task_card",
    schema: taskCardSchema,
    instructions: [
      "Ты формируешь одну редактируемую карточку бизнес-задачи на русском языке.",
      "Используй только первоначальное описание, известные поля и ответы из входного JSON.",
      "Не придумывай людей, данные, контакты, сроки, метрики, технологии или ограничения.",
      "Если информации для поля нет, верни пустую строку.",
      "originalDescription должен дословно совпадать с description, а topic — с industry.",
      "Сформулируй короткое title без добавления новых фактов.",
      "Карточка описывает потребность бизнеса, а не готовое решение студенческой команды.",
      "Для каждого непустого поля, включая title и topic, добавь fieldSources.",
      "evidence должна быть точной цитатой из соответствующего источника входного JSON.",
      "sourceId для ответа — id вопроса, для известного поля — имя поля.",
      "Не рассчитывай рейтинг, не назначай статус и не создавай идентификатор задачи.",
      "Не добавляй текст вне заданного JSON-формата.",
    ].join(" "),
    input: JSON.stringify(input),
  });
}
