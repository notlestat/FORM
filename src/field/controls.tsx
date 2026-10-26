import React, { useState, useEffect, useRef } from "react";
export function NumberField({
  label,
  value,
  onCommit,
  step = 1,
  min,
  max,
  disabled = false,
}: {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(5)))),
    cancelled = useRef(false);
  useEffect(() => setDraft(String(Number(value.toFixed(5)))), [value]);
  const finish = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(String(Number(value.toFixed(5))));
      return;
    }
    const n = Number(draft);
    if (
      draft.trim() &&
      Number.isFinite(n) &&
      (min === undefined || n >= min) &&
      (max === undefined || n <= max)
    ) {
      if (n !== Number(value.toFixed(5))) onCommit(n);
    }
    setDraft(String(Number(value.toFixed(5))));
  };
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        value={draft}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
export function NameField({
  value,
  label,
  onCommit,
  disabled = false,
}: {
  value: string;
  label: string;
  onCommit: (s: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value),
    cancel = useRef(false);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="name-field"
      aria-label={label}
      maxLength={160}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => (cancel.current = false)}
      onBlur={() => {
        if (!cancel.current && draft.trim() && draft.trim() !== value)
          onCommit(draft.trim());
        setDraft(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancel.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}
