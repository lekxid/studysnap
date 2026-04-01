from backend.app.config import settings


def generate_studysnap_answer(question: str, context: str = "") -> str:
    question = question.strip()
    context = context.strip()

    if not question:
        return "Please provide a question."

    if context:
        return (
            f"StudySnap AI answer:\n\n"
            f"Question: {question}\n\n"
            f"Based on your notes/context:\n{context}\n\n"
            f"Simple explanation:\n"
            f"This topic means the system is helping you understand the main idea in a clearer way. "
            f"For this specific question, focus on the key terms, what they do, and one practical example."
        )

    return (
        f"StudySnap AI answer:\n\n"
        f"Question: {question}\n\n"
        f"Simple explanation:\n"
        f"Start by breaking the topic into small parts, define the main term, explain how it works, "
        f"and connect it to a real example."
    )


def generate_basic_flashcards(content: str) -> list[dict]:
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    text = " ".join(lines).strip()

    if not text:
        return []

    sentences = [s.strip() for s in text.replace("\n", " ").split(".") if s.strip()]
    flashcards = []

    for sentence in sentences[:5]:
        flashcards.append({
            "question": f"What does this mean: {sentence[:60]}?",
            "answer": sentence
        })

    if not flashcards:
        flashcards.append({
            "question": "What is the main idea of these notes?",
            "answer": text[:300]
        })

    return flashcards


def generate_basic_quiz(content: str) -> list[dict]:
    lines = [line.strip() for line in content.splitlines() if line.strip()]
    text = " ".join(lines).strip()

    if not text:
        return []

    sentences = [s.strip() for s in text.replace("\n", " ").split(".") if s.strip()]
    questions = []

    for sentence in sentences[:5]:
        questions.append({
            "question": f"Which statement best matches this study point?",
            "option_a": sentence,
            "option_b": "This topic is unrelated to the notes.",
            "option_c": "This means no data is processed at all.",
            "option_d": "This is only about hardware damage.",
            "correct_answer": "A",
            "explanation": sentence
        })

    if not questions:
        questions.append({
            "question": "What is the main idea of the notes?",
            "option_a": text[:80],
            "option_b": "No main idea available",
            "option_c": "Random unrelated topic",
            "option_d": "Only visual content",
            "correct_answer": "A",
            "explanation": text[:200]
        })

    return questions
