import "server-only";
import { canonicalSkill, dedupeSkills, jdExtractionSchema, truncate, type JdExtraction } from "@tjob/shared";
import { callFast } from "./client";

const SYSTEM = `You extract structured hiring data from a job description for an Indian tech job seeker.

- requiredSkills: concrete technologies/skills the JD says are required or core (max 15). Use common names ("Spring Boot", "Node.js", "AWS").
- niceToHaveSkills: ones marked preferred/good to have/plus (max 10).
- keywords: other ATS-relevant terms (methodologies, domains, practices such as "Microservices", "Agile", "Payments domain"), max 10, not repeating skills.
- roleCategory: a short role family such as "Java Backend", "Node.js Backend", "Full Stack (Java + React)", "Frontend (React)", "DevOps", "Data Engineering", "QA Automation", "Mobile (Android)".
- seniority: from the title and years of experience.
- minYears/maxYears: years of experience; -1 if not stated.
- salaryMinLpa/salaryMaxLpa: annual CTC in INR lakhs; convert monthly or absolute figures; -1 if not stated. salaryText: the original salary text or "".
- workMode: onsite / hybrid / remote / unknown.
- responsibilities: up to 6 short phrases.
Only use what the text says.`;

export async function extractJd(
  userId: string,
  input: { title: string; company: string; location: string; description: string },
): Promise<JdExtraction> {
  const out = await callFast({
    userId,
    feature: "extract_jd",
    system: SYSTEM,
    user: [
      `Title: ${input.title || "(unknown)"}`,
      `Company: ${input.company || "(unknown)"}`,
      `Location: ${input.location || "(unknown)"}`,
      "",
      "Job description:",
      truncate(input.description, 12000),
    ].join("\n"),
    schema: jdExtractionSchema,
    maxTokens: 2048,
  });
  return {
    ...out,
    requiredSkills: dedupeSkills(out.requiredSkills),
    niceToHaveSkills: dedupeSkills(out.niceToHaveSkills).filter(
      (s) => !out.requiredSkills.map(canonicalSkill).includes(s),
    ),
    keywords: [...new Set(out.keywords.map((k) => k.trim()).filter(Boolean))],
  };
}
