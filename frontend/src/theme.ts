import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "ser-theme";

function current(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(current);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      try { localStorage.setItem(KEY, next); } catch { /* storage may be blocked; the theme still changes for this visit */ }
      return next;
    });
  }, []);
  return { theme, toggle };
}
