import { firstBlock, firstText, htmlToText, jobPostingLd, ldCompany, ldLocation, ldSalary } from "./common";
import type { ImportItem, SiteAdapter } from "./types";

/*
 * Naukri uses hashed class names (e.g. "styles_jd-header-title__rZwM1"), so selectors match on
 * the stable part with [class*=...] and fall back to the page's JobPosting JSON-LD.
 */
const TITLE = ["h1[class*='jd-header-title']", "[class*='jd-header'] h1", "main h1", "h1"];
const COMPANY = ["[class*='jd-header-comp-name'] a", "[class*='jd-header-comp-name']", "a[class*='comp-name']"];
const LOCATION = ["[class*='jhc__location'] a", "[class*='jhc__location']", "[class*='jd-header'] [class*='location']"];
const SALARY = ["[class*='jhc__salary']", "[class*='jd-header'] [class*='salary']"];
const DESCRIPTION = [
  "[class*='job-desc-container']",
  "section[class*='job-desc']",
  "[class*='JDC__dang-inner-html']",
  "[class*='dang-inner-html']",
];

function jobId(): string | null {
  return location.pathname.match(/job-listings-[\w-]*?-(\d{9,})/)?.[1] ?? null;
}

function drawer(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>("[class*='chatbot_Drawer'], [class*='chatbot_DrawerContentWrapper']") ??
    [...document.querySelectorAll<HTMLElement>("[role='dialog']")].find((d) => d.querySelector("input, select, textarea")) ??
    null
  );
}

export const naukri: SiteAdapter = {
  source: "naukri",

  jobKey() {
    const id = jobId();
    return id ? `nk:${id}` : null;
  },

  extractJob() {
    const id = jobId();
    if (!id) return null;
    const ld = jobPostingLd();
    const description = firstBlock(DESCRIPTION) || (ld?.description ? htmlToText(ld.description) : "");
    const title = firstText(TITLE) || ld?.title || "";
    if (!title && !description) return null;
    const applyOnCompanySite = [...document.querySelectorAll<HTMLElement>("button, a")].some((b) =>
      /apply on company site/i.test(b.innerText),
    );
    return {
      source: "naukri",
      externalId: id,
      url: location.origin + location.pathname,
      title,
      company: firstText(COMPANY) || ldCompany(ld),
      location: firstText(LOCATION) || ldLocation(ld),
      salaryText: firstText(SALARY) || ldSalary(ld),
      description,
      applyType: applyOnCompanySite ? "external" : "naukri",
    };
  },

  applyRoot: drawer,

  isApplySuccess() {
    const applyBtn = document.querySelector<HTMLElement>("#apply-button, button[class*='apply-button']");
    if (applyBtn && /^applied$/i.test(applyBtn.innerText.trim())) return true;
    const status = firstText(["[class*='apply-message']", "[class*='applied']", "[class*='already-applied']"]);
    return /successfully applied|you have applied|applied successfully/i.test(status);
  },

  resumeInput() {
    return drawer()?.querySelector<HTMLInputElement>("input[type=file]") ?? null;
  },

  isAppliedListPage() {
    return /\/mnjuser\/(myapplies|recommendedjobs\/applied)|myapply/i.test(location.pathname + location.search);
  },

  extractAppliedList() {
    const items = new Map<string, ImportItem>();
    for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href*='job-listings-']")) {
      const id = a.href.match(/job-listings-[\w-]*?-(\d{9,})/)?.[1];
      if (!id || items.has(id)) continue;
      const card = (a.closest("article, li, [class*='card'], [class*='tuple']") ?? a.parentElement ?? a) as HTMLElement;
      const lines = card.innerText.split("\n").map((l) => l.trim()).filter(Boolean);
      const title = a.innerText.trim().split("\n")[0] || lines[0] || "";
      const rest = lines.filter((l) => l !== title);
      items.set(id, {
        externalId: id,
        url: a.href.split("?")[0] ?? a.href,
        title,
        company: rest[0] ?? "",
        location: rest.find((l) => /pune|bengaluru|bangalore|mumbai|delhi|hyderabad|chennai|noida|gurgaon|gurugram|remote|kolkata|ahmedabad/i.test(l)) ?? "",
        appliedAt: null,
        statusText:
          lines.find((l) => /applied|viewed|shortlisted|rejected|not shortlisted|recruiter|cv downloaded|application sent/i.test(l)) ?? "",
      });
    }
    return [...items.values()];
  },
};
