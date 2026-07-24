from __future__ import annotations

import io
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models
from app.config import settings
from app.database import Base, get_db
from app.routes import smart_scan as scan_module
from app.routes.smart_scan import router
from app.utils.deps import get_current_user


engine = create_engine(
    "sqlite://",
    connect_args={
        "check_same_thread": False,
    },
    poolclass=StaticPool,
)

TestingSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

current_user_state = {
    "id": 101,
}


def override_get_db():
    db = TestingSessionLocal()

    try:
        yield db
    finally:
        db.close()


def override_get_current_user():
    return SimpleNamespace(
        id=current_user_state["id"],
    )


api_app = FastAPI()

api_app.include_router(
    router,
    prefix="/api/smart-scan",
)

api_app.dependency_overrides[
    get_db
] = override_get_db

api_app.dependency_overrides[
    get_current_user
] = override_get_current_user

client = TestClient(api_app)


def image_bytes(
    width: int = 320,
    height: int = 420,
) -> bytes:
    output = io.BytesIO()

    Image.new(
        "RGB",
        (width, height),
        "white",
    ).save(
        output,
        format="PNG",
    )

    return output.getvalue()


@pytest.fixture(autouse=True)
def reset_scan_database(
    tmp_path,
    monkeypatch,
):
    Base.metadata.drop_all(
        bind=engine
    )

    Base.metadata.create_all(
        bind=engine
    )

    current_user_state["id"] = 101
    settings.smart_scan_enabled = True

    scan_root = (
        tmp_path
        / "smart-scans"
    )

    scan_root.mkdir(
        parents=True,
        exist_ok=True,
    )

    monkeypatch.setattr(
        scan_module,
        "SMART_SCAN_ROOT",
        scan_root,
    )

    monkeypatch.setattr(
        scan_module,
        "extract_scan_page_text",
        lambda *_args, **_kwargs: (
            "Recognized StudySnap page text.",
            94,
            "ready",
            None,
        ),
    )

    yield

    Base.metadata.drop_all(
        bind=engine
    )


def create_scan(
    title: str = "Networking Notes",
):
    response = client.post(
        "/api/smart-scan",
        json={
            "title": title,
        },
    )

    assert response.status_code == 201

    return response.json()


def upload_pages(
    scan_id: int,
    count: int,
):
    files = [
        (
            "files",
            (
                f"page-{number}.png",
                image_bytes(),
                "image/png",
            ),
        )
        for number in range(
            1,
            count + 1,
        )
    ]

    return client.post(
        (
            "/api/smart-scan/"
            f"{scan_id}/pages"
        ),
        files=files,
    )


def recognize_pages(
    scan_id: int,
    page_ids: list[int] | None = None,
):
    payload = (
        {
            "page_ids": page_ids,
        }
        if page_ids is not None
        else {}
    )

    return client.post(
        (
            "/api/smart-scan/"
            f"{scan_id}/recognize"
        ),
        json=payload,
    )


def recognize_all_pages(
    scan_id: int,
):
    while True:
        response = recognize_pages(
            scan_id
        )

        assert response.status_code == 200

        result = response.json()

        if result["remaining_count"] == 0:
            return result["scan"]


def test_create_upload_recognize_and_read_scan():
    scan = create_scan()

    response = upload_pages(
        scan["id"],
        2,
    )

    assert response.status_code == 201

    uploaded = response.json()

    assert uploaded["page_count"] == 2
    assert uploaded["status"] == (
        "processing"
    )

    assert [
        page["ocr_status"]
        for page in uploaded["pages"]
    ] == [
        "pending",
        "pending",
    ]

    recognized = recognize_all_pages(
        scan["id"]
    )

    assert recognized["status"] == "ready"
    assert len(recognized["pages"]) == 2

    assert (
        "Recognized StudySnap page text."
        in recognized["extracted_text"]
    )

    response = client.get(
        f"/api/smart-scan/{scan['id']}"
    )

    assert response.status_code == 200
    assert response.json()["title"] == (
        "Networking Notes"
    )


def test_recognition_runs_in_small_batches():
    scan = create_scan()

    uploaded = upload_pages(
        scan["id"],
        4,
    ).json()

    assert uploaded["page_count"] == 4

    first = recognize_pages(
        scan["id"]
    )

    assert first.status_code == 200

    first_result = first.json()

    assert (
        first_result["processed_count"]
        == 3
    )

    assert (
        first_result["remaining_count"]
        == 1
    )

    assert (
        first_result["scan"]["status"]
        == "processing"
    )

    second = recognize_pages(
        scan["id"]
    )

    assert second.status_code == 200

    second_result = second.json()

    assert (
        second_result["processed_count"]
        == 1
    )

    assert (
        second_result["remaining_count"]
        == 0
    )

    assert (
        second_result["scan"]["status"]
        == "ready"
    )


def test_terminal_ocr_failure_stops_automatic_loop(
    monkeypatch,
):
    scan = create_scan()

    uploaded = upload_pages(
        scan["id"],
        1,
    ).json()

    page_id = uploaded["pages"][0]["id"]

    monkeypatch.setattr(
        scan_module,
        "extract_scan_page_text",
        lambda *_args, **_kwargs: (
            "",
            0,
            "failed",
            (
                "StudySnap could not "
                "recognize this page."
            ),
        ),
    )

    first = recognize_pages(
        scan["id"]
    )

    assert first.status_code == 200

    first_result = first.json()

    assert (
        first_result["processed_count"]
        == 1
    )

    assert (
        first_result["remaining_count"]
        == 0
    )

    assert (
        first_result["scan"]["status"]
        == "needs_review"
    )

    assert (
        first_result["scan"]["pages"][0][
            "ocr_status"
        ]
        == "failed"
    )

    second = recognize_pages(
        scan["id"]
    )

    assert second.status_code == 200

    second_result = second.json()

    assert (
        second_result["processed_count"]
        == 0
    )

    assert (
        second_result["remaining_count"]
        == 0
    )

    monkeypatch.setattr(
        scan_module,
        "extract_scan_page_text",
        lambda *_args, **_kwargs: (
            "Recovered page text.",
            91,
            "ready",
            None,
        ),
    )

    manual_retry = recognize_pages(
        scan["id"],
        [page_id],
    )

    assert manual_retry.status_code == 200

    retry_result = manual_retry.json()

    assert (
        retry_result["processed_count"]
        == 1
    )

    assert (
        retry_result["remaining_count"]
        == 0
    )

    assert (
        retry_result["scan"]["status"]
        == "ready"
    )

    assert (
        retry_result["scan"]["pages"][0][
            "extracted_text"
        ]
        == "Recovered page text."
    )


def test_scan_rejects_more_than_fifty_pages():
    scan = create_scan()

    response = upload_pages(
        scan["id"],
        51,
    )

    assert response.status_code == 400
    assert "up to 50 pages" in (
        response.json()["detail"]
    )

    response = client.get(
        f"/api/smart-scan/{scan['id']}"
    )

    assert (
        response.json()["page_count"]
        == 0
    )


def test_users_cannot_see_another_users_scan():
    scan = create_scan()

    current_user_state["id"] = 202

    response = client.get(
        f"/api/smart-scan/{scan['id']}"
    )

    assert response.status_code == 404

    response = client.get(
        "/api/smart-scan"
    )

    assert response.status_code == 200
    assert response.json() == []


def test_reorder_rotate_and_delete_page():
    scan = create_scan()

    uploaded = upload_pages(
        scan["id"],
        3,
    ).json()

    pages = uploaded["pages"]

    reordered_ids = [
        page["id"]
        for page in reversed(pages)
    ]

    response = client.post(
        (
            "/api/smart-scan/"
            f"{scan['id']}/reorder"
        ),
        json={
            "page_ids": reordered_ids,
        },
    )

    assert response.status_code == 200

    reordered = response.json()

    assert [
        page["id"]
        for page in reordered["pages"]
    ] == reordered_ids

    first_page_id = reordered_ids[0]

    response = client.patch(
        (
            "/api/smart-scan/pages/"
            f"{first_page_id}/rotation"
        ),
        json={
            "rotation": 90,
        },
    )

    assert response.status_code == 200
    assert response.json()["rotation"] == 90

    response = client.delete(
        (
            "/api/smart-scan/pages/"
            f"{first_page_id}"
        )
    )

    assert response.status_code == 200

    assert (
        response.json()["scan"][
            "page_count"
        ]
        == 2
    )

    assert [
        page["page_number"]
        for page in response.json()[
            "scan"
        ]["pages"]
    ] == [1, 2]


def test_searchable_pdf_download():
    scan = create_scan()

    upload_response = upload_pages(
        scan["id"],
        1,
    )

    assert upload_response.status_code == 201

    recognize_all_pages(
        scan["id"]
    )

    response = client.get(
        (
            "/api/smart-scan/"
            f"{scan['id']}/pdf"
        )
    )

    assert response.status_code == 200

    assert response.content.startswith(
        b"%PDF"
    )

    assert (
        response.headers[
            "content-type"
        ]
        == "application/pdf"
    )

    assert "attachment" in (
        response.headers[
            "content-disposition"
        ]
    )


def test_ask_studysnap_uses_scan_text(
    monkeypatch,
):
    scan = create_scan()

    upload_pages(
        scan["id"],
        1,
    )

    recognize_all_pages(
        scan["id"]
    )

    captured = {}

    def fake_answer(
        question: str,
        context: str = "",
    ) -> str:
        captured["question"] = question
        captured["context"] = context

        return (
            "The scan explains routing."
        )

    monkeypatch.setattr(
        scan_module,
        "generate_studysnap_answer",
        fake_answer,
    )

    response = client.post(
        (
            "/api/smart-scan/"
            f"{scan['id']}/ask"
        ),
        json={
            "question": (
                "What is the main idea?"
            ),
        },
    )

    assert response.status_code == 200

    assert response.json()["answer"] == (
        "The scan explains routing."
    )

    assert captured["question"] == (
        "What is the main idea?"
    )

    assert (
        "Recognized StudySnap page text."
        in captured["context"]
    )
