import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dataDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const files = {
  tasks: join(dataDirectory, "tasks.json"),
  questions: join(dataDirectory, "clarifying-questions.json"),
  teams: join(dataDirectory, "teams.json"),
  proposals: join(dataDirectory, "proposals.json"),
  ratings: join(dataDirectory, "ratings.json"),
};

export async function listRecords(collection) {
  const file = files[collection];
  if (!file) throw new Error("Неизвестная коллекция");
  try {
    const records = JSON.parse(await readFile(file, "utf8"));
    return Array.isArray(records) ? records : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function listTasks() {
  return listRecords("tasks");
}

export async function findTaskById(id) {
  return (await listTasks()).find((task) => task.id === id) ?? null;
}

export async function saveTask(task) {
  return saveRecord("tasks", task);
}

export async function updateTask(id, updates) {
  return updateRecord("tasks", id, updates);
}

export async function deleteTask(id) {
  const file = files.tasks;
  const tasks = await listTasks();
  const remaining = tasks.filter((task) => task.id !== id);
  if (remaining.length === tasks.length) return false;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(remaining, null, 2)}\n`, "utf8");
  return true;
}

export async function saveRecord(collection, record) {
  const file = files[collection];
  if (!file) throw new Error("Неизвестная коллекция");
  const records = await listRecords(collection);
  records.push(record);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  return record;
}

export async function updateRecord(collection, id, updates) {
  const file = files[collection];
  if (!file) throw new Error("Неизвестная коллекция");
  const records = await listRecords(collection);
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) return null;
  records[index] = { ...records[index], ...updates };
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  return records[index];
}
