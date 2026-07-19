"""Best-effort transactional email hook (HTTPS API, not SMTP).

Outbound SMTP ports are typically blocked on Databricks Apps, so we use a transactional HTTPS API
(Resend by default). The caller ALWAYS persists to Delta first and only then calls this — so if
email fails or is disabled, no data is lost.

Ships DISABLED: with no API key (`MEDSATYA_FEEDBACK_EMAIL_KEY`) + from-address configured, this is
a no-op hook that returns False. Enable later by setting those as app secrets — no code change.

Stdlib only (urllib) — no new dependency.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request

from backend import config


def enabled() -> bool:
    """True only when an API key AND a from-address are configured."""
    return bool(config.FEEDBACK_EMAIL_API_KEY and config.FEEDBACK_EMAIL_FROM)


def send_feedback_email(feedback: dict) -> bool:
    """Send a feedback notification. Returns True on success, False if disabled or on any error.

    Never raises — email is best-effort and must not affect the API response.
    """
    if not enabled():
        return False
    try:
        role = feedback.get("role", "?")
        facility = feedback.get("facility_name") or "an unnamed facility"
        subject = f"[MedSatya] {role} feedback on {facility}"
        lines = [
            f"Role: {role}",
            f"Facility: {facility}" + (f" (id {feedback['facility_id']})" if feedback.get("facility_id") else ""),
            f"Care type: {feedback.get('care_need') or '—'}",
            "",
            f"What's right: {feedback.get('correct_note') or '—'}",
            f"What's wrong: {feedback.get('incorrect_note') or '—'}",
            f"Evidence URL: {feedback.get('evidence_url') or '—'}",
            f"Contact: {feedback.get('contact') or '—'}",
            "",
            f"Feedback id: {feedback.get('id')} · {feedback.get('created_at')}",
            "",
            "Collected via MedSatya. Feedback does not change evidence live.",
        ]
        body = "\n".join(lines)
        provider = (config.FEEDBACK_EMAIL_PROVIDER or "resend").lower()
        if provider == "resend":
            return _send_resend(subject, body)
        # Unknown provider configured -> treat as disabled (no crash).
        return False
    except Exception:
        return False


def _send_resend(subject: str, body: str) -> bool:
    payload = json.dumps(
        {
            "from": config.FEEDBACK_EMAIL_FROM,
            "to": [config.FEEDBACK_EMAIL_TO],
            "subject": subject,
            "text": body,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {config.FEEDBACK_EMAIL_API_KEY}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            return 200 <= resp.status < 300
    except urllib.error.URLError:
        return False
