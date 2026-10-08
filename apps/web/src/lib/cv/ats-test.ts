import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import type { Cv, JdExtraction } from "@tjob/shared";
import { atsCheck, type AtsReport } from "./ats-check";
import { renderCvPdf } from "./render";

/** Reads a PDF the way an ATS parser does: plain text in reading order, plus the page count. */
export async function readPdf(pdf: Uint8Array): Promise<{ text: string; pages: number }> {
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { text, totalPages } = await extractText(doc, { mergePages: true });
  return { text, pages: totalPages };
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
