interface Env {
  lake_temperature_db: D1Database;
  INGEST_TOKEN: string;
  READ_ONLY?: string;
}

interface ReadingRequest {
  timestamp: string;
  temperature_c: number;
}
