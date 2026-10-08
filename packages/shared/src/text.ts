const LEGAL_SUFFIXES = [
  "private limited",
  "pvt ltd",
  "pvt. ltd.",
  "pvt. ltd",
  "pvt",
  "limited",
  "ltd",
  "ltd.",
  "llp",
  "inc",
  "inc.",
  "corp",
  "corporation",
  "co.",
  "company",
  "gmbh",
  "plc",
  "llc",
  "india",
];

/** Lowercase company name with legal suffixes and punctuation removed, for fuzzy matching. */
export function normalizeCompany(name: string): string {
  let s = name.toLowerCase().replace(/&/g, " and ").replace(/[()]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of LEGAL_SUFFIXES) {
      if (s.endsWith(" " + suf)) {
        s = s.slice(0, -suf.length - 1).trim();
        changed = true;
      }
    }
  }
  return s.replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/** Normalize an application question so the same question asked differently maps to one answer. */
export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/\*/g, "")
    .replace(/\(.*?(required|optional).*?\)/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(
      /\b(please|kindly|enter|mention|provide|specify|state|your|the|a|an|in|of|do|does|you|have|has|had|got|what|is|are|how|many|much|would|will|can|could)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
