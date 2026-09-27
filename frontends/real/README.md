# Cell-Safe

Built by team **Five Bars 3G** for the Rogers × Databricks × UBC smarter-communities hackathon.

A reactive tool for a City of Vancouver Emergency Management duty officer during an extreme-weather incident at the Waterfront Station area. It answers five questions, one per tab:

1. **Situation.** How many people are in the area, and can they get home?
2. **Crossings.** Which ways home are open?
3. **Where to send people.** Where do stranded people go?
4. **Supplies.** What do I deliver to each hub?
5. **Alert.** What do I tell people in the area?

The tool treats **Wednesday, July 22, 2026** (a heat and wildfire-smoke day) as "today". It replays that day of the synthetic data minute by minute, so the pitch feels like a live incident. The data is used exactly as exported; only the framing is "day of". The officer picks the type of weather; the day stays fixed. The app opens with a short animated splash that any click or key skips; with reduced motion it shows a still logo.

It is not a planning or analysis tool. Trends, forecasts and routing are out of scope; see `NEXT_STEPS.md`.

## Run it

Run every command from inside `frontends/real/`.

```bash
npm install
npm run dev        # http://localhost:5175/  (development)
npm test           # Vitest, logic in src/lib/
npm run build      # type-check and production build into dist/
npm start          # serve dist/ with server.mjs (same server as Databricks Apps), port 8000 or $PORT
```

Useful URLs:

| URL | What it does |
|---|---|
| `/` | Opens on Jul 22 at the current clock time (rounded down to :00 or :30) |
| `/?demo=1` | Opens on Jul 22 at 17:00 on tab 1, same every time (use for the pitch) |
| `/?offline=1` | Hides map tiles, so the map needs no network |
| `/?data=static` | Exported Databricks snapshots (the default). Missing dates show an error, never mock numbers |
| `/?data=mock` | Made-up numbers for development, always with the "Mock data" badge |

Keyboard: `←` and `→` step the time by 30 minutes. Keys `1` to `5` switch tabs. `Esc` closes the (i) drawer.

UI check: with a server running, `node scripts/ui-check.mjs http://127.0.0.1:8000/ <screenshot-folder>` clicks through all five tabs at 1280×720 with `?demo=1`. It checks that the totals on screen equal the gold totals in `manifest.json`, skips the splash, toggles crossings, switches the weather, steps the time past midnight into Jul 23, and checks that ← stops at Jul 22 00:00. It uses the locally installed Chrome or Edge through `playwright-core`.

## Data

The numbers come from exported snapshots of `workspace.rogers_waterfront_minute.silver_origin_minute`, sampled at `:00` and `:30` and checked against `gold_activity_minute`. See [INTEGRATION.md](INTEGRATION.md) for the metric, file shapes, and how to export more dates.

- **Metric:** simultaneous active attachment sessions (`start <= t <= start + dwell_time`) at the exact minute shown.
- **Clock:** kept as recorded, assumed to be Vancouver local time (not confirmed).
- **Counts:** actual values, with no suppression. They're sessions, not verified people. "Stranded" is the tool's estimate.
- **Dates exported:** 2025-12-17, 2025-12-18, 2026-07-22, 2026-07-23, 2026-08-22, 2026-08-23.

## Hosting (Databricks Apps)

The app is plain files: a Vite build plus `server.mjs`, a dependency-free Node static server.

- `app.yaml` runs `node server.mjs`. The server binds `0.0.0.0` on `DATABRICKS_APP_PORT` (or `PORT`, or 8000).
- Databricks Apps runs `npm install` and then `npm run build`. Everything the build needs is in `dependencies`.
- The JSON snapshots ship inside `dist/data/`. The server lets browsers cache them for an hour; hashed JS and CSS are cached as immutable, and `index.html` is always revalidated. `StaticAdapter` also keeps each day in memory.
- Missing data files return a real 404. Only app routes fall back to `index.html`.

Deploy (the CLI must be signed in to the workspace):

```bash
databricks apps create five-bars-3g                     # once
databricks sync . /Workspace/Users/<you>/five-bars-3g    # from frontends/real; skips node_modules and dist
databricks apps deploy five-bars-3g --source-code-path /Workspace/Users/<you>/five-bars-3g
```

**Offline fallback for the pitch:** run `npm run build`, then `npm start`, and open `http://localhost:8000/?demo=1&offline=1`. With `offline=1` the map draws its markers without tiles, so nothing needs the internet. Copying `dist/` and `server.mjs` to another machine with Node is enough to run it.

## Layout

```
src/
  App.tsx                 incident bar, tabs, state, keyboard
  model.ts                derives everything the tabs show
  data/
    types.ts              CellSafeData interface and shapes
    adapter.ts            StaticAdapter (default), MockAdapter, DatabricksAdapter (stub)
    external.ts           loads public/data/external/*.json
    mock.ts               mock presence (made-up numbers, real 36 labels)
  lib/
    logic.ts              situation, canGetHome, assignHubs, supplies, alertText
    logic.test.ts         Vitest
    drivebc.ts            Open511 client (adapted from teammate's map)
    geo.ts, time.ts       haversine, walking time; "HH:MM" arithmetic
  tabs/                   one file per tab
  components/             Splash, Logo, MapFrame, marker icons, ChangeDialog (weather picker), InfoDrawer
  styles/tokens.css       design tokens (the only colours used)
public/data/external/     reviewed reference data, every record sourced
public/data/internal/     exported Databricks snapshots + manifest.json
scripts/export_databricks.py  read-only export with gold checks
scripts/ui-check.mjs      click-through check at 1280×720
server.mjs, app.yaml      static server and Databricks Apps config
```

## How it decides

- **Groups.** "Vancouver" means City of Vancouver local areas plus UBC. "Metro" means other Metro Vancouver municipalities. "Outside Metro" means other provinces, "British Columbia Other" and "International".
- **Getting home.**
  - Vancouver goes home.
  - Metro goes home if any of its listed crossings is open. An empty list (Burnaby, New Westminster, Port Moody) means home by road. Otherwise they're stranded and waiting.
  - Outside Metro needs lodging.
- **Hubs.**
  - Hubs are sorted by walking time from Waterfront, using straight-line distance at 5 km/h.
  - Each hub is filled up to "max people per hub" (default 500) before the next one is used. Waiting people are placed first, then lodging.
- **Supplies.**
  - Needed = people × rate × (duration ÷ 24 for per-day items), rounded up. To deliver = needed − on hand.
  - Cots and blankets count only people staying overnight.
  - Only the resources for the incident's hazard are shown.
- **Crossings.**
  - Past incidents use the incident record (no closures are sourced yet), and the officer sets the rest.
  - A Custom incident dated today uses live DriveBC major events: an event within 1 km that matches the crossing's highway, or any event within 1 km for crossings without a highway.
  - The officer's toggles always win.

## Assumptions

| Assumption | Where |
|---|---|
| Walking speed 5 km/h, straight line | `src/lib/geo.ts` |
| Max people per hub 500 (hub capacities aren't published) | tab 3 setting |
| Which crossings each Metro origin needs | `origins.json`, `crossings_source: team_assumption` |
| Cots and blankets 1 per lodging person; N95 1 per person in smoke; charging 1 per 10 people | `rates.json` |
| Cooled floor space for heat reuses the Sphere 4.5 m² rate | `rates.json` |
| Delivery deadline = incident time + 1 hour, as a target | tab 4 |
| Jul 22, 2026 is shown as "today"; time runs from Jul 22 00:00 to Jul 23 23:30 | `App.tsx` (`SCENARIO_DATE`) |
| Resource rates and max people per hub are scenario assumptions, not measurements | tabs 3–4, (i) drawer |
| Water duration 72 h for every incident (Canada.ca default) | `incidents.json` |

### Open TODOs in the data

- `incidents.json`:
  - The `slot_start` values need confirming against the dataset clock. `aug22` uses 21:30, the CP24 ground-stop start in Pacific time; `dec17` and `jul22` have no time in their sources.
  - `duration_h` has no incident-specific source.
- `rates.json`: the Sphere PDF returned HTTP 403 to automated fetch, so the quote and page number need checking by hand.

## Sources

| Data | Source |
|---|---|
| 25 disaster support hubs | [City of Vancouver VanMap KML](https://vanmapp1.vancouver.ca/googleKml/DisasterSupportHubs/) |
| Vancouver home-area points | [City of Vancouver Open Data, local-area-boundary](https://opendata.vancouver.ca/explore/dataset/local-area-boundary/information/) via the team's sketch crosswalk |
| Metro home-area points | [Statistics Canada 2021 boundary files](https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/index2021-eng.cfm) via the team's sketch crosswalk |
| Crossing locations and highway names | Wikipedia articles, linked per record in `crossings.json` |
| Live road events | [DriveBC Open511](https://api.open511.gov.bc.ca/), Open Government Licence – British Columbia |
| Water 4 L/person/day, 72 h | [Canada.ca, Emergency kits](https://www.canada.ca/en/services/policing/emergencies/preparedness/get-prepared/emergency-kits.html) |
| Floor space 4.5–5.5 m² | [The Sphere Handbook 2018](https://spherestandards.org/wp-content/uploads/Sphere-Handbook-2018-EN.pdf), Shelter standard 3 |
| Mask note | [BC Gov News 2026HLTH0071-000954](https://news.gov.bc.ca/releases/2026HLTH0071-000954) |
| Dec 17 storm | [BC Hydro](https://www.bchydro.com/news/press_centre/news_releases/2025/strong-wind-and-heavy-rain-leave-about-120-000-bc-hydro-customer.html) |
| Jul 22 heat and smoke | [Anywhere Vancouver](https://anywherevancouver.com/heat-air-quality-warnings-metro-vancouver-july-22-2026/) |
| Aug 22 lightning storm | [CP24](https://www.cp24.com/news/canada/2026/08/23/lightning-thunderstorm-impact-operations-at-vancouver-airport/) |
| Map tiles | Esri World Street Map, full colour, same approach as the teammate's map |

## Privacy

- Presence comes from a synthetic table built to resemble one carrier's network. Only totals per home area and time slot are exported, with no device, subscriber or session IDs. One session is not one person.
- Counts are actual values with no suppression, as the team's prepared tables provide them.
- No Databricks credentials are shipped. The export runs on a signed-in laptop and writes plain JSON.
- DriveBC requests carry no email or personal data.
- The alert tab drafts content for an area broadcast. It doesn't send anything and doesn't target individuals.
