import { CARD_FIELDS } from "./question-generator.mjs";
import { CARD_OUTPUT_FIELDS } from "./card-generator.mjs";
import { TASK_SCORE_MAX, TASK_SCORE_RUBRIC } from "./scoring.mjs";

const API_URL = "https://api.openai.com/v1/responses";
const cardFieldNames = Object.keys(CARD_FIELDS);
const factFieldNames = ["description", "industry", ...cardFieldNames];

// Строгая схема AI-операции 1: пропуски, вопросы и подтверждённые факты.
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

// AI-операция 2 возвращает одну карточку и точные источники её полей.
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

const ratingProperties = Object.fromEntries(
  TASK_SCORE_RUBRIC.map(({ field }) => [field, { type: "integer" }]),
);

// AI оценивает отдельные разделы, а итог приложение считает самостоятельно.
const ratingSchema = {
  type: "object",
  properties: {
    scores: {
      type: "object",
      properties: ratingProperties,
      required: Object.keys(ratingProperties),
      additionalProperties: false,
    },
    missingFields: {
      type: "array",
      items: {
        type: "string",
        enum: TASK_SCORE_RUBRIC.map(({ field }) => field),
      },
    },
    recommendations: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["scores", "missingFields", "recommendations"],
  additionalProperties: false,
};

function extractOutputText(response) {
  if (typeof response.output_text === "string") return response.output_text;

  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "refusal") {
        throw new Error(content.refusal || "Модель отказалась отвечать");
      }
      if (content.type === "output_text" && content.text) return content.text;
    }
  }

  throw new Error("ИИ не вернул текстовый ответ");
}

// Общая функция выполняет запрос с тайм-аутом и разбирает строгий JSON-ответ.
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
        text: {
          format: {
            type: "json_schema",
            name,
            strict: true,
            schema,
          },
        },
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

export async function generateAiQuestions({ apiKey, model, input }) {
  return structuredResponse({
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
      "Для каждого факта value и evidence должны быть одной точной цитатой из входного JSON.",
      "Не предлагай решение задачи и не добавляй пояснения вне JSON.",
    ].join(" "),
    input: JSON.stringify(input),
  });
}

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

export async function generateAiTaskRating({ apiKey, model, task }) {
  const rubric = TASK_SCORE_RUBRIC
    .map(({ field, label, max, guidance }) =>
      `${field} (${label}): 0–${max} баллов. ${guidance}`,
    )
    .join("\n");

  return structuredResponse({
    apiKey,
    model,
    name: "task_card_rating",
    schema: ratingSchema,
    instructions: [
      "Оцени качество карточки бизнес-задачи для хакатона по заданной шкале.",
      `Оцени каждое поле целым числом от 0 до его максимума. Сумма максимумов равна ${TASK_SCORE_MAX}; не возвращай общий балл, приложение посчитает его само.`,
      "Пустое поле получает 0. Частичное или расплывчатое описание получает частичный балл.",
      "Не додумывай факты, контакты, данные и доступные ресурсы.",
      "Верни в missingFields поля без достаточных сведений и дай краткие рекомендации.",
      "Рубрика:\n" + rubric,
      "Ответ только по JSON-схеме.",
    ].join(" "),
    input: JSON.stringify(task),
  });
}
