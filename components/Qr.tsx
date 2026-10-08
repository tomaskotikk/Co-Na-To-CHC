"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function Qr({ value, className }: { value: string; className?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0b0b0b", light: "#ffffff" } })
      .then((s) => alive && setSvg(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value]);
  return <div className={className} aria-label={value} role="img" dangerouslySetInnerHTML={{ __html: svg }} />;
}
