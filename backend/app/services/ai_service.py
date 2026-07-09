import json
from openai import OpenAI
from app.config import settings

client = OpenAI(api_key=settings.openai_api_key, timeout=30.0)


def detect_mode(question: str):
    modes = [
        "Easy Explain",
        "Clear Explain",
        "Deep Explain",
        "Explain Simply",
        "Step-by-Step",
        "Like I’m New",
        "Make Flashcards",
        "Make Quiz",
        "Summarize Notes",
        "Test Me Now",
    ]

    for mode in modes:
        if question.startswith(mode + ":"):
            return mode, question.replace(mode + ":", "", 1).strip()

    return "Clear Explain", question.strip()


def build_studysnap_system_prompt(mode: str) -> str:
    return (
        f"You are StudySnap AI. Mode: {mode}. "
        "Be friendly, natural, clear, and student-friendly. "
        "Do not force headings for simple messages, greetings, casual questions, or short requests. "
        "For simple conversation, answer briefly like a normal helpful assistant. "
        "For study questions, explain clearly in simple words and include an example only when useful. "
        "Use headings, bullet points, steps, or practice questions only when the user asks for a lesson, quiz, flashcards, summary, or a deeper explanation. "
        "If the user asks a quick question, give a quick answer first. "
        "Avoid sounding like a worksheet unless the user specifically wants study practice."
    )


def build_studysnap_user_prompt(clean_question: str, context: str = "") -> str:
    if context.strip():
        return (
            f"User message: {clean_question}\n\n"
            f"Relevant StudySnap context or notes:\n{context}"
        )

    return f"User message: {clean_question}"


def generate_studysnap_answer(question: str, context: str = "") -> str:
    mode, clean_question = detect_mode(question)

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {
                "role": "system",
                "content": build_studysnap_system_prompt(mode),
            },
            {
                "role": "user",
                "content": build_studysnap_user_prompt(clean_question, context),
            },
        ],
        temperature=0.7,
        max_tokens=1200,
    )

    return response.choices[0].message.content or "No answer returned."


# ============================================================
# NEW: TRUE STREAMING SUPPORT
# ============================================================

def stream_studysnap_answer(question: str, context: str = ""):
    mode, clean_question = detect_mode(question)

    stream = client.chat.completions.create(
        model="gpt-4.1-mini",
        stream=True,
        messages=[
            {
                "role": "system",
                "content": build_studysnap_system_prompt(mode),
            },
            {
                "role": "user",
                "content": build_studysnap_user_prompt(clean_question, context),
            },
        ],
        temperature=0.7,
        max_tokens=1200,
    )

    for chunk in stream:
        if not chunk.choices:
            continue

        delta = chunk.choices[0].delta.content

        if delta:
            yield delta


# ============================================================
# FLASHCARD GENERATION
# ============================================================

def generate_basic_flashcards(content: str) -> list[dict]:
    if not content.strip():
        return []

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "Create 8 student-friendly flashcards from the notes. "
                    "Return ONLY valid JSON as a list of objects with "
                    "question and answer keys."
                ),
            },
            {
                "role": "user",
                "content": content,
            },
        ],
        temperature=0.3,
        max_tokens=1000,
    )

    text = response.choices[0].message.content or "[]"

    try:
        cards = json.loads(text)
        return cards[:8]

    except Exception:
        return [
            {
                "question": "What is the main idea of these notes?",
                "answer": text[:500],
            }
        ]


# ============================================================
# QUIZ GENERATION
# ============================================================

def normalize_quiz_question_item(item: dict) -> dict | None:
    question = str(item.get("question", "")).strip()
    option_a = str(item.get("option_a", "")).strip()
    option_b = str(item.get("option_b", "")).strip()
    option_c = str(item.get("option_c", "")).strip()
    option_d = str(item.get("option_d", "")).strip()
    correct_answer = str(item.get("correct_answer", "A")).strip().upper()[:1]
    explanation = str(item.get("explanation", "")).strip()

    if correct_answer not in {"A", "B", "C", "D"}:
        correct_answer = "A"

    if not question or not option_a or not option_b or not option_c or not option_d:
        return None

    options = [option_a.lower(), option_b.lower(), option_c.lower(), option_d.lower()]

    if len(set(options)) < 4:
        return None

    return {
        "question": question[:2000],
        "option_a": option_a[:1000],
        "option_b": option_b[:1000],
        "option_c": option_c[:1000],
        "option_d": option_d[:1000],
        "correct_answer": correct_answer,
        "explanation": explanation[:2000],
    }


def parse_quiz_json_response(text: str) -> list[dict]:
    raw = (text or "").strip()

    if not raw:
        return []

    try:
        data = json.loads(raw)
    except Exception:
        start = raw.find("{")
        end = raw.rfind("}")

        if start == -1 or end == -1 or end <= start:
            return []

        try:
            data = json.loads(raw[start:end + 1])
        except Exception:
            return []

    if isinstance(data, dict):
        questions = data.get("questions", [])
    elif isinstance(data, list):
        questions = data
    else:
        questions = []

    cleaned_questions = []

    for item in questions:
        if not isinstance(item, dict):
            continue

        normalized = normalize_quiz_question_item(item)

        if normalized:
            cleaned_questions.append(normalized)

    return cleaned_questions[:5]


def build_fallback_quiz_questions(content: str) -> list[dict]:
    text = " ".join(
        line.strip()
        for line in (content or "").splitlines()
        if line.strip()
    ).strip()

    if not text:
        return []

    sentences = [
        sentence.strip()
        for sentence in text.replace("?", ".").replace("!", ".").split(".")
        if len(sentence.strip()) > 45
    ]

    questions = []

    for index, sentence in enumerate(sentences[:5], start=1):
        main_point = sentence[:220].strip()

        questions.append(
            {
                "question": f"What is the best summary of key point {index} from this study material?",
                "option_a": main_point,
                "option_b": "The material says this idea is not connected to the lesson.",
                "option_c": "The material says this idea should always be ignored.",
                "option_d": "The material says this idea only applies outside school.",
                "correct_answer": "A",
                "explanation": f"The correct answer matches the study material: {main_point[:260]}",
            }
        )

    return questions


def generate_basic_quiz(content: str) -> list[dict]:
    text = " ".join(
        line.strip()
        for line in (content or "").splitlines()
        if line.strip()
    ).strip()

    if not text:
        return []

    limited_text = text[:12000]

    try:
        response = client.chat.completions.create(
            model="gpt-4.1-mini",
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You create high-quality student quiz questions from study notes. "
                        "Return ONLY valid JSON in this exact shape: "
                        "{\"questions\":[{\"question\":\"...\","
                        "\"option_a\":\"...\",\"option_b\":\"...\","
                        "\"option_c\":\"...\",\"option_d\":\"...\","
                        "\"correct_answer\":\"A\",\"explanation\":\"...\"}]}. "
                        "Create 5 exam-style multiple-choice questions. "
                        "Each question must test understanding, not just copy a sentence. "
                        "All four options must be realistic. "
                        "Only one option should be correct. "
                        "Wrong options must be believable but clearly incorrect. "
                        "Use simple student-friendly language. "
                        "Do not make up facts that are not supported by the notes."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        "Create quiz questions from these study notes:\n\n"
                        f"{limited_text}"
                    ),
                },
            ],
            temperature=0.25,
            max_tokens=1800,
        )

        generated_text = response.choices[0].message.content or ""
        questions = parse_quiz_json_response(generated_text)

        if questions:
            return questions

    except Exception:
        pass

    return build_fallback_quiz_questions(limited_text)

