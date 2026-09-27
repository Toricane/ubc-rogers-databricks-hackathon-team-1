import { useState } from "react";
import { addMin } from "../lib/time";
import { fmt, formatAmount, type Model } from "../model";

export function deliveryText(m: Model, deadline: string, name: string): string {
  const out = [`Delivery list — ${name}`, `Deliver by ${deadline} (target)`, ""];
  m.plan.active.forEach((a, i) => {
    out.push(`${a.hub.name}, ${a.hub.address} — ${fmt(a.total)} people`);
    for (const r of m.supplyRows[i]) out.push(`  ${r.rate.label}: ${formatAmount(r.toDeliver, r.rate.unit)}`);
    out.push("");
  });
  out.push("All hubs");
  for (const t of m.totals) out.push(`  ${t.rate.label}: ${formatAmount(t.toDeliver, t.rate.unit)}`);
  return out.join("\n");
}

export function SuppliesTab({
  m, name, onHand, setOnHand,
}: {
  m: Model;
  name: string;
  onHand: Record<string, Record<string, number | undefined>>;
  setOnHand: (hubId: string, resId: string, v: number | undefined) => void;
}) {
  const deadline = addMin(m.slot, 60);
  const [copied, setCopied] = useState(false);
  const n = m.plan.active.length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(deliveryText(m, deadline, name));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; nothing else to do */
    }
  };

  return (
    <>
      <div className="headline-row">
        <h1 className="headline">
          {n === 0 ? (
            "Nothing to deliver right now."
          ) : (
            <>
              Deliver to <span className="num">{n}</span> {n === 1 ? "hub" : "hubs"} by <span className="num">{deadline}</span>.
            </>
          )}
        </h1>
        {n > 0 && <span className="tag">target</span>}
        {n > 0 && <span className="tag">scenario rates</span>}
        <span className="spacer" />
        {n > 0 && (
          <button className="btn-primary" onClick={copy}>
            {copied ? "Copied" : "Copy delivery list"}
          </button>
        )}
      </div>

      {n > 0 && (
        <div className="supply-area">
          <div className="supply-grid">
            {m.plan.active.map((a, i) => (
              <div key={a.hub.id} className="card supply-card">
                <div className="card-title">{a.hub.name}</div>
                <div className="muted small">
                  {a.hub.address} · <span className="num">{fmt(a.total)}</span> people
                  {a.lodging > 0 && <> (<span className="num">{fmt(a.lodging)}</span> overnight)</>}
                </div>
                <table className="table compact">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="r">Needed</th>
                      <th className="r">On hand</th>
                      <th className="r">To deliver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.supplyRows[i].map((r) => (
                      <tr key={r.rate.id}>
                        <td>{r.rate.label}</td>
                        <td className="r num">{formatAmount(r.needed, r.rate.unit)}</td>
                        <td className="r">
                          <input
                            className="num-input num"
                            type="number"
                            min={0}
                            placeholder="unknown"
                            aria-label={`${r.rate.label} on hand at ${a.hub.name}`}
                            value={onHand[a.hub.id]?.[r.rate.id] ?? ""}
                            onChange={(e) =>
                              setOnHand(a.hub.id, r.rate.id, e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)))
                            }
                          />
                        </td>
                        <td className="r num strong">{formatAmount(r.toDeliver, r.rate.unit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <div className="card totals-card">
            <div className="card-title">All hubs</div>
            <table className="table compact">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="r">Needed</th>
                  <th className="r">To deliver</th>
                </tr>
              </thead>
              <tbody>
                {m.totals.map((t) => (
                  <tr key={t.rate.id}>
                    <td>{t.rate.label}</td>
                    <td className="r num">{formatAmount(t.needed, t.rate.unit)}</td>
                    <td className="r num strong">{formatAmount(t.toDeliver, t.rate.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">
              Water covers <span className="num">{m.incident.duration_h}</span> hours. Details in (i).
            </p>
          </div>
        </div>
      )}
    </>
  );
}
