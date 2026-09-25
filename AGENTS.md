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
- `notebooks/` holds exploratory Databricks notebooks (`.py` files with `# Databricks notebook source`). The same folder is the Git folder in the Databricks workspace.
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
- `longitude` and `latitude` are the place’s coordinates, repeated on every row for that `location_name`. Do not treat them as a movement path or per-device GPS track.
- `origin` is the home region or province of the device or subscriber. It is not the previous stop.
- `dwell_time` is minutes (`bigint`).
- The data is synthetic. Do not attempt re-identification, and do not describe aggregates as real individuals.

## Location

The focus location is **not chosen yet**. Allowed values: `UBC`, `Waterfront Station`, `Park Royal Mall`.

- Once the team picks one, record it here and filter every query with `location_name = '<chosen>'`.
- Until then, do not mix the three places in one result unless each place is labeled.

## Time

- `timestamp` is a UTC instant. Span: `2025-11-01 00:00:00Z` through `2026-08-31 23:59:55Z`.
- Bin and label hours in UTC. Do not convert to `America/Vancouver` (or another Pacific zone) before taking the hour, the day, or a 30-minute window. That shift moves a daytime pattern into the overnight hours.
- Evidence from a full-table query: as UTC, 91.0% of rows are in 07:00–22:00 and 5.4% are in 00:00–05:00. As Pacific, those shares are 56.6% and 33.9%. UBC, Waterfront Station, and Park Royal Mall each prefer UTC. 18:00 in the table is 18:00 UTC, not 6pm Pacific.
- On the Serverless Starter Warehouse the session is `Etc/UTC`, so `hour(timestamp)` and `window(timestamp, '30 minutes')` are already UTC. If a session timezone is not UTC, convert to UTC first.
- Default temporal analysis to 30-minute bins. That is the grain the data was synthesized at.
- The check lives in [notebooks/01_timestamp_timezone.py](notebooks/01_timestamp_timezone.py). Do not redo it unless the table is reloaded.

## Build constraints

- Stay on one problem. Recommendations must be traceable to this table (and any cited open-source data), not assumptions.
- Extra datasets are allowed only if they are open source. Cite them.
- Prefer SQL and notebooks committed in this repo over one-off warehouse clicks. A reproducible pipeline is the analysis extra credit.
- The interactive tool (dashboard, app, or similar) is a separate deliverable from the Databricks analysis. It is the highest-weighted judging area.
- Do not commit tokens, Databricks profiles, warehouse credentials, or `.env` files.
- On shared notebooks, do not use Run All. It collides when several people share the workspace.
