import { defineConfig } from "wxt";

// Chrome MV3 extension. Content scripts declare their own `matches` (LinkedIn, Naukri).
export default defineConfig({
  manifest: {
    name: "tjob",
    description: "Save LinkedIn & Naukri jobs to tjob, tailor your CV, autofill applications (you always click Submit).",
    permissions: ["storage"],
    // API calls go from the background worker to your tjob deployment.
    host_permissions: ["https://*.vercel.app/*", "http://localhost/*"],
    // Custom domains are requested at connect time.
    optional_host_permissions: ["https://*/*"],
    action: { default_title: "tjob" },
  },
});
