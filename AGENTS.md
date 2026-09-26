# Agent instructions

This repo is the team workspace for the Rogers / Databricks / UBC smarter-communities hackathon. The solution must address one clear transit and/or security problem, with evidence from the synthetic mobility table and a recommendation a judge can see in a separate interactive tool.

Read [README.md](README.md) for the table contract and scoring weights. Follow the rules below when writing SQL, notebooks, or application code.

## Living documentation

[README.md](README.md) and [AGENTS.md](AGENTS.md) are the current record of the problem, scope, working directory, and Databricks setup. Update both in the same change whenever any of these change:

- Problem or scope: which `location_name`, transit vs security, what the tool is for
- Working directory layout: new notebooks, apps, or pipelines
- Databricks workspace, catalog, schema, table, or warehouse
- A confirmed data fact, including the timestamp timezone

Notebook output is not a substitute. Confirmed facts belong in both files, not only in query output.

## Working directory

- Repo root is this directory, `ubc-rogers-databricks-hackathon-team-1`.
- `notebooks/` holds exploratory Databricks notebooks (`.py` files with `# Databricks notebook source`). The same folder is the Git folder in the Databricks workspace. Current notebooks: `01_timestamp_timezone.py`, `02_grain_and_identity.py`, `03_waterfront_activity.py`, `04_generation_report.py`.
- `frontends/` holds separate prototypes. Each tool gets its own folder so several people can keep different frontends in this repo. `frontends/waterfront-presence-sketch/` is one test player for Waterfront active-visit counts, not the team's finished tool. Counts and centroids live in `frontends/waterfront-presence-sketch/public/data/`. Run it with `npm install` and `npm run dev` inside that folder.
- Do not put warehouse credentials, profiles, or `.env` files anywhere in the tree.

## Databricks

- Host: `dbc-d1555967-1ea3.cloud.databricks.com`
- Table: `workspace.default.synthetic_data` (managed Delta, 21,496,090 rows)
- Warehouse: Serverless Starter Warehouse, id `20565b42b4da4903`. Its session timezone is `Etc/UTC`.
- Local CLI profile for this workspace is `hackathon` (`databricks -p hackathon`). Do not commit `%USERPROFILE%\.databrickscfg`.
- Notebooks in `notebooks/` run in this workspace against that table. Do not point them at another catalog.

## Data contract

- Fully qualify the table as `workspace.default.synthetic_data`. It is a managed Delta table on workspace `dbc-d1555967-1ea3`, queried with the Serverless Starter Warehouse.
- Do not invent rows, coordinates, counts, or other statistics. If a number is not from a query or a cited open-source source, do not state it.
- `longitude` and `latitude` are the place’s coordinates, repeated on every row for that `location_name`. Do not treat them as a movement path, a per-device GPS track, or the origin’s location.
- `origin` is the home area of the visit, one of 36 labels (Vancouver neighbourhoods, Metro municipalities, provinces, `International`, and `UBC`). It is not the previous stop and not a person id.
- `dwell_time` is minutes (`bigint`): how long that visit stays active after `timestamp`. It is not quantized to 30 minutes.
- There is no device, subscriber, or visit identifier. A row is one visit interval. Do not link rows into people.
- The data is synthetic. Do not attempt re-identification, and do not describe aggregates as real individuals.

## Generation

The generator is not in this repo. Delta history is a file upload on 2026-09-25 21:39 UTC (comment "Created by the file upload UI", 21,496,090 rows), then one `OPTIMIZE`. Organizers described a statistical model of actual per-second network data, adjusted toward the real aggregates. Coverage radius and register/unregister happened before export. Full write-up is in [README.md](README.md).

Confirmed on the full table on 2026-09-26:

- One coordinate per `location_name`, on every row. Waterfront `-123.1115, 49.2857`. Park Royal `-123.138, 49.3265`. UBC `-123.246, 49.2606`. The radius is not a column.
- `timestamp` is register time. `dwell_time` is integer minutes to unregister. Median dwell is 53 min at Waterfront and 49 at UBC, flat in daytime. Park Royal median is 71, about 44 overnight and about 80 in the afternoon. Median dwell barely changes by `origin` inside a site.
- Seconds match a uniform clock. The later half-hour is heavier while the hourly rate is rising and lighter while it is falling. That is the rate curve, not a `:00`/`:30` timetable.
- Calendars differ by site. UBC weekdays follow the UBC Vancouver 2025/26 calendar (https://vancouver.calendar.ubc.ca/academic-year-202526): about 38,000–46,000 in term, about 23,000 on the Feb 16–20 reading break, about 15,000 in winter break, and 10,202 on Jan 4 then 40,500 on Jan 5. Waterfront on Jan 5 is 17,210. Park Royal’s busiest day is Boxing Day 2025 (37,281).
- 30-minute counts are overdispersed versus Poisson after hour, weekday, and half-hour (variance/mean 30 at Park Royal, 51 at Waterfront, 128 at UBC).
- Open-Meteo daily rain and temperature at the Waterfront coordinate, 2025-11-01 through 2026-08-31, correlate near 0 with counts after month and weekday (about +0.05, −0.02, +0.05). Do not explain spikes as weather.
- Ontario is 16.7% of Waterfront rows and 17.4% of UBC rows, and 43.6% of Waterfront rows at 04:00 UTC, because local origins fall faster overnight. Treat that as a flatter home-label component.
- Those checks are recomputed with charts in [notebooks/04_generation_report.py](notebooks/04_generation_report.py). Do not create a silver or gold table from that notebook.

## Location

The focus location is **Waterfront Station** (8,060,012 rows). Filter every query with `location_name = 'Waterfront Station'`.

The same origin has a median of 8 rows in one 30-minute bin at this station, and up to 347. Those rows are separate visits.

## Time

- `timestamp` is a 1-second UTC instant. Span: `2025-11-01 00:00:00Z` through `2026-08-31 23:59:55Z`. Whole seconds only; no subsecond component at Waterfront Station.
- Bin and label hours in UTC. Do not convert to `America/Vancouver` (or another Pacific zone) before taking the hour, the day, or a 30-minute window. That shift moves a daytime pattern into the overnight hours.
- Evidence from a full-table query: as UTC, 91.0% of rows are in 07:00–22:00 and 5.4% are in 00:00–05:00. As Pacific, those shares are 56.6% and 33.9%. UBC, Waterfront Station, and Park Royal Mall each prefer UTC. 18:00 in the table is 18:00 UTC, not 6pm Pacific.
- On the Serverless Starter Warehouse the session is `Etc/UTC`, so `hour(timestamp)` and `window(timestamp, '30 minutes')` are already UTC. If a session timezone is not UTC, convert to UTC first.
- Default temporal analysis to 30-minute bins. At Waterfront Station those 14,592 bins (every bin from `2025-11-01 00:00Z` through `2026-08-31 23:30Z`) are all occupied, and rows are spread evenly inside each bin (minute offsets 0–29 each hold about 268,000 of 8,060,012 rows). The 30-minute window is the coverage grid, not a snapped event clock. Do not snap timestamps to `:00` or `:30`.
- Waterfront `dwell_time` is an integer minute from 1 to 17,941 (median 53). 3.1% are multiples of 30.
- The timezone check lives in [notebooks/01_timestamp_timezone.py](notebooks/01_timestamp_timezone.py). The grain and identity check lives in [notebooks/02_grain_and_identity.py](notebooks/02_grain_and_identity.py). Active-visit counts for the sketch player live in [notebooks/03_waterfront_activity.py](notebooks/03_waterfront_activity.py). Do not redo them unless the table is reloaded.
- The sketch bins presence in 30-minute UTC windows. A visit is active on a bin when `[timestamp, timestamp + dwell_time minutes)` overlaps it. On the 2026-09-26 extract the busiest clock is 17:00 UTC, Wednesday is the busiest weekday, June 2026 has the most presence per day, and August 2026 the least. Ontario, Surrey, and Burnaby are the largest origin totals.
- Origin dots use centroids from City of Vancouver Open Data `local-area-boundary` and Statistics Canada 2021 boundary files `lpr_000b21a_e` and `lcsd000b21a_e`. The crosswalk is [frontends/waterfront-presence-sketch/public/data/origins.json](frontends/waterfront-presence-sketch/public/data/origins.json). `International` has no point. The UBC dot is the campus piece of census subdivision Metro Vancouver A, not the centroid of that whole subdivision.

## Build constraints

- Stay on one problem. Recommendations must be traceable to this table (and any cited open-source data), not assumptions.
- Extra datasets are allowed only if they are open source. Cite them.
- Prefer SQL and notebooks committed in this repo over one-off warehouse clicks. A reproducible pipeline is the analysis extra credit.
- The interactive tool (dashboard, app, or similar) is a separate deliverable from the Databricks analysis. It is the highest-weighted judging area.
- Do not commit tokens, Databricks profiles, warehouse credentials, or `.env` files.
- On shared notebooks, do not use Run All. It collides when several people share the workspace.
