"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "fixie.location";
// Matches the server's ScanRequest.location cap.
export const MAX_LOCATION_LENGTH = 80;

const listeners = new Set<() => void>();
// Fallback for when storage is blocked, so the field still holds what was typed.
let memoryValue = "";

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readStored(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    // Private mode or blocked storage: keep it for this visit only.
    return memoryValue;
  }
}

/**
 * The user's city or ZIP, remembered on this device so recycling advice can
 * be tailored to it (brief §5: rules vary by city). Optional, and only ever
 * sent along with a scan.
 */
export function useLocation(): { location: string; setLocation: (value: string) => void } {
  // The server snapshot is empty, so the first render matches the server's.
  const location = useSyncExternalStore(subscribe, readStored, () => "");

  const setLocation = useCallback((value: string): void => {
    const next = value.slice(0, MAX_LOCATION_LENGTH);
    memoryValue = next;
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, next);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Not remembering it across visits is fine.
    }
    listeners.forEach((listener) => listener());
  }, []);

  return { location, setLocation };
}
