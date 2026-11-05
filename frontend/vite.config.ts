import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const PATHS = ["/", "/analyze", "/evaluation", "/model", "/about", "/faq", "/contact", "/privacy", "/terms"];

// In development, /api is forwarded to the FastAPI backend on port 8000.
// On build, robots.txt and sitemap.xml are generated from VITE_SITE_URL (the sitemap only when a site URL is set).
export default defineConfig(({ mode }) => {
  const site = (loadEnv(mode, ".", "VITE_").VITE_SITE_URL ?? "").replace(/\/$/, "");
  return {
    plugins: [
      react(),
      {
        name: "seo-files",
        generateBundle() {
          this.emitFile({ type: "asset", fileName: "robots.txt", source: `User-agent: *\nAllow: /\n${site ? `Sitemap: ${site}/sitemap.xml\n` : ""}` });
          if (site) {
            const urls = PATHS.map((p) => `  <url><loc>${site}${p === "/" ? "/" : p}</loc></url>`).join("\n");
            this.emitFile({ type: "asset", fileName: "sitemap.xml", source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n` });
          }
        },
      },
    ],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
      },
    },
  };
});
