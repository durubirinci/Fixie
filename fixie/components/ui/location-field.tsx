"use client";

import { useId } from "react";
import { MAX_LOCATION_LENGTH } from "@/hooks/use-location";

interface LocationFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/** Optional city or ZIP, so the fairy can give local recycling rules. */
export function LocationField({ value, onChange }: LocationFieldProps): React.JSX.Element {
  const inputId = useId();
  const hintId = useId();

  return (
    <div className="w-full max-w-72 text-left">
      <label htmlFor={inputId} className="text-sm font-semibold text-lichen">
        Your city or ZIP <span className="font-normal text-lichen/70">(optional)</span>
      </label>
      <input
        id={inputId}
        type="text"
        inputMode="text"
        autoComplete="address-level2"
        maxLength={MAX_LOCATION_LENGTH}
        placeholder="e.g. Austin, TX"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hintId}
        className="mt-1.5 min-h-11 w-full rounded-xl border border-lichen/30 bg-moss-night/40 px-3.5 text-base text-lichen placeholder:text-lichen/50"
      />
      <p id={hintId} className="mt-1 text-xs text-lichen/70">
        Recycling rules vary by city, so this makes the advice local.
      </p>
    </div>
  );
}
