// Шаблонный запрос нужен, пока форма человека №1 и база человека №2 ещё не готовы.
// Его можно отправить в тот же генератор, который позже будет принимать реальные данные.
export const DEMO_QUESTION_INPUT = {
  description: "Хотим улучшить обслуживание клиентов в наших розничных магазинах.",
  industry: "Розничная торговля",

  // Здесь лежат поля, которые бизнес уже сообщил до обращения к AI.
  // Пустые значения специально оставлены, чтобы генератор нашёл пробелы.
  knownFields: {
    context: "Покупатели иногда долго ждут помощи консультанта в магазине.",
    need: "Сделать получение консультации быстрее и удобнее.",
    users: "",
    data: "",
    constraints: "",
    expectedResult: "",
    successCriteria: "",
    contact: "",
    interactionFormat: "",
  },

  // Этот список является договором между интерфейсом, AI и будущей базой данных.
  fieldsToCheck: [
    "context",
    "need",
    "users",
    "data",
    "constraints",
    "expectedResult",
    "successCriteria",
    "contact",
    "interactionFormat",
  ],
};

// Шаблон для AI-операции 2 повторяет реальный обмен данными:
// операция 1 вернула вопросы с id и targetField, пользователь дал ответы.
export const DEMO_CARD_INPUT = {
  ...DEMO_QUESTION_INPUT,
  questions: [
    {
      id: "question-1",
      targetField: "users",
      question: "Кто будет пользоваться решением и в какой ситуации?",
    },
    {
      id: "question-2",
      targetField: "expectedResult",
      question: "Какой конкретный результат должна представить команда?",
    },
    {
      id: "question-3",
      targetField: "successCriteria",
      question: "По каким измеримым признакам вы поймёте, что задача решена успешно?",
    },
  ],
  answers: [
    {
      questionId: "question-1",
      answer: "Покупатели магазина, которым нужна консультация по выбору товара.",
    },
    {
      questionId: "question-2",
      answer: "Работающий веб-прототип для запроса консультации и просмотра статуса обращения.",
    },
    {
      questionId: "question-3",
      answer: "Среднее время ожидания консультации должно сократиться минимум на 20 процентов.",
    },
  ],
};
