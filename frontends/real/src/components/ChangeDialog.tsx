import { useEffect, useRef, useState } from "react";
import type { Hazard, HazardId } from "../data/types";

const HINT: Record<HazardId, string> = {
  storm: "Wind and heavy rain",
  heat_smoke: "Extreme heat and wildfire smoke",
  lightning: "Thunderstorm with lightning",
  snow_ice: "Snowfall and icy roads",
};

/** The officer only picks the type of weather. The day is fixed (see App). */
export function ChangeDialog({
  open, hazards, current, onPick, onClose,
}: {
  open: boolean;
  hazards: Hazard[];
  current: HazardId;
  onPick: (h: HazardId) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState<HazardId>(current);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setChoice(current);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, current]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h2>What kind of weather?</h2>
      <div className="weather-grid">
        {hazards.map((h) => (
          <button
            key={h.id}
            className={`weather-option${choice === h.id ? " selected" : ""}`}
            onClick={() => setChoice(h.id)}
            aria-pressed={choice === h.id}
          >
            <span className="strong">{h.label}</span>
            <span className="muted small">{HINT[h.id]}</span>
          </button>
        ))}
      </div>
      <div className="dialog-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={() => onPick(choice)}>Use this weather</button>
      </div>
    </dialog>
  );
}
