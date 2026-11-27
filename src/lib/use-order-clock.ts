import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  const timer = window.setInterval(onChange, 5_000);
  window.addEventListener("focus", onChange);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.clearInterval(timer);
    window.removeEventListener("focus", onChange);
    document.removeEventListener("visibilitychange", onChange);
  };
}

export function useOrderClock() {
  return useSyncExternalStore(subscribe, readClock, serverClock);
}

function readClock() {
  return Math.floor(Date.now() / 1_000) * 1_000;
}

function serverClock() {
  return null;
}
