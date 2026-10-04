import { Icon } from "./icon";

interface NoticeProps {
  message: string;
  onDismiss: () => void;
}

/** A small, non-blocking message pinned near the top; scanning carries on underneath. */
export function Notice({ message, onDismiss }: NoticeProps): React.JSX.Element {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[calc(5rem+var(--safe-top))] z-40 flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex max-w-sm items-center gap-2 rounded-2xl bg-paper py-1 pr-1 pl-4 text-sm text-ink shadow-lg"
      >
        <p>{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="grid h-11 w-11 shrink-0 place-items-center text-ink-soft"
        >
          <Icon name="close" size={18} />
        </button>
      </div>
    </div>
  );
}
