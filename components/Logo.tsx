import type { CSSProperties } from "react";

/** Bublina ve stylu loga CHC — rámeček se zobáčkem. */
export function Bubble({
  children,
  className = "",
  style,
  tail = "60%",
}: {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
  tail?: string;
}) {
  return (
    <div className={`bubble ${className}`} style={{ ["--tail-x" as string]: tail, ...style }}>
      {children}
    </div>
  );
}

export function Logo({ className = "", size }: { className?: string; size?: number }) {
  return (
    <div className={`logo ${className}`} style={size ? { fontSize: `${size}em` } : undefined} aria-label="Co na to CHC?">
      <span className="logo-top">Co na to</span>
      <span className="logo-row">
        <Bubble className="logo-bubble">
          <span className="logo-chc">CHC</span>
        </Bubble>
        <span className="logo-q">?</span>
      </span>
    </div>
  );
}
