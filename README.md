# hack-57ce7a11-prompt-raiders
Hackathon team repository for Prompt Raiders

## Модель задачи

Сейчас реализована только модель задачи. Записи хранятся в `data/tasks.json` (файл создаётся при первой записи). Поля: `id`, `businessId`, `status`, `title`, `topic`, `originalDescription`, `context`, `need`, `users`, `data`, `constraints`, `expectedResult`, `successCriteria`, `contact`, `interactionFormat`, `score`, `readinessLevel`, `missingFields`, `createdAt`, `updatedAt`.

`GET /api/tasks` возвращает задачи, `POST /api/tasks` создаёт задачу. Для создания обязательны `businessId` и `title`. `businessId` хранится как ссылка-идентификатор, отдельная модель бизнеса пока не реализована. Статусы: `draft`, `confirmed`, `published`; уровни готовности: `draft`, `in_progress`, `ready`, `priority`; оценка ограничивается диапазоном 0–100.
