import { firstBlock, firstText, htmlToText, jobPostingLd, ldCompany, ldLocation, openDialogText } from "./common";
import type { ImportItem, SiteAdapter } from "./types";

/*
 * LinkedIn selectors change from time to time. Each field lists several selectors (newest
 * first) and falls back to the page's JobPosting JSON-LD. If extraction breaks, update the
 * lists here; the panel also offers a "paste the description" fallback.
 */
const TITLE = [
  ".job-details-jobs-unified-top-card__job-title h1",
  ".job-details-jobs-unified-top-card__job-title",
  ".jobs-unified-top-card__job-title",
  ".top-card-layout__title",
  "main h1",
];
const COMPANY = [
  ".job-details-jobs-unified-top-card__company-name a",
  ".job-details-jobs-unified-top-card__company-name",
  ".jobs-unified-top-card__company-name",
  ".topcard__org-name-link",
];
const LOCATION = [
  ".job-details-jobs-unified-top-card__primary-description-container .tvm__text",
  ".job-details-jobs-unified-top-card__bullet",
  ".jobs-unified-top-card__bullet",
  ".topcard__flavor--bullet",
];
const DESCRIPTION = [
  "#job-details",
  ".jobs-description__content",
  ".jobs-description-content__text",
  ".jobs-box__html-content",
  ".description__text",
  "[class*='jobs-description']",
];
const TOP_CARD = [".job-details-jobs-unified-top-card__container--two-pane", ".jobs-unified-top-card", ".job-view-layout", "main"];

function jobId(): string | null {
  const fromPath = location.pathname.match(/\/jobs\/view\/(\d{6,})/)?.[1];
  if (fromPath) return fromPath;
  return new URLSearchParams(location.search).get("currentJobId");
}

function easyApplyDialog(): HTMLElement | null {
  const dialogs = [...document.querySelectorAll<HTMLElement>(".jobs-easy-apply-modal, [role='dialog']")];
  return dialogs.find((d) => d.querySelector("input, select, textarea") && /apply|application/i.test(d.innerText)) ?? null;
}

export const linkedin: SiteAdapter = {
  source: "linkedin",

  jobKey() {
    const id = jobId();
    return id ? `li:${id}` : null;
  },

  extractJob() {
    const id = jobId();
    if (!id) return null;
    const ld = jobPostingLd();
    const description = firstBlock(DESCRIPTION) || (ld?.description ? htmlToText(ld.description) : "");
    const title = firstText(TITLE) || ld?.title || "";
    if (!title && !description) return null;
    const applyButton = document.querySelector<HTMLElement>(".jobs-apply-button, .jobs-s-apply button");
    return {
      source: "linkedin",
      externalId: id,
      url: `https://www.linkedin.com/jobs/view/${id}/`,
      title,
      company: firstText(COMPANY) || ldCompany(ld),
      location: firstText(LOCATION) || ldLocation(ld),
      salaryText: "",
      description,
      applyType: applyButton ? (/easy apply/i.test(applyButton.innerText) ? "easy_apply" : "external") : "unknown",
    };
  },

  applyRoot: easyApplyDialog,

  isApplySuccess() {
    if (/your application was sent|application submitted|application was submitted/i.test(openDialogText())) return true;
    const card = firstText(TOP_CARD);
    return /\bApplied (just now|\d+ (seconds?|minutes?) ago)/i.test(card);
  },

  resumeInput() {
    return easyApplyDialog()?.querySelector<HTMLInputElement>("input[type=file]") ?? null;
  },

  isAppliedListPage() {
    return (
      (location.pathname.startsWith("/my-items/saved-jobs") && /cardType=APPLIED/i.test(location.search)) ||
      location.pathname.startsWith("/jobs-tracker")
    );
  },

  extractAppliedList() {
    const items = new Map<string, ImportItem>();
    for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href*='/jobs/view/']")) {
      const id = a.href.match(/\/jobs\/view\/(\d{6,})/)?.[1];
      if (!id || items.has(id)) continue;
      const card = (a.closest("li") ?? a.parentElement?.parentElement ?? a) as HTMLElement;
      const lines = card.innerText.split("\n").map((l) => l.trim()).filter(Boolean);
      const title = a.innerText.trim().split("\n")[0] || lines[0] || "";
      const rest = lines.filter((l) => l !== title);
      items.set(id, {
        externalId: id,
        url: `https://www.linkedin.com/jobs/view/${id}/`,
        title,
        company: rest[0] ?? "",
        location: rest[1] ?? "",
        appliedAt: null,
        statusText: lines.find((l) => /applied|viewed|downloaded|no longer|not selected|rejected/i.test(l)) ?? "",
      });
    }
    return [...items.values()];
  },
};
