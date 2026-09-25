# UBC Rogers Databricks Hackathon — Team 1

Team workspace for the Rogers, Databricks, and UBC Data Intelligence for Smarter Communities Hackathon (September 25–27, ICICS Atrium).

Build one clear **transit and/or security** solution from the synthetic mobility table. Show the analysis in Databricks, and show the recommendation in a separate interactive tool (dashboard, app, or similar) that a judge can use.

## Data

Unity Catalog table `workspace.default.synthetic_data` (managed Delta) on workspace `dbc-d1555967-1ea3`. Query it with the Serverless Starter Warehouse. This Git folder is also checked out in that workspace.

| Column | Type | Meaning |
| --- | --- | --- |
| `location_name` | string | `UBC`, `Waterfront Station`, or `Park Royal Mall` |
| `longitude`, `latitude` | double | Coordinates of that place, repeated on every row. Not a per-person track. |
| `timestamp` | timestamp | Event time stored as a UTC instant. Bin and label hours in UTC. Do not convert to Pacific. |
| `origin` | string | Home region or province of the device or subscriber (for example `Ontario`, `Saskatchewan and Territories`). |
| `dwell_time` | bigint | Minutes spent at the place. |

**Location is not chosen yet.** Once the team picks one, filter every analysis to that `location_name`.

The table has 21,496,090 rows, from `2025-11-01 00:00:00Z` through `2026-08-31 23:59:55Z`.

**Timezone: UTC.** Checked on the Serverless Starter Warehouse (session `Etc/UTC`) by comparing hour-of-day. Read as UTC, 91.0% of rows fall in 07:00–22:00 and 5.4% fall in 00:00–05:00. Converted to `America/Vancouver`, daytime falls to 56.6% and overnight rises to 33.9%. The same winner holds for UBC, Waterfront Station, and Park Royal Mall. A `Z` in exports matches this clock. 18:00 in the table is 18:00 UTC, not 6pm Pacific.

The table was synthesized at a 30-minute grain. Bin timestamps into 30-minute intervals on the UTC clock. On this warehouse the session is already UTC, so `hour(timestamp)` and `window(timestamp, '30 minutes')` are the right bins. If a session is not UTC, convert to UTC before taking the hour. Do not convert to `America/Vancouver` for bins or axis labels.

Other datasets are allowed only if they are open source.

## How this gets judged

| Area | Points |
| --- | --- |
| Interactive tool with recommendations grounded in the data | 25 |
| Databricks analysis (patterns, segmentation, visualization, or modeling) | 15 |
| Extra credit for a well-structured, reproducible pipeline | +5 |
| Originality and a clearly stated impact | 10 |
| 5-minute pitch | 5 |

Sunday presentations are 5 minutes plus a short Q&A.

## Repo

```
notebooks/01_timestamp_timezone.py   # UTC vs America/Vancouver check (verdict: UTC)
```

The front end is not in the repo yet.
