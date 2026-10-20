"""The API's databases: one SQLite file per network, plus the demo-only history table."""
import sqlite3
import threading

import db

_creation_lock = threading.Lock()


def connect_existing(ctx) -> sqlite3.Connection:
    """A fresh connection to the network's database (one per thread: SQLite requires it)."""
    return db.connect(str(ctx.db_path))


def open_db(ctx) -> sqlite3.Connection:
    """Open the network's database, creating it first if needed.

    A NEW database starts its note ids after the highest id the chain has ever anchored, read
    from the chain's own event logs. So recreating a database can never collide with the
    permanent record on the chain.
    """
    with _creation_lock:
        fresh = not ctx.db_path.exists()
        ctx.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = connect_existing(ctx)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS demo_history ("
            " note_id INTEGER NOT NULL, version INTEGER NOT NULL, content TEXT NOT NULL,"
            " PRIMARY KEY (note_id, version))")
        if fresh:
            highest = max((rid for (rtype, rid) in ctx.chain.anchored_records() if rtype == "note"),
                          default=0)
            if highest:
                conn.execute("INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES ('note', ?)",
                             (highest,))
        conn.commit()
    return conn


def remember_version(conn, note_id, version, content):
    """DEMO ONLY: remember each text a note had, so the Attack lab can restore an earlier one."""
    conn.execute("INSERT OR REPLACE INTO demo_history (note_id, version, content) VALUES (?, ?, ?)",
                 (note_id, version, content))
    conn.commit()


def earlier_text(conn, note_id):
    """The text of the version before the newest one, or None if there is no earlier text."""
    row = conn.execute(
        "SELECT content FROM demo_history WHERE note_id = ? ORDER BY version DESC LIMIT 1 OFFSET 1",
        (note_id,)).fetchone()
    return row[0] if row else None
