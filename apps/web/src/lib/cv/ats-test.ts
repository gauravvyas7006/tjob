import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import type { Cv, JdExtraction } from "@tjob/shared";
import { atsCheck, type AtsCheckItem, type AtsReport } from "./ats-check";
import { renderCvPdf } from "./render";

/** Reads a PDF the way an ATS parser does: plain text in reading order, plus the page count. */
export async function readPdf(pdf: Uint8Array): Promise<{ text: string; pages: number }> {
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { text, totalPages } = await extractText(doc, { mergePages: true });
  return { text, pages: totalPages };
}

const NO_JOB: JdExtraction = {
  title: "",
  company: "",
  location: "",
  roleCategory: "",
  seniority: "unknown",
  minYears: -1,
  maxYears: -1,
  requiredSkills: [],
  niceToHaveSkills: [],
  keywords: [],
  salaryMinLpa: -1,
  salaryMaxLpa: -1,
  salaryText: "",
  workMode: "unknown",
  responsibilities: [],
};

export interface FileReadability {
  /** 0–100, from the "can an ATS read it" checks only. */
  score: number;
  items: AtsCheckItem[];
}

/** How well an ATS can read a CV file, without any job to match against. */
export async function fileReadability(pdf: Uint8Array, cv: Cv): Promise<FileReadability> {
  const { text, pages } = await readPdf(pdf);
  const items = atsCheck({ cv, jd: NO_JOB, description: "", pdfText: text, pages }).items.filter((i) => i.group === "read");
  const total = items.reduce((n, i) => n + i.weight, 0);
  return { score: Math.round((items.reduce((n, i) => n + i.weight * i.points, 0) / total) * 100), items };
}

/** The user's uploaded CV file next to tjob's PDF of the same CV. */
export async function compareCvFiles(cv: Cv, uploaded: Uint8Array | null) {
  const [ours, theirs] = await Promise.all([
    renderCvPdf(cv, cv.headline || "CV").then((pdf) => fileReadability(pdf, cv)),
    uploaded ? fileReadability(uploaded, cv).catch(() => null) : null,
  ]);
  return { tjob: ours, uploaded: theirs };
}

/** How many pages the downloaded PDF has. */
export async function pageCount(cv: Cv, title: string): Promise<number> {
  const doc = await getDocumentProxy(new Uint8Array(await renderCvPdf(cv, title)));
  return doc.numPages;
}

/** Renders the CV exactly as it downloads, reads the file back, and checks it against the job. */
export async function atsTest(
  cv: Cv,
  title: string,
  jd: JdExtraction,
  description: string,
): Promise<Omit<AtsReport, "beforeScore">> {
  const { text, pages } = await readPdf(await renderCvPdf(cv, title));
  return atsCheck({ cv, jd, description, pdfText: text, pages });
}
