"""Ask a business owner three questions and save each response as JSON."""

import json
from datetime import datetime, timezone
from pathlib import Path


QUESTIONS = [
    "Как вас зовут и чем занимается ваш бизнес?",
    "Какая главная проблема или задача сейчас стоит перед бизнесом?",
    "Какого результата вы хотите достичь в ближайшее время?",
]

ANSWERS_FILE = Path(__file__).with_name("answers.json")


def main() -> None:
    print("Ответьте, пожалуйста, на три вопроса. Ваши ответы будут сохранены.\n")
    answers = []
    for number, question in enumerate(QUESTIONS, start=1):
        response = input(f"{number}. {question}\n> ").strip()
        while not response:
            print("Ответ не может быть пустым. Попробуйте ещё раз.")
            response = input("> ").strip()
        answers.append({"question": question, "answer": response})

    record = {
        "saved_at": datetime.now(timezone.utc).isoformat(),
        "answers": answers,
    }

    # Keep earlier sessions too: each run adds a new record to the JSON file.
    if ANSWERS_FILE.exists():
        try:
            records = json.loads(ANSWERS_FILE.read_text(encoding="utf-8"))
            if not isinstance(records, list):
                records = []
        except (json.JSONDecodeError, OSError):
            records = []
    else:
        records = []

    records.append(record)
    ANSWERS_FILE.write_text(
        json.dumps(records, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"\nСпасибо! Ответы сохранены в файле {ANSWERS_FILE.name}.")


if __name__ == "__main__":
    main()
