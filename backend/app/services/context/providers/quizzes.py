from sqlalchemy.orm import Session

from app.models.quiz import Quiz
from app.models.quiz_question import QuizQuestion
from app.services.context.ranking import rank_items


def build_quizzes_context(
    db: Session,
    study_room_id: int,
    owner_id: int,
    question: str = "",
    limit: int = 3,
    candidate_limit: int = 15,
    questions_per_quiz: int = 5,
) -> str:
    """
    Build room quiz context for StudySnap AI.

    Includes saved quiz questions, correct answers, and explanations.
    Uses relevance ranking so the most useful quizzes are included first.
    """

    quizzes = (
        db.query(Quiz)
        .filter(
            Quiz.study_room_id == study_room_id,
            Quiz.owner_id == owner_id,
        )
        .order_by(Quiz.id.desc())
        .limit(candidate_limit)
        .all()
    )

    if not quizzes:
        return ""

    candidates = []

    for quiz in quizzes:
        quiz_questions = (
            db.query(QuizQuestion)
            .filter(QuizQuestion.quiz_id == quiz.id)
            .order_by(QuizQuestion.id.asc())
            .limit(questions_per_quiz)
            .all()
        )

        searchable_text = " ".join(
            [
                quiz.title or "",
                *[
                    " ".join(
                        [
                            item.question or "",
                            item.option_a or "",
                            item.option_b or "",
                            item.option_c or "",
                            item.option_d or "",
                            item.explanation or "",
                        ]
                    )
                    for item in quiz_questions
                ],
            ]
        )

        candidates.append(
            {
                "quiz": quiz,
                "questions": quiz_questions,
                "searchable_text": searchable_text,
            }
        )

    selected = rank_items(
        query=question,
        items=candidates,
        text_getter=lambda item: item["searchable_text"],
        limit=limit,
    )

    formatted_quizzes = []

    for item in selected:
        quiz = item["quiz"]
        quiz_questions = item["questions"]

        lines = [
            f"QUIZ TITLE: {(quiz.title or 'Untitled Quiz').strip()}",
        ]

        if not quiz_questions:
            lines.append("No saved questions are available for this quiz.")
        else:
            for index, quiz_question in enumerate(
                quiz_questions,
                start=1,
            ):
                lines.extend(
                    [
                        "",
                        f"QUESTION {index}: {quiz_question.question}",
                        f"A. {quiz_question.option_a}",
                        f"B. {quiz_question.option_b}",
                        f"C. {quiz_question.option_c}",
                        f"D. {quiz_question.option_d}",
                        f"CORRECT ANSWER: {quiz_question.correct_answer}",
                    ]
                )

                explanation = (
                    quiz_question.explanation or ""
                ).strip()

                if explanation:
                    lines.append(
                        f"EXPLANATION: {explanation}"
                    )

        formatted_quizzes.append("\n".join(lines))

    return "\n\n---\n\n".join(formatted_quizzes)
