# Five Bars 3G

**From cellular activity to emergency-response scenarios around Waterfront, Vancouver.**

Built for the **Rogers × UBC × Databricks — Data Intelligence for Smarter Communities Hackathon**.

Five Bars helps an emergency-management duty officer explore how a disruption could affect people around Waterfront and compare transport, support-location and supply options. It combines historical synthetic cellular attachment counts with geographic reference data and explicit response assumptions.

**[Databricks App](https://five-bars-3g-7474653168808484.aws.databricksapps.com/)** · **[Presentation notebook](https://dbc-d1555967-1ea3.cloud.databricks.com/editor/notebooks/1858570517273421?o=7474653168808484)** · **[Speaking script](rogers_waterfront_minute/presentation/PITCH_NOTES.md)**

The hosted app and notebook require appropriate Databricks access. This is a historical scenario prototype, not a live population feed.

## The problem and solution

During extreme weather, people near a transport hub may face different barriers to getting somewhere safe. A single area-wide count hides that variation. We use recorded home origins to add context, then let the operator explore disruption and support scenarios.

| Screen | Operator task |
|---|---|
| Situation | Inspect activity at a selected date/time and its origin composition |
| Crossings | Set crossing availability for a disruption scenario |
| Where to send people | Compare candidate support-location assignments under an assumed capacity |
| Supplies | Calculate conditional resource requirements and inventory gaps |
| Alert | Draft an area-facing message for review; no message is sent |

The current pitch focuses on **response**. Forecasting and seasonal preparation are outside the presentation scope. Home origin alone does not establish someone's destination, ability to travel or need for assistance; the app's response rules are scenario assumptions.

## Built with Databricks

![Bronze, Silver and Gold data flow](rogers_waterfront_minute/presentation/story_pipeline.png)

Databricks provides **Delta storage, Unity Catalog, SQL/Spark transformations, cumulative windows partitioned by origin, warehouse validation queries, and Databricks Apps hosting**.

Prepared datasets are under `workspace.rogers_waterfront_minute`:

| Layer | Dataset | One row represents | Verified rows |
|---|---|---|---:|
| Bronze | `bronze_attachments` | One original Waterfront attachment record | 8,060,012 |
| Silver | `silver_sessions_local` | One validated session with start/end times | 8,060,012 |
| Silver | `silver_origin_minute` | One origin at one minute, including zero counts | 15,759,360 |
| Gold | `gold_activity_minute` | One minute with a total and four bucket counts | 437,760 |

**Diagram note:** Silver is illustrated as an equivalent pivoted display: **437,760 minutes × 36 origin-count columns**. Its stored layout has 36 rows per minute. Gold has four bucket-count columns plus a total, alongside time and identifying fields.

### How presence is calculated

```text
end_time = start_time + dwell_time in minutes
active at time t when start_time <= t <= end_time
```

An attachment starting at **09:35:15** with **44 minutes** of dwell ends at **10:19:15**. It counts at 09:36 but not at 10:20. We apply the rule to every record, count by origin, then aggregate the origins into buckets.

Cleaning trims labels, parses time/duration fields, quarantines invalid temporal values and checks origin mappings. The current data has **zero temporal rejections**. **2,881 durations exceed 24 hours; they are flagged and retained.** Duplicate-looking records are retained because no device identifier establishes duplication.

### Four mutually exclusive origin buckets

| Bucket | Original labels | Definition |
|---|---:|---|
| Local to Waterfront | 2 | Downtown and West End |
| Vancouver City | 15 | Other supplied Vancouver neighbourhoods |
| Metro Vancouver | 12 | Other supplied Metro origins, including UBC |
| Outside Metro Vancouver | 7 | Supplied provincial, regional and international labels |

See the [complete mapping](rogers_waterfront_minute/silver/origin_mapping.json). The notebook visualises all 36 labels.

## Dataset and demonstration

Source: **`workspace.default.synthetic_data`**, supplied by the organisers. Fields are `location_name`, `longitude`, `latitude`, `timestamp`, `origin` and `dwell_time` in minutes.

The implemented pipeline selects **Waterfront Station**, with records spanning **November 2025–August 2026**. UBC and Park Royal are possible extensions, not completed pipelines here.

The source clock is treated as **assumed Vancouver local**, without subtracting an offset; this interpretation is not externally confirmed. The app uses half-hour snapshots, consistent with the organiser's recommended granularity. Reconstructing minute counts does not create new measured precision.

Suggested demo: **July 22, 2026 at 17:00**.

| Gold bucket | Active sessions |
|---|---:|
| Local to Waterfront | 378 |
| Other Vancouver City | 861 |
| Other Metro Vancouver | 1,918 |
| Outside Metro Vancouver | 1,215 |
| **Total** | **4,372** |

All 36 Silver origin counts reconcile to this total. The full Gold table has zero bucket-total mismatches. See the [verification artifact](rogers_waterfront_minute/presentation/visual_story_validation.json).

For the five-minute pitch: introduce the problem, spend about one minute on the visual data story, then demonstrate one disruption and its conditional support requirements in the app. A historical incident can motivate the scenario; it does not establish what caused patterns in the synthetic records.

## How the deployed app reads data

```text
Databricks Silver/Gold tables
        ↓ export and reconcile selected dates
JSON snapshots packaged with the React app
        ↓ deploy
Databricks Apps → browser cache → interactive scenario
```

The frontend teammate's deployment exports Silver at `:00` and `:30`, validates against Gold, and serves one JSON file per day. The browser caches the selected day. Reported exported dates are December 17–18, 2025; July 22–23, 2026; and August 22–23, 2026. Next-day files support scenarios crossing midnight.

**Catalogue changes do not automatically appear in the app.** Rebuild affected derived tables, re-export snapshots, redeploy and refresh cached files. No browser-side Databricks credentials or live SQL queries are needed during the demo.

## Run this checkout locally

With Node.js and npm installed, run from this directory:

```bash
cd real
npm install
npm run dev
```

Open **http://localhost:5175/**.

```bash
npm test           # frontend logic tests
npm run build      # type-check and production build
npm run preview    # preview the production build
```

**Checkout status:** `real/` is an earlier frontend snapshot. The teammate's deployed checkout uses `frontends/real/` and adds `server.mjs`, `app.yaml`, a `start` script and an export script; those files are not present here. Merge that deployment revision to reproduce the hosted build. In this local snapshot, missing exports can trigger labelled mock fallback, and the Databricks adapter is a stub. Check the data badge before presenting.

The deployed app uses a small Node server to serve built React assets and JSON. A notebook may trigger deployment, but the application runs independently in Databricks Apps. See the [Databricks deployment guide](https://docs.databricks.com/aws/en/dev-tools/databricks-apps/deploy).

## Reproduce the analysis

- [Current pipeline instructions](rogers_waterfront_minute/README.md): active SQL/Python entry points reuse existing cleaned attachments; they are not a fresh-workspace bootstrap.
- [Current SQL transformations](rogers_waterfront_minute/01_SQL_warehouse_pipeline.sql): local-clock Silver origin counts and Gold buckets.
- [Frontend data contract](rogers_waterfront_minute/gold/TEAM_HANDOFF.md): schema and examples.
- [Presentation notebook with saved outputs](rogers_waterfront_minute/presentation/Waterfront_final_presentation.ipynb): six visuals explaining the data story.
- [Standalone presentation HTML](rogers_waterfront_minute/presentation/Waterfront_final_presentation.html): download and open locally to view the saved figures.
- [Visual builder](rogers_waterfront_minute/presentation/build_visual_story.py) and [SQL queries](rogers_waterfront_minute/presentation/pitch_queries.json): chart construction and query provenance.

Saved figures were rendered from verified Databricks warehouse results. Notebook plotting cells can rerun the queries using Spark. Legacy scripts and older integration documents may use superseded UTC or interval-overlap definitions; follow the current pipeline instructions above.

## Repository layout

```text
real/                           Local React/Vite frontend snapshot
  src/                          Screens, adapters and scenario logic
  public/data/external/         Geographic references and scenario inputs
rogers_waterfront_minute/
  bronze/                       Source ingestion history
  silver/                       Cleaning, origin mapping and minute counts
  gold/                         Bucket aggregates and frontend contract
  presentation/                 Notebook, charts, script and verification
competition/                    Earlier exploration and external-data research
WORKSHOP_PREPARATION.md          Original workshop notes, archived
```

## Assumptions and limitations

- **Sessions are not unique people.** No device identifier or device-to-person calibration is available. Tower coverage is not a station boundary.
- **Origins are not destinations or assistance requests.** Travel and lodging classifications are scenario rules, not measured individual needs.
- **Support locations need operational confirmation.** A map listing does not establish opening status, staffing, usable capacity or suitability for overnight accommodation. Straight-line walking estimates are not safe route instructions.
- **Resources are conditional estimates.** Provision rates, attendance, duration, turnover and stock are inputs. Peak concurrent activity is not total people served over an event.
- **The pitch uses historical scenarios.** Live DriveBC mode is not part of the current demo flow; crossing settings should be explicit.
- **Alerts are drafts.** The prototype does not send messages or make operational dispatch decisions.

The local frontend snapshot groups UBC differently from the canonical Gold mapping. Align the UI with the mapping above when merging deployment changes; matching overall totals alone does not establish matching group totals.

## Sources and acknowledgements

- **Rogers, UBC and Databricks:** hackathon and organiser-provided synthetic cellular data.
- **City of Vancouver and geographic references:** source links in [hubs.json](real/public/data/external/hubs.json) and [origins.json](real/public/data/external/origins.json).
- **Crossing and incident references:** sources recorded in [crossings.json](real/public/data/external/crossings.json) and [incidents.json](real/public/data/external/incidents.json).
- **Resource inputs:** source links and assumptions in [rates.json](real/public/data/external/rates.json); these are prototype scenario inputs, not a validated emergency operating standard.
- **Workshop starter:** [Data Intelligence for Smarter Communities](https://github.com/databricks-solutions/data-intelligence-for-smarter-community).

The competition dataset is accessed through the team's Databricks workspace. External source terms remain applicable; this README does not grant redistribution rights to third-party data.
