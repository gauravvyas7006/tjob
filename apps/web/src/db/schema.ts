import {
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  ApplicationStatus,
  CaptureMethod,
  Cv,
  EmailCategory,
  JdExtraction,
  JobSource,
  TailorChange,
  TailorGap,
} from "@tjob/shared";

const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array | string }>({
  dataType() {
    return "bytea";
  },
  fromDriver(value) {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    // neon-http returns bytea as a "\x..." hex string
    return Buffer.from(String(value).replace(/^\\x/, ""), "hex");
  },
  toDriver(value) {
    return value;
  },
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Better Auth tables (names/fields must match Better Auth's core schema)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// tjob tables
// ---------------------------------------------------------------------------

const userRef = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

/** Standard answers used by autofill and follow-ups. */
export const profile = pgTable("profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull().default(""),
  phone: text("phone").notNull().default(""),
  location: text("location").notNull().default(""),
  totalExperience: text("total_experience").notNull().default(""),
  currentCtc: text("current_ctc").notNull().default(""),
  expectedCtc: text("expected_ctc").notNull().default(""),
  noticePeriod: text("notice_period").notNull().default(""),
  preferredLocations: text("preferred_locations").notNull().default(""),
  linkedinUrl: text("linkedin_url").notNull().default(""),
  githubUrl: text("github_url").notNull().default(""),
  portfolioUrl: text("portfolio_url").notNull().default(""),
  ...timestamps,
});

/** Answers to application questions, reused by autofill so AI only sees new questions. */
export const savedAnswers = pgTable(
  "saved_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    questionKey: text("question_key").notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    source: text("source").$type<"user" | "ai">().notNull().default("user"),
    useCount: integer("use_count").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("saved_answers_user_key").on(t.userId, t.questionKey)],
);

export const masterCv = pgTable("master_cv", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  originalFileName: text("original_file_name").notNull().default(""),
  originalPdf: bytea("original_pdf"),
  data: jsonb("data").$type<Cv>().notNull(),
  /** True facts the user adds over time; tailoring may use these but nothing else. */
  extraFacts: text("extra_facts").notNull().default(""),
  parsedAt: timestamp("parsed_at", { withTimezone: true }),
  ...timestamps,
});

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    source: text("source").$type<JobSource>().notNull(),
    externalId: text("external_id"),
    url: text("url").notNull().default(""),
    title: text("title").notNull().default(""),
    company: text("company").notNull().default(""),
    location: text("location").notNull().default(""),
    salaryText: text("salary_text").notNull().default(""),
    description: text("description").notNull().default(""),
    descriptionHash: text("description_hash"),
    applyType: text("apply_type").notNull().default("unknown"),
    capturedVia: text("captured_via").$type<CaptureMethod>().notNull().default("manual"),
    extracted: jsonb("extracted").$type<JdExtraction>(),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("jobs_user_source_ext").on(t.userId, t.source, t.externalId),
    index("jobs_user_hash").on(t.userId, t.descriptionHash),
    index("jobs_user_created").on(t.userId, t.createdAt),
  ],
);

export const jobSkills = pgTable(
  "job_skills",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    userId: userRef(),
    skill: text("skill").notNull(),
    kind: text("kind").$type<"required" | "nice">().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.jobId, t.skill, t.kind] }),
    index("job_skills_user_skill").on(t.userId, t.skill),
  ],
);

export const cvVersions = pgTable(
  "cv_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    data: jsonb("data").$type<Cv>().notNull(),
    changes: jsonb("changes").$type<TailorChange[]>().notNull().default([]),
    gaps: jsonb("gaps").$type<TailorGap[]>().notNull().default([]),
    /** Skills the output mentions that aren't in the master CV or extra facts. */
    unsupported: jsonb("unsupported").$type<string[]>().notNull().default([]),
    atsBefore: integer("ats_before").notNull().default(0),
    atsAfter: integer("ats_after").notNull().default(0),
    matchedKeywords: jsonb("matched_keywords").$type<string[]>().notNull().default([]),
    missingKeywords: jsonb("missing_keywords").$type<string[]>().notNull().default([]),
    model: text("model").notNull().default(""),
    ...timestamps,
  },
  (t) => [index("cv_versions_user_created").on(t.userId, t.createdAt)],
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    cvVersionId: uuid("cv_version_id").references(() => cvVersions.id, { onDelete: "set null" }),
    source: text("source").$type<JobSource>().notNull(),
    externalId: text("external_id"),
    company: text("company").notNull().default(""),
    companyKey: text("company_key").notNull().default(""),
    title: text("title").notNull().default(""),
    location: text("location").notNull().default(""),
    jobUrl: text("job_url").notNull().default(""),
    status: text("status").$type<ApplicationStatus>().notNull().default("saved"),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    captureMethod: text("capture_method").$type<CaptureMethod>().notNull().default("manual"),
    notes: text("notes").notNull().default(""),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("applications_user_source_ext").on(t.userId, t.source, t.externalId),
    index("applications_user_status").on(t.userId, t.status),
    index("applications_user_company").on(t.userId, t.companyKey),
    index("applications_user_applied").on(t.userId, t.appliedAt),
  ],
);

export const mailAccounts = pgTable("mail_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  emailAddress: text("email_address").notNull(),
  imapHost: text("imap_host").notNull(),
  imapPort: integer("imap_port").notNull().default(993),
  imapSecure: boolean("imap_secure").notNull().default(true),
  imapUser: text("imap_user").notNull(),
  imapPasswordEnc: text("imap_password_enc").notNull(),
  smtpHost: text("smtp_host").notNull().default(""),
  smtpPort: integer("smtp_port").notNull().default(465),
  smtpSecure: boolean("smtp_secure").notNull().default(true),
  smtpUser: text("smtp_user").notNull().default(""),
  smtpPasswordEnc: text("smtp_password_enc").notNull().default(""),
  fromName: text("from_name").notNull().default(""),
  mailbox: text("mailbox").notNull().default("INBOX"),
  // sync state
  uidValidity: text("uid_validity"),
  lastUid: integer("last_uid").notNull().default(0),
  backfillDays: integer("backfill_days").notNull().default(90),
  backfillDone: boolean("backfill_done").notNull().default(false),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastSyncError: text("last_sync_error"),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  ...timestamps,
});

export const emails = pgTable(
  "emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    mailAccountId: uuid("mail_account_id").references(() => mailAccounts.id, { onDelete: "set null" }),
    direction: text("direction").$type<"in" | "out">().notNull().default("in"),
    uid: integer("uid"),
    messageId: text("message_id").notNull(),
    threadKey: text("thread_key").notNull(),
    fromAddress: text("from_address").notNull().default(""),
    fromName: text("from_name").notNull().default(""),
    toAddress: text("to_address").notNull().default(""),
    subject: text("subject").notNull().default(""),
    snippet: text("snippet").notNull().default(""),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    category: text("category").$type<EmailCategory>().notNull().default("other"),
    confidence: real("confidence").notNull().default(0),
    summary: text("summary").notNull().default(""),
    company: text("company").notNull().default(""),
    jobTitle: text("job_title").notNull().default(""),
    classifiedBy: text("classified_by")
      .$type<"rule" | "ai" | "user" | "pending" | "batched" | "budget">()
      .notNull()
      .default("pending"),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "set null" }),
    needsReview: boolean("needs_review").notNull().default(false),
    /** Trimmed body kept only until AI classification runs (batch backfill), then cleared. */
    pendingBody: text("pending_body"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("emails_user_message").on(t.userId, t.messageId),
    index("emails_user_received").on(t.userId, t.receivedAt),
    index("emails_user_thread").on(t.userId, t.threadKey),
    index("emails_application").on(t.applicationId),
  ],
);

export const applicationEvents = pgTable(
  "application_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    type: text("type")
      .$type<"created" | "status_change" | "email" | "note" | "cv_attached" | "followup_sent">()
      .notNull(),
    fromStatus: text("from_status").$type<ApplicationStatus>(),
    toStatus: text("to_status").$type<ApplicationStatus>(),
    emailId: uuid("email_id").references(() => emails.id, { onDelete: "set null" }),
    detail: text("detail").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("application_events_app").on(t.applicationId, t.createdAt)],
);

/** Sender/subject patterns → category, learned from the user's corrections in the Review list. */
export const mailRules = pgTable(
  "mail_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    fromContains: text("from_contains").notNull().default(""),
    subjectContains: text("subject_contains").notNull().default(""),
    category: text("category").$type<EmailCategory>().notNull(),
    hits: integer("hits").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("mail_rules_user").on(t.userId)],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    feature: text("feature").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    batch: boolean("batch").notNull().default(false),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_user_created").on(t.userId, t.createdAt)],
);

/** Anthropic Message Batches submitted for the email backfill (50% cheaper). */
export const aiBatches = pgTable("ai_batches", {
  id: text("id").primaryKey(),
  userId: userRef(),
  kind: text("kind").notNull(),
  status: text("status").$type<"in_progress" | "ended" | "applied" | "failed">().notNull(),
  requestCount: integer("request_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userRef(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authSchema = { user, session, account, verification };
