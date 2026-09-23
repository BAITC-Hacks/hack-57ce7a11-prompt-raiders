import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

// AI-операция 1 задаёт уточняющие вопросы, операция 2 формирует карточку,
// а оценка качества использует ту же OpenAI-интеграцию с отдельной схемой.
import {
  generateAiQuestions,
  generateAiTaskCard,
  generateAiTaskRating,
} from "./src/openai.mjs";
import { DEMO_CARD_INPUT, DEMO_QUESTION_INPUT } from "./src/demo-data.mjs";
import {
  generateTemplateQuestions,
  normalizeText,
  prepareQuestionInput,
  validateAiQuestionResult,
} from "./src/question-generator.mjs";
import {
  generateTemplateCard,
  prepareCardInput,
  validateAiCardResult,
} from "./src/card-generator.mjs";

// Универсальный слой хранения поддерживает все коллекции второго участника.
import { listRecords, saveRecord, updateRecord } from "./src/database.mjs";
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
import {
  normalizeRubricScores,
  readinessForScore,
  scoreTaskCompleteness,
  totalRubricScore,
  TASK_SCORE_RUBRIC,
} from "./src/scoring.mjs";

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

// Из корня репозитория наружу разрешено отдавать только файлы интерфейса.
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

// AI-операция 1: анализирует черновик и возвращает 3–5 вопросов.
async function handleQuestions(request, response) {
  const body = await readJson(request);
  const input = prepareQuestionInput(body);

  if (!apiKey) {
    return sendJson(response, 200, {
      ...generateTemplateQuestions(input),
      mode: "demo",
      notice: "OPENAI_API_KEY не задан — использованы безопасные шаблонные вопросы.",
    });
  }

  try {
    const aiResult = await generateAiQuestions({ apiKey, model, input });
    const result = validateAiQuestionResult(aiResult, body);
    return sendJson(response, 200, { ...result, mode: "ai" });
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
  return sendJson(response, 200, {
    input: DEMO_QUESTION_INPUT,
    result: generateTemplateQuestions(DEMO_QUESTION_INPUT),
    mode: "demo",
  });
}

// AI-операция 2: собирает одну редактируемую карточку из описания и ответов.
async function handleCard(request, response) {
  const body = await readJson(request);
  const input = prepareCardInput(body);

  if (!apiKey) {
    return sendJson(response, 200, {
      ...generateTemplateCard(body),
      mode: "demo",
      notice: "OPENAI_API_KEY не задан — карточка собрана безопасным локальным генератором.",
    });
  }

  try {
    const aiResult = await generateAiTaskCard({ apiKey, model, input });
    const result = validateAiCardResult(aiResult, body);
    return sendJson(response, 200, { ...result, mode: "ai" });
  } catch (error) {
    console.error("Task card generation failed:", error.message);
    return sendJson(response, 200, {
      ...generateTemplateCard(body),
      mode: "fallback",
      notice: "ИИ временно недоступен или вернул неподтверждённые данные — использована локальная карточка.",
    });
  }
}

function handleDemoCard(response) {
  return sendJson(response, 200, {
    input: DEMO_CARD_INPUT,
    result: generateTemplateCard(DEMO_CARD_INPUT),
    mode: "demo",
  });
}

// Рейтинг хранится отдельно, а рассчитанные итоговые поля также записываются в задачу.
async function handleTaskRating(request, response) {
  const body = await readJson(request);
  const taskId = normalizeText(body.taskId, 80);
  const tasks = await listRecords("tasks");
  const task = tasks.find((item) => item.id === taskId);

  if (!task) return sendJson(response, 404, { error: "Задача не найдена." });

  let source = "ai";
  let evaluation;

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

  // Даже AI-оценка ограничивается максимальными баллами рубрики.
  const scores = normalizeRubricScores(evaluation?.scores ?? scoreTaskCompleteness(task));
  const total = totalRubricScore(scores);
  const scoredFields = new Set(TASK_SCORE_RUBRIC.map(({ field }) => field));
  const missingFields = Array.isArray(evaluation?.missingFields)
    ? [...new Set(evaluation.missingFields.filter((field) => scoredFields.has(field)))]
    : TASK_SCORE_RUBRIC
        .filter(({ field }) => !normalizeText(task[field]))
        .map(({ field }) => field);
  const recommendations = Array.isArray(evaluation?.recommendations)
    ? evaluation.recommendations
        .map((item) => normalizeText(item, 500))
        .filter(Boolean)
        .slice(0, 20)
    : missingFields.map((field) => {
        const rubricItem = TASK_SCORE_RUBRIC.find((item) => item.field === field);
        return `Заполните поле «${rubricItem.label}».`;
      });

  const rating = createRating({
    taskId,
    total,
    level: readinessForScore(total),
    scores,
    missingFields,
    recommendations,
    source,
  });

  await saveRecord("ratings", rating);
  await updateRecord("tasks", taskId, {
    score: total,
    readinessLevel: rating.level,
    missingFields,
    updatedAt: new Date().toISOString(),
  });

  return sendJson(response, 200, { rating, mode: source, maximum: 100 });
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
    // Коллекции имеют одинаковый GET-контракт, поэтому обслуживаются одной веткой.
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

    if (request.method === "GET" && request.url === "/api/questions/demo") {
      return handleDemoQuestions(response);
    }
    if (request.method === "GET" && request.url === "/api/cards/demo") {
      return handleDemoCard(response);
    }
    if (request.method === "POST" && request.url === "/api/questions") {
      return await handleQuestions(request, response);
    }
    if (request.method === "POST" && request.url === "/api/cards") {
      return await handleCard(request, response);
    }
    if (request.method === "POST" && request.url === "/api/ratings/evaluate") {
      return await handleTaskRating(request, response);
    }

    if (request.method === "POST" && request.url === "/api/tasks") {
      const body = await readJson(request);
      const task = createTask(body);
      if (!task.businessId || !task.title) {
        return sendJson(response, 400, { error: "Укажите businessId и название задачи." });
      }
      if (!TASK_STATUSES.includes(body.status ?? "draft")) {
        return sendJson(response, 400, { error: "Статус должен быть draft, confirmed или published." });
      }
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
      const tasks = await listRecords("tasks");
      if (!tasks.some((task) => task.id === question.taskId)) {
        return sendJson(response, 400, { error: "Задача не найдена." });
      }
      return sendJson(response, 201, {
        question: await saveRecord("questions", question),
      });
    }

    if (request.method === "POST" && request.url === "/api/teams") {
      const team = createTeam(await readJson(request));
      if (!team.name) return sendJson(response, 400, { error: "Укажите название команды." });
      return sendJson(response, 201, { team: await saveRecord("teams", team) });
    }

    if (request.method === "POST" && request.url === "/api/proposals") {
      const body = await readJson(request);
      const proposal = createProposal(body);
      if (!proposal.idea || !proposal.plan) {
        return sendJson(response, 400, { error: "Укажите idea и plan." });
      }
      if (!PROPOSAL_STATUSES.includes(body.status ?? "pending")) {
        return sendJson(response, 400, { error: "Недопустимый статус предложения." });
      }

      const [tasks, teams] = await Promise.all([
        listRecords("tasks"),
        listRecords("teams"),
      ]);
      const taskExists = tasks.some((task) => task.id === proposal.taskId);
      const teamExists = teams.some((team) => team.id === proposal.teamId);
      if (!taskExists || !teamExists) {
        return sendJson(response, 400, {
          error: "Укажите существующие taskId и teamId.",
        });
      }

      return sendJson(response, 201, {
        proposal: await saveRecord("proposals", proposal),
      });
    }

    if (request.method === "GET") return await serveStatic(request, response);
    return sendJson(response, 405, { error: "Метод не поддерживается" });
  } catch (error) {
    console.error("Request failed:", error);
    const isBadRequest = /JSON|большой|описан|вопрос|ответ|карточк|идентификатор|коллекц/u
      .test(error.message);
    return sendJson(response, isBadRequest ? 400 : 500, {
      error: isBadRequest ? error.message : "Внутренняя ошибка сервера",
    });
  }
});

if (process.env.NODE_ENV !== "test") {
  server.listen(port, () => {
    console.log(`Hackathon Cards: http://localhost:${port}`);
    console.log(apiKey ? `AI mode (${model})` : "Demo mode (set OPENAI_API_KEY to enable AI)");
  });
}

export { server };
