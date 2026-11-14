interface Env {
  ASSETS: Fetcher;
  lake_temperature_db: D1Database;
  INGEST_TOKEN: string;
  READ_ONLY?: string;
  /** Overrides EARLIEST_HISTORY_DATE (YYYY-MM-DD), e.g. for the QA instance. */
  EARLIEST_HISTORY_DATE?: string;
  /** Passphrase for POST /api/partners/uncover. Falls back to stub CODE when unset. */
  PARTNERS_PASSPHRASE?: string;
  /** JSON map of partner id → hidden fields. Falls back to stub when unset. */
  PARTNERS_HIDDEN?: string;
  /** Web Push (VAPID) public key, base64url. Generate with scripts/generate-vapid-keys.mjs. */
  VAPID_PUBLIC_KEY?: string;
  /** Web Push (VAPID) private key as a JWK JSON string. */
  VAPID_PRIVATE_KEY?: string;
  /** Contact for push services, a mailto: or https: URL. */
  VAPID_SUBJECT?: string;
}

interface ReadingRequest {
  timestamp: string;
  temperature_c: number;
}
