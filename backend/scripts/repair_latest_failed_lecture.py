from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import or_

from app.config import settings
from app.database import SessionLocal
from app.models.study_material import StudyMaterial
from app.services.lecture_transcription import (
    LectureTranscriptionError,
    transcribe_lecture_audio,
)


def main() -> int:
    db = SessionLocal()

    try:
        material = (
            db.query(StudyMaterial)
            .filter(StudyMaterial.material_type.in_(["audio", "video"]))
            .filter(
                or_(
                    StudyMaterial.purpose_category == "lecture",
                    StudyMaterial.content_category == "lecture_recording",
                )
            )
            .filter(StudyMaterial.intelligence_status == "failed")
            .order_by(StudyMaterial.created_at.desc(), StudyMaterial.id.desc())
            .first()
        )

        if material is None:
            print("NO_FAILED_LECTURE")
            return 0

        if not settings.openai_api_key.strip():
            print("TRANSCRIPTION_NOT_CONFIGURED")
            return 3

        model = os.getenv(
            "STUDYSNAP_TRANSCRIPTION_MODEL",
            "gpt-4o-mini-transcribe",
        ).strip() or "gpt-4o-mini-transcribe"
        language = os.getenv("STUDYSNAP_TRANSCRIPTION_LANGUAGE", "").strip() or None

        print(f"RETRYING_LECTURE_ID={material.id}")

        try:
            result = transcribe_lecture_audio(
                file_path=Path(material.file_path),
                original_filename=material.original_filename,
                content_type=material.content_type,
                api_key=settings.openai_api_key,
                configured_model=model,
                language=language,
            )
        except LectureTranscriptionError as error:
            material.intelligence_status = "failed"
            material.intelligence_error = error.user_message[:1000]
            db.add(material)
            db.commit()
            print(f"TRANSCRIPTION_FAILED_REASON={error.reason}")
            print(f"TRANSCRIPTION_FAILED_MESSAGE={error.user_message}")
            return 4

        material.extracted_text = result.text[:500_000]
        material.intelligence_status = "ready"
        material.intelligence_error = None
        material.purpose_category = "lecture"
        material.content_category = "lecture_recording"
        material.analyzed_at = datetime.now(timezone.utc)
        db.add(material)
        db.commit()

        print(f"TRANSCRIPTION_READY_ID={material.id}")
        print(f"TRANSCRIPTION_MODEL={result.model}")
        print(f"NORMALIZED_AUDIO={str(result.normalized_audio).lower()}")
        print(f"TRANSCRIPT_CHARACTERS={len(result.text)}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
