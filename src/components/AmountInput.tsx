import { useEffect, useRef, useState } from "react";
interface Props {
  value: number | null;
  onCommit: (value: number | null) => void;
  label: string;
  className?: string;
  nullable?: boolean;
}
export function AmountInput({
  value,
  onCommit,
  label,
  className = "",
  nullable = false,
}: Props) {
  const cancelled = useRef(false);
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  useEffect(
    () => setDraft(value === null ? "" : String(Math.round(value * 100) / 100)),
    [value],
  );
  return (
    <input
      className={className}
      type="number"
      min="0"
      step="any"
      aria-label={label}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        e.target.setCustomValidity("");
      }}
      onBlur={(e) => {
        if (cancelled.current) {
          cancelled.current = false;
          setDraft(value === null ? "" : String(value));
          return;
        }
        if (draft === "" && nullable) {
          onCommit(null);
          return;
        }
        const n = Number(draft);
        if (draft === "" || !Number.isFinite(n) || n < 0) {
          e.target.setCustomValidity("Enter a nonnegative amount.");
          e.target.reportValidity();
          setDraft(value === null ? "" : String(value));
          return;
        }
        onCommit(n);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.stopPropagation();
          cancelled.current = true;
          setDraft(value === null ? "" : String(value));
          e.currentTarget.blur();
        }
      }}
    />
  );
}
