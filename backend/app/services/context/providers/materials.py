from sqlalchemy.orm import Session

from app.models.study_material import StudyMaterial
from app.services.context.ranking import rank_items


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

    Only files with extracted text are included. Quarantined files are
    deliberately excluded and are never treated as AI-readable context.
    """

    materials = (
        db.query(StudyMaterial)
        .filter(
            StudyMaterial.study_room_id == study_room_id,
            StudyMaterial.owner_id == owner_id,
            StudyMaterial.material_type != "quarantined",
            StudyMaterial.extracted_text.isnot(None),
        )
        .order_by(StudyMaterial.id.desc())
        .limit(candidate_limit)
        .all()
    )

    readable_materials = [
        material
        for material in materials
        if (material.extracted_text or "").strip()
    ]

    if not readable_materials:
        return ""

    focused_material = None

    if focused_material_id is not None:
        focused_material = next(
            (
                material
                for material in readable_materials
                if material.id == focused_material_id
            ),
            None,
        )

        if focused_material is None:
            focused_material = (
                db.query(StudyMaterial)
                .filter(
                    StudyMaterial.id == focused_material_id,
                    StudyMaterial.study_room_id == study_room_id,
                    StudyMaterial.owner_id == owner_id,
                    StudyMaterial.material_type != "quarantined",
                    StudyMaterial.extracted_text.isnot(None),
                )
                .first()
            )

            if focused_material and not (
                focused_material.extracted_text or ""
            ).strip():
                focused_material = None

    ranked_materials = rank_items(
        query=question,
        items=readable_materials,
        text_getter=lambda material: " ".join(
            [
                material.original_filename or "",
                material.material_type or "",
                material.extracted_text or "",
            ]
        ),
        limit=limit,
    )

    selected_materials = []

    if focused_material is not None:
        selected_materials.append(focused_material)

    for material in ranked_materials:
        if any(
            existing.id == material.id
            for existing in selected_materials
        ):
            continue

        selected_materials.append(material)

        if len(selected_materials) >= limit:
            break

    formatted_materials = []

    for material in selected_materials:
        filename = (
            material.original_filename
            or "Untitled material"
        ).strip()

        material_type = (
            material.material_type
            or "file"
        ).strip()

        extracted_text = (
            material.extracted_text
            or ""
        ).strip()

        if not extracted_text:
            continue

        if len(extracted_text) > content_limit:
            extracted_text = (
                extracted_text[:content_limit].rstrip()
                + "..."
            )

        focus_label = (
            "PRIMARY SELECTED MATERIAL"
            if focused_material_id == material.id
            else "ROOM MATERIAL"
        )

        formatted_materials.append(
            f"{focus_label}\n"
            f"FILE: {filename}\n"
            f"TYPE: {material_type}\n"
            f"CONTENT:\n{extracted_text}"
        )

    return "\n\n---\n\n".join(
        formatted_materials
    )
