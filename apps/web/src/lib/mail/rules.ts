import type { EmailCategory, JobSource } from "@tjob/shared";
import { senderOrg } from "./body";

/*
 * Free, deterministic handling for known email formats. Anything these rules can't decide with
 * confidence goes to the AI classifier (or the Review list when the AI budget is used up).
 * LinkedIn/Naukri change wording occasionally; corrections in the Inbox add user rules on top.
 */

export interface MailInput {
  fromAddress: string;
  fromName: string;
  subject: string;
  text: string;
}

export interface RuleResult {
  category: EmailCategory;
  isJobRelated: boolean;
  company: string;
  jobTitle: string;
  confidence: number;
  summary: string;
}

const JOB_BOARDS: Record<string, JobSource> = {
  "linkedin.com": "linkedin",
  "naukri.com": "naukri",
};

const OTHER_BOARDS = [
  "indeed.com",
  "foundit.in",
  "monsterindia.com",
  "instahyre.com",
  "hirist.tech",
  "hirist.com",
  "iimjobs.com",
  "cutshort.io",
  "wellfound.com",
  "angel.co",
  "glassdoor.com",
  "glassdoor.co.in",
  "shine.com",
  "timesjobs.com",
  "apna.co",
  "uplers.com",
  "turing.com",
];

/** Applicant tracking systems and assessment platforms that send on behalf of employers. */
export const ATS_DOMAINS = [
  "greenhouse.io",
  "greenhouse-mail.io",
  "lever.co",
  "hire.lever.co",
  "myworkday.com",
  "myworkdayjobs.com",
  "workday.com",
  "smartrecruiters.com",
  "icims.com",
  "jobvite.com",
  "ashbyhq.com",
  "darwinbox.in",
  "darwinbox.com",
  "zohorecruit.com",
  "zohorecruit.in",
  "freshteam.com",
  "keka.com",
  "successfactors.com",
  "successfactors.eu",
  "taleo.net",
  "recruitee.com",
  "breezy.hr",
  "workable.com",
  "workablemail.com",
  "hackerrank.com",
  "hackerearth.com",
  "codility.com",
  "mettl.com",
  "testgorilla.com",
  "imocha.io",
  "hirepro.in",
  "superset.com",
];

export function senderDomain(address: string): string {
  return address.split("@")[1]?.toLowerCase().trim() ?? "";
}

function domainIs(domain: string, list: string[]): boolean {
  return list.some((d) => domain === d || domain.endsWith("." + d));
}

export function sourceForSender(address: string): JobSource {
  const domain = senderDomain(address);
  for (const [d, src] of Object.entries(JOB_BOARDS)) {
    if (domain === d || domain.endsWith("." + d)) return src;
  }
  return "other";
}

export function isJobBoard(address: string): boolean {
  const domain = senderDomain(address);
  return domainIs(domain, [...Object.keys(JOB_BOARDS), ...OTHER_BOARDS]);
}

export function isAtsSender(address: string): boolean {
  return domainIs(senderDomain(address), ATS_DOMAINS);
}

const REJECTION =
  /\b(unfortunately|regret to inform|not (?:be )?(?:moving|proceeding) forward|decided (?:not )?to (?:move|proceed) (?:forward )?with (?:other|another)|position has (?:been|now been) filled|will not be (?:moving|proceeding)|not been selected|were not selected|unable to (?:move|proceed) forward|pursue other candidates)\b/i;
const INTERVIEW_SUBJECT =
  /\b(interview (?:invitation|invite|schedul|confirm|slot|call|round)|invitation (?:to|for) (?:an? )?interview|schedule (?:an? |your )?interview|interview with)\b/i;
const ASSESSMENT =
  /\b(online (?:test|assessment)|coding (?:test|challenge|assessment|round)|technical assessment|take[- ]home|hackerrank|hackerearth|codility|mettl|imocha|test link|assessment invitation)\b/i;
const OFFER = /\b(offer letter|job offer|pleased to (?:extend|offer)|letter of offer)\b/i;
const CONFIRMATION =
  /\b(thank(?:s| you) for (?:applying|your application|your interest)|application (?:has been )?(?:received|submitted|sent)|we(?:'ve| have) received your application|applied successfully|successfully applied|you have applied|your application was sent)\b/i;
const VIEWED =
  /\b(viewed your (?:application|profile|cv|resume)|application (?:was|has been) viewed|downloaded your (?:cv|resume)|shortlisted|recruiter viewed)\b/i;
const ALERT =
  /\b(jobs? (?:for you|matching|alert|recommendation)|new jobs?|recommended jobs?|is hiring|are hiring|top jobs|jobs you may|apply now|hot jobs|similar jobs|job matches)\b/i;

function companyFromSubject(subject: string): string {
  const patterns = [
    /your application was (?:sent|viewed) (?:to|by) (.+?)$/i,
    /your update from (.+?)$/i,
    /application (?:to|for) .+? at (.+?)$/i,
    /thank(?:s| you) for (?:applying|your application|your interest) (?:to|at|in) (.+?)$/i,
    /\bat (.+?)$/i,
  ];
  for (const p of patterns) {
    const m = subject.match(p);
    if (m?.[1]) return m[1].replace(/[!.]+$/, "").trim();
  }
  return "";
}

function titleFromSubject(subject: string): string {
  const m = subject.match(/application (?:to|for) (?:the )?(.+?) (?:at|with|-) /i);
  return m?.[1]?.trim() ?? "";
}

function result(
  category: EmailCategory,
  subject: string,
  confidence: number,
  summary: string,
  overrides: Partial<RuleResult> = {},
): RuleResult {
  return {
    category,
    isJobRelated: category !== "other",
    company: companyFromSubject(subject),
    jobTitle: titleFromSubject(subject),
    confidence,
    summary,
    ...overrides,
  };
}

function linkedInRules(m: MailInput): RuleResult | null {
  const from = m.fromAddress.toLowerCase();
  const s = m.subject;
  if (/^your application was sent to /i.test(s)) {
    return result("application_confirmation", s, 0.97, `Application sent via LinkedIn to ${companyFromSubject(s)}`);
  }
  if (/your application was viewed by|viewed your application/i.test(s)) {
    return result("application_viewed", s, 0.95, `${companyFromSubject(s) || "Company"} viewed your application`);
  }
  if (/^your update from /i.test(s) || /^your application to /i.test(s)) {
    if (REJECTION.test(m.text)) {
      return result("rejection", s, 0.92, `${companyFromSubject(s) || "Company"} is not moving forward`);
    }
    return null; // ambiguous update → AI
  }
  if (from.startsWith("jobalerts-noreply") || from.startsWith("jobs-listings") || ALERT.test(s)) {
    return result("job_alert", s, 0.9, "LinkedIn job alert", { company: "", jobTitle: "" });
  }
  if (/^(notifications|invitations|newsletters|editors|news|groups|learning|security|updates|member)-?noreply|^(invitations|messaging-digest)/.test(from)) {
    return { category: "other", isJobRelated: false, company: "", jobTitle: "", confidence: 0.9, summary: "LinkedIn notification" };
  }
  return null;
}

function naukriRules(m: MailInput): RuleResult | null {
  const s = m.subject;
  if (CONFIRMATION.test(s)) {
    return result("application_confirmation", s, 0.92, `Applied on Naukri${companyFromSubject(s) ? ` to ${companyFromSubject(s)}` : ""}`);
  }
  if (VIEWED.test(s)) {
    return result("application_viewed", s, 0.9, "Naukri: recruiter viewed / shortlisted your application");
  }
  if (REJECTION.test(m.text) && /application|status/i.test(s)) {
    return result("rejection", s, 0.85, "Naukri: application not taken forward");
  }
  if (INTERVIEW_SUBJECT.test(s)) return result("interview", s, 0.85, "Interview invitation via Naukri");
  if (ALERT.test(s) || /naukrialerts|jobalert|newsletter|promotions?@/i.test(m.fromAddress)) {
    return result("job_alert", s, 0.9, "Naukri job alert", { company: "", jobTitle: "" });
  }
  return null;
}

function genericRules(m: MailInput): RuleResult | null {
  const s = m.subject;
  const company = companyFromSubject(s) || (isAtsSender(m.fromAddress) ? m.fromName.replace(/\b(careers|recruiting|talent|hiring|team|hr)\b/gi, "").trim() : "");
  if (OFFER.test(s)) return result("offer", s, 0.85, "Job offer", { company });
  if (INTERVIEW_SUBJECT.test(s)) return result("interview", s, 0.85, "Interview invitation", { company });
  if (ASSESSMENT.test(s)) return result("assessment", s, 0.85, "Assessment / coding test", { company });
  if (CONFIRMATION.test(s) && (isAtsSender(m.fromAddress) || /application/i.test(s))) {
    return result("application_confirmation", s, 0.88, `Application received${company ? ` by ${company}` : ""}`, { company });
  }
  if (REJECTION.test(m.text) && (isAtsSender(m.fromAddress) || /application|candidacy|your interest/i.test(s + m.text.slice(0, 400)))) {
    return result("rejection", s, 0.85, `${company || "Company"} is not moving forward`, { company });
  }
  return null;
}

/** Built-in rules: LinkedIn and Naukri formats first, then generic high-confidence patterns. */
export function applyBuiltInRules(m: MailInput): RuleResult | null {
  const source = sourceForSender(m.fromAddress);
  if (source === "linkedin") return linkedInRules(m);
  if (source === "naukri") return naukriRules(m) ?? genericRules(m);
  if (isJobBoard(m.fromAddress) && ALERT.test(m.subject)) {
    return result("job_alert", m.subject, 0.85, "Job alert", { company: "", jobTitle: "" });
  }
  return genericRules(m);
}

export interface UserRule {
  id: string;
  fromContains: string;
  subjectContains: string;
  category: EmailCategory;
}

/** Rules the user created by correcting an email in the Review list. */
export function applyUserRules(m: MailInput, rules: UserRule[]): UserRule | null {
  const from = m.fromAddress.toLowerCase();
  const subject = m.subject.toLowerCase();
  return (
    rules.find(
      (r) =>
        (!r.fromContains || from.includes(r.fromContains.toLowerCase())) &&
        (!r.subjectContains || subject.includes(r.subjectContains.toLowerCase())) &&
        (r.fromContains || r.subjectContains),
    ) ?? null
  );
}

const RELEVANT_WORDS =
  /\b(application|applied|apply|interview|recruit\w*|hiring|position|role|opening|opportunit\w+|candida\w+|resume|cv|offer|assessment|shortlist\w*|job|talent acquisition|hr team)\b/i;

/**
 * Cheap pre-filter on headers: is this email worth processing at all? Irrelevant mail is never
 * stored or sent to AI.
 */
export function isPotentiallyRelevant(
  m: { fromAddress: string; subject: string },
  ctx: { knownCompanyKeys: Set<string>; knownThreadKeys: Set<string>; threadKey: string },
): boolean {
  if (ctx.knownThreadKeys.has(ctx.threadKey)) return true;
  if (isJobBoard(m.fromAddress) || isAtsSender(m.fromAddress)) return true;
  const org = senderOrg(m.fromAddress);
  if (org.length >= 3) {
    for (const key of ctx.knownCompanyKeys) {
      const compact = key.replace(/\s/g, "");
      if (compact && (compact.includes(org) || org.includes(compact))) return true;
    }
  }
  return RELEVANT_WORDS.test(m.subject);
}
