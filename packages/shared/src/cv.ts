import { z } from "zod";

// AI structured outputs don't support optional keys well, so every field is required and
// "unknown" is expressed as an empty string / empty array.

export const cvLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
});

export const cvContactSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  links: z.array(cvLinkSchema),
});

export const cvExperienceSchema = z.object({
  /** Stable id (e.g. "exp-1") so tailoring can patch bullets per role. */
  id: z.string(),
  company: z.string(),
  role: z.string(),
  location: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  bullets: z.array(z.string()),
  tech: z.array(z.string()),
});

export const cvProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  bullets: z.array(z.string()),
  tech: z.array(z.string()),
});

export const cvEducationSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  field: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  grade: z.string(),
});

export const cvSkillGroupSchema = z.object({
  category: z.string(),
  items: z.array(z.string()),
});

export const cvSchema = z.object({
  contact: cvContactSchema,
  headline: z.string(),
  summary: z.string(),
  skills: z.array(cvSkillGroupSchema),
  experience: z.array(cvExperienceSchema),
  projects: z.array(cvProjectSchema),
  education: z.array(cvEducationSchema),
  certifications: z.array(z.string()),
  achievements: z.array(z.string()),
});

export type Cv = z.infer<typeof cvSchema>;
export type CvExperience = z.infer<typeof cvExperienceSchema>;
export type CvProject = z.infer<typeof cvProjectSchema>;

/**
 * What the tailoring model returns: only the parts that change. Merged onto the master CV with
 * `applyTailorPatch`, which keeps companies, dates, education etc. exactly as in the master.
 */
export const tailorPatchSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  skills: z.array(cvSkillGroupSchema),
  experience: z.array(
    z.object({
      id: z.string(),
      bullets: z.array(z.string()),
    }),
  ),
  /** Project ids to include, most relevant first. */
  projectOrder: z.array(z.string()),
  projects: z.array(
    z.object({
      id: z.string(),
      bullets: z.array(z.string()),
    }),
  ),
  changes: z.array(
    z.object({
      section: z.string(),
      reason: z.string(),
    }),
  ),
  gaps: z.array(
    z.object({
      requirement: z.string(),
      note: z.string(),
    }),
  ),
});

export type TailorPatch = z.infer<typeof tailorPatchSchema>;
export type TailorChange = TailorPatch["changes"][number];
export type TailorGap = TailorPatch["gaps"][number];

export function applyTailorPatch(master: Cv, patch: TailorPatch): Cv {
  const expBullets = new Map(patch.experience.map((e) => [e.id, e.bullets]));
  const projBullets = new Map(patch.projects.map((p) => [p.id, p.bullets]));
  const projectsById = new Map(master.projects.map((p) => [p.id, p]));

  const orderedProjects = patch.projectOrder
    .map((id) => projectsById.get(id))
    .filter((p): p is CvProject => Boolean(p));

  return {
    ...master,
    headline: patch.headline || master.headline,
    summary: patch.summary || master.summary,
    skills: patch.skills.length ? patch.skills : master.skills,
    experience: master.experience.map((e) => {
      const bullets = expBullets.get(e.id);
      return bullets && bullets.length ? { ...e, bullets } : e;
    }),
    projects: (orderedProjects.length ? orderedProjects : master.projects).map((p) => {
      const bullets = projBullets.get(p.id);
      return bullets && bullets.length ? { ...p, bullets } : p;
    }),
  };
}

/** Flatten a CV to plain text (used for ATS keyword matching and PDF readability tests). */
export function cvToPlainText(cv: Cv): string {
  const parts: string[] = [
    cv.contact.name,
    cv.headline,
    cv.summary,
    ...cv.skills.flatMap((g) => [g.category, ...g.items]),
    ...cv.experience.flatMap((e) => [e.role, e.company, ...e.bullets, ...e.tech]),
    ...cv.projects.flatMap((p) => [p.name, p.description, ...p.bullets, ...p.tech]),
    ...cv.education.flatMap((e) => [e.degree, e.field, e.institution]),
    ...cv.certifications,
    ...cv.achievements,
  ];
  return parts.filter(Boolean).join("\n");
}

export function emptyCv(): Cv {
  return {
    contact: { name: "", email: "", phone: "", location: "", links: [] },
    headline: "",
    summary: "",
    skills: [],
    experience: [],
    projects: [],
    education: [],
    certifications: [],
    achievements: [],
  };
}
