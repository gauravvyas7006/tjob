import { describe, expect, it } from "vitest";
import {
  applyTailorPatch,
  canAutoTransition,
  canonicalSkill,
  emptyCv,
  extractSkills,
  keywordCoverage,
  normalizeCompany,
  normalizeQuestion,
  quickMatch,
  requirementVariants,
  textHasRequirement,
  textHasSkill,
} from "./index";

describe("canAutoTransition", () => {
  it("moves forward only", () => {
    expect(canAutoTransition("applied", "viewed")).toBe(true);
    expect(canAutoTransition("interview", "viewed")).toBe(false);
    expect(canAutoTransition("viewed", "applied")).toBe(false);
  });
  it("always lands rejection and offer unless terminal", () => {
    expect(canAutoTransition("interview", "rejected")).toBe(true);
    expect(canAutoTransition("applied", "offer")).toBe(true);
    expect(canAutoTransition("rejected", "interview")).toBe(false);
    expect(canAutoTransition("offer", "rejected")).toBe(false);
  });
  it("revives ghosted applications", () => {
    expect(canAutoTransition("ghosted", "interview")).toBe(true);
    expect(canAutoTransition("ghosted", "saved")).toBe(false);
  });
  it("never auto-sets withdrawn or ghosted", () => {
    expect(canAutoTransition("applied", "withdrawn")).toBe(false);
    expect(canAutoTransition("applied", "ghosted")).toBe(false);
  });
});

describe("skills", () => {
  it("canonicalizes spellings", () => {
    expect(canonicalSkill("NodeJS")).toBe("Node.js");
    expect(canonicalSkill("k8s")).toBe("Kubernetes");
    expect(canonicalSkill("springboot")).toBe("Spring Boot");
    expect(canonicalSkill("Some Niche Tool")).toBe("Some Niche Tool");
  });

  it("extracts skills with symbol-aware boundaries", () => {
    const s = extractSkills(
      "We need Core Java, Spring-Boot, C++ and .NET devs with CI/CD, Node.js and React.js. Go-getters welcome.",
    );
    expect(s).toEqual(
      expect.arrayContaining(["Java", "Spring Boot", "Spring", "C++", ".NET", "CI/CD", "Node.js", "React"]),
    );
    expect(s).not.toContain("Go");
    expect(s).not.toContain("JavaScript");
  });

  it("does not match node inside node.js twice or inside nodes", () => {
    expect(textHasSkill("graph nodes", "Node.js")).toBe(false);
    expect(textHasSkill("built with node.js", "Node.js")).toBe(true);
  });

  it("scores keyword coverage with required skills weighted double", () => {
    const r = keywordCoverage("Java, Spring Boot, MySQL", ["Java", "Kafka"], ["MySQL"]);
    expect(r.matched).toEqual(["Java", "MySQL"]);
    expect(r.missing).toEqual(["Kafka"]);
    expect(r.score).toBe(60); // (2 + 1) / (4 + 1)
  });

  it("matches requirements the way they're written in job descriptions", () => {
    expect(requirementVariants("Python 3.7+")).toContain("Python");
    expect(requirementVariants("VueJS 2/3")).toContain("VueJS");
    expect(requirementVariants("Flask API")).toContain("Flask");
    expect(requirementVariants("Containerisation (Docker)")).toContain("Docker");
    expect(requirementVariants("CI/CD")).toEqual(["CI/CD"]);
    expect(requirementVariants("Unit/Integration/Behavioral testing")).not.toContain("Unit");

    const cv = "Skills: Python, Vue.js, Bash, Git, Docker, MySQL. Wrote unit tests with Jest. Business unit reports.";
    const has = (r: string) => textHasRequirement(cv, r);
    expect(["Python 3.7+", "VueJS 2/3", "Unit Testing", "PowerShell/Bash", "Gitlab / Git", "Containerisation (Docker)", "MySQL/PostgreSQL"].filter((r) => !has(r))).toEqual([]);
    expect(["Flask API", "CI/CD", "Kafka", "Unit/Integration/Behavioral testing"].filter(has)).toEqual([]);
    expect(keywordCoverage(cv, ["Python 3.7+", "Flask API"]).missing).toEqual(["Flask API"]);
    expect(textHasRequirement("Containerisation with Docker Compose", "Containerization")).toBe(true);
    expect(textHasRequirement("Node.js, Express.js, REST APIs", "Express")).toBe(true);
    expect(textHasRequirement("Node.js, Express.js, REST APIs", "REST API design")).toBe(true);
    // The same thing in the CV's own word order.
    expect(textHasRequirement("Developed REST APIs for the mobile app", "API Development")).toBe(true);
    expect(textHasRequirement("Integrated the Razorpay payment gateway", "Payment gateway integration")).toBe(true);
    expect(textHasRequirement("Led the API team. Later, development of reports in a separate unit", "API Development")).toBe(false);
    expect(textHasRequirement("Built dashboards", "Payment gateway integration")).toBe(false);
    // Common spellings in job descriptions vs CVs.
    expect(textHasRequirement("Did cyber security testing on AWS", "Cybersecurity")).toBe(true);
    expect(textHasRequirement("Deployed with containers", "Docker/Containerization")).toBe(true);
    expect(textHasRequirement("Deployed with containers", "Docker")).toBe(false);
    expect(textHasRequirement("Cloud native services on AWS", "Cloud-native")).toBe(true);
    expect(textHasRequirement("Wrote PowerShell scripts", "PowerShell and/or Bash Scripting")).toBe(true);
    expect(textHasRequirement("Optimised queries", "query optimization")).toBe(false);
  });

  it("quick-matches a JD against user skills", () => {
    const r = quickMatch("Looking for Java + Kafka + AWS engineer", ["java", "aws"]);
    expect(r.score).toBe(67);
    expect(r.missing).toEqual(["Kafka"]);
  });
});

describe("text", () => {
  it("normalizes company names", () => {
    expect(normalizeCompany("Infosys Limited")).toBe("infosys");
    expect(normalizeCompany("Tata Consultancy Services Pvt. Ltd.")).toBe("tata consultancy services");
    expect(normalizeCompany("Acme (India) Private Limited")).toBe("acme");
  });
  it("normalizes questions", () => {
    expect(normalizeQuestion("What is your notice period? *")).toBe(
      normalizeQuestion("Notice period (required)"),
    );
    expect(normalizeQuestion("How many years of experience do you have with Java?")).toBe(
      normalizeQuestion("Years of experience with Java?"),
    );
  });
});

describe("applyTailorPatch", () => {
  it("only replaces tailored parts and keeps facts", () => {
    const master = emptyCv();
    master.headline = "Java Developer";
    master.experience = [
      {
        id: "exp-1",
        company: "MARS",
        role: "Software Engineer",
        location: "Pune",
        startDate: "2021",
        endDate: "Present",
        bullets: ["Built APIs"],
        tech: ["Java"],
      },
    ];
    master.projects = [
      { id: "p1", name: "A", description: "", bullets: ["a"], tech: [] },
      { id: "p2", name: "B", description: "", bullets: ["b"], tech: [] },
    ];
    const out = applyTailorPatch(master, {
      headline: "Backend Engineer (Java)",
      summary: "",
      skills: [],
      experience: [{ id: "exp-1", bullets: ["Designed REST APIs in Spring Boot"] }],
      projectOrder: ["p2", "p1"],
      projects: [{ id: "p2", bullets: ["b2"] }],
      changes: [],
      gaps: [],
    });
    expect(out.headline).toBe("Backend Engineer (Java)");
    expect(out.experience[0].company).toBe("MARS");
    expect(out.experience[0].bullets).toEqual(["Designed REST APIs in Spring Boot"]);
    expect(out.projects.map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(out.projects[0].bullets).toEqual(["b2"]);
  });
});
