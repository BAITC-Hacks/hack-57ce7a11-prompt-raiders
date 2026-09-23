import { randomUUID } from "node:crypto";

export const TASK_STATUSES = ["draft", "confirmed", "published"];
export const READINESS_LEVELS = ["draft", "in_progress", "ready", "priority"];

export function createTask(input = {}) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    businessId: text(input.businessId, 80),
    status: TASK_STATUSES.includes(input.status) ? input.status : "draft",
    title: text(input.title, 240),
    topic: text(input.topic, 200),
    originalDescription: text(input.originalDescription, 8000),
    context: text(input.context, 4000),
    need: text(input.need, 4000),
    users: text(input.users, 2000),
    data: text(input.data, 4000),
    constraints: text(input.constraints, 4000),
    expectedResult: text(input.expectedResult, 4000),
    successCriteria: text(input.successCriteria, 2000),
    contact: text(input.contact, 300),
    interactionFormat: text(input.interactionFormat, 1000),
    score: Number.isFinite(input.score) ? Math.max(0, Math.min(100, Math.round(input.score))) : 0,
    readinessLevel: READINESS_LEVELS.includes(input.readinessLevel) ? input.readinessLevel : "draft",
    missingFields: Array.isArray(input.missingFields) ? input.missingFields.map((value) => text(value, 100)).filter(Boolean) : [],
    createdAt: now,
    updatedAt: now,
  };
}

function text(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
