from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.study_material import StudyMaterial
from app.services.context.ranking import rank_items


def clean_value(value: object | None) -> str:
    return " ".join(
        str(value or "").split()
    ).strip()


def has_semantic_context(
    material: StudyMaterial,
) -> bool:
    return any(
        clean_value(value)
        for value in (
            material.extracted_text,
            material.intelligence_summary,
            material.detected_topic,
            material.content_category,
            material.purpose_category,
        )
    )


def searchable_material_text(
    material: StudyMaterial,
) -> str:
    return " ".join(
        filter(
            None,
            [
                clean_value(
                    material.original_filename
                ),
                clean_value(material.material_type),
                clean_value(
                    material.purpose_category
                ),
                clean_value(
                    material.content_category
                ),
                clean_value(
                    material.detected_topic
                ),
                clean_value(
                    material.intelligence_summary
                ),
                clean_value(
                    material.extracted_text
                ),
            ],
        )
    )


def build_materials_context(
    db: Session,
    study_room_id: int,
    owner_id: int,
    question: str = "",
    focused_material_id: int | None = None,
    limit: int = 4,
    candidate_limit: int = 30,
    content_limit: int = 3000,
) -> str:
    """
    Build safe universal-material context for StudySnap AI.

    A selected material is placed first. Images can be understood
    through their stored vision analysis even when they contain no
    readable OCR text.
    """

    materials = (
        db.query(StudyMaterial)
        .filter(
            StudyMaterial.study_room_id
            == study_room_id,
            StudyMaterial.owner_id == owner_id,
            StudyMaterial.material_type
            != "quarantined",
        )
        .order_by(StudyMaterial.id.desc())
        .limit(candidate_limit)
        .all()
    )

    semantic_materials = [
        material
        for material in materials
        if has_semantic_context(material)
    ]

    focused_material = None

    if focused_material_id is not None:
        focused_material = next(
            (
                material
                for material in materials
                if material.id
                == focused_material_id
            ),
            None,
        )

        if focused_material is None:
            focused_material = (
                db.query(StudyMaterial)
                .filter(
                    StudyMaterial.id
                    == focused_material_id,
                    StudyMaterial.study_room_id
                    == study_room_id,
                    StudyMaterial.owner_id
                    == owner_id,
                    StudyMaterial.material_type
                    != "quarantined",
                )
                .first()
            )

    if (
        not semantic_materials
        and focused_material is None
    ):
        return ""

    ranked_materials = rank_items(
        query=question,
        items=semantic_materials,
        text_getter=searchable_material_text,
        limit=limit,
    )

    selected_materials: list[
        StudyMaterial
    ] = []

    if focused_material is not None:
        selected_materials.append(
            focused_material
        )

    for material in ranked_materials:
        if any(
            existing.id == material.id
            for existing in selected_materials
        ):
            continue

        selected_materials.append(material)

        if len(selected_materials) >= limit:
            break

    formatted_materials: list[str] = []

    for material in selected_materials:
        filename = (
            clean_value(
                material.original_filename
            )
            or "Untitled material"
        )

        material_type = (
            clean_value(material.material_type)
            or "file"
        )

        purpose = clean_value(
            material.purpose_category
        )

        category = clean_value(
            material.content_category
        )

        topic = clean_value(
            material.detected_topic
        )

        summary = clean_value(
            material.intelligence_summary
        )

        extracted_text = clean_value(
            material.extracted_text
        )

        if len(extracted_text) > content_limit:
            extracted_text = (
                extracted_text[
                    :content_limit
                ].rstrip()
                + "..."
            )

        focus_label = (
            "PRIMARY SELECTED MATERIAL"
            if focused_material_id
            == material.id
            else "ROOM MATERIAL"
        )

        lines = [
            focus_label,
            f"MATERIAL ID: {material.id}",
            f"FILE: {filename}",
            f"TYPE: {material_type}",
        ]

        if purpose:
            lines.append(
                f"PURPOSE: {purpose}"
            )

        if category:
            lines.append(
                f"CATEGORY: {category}"
            )

        if topic:
            lines.append(f"TOPIC: {topic}")

        if summary:
            lines.append(
                "STORED IMAGE/DOCUMENT ANALYSIS:\n"
                + summary
            )

        if extracted_text:
            lines.append(
                "READABLE OR EXTRACTED TEXT:\n"
                + extracted_text
            )

        if (
            not summary
            and not extracted_text
        ):
            lines.append(
                "No detailed content analysis is available."
            )

        formatted_materials.append(
            "\n".join(lines)
        )

    return "\n\n---\n\n".join(
        formatted_materials
    )
