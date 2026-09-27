# Five Bars 3G

A reactive tool for a City of Vancouver Emergency Management duty officer during an extreme-weather incident at the Waterfront Station area. It answers five questions, one per tab:

1. **Situation.** How many people are in the area, and can they get home?
2. **Crossings.** Which ways home are open?
3. **Where to send people.** Where do stranded people go?
4. **Supplies.** What do I deliver to each hub?
5. **Alert.** What do I tell people in the area?

It is not a planning or analysis tool. Trends, forecasts and routing are out of scope; see `NEXT_STEPS.md`.

## Run it

Run every command from inside `frontends/real/`.

```bash
npm install
npm run dev        # http://localhost:5175/
npm test           # Vitest, logic in src/lib/
npm run build      # type-check and production build
```

Useful URLs:

| URL | What it does |
|---|---|
| `/?demo=1` | Opens the Aug 22 lightning-storm incident on tab 1 |
| `/?offline=1` | Hides map tiles (no network needed for the map) |
| `/?data=mock` | Always uses mock presence numbers |
| `/?data=static` | Reads `public/data/internal/` (default); falls back to mock with a badge |
| `/?data=databricks` | Stub adapter; presence calls throw until it's built |

Keyboard: `←` and `→` step the time by 30 minutes. Keys `1` to `5` switch tabs. `Esc` closes the (i) drawer.

UI check: with the dev server running, `node scripts/ui-check.mjs http://localhost:5175/ <screenshot-folder>` clicks through all five tabs at 1280×720 with `?demo=1`, closes Lions Gate and Ironworkers, then SeaBus, and checks that everything updates. It uses the locally installed Chrome or Edge through `playwright-core`, so no browser is downloaded.

## Plug in the real data

The app needs presence counts only. The contract, file shapes and a PySpark snippet are in [INTEGRATION.md](INTEGRATION.md). In short:

1. Run the snippet in the team Databricks workspace (it only reads `workspace.default.synthetic_data`).
2. Copy `dates.json` and `presence/{date}.json` into `public/data/internal/`.
3. Reload. The "Mock data" badge disappears once the files load.

The `slot_start` values in `public/data/external/incidents.json` still need confirming against the dataset clock (see TODOs below).

## Layout

```
src/
  App.tsx                 incident bar, tabs, state, keyboard
  model.ts                derives everything the tabs show
  data/
    types.ts              FiveBarsData interface and shapes
    adapter.ts            MockAdapter, StaticAdapter, DatabricksAdapter (stub)
    external.ts           loads public/data/external/*.json
    mock.ts               mock presence (made-up numbers, real 36 labels)
  lib/
    logic.ts              situation, canGetHome, assignHubs, supplies, alertText
    logic.test.ts         Vitest
    drivebc.ts            Open511 client (adapted from teammate's map)
    geo.ts, time.ts       haversine, walking time; "HH:MM" arithmetic
  tabs/                   one file per tab
  components/             MapFrame, marker icons, ChangeDialog, InfoDrawer
  styles/tokens.css       design tokens (the only colours used)
public/data/external/     reviewed reference data, every record sourced
public/data/internal/     presence files from the team (not committed yet)
scripts/ui-check.mjs      click-through check at 1280×720
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
| Incidents with no sourced time open at 17:00 (busiest clock at Waterfront, repo AGENTS.md) | `ChangeDialog.tsx` |
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

- Presence comes from a synthetic table built to resemble one carrier's network. It has no device, subscriber or visit ID, and rows are never linked into people. One visit is not one person.
- Only totals by home area are shown. Cells with fewer than 10 visits are hidden, and the (i) drawer says how many were hidden.
- DriveBC requests carry no email or personal data.
- The alert tab drafts content for an area broadcast. It doesn't send anything and doesn't target individuals.
