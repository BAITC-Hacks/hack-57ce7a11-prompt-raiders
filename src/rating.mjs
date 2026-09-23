// Единственная таблица весов для оценки карточки задачи (сумма = 100).
export const TASK_SCORE_RUBRIC = [
  { field: "context", label: "Контекст", max: 10, recommendation: "Опишите, где, когда и почему возникает ситуация." },
  { field: "need", label: "Потребность", max: 10, recommendation: "Сформулируйте конкретную проблему или потребность." },
  { field: "data", label: "Данные и материалы", max: 20, recommendation: "Укажите доступные данные, материалы и источники." },
  { field: "expectedResult", label: "Ожидаемый результат", max: 15, recommendation: "Опишите конкретный результат, который должна представить команда." },
  { field: "successCriteria", label: "Критерии успеха", max: 15, recommendation: "Добавьте измеримые признаки успешного результата." },
  { field: "constraints", label: "Ограничения", max: 10, recommendation: "Уточните сроки, технологии, доступы и другие ограничения." },
  { field: "users", label: "Пользователи", max: 10, recommendation: "Уточните, для кого создаётся решение." },
  { field: "contact", label: "Контакт", max: 5, recommendation: "Укажите контакт представителя бизнеса." },
  { field: "interactionFormat", label: "Формат взаимодействия", max: 5, recommendation: "Опишите формат и частоту консультаций с командой." },
];

export const TASK_SCORE_MAX = TASK_SCORE_RUBRIC.reduce((sum, criterion) => sum + criterion.max, 0);

function normalizeScores(input = {}) {
  return Object.fromEntries(TASK_SCORE_RUBRIC.map(({ field, max }) => {
    const value = Number(input[field]);
    return [field, Number.isFinite(value) ? Math.max(0, Math.min(max, Math.round(value))) : 0];
  }));
}

function fallbackScores(task) {
  return Object.fromEntries(TASK_SCORE_RUBRIC.map(({ field, max }) => [
    field,
    typeof task[field] === "string" && task[field].trim() ? max : 0,
  ]));
}

function readinessForScore(score) {
  if (score >= 90) return "priority";
  if (score >= 70) return "ready";
  if (score >= 40) return "in_progress";
  return "draft";
}

// aiScores — только подбаллы от AI; общий балл и итоговые поля вычисляются здесь.
export function rateTask(task, aiScores = null) {
  const breakdown = normalizeScores(aiScores ?? fallbackScores(task));
  const score = TASK_SCORE_RUBRIC.reduce((sum, { field }) => sum + breakdown[field], 0);
  const missingFields = TASK_SCORE_RUBRIC
    .filter(({ field }) => breakdown[field] === 0)
    .map(({ field }) => field);
  const recommendations = TASK_SCORE_RUBRIC
    .filter(({ field, max }) => breakdown[field] < max)
    .map(({ field, label, recommendation }) => ({
      field,
      text: recommendation,
      pointsToGain: max - breakdown[field],
      label,
    }));

  return {
    score,
    readinessLevel: readinessForScore(score),
    missingFields,
    breakdown,
    recommendations,
  };
}
