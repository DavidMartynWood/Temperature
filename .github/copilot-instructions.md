# Copilot instructions

- The deployed Worker and website live in `lake-temperature/`; static files are in `lake-temperature/public/`.
- Validate website changes with `npm test` and `npm run typecheck` in `lake-temperature/`.
- Temperature labels, emojis and comments are defined in `lake-temperature/public/js/insights.js`. When they change, update the "Temperature ranges" table in `README.md` to match.
- Keep the UI simple: add range options to the existing graph rather than new cards.
- Omit parenthetical timezone labels from displayed dates and times.
- Keep changes small and surgical; update directly related documentation.
