export type ProfileField =
  | "noticePeriod"
  | "currentCtc"
  | "expectedCtc"
  | "totalExperience"
  | "preferredLocations"
  | "location"
  | "phone"
  | "linkedinUrl"
  | "githubUrl"
  | "portfolioUrl"
  | "email"
  | "fullName";

/** "Experience with Java", "experience in Spring" are skill questions, not total experience. */
function isTotalExperience(label: string): boolean {
  const l = label.toLowerCase();
  if (!/\bexp(erience)?\b/.test(l)) return false;
  if (/\b(with|using|on)\b/.test(l)) return false;
  const inMatch = l.match(/\bin\s+([a-z0-9.+#/-]+)/);
  if (inMatch && !/^(years?|yrs?|months?|total|the|industry|it|software)$/.test(inMatch[1])) return false;
  return /\b(total|overall|years?|yrs?|work|professional|exp(erience)?)\b/.test(l);
}

const FIELDS: [(label: string) => boolean, ProfileField][] = [
  [(l) => /notice\s*period/i.test(l), "noticePeriod"],
  [(l) => /(current|present|existing|last)\s*(annual\s*|fixed\s*)?(ctc|salary|compensation|package)/i.test(l), "currentCtc"],
  [(l) => /expected\s*(annual\s*)?(ctc|salary|compensation|package)/i.test(l), "expectedCtc"],
  [(l) => /preferred\s*(job\s*|work\s*)?locations?/i.test(l), "preferredLocations"],
  [isTotalExperience, "totalExperience"],
  [(l) => /\b(current\s*)?(city|location)\b/i.test(l) && !/relocat/i.test(l), "location"],
  [(l) => /\b(mobile|phone|contact\s*number|whatsapp)\b/i.test(l), "phone"],
  [(l) => /linked\s*in/i.test(l), "linkedinUrl"],
  [(l) => /git\s*hub/i.test(l), "githubUrl"],
  [(l) => /portfolio|personal\s*website/i.test(l), "portfolioUrl"],
  [(l) => /\be-?mail\b/i.test(l), "email"],
  [(l) => /^\s*(full\s*|your\s*)?name\b/i.test(l), "fullName"],
];

/** Which standard profile field a form label asks for, if any. */
export function profileFieldFor(label: string): ProfileField | null {
  return FIELDS.find(([test]) => test(label))?.[1] ?? null;
}
