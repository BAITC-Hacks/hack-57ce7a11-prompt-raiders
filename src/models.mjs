import { randomUUID } from "node:crypto";

export const TASK_STATUSES = ["draft", "confirmed", "published"];
export const READINESS_LEVELS = ["draft", "in_progress", "ready", "priority"];
export const QUESTION_SOURCES = ["ai", "local_stub"];
export const PROPOSAL_STATUSES = ["pending", "accepted", "rejected"];

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

export function createClarifyingQuestion(input = {}) {
  return {
    id: randomUUID(),
    taskId: text(input.taskId, 80),
    targetField: text(input.targetField, 100),
    question: text(input.question, 2000),
    answer: text(input.answer, 4000),
    source: QUESTION_SOURCES.includes(input.source) ? input.source : "local_stub",
    createdAt: new Date().toISOString(),
  };
}

export function createTeam(input = {}) {
  return {
    id: randomUUID(),
    name: text(input.name, 200),
    interests: textList(input.interests),
    skills: textList(input.skills),
    technologies: textList(input.technologies),
    description: text(input.description, 2000),
  };
}

export function createProposal(input = {}) {
  return {
    id: randomUUID(),
    taskId: text(input.taskId, 80),
    teamId: text(input.teamId, 80),
    idea: text(input.idea, 4000),
    plan: text(input.plan, 6000),
    estimatedTerm: text(input.estimatedTerm, 200),
    prototypeUrl: text(input.prototypeUrl, 2000),
    status: PROPOSAL_STATUSES.includes(input.status) ? input.status : "pending",
    businessComment: text(input.businessComment, 4000),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function createRating(input = {}) {
  return {
    id: randomUUID(),
    taskId: text(input.taskId, 80),
    total: score(input.total, 100),
    level: text(input.level, 100),
    scores: input.scores && typeof input.scores === "object" ? { ...input.scores } : {},
    missingFields: textList(input.missingFields),
    recommendations: textList(input.recommendations),
    source: input.source === "ai" ? "ai" : "local_stub",
    createdAt: new Date().toISOString(),
  };
}

function score(value, max) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(max, Math.round(numeric))) : 0;
}

function textList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item, 300)).filter(Boolean).slice(0, 50);
}

function text(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
