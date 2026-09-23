import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_QUESTION_INPUT } from "../src/demo-data.mjs";
import {
  generateTemplateQuestions,
  prepareQuestionInput,
  validateAiQuestionResult,
} from "../src/question-generator.mjs";

test("демо-вход создаёт от трёх до пяти вопросов только по известным полям", () => {
  const input = prepareQuestionInput(DEMO_QUESTION_INPUT);
  const result = generateTemplateQuestions(input);

  assert.ok(result.questions.length >= 3 && result.questions.length <= 5);
  assert.ok(result.questions.every((item) => input.fieldsToCheck.includes(item.targetField)));
  assert.ok(result.missingFields.some((item) => item.field === "users"));
  assert.ok(!result.missingFields.some((item) => item.field === "context"));
});

test("локальный генератор не добавляет факты, которых не было во входе", () => {
  const result = generateTemplateQuestions(DEMO_QUESTION_INPUT);
  const inputText = JSON.stringify(DEMO_QUESTION_INPUT);

  assert.ok(result.extractedFacts.every((fact) => inputText.includes(fact.evidence)));
});

test("валидатор отклоняет AI-факт без подтверждающей цитаты", () => {
  const unsafeResult = {
    missingFields: [{ field: "users" }],
    questions: [
      { targetField: "users", question: "Кто будет пользоваться решением?" },
      { targetField: "data", question: "Какие данные доступны?" },
      { targetField: "successCriteria", question: "Как измерить успех?" },
    ],
    extractedFacts: [
      {
        field: "users",
        value: "Молодые покупатели",
        source: "description",
        evidence: "Молодые покупатели",
      },
    ],
  };

  assert.throws(
    () => validateAiQuestionResult(unsafeResult, DEMO_QUESTION_INPUT),
    /без подтверждения/u,
  );
});
