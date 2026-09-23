import { randomUUID } from "node:crypto";

export const QUESTION_SOURCES = ["ai", "local_stub"];
export const PROPOSAL_STATUSES = ["pending", "accepted", "rejected"];

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
  const now = new Date().toISOString();
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
    createdAt: now,
    updatedAt: now,
  };
}

function textList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item, 300)).filter(Boolean).slice(0, 50);
}

function text(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}
