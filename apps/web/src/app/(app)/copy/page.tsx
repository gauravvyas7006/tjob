import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { cvVersions, db, profile, savedAnswers } from "@/db";
import { getCvVersion, getMasterCv } from "@/lib/cv/service";
import {
  allSkills,
  bulletBlock,
  educationLine,
  findLink,
  isCurrent,
  localPhone,
  monthYear,
  splitName,
  tidyName,
  yearOf,
} from "@/lib/cv/quick-copy";
import { requireUser } from "@/lib/session";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CopyRow, SourcePicker } from "./client";

export const metadata = { title: "Quick copy" };

const IN_PROFILE = "Not set. Add it in Settings → Profile";

function Group({ title, edit, children }: { title: string; edit?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-2 md:p-3">
      <div className="flex items-baseline justify-between gap-2 px-3 pt-1 pb-2">
        <h2 className="font-medium">{title}</h2>
        {edit && (
          <Link href={edit} className="text-xs text-muted-foreground hover:underline">
            Edit
          </Link>
        )}
      </div>
      <div className="grid gap-x-2 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Entry({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-2 border-t pt-2 first:border-t-0 first:pt-0 sm:col-span-2 sm:grid-cols-2">
      <div className="px-3 pb-1 text-sm font-medium sm:col-span-2">{title}</div>
      {children}
    </div>
  );
}

export default async function QuickCopyPage(props: PageProps<"/copy">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const versionId = typeof sp.v === "string" && /^[0-9a-f-]{36}$/i.test(sp.v) ? sp.v : null;
  const [master, version, [prof], versions, answers] = await Promise.all([
    getMasterCv(user.id),
    versionId ? getCvVersion(user.id, versionId) : null,
    db.select().from(profile).where(eq(profile.userId, user.id)),
    db
      .select({ id: cvVersions.id, title: cvVersions.title })
      .from(cvVersions)
      .where(eq(cvVersions.userId, user.id))
      .orderBy(desc(cvVersions.createdAt))
      .limit(50),
    db
      .select({ id: savedAnswers.id, question: savedAnswers.question, answer: savedAnswers.answer })
      .from(savedAnswers)
      .where(eq(savedAnswers.userId, user.id))
      .orderBy(desc(savedAnswers.useCount))
      .limit(100),
  ]);

  if (!master) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Quick copy" />
        <EmptyState title="Upload your CV first">
          Quick copy fills in from your master CV. <Link href="/cv" className="underline">Go to CV</Link>
        </EmptyState>
      </div>
    );
  }

  // Tailored versions keep contact details, companies, dates and education exactly as in the master.
  const cv = version?.data ?? master.data;
  const name = tidyName(prof?.fullName || user.name || cv.contact.name);
  const { first, middle, last } = splitName(name);
  const phone = prof?.phone || cv.contact.phone;
  const otherLinks = cv.contact.links.filter((l) => l.url && !/linkedin|github/i.test(`${l.label} ${l.url}`));

  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <PageHeader
        title="Quick copy"
        description="Click any field to copy it, then paste it into the application form. Everything comes from your CV and Settings → Profile."
        actions={
          versions.length > 0 && <SourcePicker value={version?.id ?? ""} versions={versions} />
        }
      />

      <Group title="Personal details" edit="/settings#profile">
        <CopyRow label="Full name" value={name} missing={IN_PROFILE} />
        <CopyRow label="First name" value={first} missing={IN_PROFILE} />
        {middle && <CopyRow label="Middle name" value={middle} />}
        <CopyRow label="Last name" value={last} missing={IN_PROFILE} />
        <CopyRow label="Email" value={cv.contact.email || user.email} />
        <CopyRow label="Phone" value={phone} missing={IN_PROFILE} />
        {localPhone(phone) !== phone && <CopyRow label="Phone without country code" value={localPhone(phone)} />}
        <CopyRow label="Current location" value={prof?.location || cv.contact.location} missing={IN_PROFILE} />
        <CopyRow label="LinkedIn" value={prof?.linkedinUrl || findLink(cv, /linkedin/i)} missing={IN_PROFILE} />
        <CopyRow label="GitHub" value={prof?.githubUrl || findLink(cv, /github/i)} missing={IN_PROFILE} />
        <CopyRow label="Portfolio / website" value={prof?.portfolioUrl ?? ""} missing={IN_PROFILE} />
        {otherLinks.map((l) => (
          <CopyRow key={l.url} label={l.label || "Link"} value={l.url} />
        ))}
      </Group>

      <Group title="Experience, salary & notice" edit="/settings#profile">
        <CopyRow label="Total experience" value={prof?.totalExperience ?? ""} missing={IN_PROFILE} />
        <CopyRow label="Notice period" value={prof?.noticePeriod ?? ""} missing={IN_PROFILE} />
        <CopyRow label="Current CTC" value={prof?.currentCtc ?? ""} missing={IN_PROFILE} />
        <CopyRow label="Expected CTC" value={prof?.expectedCtc ?? ""} missing={IN_PROFILE} />
        <CopyRow label="Preferred locations" value={prof?.preferredLocations ?? ""} missing={IN_PROFILE} wide />
      </Group>

      <Group title="Education" edit="/cv">
        {cv.education.length === 0 && <CopyRow label="Education" value="" missing="None on your CV" wide />}
        {cv.education.map((e, i) => (
          <Entry key={i} title={e.degree || e.institution || `Education ${i + 1}`}>
            <CopyRow label="Degree" value={e.degree} />
            <CopyRow label="Field of study / specialisation" value={e.field} />
            <CopyRow label="College / university" value={e.institution} wide />
            <CopyRow label="Start year" value={yearOf(e.startDate)} missing="Not on your CV. Add it on the CV page" />
            <CopyRow label="Year of passing" value={yearOf(e.endDate)} />
            {monthYear(e.startDate) && <CopyRow label="Start (MM/YYYY)" value={monthYear(e.startDate)} />}
            {monthYear(e.endDate) && <CopyRow label="Completed (MM/YYYY)" value={monthYear(e.endDate)} />}
            <CopyRow label="Grade / CGPA / %" value={e.grade} />
            <CopyRow label="All in one line" value={educationLine(e)} wide />
          </Entry>
        ))}
      </Group>

      <Group title="Work experience" edit="/cv">
        {cv.experience.length === 0 && <CopyRow label="Experience" value="" missing="None on your CV" wide />}
        {cv.experience.map((x) => (
          <Entry key={x.id} title={[x.role, x.company].filter(Boolean).join(" · ")}>
            <CopyRow label="Job title" value={x.role} />
            <CopyRow label="Company" value={x.company} />
            <CopyRow label="Location" value={x.location} />
            {isCurrent(x.endDate) && <CopyRow label="Currently working here" value="Yes" />}
            <CopyRow label="Start date" value={x.startDate} />
            <CopyRow label="End date" value={x.endDate} />
            {monthYear(x.startDate) && <CopyRow label="Start (MM/YYYY)" value={monthYear(x.startDate)} />}
            {monthYear(x.endDate) && <CopyRow label="End (MM/YYYY)" value={monthYear(x.endDate)} />}
            <CopyRow label="Description" value={bulletBlock(x.bullets)} multiline wide />
            {x.tech.length > 0 && <CopyRow label="Technologies" value={x.tech.join(", ")} wide />}
          </Entry>
        ))}
      </Group>

      <Group title={version ? "Skills & summary (tailored)" : "Skills & summary"} edit={version ? `/cv/${version.id}` : "/cv"}>
        <CopyRow label="All skills" value={allSkills(cv)} wide />
        {cv.skills.map((g) => (
          <CopyRow key={g.category} label={g.category || "Skills"} value={g.items.join(", ")} />
        ))}
        <CopyRow label="Headline" value={cv.headline} wide />
        <CopyRow label="Professional summary" value={cv.summary} multiline wide />
      </Group>

      {cv.projects.length > 0 && (
        <Group title="Projects" edit="/cv">
          {cv.projects.map((p) => (
            <Entry key={p.id} title={p.name}>
              <CopyRow label="Project name" value={p.name} wide />
              <CopyRow label="About" value={p.description} multiline wide />
              <CopyRow label="What I did" value={bulletBlock(p.bullets)} multiline wide />
              {p.tech.length > 0 && <CopyRow label="Technologies" value={p.tech.join(", ")} wide />}
            </Entry>
          ))}
        </Group>
      )}

      {(cv.certifications.length > 0 || cv.achievements.length > 0) && (
        <Group title="Certifications & achievements" edit="/cv">
          {cv.certifications.map((c, i) => (
            <CopyRow key={`c${i}`} label="Certification" value={c} wide />
          ))}
          {cv.achievements.map((a, i) => (
            <CopyRow key={`a${i}`} label="Achievement" value={a} wide />
          ))}
        </Group>
      )}

      {answers.length > 0 && (
        <Group title="Saved answers" edit="/settings#answers">
          {answers.map((a) => (
            <CopyRow key={a.id} label={a.question} value={a.answer} multiline wide />
          ))}
        </Group>
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <a href={version ? `/api/cv/${version.id}/pdf` : "/api/cv/master/pdf"}>Download this CV as PDF</a>
        </Button>
      </div>
    </div>
  );
}
