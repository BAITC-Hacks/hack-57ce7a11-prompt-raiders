import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateLocalCards,
  normalizeText,
  validateAnswers,
} from "./src/generator.mjs";
import { generateAiCards, generateAiQuestions } from "./src/openai.mjs";
import { DEMO_QUESTION_INPUT } from "./src/demo-data.mjs";
import {
  generateTemplateQuestions,
  prepareQuestionInput,
  validateAiQuestionResult,
} from "./src/question-generator.mjs";

// Статические файлы проекта сейчас лежат в корне репозитория.
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

// Сервер лежит рядом с интерфейсом, поэтому наружу отдаём только публичные файлы.
// Исходники сервера, .env и содержимое .git через HTTP недоступны.
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
    const result = validateAiQuestionResult(aiResult, input);
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

// Отдельный маршрут позволяет человеку №1 подключить готовый пример до появления формы.
function handleDemoQuestions(response) {
  const input = prepareQuestionInput(DEMO_QUESTION_INPUT);
  return sendJson(response, 200, {
    input,
    result: generateTemplateQuestions(input),
    mode: "demo",
  });
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
    if (request.method === "GET" && request.url === "/api/questions/demo") return handleDemoQuestions(response);
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
