# UBC Rogers Databricks Hackathon — Team 1

Team workspace for the Rogers, Databricks, and UBC Data Intelligence for Smarter Communities Hackathon (September 25–27, ICICS Atrium).

Build one clear **transit and/or security** solution from the synthetic mobility table. Show the analysis in Databricks, and show the recommendation in a separate interactive tool (dashboard, app, or similar) that a judge can use.

## Data

Unity Catalog table `workspace.default.synthetic_data` (managed Delta) on workspace `dbc-d1555967-1ea3`. Query it with the Serverless Starter Warehouse. This Git folder is also checked out in that workspace.

| Column | Type | Meaning |
| --- | --- | --- |
| `location_name` | string | `UBC`, `Waterfront Station`, or `Park Royal Mall` |
| `longitude`, `latitude` | double | Coordinates of that place, repeated on every row. Not a per-person track, and not the origin’s location. |
| `timestamp` | timestamp | Visit start, a 1-second UTC instant. Bin and label hours in UTC. Do not convert to Pacific. |
| `origin` | string | Home area of the visit, one of 36 labels (Vancouver neighbourhoods, Metro municipalities, provinces, `International`, and `UBC`). Not a person id and not the previous stop. |
| `dwell_time` | bigint | Minutes the visit stays active after `timestamp`. Integer minutes, not a 30-minute unit. |

There is no device, subscriber, or visit id. A row is one visit. Do not link rows into people.

**Location: Waterfront Station.** Filter every analysis with `location_name = 'Waterfront Station'`.

The table has 21,496,090 rows, from `2025-11-01 00:00:00Z` through `2026-08-31 23:59:55Z`. Waterfront Station has 8,060,012 of those rows.

**Timezone: UTC.** Checked on the Serverless Starter Warehouse (session `Etc/UTC`) by comparing hour-of-day. Read as UTC, 91.0% of rows fall in 07:00–22:00 and 5.4% fall in 00:00–05:00. Converted to `America/Vancouver`, daytime falls to 56.6% and overnight rises to 33.9%. The same winner holds for UBC, Waterfront Station, and Park Royal Mall. A `Z` in exports matches this clock. 18:00 in the table is 18:00 UTC, not 6pm Pacific.

**Time grain.** At Waterfront Station every 30-minute UTC bin from `2025-11-01 00:00Z` through `2026-08-31 23:30Z` is occupied (14,592 bins). Rows are spread evenly inside each bin: minute offsets 0–29 each hold about 268,000 rows. Timestamps are whole seconds, and the share on an exact `:00` or `:30` matches a uniform 1-second clock. `dwell_time` runs from 1 to 17,941 minutes (median 53); 3.1% are multiples of 30. Keep 30-minute windows as the default aggregation. Do not snap events to the half hour. On this warehouse the session is already UTC, so `hour(timestamp)` and `window(timestamp, '30 minutes')` are the right bins. If a session is not UTC, convert to UTC before taking the hour. Do not convert to `America/Vancouver` for bins or axis labels.

The same origin has a median of 8 Waterfront rows in one 30-minute bin (up to 347). `longitude` and `latitude` on those rows are Waterfront’s coordinates.

Other datasets are allowed only if they are open source.

## How the rows were produced

The generator is not in this repo. Delta history is a file upload on 2026-09-25 21:39 UTC (`CREATE TABLE AS SELECT`, comment "Created by the file upload UI", 21,496,090 rows), then one `OPTIMIZE`. Organizers said the file is a statistical model of actual network data collected every second, adjusted where the synthetic aggregates deviated from the actual data. Cell-tower coverage radius, and devices registering on arrival and unregistering on departure, were applied before export.

Checked on the full table on 2026-09-26, all three `location_name` values:

- One coordinate per site, repeated on every row. Waterfront is `-123.1115, 49.2857` (Wikipedia pin `49.28583, -123.11167`). Park Royal is `-123.138, 49.3265` (Wikipedia `49.326, -123.137`). UBC is `-123.246, 49.2606`. The radius is not a column.
- `timestamp` is the register time. `dwell_time` is integer minutes until unregister. Median dwell is 53 minutes at Waterfront and 49 at UBC, flat across daytime hours. At Park Royal the median is 71 overall, about 44 overnight and about 80 in the afternoon. Within a site, median dwell barely changes by `origin`.
- The second-of-minute matches a uniform clock. Within the hour, the later 30 minutes are heavier while volume is rising and lighter while it is falling. That is the hourly rate, not a timetable snapped to `:00` or `:30`.
- Volume is place-specific. UBC weekdays follow the [UBC Vancouver 2025/26 academic calendar](https://vancouver.calendar.ubc.ca/academic-year-202526): term-time weekday means about 38,000–46,000, reading break Feb 16–20 about 23,000, winter break about 15,000, and a jump from 10,202 on Jan 4 to 40,500 on Jan 5 (Term 2 start). Waterfront on Jan 5 is 17,210. Park Royal peaks on Saturday, in December, and on Boxing Day 2025 (37,281, its busiest day).
- After hour, weekday, and half-hour, 30-minute counts are overdispersed versus Poisson (variance/mean 30 at Park Royal, 51 at Waterfront, 128 at UBC).
- [Open-Meteo](https://open-meteo.com/) daily rain and temperature at the Waterfront coordinate, 2025-11-01 through 2026-08-31, correlate near 0 with visit counts after month and weekday (about +0.05 at Park Royal, −0.02 at UBC, +0.05 at Waterfront). Weather is not a pattern to chase in this extract.
- Ontario is 16.7% of Waterfront rows and 17.4% of UBC rows, and 43.6% of Waterfront rows at 04:00 UTC, because local origins drop off faster overnight. Treat that night share as a flatter home-label component.

The charts for this section are recomputed in [notebooks/04_generation_report.py](notebooks/04_generation_report.py). It does not create a silver or gold table.

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
notebooks/02_grain_and_identity.py   # 30-minute grid vs 1-second clock; no visitor id
notebooks/03_waterfront_activity.py  # active visits by 30-minute bin and origin
notebooks/04_generation_report.py    # site calendars, dwell, and home-label mix
frontends/waterfront-presence-sketch/   # one test player; add other tools as sibling folders
```

## Frontends

Each prototype lives in its own folder under `frontends/`. `waterfront-presence-sketch` is one test player, not the team's finished tool. It plays Waterfront active-visit counts: a visit counts in each 30-minute UTC bin that overlaps `[timestamp, timestamp + dwell_time minutes)`. Circles are home areas, not people. Canada shows provinces and grouped regions. The Metro inset shows Vancouver neighbourhoods and municipalities. `International` is in the bars only.

From the 2026-09-26 extract: the busiest clock is 17:00 UTC, Wednesday is the busiest weekday, June 2026 has the most presence per day and August 2026 the least, and the largest origin totals are Ontario, Surrey, and Burnaby.

Home-area positions are centroids from open boundaries, cited in [frontends/waterfront-presence-sketch/public/data/origins.json](frontends/waterfront-presence-sketch/public/data/origins.json):

- City of Vancouver Open Data, `local-area-boundary`: https://opendata.vancouver.ca/explore/dataset/local-area-boundary/information/
- Statistics Canada 2021 digital boundary files `lpr_000b21a_e` and `lcsd000b21a_e`: https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/index2021-eng.cfm

The basemap is OpenStreetMap tiles. Run the sketch with:

```
cd frontends/waterfront-presence-sketch
npm install
npm run dev
```
