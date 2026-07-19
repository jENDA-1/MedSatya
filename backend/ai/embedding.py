"""Layer 1 — semantic care-need matching via Databricks embeddings.

Embeds each care-need description (taxonomy label + claim keywords + lay symptom phrases) once,
caches the vectors, then cosine-matches a free-text symptom description against them. This makes
free-text understanding robust WITHOUT keyword overlap and WITHOUT hallucination — the output is
only ever a care-need key from the fixed taxonomy (+ a confidence), never a diagnosis.

Any failure (endpoint unreachable, permission, transport) -> the provider reports unavailable and
the caller falls back to the deterministic rule-based provider. It never crashes the request.
"""
from __future__ import annotations

import math
from typing import Any

from backend import config
from backend.ai.providers import SYMPTOM_SIGNALS


def _norm(v: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def _cos(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


class EmbeddingProvider:
    """Cosine-similarity care-need matcher over a Databricks embeddings serving endpoint."""

    name = "embedding"

    def __init__(self) -> None:
        self._endpoint = config.EMBEDDING_ENDPOINT
        self._client = None
        self._resolved = False
        self._disabled = False  # set after a hard failure so we stop retrying every request
        self._keys = list(config.CARE_NEEDS.keys())
        self._doc_vecs: list[list[float]] | None = None

    # -- lifecycle -----------------------------------------------------------
    def _resolve(self) -> None:
        if self._resolved:
            return
        self._resolved = True
        if not self._endpoint:
            self._disabled = True
            return
        try:
            from databricks.sdk import WorkspaceClient

            self._client = WorkspaceClient()
        except Exception:
            self._client = None
            self._disabled = True

    def available(self) -> bool:
        self._resolve()
        return bool(self._client) and not self._disabled

    # -- embedding -----------------------------------------------------------
    def _embed(self, texts: list[str]) -> list[list[float]]:
        resp = self._client.serving_endpoints.query(name=self._endpoint, input=texts)
        data = resp.as_dict()["data"]
        return [_norm(item["embedding"]) for item in data]

    def _doc(self, cn: str, cfg: dict) -> str:
        parts = [cfg["label"], *cfg.get("claim_keywords", []), *SYMPTOM_SIGNALS.get(cn, [])]
        uniq = list(dict.fromkeys(p for p in parts if p))
        return f"Care type {cfg['label']}. Relevant when someone mentions: " + ", ".join(uniq) + "."

    def _ensure_docs(self) -> None:
        if self._doc_vecs is not None:
            return
        docs = [self._doc(k, config.CARE_NEEDS[k]) for k in self._keys]
        self._doc_vecs = self._embed(docs)

    # -- public matching -----------------------------------------------------
    def map(self, text: str, locale: str = "en") -> dict[str, Any] | None:
        """Return a care-need suggestion dict, or None if embeddings are unavailable/failed.

        On ambiguity (low absolute similarity or a small top-1..top-2 gap) the result carries
        `needs_clarification=True` and `_top2` (two closest keys) so the caller can ask ONE
        clarifying question.
        """
        if not self.available():
            return None
        try:
            self._ensure_docs()
            assert self._doc_vecs is not None
            qv = self._embed([text])[0]
            sims = sorted(
                ((_cos(qv, dv), self._keys[i]) for i, dv in enumerate(self._doc_vecs)),
                reverse=True,
            )
        except Exception:
            # A live failure after startup — disable so we don't slow every later request.
            self._disabled = True
            return None

        best_s, best = sims[0]
        second_s, second = sims[1]
        margin = best_s - second_s
        ambiguous = best_s < config.EMBED_MATCH_MIN or margin < config.EMBED_MARGIN_MIN
        confidence = round(min(0.95, max(0.35, 0.5 + 2.5 * margin + 0.4 * (best_s - 0.5))), 2)

        result: dict[str, Any] = {
            "care_need": best,
            "confidence": confidence if not ambiguous else min(confidence, 0.5),
            "rationale": f"Your words are closest to {config.CARE_NEEDS[best]['label']}.",
            "is_emergency": False,  # emergency red-flags are layered on by the caller
            "alternatives": [second, *(k for _, k in sims[2:4])],
            "provider": self.name,
        }
        if ambiguous:
            result["needs_clarification"] = True
            result["_top2"] = [best, second]
        return result

    def top_candidates(self, text: str, n: int = 3) -> list[dict[str, Any]]:
        """Top-N taxonomy candidates by cosine similarity — for grounding the OpenAI agent.

        Returns [{key, label, score}] best-first, or [] if embeddings are unavailable/failed.
        Grounding is a bonus, never required — the caller degrades gracefully to a taxonomy-only
        prompt when this returns [].
        """
        if not self.available():
            return []
        try:
            self._ensure_docs()
            assert self._doc_vecs is not None
            qv = self._embed([text])[0]
            sims = sorted(
                ((_cos(qv, dv), self._keys[i]) for i, dv in enumerate(self._doc_vecs)),
                reverse=True,
            )
        except Exception:
            self._disabled = True
            return []
        return [
            {"key": k, "label": config.CARE_NEEDS[k]["label"], "score": round(float(s), 3)}
            for s, k in sims[:n]
        ]
