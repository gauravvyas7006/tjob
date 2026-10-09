import { Document, Font, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Cv } from "@tjob/shared";

// No hyphenation: "Post-/greSQL" across a line break looks wrong and splits the keyword an ATS
// searches for. Long words move to the next line whole.
Font.registerHyphenationCallback((word) => [word]);

/*
 * ATS-friendly CV: one column, standard section headings, real selectable text in a standard
 * PDF font (Helvetica), no tables, images, icons or text boxes.
 */

// Helvetica only covers WinAnsi; map common characters outside it so nothing renders as boxes.
export function pdfSafe(s: string): string {
  return s
    .replace(/₹/g, "INR ")
    .replace(/[‐‑‒]/g, "-")
    .replace(/[→⇒]/g, "->")
    .replace(/[✓✔✅]/g, "")
    .replace(/[   ]/g, " ")
    .replace(/[^\x09\x0a\x0d\x20-\x7e -ÿ–—‘’“”•…€]/g, "");
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 44,
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.42,
    color: "#1a1a1a",
  },
  // Centered header; alignment doesn't change the reading order an ATS sees. Explicit line
  // heights so the large name never touches the headline.
  name: { fontSize: 20, lineHeight: 1.2, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, textAlign: "center", marginBottom: 5 },
  headline: { fontSize: 11, lineHeight: 1.3, color: "#333333", textAlign: "center", marginBottom: 6 },
  contact: { fontSize: 9.5, lineHeight: 1.5, color: "#444444", textAlign: "center" },
  link: { color: "#1d4ed8", textDecoration: "underline" },
  section: { marginTop: 14 },
  heading: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    borderBottomWidth: 0.75,
    borderBottomColor: "#b0b0b0",
    paddingBottom: 3,
    marginBottom: 7,
  },
  entry: { marginBottom: 10 },
  entryHead: { flexDirection: "row", justifyContent: "space-between" },
  entryTitle: { fontFamily: "Helvetica-Bold", flexShrink: 1, paddingRight: 8 },
  entryMeta: { color: "#444444", fontSize: 9.5 },
  sub: { color: "#555555", fontSize: 9.5, marginBottom: 2 },
  bulletRow: { flexDirection: "row", marginTop: 2.5 },
  bulletDot: { width: 11 },
  bulletText: { flex: 1 },
  skillRow: { marginBottom: 3.5 },
  bold: { fontFamily: "Helvetica-Bold" },
});

function Bullets({ items }: { items: string[] }) {
  return (
    <>
      {items.filter(Boolean).map((b, i) => (
        <View key={i} style={styles.bulletRow} wrap={false}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{pdfSafe(b)}</Text>
        </View>
      ))}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {/* Never leave a heading alone at the bottom of a page. */}
      <Text style={styles.heading} minPresenceAhead={60}>
        {title}
      </Text>
      {children}
    </View>
  );
}

// The first bullet goes in the same unbreakable block as its heading; the rest may flow on.
const firstOf = (items: string[]) => items.filter(Boolean).slice(0, 1);
const restOf = (items: string[]) => items.filter(Boolean).slice(1);

function dateRange(start: string, end: string) {
  return [start, end].filter(Boolean).join(" – ");
}

/**
 * A profile link as printed: its name ("LinkedIn", "GitHub"), with the URL behind it. Links
 * without a name show the address without scheme, www or trailing slash.
 */
export function linkText(link: { label: string; url: string }): string {
  const url = link.url.trim();
  if (/linkedin\.com\//i.test(url)) return "LinkedIn";
  if (/github\.com\//i.test(url)) return "GitHub";
  return link.label.trim() || url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
}

export function CvDocument({ cv, title }: { cv: Cv; title: string }) {
  const c = cv.contact;
  const contactParts = [c.email, c.phone, c.location].map((s) => s.trim()).filter(Boolean).map(pdfSafe);
  // Links without an address (e.g. "LinkedIn" with no URL yet) would print as empty separators.
  const links = c.links.filter((l) => l.url.trim());

  return (
    <Document title={pdfSafe(`${c.name} – ${title}`)} author={pdfSafe(c.name)} creator="tjob" producer="tjob">
      <Page size="A4" style={styles.page}>
        <Text style={styles.name}>{pdfSafe(c.name)}</Text>
        {cv.headline ? <Text style={styles.headline}>{pdfSafe(cv.headline)}</Text> : null}
        {contactParts.length ? <Text style={styles.contact}>{contactParts.join("  |  ")}</Text> : null}
        {/* Profile links on their own line, so long URLs don't wrap the contact line. */}
        {links.length ? (
          <Text style={styles.contact}>
            {links.map((l, i) => (
              <Text key={i}>
                {i > 0 ? "  |  " : ""}
                <Link src={l.url} style={styles.link}>
                  {pdfSafe(linkText(l))}
                </Link>
              </Text>
            ))}
          </Text>
        ) : null}

        {cv.summary ? (
          <Section title="Summary">
            <Text>{pdfSafe(cv.summary)}</Text>
          </Section>
        ) : null}

        {cv.skills.length ? (
          <Section title="Skills">
            {cv.skills
              .filter((g) => g.items.length)
              .map((g, i) => (
                <Text key={i} style={styles.skillRow}>
                  <Text style={styles.bold}>{pdfSafe(g.category)}: </Text>
                  {pdfSafe(g.items.join(", "))}
                </Text>
              ))}
          </Section>
        ) : null}

        {cv.experience.length ? (
          <Section title="Experience">
            {cv.experience.map((e) => (
              <View key={e.id} style={styles.entry}>
                {/* One unbreakable block: a job's title never sits alone at the bottom of a page. */}
                <View wrap={false}>
                  <View style={styles.entryHead}>
                    <Text style={styles.entryTitle}>
                      {pdfSafe([e.role, e.company].filter(Boolean).join(", "))}
                    </Text>
                    <Text style={styles.entryMeta}>{pdfSafe(dateRange(e.startDate, e.endDate))}</Text>
                  </View>
                  {e.location ? <Text style={styles.sub}>{pdfSafe(e.location)}</Text> : null}
                  <Bullets items={firstOf(e.bullets)} />
                </View>
                <Bullets items={restOf(e.bullets)} />
                {e.tech.length ? (
                  <Text style={styles.sub}>
                    <Text style={styles.bold}>Tech: </Text>
                    {pdfSafe(e.tech.join(", "))}
                  </Text>
                ) : null}
              </View>
            ))}
          </Section>
        ) : null}

        {cv.projects.length ? (
          <Section title="Projects">
            {cv.projects.map((p) => (
              <View key={p.id} style={styles.entry}>
                <View wrap={false}>
                  <Text style={styles.entryTitle}>{pdfSafe(p.name)}</Text>
                  {p.description ? <Text style={styles.sub}>{pdfSafe(p.description)}</Text> : null}
                  <Bullets items={firstOf(p.bullets)} />
                </View>
                <Bullets items={restOf(p.bullets)} />
                {p.tech.length ? (
                  <Text style={styles.sub}>
                    <Text style={styles.bold}>Tech: </Text>
                    {pdfSafe(p.tech.join(", "))}
                  </Text>
                ) : null}
              </View>
            ))}
          </Section>
        ) : null}

        {cv.education.length ? (
          <Section title="Education">
            {cv.education.map((e, i) => (
              <View key={i} style={styles.entry} wrap={false}>
                <View style={styles.entryHead}>
                  <Text style={styles.entryTitle}>
                    {pdfSafe([e.degree, e.field].filter(Boolean).join(", "))}
                  </Text>
                  <Text style={styles.entryMeta}>{pdfSafe(dateRange(e.startDate, e.endDate))}</Text>
                </View>
                <Text style={styles.sub}>
                  {pdfSafe([e.institution, e.grade].filter(Boolean).join("  |  "))}
                </Text>
              </View>
            ))}
          </Section>
        ) : null}

        {cv.certifications.length ? (
          <Section title="Certifications">
            <Bullets items={cv.certifications} />
          </Section>
        ) : null}

        {cv.achievements.length ? (
          <Section title="Achievements">
            <Bullets items={cv.achievements} />
          </Section>
        ) : null}
      </Page>
    </Document>
  );
}
