import asyncio
import threading

from app.routes.ai import (
    begin_image_edit_request,
    finish_image_edit_request,
    run_image_edit_in_worker,
)


class FakeImages:
    def edit(self, **kwargs):
        return {
            "thread_id": threading.get_ident(),
            "arguments": kwargs,
        }


class FakeClient:
    def __init__(self):
        self.images = FakeImages()


def test_image_edit_runs_outside_event_loop_thread():
    main_thread_id = threading.get_ident()

    async def scenario():
        return await run_image_edit_in_worker(
            client=FakeClient(),
            edit_arguments={
                "model": "test-image-model",
            },
            timeout_seconds=2.0,
        )

    result = asyncio.run(
        scenario()
    )

    assert result["thread_id"] != main_thread_id
    assert result["arguments"]["model"] == "test-image-model"


def test_duplicate_image_edit_is_rejected_until_finished():
    owner_id = 9001
    conversation_id = 7001

    finish_image_edit_request(
        owner_id,
        conversation_id,
    )

    assert begin_image_edit_request(
        owner_id,
        conversation_id,
    ) is True

    assert begin_image_edit_request(
        owner_id,
        conversation_id,
    ) is False

    finish_image_edit_request(
        owner_id,
        conversation_id,
    )

    assert begin_image_edit_request(
        owner_id,
        conversation_id,
    ) is True

    finish_image_edit_request(
        owner_id,
        conversation_id,
    )



def test_new_image_edit_request_supersedes_stopped_worker_lock():
    owner_id = 9002
    conversation_id = 7002

    finish_image_edit_request(
        owner_id,
        conversation_id,
    )

    assert begin_image_edit_request(
        owner_id,
        conversation_id,
        "old-stopped-request",
    ) is True

    assert begin_image_edit_request(
        owner_id,
        conversation_id,
        "old-stopped-request",
    ) is False

    assert begin_image_edit_request(
        owner_id,
        conversation_id,
        "new-continue-request",
    ) is True

    # The stopped worker finishes late. It must
    # not release the newer Continue request.
    finish_image_edit_request(
        owner_id,
        conversation_id,
        "old-stopped-request",
    )

    assert begin_image_edit_request(
        owner_id,
        conversation_id,
        "new-continue-request",
    ) is False

    finish_image_edit_request(
        owner_id,
        conversation_id,
        "new-continue-request",
    )

    assert begin_image_edit_request(
        owner_id,
        conversation_id,
        "after-continue-request",
    ) is True

    finish_image_edit_request(
        owner_id,
        conversation_id,
        "after-continue-request",
    )
