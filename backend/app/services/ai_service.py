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

def generate_basic_quiz(content: str) -> list[dict]:
    lines = [
        line.strip()
        for line in content.splitlines()
        if line.strip()
    ]

    text = " ".join(lines).strip()

    if not text:
        return []

    sentences = [
        s.strip()
        for s in text.replace("\n", " ").split(".")
        if s.strip()
    ]

    questions = []

    for sentence in sentences[:5]:
        questions.append(
            {
                "question": "Which option best explains this study point?",
                "option_a": sentence[:180],
                "option_b": "This is unrelated to the topic.",
                "option_c": "This means the topic is not important.",
                "option_d": "This is only used outside school.",
                "correct_answer": "A",
                "explanation": sentence[:300],
            }
        )

    return questions