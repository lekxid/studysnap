from app.services.brain.concepts import clean_concept, extract_concepts


def concept_id(value: str) -> str:
    """
    Create a stable lowercase ID for a concept.
    Example: "Heart Failure" -> "heart_failure"
    """

    cleaned = clean_concept(value)
    return cleaned.lower().replace(" ", "_").replace("-", "_")


def build_knowledge_graph(text: str, limit: int = 12) -> dict:
    """
    Knowledge Graph v1.

    Simple rule-based graph:
    - Extract concepts from text
    - Turn concepts into nodes
    - Connect nearby concepts with related_to edges

    No database yet. No AI cost yet.
    """

    concepts = extract_concepts(text, limit=limit)

    nodes = []
    seen_nodes = set()

    for concept in concepts:
        node_id = concept_id(concept)

        if not node_id or node_id in seen_nodes:
            continue

        seen_nodes.add(node_id)
        nodes.append(
            {
                "id": node_id,
                "label": concept,
            }
        )

    edges = []
    seen_edges = set()

    for index in range(len(nodes) - 1):
        source = nodes[index]["id"]
        target = nodes[index + 1]["id"]

        if source == target:
            continue

        edge_key = (source, target, "related_to")

        if edge_key in seen_edges:
            continue

        seen_edges.add(edge_key)
        edges.append(
            {
                "source": source,
                "target": target,
                "type": "related_to",
            }
        )

    return {
        "nodes": nodes,
        "edges": edges,
        "concept_count": len(nodes),
        "relationship_count": len(edges),
    }
