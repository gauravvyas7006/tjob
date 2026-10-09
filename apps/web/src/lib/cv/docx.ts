import "server-only";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  LevelFormat,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
} from "docx";
import type { Cv } from "@tjob/shared";
import { linkText } from "./pdf-template";

/*
 * The same CV as the PDF, as a Word file: some older ATS and many recruiters prefer .docx.
 * One column, standard headings, real Word bullets, no tables, text boxes or images.
 */

// A4 (11906 twips wide) minus 0.55" margins.
const MARGIN = 800;
const RIGHT_TAB = 11906 - MARGIN * 2;
const FONT = "Calibri";

const run = (text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text, font: FONT, bold: opts.bold, size: opts.size, color: opts.color });

function heading(title: string): Paragraph {
  return new Paragraph({
    children: [run(title.toUpperCase(), { bold: true, size: 22 })],
    spacing: { before: 200, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 1 } },
    keepNext: true,
  });
}

function bullets(items: string[]): Paragraph[] {
  return items
    .filter((b) => b.trim())
    .map((b) => new Paragraph({ children: [run(b)], numbering: { reference: "bullets", level: 0 }, spacing: { after: 30 } }));
}

/** "Role, Company" on the left and the dates on the right, kept with what follows. */
function entryHead(left: string, right: string): Paragraph {
  return new Paragraph({
    children: [
      run(left, { bold: true }),
      ...(right ? [new TextRun({ children: [new Tab(), right], font: FONT, color: "333333" })] : []),
    ],
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT_TAB }],
    spacing: { before: 120, after: 20 },
    keepNext: true,
  });
}

const sub = (text: string) => new Paragraph({ children: [run(text, { color: "333333", size: 20 })], keepNext: true });

function techLine(tech: string[]): Paragraph[] {
  return tech.length ? [new Paragraph({ children: [run("Tech: ", { bold: true, size: 20 }), run(tech.join(", "), { size: 20 })] })] : [];
}

const dateRange = (start: string, end: string) => [start, end].filter(Boolean).join(" – ");

export async function renderCvDocx(cv: Cv, title: string): Promise<Buffer> {
  const c = cv.contact;
  const contact = [c.email, c.phone, c.location].map((s) => s.trim()).filter(Boolean);
  const links = c.links.filter((l) => l.url.trim());
  // Centered header, like the PDF.
  const body: Paragraph[] = [
    new Paragraph({ children: [run(c.name, { bold: true, size: 36 })], alignment: AlignmentType.CENTER, spacing: { after: 20 } }),
  ];
  if (cv.headline) {
    body.push(new Paragraph({ children: [run(cv.headline, { size: 23 })], alignment: AlignmentType.CENTER, spacing: { after: 20 } }));
  }
  if (contact.length) {
    body.push(
      new Paragraph({ alignment: AlignmentType.CENTER, children: [run(contact.join("  |  "), { size: 20, color: "333333" })] }),
    );
  }
  // Profile links on their own line, like the PDF.
  if (links.length) {
    body.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: links.flatMap((l, i) => [
          ...(i > 0 ? [run("  |  ", { size: 20, color: "333333" })] : []),
          new ExternalHyperlink({
            link: l.url,
            children: [new TextRun({ text: linkText(l), font: FONT, size: 20, color: "1D4ED8", underline: {} })],
          }),
        ]),
      }),
    );
  }

  if (cv.summary) body.push(heading("Summary"), new Paragraph({ children: [run(cv.summary)] }));

  const groups = cv.skills.filter((g) => g.items.length);
  if (groups.length) {
    body.push(heading("Skills"));
    for (const g of groups) {
      body.push(new Paragraph({ children: [run(`${g.category}: `, { bold: true }), run(g.items.join(", "))], spacing: { after: 30 } }));
    }
  }

  if (cv.experience.length) {
    body.push(heading("Experience"));
    for (const e of cv.experience) {
      body.push(entryHead([e.role, e.company].filter(Boolean).join(", "), dateRange(e.startDate, e.endDate)));
      if (e.location) body.push(sub(e.location));
      body.push(...bullets(e.bullets), ...techLine(e.tech));
    }
  }

  if (cv.projects.length) {
    body.push(heading("Projects"));
    for (const p of cv.projects) {
      body.push(entryHead(p.name, ""));
      if (p.description) body.push(sub(p.description));
      body.push(...bullets(p.bullets), ...techLine(p.tech));
    }
  }

  if (cv.education.length) {
    body.push(heading("Education"));
    for (const e of cv.education) {
      body.push(entryHead([e.degree, e.field].filter(Boolean).join(", "), dateRange(e.startDate, e.endDate)));
      const line = [e.institution, e.grade].filter(Boolean).join("  |  ");
      if (line) body.push(sub(line));
    }
  }

  if (cv.certifications.length) body.push(heading("Certifications"), ...bullets(cv.certifications));
  if (cv.achievements.length) body.push(heading("Achievements"), ...bullets(cv.achievements));

  const doc = new Document({
    creator: c.name || "tjob",
    title: `${c.name} – ${title}`,
    styles: { default: { document: { run: { font: FONT, size: 21 }, paragraph: { spacing: { line: 264 } } } } },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 360, hanging: 220 } } },
            },
          ],
        },
      ],
    },
    sections: [{ properties: { page: { margin: { top: 680, bottom: 680, left: MARGIN, right: MARGIN } } }, children: body }],
  });
  return Packer.toBuffer(doc);
}
