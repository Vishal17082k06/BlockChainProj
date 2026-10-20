import sqlite3


def connect(path=":memory:"):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    init_db(conn)
    return conn


def init_db(conn):
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS note (
        noteid        INTEGER PRIMARY KEY AUTOINCREMENT,
        interactionid INTEGER NOT NULL,
        content       TEXT    NOT NULL,
        created_at    TEXT    DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS integrity_log (
        log_id       INTEGER PRIMARY KEY AUTOINCREMENT,
        record_type  TEXT    NOT NULL,
        record_id    INTEGER NOT NULL,
        version      INTEGER NOT NULL,
        record_hash  TEXT    NOT NULL,
        tx_hash      TEXT,
        block_number INTEGER,
        anchored_at  TEXT    DEFAULT CURRENT_TIMESTAMP
    );
    """)
    conn.commit()
