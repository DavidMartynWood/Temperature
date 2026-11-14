CREATE TABLE push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    saturday INTEGER NOT NULL DEFAULT 0,
    wednesday INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
