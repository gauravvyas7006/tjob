export const JOB_SOURCES = ["linkedin", "naukri", "other"] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export const CAPTURE_METHODS = ["email", "extension", "csv", "manual"] as const;
export type CaptureMethod = (typeof CAPTURE_METHODS)[number];

export const APPLICATION_STATUSES = [
  "saved",
  "cv_ready",
  "applied",
  "viewed",
  "assessment",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "ghosted",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  cv_ready: "CV ready",
  applied: "Applied",
  viewed: "Viewed",
  assessment: "Assessment",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  ghosted: "Ghosted",
};

/** Statuses that count as "the employer responded". */
export const RESPONSE_STATUSES: readonly ApplicationStatus[] = [
  "viewed",
  "assessment",
  "interview",
  "offer",
  "rejected",
];

/** Statuses an email can never move an application out of automatically. */
export const TERMINAL_STATUSES: readonly ApplicationStatus[] = ["offer", "rejected", "withdrawn"];

const STATUS_RANK: Record<ApplicationStatus, number> = {
  saved: 0,
  cv_ready: 1,
  applied: 2,
  ghosted: 2,
  viewed: 3,
  assessment: 4,
  interview: 5,
  offer: 6,
  rejected: 6,
  withdrawn: 6,
};

/**
 * Whether an automatic signal (email, extension) may move an application from `from` to `to`.
 * Forward-only; terminal statuses stick; ghosted revives on any activity; rejection/offer always land
 * unless the application is already terminal. Manual edits bypass this.
 */
export function canAutoTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  if (from === to) return false;
  if (TERMINAL_STATUSES.includes(from)) return false;
  if (to === "withdrawn" || to === "ghosted") return false;
  if (to === "rejected" || to === "offer") return true;
  if (from === "ghosted") return STATUS_RANK[to] >= STATUS_RANK.applied;
  return STATUS_RANK[to] > STATUS_RANK[from];
}

export const GHOSTED_AFTER_DAYS = 21;

export const EMAIL_CATEGORIES = [
  "application_confirmation",
  "application_viewed",
  "recruiter_reply",
  "assessment",
  "interview",
  "offer",
  "rejection",
  "job_alert",
  "other",
] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];

export const EMAIL_CATEGORY_LABELS: Record<EmailCategory, string> = {
  application_confirmation: "Application sent",
  application_viewed: "Viewed",
  recruiter_reply: "Recruiter reply",
  assessment: "Assessment",
  interview: "Interview",
  offer: "Offer",
  rejection: "Rejection",
  job_alert: "Job alert",
  other: "Other",
};

/** The application status an email category implies, if any. */
export const CATEGORY_TO_STATUS: Partial<Record<EmailCategory, ApplicationStatus>> = {
  application_confirmation: "applied",
  application_viewed: "viewed",
  recruiter_reply: "viewed",
  assessment: "assessment",
  interview: "interview",
  offer: "offer",
  rejection: "rejected",
};

export const AGENCY_KINDS = ["staffing", "recruiter", "search", "platform"] as const;
export type AgencyKind = (typeof AGENCY_KINDS)[number];

export const AGENCY_KIND_LABELS: Record<AgencyKind, string> = {
  staffing: "IT staffing",
  recruiter: "Recruitment firm",
  search: "Executive search",
  platform: "Hiring platform",
};

export const AGENCY_STATUSES = ["to_contact", "contacted", "in_touch", "not_useful"] as const;
export type AgencyStatus = (typeof AGENCY_STATUSES)[number];

export const AGENCY_STATUS_LABELS: Record<AgencyStatus, string> = {
  to_contact: "To contact",
  contacted: "Contacted",
  in_touch: "In touch",
  not_useful: "Not useful",
};

export const EVENT_SOURCES = ["luma", "meetup", "eventbrite"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export const EVENT_SOURCE_LABELS: Record<EventSource, string> = {
  luma: "Luma",
  meetup: "Meetup",
  eventbrite: "Eventbrite",
};

export const EVENT_TOPICS = ["ai", "java", "javascript", "cloud", "data", "security", "dev", "startups"] as const;
export type EventTopic = (typeof EVENT_TOPICS)[number];

export const EVENT_TOPIC_LABELS: Record<EventTopic, string> = {
  ai: "AI & ML",
  java: "Java",
  javascript: "JavaScript & Node",
  cloud: "Cloud & DevOps",
  data: "Data",
  security: "Security",
  dev: "Software dev",
  startups: "Startups",
};

/** The user's own plan for an event. "hidden" removes it from the list. */
export const EVENT_MARKS = ["interested", "going", "hidden"] as const;
export type EventMark = (typeof EVENT_MARKS)[number];

export const EVENT_MARK_LABELS: Record<EventMark, string> = {
  interested: "Interested",
  going: "Going",
  hidden: "Not for me",
};

export const AI_FEATURES = [
  "classify_email",
  "extract_jd",
  "tailor_cv",
  "parse_cv",
  "autofill_answer",
  "followup_draft",
  "fact_suggest",
  "fact_polish",
] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
  classify_email: "Email sorting",
  extract_jd: "Job description extraction",
  tailor_cv: "CV tailoring",
  parse_cv: "CV reading",
  autofill_answer: "Application answers",
  followup_draft: "Follow-up drafts",
  fact_suggest: "Gap suggestions from your projects",
  fact_polish: "Wording fixes",
};
