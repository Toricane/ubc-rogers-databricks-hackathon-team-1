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
- `notebooks/` holds exploratory Databricks notebooks (`.py` files with `# Databricks notebook source`). The same folder is the Git folder in the Databricks workspace. Current notebooks: `01_timestamp_timezone.py`, `02_grain_and_identity.py`.
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
- The timezone check lives in [notebooks/01_timestamp_timezone.py](notebooks/01_timestamp_timezone.py). The grain and identity check lives in [notebooks/02_grain_and_identity.py](notebooks/02_grain_and_identity.py). Do not redo either unless the table is reloaded.

## Build constraints

- Stay on one problem. Recommendations must be traceable to this table (and any cited open-source data), not assumptions.
- Extra datasets are allowed only if they are open source. Cite them.
- Prefer SQL and notebooks committed in this repo over one-off warehouse clicks. A reproducible pipeline is the analysis extra credit.
- The interactive tool (dashboard, app, or similar) is a separate deliverable from the Databricks analysis. It is the highest-weighted judging area.
- Do not commit tokens, Databricks profiles, warehouse credentials, or `.env` files.
- On shared notebooks, do not use Run All. It collides when several people share the workspace.
