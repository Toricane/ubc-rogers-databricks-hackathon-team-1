# Next steps

## 0. Pitch prep (open)

- Integrate `capacity_profile.json` (median daily peak 3009.5, 90th percentile 4429 sessions, June–August 2026) once the file is available. The file wasn't found in this repo or the workspace. Both numbers were reproduced from `gold_activity_minute` using half-hour samples and `percentile_cont`. Label it as historical capacity planning, not a forecast.

## 1. Databricks App (static, done for the pitch)

The app is hosted as static files: a Vite build plus `server.mjs` and `app.yaml`, with exported snapshots under `dist/data/`. See the README's hosting section. To add dates, run `scripts/export_databricks.py` and redeploy.

After the pitch, not before it: a live backend could implement the `DatabricksAdapter` stub (`GET /api/dates`, `GET /api/presence?date=&slot=`) against `silver_origin_minute`, using the metric in `INTEGRATION.md`. It must use the app's service principal, never browser credentials.

## 2. Data TODOs (open now)

- Confirm each incident's `slot_start` against the dataset clock (`public/data/external/incidents.json`).
- Confirm the Sphere Handbook quote and page number by hand (the PDF blocks automated fetch).
- Find an incident-specific `duration_h` for each preset, if any source publishes one.
- Review the team assumption for which crossings each Metro origin needs (`origins.json`).
- Run the PySpark snippet and drop the files into `public/data/internal/`.

## Out of scope for this build

These were left out on purpose. Ask before adding any of them:

- Trends or comparisons with other days
- Planning or prevention views
- Forecasting
- Routing or turn-by-turn directions (tab 3 draws assignment lines, not routes)
- Sending alerts (tab 5 only drafts text)
- Hub capacity claims (the City doesn't publish them; the tool uses an officer setting)
- Hospitals
- Locations other than Waterfront Station
- Login
- A Databricks App deployment (listed first above)

## Nice to have, not requested

- A test for `matchCrossings` in `src/lib/drivebc.ts` against a recorded Open511 response.
- Remember the officer's on-hand stock between reloads.
