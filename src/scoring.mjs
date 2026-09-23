// The weights are the single source of truth for prompts and score calculation.
export const TASK_SCORE_RUBRIC = [
  { field: "context", label: "Контекст", max: 10, guidance: "Понятно ли, где, когда и почему возникает ситуация?" },
  { field: "need", label: "Потребность", max: 10, guidance: "Сформулирована ли конкретная проблема или потребность?" },
  { field: "data", label: "Данные и материалы", max: 20, guidance: "Указаны ли доступные данные, материалы и источники?" },
  { field: "expectedResult", label: "Ожидаемый результат", max: 15, guidance: "Описан ли конкретный результат, который должна представить команда?" },
  { field: "successCriteria", label: "Критерии успеха", max: 15, guidance: "Есть ли измеримые признаки успешного результата?" },
  { field: "constraints", label: "Ограничения", max: 10, guidance: "Описаны ли важные сроки, технологии, доступы и ограничения?" },
  { field: "users", label: "Пользователи", max: 10, guidance: "Понятно ли, для кого создаётся решение?" },
  { field: "contact", label: "Контакт", max: 5, guidance: "Указан ли представитель бизнеса для связи?" },
  { field: "interactionFormat", label: "Формат взаимодействия", max: 5, guidance: "Понятно ли, как команда получит консультации и обратную связь?" },
];

export const TASK_SCORE_MAX = TASK_SCORE_RUBRIC.reduce((sum, item) => sum + item.max, 0);

export function normalizeRubricScores(input = {}) {
  return Object.fromEntries(TASK_SCORE_RUBRIC.map(({ field, max }) => {
    const value = Number(input[field]);
    return [field, Number.isFinite(value) ? Math.max(0, Math.min(max, Math.round(value))) : 0];
  }));
}

export function totalRubricScore(scores) {
  return TASK_SCORE_RUBRIC.reduce((total, { field }) => total + scores[field], 0);
}

// Fallback is a completeness check only. The AI path evaluates quality using the same rubric.
export function scoreTaskCompleteness(task) {
  return Object.fromEntries(TASK_SCORE_RUBRIC.map(({ field, max }) => [
    field,
    typeof task[field] === "string" && task[field].trim() ? max : 0,
  ]));
}

export function readinessForScore(total) {
  if (total >= 90) return "priority";
  if (total >= 70) return "ready";
  if (total >= 40) return "in_progress";
  return "draft";
}
