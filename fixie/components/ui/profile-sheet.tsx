"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CraftTool, EMPTY_PREFERENCES, Interest, Space, type Preferences } from "@/lib/scan/schema";
import { Icon } from "./icon";

interface ProfileSheetProps {
  initial: Preferences | null;
  /** First launch says "Skip for now"; editing later says "Cancel". */
  isFirstTime: boolean;
  onSave: (preferences: Preferences) => void;
  onDismiss: () => void;
  /** Optional extras under the buttons, such as sign-in. */
  footer?: React.ReactNode;
}

const SPACE_LABEL: Record<Space, string> = {
  indoors: "Indoors only",
  balcony: "A balcony",
  yard: "A yard",
};

const INTEREST_LABEL: Record<Interest, string> = {
  plants: "Plants",
  organizing: "Organizing",
  decor: "Decor",
  gifts: "Gifts",
  kids: "Making with kids",
};

const TOOL_LABEL: Record<CraftTool, string> = {
  scissors_tape: "Scissors and tape",
  basic_tools: "Hammer and nails",
  glue_paint: "Glue and paint",
  sewing: "Needle and thread",
};

/**
 * "Tell the fairies about you": space, interests and tools, all optional and
 * choices only. A modal sheet; the caller makes the screen behind it inert.
 */
export function ProfileSheet({
  initial,
  isFirstTime,
  onSave,
  onDismiss,
  footer,
}: ProfileSheetProps): React.JSX.Element {
  const [draft, setDraft] = useState<Preferences>(initial ?? EMPTY_PREFERENCES);
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  return (
    <div className="absolute inset-0 z-30 flex items-end bg-moss-night/60">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="max-h-[92%] w-full overflow-y-auto rounded-t-3xl bg-cream px-5 pt-6 pb-[max(1.5rem,var(--safe-bottom))] text-ink"
      >
        <form
          className="mx-auto flex max-w-md flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(draft);
          }}
        >
          <header>
            <p className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-honey uppercase">
              <Icon name="sparkle" size={14} className="fill-current" />
              Optional
            </p>
            <h2 id={headingId} ref={headingRef} tabIndex={-1} className="mt-1 font-display text-2xl font-semibold">
              Tell the fairies about you
            </h2>
            <p className="mt-1 text-[15px] text-ink-soft">
              They&rsquo;ll pick projects that suit your space and the tools you have. Your answers are saved on this device.
            </p>
          </header>

          <OptionGroup legend="Where can you make things?">
            {Space.options.map((space) => (
              <Option key={space} label={SPACE_LABEL[space]}>
                <input
                  type="radio"
                  name="space"
                  checked={draft.space === space}
                  onChange={() => setDraft((current) => ({ ...current, space }))}
                  className="h-5 w-5 shrink-0 accent-moss"
                />
              </Option>
            ))}
          </OptionGroup>

          <OptionGroup legend="What do you enjoy?" hint="Pick any">
            {Interest.options.map((interest) => (
              <Option key={interest} label={INTEREST_LABEL[interest]}>
                <input
                  type="checkbox"
                  checked={draft.interests.includes(interest)}
                  onChange={() =>
                    setDraft((current) => ({ ...current, interests: toggle(current.interests, interest) }))
                  }
                  className="h-5 w-5 shrink-0 accent-moss"
                />
              </Option>
            ))}
          </OptionGroup>

          <OptionGroup legend="What tools do you have?" hint="Pick any">
            {CraftTool.options.map((tool) => (
              <Option key={tool} label={TOOL_LABEL[tool]}>
                <input
                  type="checkbox"
                  checked={draft.tools.includes(tool)}
                  onChange={() => setDraft((current) => ({ ...current, tools: toggle(current.tools, tool) }))}
                  className="h-5 w-5 shrink-0 accent-moss"
                />
              </Option>
            ))}
          </OptionGroup>

          <div className="flex flex-col gap-2">
            <button type="submit" className="min-h-12 rounded-full bg-moss px-5 font-bold text-lichen">
              Save
            </button>
            <button type="button" onClick={onDismiss} className="min-h-11 rounded-full px-5 font-semibold text-moss">
              {isFirstTime ? "Skip for now" : "Cancel"}
            </button>
          </div>
          {footer}
        </form>
      </section>
    </div>
  );
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function OptionGroup({
  legend,
  hint,
  children,
}: {
  legend: string;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <fieldset>
      <legend className="font-semibold">
        {legend} {hint && <span className="font-normal text-ink-soft">({hint.toLowerCase()})</span>}
      </legend>
      <div className="mt-2 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/** The whole row is the label, so the touch target is the full 44px row. */
function Option({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-ink/15 bg-paper px-3 text-[15px] has-checked:border-moss has-checked:bg-sage">
      {children}
      <span>{label}</span>
    </label>
  );
}
