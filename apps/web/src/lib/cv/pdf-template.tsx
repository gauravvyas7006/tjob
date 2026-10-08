import { Document, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { Cv } from "@tjob/shared";

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
    paddingTop: 34,
    paddingBottom: 34,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.35,
    color: "#111111",
  },
  name: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  headline: { fontSize: 11, marginBottom: 3 },
  contact: { fontSize: 9.5, color: "#333333" },
  link: { color: "#333333", textDecoration: "none" },
  section: { marginTop: 10 },
  heading: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    borderBottomWidth: 0.75,
    borderBottomColor: "#999999",
    paddingBottom: 2,
    marginBottom: 5,
  },
  entry: { marginBottom: 6 },
  entryHead: { flexDirection: "row", justifyContent: "space-between" },
  entryTitle: { fontFamily: "Helvetica-Bold", flexShrink: 1, paddingRight: 8 },
  entryMeta: { color: "#333333", fontSize: 9.5 },
  sub: { color: "#333333", fontSize: 9.5, marginBottom: 1 },
  bulletRow: { flexDirection: "row", marginTop: 1.5 },
  bulletDot: { width: 10 },
  bulletText: { flex: 1 },
  skillRow: { marginBottom: 2 },
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

function dateRange(start: string, end: string) {
  return [start, end].filter(Boolean).join(" – ");
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
        <Text style={styles.contact}>
          {contactParts.join("  |  ")}
          {links.map((l, i) => (
            <Text key={i}>
              {contactParts.length || i > 0 ? "  |  " : ""}
              <Link src={l.url} style={styles.link}>
                {pdfSafe(l.url.replace(/^https?:\/\/(www\.)?/, ""))}
              </Link>
            </Text>
          ))}
        </Text>

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
                {/* Keep each job's title with its first bullets. */}
                <View style={styles.entryHead} minPresenceAhead={50} wrap={false}>
                  <Text style={styles.entryTitle}>
                    {pdfSafe([e.role, e.company].filter(Boolean).join(", "))}
                  </Text>
                  <Text style={styles.entryMeta}>{pdfSafe(dateRange(e.startDate, e.endDate))}</Text>
                </View>
                {e.location ? <Text style={styles.sub}>{pdfSafe(e.location)}</Text> : null}
                <Bullets items={e.bullets} />
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
                <Text style={styles.entryTitle} minPresenceAhead={40}>
                  {pdfSafe(p.name)}
                </Text>
                {p.description ? <Text style={styles.sub}>{pdfSafe(p.description)}</Text> : null}
                <Bullets items={p.bullets} />
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
