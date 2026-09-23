const DEFAULT_QUESTIONS = [
  "Кто будет главным пользователем решения и в какой ситуации он столкнётся с этой проблемой?",
  "Какой измеримый результат должен дать работающий прототип к концу хакатона?",
  "Какие данные, интеграции или ограничения команда обязана учесть?",
];

const STOP_WORDS = new Set([
  "для", "или", "как", "что", "это", "при", "под", "над", "без", "про", "его",
  "она", "они", "мы", "вы", "быть", "нужно", "надо", "можно", "который", "чтобы",
  "задача", "решение", "система", "сделать", "создать", "проект", "the", "and", "with",
]);

export function normalizeText(value, maxLength = 4000) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function extractKeywords(...parts) {
  const counts = new Map();
  parts
    .join(" ")
    .toLowerCase()
    .match(/[a-zа-яё0-9-]{4,}/giu)
    ?.forEach((word) => {
      if (!STOP_WORDS.has(word) && !/^\d+$/.test(word)) {
        counts.set(word, (counts.get(word) ?? 0) + 1);
      }
    });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
    .slice(0, 5)
    .map(([word]) => word);
}

export function generateLocalQuestions(task) {
  const cleanTask = normalizeText(task);
  const lower = cleanTask.toLowerCase();
  const questions = [...DEFAULT_QUESTIONS];

  if (/магазин|клиент|покупател|продаж|заказ/u.test(lower)) {
    questions[0] = "Какой сегмент клиентов приоритетен и на каком этапе покупки возникает главная проблема?";
  } else if (/сотрудник|команд|hr|персонал/u.test(lower)) {
    questions[0] = "Какие сотрудники будут пользоваться решением и какой рабочий процесс сейчас отнимает у них больше всего времени?";
  } else if (/город|транспорт|логист|достав/u.test(lower)) {
    questions[0] = "Кто основной пользователь и на каком участке маршрута или логистического процесса возникает проблема?";
  }

  if (/данн|аналит|прогноз|ии|ai|ml/u.test(lower)) {
    questions[2] = "Какие данные доступны команде, как оценивать качество результата и есть ли ограничения по приватности?";
  } else if (/интеграц|api|crm|erp|1с/u.test(lower)) {
    questions[2] = "С какими системами нужно интегрироваться, какие API доступны и что нельзя менять в текущем процессе?";
  }

  return questions;
}

function short(value, fallback, max = 110) {
  const text = normalizeText(value, max);
  if (!text) return fallback;
  return text.length < max ? text : `${text.slice(0, max - 1).trim()}…`;
}

export function generateLocalCards(task, questions, answers) {
  const cleanTask = normalizeText(task);
  const cleanAnswers = answers.map((answer) => normalizeText(answer));
  const audience = short(cleanAnswers[0], "Участники целевого бизнес-процесса");
  const outcome = short(cleanAnswers[1], "Подтверждённое улучшение ключевого показателя");
  const constraints = short(cleanAnswers[2], "Проверить доступность данных и интеграций");
  const keywords = extractKeywords(cleanTask, ...cleanAnswers);
  const core = keywords[0] ? keywords[0][0].toUpperCase() + keywords[0].slice(1) : "Задача";
  const tags = keywords.length >= 3 ? keywords.slice(0, 4) : ["MVP", "бизнес", "хакатон"];

  return [
    {
      title: `${core} Навигатор`,
      angle: "Быстрый MVP",
      pitch: `Простой цифровой помощник, который закрывает ключевой сценарий задачи: ${short(cleanTask, "решает описанную бизнес-проблему", 170)}`,
      audience,
      problem: short(cleanTask, "Пользователь тратит лишнее время на текущий процесс", 180),
      features: [
        "Один главный пользовательский сценарий от входа до результата",
        "Панель с текущим статусом и следующими действиями",
        `Измерение результата: ${outcome}`,
      ],
      metric: outcome,
      constraints,
      tags,
    },
    {
      title: `${core} Инсайт`,
      angle: "Data-driven",
      pitch: "Аналитический прототип, который превращает доступные данные в понятную рекомендацию и помогает принять решение.",
      audience,
      problem: `Пользователю не хватает прозрачной информации для решения задачи «${short(cleanTask, "бизнес-задача", 120)}».`,
      features: [
        "Сбор или загрузка минимального набора данных",
        "Приоритизация кейсов по понятным правилам",
        "Объяснимая рекомендация и обратная связь пользователя",
      ],
      metric: outcome,
      constraints,
      tags: [...new Set(["аналитика", ...tags])].slice(0, 4),
    },
    {
      title: `${core} Эксперимент`,
      angle: "Проверка гипотезы",
      pitch: "Сервис-консьерж с минимальной автоматизацией: команда проверяет ценность идеи на реальных пользователях до сложной разработки.",
      audience,
      problem: `Пока не доказано, что предложенный подход даст нужный результат для выбранной аудитории.`,
      features: [
        "Лендинг или чат-интерфейс для первого контакта",
        "Ручной сценарий оказания услуги за интерфейсом",
        "Сбор событий, отзывов и причин отказа",
      ],
      metric: outcome,
      constraints,
      tags: [...new Set(["эксперимент", ...tags])].slice(0, 4),
    },
  ];
}

export function validateAnswers(questions, answers) {
  return (
    Array.isArray(questions) &&
    questions.length === 3 &&
    questions.every((item) => normalizeText(item, 500)) &&
    Array.isArray(answers) &&
    answers.length === 3 &&
    answers.every((item) => normalizeText(item, 2000).length >= 2)
  );
}
