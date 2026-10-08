CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"batch" boolean DEFAULT false NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"email_id" uuid,
	"detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"job_id" uuid,
	"cv_version_id" uuid,
	"source" text NOT NULL,
	"external_id" text,
	"company" text DEFAULT '' NOT NULL,
	"company_key" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"job_url" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'saved' NOT NULL,
	"applied_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"capture_method" text DEFAULT 'manual' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cv_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"job_id" uuid,
	"title" text NOT NULL,
	"data" jsonb NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unsupported" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ats_before" integer DEFAULT 0 NOT NULL,
	"ats_after" integer DEFAULT 0 NOT NULL,
	"matched_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missing_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"mail_account_id" uuid,
	"direction" text DEFAULT 'in' NOT NULL,
	"uid" integer,
	"message_id" text NOT NULL,
	"thread_key" text NOT NULL,
	"from_address" text DEFAULT '' NOT NULL,
	"from_name" text DEFAULT '' NOT NULL,
	"to_address" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"job_title" text DEFAULT '' NOT NULL,
	"classified_by" text DEFAULT 'pending' NOT NULL,
	"application_id" uuid,
	"needs_review" boolean DEFAULT false NOT NULL,
	"pending_body" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_skills" (
	"job_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"skill" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_skills_job_id_skill_kind_pk" PRIMARY KEY("job_id","skill","kind")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"url" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"salary_text" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"description_hash" text,
	"apply_type" text DEFAULT 'unknown' NOT NULL,
	"captured_via" text DEFAULT 'manual' NOT NULL,
	"extracted" jsonb,
	"extracted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"email_address" text NOT NULL,
	"imap_host" text NOT NULL,
	"imap_port" integer DEFAULT 993 NOT NULL,
	"imap_secure" boolean DEFAULT true NOT NULL,
	"imap_user" text NOT NULL,
	"imap_password_enc" text NOT NULL,
	"smtp_host" text DEFAULT '' NOT NULL,
	"smtp_port" integer DEFAULT 465 NOT NULL,
	"smtp_secure" boolean DEFAULT true NOT NULL,
	"smtp_user" text DEFAULT '' NOT NULL,
	"smtp_password_enc" text DEFAULT '' NOT NULL,
	"from_name" text DEFAULT '' NOT NULL,
	"mailbox" text DEFAULT 'INBOX' NOT NULL,
	"uid_validity" text,
	"last_uid" integer DEFAULT 0 NOT NULL,
	"backfill_days" integer DEFAULT 90 NOT NULL,
	"backfill_done" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_accounts_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "mail_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"from_contains" text DEFAULT '' NOT NULL,
	"subject_contains" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_cv" (
	"user_id" text PRIMARY KEY NOT NULL,
	"original_file_name" text DEFAULT '' NOT NULL,
	"original_pdf" "bytea",
	"data" jsonb NOT NULL,
	"extra_facts" text DEFAULT '' NOT NULL,
	"parsed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"total_experience" text DEFAULT '' NOT NULL,
	"current_ctc" text DEFAULT '' NOT NULL,
	"expected_ctc" text DEFAULT '' NOT NULL,
	"notice_period" text DEFAULT '' NOT NULL,
	"preferred_locations" text DEFAULT '' NOT NULL,
	"linkedin_url" text DEFAULT '' NOT NULL,
	"github_url" text DEFAULT '' NOT NULL,
	"portfolio_url" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"question_key" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"source" text DEFAULT 'user' NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_batches" ADD CONSTRAINT "ai_batches_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_cv_version_id_cv_versions_id_fk" FOREIGN KEY ("cv_version_id") REFERENCES "public"."cv_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_versions" ADD CONSTRAINT "cv_versions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_versions" ADD CONSTRAINT "cv_versions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_mail_account_id_mail_accounts_id_fk" FOREIGN KEY ("mail_account_id") REFERENCES "public"."mail_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_accounts" ADD CONSTRAINT "mail_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_rules" ADD CONSTRAINT "mail_rules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_cv" ADD CONSTRAINT "master_cv_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_answers" ADD CONSTRAINT "saved_answers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_usage_user_created" ON "ai_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "application_events_app" ON "application_events" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_user_source_ext" ON "applications" USING btree ("user_id","source","external_id");--> statement-breakpoint
CREATE INDEX "applications_user_status" ON "applications" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "applications_user_company" ON "applications" USING btree ("user_id","company_key");--> statement-breakpoint
CREATE INDEX "applications_user_applied" ON "applications" USING btree ("user_id","applied_at");--> statement-breakpoint
CREATE INDEX "cv_versions_user_created" ON "cv_versions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "emails_user_message" ON "emails" USING btree ("user_id","message_id");--> statement-breakpoint
CREATE INDEX "emails_user_received" ON "emails" USING btree ("user_id","received_at");--> statement-breakpoint
CREATE INDEX "emails_user_thread" ON "emails" USING btree ("user_id","thread_key");--> statement-breakpoint
CREATE INDEX "emails_application" ON "emails" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "job_skills_user_skill" ON "job_skills" USING btree ("user_id","skill");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_user_source_ext" ON "jobs" USING btree ("user_id","source","external_id");--> statement-breakpoint
CREATE INDEX "jobs_user_hash" ON "jobs" USING btree ("user_id","description_hash");--> statement-breakpoint
CREATE INDEX "jobs_user_created" ON "jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "mail_rules_user" ON "mail_rules" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_answers_user_key" ON "saved_answers" USING btree ("user_id","question_key");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");