import { describe, expect, it } from "vitest";
import { cvToPlainText, emptyCv, type Cv, type JdExtraction } from "@tjob/shared";
import { unsupportedSkills } from "./ats";
import { atsCheck, LEARNING_CATEGORY } from "./ats-check";
import {
  atsAutoFix,
  cleanJobTitle,
  fitToPages,
  headlineForJob,
  STATED_CATEGORY,
  withLearningSkills,
  withStatedKeywords,
} from "./ats-fix";
import { pageCount, readPdf } from "./ats-test";
import { renderCvPdf } from "./render";

function cv(): Cv {
  const c = emptyCv();
  c.contact = {
    name: "Test Candidate",
    email: "candidate@example.com",
    phone: "+91 90000 00000",
    location: "Bengaluru",
    links: [
      { label: "LinkedIn", url: "" },
      { label: "GitHub", url: "https://github.com/test-candidate" },
    ],
  };
  c.headline = "Software Developer | Node.js, REST APIs, PostgreSQL";
  c.summary = "Full stack developer.";
  c.skills = [{ category: "Backend", items: ["Node.js", "PHP", "PostgreSQL", "Git"] }];
  c.experience = [
    {
      id: "exp-1",
      company: "Acme",
      role: "Full Stack Software Developer",
      location: "Bengaluru",
      startDate: "Dec 2024",
      endDate: "Present",
      bullets: ["Built REST APIs in Node.js for 1,000+ daily users"],
      tech: [],
    },
  ];
  c.education = [{ institution: "University", degree: "BCA", field: "", startDate: "2016", endDate: "2019", grade: "" }];
  return c;
}

const jd: JdExtraction = {
  title: "Offensive Security Operations Developer - Bengaluru (Hybrid)",
  company: "LSEG",
  location: "Bengaluru",
  roleCategory: "",
  seniority: "mid",
  minYears: -1,
  maxYears: -1,
  requiredSkills: ["Python 3.7+", "VueJS 2/3", "Flask API", "Node.js", "Git"],
  niceToHaveSkills: ["AWS"],
  keywords: [],
  salaryMinLpa: -1,
  salaryMaxLpa: -1,
  salaryText: "",
  workMode: "hybrid",
  responsibilities: [],
};

/** A CV long enough to need three pages. */
function longCv(): Cv {
  const c = cv();
  const bullet = (n: number) =>
    `Delivered feature ${n} end to end across the API, database and UI, improving reliability for thousands of users and cutting support tickets.`;
  c.experience = [0, 1, 2, 3].map((r) => ({
    id: `exp-${r + 1}`,
    company: `Company ${r + 1}`,
    role: "Software Developer",
    location: "Bengaluru",
    startDate: `Jan ${2023 - r}`,
    endDate: r === 0 ? "Present" : `Dec ${2023 - r}`,
    bullets: Array.from({ length: 9 }, (_, i) => bullet(r * 10 + i)),
    tech: ["Node.js"],
  }));
  c.projects = [0, 1, 2, 3, 4].map((p) => ({
    id: `p-${p}`,
    name: `Project ${p}`,
    description: "A web app",
    bullets: Array.from({ length: 4 }, (_, i) => bullet(100 + p * 10 + i)),
    tech: ["React"],
  }));
  return c;
}

describe("automatic ATS fixes", () => {
  it("leads the headline with the job's title, without location or work mode", () => {
    expect(cleanJobTitle(jd.title)).toBe("Offensive Security Operations Developer");
    expect(cleanJobTitle("Java Developer (R0122852)")).toBe("Java Developer");
    expect(headlineForJob(cv(), jd.title)).toBe("Offensive Security Operations Developer | Node.js, REST APIs, PostgreSQL");
    // Already matching: left alone. Past job titles are never touched.
    expect(headlineForJob(cv(), "Full Stack Developer")).toBeNull();
  });

  it("lists missing skills as Currently learning, which isn't flagged as invented", () => {
    const { cv: out, added } = withLearningSkills(cv(), jd);
    expect(added).toEqual(["Python", "Vue.js", "Flask", "AWS"]);
    expect(out.skills.at(-1)).toEqual({ category: LEARNING_CATEGORY, items: added });
    expect(unsupportedSkills(cv(), "", out)).toEqual([]);
    // Running it again replaces the list instead of adding a second one.
    expect(withLearningSkills(out, jd).cv.skills.filter((g) => g.category === LEARNING_CATEGORY)).toHaveLength(1);

    const report = atsCheck({ cv: out, jd, description: "", pdfText: JSON.stringify(out), pages: 1 });
    expect(report.items.find((i) => i.id === "required")?.detail).toContain(`5 of 5 found (3 under ${LEARNING_CATEGORY}`);
  });

  it("trims the least relevant content until the PDF fits on two pages", async () => {
    const long = longCv();
    expect(await pageCount(long, "t")).toBeGreaterThan(2);
    const fit = await fitToPages(long, "t");
    expect(fit.pages).toBeLessThanOrEqual(2);
    expect(fit.removed).toBeGreaterThan(0);
    // Most relevant content stays: the first bullets and the latest role's first four.
    expect(fit.cv.experience[0].bullets.slice(0, 4)).toEqual(long.experience[0].bullets.slice(0, 4));
    expect(fit.cv.projects.length).toBeLessThanOrEqual(2);
    expect(fit.cv.experience.every((e) => e.bullets.length >= 2)).toBe(true);
  }, 60000);

  it("applies every fix and explains them", async () => {
    const { cv: out, notes, learning } = await atsAutoFix(longCv(), jd, "t", { learning: true });
    expect(out.headline.startsWith("Offensive Security Operations Developer")).toBe(true);
    expect(learning).toContain("Python");
    expect(notes.map((n) => n.section)).toEqual(["Headline", "Skills", "Length"]);
    const off = await atsAutoFix(cv(), jd, "t", { learning: false });
    expect(off.cv.skills.some((g) => g.category === LEARNING_CATEGORY)).toBe(false);
  }, 60000);
});

describe("job keywords the candidate already states", () => {
  const job: JdExtraction = {
    ...jd,
    requiredSkills: ["Unit Testing", "Docker/Containerization", "Kafka"],
    niceToHaveSkills: [],
    keywords: ["Agile/Scrum", "Cybersecurity"],
  };

  it("adds them under the job's words, narrowly, and never claims what the facts don't say", () => {
    const facts = "Wrote unit tests with Jest. Deployed services with containers. Worked in agile sprints. Did cyber security testing.";
    const { cv: out, added } = withStatedKeywords(cv(), job, facts);
    expect(added).toEqual(["Unit Testing", "Containerization", "Agile", "Cybersecurity"]);
    expect(out.skills.find((g) => g.category === STATED_CATEGORY)?.items).toEqual(added);
    // Not "Docker" (the facts say containers), not "Scrum", not "Kafka".
    expect(added).not.toContain("Docker");
    expect(added.join(" ")).not.toMatch(/Scrum|Kafka/);
    expect(unsupportedSkills(cv(), facts, out)).toEqual([]);
  });

  it("adds nothing the CV already has, and nothing without facts", () => {
    const has = cv();
    has.skills.push({ category: "Testing", items: ["Unit Testing"] });
    expect(withStatedKeywords(has, job, "wrote unit tests").added).toEqual([]);
    expect(withStatedKeywords(cv(), job, "").added).toEqual([]);
  });

  it("goes before the Currently learning list, so learning only lists what's really missing", async () => {
    const { cv: out, learning } = await atsAutoFix(cv(), { ...job, requiredSkills: ["Unit Testing", "Kafka"] }, "t", {
      learning: true,
      facts: "wrote unit tests",
    });
    expect(out.skills.map((g) => g.category).slice(-2)).toEqual([STATED_CATEGORY, LEARNING_CATEGORY]);
    expect(learning).toEqual(["Kafka"]);
  });
});

describe("invented-skill check", () => {
  it("accepts the user's own facts despite typos, but not look-alike technologies", () => {
    const master = cv();
    const facts = "secured MARS by preventing SQL inje3ction, rate liumiting and rotating keys; web scrabing; used powerbash and containers";
    const tailored = structuredClone(master);
    tailored.skills.push({
      category: "Security",
      items: ["SQL injection prevention", "Rate limiting", "Key rotation", "Web scraping", "Containerisation", "Bash"],
    });
    expect(unsupportedSkills(master, facts, tailored)).toEqual([]);
    const invented = structuredClone(master);
    invented.skills.push({ category: "Other", items: ["React", "Java", "Kubernetes", "PowerShell"] });
    expect(unsupportedSkills(master, "reach out to data teams", invented).sort()).toEqual(["Java", "Kubernetes", "PowerShell", "React"]);
  });
});

describe("CV PDF layout", () => {
  it("never hyphenates words across lines, so keywords stay whole", async () => {
    const c = cv();
    // Slide the long words across every position on the line, so some land at the line end.
    c.experience[0].bullets = Array.from(
      { length: 60 },
      (_, i) => `Built ${"x".repeat(i + 1)} reporting pipelines on PostgreSQL and Elasticsearch for analytics teams worldwide`,
    );
    const { text } = await readPdf(await renderCvPdf(c, "t"));
    expect(text).not.toMatch(/[A-Za-z]-\n[a-z]/);
    const source = cvToPlainText(c);
    for (const word of [/PostgreSQL/g, /Elasticsearch/g]) expect(text.match(word)?.length).toBe(source.match(word)?.length);
  }, 30000);

  it("skips links without an address instead of printing empty separators", async () => {
    const { text } = await readPdf(await renderCvPdf(cv(), "t"));
    expect(text).toContain("github.com/test-candidate");
    expect(text).not.toMatch(/\|\s*\|/);
    expect(text.trim()).not.toMatch(/\|\s*$/m);
  }, 30000);
});
