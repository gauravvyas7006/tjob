import "server-only";
import { cvSchema, type Cv } from "@tjob/shared";
import { callWriter } from "./client";

const INSTRUCTIONS = `You convert a candidate's CV (PDF) into structured JSON.

Rules:
- Copy facts exactly as written: employers, job titles, dates, locations, degrees, metrics, technologies. Never invent or infer anything that isn't in the document.
- Keep each experience bullet's meaning and wording; only fix obvious PDF extraction artifacts (broken hyphenation, stray symbols).
- Give each experience an id "exp-1", "exp-2", ... in the order they appear (most recent first), and each project "proj-1", "proj-2", ...
- If a project is described inside a job (for example a named product or client), keep it as bullets of that job; list it under projects only if the CV has a separate projects section.
- "tech" lists technologies explicitly mentioned for that role or project.
- Group skills into short categories (e.g. "Languages", "Frameworks", "Databases", "Cloud & DevOps", "Tools"), keeping the candidate's own skill names.
- Use "" or [] for anything missing. Dates as written (e.g. "Jan 2021", "Present").`;

export async function parseCvPdf(userId: string, pdf: Buffer): Promise<Cv> {
  return callWriter({
    userId,
    feature: "parse_cv",
    system: [{ type: "text", text: INSTRUCTIONS }],
    content: [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") },
      },
      { type: "text", text: "Extract this CV into the JSON schema." },
    ],
    schema: cvSchema,
    maxTokens: 16000,
  });
}
