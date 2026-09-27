import { useCallback, useEffect, useMemo, useState } from "react";
import { createAdapter, StaticAdapter, type SnapshotManifest } from "./data/adapter";
import type { CrossingStatus, DispatchRow, Hazard, Incident, PresenceRow, Rate, Reference, Transit, Transport } from "./data/types";
import { lastFetchSource } from "./lib/drivebc";
import { shortDate, stepSlot } from "./lib/time";
import { buildModel, fmt, incidentName } from "./model";
import { ChangeDialog } from "./components/ChangeDialog";
import { InfoDrawer } from "./components/InfoDrawer";
import { SituationTab } from "./tabs/Situation";
import { GettingHomeTab } from "./tabs/GettingHome";
import { SendPeopleTab } from "./tabs/SendPeople";
import { SuppliesTab } from "./tabs/Supplies";
import { AlertTab } from "./tabs/Alert";

type TabId = 1 | 2 | 3 | 4 | 5;

const TABS: { id: TabId; label: string; question: string }[] = [
  { id: 1, label: "Situation", question: "How many people are in the area, and can they get home?" },
  { id: 2, label: "Getting home", question: "Which ways home are open, and which buses get people there?" },
  { id: 3, label: "Where to send people", question: "Where do stranded people go?" },
  { id: 4, label: "Supplies", question: "What do I deliver to each hub?" },
  { id: 5, label: "Alert", question: "What do I tell people in the area?" },
];

const params = new URLSearchParams(window.location.search);
const DEMO = params.get("demo") === "1";
const OFFLINE = params.get("offline") === "1";

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function App() {
  const adapter = useMemo(() => createAdapter(), []);
  const today = useMemo(todayLocal, []);

  const [ref, setRef] = useState<Reference | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [presenceError, setPresenceError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<SnapshotManifest | null>(null);

  const [incident, setIncident] = useState<Incident | null>(null);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [rows, setRows] = useState<PresenceRow[] | null>(null);
  const [rates, setRates] = useState<Rate[]>([]);
  const [base, setBase] = useState<CrossingStatus[]>([]);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [maxPerHub, setMaxPerHub] = useState(500);
  const [onHand, setOnHandState] = useState<Record<string, Record<string, number | undefined>>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [mock, setMock] = useState(adapter.isMock());
  const [dispatch, setDispatch] = useState<DispatchRow[] | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [transit, setTransit] = useState<Transit | null>(null);
  const [transport, setTransport] = useState<Transport | null>(null);
  const [busSetupError, setBusSetupError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabId>(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const live = incident !== null && incident.date === today;

  // Reference data, incidents, dates.
  useEffect(() => {
    Promise.all([adapter.getReference(), adapter.getIncidents(), adapter.getHazards(), adapter.getDates()])
      .then(([r, inc, hz, ds]) => {
        setRef(r);
        setIncidents(inc);
        setHazards(hz);
        setDates(ds);
        setMock(adapter.isMock());
        if (adapter instanceof StaticAdapter) adapter.getManifest().then(setManifest);
        const demo = DEMO ? inc.find((i) => i.id === "aug22") : undefined;
        if (demo) openIncident(demo, demo.slot_start ?? "17:00");
        else setDialogOpen(true);
      })
      .catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter]);

  const openIncident = useCallback((inc: Incident, s: string) => {
    setIncident(inc);
    setDate(inc.date);
    setSlot(s);
    setOverrides({});
    setOnHandState({});
    setRefreshNote(null);
    setDialogOpen(false);
    setTab(1);
  }, []);

  // Presence for the current date and slot.
  useEffect(() => {
    if (!date || !slot) return;
    let stale = false;
    adapter
      .getPresence(date, slot)
      .then((r) => {
        if (stale) return;
        setRows(r);
        setPresenceError(null);
        setMock(adapter.isMock());
      })
      .catch((e) => {
        if (stale) return;
        setRows(null);
        setPresenceError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      stale = true;
    };
  }, [adapter, date, slot]);

  // Tab 2 routes and bus settings. A failure here only affects tab 2.
  useEffect(() => {
    Promise.all([adapter.getTransit(), adapter.getTransport()])
      .then(([t, tp]) => {
        setTransit(t);
        setTransport(tp);
      })
      .catch((e) => setBusSetupError(e instanceof Error ? e.message : String(e)));
  }, [adapter]);

  // Departures for tab 2 at the current date and slot. Missing dates are an error, never mock numbers.
  useEffect(() => {
    if (!date || !slot) return;
    let stale = false;
    adapter
      .getDispatch(date, slot)
      .then((d) => {
        if (stale) return;
        setDispatch(d);
        setDispatchError(null);
      })
      .catch((e) => {
        if (stale) return;
        setDispatch(null);
        setDispatchError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      stale = true;
    };
  }, [adapter, date, slot]);

  // Rates and crossing status for the incident.
  useEffect(() => {
    if (!incident) return;
    adapter.getRates(incident.hazard).then(setRates);
    adapter
      .getCrossingStatus(incident.date === today ? "live" : "incident", incident.id)
      .then((s) => {
        setBase(s);
        if (incident.date === today) setRefreshNote(lastFetchSource() === "fallback" ? "DriveBC unreachable — showing saved snapshot" : null);
      });
  }, [adapter, incident, today]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      setBase(await adapter.getCrossingStatus("live"));
      setRefreshNote(lastFetchSource() === "fallback" ? "DriveBC unreachable — showing saved snapshot" : "Up to date (refreshes at most every 5 minutes)");
    } finally {
      setRefreshing(false);
    }
  };

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!date) return;
      const next = stepSlot(date, slot, dir);
      setDate(next.date);
      setSlot(next.slot);
    },
    [date, slot],
  );

  const toggle = useCallback(
    (id: string) => {
      setOverrides((o) => {
        const b = base.find((x) => x.id === id);
        const current = o[id] ?? b?.closed ?? false;
        return { ...o, [id]: !current };
      });
    },
    [base],
  );

  const setOnHand = (hubId: string, resId: string, v: number | undefined) =>
    setOnHandState((s) => ({ ...s, [hubId]: { ...s[hubId], [resId]: v } }));

  // Keyboard: ←/→ step time, 1–5 switch tabs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, dialog") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (/^[1-5]$/.test(e.key)) setTab(Number(e.key) as TabId);
      else if (e.key === "Escape") setDrawerOpen(false);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const model = useMemo(() => {
    if (!ref || !incident || !rows) return null;
    return buildModel({
      ref, incident, hazard: hazards.find((h) => h.id === incident.hazard), date, slot, rows,
      base, overrides, maxPerHub, rates, onHand, dispatch, dispatchError, transit, transport,
    });
  }, [ref, incident, hazards, date, slot, rows, base, overrides, maxPerHub, rates, onHand, dispatch, dispatchError, transit, transport]);

  const badge = (id: TabId): number | null => {
    if (!model) return null;
    switch (id) {
      case 1: return model.sit.total;
      case 2: return model.busesNeeded > 0 ? model.busesNeeded : model.closed.size;
      case 3: return model.st.total;
      case 4: return model.plan.active.length;
      case 5: return model.alert ? model.alert.split("\n").length : 0;
    }
  };

  const current = TABS.find((t) => t.id === tab)!;
  const name = incident ? incidentName(incident, shortDate) : "";

  return (
    <div className="app">
      <header className="topbar">
        <span className="product">Five Bars 3G</span>
        <span className="topbar-sub">Waterfront Station area · Emergency Management duty officer</span>
      </header>

      <div className="incident">
        <span className="label">INCIDENT</span>
        {incident ? (
          <span className="incident-text" title={incident.description}>
            <span className="name">{name}</span>
            <span className="desc">{incident.description}</span>
          </span>
        ) : (
          <span className="name muted">No incident selected</span>
        )}
        <button className="btn" onClick={() => setDialogOpen(true)}>Change</button>
        <span className="spacer" />
        <span className="label">TIME</span>
        <div className="time-step">
          <button className="btn" aria-label="30 minutes earlier" onClick={() => step(-1)} disabled={!incident}>◀</button>
          <span className="time-val">
            <span className="num time">{slot || "--:--"}</span>
            {date && date !== incident?.date && <span className="muted small num">{shortDate(date)}</span>}
          </span>
          <button className="btn" aria-label="30 minutes later" onClick={() => step(1)} disabled={!incident}>▶</button>
        </div>
        {mock ? (
          <span className="mock-badge">Mock data</span>
        ) : adapter.kind === "static" ? (
          <span
            className="source-badge"
            title={manifest ? `${manifest.source.presence_table} · exported ${manifest.exported_at_utc}` : undefined}
          >
            Historical snapshot · Databricks
          </span>
        ) : null}
      </div>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => {
          const b = badge(t.id);
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === tab}
              className={`tab${t.id === tab ? " active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <span className="tab-key num">{t.id}</span> {t.label}
              {b !== null && <span className="badge">{fmt(b)}</span>}
            </button>
          );
        })}
        <span className="spacer" />
        <button className="info-btn" aria-label="About this data" title="About this data" onClick={() => setDrawerOpen(true)}>i</button>
      </nav>

      <main className="panel" role="tabpanel">
        <p className="question">{current.question}</p>
        {error && <p className="status critical"><span aria-hidden>✕</span> Could not load data: {error}</p>}
        {!error && presenceError && incident && (
          <p className="status critical">
            <span aria-hidden>✕</span> {presenceError} Only exported dates can be shown: {dates.map(shortDate).join(", ")}.
          </p>
        )}
        {!model && !error && !presenceError && <p className="muted">{incident ? "Loading…" : "Choose an incident to start."}</p>}
        {model && tab === 1 && <SituationTab m={model} offline={OFFLINE} />}
        {model && tab === 2 && (
          <GettingHomeTab
            m={model} offline={OFFLINE} live={live} onToggle={toggle}
            onRefresh={refresh} refreshing={refreshing} refreshNote={refreshNote} setupError={busSetupError}
          />
        )}
        {model && tab === 3 && <SendPeopleTab m={model} offline={OFFLINE} maxPerHub={maxPerHub} onMaxPerHub={setMaxPerHub} />}
        {model && tab === 4 && <SuppliesTab m={model} name={`${name} · ${slot}`} onHand={onHand} setOnHand={setOnHand} />}
        {model && tab === 5 && <AlertTab m={model} />}
      </main>

      {incidents.length > 0 && (
        <ChangeDialog
          open={dialogOpen}
          incidents={incidents}
          hazards={hazards}
          dates={dates}
          today={today}
          current={incident}
          onPick={openIncident}
          onClose={() => incident && setDialogOpen(false)}
        />
      )}
      <InfoDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} m={model} mock={mock} manifest={manifest} />
    </div>
  );
}
