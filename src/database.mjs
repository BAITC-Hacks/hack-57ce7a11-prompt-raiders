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

export async function saveRecord(collection, record) {
  const file = files[collection];
  if (!file) throw new Error("Неизвестная коллекция");
  const records = await listRecords(collection);
  records.push(record);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  return record;
}
