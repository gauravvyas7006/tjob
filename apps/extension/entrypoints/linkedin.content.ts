import { defineContentScript } from "wxt/utils/define-content-script";
import { runSite } from "../src/content/runner";
import { linkedin } from "../src/sites/linkedin";

// LinkedIn is a single-page app: run on all pages, the runner reacts to job / applied-list views.
export default defineContentScript({
  matches: ["https://www.linkedin.com/*"],
  runAt: "document_idle",
  main(ctx) {
    runSite(linkedin, ctx);
  },
});
