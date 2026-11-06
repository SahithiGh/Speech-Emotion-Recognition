export const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
export const dateText = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};
export const secs = (n?: number | null) =>
  typeof n === "number" && !isNaN(n) ? `${n.toFixed(1)} s` : "-";
