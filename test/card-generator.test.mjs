import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_CARD_INPUT } from "../src/demo-data.mjs";
import {
  generateTemplateCard,
  prepareCardInput,
  validateAiCardResult,
} from "../src/card-generator.mjs";

test("операция 2 формирует карточку из описания и трёх ответов", () => {
  const result = generateTemplateCard(DEMO_CARD_INPUT);

  assert.equal(result.card.originalDescription, DEMO_CARD_INPUT.description);
  assert.equal(result.card.topic, DEMO_CARD_INPUT.industry);
  assert.match(result.card.users, /Покупатели магазина/u);
  assert.match(result.card.expectedResult, /веб-прототип/u);
  assert.match(result.card.successCriteria, /20 процентов/u);
});

test("локальный генератор сохраняет известные поля и добавляет уточнение", () => {
  const input = structuredClone(DEMO_CARD_INPUT);
  input.knownFields.users = "Покупатели розничных магазинов.";

  const result = generateTemplateCard(input);

  assert.match(result.card.users, /Покупатели розничных магазинов/u);
  assert.match(result.card.users, /нужна консультация/u);
});

test("для формирования карточки требуется минимум три ответа", () => {
  const input = structuredClone(DEMO_CARD_INPUT);
  input.answers = input.answers.slice(0, 2);

  assert.throws(() => prepareCardInput(input), /минимум 3/u);
});

test("валидатор принимает карточку, основанную на подтверждённых источниках", () => {
  const groundedResult = generateTemplateCard(DEMO_CARD_INPUT);
  const result = validateAiCardResult(groundedResult, DEMO_CARD_INPUT);

  assert.equal(result.card.title, groundedResult.card.title);
  assert.deepEqual(result.missingFields, groundedResult.missingFields);
});

test("валидатор отклоняет источник, которого нет в ответах пользователя", () => {
  const unsafeResult = generateTemplateCard(DEMO_CARD_INPUT);
  unsafeResult.fieldSources[0].evidence = "Выдуманный факт";

  assert.throws(
    () => validateAiCardResult(unsafeResult, DEMO_CARD_INPUT),
    /факт, которого нет/u,
  );
});
