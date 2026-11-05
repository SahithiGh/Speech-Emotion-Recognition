// Optional deployment settings. Nothing is invented: if a value is not configured, the site says so.
export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? "").replace(/\/$/, "");
export const CONTACT_EMAIL = (import.meta.env.VITE_CONTACT_EMAIL ?? "").trim();
export const REPO_URL = (import.meta.env.VITE_REPO_URL ?? "").trim();
export const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
export const SITE_NAME = "Speech Emotion Recognition";

export const EMOTION_COLORS: Record<string, string> = {
  happy: "#F5D65C",
  sad: "#78A9E6",
  angry: "#E87575",
  fear: "#D8C2F0",
  disgust: "#A9C68B",
  neutral: "#E2E8F0",
};
