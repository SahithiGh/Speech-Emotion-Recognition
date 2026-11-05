import { useRef, type KeyboardEvent, type ReactNode } from "react";

interface Props<T extends string> { tabs: { id: T; label: string; icon: ReactNode }[]; value: T; onChange: (v: T) => void; disabled?: boolean; children: ReactNode }

/** Accessible tabs: arrow keys, Home and End move between tabs. */
export default function Tabs<T extends string>({ tabs, value, onChange, disabled, children }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const n = tabs.length;
    const next = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i + n - 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };
  return (
    <>
      <div className="tabs" role="tablist" aria-label="Audio source">
        {tabs.map((t, i) => (
          <button key={t.id} ref={(el) => { refs.current[i] = el; }} role="tab" id={`tab-${t.id}`} aria-selected={value === t.id} aria-controls="tabpanel"
            tabIndex={value === t.id ? 0 : -1} className={value === t.id ? "tab on" : "tab"} disabled={disabled}
            onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}>{t.icon}{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${value}`}>{children}</div>
    </>
  );
}
