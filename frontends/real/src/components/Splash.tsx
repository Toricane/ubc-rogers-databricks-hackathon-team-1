import { useEffect, useState } from "react";
import { LogoMark } from "./Logo";

const HOLD_MS = 2300; // bars rise, wordmark and tagline arrive, then the app appears
const REDUCED_HOLD_MS = 700;
const FADE_MS = 350;

/** Opening splash. Any click or key skips it. Respects reduced-motion settings. */
export function Splash({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const leave = () => setLeaving(true);
    const t = window.setTimeout(leave, reduced ? REDUCED_HOLD_MS : HOLD_MS);
    window.addEventListener("keydown", leave, { once: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", leave);
    };
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(onDone, FADE_MS);
    return () => window.clearTimeout(t);
  }, [leaving, onDone]);

  return (
    <div className={`splash${leaving ? " leaving" : ""}`} onClick={() => setLeaving(true)} role="presentation">
      <div className="splash-inner">
        <div className="splash-logo">
          <span className="splash-ring" />
          <LogoMark size={112} animate />
        </div>
        <h1 className="splash-title">
          Cell<span className="wordmark-accent">-Safe</span>
        </h1>
        <p className="splash-tag">Waterfront Station · incident response</p>
        <p className="splash-team">by Five Bars 3G</p>
        <div className="splash-progress" aria-hidden><span /></div>
      </div>
      <span className="splash-skip">Click or press any key to skip</span>
    </div>
  );
}
