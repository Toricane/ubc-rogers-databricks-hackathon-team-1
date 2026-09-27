import { useEffect, useRef, useState } from "react";
import type { Hazard, HazardId, Incident } from "../data/types";
import { ALL_SLOTS, shortDate } from "../lib/time";

export const DEFAULT_SLOT = "17:00"; // used when an incident has no slot_start yet (busiest clock at Waterfront, AGENTS.md)

export function ChangeDialog({
  open, incidents, hazards, dates, today, current, onPick, onClose,
}: {
  open: boolean;
  incidents: Incident[];
  hazards: Hazard[];
  dates: string[];
  today: string;
  current: Incident | null;
  onPick: (inc: Incident, slot: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState<string>(current?.id ?? incidents[0]?.id ?? "custom");
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState(DEFAULT_SLOT);
  const [hazard, setHazard] = useState<HazardId>("storm");

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const minDate = dates[0];
  const maxDate = [dates[dates.length - 1] ?? today, today].sort().pop()!;

  const apply = () => {
    if (choice === "custom") {
      const hz = hazards.find((h) => h.id === hazard);
      onPick(
        {
          id: "custom",
          date,
          hazard,
          title: hz?.label ?? hazard,
          description: date === today ? "Set by officer · live road data" : "Set by officer",
          slot_start: slot,
          closed_crossings: [],
          duration_h: 72,
          source_url: null,
        },
        slot,
      );
    } else {
      const inc = incidents.find((i) => i.id === choice)!;
      onPick(inc, inc.slot_start ?? DEFAULT_SLOT);
    }
  };

  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (current) onClose();
      }}
    >
      <h2>Choose the incident</h2>
      <div className="choices">
        {incidents.map((inc) => (
          <label key={inc.id} className={`choice${choice === inc.id ? " selected" : ""}`}>
            <input type="radio" name="incident" checked={choice === inc.id} onChange={() => setChoice(inc.id)} />
            <span>
              <span className="strong">{shortDate(inc.date)} · {inc.title.replace(", ", " · ")}</span>
              <span className="muted small block">{inc.description}</span>
            </span>
          </label>
        ))}
        <label className={`choice${choice === "custom" ? " selected" : ""}`}>
          <input type="radio" name="incident" checked={choice === "custom"} onChange={() => setChoice("custom")} />
          <span className="strong">Custom</span>
        </label>
        {choice === "custom" && (
          <div className="custom-row">
            <label>
              Date
              <input type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
              Time
              <select value={slot} onChange={(e) => setSlot(e.target.value)} className="num">
                {ALL_SLOTS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Hazard
              <select value={hazard} onChange={(e) => setHazard(e.target.value as HazardId)}>
                {hazards.map((h) => (
                  <option key={h.id} value={h.id}>{h.label}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>
      <div className="dialog-actions">
        {current && <button className="btn" onClick={onClose}>Cancel</button>}
        <button className="btn-primary" onClick={apply}>Open incident</button>
      </div>
    </dialog>
  );
}
