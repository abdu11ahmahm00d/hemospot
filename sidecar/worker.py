"""
worker.py — the analysis job runner (T-008, NFR1.4).

One process, one loop: pick up a pending analysis job, run it through the sidecar,
write the verdict back. Run it next to the API with:

    python worker.py

BEHAVIOUR THAT MATTERS (read this before the code):

1. The worker signs in as an analyst service account (WORKER_EMAIL/WORKER_PASSWORD).
   It holds NO service key and bypasses NOTHING: every read and write passes the
   same RLS policies as the human analysts. If Postgres would refuse an analyst,
   it refuses the worker. That is deliberate — the queue cannot become a backdoor.

2. No job is ever lost (NFR1.4). A claimed job carries picked_up_at. If the worker
   dies mid-job, the next pass finds the stale claim (older than STALE_MINUTES)
   and re-queues it. Attempts are counted; after MAX_ATTEMPTS the job parks as
   `failed` with the error attached instead of spinning forever.

3. The worker prints one line per action. On demo day that log IS the retry proof:
   kill this process mid-job, restart it, watch the job complete.
"""

import os
import time
from datetime import datetime, timedelta, timezone

import httpx
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
WORKER_EMAIL = os.environ.get("WORKER_EMAIL", "")
WORKER_PASSWORD = os.environ.get("WORKER_PASSWORD", "")
SIDECAR_URL = os.environ.get("SIDECAR_URL", "http://127.0.0.1:8000")
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "10"))
STALE_MINUTES = int(os.environ.get("STALE_MINUTES", "5"))
MAX_ATTEMPTS = int(os.environ.get("MAX_ATTEMPTS", "5"))


def log(message: str) -> None:
    print(f"[worker {datetime.now(timezone.utc).strftime('%H:%M:%S')}] {message}", flush=True)


def sweep_stale_jobs(db) -> int:
    """
    Re-queue jobs whose claim went stale: still `processing` but untouched for
    longer than STALE_MINUTES. This is the whole NFR1.4 mechanism — a dead worker
    cannot take a job with it, because claims expire.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=STALE_MINUTES)).isoformat()
    swept = (
        db.table("analysis_jobs")
        .update({"status": "pending"})
        .eq("status", "processing")
        .lt("picked_up_at", cutoff)
        .execute()
    )
    return len(swept.data or [])


def claim_next_job(db):
    """
    Take the oldest pending job that still has attempts left. Marking it
    `processing` with a fresh timestamp IS the claim — one row, one writer wins.
    Returns the job row, or None when the queue is empty.
    """
    claimed = (
        db.table("analysis_jobs")
        .update(
            {
                "status": "processing",
                "picked_up_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("status", "pending")
        .lt("attempts", MAX_ATTEMPTS)
        .order("created_at")
        .limit(1)
        .execute()
    )
    rows = claimed.data or []
    return rows[0] if rows else None


def run_job(db, job: dict) -> None:
    """
    Process one claimed job: download the photo, classify it, write the verdict.
    Any exception parks the job back for retry (or as failed past MAX_ATTEMPTS).
    """
    job_id = job["id"]
    try:
        analysis = (
            db.table("analyses").select("id, evidence_id").eq("id", job["analysis_id"]).single().execute()
        ).data
        evidence = (
            db.table("evidence").select("storage_path").eq("id", analysis["evidence_id"]).single().execute()
        ).data

        photo_bytes = db.storage.from_("evidence").download(evidence["storage_path"])
        response = httpx.post(
            f"{SIDECAR_URL}/analyze",
            files={"image": ("evidence.png", photo_bytes, "image/png")},
            timeout=120.0,
        )
        response.raise_for_status()
        result = response.json()

        db.table("analyses").update(
            {
                "status": "ready_for_review",
                "verdict": result["verdict"],
                "confidence": result["confidence"],
                "probabilities": result["probabilities"],
                "explanation": result["explanation"],
                "model_sha256": result["model_sha256"],
                "stain_count": result["stain_count"],
            }
        ).eq("id", job["analysis_id"]).execute()

        db.table("analysis_jobs").update(
            {"status": "done", "finished_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", job_id).execute()
        log(f"job {job_id[:8]} done: {result['verdict']} ({result['confidence']:.2f})")
    except Exception as error:
        attempts = job["attempts"] + 1
        resting = "failed" if attempts >= MAX_ATTEMPTS else "pending"
        db.table("analysis_jobs").update(
            {"status": resting, "attempts": attempts, "last_error": str(error)[:500]}
        ).eq("id", job_id).execute()
        log(f"job {job_id[:8]} {resting} (attempt {attempts}): {str(error)[:120]}")


def main() -> None:
    missing = [name for name, value in
               [("SUPABASE_URL", SUPABASE_URL), ("SUPABASE_ANON_KEY", SUPABASE_ANON_KEY),
                ("WORKER_EMAIL", WORKER_EMAIL), ("WORKER_PASSWORD", WORKER_PASSWORD)]
               if not value]
    if missing:
        raise SystemExit(f"worker misconfigured, missing env: {', '.join(missing)}")

    db = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    db.auth.sign_in_with_password({"email": WORKER_EMAIL, "password": WORKER_PASSWORD})
    log(f"signed in as {WORKER_EMAIL}; polling every {POLL_SECONDS}s")

    while True:
        try:
            swept = sweep_stale_jobs(db)
            if swept:
                log(f"re-queued {swept} stale job(s)")
            job = claim_next_job(db)
            if job:
                run_job(db, job)
        except Exception as error:
            # The loop itself never dies on a bad pass: log it and poll again.
            # A dead loop would strand every pending job, which is exactly NFR1.4.
            log(f"poll error (retrying): {str(error)[:120]}")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
