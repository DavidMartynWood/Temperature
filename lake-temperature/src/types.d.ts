interface Env {
  lake_temperature_db: D1Database;
  INGEST_TOKEN: string;
}

interface ReadingRequest {
  timestamp: string;
  temperature_c: number;
}
