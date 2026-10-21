interface Env {
  lake_temperature_db: D1Database;
  INGEST_TOKEN: string;
  READ_ONLY?: string;
  /** Overrides EARLIEST_HISTORY_DATE (YYYY-MM-DD), e.g. for the QA instance. */
  EARLIEST_HISTORY_DATE?: string;
}

interface ReadingRequest {
  timestamp: string;
  temperature_c: number;
}
