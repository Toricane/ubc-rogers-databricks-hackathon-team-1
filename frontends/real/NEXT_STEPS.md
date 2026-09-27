# Next steps

## 1. Databricks App deployment (first)

Deploy Five Bars 3G as a Databricks App in the team workspace:

- Implement `DatabricksAdapter` in `src/data/adapter.ts`. It's a stub today, with intended endpoints `GET /api/dates` and `GET /api/presence?date=&slot=`.
- Serve those endpoints from a small backend that queries `workspace.default.synthetic_data` on the Serverless Starter Warehouse with the presence definition in `INTEGRATION.md`.
- Keep the 10-visit suppression on the server side.

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
