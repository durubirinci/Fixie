"use client";

import { useEffect, useId, useState } from "react";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { useCamera } from "@/hooks/use-camera";
import { useLocation } from "@/hooks/use-location";
import { useScan, type ScanState } from "@/hooks/use-scan";
import { captureFrame } from "@/lib/camera/capture-frame";
import { loadImageFile } from "@/lib/camera/load-image";
import { log } from "@/lib/log";
import { CameraOrb } from "./camera/camera-orb";
import { CameraView } from "./camera/camera-view";
import { PermissionFallback } from "./camera/permission-fallback";
import { ScanButton } from "./camera/scan-button";
import { UploadButton } from "./camera/upload-button";
import { ResultCard, ResultHeading, ScanAgainButton } from "./result/result-card";
import { Icon } from "./ui/icon";
import { InspectingOverlay } from "./ui/inspecting-overlay";
import { LocationField } from "./ui/location-field";
import { Panel } from "./ui/panel";
import { TopBar } from "./ui/top-bar";

interface ScanScreenProps {
  isDemo: boolean;
}

/** Composes camera, scan and result. All data access lives in the hooks. */
export function ScanScreen({ isDemo }: ScanScreenProps): React.JSX.Element {
  const camera = useCamera();
  const { location, setLocation } = useLocation();
  const scanner = useScan({ isDemo, location });
  const panelHeadingId = useId();
  const [captureError, setCaptureError] = useState<string | null>(null);

  const { state } = scanner;
  const isCameraLive = camera.status === "active";
  const isPanelOpen = state.status === "success" || state.status === "error" || captureError !== null;

  // Move focus to the result heading so screen readers and keyboards land on
  // the answer instead of the now-hidden shutter button.
  useEffect(() => {
    if (isPanelOpen) document.getElementById(panelHeadingId)?.focus();
  }, [isPanelOpen, panelHeadingId]);

  function scanFromCamera(): void {
    const video = camera.videoRef.current;
    if (!video) return;
    try {
      const image = captureFrame(video);
      // Freeze the preview so the user sees the exact frame being judged.
      video.pause();
      void scanner.scan(image);
    } catch (error) {
      log.warn("capture.failed", { reason: error instanceof Error ? error.message : "Unknown" });
      setCaptureError("The camera wasn't ready. Hold still for a moment and try again.");
    }
  }

  async function scanFromFile(file: File): Promise<void> {
    try {
      const image = captureFrame(await loadImageFile(file));
      void scanner.scan(image);
    } catch (error) {
      log.warn("upload.failed", { reason: error instanceof Error ? error.message : "Unknown" });
      setCaptureError("That file couldn't be opened as a photo. Try a JPEG or PNG.");
    }
  }

  function scanAgain(): void {
    setCaptureError(null);
    scanner.reset();
    void camera.videoRef.current?.play().catch(() => undefined);
  }

  function goHome(): void {
    scanAgain();
    camera.stop();
  }

  const onFile = (file: File): void => void scanFromFile(file);

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative h-full w-full overflow-hidden bg-moss-deep bg-[radial-gradient(circle_at_50%_42%,color-mix(in_srgb,var(--fern)_25%,transparent),transparent_34%)] text-lichen">
        <CameraView videoRef={camera.videoRef} isVisible={isCameraLive} />

        {isCameraLive ? (
          <>
            <div className="absolute inset-x-0 top-0">
              <TopBar tone="dark" isDemo={isDemo} onHome={goHome} isOverlay />
            </div>
            {state.status === "idle" && !captureError && (
              <div className="absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-moss-night/90 to-transparent px-6 pt-16 pb-[max(2rem,var(--safe-bottom))]">
                <p className="mb-4 text-center text-[15px] text-lichen">Fill the frame with one item</p>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center">
                  <div className="justify-self-start">
                    <UploadButton onFile={onFile} variant="icon" label="Upload a photo instead" />
                  </div>
                  <ScanButton onScan={scanFromCamera} isBusy={false} />
                  <button
                    type="button"
                    onClick={goHome}
                    aria-label="Close camera"
                    className="grid h-13 w-13 place-items-center justify-self-end rounded-full border border-lichen/30 bg-moss-night/50 text-lichen backdrop-blur-sm"
                  >
                    <Icon name="close" size={22} />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full flex-col overflow-y-auto">
            <TopBar tone="dark" isDemo={isDemo} />
            <div className="px-6 pb-[max(2rem,var(--safe-bottom))]">
              {camera.status === "denied" || camera.status === "unavailable" ? (
                <PermissionFallback reason={camera.status} onFile={onFile} onRetry={() => void camera.start()} />
              ) : (
                <Welcome
                  isResuming={camera.status === "paused"}
                  isRequesting={camera.status === "requesting"}
                  onOpenCamera={() => void camera.start()}
                  onExample={scanner.showExample}
                  onFile={onFile}
                  location={location}
                  onLocationChange={setLocation}
                />
              )}
            </div>
          </div>
        )}

        {state.status === "loading" && <InspectingOverlay />}

        <AnimatePresence>
          {isPanelOpen && (
            <Panel key="result" labelledBy={panelHeadingId} header={<TopBar tone="light" isDemo={isDemo} onHome={goHome} />}>
              <PanelBody
                state={state}
                captureError={captureError}
                headingId={panelHeadingId}
                onScanAgain={scanAgain}
                onRetry={() => void scanner.retry()}
              />
            </Panel>
          )}
        </AnimatePresence>

        <p aria-live="polite" className="sr-only">
          {announcement(state)}
        </p>
      </main>
    </MotionConfig>
  );
}

function Welcome({
  isResuming,
  isRequesting,
  onOpenCamera,
  onExample,
  onFile,
  location,
  onLocationChange,
}: {
  isResuming: boolean;
  isRequesting: boolean;
  onOpenCamera: () => void;
  onExample: () => void;
  onFile: (file: File) => void;
  location: string;
  onLocationChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center text-center">
      <section className="px-2 pt-10">
        <p className="text-xs font-bold tracking-[0.14em] text-honey-light uppercase">A little magic for our planet</p>
        <h1 className="mt-2 font-display text-[2.15rem] leading-[1.08] font-semibold tracking-tight text-lichen">
          What are we giving a <em className="font-semibold text-honey-light not-italic">second life</em> today?
        </h1>
        <p className="mx-auto mt-3 max-w-[30ch] text-[15px] leading-relaxed text-lichen/80">
          Snap a photo and a fairy will tell you how to recycle it, and how to reuse it.
        </p>
      </section>

      {/* iOS only grants the camera from a user gesture, so we never auto-start. */}
      <CameraOrb
        onPress={onOpenCamera}
        isWaiting={isRequesting}
        label={isResuming ? "Resume camera" : "Open camera"}
      />
      <h2 className="mt-5 font-display text-2xl font-semibold text-lichen">
        {isRequesting ? "Waiting for the camera…" : isResuming ? "Tap to resume" : "Tap to discover"}
      </h2>
      <p className="mt-1 text-sm text-lichen/80">Photograph any item you&rsquo;re ready to part with</p>

      <div className="mt-4 flex flex-col items-center">
        <button
          type="button"
          onClick={onExample}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-honey-light"
        >
          <span className="underline decoration-honey-light/50 underline-offset-4">or try a magical example</span>
          <Icon name="sparkle" size={14} className="fill-glimmer text-honey-light" />
        </button>
        <UploadButton onFile={onFile} label="Upload a photo instead" />
      </div>

      <div className="mt-6 flex w-full justify-center">
        <LocationField value={location} onChange={onLocationChange} />
      </div>
    </div>
  );
}

function PanelBody({
  state,
  captureError,
  headingId,
  onScanAgain,
  onRetry,
}: {
  state: ScanState;
  captureError: string | null;
  headingId: string;
  onScanAgain: () => void;
  onRetry: () => void;
}): React.JSX.Element | null {
  if (state.status === "success") {
    return <ResultCard result={state.result} headingId={headingId} onClose={onScanAgain} />;
  }

  const message = captureError ?? (state.status === "error" ? state.message : null);
  if (!message) return null;
  const canRetry = state.status === "error" && state.canRetry && !captureError;

  return (
    <div className="flex flex-col gap-6">
      <ResultHeading
        headingId={headingId}
        title="That scan didn't make it"
        eyebrow="A twig in the path"
        onClose={onScanAgain}
      />
      <p className="text-[15px] leading-relaxed text-ink-soft">{message}</p>
      <div className="flex flex-col gap-3">
        {canRetry && <ScanAgainButton onClick={onRetry} label="Try that photo again" />}
        <ScanAgainButton onClick={onScanAgain} label="Take a new photo" variant={canRetry ? "outline" : "solid"} />
      </div>
    </div>
  );
}

function announcement(state: ScanState): string {
  switch (state.status) {
    case "loading":
      return "Scanning. The fairies are inspecting your item.";
    case "success":
      return state.result.status === "ok" && state.result.item
        ? `Found ${state.result.item}.`
        : "The fairies couldn't identify that item.";
    case "error":
      return state.message;
    default:
      return "";
  }
}
