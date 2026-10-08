/** Turn an email body into short plain text for rules and AI: no quotes, signatures, footers. */
export function cleanEmailText(text: string, maxChars = 3000): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    // Start of a quoted reply or forwarded original: stop here.
    if (/^On .{5,200}wrote:\s*$/.test(line)) break;
    if (/^-{2,}\s*(Original Message|Forwarded message)\s*-{2,}/i.test(line)) break;
    if (/^From: .+/.test(line) && out.length > 3) break;
    // Signature delimiter.
    if (line === "-- " || line === "--") break;
    if (line.startsWith(">")) continue;
    // Common unsubscribe / legal footer lines.
    if (/unsubscribe|manage (your )?(email )?preferences|privacy policy|view (this email )?in (your )?browser/i.test(line)) {
      continue;
    }
    out.push(line);
  }
  return out
    .join("\n")
    .replace(/https?:\/\/\S{80,}/g, (u) => u.slice(0, 80)) // tracking links are long and useless
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxChars);
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n");
}

/** Root domain label of an address: "jobs@careers.acme.co.in" -> "acme". */
export function senderOrg(address: string): string {
  const domain = address.split("@")[1]?.toLowerCase() ?? "";
  const parts = domain.split(".").filter(Boolean);
  const generic = new Set(["com", "co", "in", "org", "net", "io", "ai", "tech", "careers", "jobs", "mail", "email", "hr", "talent", "recruit", "us", "uk"]);
  for (let i = parts.length - 2; i >= 0; i--) {
    if (!generic.has(parts[i])) return parts[i];
  }
  return parts[0] ?? "";
}

/** LinkedIn / Naukri job ids from links in an email, used to match extension-captured jobs. */
export function extractJobIds(text: string): { linkedin: string | null; naukri: string | null } {
  const li = text.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d{6,})/i);
  const nk = text.match(/naukri\.com\/job-listings-[\w-]*?-(\d{9,})/i);
  return { linkedin: li?.[1] ?? null, naukri: nk?.[1] ?? null };
}
