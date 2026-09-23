import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateLocalCards,
  generateLocalQuestions,
  normalizeText,
  validateAnswers,
} from "./src/generator.mjs";
import { generateAiCards, generateAiQuestions } from "./src/openai.mjs";
import { listRecords, saveRecord } from "./src/database.mjs";
import {
  createClarifyingQuestion,
  createProposal,
  createRating,
  createTask,
  createTeam,
  PROPOSAL_STATUSES,
  QUESTION_SOURCES,
  TASK_STATUSES,
} from "./src/models.mjs";

const root = fileURLToPath(new URL("./public/", import.meta.url));
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const apiKey = process.env.OPENAI_API_KEY?.trim();
const model = process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 50_000) throw new Error("Слишком большой запрос");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Некорректный JSON");
  }
}

async function handleQuestions(request, response) {
  const body = await readJson(request);
  const task = normalizeText(body.task);
  if (task.length < 20) return sendJson(response, 400, { error: "Опишите задачу подробнее — минимум 20 символов." });

  if (!apiKey) {
    return sendJson(response, 200, { questions: generateLocalQuestions(task), mode: "demo" });
  }

  try {
    const questions = await generateAiQuestions({ apiKey, model, task });
    return sendJson(response, 200, { questions, mode: "ai" });
  } catch (error) {
    console.error("Question generation failed:", error.message);
    return sendJson(response, 200, {
      questions: generateLocalQuestions(task),
      mode: "fallback",
      notice: "ИИ временно недоступен — использованы подготовленные уточняющие вопросы.",
    });
  }
}

async function handleCards(request, response) {
  const body = await readJson(request);
  const task = normalizeText(body.task);
  const questions = Array.isArray(body.questions) ? body.questions.map((item) => normalizeText(item, 500)) : [];
  const answers = Array.isArray(body.answers) ? body.answers.map((item) => normalizeText(item, 2000)) : [];
  if (task.length < 20 || !validateAnswers(questions, answers)) {
    return sendJson(response, 400, { error: "Нужно описание задачи и три заполненных ответа." });
  }

  if (!apiKey) {
    return sendJson(response, 200, { cards: generateLocalCards(task, questions, answers), mode: "demo" });
  }

  try {
    const cards = await generateAiCards({ apiKey, model, task, questions, answers });
    return sendJson(response, 200, { cards, mode: "ai" });
  } catch (error) {
    console.error("Card generation failed:", error.message);
    return sendJson(response, 200, {
      cards: generateLocalCards(task, questions, answers),
      mode: "fallback",
      notice: "ИИ временно недоступен — карточки собраны локальным генератором.",
    });
  }
}

async function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);
  if (!filePath.startsWith(root)) return sendJson(response, 404, { error: "Не найдено" });

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": extname(filePath) === ".html" ? "no-cache" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: "Страница не найдена" });
  }
}

const server = createServer(async (request, response) => {
  try {
    const getCollections = {
      "/api/tasks": "tasks",
      "/api/clarifying-questions": "questions",
      "/api/teams": "teams",
      "/api/proposals": "proposals",
      "/api/ratings": "ratings",
    };
    if (request.method === "GET" && getCollections[request.url]) {
      const collection = getCollections[request.url];
      return sendJson(response, 200, { [collection]: await listRecords(collection) });
    }
    if (request.method === "POST" && request.url === "/api/tasks") {
      const body = await readJson(request);
      const task = createTask(body);
      if (!task.businessId || !task.title) return sendJson(response, 400, { error: "Укажите businessId и название задачи." });
      if (!TASK_STATUSES.includes(body.status ?? "draft")) return sendJson(response, 400, { error: "Статус должен быть draft, confirmed или published." });
      return sendJson(response, 201, { task: await saveRecord("tasks", task) });
    }
    if (request.method === "POST" && request.url === "/api/clarifying-questions") {
      const body = await readJson(request);
      const question = createClarifyingQuestion(body);
      if (!question.taskId || !question.targetField || !question.question) {
        return sendJson(response, 400, { error: "Укажите taskId, targetField и question." });
      }
      if (!QUESTION_SOURCES.includes(body.source ?? "local_stub")) {
        return sendJson(response, 400, { error: "source должен быть ai или local_stub." });
      }
      if (!(await listRecords("tasks")).some((task) => task.id === question.taskId)) {
        return sendJson(response, 400, { error: "Задача не найдена." });
      }
      return sendJson(response, 201, { question: await saveRecord("questions", question) });
    }
    if (request.method === "POST" && request.url === "/api/teams") {
      const team = createTeam(await readJson(request));
      if (!team.name) return sendJson(response, 400, { error: "Укажите название команды." });
      return sendJson(response, 201, { team: await saveRecord("teams", team) });
    }
    if (request.method === "POST" && request.url === "/api/proposals") {
      const body = await readJson(request);
      const proposal = createProposal(body);
      if (!proposal.taskId || !proposal.teamId || !proposal.idea || !proposal.plan) {
        return sendJson(response, 400, { error: "Укажите taskId, teamId, idea и plan." });
      }
      if (!PROPOSAL_STATUSES.includes(body.status ?? "pending")) {
        return sendJson(response, 400, { error: "Статус должен быть pending, accepted или rejected." });
      }
      const [tasks, teams] = await Promise.all([listRecords("tasks"), listRecords("teams")]);
      if (!tasks.some((task) => task.id === proposal.taskId)) return sendJson(response, 400, { error: "Задача не найдена." });
      if (!teams.some((team) => team.id === proposal.teamId)) return sendJson(response, 400, { error: "Команда не найдена." });
      return sendJson(response, 201, { proposal: await saveRecord("proposals", proposal) });
    }
    if (request.method === "POST" && request.url === "/api/ratings") {
      const body = await readJson(request);
      const rating = createRating(body);
      if (!rating.taskId || !rating.level) return sendJson(response, 400, { error: "Укажите taskId и level." });
      if (!(await listRecords("tasks")).some((task) => task.id === rating.taskId)) {
        return sendJson(response, 400, { error: "Задача не найдена." });
      }
      return sendJson(response, 201, { rating: await saveRecord("ratings", rating) });
    }
    if (request.method === "POST" && request.url === "/api/questions") return await handleQuestions(request, response);
    if (request.method === "POST" && request.url === "/api/cards") return await handleCards(request, response);
    if (request.method === "GET") return await serveStatic(request, response);
    sendJson(response, 405, { error: "Метод не поддерживается" });
  } catch (error) {
    const status = /JSON|большой/u.test(error.message) ? 400 : 500;
    sendJson(response, status, { error: status === 400 ? error.message : "Внутренняя ошибка сервера" });
  }
});

if (process.env.NODE_ENV !== "test") {
  server.listen(port, () => {
    console.log(`Hackathon Cards: http://localhost:${port}`);
    console.log(apiKey ? `AI mode (${model})` : "Demo mode (set OPENAI_API_KEY to enable AI)");
  });
}

export { server };
