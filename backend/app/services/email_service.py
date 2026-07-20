from __future__ import annotations

import html
import logging

from azure.communication.email import EmailClient

from app.config import settings


logger = logging.getLogger(__name__)


def build_welcome_email(
    *,
    full_name: str,
    login_url: str,
) -> tuple[str, str, str]:
    safe_name = html.escape(full_name)
    safe_url = html.escape(
        login_url,
        quote=True,
    )

    subject = "Welcome to StudySnap — your AI study workspace"

    plain_text = f"""Hi {full_name},

Welcome to StudySnap.

StudySnap brings your subjects, files, notes, practice tools, progress, and AI support into one connected study workspace.

GET STARTED

1. Sign in using the button or link below.
2. Create a Study Room for one subject or course.
3. Upload your class notes, PDFs, slides, images, or assignments.
4. Open AI Tutor inside the room and ask questions about your material.
5. Create flashcards and quizzes to practise what you learned.
6. Use Study Together to invite classmates and collaborate.

WHAT YOU CAN DO

Study Rooms:
Keep each course and its learning material organized in one place.

AI Tutor:
Ask questions, request explanations, summarize material, and continue previous learning.

Notes and uploads:
Store notes, PDFs, slides, images, and documents with the correct subject.

Flashcards and quizzes:
Turn study material into practice questions and memory exercises.

Brain and Progress:
Track what you understand, what needs review, and where to continue.

Study Together:
Invite trusted classmates into a shared room, exchange messages, and study together.

Helpful tip:
Use one Study Room for each subject. Ask AI Tutor questions from inside the correct room so it can use the right material and context.

Open StudySnap:
{login_url}

Your email will already be entered. For security, enter your own password to sign in.

Never share your password or private beta invite code.

Welcome to StudySnap.
"""

    html_text = f"""<!doctype html>
<html>
  <body style="margin:0;background:#070b14;color:#e5e7eb;font-family:Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:32px 18px;">
      <div style="background:#0f172a;border:1px solid #293245;border-radius:24px;overflow:hidden;">
        <div style="padding:30px;background:#111827;border-bottom:1px solid #293245;">
          <div style="font-size:13px;font-weight:700;letter-spacing:1.4px;color:#facc15;">
            STUDYSNAP
          </div>
          <h1 style="margin:12px 0 8px;font-size:30px;line-height:1.2;color:#ffffff;">
            Welcome, {safe_name}
          </h1>
          <p style="margin:0;color:#cbd5e1;font-size:16px;line-height:1.7;">
            Your subjects, files, practice tools, progress, classmates,
            and AI support can now work together in one study workspace.
          </p>
        </div>

        <div style="padding:30px;">
          <h2 style="margin:0 0 16px;color:#ffffff;font-size:21px;">
            Start here
          </h2>

          <div style="background:#172033;border-radius:16px;padding:20px;line-height:1.8;color:#dbe3ef;">
            <strong style="color:#facc15;">1.</strong> Sign in to StudySnap.<br>
            <strong style="color:#facc15;">2.</strong> Create one Study Room for a subject or course.<br>
            <strong style="color:#facc15;">3.</strong> Upload your notes, PDFs, slides, images, or assignments.<br>
            <strong style="color:#facc15;">4.</strong> Open AI Tutor inside that room and ask questions.<br>
            <strong style="color:#facc15;">5.</strong> Create flashcards and quizzes for practice.<br>
            <strong style="color:#facc15;">6.</strong> Invite trusted classmates through Study Together.
          </div>

          <h2 style="margin:30px 0 16px;color:#ffffff;font-size:21px;">
            What StudySnap helps you do
          </h2>

          <div style="line-height:1.7;color:#cbd5e1;">
            <p><strong style="color:#ffffff;">Study Rooms</strong><br>
            Keep each course and its learning material organized together.</p>

            <p><strong style="color:#ffffff;">AI Tutor</strong><br>
            Ask questions, request simple explanations, summarize material,
            and continue previous learning.</p>

            <p><strong style="color:#ffffff;">Notes and uploads</strong><br>
            Store notes, PDFs, slides, images, and documents with the right subject.</p>

            <p><strong style="color:#ffffff;">Flashcards and quizzes</strong><br>
            Turn your material into practice questions and memory exercises.</p>

            <p><strong style="color:#ffffff;">Brain and Progress</strong><br>
            See what you understand, what needs review, and where to continue.</p>

            <p><strong style="color:#ffffff;">Study Together</strong><br>
            Invite classmates into shared rooms, exchange messages,
            and work together.</p>
          </div>

          <div style="margin:26px 0;background:#221f12;border:1px solid #544a18;border-radius:16px;padding:18px;color:#fef3c7;line-height:1.7;">
            <strong>Helpful tip:</strong> Use one Study Room for each subject.
            Ask AI Tutor from inside the correct room so it can use the right
            files and learning context.
          </div>

          <a href="{safe_url}"
             style="display:block;background:#facc15;color:#111827;text-align:center;text-decoration:none;font-weight:800;padding:15px 20px;border-radius:14px;">
            Open StudySnap
          </a>

          <p style="margin:14px 0 0;text-align:center;color:#94a3b8;font-size:13px;line-height:1.6;">
            Your email will already be entered. Enter your password to sign in.
          </p>

          <p style="margin:28px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">
            Never share your password or private beta invite code.
          </p>
        </div>
      </div>
    </div>
  </body>
</html>
"""

    return subject, plain_text, html_text


def build_password_reset_email(
    *,
    full_name: str,
    reset_url: str,
    expires_in_minutes: int,
) -> tuple[str, str, str]:
    safe_name = html.escape(full_name)
    safe_url = html.escape(
        reset_url,
        quote=True,
    )

    subject = "Reset your StudySnap password"

    plain_text = f"""Hi {full_name},

A request was made to reset your StudySnap password.

Open this secure link:
{reset_url}

This link expires in {expires_in_minutes} minutes and can only be used once.

If you did not request this change, you can ignore this email. Your password will remain unchanged.

StudySnap
"""

    html_text = f"""<!doctype html>
<html>
  <body style="margin:0;background:#070b14;color:#e5e7eb;font-family:Arial,sans-serif;">
    <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
      <div style="background:#0f172a;border:1px solid #293245;border-radius:24px;padding:30px;">
        <div style="font-size:13px;font-weight:700;letter-spacing:1.4px;color:#facc15;">
          STUDYSNAP
        </div>

        <h1 style="margin:14px 0 10px;color:#ffffff;font-size:28px;">
          Reset your password
        </h1>

        <p style="color:#cbd5e1;line-height:1.7;">
          Hi {safe_name}, a request was made to reset your StudySnap password.
        </p>

        <a href="{safe_url}"
           style="display:block;margin:24px 0;background:#facc15;color:#111827;text-align:center;text-decoration:none;font-weight:800;padding:15px 20px;border-radius:14px;">
          Choose a new password
        </a>

        <p style="color:#cbd5e1;line-height:1.7;">
          This secure link expires in {expires_in_minutes} minutes
          and can only be used once.
        </p>

        <p style="color:#94a3b8;font-size:13px;line-height:1.7;">
          If you did not request this change, ignore this email.
          Your password will remain unchanged.
        </p>
      </div>
    </div>
  </body>
</html>
"""

    return subject, plain_text, html_text


def send_email(
    *,
    recipient: str,
    subject: str,
    plain_text: str,
    html_text: str,
) -> bool:
    connection_string = (
        settings.azure_communication_connection_string.strip()
    )
    sender_address = (
        settings.email_sender_address.strip()
    )

    if not connection_string or not sender_address:
        logger.warning(
            "StudySnap email is not configured."
        )
        return False

    message = {
        "senderAddress": sender_address,
        "recipients": {
            "to": [
                {
                    "address": recipient,
                }
            ],
        },
        "content": {
            "subject": subject,
            "plainText": plain_text,
            "html": html_text,
        },
    }

    try:
        client = EmailClient.from_connection_string(
            connection_string
        )

        poller = client.begin_send(message)
        result = poller.result()

        return (
            str(result.get("status", "")).lower()
            == "succeeded"
        )
    except Exception as exc:
        logger.error(
            "StudySnap email delivery failed: %s",
            type(exc).__name__,
        )
        return False


def send_welcome_email(
    *,
    recipient: str,
    full_name: str,
    login_url: str,
) -> bool:
    subject, plain_text, html_text = (
        build_welcome_email(
            full_name=full_name,
            login_url=login_url,
        )
    )

    return send_email(
        recipient=recipient,
        subject=subject,
        plain_text=plain_text,
        html_text=html_text,
    )


def send_password_reset_email(
    *,
    recipient: str,
    full_name: str,
    reset_url: str,
    expires_in_minutes: int,
) -> bool:
    subject, plain_text, html_text = (
        build_password_reset_email(
            full_name=full_name,
            reset_url=reset_url,
            expires_in_minutes=expires_in_minutes,
        )
    )

    return send_email(
        recipient=recipient,
        subject=subject,
        plain_text=plain_text,
        html_text=html_text,
    )
