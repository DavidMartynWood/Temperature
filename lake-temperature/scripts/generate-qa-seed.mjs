// Writes SQL that fills the QA database with synthetic hourly readings for the last year (no future dates).
// Usage: node scripts/generate-qa-seed.mjs > qa-seed.sql
const HOURS = 24 * 365;
const HOUR_MS = 3600 * 1000;
const end = new Date();
end.setUTCMinutes(0, 0, 0);
const start = new Date(end.getTime() - (HOURS - 1) * HOUR_MS);

const rows = [];
for (let i = 0; i < HOURS; i++) {
  const t = new Date(start.getTime() + i * HOUR_MS);
  const dayOfYear = (Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) -
    Date.UTC(t.getUTCFullYear(), 0, 0)) / (24 * HOUR_MS);
  // Seasonal swing peaking in late July, plus a small daily cycle peaking mid-afternoon.
  const seasonal = 12 + 8 * Math.sin(2 * Math.PI * (dayOfYear - 110) / 365);
  const daily = 1.5 * Math.sin(2 * Math.PI * (t.getUTCHours() - 9) / 24);
  const temperature = Math.round((seasonal + daily) * 100) / 100;
  rows.push(`('${t.toISOString()}', ${temperature})`);
}

console.log("DELETE FROM readings;");
for (let i = 0; i < rows.length; i += 500) {
  console.log(`INSERT INTO readings (received_at, temperature_c) VALUES\n${rows.slice(i, i + 500).join(",\n")};`);
}
