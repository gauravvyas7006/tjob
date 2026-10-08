import { describe, expect, it } from "vitest";
import { cleanEmailText, extractJobIds, senderOrg } from "./body";
import { applyBuiltInRules, applyUserRules, isPotentiallyRelevant, sourceForSender } from "./rules";

const mail = (fromAddress: string, subject: string, text = "", fromName = "") => ({
  fromAddress,
  fromName,
  subject,
  text,
});

describe("built-in rules: LinkedIn", () => {
  it("detects Easy Apply confirmations with company", () => {
    const r = applyBuiltInRules(mail("jobs-noreply@linkedin.com", "Your application was sent to Acme Technologies"));
    expect(r?.category).toBe("application_confirmation");
    expect(r?.company).toBe("Acme Technologies");
  });
  it("detects viewed applications", () => {
    const r = applyBuiltInRules(mail("jobs-noreply@linkedin.com", "Your application was viewed by Globex"));
    expect(r?.category).toBe("application_viewed");
    expect(r?.company).toBe("Globex");
  });
  it("treats 'Your update from' as rejection only with rejection wording", () => {
    const rej = applyBuiltInRules(
      mail("jobs-noreply@linkedin.com", "Your update from Initech", "Unfortunately, we have decided to move forward with other candidates."),
    );
    expect(rej?.category).toBe("rejection");
    expect(rej?.company).toBe("Initech");
    const unclear = applyBuiltInRules(mail("jobs-noreply@linkedin.com", "Your update from Initech", "Here is an update."));
    expect(unclear).toBeNull();
  });
  it("marks job alerts and ignores social notifications", () => {
    expect(applyBuiltInRules(mail("jobalerts-noreply@linkedin.com", "30+ new jobs for Java Developer"))?.category).toBe("job_alert");
    const social = applyBuiltInRules(mail("notifications-noreply@linkedin.com", "Ravi commented on your post"));
    expect(social?.isJobRelated).toBe(false);
  });
});

describe("built-in rules: Naukri", () => {
  it("detects application confirmations and status updates", () => {
    expect(applyBuiltInRules(mail("info@naukri.com", "You have applied successfully to Java Developer at Acme"))?.category).toBe(
      "application_confirmation",
    );
    expect(applyBuiltInRules(mail("noreply@naukri.com", "Recruiter viewed your application"))?.category).toBe("application_viewed");
    expect(applyBuiltInRules(mail("naukrialerts@naukri.com", "Jobs matching your profile"))?.category).toBe("job_alert");
  });
});

describe("built-in rules: company / ATS emails", () => {
  it("recognizes ATS confirmations, interviews, assessments, offers, rejections", () => {
    expect(
      applyBuiltInRules(mail("no-reply@greenhouse.io", "Thank you for applying to Stripe", "", "Stripe Recruiting"))?.category,
    ).toBe("application_confirmation");
    expect(applyBuiltInRules(mail("hr@acme.com", "Interview invitation - Backend Engineer"))?.category).toBe("interview");
    expect(applyBuiltInRules(mail("talent@acme.com", "HackerRank coding test for Acme"))?.category).toBe("assessment");
    expect(applyBuiltInRules(mail("hr@acme.com", "Offer letter - Software Engineer"))?.category).toBe("offer");
    expect(
      applyBuiltInRules(
        mail("careers@acme.com", "Regarding your application", "We regret to inform you that we will not be moving forward."),
      )?.category,
    ).toBe("rejection");
  });
  it("leaves unknown emails for AI", () => {
    expect(applyBuiltInRules(mail("ravi@acme.com", "Quick question about your profile"))).toBeNull();
  });
});

describe("user rules", () => {
  it("matches by sender substring", () => {
    const rules = [{ id: "1", fromContains: "talent@acme.com", subjectContains: "", category: "recruiter_reply" as const }];
    expect(applyUserRules(mail("Talent@Acme.com", "Hi"), rules)?.category).toBe("recruiter_reply");
    expect(applyUserRules(mail("other@acme.com", "Hi"), rules)).toBeNull();
  });
});

describe("pre-filter", () => {
  const ctx = { knownCompanyKeys: new Set(["acme"]), knownThreadKeys: new Set(["<t1@x>"]), threadKey: "<none>" };
  it("keeps job boards, ATS, known companies, threads and job words", () => {
    expect(isPotentiallyRelevant({ fromAddress: "x@naukri.com", subject: "Hello" }, ctx)).toBe(true);
    expect(isPotentiallyRelevant({ fromAddress: "x@lever.co", subject: "Hello" }, ctx)).toBe(true);
    expect(isPotentiallyRelevant({ fromAddress: "ravi@careers.acme.co.in", subject: "Hello" }, ctx)).toBe(true);
    expect(isPotentiallyRelevant({ fromAddress: "a@b.com", subject: "Re: hi" }, { ...ctx, threadKey: "<t1@x>" })).toBe(true);
    expect(isPotentiallyRelevant({ fromAddress: "a@b.com", subject: "Interview schedule" }, ctx)).toBe(true);
  });
  it("drops unrelated mail", () => {
    expect(isPotentiallyRelevant({ fromAddress: "deals@shop.com", subject: "50% off shoes" }, ctx)).toBe(false);
  });
});

describe("body helpers", () => {
  it("strips quoted replies, signatures and footers", () => {
    const t = cleanEmailText("Hi,\nWe'd like to talk.\n\nOn Mon, 1 Jan 2026 at 10:00 Ravi <r@x.com> wrote:\n> old text");
    expect(t).toBe("Hi,\nWe'd like to talk.");
    expect(cleanEmailText("Thanks\n-- \nRavi | HR\nClick to unsubscribe")).toBe("Thanks");
  });
  it("finds job ids and sender orgs", () => {
    expect(extractJobIds("view: https://www.linkedin.com/comm/jobs/view/3901234567/?x=1").linkedin).toBe("3901234567");
    expect(extractJobIds("https://www.naukri.com/job-listings-java-developer-acme-pune-3-to-6-years-120924500123").naukri).toBe(
      "120924500123",
    );
    expect(senderOrg("jobs@careers.acme.co.in")).toBe("acme");
    expect(sourceForSender("jobs-noreply@linkedin.com")).toBe("linkedin");
  });
});
