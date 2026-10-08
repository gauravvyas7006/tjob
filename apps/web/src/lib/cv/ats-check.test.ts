import { describe, expect, it } from "vitest";
import { emptyCv, type Cv, type JdExtraction } from "@tjob/shared";
import { atsCheck, parseCvDate, yearsOfExperience } from "./ats-check";
import { atsTest, readPdf } from "./ats-test";
import { renderCvPdf } from "./render";

const NOW = new Date("2026-10-08T00:00:00Z");

function cv(): Cv {
  const c = emptyCv();
  c.contact = {
    name: "Test Candidate",
    email: "candidate@example.com",
    phone: "+91 90000 00000",
    location: "Bengaluru, India",
    links: [],
  };
  c.headline = "Backend Developer | Node.js, Java, Spring Boot";
  c.summary = "Backend developer building APIs.";
  c.skills = [{ category: "Backend", items: ["Node.js", "Java", "Spring Boot", "MySQL", "Docker"] }];
  c.experience = [
    {
      id: "exp-1",
      company: "MARS",
      role: "Software Developer",
      location: "Bengaluru",
      startDate: "Jan 2022",
      endDate: "Present",
      bullets: ["Built REST APIs in Node.js serving 20,000 users", "Wrote unit tests with Jest"],
      tech: ["Node.js"],
    },
    {
      id: "exp-2",
      company: "Acme",
      role: "Intern",
      location: "Pune",
      startDate: "06/2021",
      endDate: "Dec 2021",
      bullets: ["Fixed bugs in a Java service"],
      tech: ["Java"],
    },
  ];
  c.education = [{ institution: "VTU", degree: "B.E.", field: "Computer Science", startDate: "2017", endDate: "2021", grade: "" }];
  return c;
}

function jd(patch: Partial<JdExtraction> = {}): JdExtraction {
  return {
    title: "Backend Developer",
    company: "Acme",
    location: "Bengaluru",
    roleCategory: "Node.js Backend",
    seniority: "mid",
    minYears: 3,
    maxYears: 6,
    requiredSkills: ["Node.js", "MySQL", "Docker", "Kafka"],
    niceToHaveSkills: ["AWS"],
    keywords: ["Microservices", "Unit testing"],
    salaryMinLpa: -1,
    salaryMaxLpa: -1,
    salaryText: "",
    workMode: "hybrid",
    responsibilities: [],
    ...patch,
  };
}

describe("CV dates", () => {
  it("reads the common formats and Present", () => {
    expect(parseCvDate("Jan 2022")).toBe(2022 * 12);
    expect(parseCvDate("06/2021")).toBe(2021 * 12 + 5);
    expect(parseCvDate("2019")).toBe(2019 * 12);
    expect(parseCvDate("September 2020")).toBe(2020 * 12 + 8);
    expect(parseCvDate("Present", NOW)).toBe(2026 * 12 + 9);
    expect(parseCvDate("soon")).toBeNull();
  });

  it("counts years without double-counting overlapping roles", () => {
    expect(yearsOfExperience(cv(), NOW)).toBe(5.4); // Jun 2021 – Oct 2026, both months counted
    const overlap = cv();
    overlap.experience[1] = { ...overlap.experience[1], startDate: "Jan 2023", endDate: "Jan 2024" };
    expect(yearsOfExperience(overlap, NOW)).toBe(4.8); // Jan 2022 – Oct 2026 only
    expect(yearsOfExperience(emptyCv(), NOW)).toBeNull();
  });
});

describe("ATS check", () => {
  const text = (c: Cv) =>
    [c.contact.name, c.contact.email, c.contact.phone, "SUMMARY", c.summary, "SKILLS", ...c.skills[0].items, "EXPERIENCE",
      ...c.experience.flatMap((e) => [e.role, e.company, ...e.bullets]), "EDUCATION", "B.E. Computer Science"].join(" ");

  it("scores a matching CV highly and lists what's missing", () => {
    const report = atsCheck({ cv: cv(), jd: jd(), description: "B.E. or equivalent degree", pdfText: text(cv()), pages: 1, now: NOW });
    const byId = Object.fromEntries(report.items.map((i) => [i.id, i]));
    expect(byId.required).toMatchObject({ status: "pass", points: 0.75 });
    expect(byId.required.detail).toBe("3 of 4 found. Missing: Kafka.");
    expect(byId.title.status).toBe("pass");
    expect(byId.years).toMatchObject({ status: "pass", detail: "The job asks for 3–6 years; your CV shows about 5.4." });
    expect(byId.education.status).toBe("pass");
    expect(byId.location.status).toBe("pass");
    expect(byId.contact.status).toBe("pass");
    expect(report.band).toBe("strong");
    expect(report.score).toBeGreaterThanOrEqual(80);
  });

  it("holds the band down when a knockout check fails", () => {
    const report = atsCheck({ cv: cv(), jd: jd({ minYears: 8, maxYears: 12 }), description: "", pdfText: text(cv()), pages: 1, now: NOW });
    expect(report.items.find((i) => i.id === "years")?.status).toBe("fail");
    expect(report.band).toBe("borderline");
    expect(report.capped).toContain("years of experience");
  });

  it("holds a readable CV at Low when most required skills are missing", () => {
    const report = atsCheck({
      cv: cv(),
      jd: jd({ requiredSkills: ["Node.js", "Python", "Flask", "Vue.js", "Terraform", "AWS", "Azure"] }),
      description: "",
      pdfText: text(cv()),
      pages: 1,
      now: NOW,
    });
    expect(report.score).toBeGreaterThanOrEqual(50);
    expect(report.band).toBe("low");
    expect(report.capped).toContain("fewer than a third");
  });

  it("fails an unreadable file and a CV that misses the job", () => {
    const report = atsCheck({
      cv: cv(),
      jd: jd({ title: "Python Security Engineer", requiredSkills: ["Python", "Flask", "Vue.js", "Terraform"], location: "Hyderabad" }),
      description: "",
      pdfText: "",
      pages: 4,
      now: NOW,
    });
    const status = Object.fromEntries(report.items.map((i) => [i.id, i.status]));
    expect(status).toMatchObject({ text: "fail", contact: "fail", sections: "fail", length: "fail", required: "fail", title: "fail", location: "warn" });
    expect(report.band).toBe("low");
  });

  it("tests the real PDF: text, contact details, headings and keywords survive", async () => {
    const pdf = await renderCvPdf(cv(), "Backend Developer · Acme");
    const { text: read, pages } = await readPdf(pdf);
    expect(pages).toBe(1);
    expect(read).toContain("candidate@example.com");
    const report = await atsTest(cv(), "Backend Developer · Acme", jd(), "Bachelor's degree required");
    expect(report.items.filter((i) => i.group === "read").every((i) => i.status === "pass")).toBe(true);
    expect(report.band).toBe("strong");
  }, 30000);
});
