import { beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { emptyCv, type Cv, type JdExtraction, type TailorPatch } from "@tjob/shared";

// AI calls are mocked: these tests exercise tjob's own logic and SQL, not the model.
vi.mock("@/lib/ai/extract-jd", () => ({
  extractJd: vi.fn(
    async (): Promise<JdExtraction> => ({
      title: "Java Developer",
      company: "Acme",
      location: "Pune",
      roleCategory: "Java Backend",
      seniority: "mid",
      minYears: 3,
      maxYears: 6,
      requiredSkills: ["Java", "Spring Boot", "Kafka"],
      niceToHaveSkills: ["AWS"],
      keywords: ["Microservices"],
      salaryMinLpa: 12,
      salaryMaxLpa: 20,
      salaryText: "12-20 LPA",
      workMode: "hybrid",
      responsibilities: [],
    }),
  ),
}));
vi.mock("@/lib/ai/tailor-cv", () => ({
  tailorCv: vi.fn(
    async (): Promise<TailorPatch> => ({
      headline: "Backend Engineer | Java, Spring Boot, Microservices",
      summary: "Backend engineer building Spring Boot microservices.",
      skills: [{ category: "Backend", items: ["Java", "Spring Boot", "Microservices"] }],
      experience: [{ id: "exp-1", bullets: ["Designed Spring Boot microservices for MARS order flows"] }],
      projectOrder: [],
      projects: [],
      changes: [{ section: "Experience", reason: "Led with microservices work" }],
      gaps: [{ requirement: "Kafka", note: "Add it to Extra facts if you used it" }],
    }),
  ),
}));

const { db, user, applications, emails, jobSkills, applicationEvents, masterCv, profile, savedAnswers, aiUsage, agencies } =
  await import("@/db");
const { processIncomingMail } = await import("./mail/process");
const { upsertJob, ensureJobExtracted, pastedJobInput } = await import("./jobs");
const { applicationForJob, changeStatus, markGhosted } = await import("./applications");
const { tailorForJob, tailorThread, tailorThreads } = await import("./cv/service");
const { importApplications } = await import("./import/applications");
const { autofillAnswers, saveAnswers } = await import("./autofill");
const { assertAiAvailable, recordUsage, budgetStatus, AiUnavailableError } = await import("./ai/budget");
const { encryptSecret, decryptSecret } = await import("./crypto");
const { overviewStats, weeklyApplications, recentActivity } = await import("./stats");
const { marketInsights } = await import("./insights");
const { addSuggestedAgencies, missingSuggestionCount, setAgencyStatus } = await import("./agencies/service");
const { SUGGESTED_AGENCIES } = await import("./agencies/suggested");
const { refreshEvents, setEventMark, upcomingEvents } = await import("./events/service");
const { events, eventSources } = await import("@/db");
const { inDays, lumaResponse, meetupPage } = await import("./events/fixtures");

const USER = "user-1";

function masterFixture(): Cv {
  const cv = emptyCv();
  cv.contact.name = "Test Candidate";
  cv.headline = "Software Engineer";
  cv.summary = "Engineer at MARS.";
  cv.skills = [{ category: "Backend", items: ["Java", "Spring Boot", "MySQL"] }];
  cv.experience = [
    {
      id: "exp-1",
      company: "MARS",
      role: "Software Engineer",
      location: "Pune",
      startDate: "2021",
      endDate: "Present",
      bullets: ["Built REST APIs for order management in Spring Boot"],
      tech: ["Java", "Spring Boot", "MySQL"],
    },
  ];
  return cv;
}

beforeAll(async () => {
  await db.insert(user).values({ id: USER, name: "Test Candidate", email: "owner@example.com" });
});

describe("email → application pipeline", () => {
  const base = {
    uid: 1,
    fromName: "LinkedIn",
    toAddress: "me@example.com",
    text: "",
  };

  it("creates an application from a LinkedIn confirmation, then rejects it from a later update", async () => {
    const r1 = await processIncomingMail(
      USER,
      null as unknown as string,
      {
        ...base,
        messageId: "<m1@linkedin.com>",
        threadKey: "<m1@linkedin.com>",
        fromAddress: "jobs-noreply@linkedin.com",
        subject: "Your application was sent to Globex",
        receivedAt: new Date("2026-09-01T10:00:00Z"),
        text: "Senior Java Developer\nGlobex · Pune\nhttps://www.linkedin.com/comm/jobs/view/4012345678/",
      },
      { userRules: [], deferAi: false },
    );
    expect(r1).toBe("rule");
    const [app] = await db.select().from(applications).where(eq(applications.company, "Globex"));
    expect(app).toMatchObject({ status: "applied", source: "linkedin", externalId: "4012345678", captureMethod: "email" });
    expect(app.appliedAt?.toISOString()).toBe("2026-09-01T10:00:00.000Z");

    const r2 = await processIncomingMail(
      USER,
      null as unknown as string,
      {
        ...base,
        uid: 2,
        messageId: "<m2@linkedin.com>",
        threadKey: "<m2@linkedin.com>",
        fromAddress: "jobs-noreply@linkedin.com",
        subject: "Your update from Globex",
        receivedAt: new Date("2026-09-10T10:00:00Z"),
        text: "Thank you for your interest. Unfortunately, we have decided to move forward with other candidates.",
      },
      { userRules: [], deferAi: false },
    );
    expect(r2).toBe("rule");
    const [after] = await db.select().from(applications).where(eq(applications.id, app.id));
    expect(after.status).toBe("rejected");
    const linked = await db.select().from(emails).where(eq(emails.applicationId, app.id));
    expect(linked).toHaveLength(2);
    const events = await db.select().from(applicationEvents).where(eq(applicationEvents.applicationId, app.id));
    expect(events.map((e) => e.toStatus)).toContain("rejected");
  });

  it("ignores duplicates and skips non-job LinkedIn notifications without storing them", async () => {
    const dup = await processIncomingMail(
      USER,
      null as unknown as string,
      {
        ...base,
        messageId: "<m1@linkedin.com>",
        threadKey: "<m1@linkedin.com>",
        fromAddress: "jobs-noreply@linkedin.com",
        subject: "Your application was sent to Globex",
        receivedAt: new Date(),
      },
      { userRules: [], deferAi: false },
    );
    expect(dup).toBe("duplicate");
    const social = await processIncomingMail(
      USER,
      null as unknown as string,
      {
        ...base,
        messageId: "<s1@linkedin.com>",
        threadKey: "<s1@linkedin.com>",
        fromAddress: "notifications-noreply@linkedin.com",
        subject: "Ravi commented on your post",
        receivedAt: new Date(),
      },
      { userRules: [], deferAi: false },
    );
    expect(social).toBe("skipped");
    const stored = await db.select().from(emails).where(eq(emails.messageId, "<s1@linkedin.com>"));
    expect(stored).toHaveLength(0);
  });

  it("holds unknown emails for review when AI isn't available, and defers them during backfill", async () => {
    const review = await processIncomingMail(
      USER,
      null as unknown as string,
      {
        ...base,
        messageId: "<r1@acme.com>",
        threadKey: "<r1@acme.com>",
        fromAddress: "ravi@acme.com",
        fromName: "Ravi",
        subject: "Quick question about your profile",
        receivedAt: new Date(),
        text: "Are you open to a Java role?",
      },
      { userRules: [], deferAi: false },
    );
    expect(review).toBe("review");
    const deferred = await processIncomingMail(
      USER,
      null as unknown as string,
      {
        ...base,
        messageId: "<r2@acme.com>",
        threadKey: "<r2@acme.com>",
        fromAddress: "ravi@acme.com",
        subject: "Following up",
        receivedAt: new Date(),
        text: "Hi again",
      },
      { userRules: [], deferAi: true },
    );
    expect(deferred).toBe("deferred");
    const [row] = await db.select().from(emails).where(eq(emails.messageId, "<r2@acme.com>"));
    expect(row.classifiedBy).toBe("pending");
    expect(row.pendingBody).toBe("Hi again");
  });

  it("turns LinkedIn job-alert emails into leads without AI", async () => {
    const out = await processIncomingMail(
      USER,
      null as unknown as string,
      {
        ...base,
        uid: 9,
        messageId: "<alert1@linkedin.com>",
        threadKey: "<alert1@linkedin.com>",
        fromAddress: "jobalerts-noreply@linkedin.com",
        subject: "30+ new jobs for Java Developer",
        receivedAt: new Date(),
        text: "Lead Java Engineer\nInitech · Pune\nhttps://www.linkedin.com/comm/jobs/view/4077777777/?trk=1",
      },
      { userRules: [], deferAi: false },
    );
    expect(out).toBe("rule");
    const { jobs } = await import("@/db");
    const [lead] = await db.select().from(jobs).where(eq(jobs.externalId, "4077777777"));
    expect(lead).toMatchObject({ title: "Lead Java Engineer", company: "Initech", capturedVia: "email", source: "linkedin" });
  });

  it("applies the user's learned rules", async () => {
    const out = await processIncomingMail(
      USER,
      null as unknown as string,
      {
        ...base,
        messageId: "<u1@initech.com>",
        threadKey: "<u1@initech.com>",
        fromAddress: "talent@initech.com",
        subject: "Next steps",
        receivedAt: new Date(),
      },
      {
        userRules: [{ id: "00000000-0000-0000-0000-000000000000", fromContains: "talent@initech.com", subjectContains: "", category: "recruiter_reply" }],
        deferAi: false,
      },
    );
    expect(out).toBe("rule");
    const [row] = await db.select().from(emails).where(eq(emails.messageId, "<u1@initech.com>"));
    expect(row.category).toBe("recruiter_reply");
    expect(row.needsReview).toBe(true); // recruiter reply with no matching application → Review list
  });
});

describe("extension flow: save → tailor → applied", () => {
  it("de-duplicates jobs, tailors a CV without inventing skills, and tracks status", async () => {
    await db.insert(masterCv).values({ userId: USER, data: masterFixture(), extraFacts: "" });
    const input = {
      source: "linkedin" as const,
      externalId: "4099999999",
      url: "https://www.linkedin.com/jobs/view/4099999999/",
      title: "Java Developer",
      company: "Acme",
      description: "We are hiring a Java Developer with Spring Boot, Kafka and AWS experience to build microservices. ".repeat(3),
      capturedVia: "extension" as const,
    };
    const job = await upsertJob(USER, input);
    const again = await upsertJob(USER, { ...input, description: input.description });
    expect(again.id).toBe(job.id);

    const v = await tailorForJob(USER, job.id, { captureMethod: "extension" });
    expect(v.atsBefore).toBeLessThan(v.atsAfter);
    expect(v.missingKeywords).toContain("Kafka");
    // The mocked rewrite calls the MARS work "microservices", which the master CV never says:
    // the guard must flag it for the user to confirm or remove.
    expect(v.unsupported).toEqual(["Microservices"]);
    expect(v.data.experience[0].company).toBe("MARS");
    expect(v.data.experience[0].bullets[0]).toContain("microservices");

    const app = await applicationForJob(USER, job, "extension");
    expect(app.status).toBe("cv_ready");
    expect(app.cvVersionId).toBe(v.id);
    expect(await changeStatus(app, "applied", { auto: true })).toBe(true);

    const skills = await db.select().from(jobSkills).where(eq(jobSkills.jobId, job.id));
    expect(skills.map((s) => s.skill).sort()).toEqual(["AWS", "Java", "Kafka", "Spring Boot"]);
    expect(await ensureJobExtracted(USER, { ...job, extracted: null, extractedAt: null })).toBeTruthy();
  });

  it("imports applied-jobs pages without duplicating existing applications", async () => {
    const r = await importApplications(
      USER,
      "linkedin",
      [
        { externalId: "4099999999", url: "", title: "Java Developer", company: "Acme", appliedAt: null, statusText: "Application viewed" },
        { externalId: "4011111111", url: "", title: "Node.js Engineer", company: "Hooli", appliedAt: new Date("2026-08-20"), statusText: "Applied 3w ago" },
      ],
      "extension",
    );
    expect(r).toEqual({ created: 1, updated: 1, skipped: 0 });
    const [acme] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.externalId, "4099999999"), eq(applications.userId, USER)));
    expect(acme.status).toBe("viewed");
  });

  it("marks stale applications as ghosted", async () => {
    await db
      .update(applications)
      .set({ lastActivityAt: new Date("2026-01-01") })
      .where(eq(applications.externalId, "4011111111"));
    expect(await markGhosted(USER)).toBeGreaterThanOrEqual(1);
    const [hooli] = await db.select().from(applications).where(eq(applications.externalId, "4011111111"));
    expect(hooli.status).toBe("ghosted");
  });
});

describe("autofill", () => {
  it("answers from profile and saved answers for free, leaves unknowns blank without AI", async () => {
    await db.insert(profile).values({ userId: USER, noticePeriod: "30 days", totalExperience: "4.5 years", currentCtc: "12 LPA" });
    await saveAnswers(USER, [{ question: "Years of experience with Java?", value: "4" }]);
    const res = await autofillAnswers(USER, {
      jobId: null,
      questions: [
        { id: "a", label: "Notice period", type: "select", options: ["Immediate", "15 days", "30 days", "60 days"] },
        { id: "b", label: "Total experience (in years)", type: "number", options: [] },
        { id: "c", label: "How many years of experience do you have with Java?", type: "number", options: [] },
        { id: "d", label: "Why do you want to join us?", type: "textarea", options: [] },
      ],
    });
    const byId = Object.fromEntries(res.answers.map((a) => [a.id, a]));
    expect(byId.a).toMatchObject({ value: "30 days", source: "profile" });
    expect(byId.b).toMatchObject({ value: "4.5", source: "profile" });
    expect(byId.c).toMatchObject({ value: "4", source: "saved" });
    expect(byId.d).toMatchObject({ value: "", source: "none" });
    const [saved] = await db.select().from(savedAnswers).where(eq(savedAnswers.userId, USER));
    expect(saved.useCount).toBe(1);
  });
});

describe("budget guard", () => {
  it("records cost and blocks AI once the monthly budget is spent", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    try {
      await assertAiAvailable(USER);
      const cost = await recordUsage(USER, "tailor_cv", "claude-sonnet-5-5", {
        inputTokens: 1500,
        outputTokens: 2500,
        cacheReadTokens: 4500,
        cacheWriteTokens: 0,
      });
      expect(cost).toBeCloseTo((1500 * 2 + 2500 * 10 + 4500 * 0.2) / 1e6, 8);
      await db.insert(aiUsage).values({ userId: USER, feature: "tailor_cv", model: "claude-sonnet-5-5", costUsd: 9.99 });
      expect((await budgetStatus(USER)).state).toBe("exceeded");
      await expect(assertAiAvailable(USER)).rejects.toBeInstanceOf(AiUnavailableError);
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });
});

describe("dashboard & insights SQL", () => {
  it("computes overview stats, weekly series, activity and market insights", async () => {
    const stats = await overviewStats(USER);
    expect(stats.applied).toBeGreaterThanOrEqual(3);
    expect(stats.responded).toBeGreaterThanOrEqual(2); // Globex rejected, Acme viewed
    expect(stats.responseRate).toBeGreaterThan(0);
    const weekly = await weeklyApplications(USER);
    expect(weekly.length).toBeGreaterThan(0);
    expect((await recentActivity(USER)).length).toBeGreaterThan(0);

    const ins = await marketInsights(USER);
    expect(ins.jds).toBe(1);
    expect(ins.topSkills.find((s) => s.skill === "Java")?.inCv).toBe(true);
    expect(ins.topSkills.find((s) => s.skill === "Kafka")?.inCv).toBe(false);
    expect(ins.salary[0]).toMatchObject({ role: "Java Backend", min: 12, max: 20, median: 16 });
    expect(ins.experience.find((e) => e.label === "2–3")?.value).toBe(1);
  });
});

describe("agencies", () => {
  it("adds the suggested list once and tracks outreach dates", async () => {
    expect(await addSuggestedAgencies(USER)).toBe(SUGGESTED_AGENCIES.length);
    expect(await addSuggestedAgencies(USER)).toBe(0);

    const [own] = await db.insert(agencies).values({ userId: USER, name: "My recruiter" }).returning();
    const names = (await db.select({ name: agencies.name }).from(agencies).where(eq(agencies.userId, USER))).map((r) => r.name);
    expect(missingSuggestionCount(names)).toBe(0);
    expect(missingSuggestionCount(["My recruiter"])).toBe(SUGGESTED_AGENCIES.length);

    const contactedAt = async () =>
      (await db.select({ at: agencies.contactedAt }).from(agencies).where(eq(agencies.id, own.id)))[0].at;
    await setAgencyStatus(USER, own.id, "contacted");
    const first = await contactedAt();
    expect(first).toBeInstanceOf(Date);
    await setAgencyStatus(USER, own.id, "in_touch");
    expect(await contactedAt()).toEqual(first);
    await setAgencyStatus(USER, own.id, "not_useful");
    expect(await contactedAt()).toEqual(first);
    await setAgencyStatus(USER, own.id, "to_contact");
    expect(await contactedAt()).toBeNull();
    // Another user's agency is never touched.
    await setAgencyStatus("someone-else", own.id, "contacted");
    expect(await contactedAt()).toBeNull();
  });
});

describe("tailor chat", () => {
  it("turns a pasted job description into a conversation of CV versions", async () => {
    await db.insert(masterCv).values({ userId: USER, data: masterFixture() }).onConflictDoNothing();
    const pasted = [
      "Senior Java Developer, Acme. Apply: https://www.linkedin.com/jobs/view/java-developer-at-acme-4012345678/?ref=x",
      "Spring Boot microservices and Kafka. ".repeat(10),
    ].join("\n");
    const input = pastedJobInput({ description: pasted });
    expect(input).toMatchObject({ source: "linkedin", externalId: "4012345678", capturedVia: "manual" });
    expect(pastedJobInput({ description: "x", url: "https://www.naukri.com/job-listings-java-dev-acme-pune-3-to-6-years-081025912345" }))
      .toMatchObject({ source: "naukri", externalId: "081025912345" });
    expect(pastedJobInput({ description: "No link here" })).toMatchObject({ source: "other", externalId: null, url: "" });

    const job = await upsertJob(USER, input);
    const first = await tailorForJob(USER, job.id);
    const second = await tailorForJob(USER, job.id, { focusNote: "  lead with the microservices work  " });
    expect(second.focusNote).toBe("lead with the microservices work");

    const thread = await tailorThread(USER, job.id);
    expect(thread?.versions.map((v) => [v.id, v.focusNote])).toEqual([
      [first.id, ""],
      [second.id, "lead with the microservices work"],
    ]);
    // Pasting the same description again continues the same conversation.
    expect((await upsertJob(USER, pastedJobInput({ description: pasted }))).id).toBe(job.id);
    expect((await tailorThreads(USER))[0]).toMatchObject({ jobId: job.id, versions: 2, title: "Java Developer" });
    expect(await tailorThread("someone-else", job.id)).toBeNull();
  });
});

describe("events", () => {
  it("reads the listings, survives a failing site, merges duplicates and keeps the user's plans", async () => {
    const start = inDays(4);
    let meetupFails = false;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("api.lu.ma")) {
        return Response.json(
          lumaResponse([
            { id: "evt-1", name: "Swift Bengaluru × Okta", start },
            { id: "evt-2", name: "Matcha with friends", start },
            { id: "evt-3", name: "LLM Summit", start: inDays(6), free: false },
          ]),
        );
      }
      if (url.includes("meetup.com")) {
        if (meetupFails) return new Response("blocked", { status: 403 });
        return new Response(meetupPage([{ id: "101", title: "Swift Bengaluru × Okta", start }]));
      }
      return new Response("Forbidden", { status: 403 });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const first = await refreshEvents();
      expect(first.skipped).toBe(false);
      expect(first.sources).toEqual([
        { source: "luma", count: 2 },
        { source: "meetup", count: 1 },
        { source: "eventbrite", count: 0, error: "www.eventbrite.com answered HTTP 403" },
      ]);
      const status = await db.select().from(eventSources);
      expect(status.find((s) => s.source === "eventbrite")).toMatchObject({ lastOkAt: null, lastError: expect.stringContaining("403") });

      // Read recently: nothing is fetched.
      const calls = fetchMock.mock.calls.length;
      expect((await refreshEvents({ ifOlderThanMs: 60_000 })).skipped).toBe(true);
      expect(fetchMock.mock.calls.length).toBe(calls);

      let list = await upcomingEvents(USER);
      expect(list.map((e) => e.title)).toEqual(["Swift Bengaluru × Okta", "LLM Summit"]);
      const swift = list[0];
      expect(swift).toMatchObject({ source: "luma", isFree: true, mark: null, alsoOn: [{ source: "meetup" }] });
      expect(list[1]).toMatchObject({ isFree: false, price: "₹499", topics: ["ai"] });

      await setEventMark(USER, swift.id, "going");
      expect((await upcomingEvents("someone-else"))[0].mark).toBeNull();
      // A later run that fails for one site keeps that site's events and the user's plan.
      meetupFails = true;
      const second = await refreshEvents();
      expect(second.sources[1]).toMatchObject({ source: "meetup", error: expect.stringContaining("403") });
      list = await upcomingEvents(USER);
      expect(list).toHaveLength(2);
      expect(list[0]).toMatchObject({ id: swift.id, mark: "going" });

      await setEventMark(USER, swift.id, null);
      expect((await upcomingEvents(USER))[0].mark).toBeNull();

      // Finished events are pruned on the next run (Meetup is still failing, so it can't refresh this one).
      await db.update(events).set({ startsAt: inDays(-5), endsAt: inDays(-4) }).where(eq(events.externalId, "101"));
      await refreshEvents();
      expect((await db.select().from(events)).map((e) => e.externalId).sort()).toEqual(["evt-1", "evt-3"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("crypto", () => {
  it("round-trips mail passwords and never stores them in plain text", () => {
    const enc = encryptSecret("app-password-123");
    expect(enc).not.toContain("app-password");
    expect(decryptSecret(enc)).toBe("app-password-123");
    expect(encryptSecret("x")).not.toBe(encryptSecret("x")); // random IV
  });
});
