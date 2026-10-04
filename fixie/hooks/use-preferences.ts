"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Preferences } from "@/lib/scan/schema";

const STORAGE_KEY = "fixie.preferences";

const listeners = new Set<() => void>();
// Fallback for when storage is blocked, so choices still hold for this visit.
let memoryValue: string | null = null;
// useSyncExternalStore needs the same object back while nothing has changed,
// or React re-renders forever. Parse once per distinct stored string.
let lastRaw: string | null = null;
let lastParsed: Preferences | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: keep it for this visit only.
    return memoryValue;
  }
}

function readStored(): Preferences | null {
  const raw = readRaw();
  if (raw === lastRaw) return lastParsed;
  lastRaw = raw;
  lastParsed = parseStored(raw);
  return lastParsed;
}

/** Stored data is outside input like any other: corrupt or outdated means "not answered yet". */
function parseStored(raw: string | null): Preferences | null {
  if (raw === null) return null;
  try {
    const parsed = Preferences.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // Not JSON at all; same as no answer, and the sheet asks again.
    return null;
  }
}

/**
 * The person's space, interests and tools, remembered on this device so
 * upcycling ideas fit them. `preferences` is null until they've answered or
 * skipped the "Tell the fairies about you" sheet; skipping saves an empty
 * profile so the sheet doesn't come back on every visit.
 */
export function usePreferences(): {
  preferences: Preferences | null;
  setPreferences: (value: Preferences) => void;
} {
  // The server snapshot is null, so the first render matches the server's.
  const preferences = useSyncExternalStore(subscribe, readStored, () => null);

  const setPreferences = useCallback((value: Preferences): void => {
    const next = JSON.stringify(value);
    memoryValue = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not remembering it across visits is fine.
    }
    listeners.forEach((listener) => listener());
  }, []);

  return { preferences, setPreferences };
}
