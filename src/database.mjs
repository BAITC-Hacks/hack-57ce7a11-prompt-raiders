import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const databaseFile = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "tasks.json");

export async function listTasks() {
  try {
    const records = JSON.parse(await readFile(databaseFile, "utf8"));
    return Array.isArray(records) ? records : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function saveTask(task) {
  const tasks = await listTasks();
  tasks.push(task);
  await mkdir(dirname(databaseFile), { recursive: true });
  await writeFile(databaseFile, `${JSON.stringify(tasks, null, 2)}\n`, "utf8");
  return task;
}
