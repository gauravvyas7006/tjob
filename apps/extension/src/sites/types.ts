import type { ExtImportInput, ExtJobInput } from "@tjob/shared/api";

export type ScrapedJob = Omit<ExtJobInput, "location" | "salaryText" | "applyType"> & {
  location: string;
  salaryText: string;
  applyType: ExtJobInput["applyType"];
};

export type ImportItem = ExtImportInput["items"][number];

/** Everything site-specific lives behind this interface (one file per site). */
export interface SiteAdapter {
  source: "linkedin" | "naukri";
  /** Changes whenever the job being viewed changes (SPA navigation). null = not a job page. */
  jobKey(): string | null;
  extractJob(): ScrapedJob | null;
  /** The open apply dialog/drawer, if any. */
  applyRoot(): HTMLElement | null;
  /** The site is showing its own "application sent" confirmation. */
  isApplySuccess(): boolean;
  /** A resume upload input inside the apply dialog. */
  resumeInput(): HTMLInputElement | null;
  /** The "jobs I applied to" history page. */
  isAppliedListPage(): boolean;
  extractAppliedList(): ImportItem[];
}
