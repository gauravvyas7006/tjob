import { defineContentScript } from "wxt/utils/define-content-script";
import { runSite } from "../src/content/runner";
import { naukri } from "../src/sites/naukri";

export default defineContentScript({
  matches: ["https://www.naukri.com/*"],
  runAt: "document_idle",
  main(ctx) {
    runSite(naukri, ctx);
  },
});
