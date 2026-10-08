import { describe, expect, it } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import { emptyCv, type Cv } from "@tjob/shared";
import { renderCvPdf } from "./render";
import { pdfSafe } from "./pdf-template";
import { atsScore, unsupportedSkills } from "./ats";

function sampleCv(): Cv {
  const cv = emptyCv();
  cv.contact = {
    name: "Test Candidate",
    email: "candidate@example.com",
    phone: "+91 90000 00000",
    location: "Pune, India",
    links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/test-candidate" }],
  };
  cv.headline = "Backend Engineer | Java, Spring Boot, Microservices";
  cv.summary = "Backend engineer with 4 years building Java services.";
  cv.skills = [
    { category: "Languages", items: ["Java", "SQL"] },
    { category: "Frameworks", items: ["Spring Boot", "Hibernate"] },
  ];
  cv.experience = [
    {
      id: "exp-1",
      company: "MARS",
      role: "Software Engineer",
      location: "Pune",
      startDate: "Jan 2021",
      endDate: "Present",
      bullets: ["Designed REST APIs in Spring Boot serving 2M requests/day", "Cut p95 latency by 35% with Redis caching"],
      tech: ["Java", "Spring Boot", "Redis", "MySQL"],
    },
  ];
  cv.education = [
    { institution: "Pune University", degree: "B.E.", field: "Computer Engineering", startDate: "2016", endDate: "2020", grade: "8.1 CGPA" },
  ];
  return cv;
}

describe("CV PDF", () => {
  it("renders machine-readable text in reading order (ATS check)", async () => {
    const pdf = await renderCvPdf(sampleCv(), "Backend Engineer · Acme");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const doc = await getDocumentProxy(new Uint8Array(pdf));
    const { text } = await extractText(doc, { mergePages: true });
    const order = ["Test Candidate", "SUMMARY", "SKILLS", "EXPERIENCE", "MARS", "EDUCATION"].map((s) =>
      text.indexOf(s),
    );
    order.forEach((i) => expect(i).toBeGreaterThanOrEqual(0));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain("Spring Boot");
    expect(text).toContain("Redis caching");
  }, 30000);

  it("maps characters Helvetica can't draw", () => {
    expect(pdfSafe("CTC ₹12 LPA → negotiable ✓")).toBe("CTC INR 12 LPA -> negotiable ");
  });
});

describe("ATS scoring", () => {
  it("scores coverage and flags invented skills", () => {
    const master = sampleCv();
    const jd = {
      title: "Java Developer", company: "Acme", location: "", roleCategory: "Java Backend",
      seniority: "mid" as const, minYears: 3, maxYears: 6,
      requiredSkills: ["Java", "Spring Boot", "Kafka"], niceToHaveSkills: ["Redis"], keywords: ["Microservices"],
      salaryMinLpa: -1, salaryMaxLpa: -1, salaryText: "", workMode: "hybrid" as const, responsibilities: [],
    };
    const s = atsScore(master, jd);
    expect(s.missing).toEqual(["Kafka"]);
    const tailored = structuredClone(master);
    tailored.skills.push({ category: "Messaging", items: ["Kafka"] });
    expect(unsupportedSkills(master, "", tailored)).toEqual(["Kafka"]);
    expect(unsupportedSkills(master, "Used Kafka for event streaming at MARS", tailored)).toEqual([]);
  });
});
