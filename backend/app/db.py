"""Database and storage layer for user accounts, sessions, and saved analyses.
Uses standard Python sqlite3 with thread-safe connections, WAL mode, and salted PBKDF2 hashing.
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List

from . import config as C

DB_PATH = Path(os.environ.get("SER_DB_PATH") or (C.ROOT / "data" / "ser_app.db"))
_local = threading.local()

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


def get_db() -> sqlite3.Connection:
    """Thread-local SQLite connection with foreign keys enabled."""
    if not hasattr(_local, "conn") or _local.conn is None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        _local.conn = conn
    return _local.conn


def init_db():
    """Create schema if not exists."""
    conn = get_db()
    with conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            full_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            reset_token TEXT,
            reset_token_expires TEXT
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS saved_analyses (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            predicted_emotion TEXT NOT NULL,
            confidence REAL NOT NULL,
            margin REAL NOT NULL,
            scores_json TEXT NOT NULL,
            transcript TEXT,
            transcript_segments_json TEXT,
            consistency_status TEXT,
            consistency_explanation TEXT,
            notes_json TEXT,
            analyzed_seconds REAL NOT NULL,
            is_uncertain INTEGER NOT NULL,
            model_name TEXT,
            model_id TEXT,
            feature_version INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
        CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON saved_analyses(user_id);
        CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON saved_analyses(created_at);
        """)


def hash_password(password: str) -> str:
    """Hash password using PBKDF2-HMAC-SHA256 with 200,000 iterations and a random 16-byte salt."""
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200000)
    return f"pbkdf2:sha256:200000${salt.hex()}${dk.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    """Verify password against stored PBKDF2 hash using timing-safe comparison."""
    try:
        parts = hashed.split("$")
        if len(parts) != 3:
            return False
        algo, salt_hex, hash_hex = parts
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200000)
        return hmac.compare_digest(dk, expected)
    except Exception:
        return False


def validate_email_syntax(email: str) -> bool:
    """Validate email syntax, ensuring non-empty local-part and valid domain."""
    email = email.strip()
    if not email or len(email) > 254:
        return False
    if not EMAIL_REGEX.match(email):
        return False
    parts = email.split("@")
    if len(parts) != 2:
        return False
    domain = parts[1]
    if "." not in domain or domain.startswith(".") or domain.endswith("."):
        return False
    tld = domain.split(".")[-1]
    if len(tld) < 2:
        return False
    return True


def check_password_strength(password: str) -> tuple[bool, str]:
    """Check password strength: minimum 8 characters."""
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    return True, "Strong password"


def create_user(email: str, full_name: str, password: str) -> Dict[str, Any]:
    """Register a new user."""
    email = email.strip().lower()
    full_name = full_name.strip()
    if not validate_email_syntax(email):
        raise ValueError("Please provide a valid email address.")
    if not full_name:
        raise ValueError("Please provide your full name.")
    ok, msg = check_password_strength(password)
    if not ok:
        raise ValueError(msg)

    conn = get_db()
    user_id = secrets.token_hex(16)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    pwd_hash = hash_password(password)

    try:
        with conn:
            conn.execute(
                "INSERT INTO users (id, email, full_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, email, full_name, pwd_hash, now, now),
            )
    except sqlite3.IntegrityError:
        raise ValueError("An account with this email address already exists.")

    return {"id": user_id, "email": email, "full_name": full_name, "created_at": now}


def authenticate_user(email: str, password: str) -> Optional[Dict[str, Any]]:
    """Authenticate user with email and password."""
    email = email.strip().lower()
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row or not verify_password(password, row["password_hash"]):
        return None
    return {"id": row["id"], "email": row["email"], "full_name": row["full_name"], "created_at": row["created_at"]}


def create_session(user_id: str, days: int = 7) -> str:
    """Create a new session token valid for the specified days."""
    token = secrets.token_urlsafe(36)
    now = datetime.now(timezone.utc)
    expires = (now + timedelta(days=days)).isoformat(timespec="seconds")
    conn = get_db()
    with conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, user_id, now.isoformat(timespec="seconds"), expires),
        )
    return token


def get_user_by_session(token: str) -> Optional[Dict[str, Any]]:
    """Retrieve user associated with an active session token."""
    if not token:
        return None
    conn = get_db()
    row = conn.execute(
        """SELECT u.id, u.email, u.full_name, u.created_at, s.expires_at 
           FROM sessions s JOIN users u ON s.user_id = u.id 
           WHERE s.token = ?""",
        (token,),
    ).fetchone()
    if not row:
        return None

    # Check expiration
    expires = datetime.fromisoformat(row["expires_at"])
    if expires < datetime.now(timezone.utc):
        with conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        return None

    return {"id": row["id"], "email": row["email"], "full_name": row["full_name"], "created_at": row["created_at"]}


def delete_session(token: str):
    """Log out a session."""
    conn = get_db()
    with conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def update_user_profile(user_id: str, full_name: str) -> Dict[str, Any]:
    """Update profile details."""
    full_name = full_name.strip()
    if not full_name:
        raise ValueError("Full name cannot be empty.")
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    conn = get_db()
    with conn:
        conn.execute("UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?", (full_name, now, user_id))
    row = conn.execute("SELECT id, email, full_name, created_at FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row)


def create_password_reset_token(email: str) -> Optional[str]:
    """Generate a password reset token with 1 hour validity."""
    email = email.strip().lower()
    conn = get_db()
    row = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if not row:
        return None
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(timespec="seconds")
    with conn:
        conn.execute("UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?", (token, expires, row["id"]))
    return token


def reset_password_with_token(token: str, new_password: str) -> bool:
    """Reset password given a valid token."""
    ok, msg = check_password_strength(new_password)
    if not ok:
        raise ValueError(msg)
    conn = get_db()
    row = conn.execute("SELECT id, reset_token_expires FROM users WHERE reset_token = ?", (token,)).fetchone()
    if not row or not row["reset_token_expires"]:
        return False
    expires = datetime.fromisoformat(row["reset_token_expires"])
    if expires < datetime.now(timezone.utc):
        return False
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    pwd_hash = hash_password(new_password)
    with conn:
        conn.execute(
            "UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = ? WHERE id = ?",
            (pwd_hash, now, row["id"]),
        )
        # Invalidate old sessions
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
    return True


def delete_user_account(user_id: str):
    """Delete user account and all associated analyses and sessions."""
    conn = get_db()
    with conn:
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


# =========================================================================
# Saved Analyses CRUD
# =========================================================================

def save_analysis(
    user_id: str,
    original_filename: str,
    predicted_emotion: str,
    confidence: float,
    margin: float,
    scores: Dict[str, float],
    analyzed_seconds: float,
    is_uncertain: bool,
    transcript: Optional[str] = None,
    transcript_segments: Optional[List[Dict[str, Any]]] = None,
    consistency_status: Optional[str] = None,
    consistency_explanation: Optional[str] = None,
    notes: Optional[List[str]] = None,
    model_name: Optional[str] = None,
    model_id: Optional[str] = None,
    feature_version: Optional[int] = None,
) -> Dict[str, Any]:
    """Persist a completed audio analysis for an authenticated user."""
    analysis_id = secrets.token_hex(16)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    conn = get_db()
    with conn:
        conn.execute(
            """INSERT INTO saved_analyses (
                id, user_id, created_at, original_filename, predicted_emotion,
                confidence, margin, scores_json, transcript, transcript_segments_json,
                consistency_status, consistency_explanation, notes_json,
                analyzed_seconds, is_uncertain, model_name, model_id, feature_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                analysis_id,
                user_id,
                now,
                original_filename,
                predicted_emotion,
                float(confidence),
                float(margin),
                json.dumps(scores),
                transcript,
                json.dumps(transcript_segments or []),
                consistency_status,
                consistency_explanation,
                json.dumps(notes or []),
                float(analyzed_seconds),
                1 if is_uncertain else 0,
                model_name,
                model_id,
                feature_version or C.FEATURE_VERSION,
            ),
        )
    return get_saved_analysis(analysis_id, user_id)


def list_saved_analyses(user_id: str) -> List[Dict[str, Any]]:
    """List all saved analyses for the given user, ordered by date descending."""
    conn = get_db()
    rows = conn.execute(
        """SELECT id, created_at, original_filename, predicted_emotion, confidence,
                  margin, scores_json, transcript, transcript_segments_json,
                  consistency_status, consistency_explanation, notes_json,
                  analyzed_seconds, is_uncertain, model_name, model_id, feature_version
           FROM saved_analyses WHERE user_id = ? ORDER BY created_at DESC""",
        (user_id,),
    ).fetchall()
    return [
        {
            "id": r["id"],
            "created_at": r["created_at"],
            "original_filename": r["original_filename"],
            "predicted_emotion": r["predicted_emotion"],
            "confidence": r["confidence"],
            "margin": r["margin"],
            "scores": json.loads(r["scores_json"]) if r["scores_json"] else {},
            "transcript": r["transcript"],
            "transcript_segments": json.loads(r["transcript_segments_json"]) if r["transcript_segments_json"] else [],
            "consistency_status": r["consistency_status"],
            "consistency_explanation": r["consistency_explanation"],
            "notes": json.loads(r["notes_json"]) if r["notes_json"] else [],
            "analyzed_seconds": r["analyzed_seconds"],
            "is_uncertain": bool(r["is_uncertain"]),
            "model_name": r["model_name"],
            "model_id": r["model_id"],
            "feature_version": r["feature_version"],
        }
        for r in rows
    ]


def get_saved_analysis(analysis_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve full details of a saved analysis belonging to the user."""
    conn = get_db()
    r = conn.execute(
        "SELECT * FROM saved_analyses WHERE id = ? AND user_id = ?",
        (analysis_id, user_id),
    ).fetchone()
    if not r:
        return None
    return {
        "id": r["id"],
        "user_id": r["user_id"],
        "created_at": r["created_at"],
        "original_filename": r["original_filename"],
        "predicted_emotion": r["predicted_emotion"],
        "confidence": r["confidence"],
        "margin": r["margin"],
        "scores": json.loads(r["scores_json"]),
        "transcript": r["transcript"],
        "transcript_segments": json.loads(r["transcript_segments_json"] or "[]"),
        "consistency_status": r["consistency_status"],
        "consistency_explanation": r["consistency_explanation"],
        "notes": json.loads(r["notes_json"] or "[]"),
        "analyzed_seconds": r["analyzed_seconds"],
        "is_uncertain": bool(r["is_uncertain"]),
        "model_name": r["model_name"],
        "model_id": r["model_id"],
        "feature_version": r["feature_version"],
    }


def delete_saved_analysis(analysis_id: str, user_id: str) -> bool:
    """Delete a saved analysis record belonging to the user."""
    conn = get_db()
    with conn:
        cur = conn.execute(
            "DELETE FROM saved_analyses WHERE id = ? AND user_id = ?",
            (analysis_id, user_id),
        )
        return cur.rowcount > 0


list_user_analyses = list_saved_analyses
get_user_analysis = get_saved_analysis
delete_user_analysis = delete_saved_analysis

# Initialize tables on import
init_db()
