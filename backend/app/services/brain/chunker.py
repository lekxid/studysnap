from __future__ import annotations

from dataclasses import dataclass


@dataclass
class BrainChunk:
    index: int
    start: int
    end: int
    text: str


def normalize_text(text: str) -> str:
    """
    Normalize whitespace while preserving the content.
    """
    return " ".join((text or "").split())


def chunk_text(
    text: str,
    chunk_size: int = 1200,
    overlap: int = 200,
) -> list[BrainChunk]:
    """
    Split text into overlapping chunks.

    Example:

    Chunk 1:
    0 -----------1200

                 200 overlap

    Chunk 2:
             1000 --------2200
    """

    text = normalize_text(text)

    if not text:
        return []

    if chunk_size <= overlap:
        raise ValueError("chunk_size must be greater than overlap")

    chunks: list[BrainChunk] = []

    start = 0
    index = 0
    text_length = len(text)

    while start < text_length:
        end = min(start + chunk_size, text_length)

        chunks.append(
            BrainChunk(
                index=index,
                start=start,
                end=end,
                text=text[start:end],
            )
        )

        if end >= text_length:
            break

        start = end - overlap
        index += 1

    return chunks


def chunk_to_dict(chunk: BrainChunk) -> dict:
    return {
        "index": chunk.index,
        "start": chunk.start,
        "end": chunk.end,
        "length": len(chunk.text),
        "text": chunk.text,
    }


def chunks_to_dict(chunks: list[BrainChunk]) -> list[dict]:
    return [chunk_to_dict(chunk) for chunk in chunks]
