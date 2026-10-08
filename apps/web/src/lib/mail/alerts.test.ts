import { describe, expect, it } from "vitest";
import { extractAlertJobs } from "./alerts";

describe("job-alert leads", () => {
  it("extracts LinkedIn alert jobs with title and company", () => {
    const text = [
      "Your job alert for Java Developer in Pune",
      "30+ new jobs match your preferences.",
      "Senior Java Developer",
      "Acme Technologies · Pune, Maharashtra (Hybrid)",
      "Actively recruiting",
      "View job: https://www.linkedin.com/comm/jobs/view/4012345678/?trackingId=abc",
      "Backend Engineer (Spring Boot)",
      "Globex · Bengaluru",
      "https://www.linkedin.com/comm/jobs/view/4012399999/?trackingId=def",
      "See all jobs https://www.linkedin.com/comm/jobs/search/?x=1",
    ].join("\n");
    expect(extractAlertJobs(text, "linkedin")).toEqual([
      { source: "linkedin", externalId: "4012345678", url: "https://www.linkedin.com/jobs/view/4012345678/", title: "Senior Java Developer", company: "Acme Technologies" },
      { source: "linkedin", externalId: "4012399999", url: "https://www.linkedin.com/jobs/view/4012399999/", title: "Backend Engineer (Spring Boot)", company: "Globex" },
    ]);
  });

  it("returns nothing for alerts it can't parse", () => {
    expect(extractAlertJobs("Jobs matching your profile. Click here.", "naukri")).toEqual([]);
  });
});
