from PIL import Image

from app.routes.ai import (
    _apply_quick_image_edit_plan,
    _quick_image_edit_plan,
)


def test_quick_edit_detects_brightness_without_generative_change():
    plan = _quick_image_edit_plan(
        "Make it slightly brighter while keeping everything else exactly the same."
    )

    assert plan is not None
    assert float(plan["brightness"]) > 1.0


def test_quick_edit_rejects_background_replacement():
    assert (
        _quick_image_edit_plan(
            "Replace the background with a studio."
        )
        is None
    )


def test_quick_edit_preserves_dimensions_and_changes_pixels():
    source = Image.new(
        "RGBA",
        (12, 8),
        (50, 60, 70, 255),
    )

    plan = _quick_image_edit_plan(
        "Make it brighter and clearer."
    )

    assert plan is not None

    result, applied = _apply_quick_image_edit_plan(
        source,
        plan,
    )

    assert result.size == source.size
    assert result.mode == "RGBA"
    assert result.getpixel((0, 0)) != source.getpixel((0, 0))
    assert "brightness" in applied
    assert "clarity" in applied


def test_quick_edit_auto_enhance_is_subtle_and_deterministic():
    first = _quick_image_edit_plan(
        "Make it look better."
    )

    second = _quick_image_edit_plan(
        "Make it look better."
    )

    assert first is not None
    assert first == second
    assert 1.0 < float(first["brightness"]) < 1.1
    assert 1.0 < float(first["contrast"]) < 1.1
