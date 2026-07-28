from pathlib import Path


def test_ai_message_action_routes_exist():
    route = Path(
        "app/routes/ai_message_actions.py"
    ).read_text(
        encoding="utf-8"
    )

    markers = [
        '"/messages/{message_id}/branch"',
        '"/messages/{message_id}/edit-resend"',
        '"/messages/{message_id}/retry"',
        '"/messages/{message_id}/regenerate"',
        "create_branch",
        "clone_messages",
        "create_fresh_exchange",
        "clone_attachment_fields",
        "ATTACHMENT_FIELDS",
        "BRANCH_TITLE_PREFIX",
        "normalized_branch_source_title",
        'f"Branch · {branch_title_source}"',
    ]

    for marker in markers:
        assert marker in route


def test_ai_message_action_router_registered():
    main = Path(
        "app/main.py"
    ).read_text(
        encoding="utf-8"
    )

    assert (
        "ai_message_actions_router"
        in main
    )

    assert (
        'prefix="/api/ai"'
        in main
    )



def test_ai_message_actions_file_aware_branch_contract():
    route = Path(
        "app/routes/ai_message_actions.py"
    ).read_text(
        encoding="utf-8"
    )

    assert "require_text_only(" not in route
    assert "clone_attachment_fields(" in route
    assert (
        "clone_attachment_fields(\n"
        "            source,\n"
        "            message,\n"
        "        )"
        in route
    )
    assert "BRANCH_TITLE_PREFIX" in route
    assert (
        'f"Branch · {branch_title_source}"'
        in route
    )


def test_regenerate_stays_in_source_conversation():
    route = Path(
        "app/routes/ai_message_actions.py"
    ).read_text(
        encoding="utf-8"
    )

    start = route.index(
        '"/messages/{message_id}/regenerate"'
    )

    block = route[start:]

    assert (
        "temporary_branch = create_branch("
        in block
    )

    assert (
        "db.delete(\n"
        "            temporary_branch\n"
        "        )"
        in block
    )

    assert (
        "source_message.content = ("
        in block
    )

    assert (
        "branch=source_conversation"
        in block
    )

    assert (
        "messages=current_messages"
        in block
    )

    assert (
        "assistant_message=source_message"
        in block
    )


def test_branch_still_returns_a_new_conversation():
    route = Path(
        "app/routes/ai_message_actions.py"
    ).read_text(
        encoding="utf-8"
    )

    start = route.index(
        '"/messages/{message_id}/branch"'
    )

    end = route.index(
        '"/messages/{message_id}/edit-resend"'
    )

    block = route[start:end]

    assert "branch = create_branch(" in block
    assert "branch=branch" in block
    assert 'action="branch"' in block
