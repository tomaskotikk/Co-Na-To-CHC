"use client";

import { io, type Socket } from "socket.io-client";
import { useEffect, useState } from "react";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ transports: ["websocket", "polling"], reconnectionDelay: 500, reconnectionDelayMax: 3000 });
  }
  return socket;
}

/** true, když je socket připojený */
export function useConnected() {
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const s = getSocket();
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    setConnected(s.connected);
    s.on("connect", on);
    s.on("disconnect", off);
    return () => {
      s.off("connect", on);
      s.off("disconnect", off);
    };
  }, []);
  return connected;
}

/** zavolá hello při každém (znovu)připojení */
export function useOnConnect(fn: (s: Socket) => void) {
  useEffect(() => {
    const s = getSocket();
    const h = () => fn(s);
    if (s.connected) h();
    s.on("connect", h);
    return () => {
      s.off("connect", h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function useSocketEvent<T>(event: string, fn: (payload: T) => void) {
  useEffect(() => {
    const s = getSocket();
    s.on(event, fn);
    return () => {
      s.off(event, fn);
    };
  }, [event, fn]);
}

export function emitAck<T>(event: string, payload: unknown, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    getSocket()
      .timeout(timeoutMs)
      .emit(event, payload, (err: Error | null, res: T) => (err ? reject(err) : resolve(res)));
  });
}

/** adresa, na kterou mají vést QR kódy */
export function resolveBaseUrl(st: { manualUrl: string; lanUrl: string }) {
  if (st.manualUrl) return st.manualUrl;
  if (typeof window === "undefined") return st.lanUrl;
  const h = window.location.hostname;
  const isLocal = h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  return isLocal ? st.lanUrl : window.location.origin;
}
