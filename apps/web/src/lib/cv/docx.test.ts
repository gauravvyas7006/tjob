import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { emptyCv, type Cv } from "@tjob/shared";
import { renderCvDocx } from "./docx";

function sample(): Cv {
  const cv = emptyCv();
  cv.contact = {
    name: "Test Candidate",
    email: "candidate@example.com",
    phone: "+91 90000 00000",
    location: "Bengaluru",
    links: [
      { label: "LinkedIn", url: "" },
      { label: "GitHub", url: "https://github.com/test-candidate/" },
    ],
  };
  cv.headline = "Backend Developer | Node.js, PostgreSQL";
  cv.summary = "Backend developer building APIs & automation.";
  cv.skills = [{ category: "Backend", items: ["Node.js", "PostgreSQL"] }];
  cv.experience = [
    {
      id: "exp-1",
      company: "Acme",
      role: "Software Developer",
      location: "Bengaluru",
      startDate: "Jan 2022",
      endDate: "Present",
      bullets: ["Built REST APIs in Node.js serving 20,000 users", "Cut p95 latency by 35% with Redis caching"],
      tech: ["Node.js", "Redis"],
    },
  ];
  cv.education = [{ institution: "VTU", degree: "B.E.", field: "Computer Science", startDate: "2017", endDate: "2021", grade: "8.1 CGPA" }];
  return cv;
}

/** The visible text of a .docx, paragraph by paragraph, as Word stores it. */
async function docxText(buf: Buffer): Promise<{ paragraphs: string[]; xml: string }> {
  const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
  // Paragraph properties (tab stops etc.) aren't text.
  const paragraphs = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((p) =>
    [...p[0].replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, "").matchAll(/<w:(t|tab)(?: [^>]*)?(?:\/>|>([^<]*)<\/w:t>)/g)]
      .map((m) => (m[1] === "tab" ? "\t" : (m[2] ?? "").replace(/&amp;/g, "&")))
      .join(""),
  );
  return { paragraphs, xml };
}

describe("CV Word file", () => {
  it("has the same sections, in order, as plain text with real bullets", async () => {
    const buf = await renderCvDocx(sample(), "Backend Developer · Acme");
    expect(buf.subarray(0, 2).toString()).toBe("PK"); // a zip, like every .docx
    const { paragraphs, xml } = await docxText(buf);
    const order = ["Test Candidate", "SUMMARY", "SKILLS", "EXPERIENCE", "EDUCATION"].map((s) => paragraphs.indexOf(s) >= 0 ? paragraphs.indexOf(s) : paragraphs.findIndex((p) => p.startsWith(s)));
    order.forEach((i) => expect(i).toBeGreaterThanOrEqual(0));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(paragraphs).toContain("Software Developer, Acme\tJan 2022 – Present");
    expect(paragraphs).toContain("Built REST APIs in Node.js serving 20,000 users");
    expect(paragraphs.join("\n")).toContain("APIs & automation");
    // Bullets are Word list items, not "•" characters typed into the text.
    expect(xml.match(/<w:numPr>/g)?.length).toBe(2);
    expect(paragraphs.some((p) => p.startsWith("•"))).toBe(false);
    // Contact line: no empty separators for links without an address.
    const contact = paragraphs.find((p) => p.includes("candidate@example.com"))!;
    expect(contact).toBe("candidate@example.com  |  +91 90000 00000  |  Bengaluru");
    // Profile links on the next line, as named hyperlinks; empty links skipped.
    expect(paragraphs[paragraphs.indexOf(contact) + 1]).toBe("GitHub");
    const rels = await (await JSZip.loadAsync(buf)).file("word/_rels/document.xml.rels")!.async("string");
    expect(rels).toContain('Target="https://github.com/test-candidate/"');
  });
});
