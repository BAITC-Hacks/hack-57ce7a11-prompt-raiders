import { randomUUID } from "node:crypto";

export const TASK_STATUSES = ["draft", "confirmed", "published"];

// Создаёт структуру задачи только из пользовательских полей.
// score, readinessLevel и missingFields вычисляются отдельно в rating.mjs.
export function createTask(input = {}, existing = null) {
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? randomUUID(),
    businessId: text(input.businessId ?? existing?.businessId, 80),
    status: TASK_STATUSES.includes(input.status) ? input.status : existing?.status ?? "draft",
    title: text(input.title ?? existing?.title, 240),
    topic: text(input.topic ?? existing?.topic, 200),
    originalDescription: text(input.originalDescription ?? existing?.originalDescription, 8000),
    context: text(input.context ?? existing?.context, 4000),
    need: text(input.need ?? existing?.need, 4000),
    users: text(input.users ?? existing?.users, 2000),
    data: text(input.data ?? existing?.data, 4000),
    constraints: text(input.constraints ?? existing?.constraints, 4000),
    expectedResult: text(input.expectedResult ?? existing?.expectedResult, 4000),
    successCriteria: text(input.successCriteria ?? existing?.successCriteria, 2000),
    contact: text(input.contact ?? existing?.contact, 300),
    interactionFormat: text(input.interactionFormat ?? existing?.interactionFormat, 1000),
    score: existing?.score ?? 0,
    readinessLevel: existing?.readinessLevel ?? "draft",
    missingFields: Array.isArray(existing?.missingFields) ? [...existing.missingFields] : [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function text(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
