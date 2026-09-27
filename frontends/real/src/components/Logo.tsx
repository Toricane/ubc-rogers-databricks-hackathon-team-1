// Cell-Safe mark: five rising signal bars. `animate` staggers the bars upward (splash only).
export function LogoMark({ size = 28, animate = false }: { size?: number; animate?: boolean }) {
  const bars = [0, 1, 2, 3, 4];
  return (
    <svg
      className={`logo-mark${animate ? " animate" : ""}`}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="Cell-Safe"
    >
      {bars.map((i) => {
        const h = 8 + i * 7; // 8 → 36
        return (
          <rect
            key={i}
            className="logo-bar"
            style={{ animationDelay: `${i * 90}ms` }}
            x={2 + i * 7.6}
            y={38 - h}
            width={5.2}
            height={h}
            rx={1.6}
          />
        );
      })}
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      Cell<span className="wordmark-accent">-Safe</span>
    </span>
  );
}
