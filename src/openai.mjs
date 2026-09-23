const API_URL = "https://api.openai.com/v1/responses";

const questionsSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string" },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

const cardProperties = {
  title: { type: "string" },
  angle: { type: "string" },
  pitch: { type: "string" },
  audience: { type: "string" },
  problem: { type: "string" },
  features: {
    type: "array",
    minItems: 3,
    maxItems: 3,
    items: { type: "string" },
  },
  metric: { type: "string" },
  constraints: { type: "string" },
  tags: {
    type: "array",
    minItems: 2,
    maxItems: 4,
    items: { type: "string" },
  },
};

const cardsSchema = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: cardProperties,
        required: Object.keys(cardProperties),
        additionalProperties: false,
      },
    },
  },
  required: ["cards"],
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

export async function generateAiQuestions({ apiKey, model, task }) {
  const result = await structuredResponse({
    apiKey,
    model,
    name: "hackathon_questions",
    schema: questionsSchema,
    instructions: [
      "Ты опытный фасилитатор бизнес-хакатонов.",
      "Задай ровно 3 коротких, конкретных и непересекающихся вопроса на русском языке.",
      "Вопросы должны прояснить: пользователя и контекст; измеримый результат; данные, интеграции и ограничения.",
      "Не предлагай решение и не повторяй факты, которые уже есть в задаче.",
    ].join(" "),
    input: `Описание задачи:\n${task}`,
  });
  return result.questions;
}

export async function generateAiCards({ apiKey, model, task, questions, answers }) {
  const interview = questions.map((question, index) => `${index + 1}. ${question}\nОтвет: ${answers[index]}`).join("\n\n");
  const result = await structuredResponse({
    apiKey,
    model,
    name: "hackathon_cards",
    schema: cardsSchema,
    instructions: [
      "Ты продуктовый эксперт хакатона. Создай ровно 3 существенно разные карточки решений на русском языке.",
      "Карточка 1 — реалистичный быстрый MVP, карточка 2 — подход на данных или автоматизации, карточка 3 — дешёвый эксперимент для проверки самой рискованной гипотезы.",
      "Строго опирайся на описание и ответы. Не выдумывай доступные данные, интеграции или числовые показатели.",
      "Каждая карточка должна быть выполнима командой за хакатон. Пиши конкретно и кратко.",
    ].join(" "),
    input: `Описание задачи:\n${task}\n\nИнтервью:\n${interview}`,
  });
  return result.cards;
}
