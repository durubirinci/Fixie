"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScanResult } from "@/lib/scan/schema";
import { DEMO_RESULTS } from "@/lib/scan/demo-results";
import { log } from "@/lib/log";

export type ScanState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: ScanResult }
  | { status: "error"; message: string; canRetry: boolean };

export interface UseScan {
  state: ScanState;
  scan: (image: string) => Promise<void>;
  retry: () => Promise<void>;
  /** Shows a canned result with no camera and no network, for the "try an example" link. */
  showExample: () => void;
  reset: () => void;
}

// Above the route's maxDuration (30s) so the server always answers first;
// this only catches a connection that has silently died.
const CLIENT_TIMEOUT_MS = 35_000;

const MESSAGES = {
  rateLimited: "The fairies need a breather. Wait a minute, then scan again.",
  network: "Couldn't reach the fairies. Check your connection and try again.",
  server: "Something went wrong on our side. Try that scan again.",
} as const;

/**
 * Sends a captured frame to POST /api/scan and tracks idle → loading →
 * success | error. The response is validated against the shared schema, so
 * the UI never renders a shape it doesn't understand.
 */
export function useScan({ isDemo = false, location = "" }: { isDemo?: boolean; location?: string } = {}): UseScan {
  const [state, setState] = useState<ScanState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);
  const lastImageRef = useRef<string | null>(null);

  const scan = useCallback(
    async (image: string): Promise<void> => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
      lastImageRef.current = image;
      setState({ status: "loading" });

      try {
        const response = await fetch(`/api/scan${isDemo ? "?demo=1" : ""}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image, location: location.trim() || undefined }),
          signal: controller.signal,
        });

        if (response.status === 429) {
          setState({ status: "error", message: MESSAGES.rateLimited, canRetry: false });
          return;
        }
        if (!response.ok) {
          log.warn("scan.http_error", { httpStatus: response.status });
          setState({ status: "error", message: MESSAGES.server, canRetry: true });
          return;
        }

        const parsed = ScanResult.safeParse(await response.json().catch(() => null));
        if (!parsed.success) {
          log.warn("scan.invalid_response");
          setState({ status: "error", message: MESSAGES.server, canRetry: true });
          return;
        }
        setState({ status: "success", result: parsed.data });
      } catch (error) {
        // A newer scan or reset() aborted this one; that caller owns the state now.
        if (controllerRef.current !== controller) return;
        log.warn("scan.network_error", {
          reason: error instanceof Error ? error.name : "Unknown",
        });
        setState({ status: "error", message: MESSAGES.network, canRetry: true });
      } finally {
        window.clearTimeout(timeout);
      }
    },
    [isDemo, location],
  );

  const retry = useCallback(async (): Promise<void> => {
    if (lastImageRef.current) await scan(lastImageRef.current);
  }, [scan]);

  const showExample = useCallback((): void => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    lastImageRef.current = null;
    const example = DEMO_RESULTS[Math.floor(Math.random() * DEMO_RESULTS.length)];
    setState({ status: "success", result: example });
  }, []);

  const reset = useCallback((): void => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    lastImageRef.current = null;
    setState({ status: "idle" });
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { state, scan, retry, showExample, reset };
}
