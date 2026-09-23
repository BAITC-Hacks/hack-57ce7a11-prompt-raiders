import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { generateLocalCards, normalizeText, validateAnswers } from "./src/generator.mjs";
import { generateAiCards, generateAiQuestions, generateAiTaskRating } from "./src/openai.mjs";
import {
  deleteTask,
  findTaskById,
  listRecords,
  listTasks,
  saveRecord,
  saveTask,
  updateTask,
} from "./src/database.mjs";
import { createTask, TASK_STATUSES } from "./src/models.mjs";
import {
  createClarifyingQuestion,
  createProposal,
  createTeam,
  PROPOSAL_STATUSES,
  QUESTION_SOURCES,
} from "./src/related-models.mjs";
import { generateTemplateQuestions, prepareQuestionInput, validateAiQuestionResult } from "./src/question-generator.mjs";
import { DEMO_QUESTION_INPUT } from "./src/demo-data.mjs";
import { rateTask } from "./src/rating.mjs";

const root = fileURLToPath(new URL("./", import.meta.url));
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
const publicFiles = new Set(["/index.html", "/styles.css", "/app.js"]);

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
  const input = prepareQuestionInput(await readJson(request));
  if (!apiKey) {
    return sendJson(response, 200, {
      ...generateTemplateQuestions(input),
      mode: "demo",
      notice: "OPENAI_API_KEY не задан — использованы безопасные шаблонные вопросы.",
    });
  }
  try {
    const aiResult = await generateAiQuestions({ apiKey, model, input });
    return sendJson(response, 200, { ...validateAiQuestionResult(aiResult, input), mode: "ai" });
  } catch (error) {
    console.error("Question generation failed:", error.message);
    return sendJson(response, 200, {
      ...generateTemplateQuestions(input),
      mode: "fallback",
      notice: "ИИ временно недоступен — использованы подготовленные уточняющие вопросы.",
    });
  }
}

function handleDemoQuestions(response) {
  const input = prepareQuestionInput(DEMO_QUESTION_INPUT);
  return sendJson(response, 200, { input, result: generateTemplateQuestions(input), mode: "demo" });
}

async function handleCards(request, response) {
  const body = await readJson(request);
  const task = normalizeText(body.task);
  const questions = Array.isArray(body.questions) ? body.questions.map((item) => normalizeText(item, 500)) : [];
  const answers = Array.isArray(body.answers) ? body.answers.map((item) => normalizeText(item, 2000)) : [];
  if (task.length < 20 || !validateAnswers(questions, answers)) {
    return sendJson(response, 400, { error: "Нужно описание задачи и три заполненных ответа." });
  }
  if (!apiKey) return sendJson(response, 200, { cards: generateLocalCards(task, questions, answers), mode: "demo" });
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

async function evaluateTask(task) {
  let evaluation = null;
  let source = "ai";
  if (apiKey) {
    try {
      evaluation = await generateAiTaskRating({ apiKey, model, task });
    } catch (error) {
      source = "local_stub";
      console.error("Task rating failed:", error.message);
    }
  } else {
    source = "local_stub";
  }
  return { ...rateTask(task, evaluation?.scores), source };
}

async function persistTaskRating(task, rating) {
  const record = {
    id: randomUUID(),
    taskId: task.id,
    ...rating,
    createdAt: new Date().toISOString(),
  };
  await saveRecord("ratings", record);
  return record;
}

async function handleTaskRating(request, response) {
  const body = await readJson(request);
  const taskId = normalizeText(body.taskId, 80);
  const task = await findTaskById(taskId);
  if (!task) return sendJson(response, 404, { error: "Задача не найдена." });
  const rating = await evaluateTask(task);
  await updateTask(taskId, {
    score: rating.score,
    readinessLevel: rating.readinessLevel,
    missingFields: rating.missingFields,
    updatedAt: new Date().toISOString(),
  });
  const record = await persistTaskRating(task, rating);
  return sendJson(response, 200, { rating: record, mode: rating.source, maximum: 100 });
}

async function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  if (!publicFiles.has(pathname) && !pathname.startsWith("/assets/")) {
    return sendJson(response, 404, { error: "Страница не найдена" });
  }
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
      "/api/clarifying-questions": "questions",
      "/api/teams": "teams",
      "/api/proposals": "proposals",
      "/api/ratings": "ratings",
    };
    if (request.method === "GET" && request.url === "/api/tasks") {
      return sendJson(response, 200, { tasks: await listTasks() });
    }
    if (request.method === "GET" && getCollections[request.url]) {
      const collection = getCollections[request.url];
      return sendJson(response, 200, { [collection]: await listRecords(collection) });
    }
    const taskMatch = request.url.match(/^\/api\/tasks\/([^/]+)$/);
    if (request.method === "GET" && taskMatch) {
      const task = await findTaskById(decodeURIComponent(taskMatch[1]));
      return task ? sendJson(response, 200, { task }) : sendJson(response, 404, { error: "Задача не найдена." });
    }
    if (request.method === "GET" && request.url === "/api/questions/demo") return handleDemoQuestions(response);
    if (request.method === "POST" && request.url === "/api/questions") return await handleQuestions(request, response);
    if (request.method === "POST" && request.url === "/api/cards") return await handleCards(request, response);
    if (request.method === "POST" && request.url === "/api/ratings/evaluate") return await handleTaskRating(request, response);

    if (request.method === "POST" && request.url === "/api/tasks") {
      const body = await readJson(request);
      const task = createTask(body);
      if (!task.businessId || !task.title) return sendJson(response, 400, { error: "Укажите businessId и название задачи." });
      if (!TASK_STATUSES.includes(body.status ?? "draft")) return sendJson(response, 400, { error: "Статус должен быть draft, confirmed или published." });
      const rating = await evaluateTask(task);
      const ratedTask = {
        ...task,
        score: rating.score,
        readinessLevel: rating.readinessLevel,
        missingFields: rating.missingFields,
      };
      await saveTask(ratedTask);
      const ratingRecord = await persistTaskRating(ratedTask, rating);
      return sendJson(response, 201, { task: ratedTask, rating: ratingRecord, mode: rating.source });
    }
    if (request.method === "PATCH" && taskMatch) {
      const taskId = decodeURIComponent(taskMatch[1]);
      const existing = await findTaskById(taskId);
      if (!existing) return sendJson(response, 404, { error: "Задача не найдена." });
      const body = await readJson(request);
      if (body.status !== undefined && !TASK_STATUSES.includes(body.status)) {
        return sendJson(response, 400, { error: "Статус должен быть draft, confirmed или published." });
      }
      const task = createTask(body, existing);
      if (!task.businessId || !task.title) return sendJson(response, 400, { error: "Укажите businessId и название задачи." });
      const rating = await evaluateTask(task);
      const ratedTask = {
        ...task,
        score: rating.score,
        readinessLevel: rating.readinessLevel,
        missingFields: rating.missingFields,
      };
      await updateTask(taskId, ratedTask);
      const ratingRecord = await persistTaskRating(ratedTask, rating);
      return sendJson(response, 200, { task: ratedTask, rating: ratingRecord, mode: rating.source });
    }
    if (request.method === "DELETE" && taskMatch) {
      const deleted = await deleteTask(decodeURIComponent(taskMatch[1]));
      return deleted ? sendJson(response, 200, { deleted: true }) : sendJson(response, 404, { error: "Задача не найдена." });
    }
    if (request.method === "POST" && request.url === "/api/clarifying-questions") {
      const body = await readJson(request);
      const question = createClarifyingQuestion(body);
      if (!question.taskId || !question.targetField || !question.question) return sendJson(response, 400, { error: "Укажите taskId, targetField и question." });
      if (!QUESTION_SOURCES.includes(body.source ?? "local_stub")) return sendJson(response, 400, { error: "source должен быть ai или local_stub." });
      if (!(await listRecords("tasks")).some((task) => task.id === question.taskId)) return sendJson(response, 400, { error: "Задача не найдена." });
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
      if (!proposal.idea || !proposal.plan) return sendJson(response, 400, { error: "Укажите idea и plan." });
      if (!PROPOSAL_STATUSES.includes(body.status ?? "pending")) return sendJson(response, 400, { error: "Недопустимый статус предложения." });
      const [tasks, teams] = await Promise.all([listRecords("tasks"), listRecords("teams")]);
      if (!tasks.some((task) => task.id === proposal.taskId) || !teams.some((team) => team.id === proposal.teamId)) {
        return sendJson(response, 400, { error: "Укажите существующие taskId и teamId." });
      }
      return sendJson(response, 201, { proposal: await saveRecord("proposals", proposal) });
    }
    if (request.method === "GET") return await serveStatic(request, response);
    sendJson(response, 405, { error: "Метод не поддерживается" });
  } catch (error) {
    console.error("Request failed:", error);
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
