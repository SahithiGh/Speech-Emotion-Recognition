import { useEffect } from "react";
import { SITE_NAME, SITE_URL } from "./site";

function setMeta(selector: string, attr: string, key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute("content", value);
}

/** Page-specific title, description, canonical link and social tags. */
export function usePageMeta(title: string, description: string, path: string) {
  useEffect(() => {
    const full = path === "/" ? SITE_NAME : `${title} | ${SITE_NAME}`;
    document.title = full;
    setMeta('meta[name="description"]', "name", "description", description);
    setMeta('meta[property="og:title"]', "property", "og:title", full);
    setMeta('meta[property="og:description"]', "property", "og:description", description);
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (SITE_URL) {
      if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
      link.href = SITE_URL + path;
      setMeta('meta[property="og:url"]', "property", "og:url", SITE_URL + path);
    } else link?.remove();
  }, [title, description, path]);
}
