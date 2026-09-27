import { useEffect, useState } from "react";
import type { Model } from "../model";

export function AlertTab({ m }: { m: Model }) {
  const [text, setText] = useState(m.alert);
  const [copied, setCopied] = useState(false);

  // Crossing toggles and time changes rewrite the draft.
  useEffect(() => setText(m.alert), [m.alert]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <>
      <div className="headline-row">
        <h1 className="headline">Draft alert for the Waterfront area.</h1>
        <span className="spacer" />
        <button className="btn-primary" onClick={copy}>{copied ? "Copied" : "Copy alert"}</button>
      </div>
      <textarea
        className="alert-box"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Alert text"
        spellCheck
      />
      <p className="note">
        Emergency alerts are area broadcasts. This is draft content for the City's alert, not targeted messaging.
      </p>
    </>
  );
}
