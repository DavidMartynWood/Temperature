-- Migration number: 0001 	 2026-10-17T10:14:28.796Z
CREATE TABLE readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at TEXT NOT NULL,
    temperature_c REAL NOT NULL
);

CREATE INDEX idx_readings_received_at
    ON readings(received_at);