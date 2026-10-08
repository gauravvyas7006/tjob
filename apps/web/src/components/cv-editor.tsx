"use client";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Cv } from "@tjob/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type SaveResult = { ok: boolean; message?: string } | undefined;

const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
const csv = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

function skillsToText(cv: Cv) {
  return cv.skills.map((g) => `${g.category}: ${g.items.join(", ")}`).join("\n");
}
function textToSkills(text: string): Cv["skills"] {
  return lines(text).map((l) => {
    const i = l.indexOf(":");
    return i > 0 ? { category: l.slice(0, i).trim(), items: csv(l.slice(i + 1)) } : { category: "Skills", items: csv(l) };
  });
}

function move<T>(arr: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ItemControls({ onUp, onDown, onRemove }: { onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <div className="flex gap-1">
      <Button type="button" size="icon" variant="ghost" onClick={onUp} aria-label="Move up">
        <ArrowUp className="size-4" />
      </Button>
      <Button type="button" size="icon" variant="ghost" onClick={onDown} aria-label="Move down">
        <ArrowDown className="size-4" />
      </Button>
      <Button type="button" size="icon" variant="ghost" onClick={onRemove} aria-label="Remove">
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

/**
 * Structured CV editor. Bullets/lists are edited as one item per line. When `compareWith` is
 * given (tailored versions), each role shows the master CV's original bullets for comparison.
 */
export function CvEditor({
  initial,
  compareWith,
  onSave,
}: {
  initial: Cv;
  compareWith?: Cv;
  onSave: (cv: Cv) => Promise<SaveResult>;
}) {
  const [cv, setCv] = useState<Cv>(initial);
  const [skillsText, setSkillsText] = useState(skillsToText(initial));
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();

  const update = (patch: Partial<Cv>) => {
    setCv((c) => ({ ...c, ...patch }));
    setDirty(true);
  };
  const masterById = new Map(compareWith?.experience.map((e) => [e.id, e]) ?? []);

  const save = () =>
    start(async () => {
      const res = await onSave({ ...cv, skills: textToSkills(skillsText) });
      if (res?.ok) {
        toast.success(res.message ?? "Saved");
        setDirty(false);
      } else toast.error(res?.message ?? "Couldn't save");
    });

  return (
    <div className="grid gap-5">
      <section className="grid gap-3">
        <h3 className="text-sm font-semibold">Contact</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["name", "email", "phone", "location"] as const).map((k) => (
            <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
              <Input value={cv.contact[k]} onChange={(e) => update({ contact: { ...cv.contact, [k]: e.target.value } })} />
            </Field>
          ))}
        </div>
        <Field label="Links (one per line: Label | URL)">
          <Textarea
            rows={2}
            defaultValue={cv.contact.links.map((l) => `${l.label} | ${l.url}`).join("\n")}
            onChange={(e) =>
              update({
                contact: {
                  ...cv.contact,
                  links: lines(e.target.value).map((l) => {
                    const [label, url] = l.includes("|") ? l.split("|").map((x) => x.trim()) : ["", l];
                    return { label, url };
                  }),
                },
              })
            }
          />
        </Field>
      </section>

      <section className="grid gap-3">
        <Field label="Headline">
          <Input value={cv.headline} onChange={(e) => update({ headline: e.target.value })} />
        </Field>
        <Field label="Summary">
          <Textarea rows={4} value={cv.summary} onChange={(e) => update({ summary: e.target.value })} />
        </Field>
        <Field label="Skills (one group per line: Category: skill, skill)">
          <Textarea
            rows={5}
            value={skillsText}
            onChange={(e) => {
              setSkillsText(e.target.value);
              setDirty(true);
            }}
          />
        </Field>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Experience</h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              update({
                experience: [
                  ...cv.experience,
                  { id: `exp-${Date.now()}`, company: "", role: "", location: "", startDate: "", endDate: "", bullets: [], tech: [] },
                ],
              })
            }
          >
            <Plus className="size-4" /> Add role
          </Button>
        </div>
        {cv.experience.map((e, i) => {
          const set = (patch: Partial<typeof e>) =>
            update({ experience: cv.experience.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          const original = masterById.get(e.id);
          return (
            <div key={e.id} className="grid gap-3 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="grid flex-1 gap-3 sm:grid-cols-2">
                  <Field label="Role">
                    <Input value={e.role} onChange={(ev) => set({ role: ev.target.value })} />
                  </Field>
                  <Field label="Company">
                    <Input value={e.company} onChange={(ev) => set({ company: ev.target.value })} />
                  </Field>
                  <Field label="Start">
                    <Input value={e.startDate} onChange={(ev) => set({ startDate: ev.target.value })} />
                  </Field>
                  <Field label="End">
                    <Input value={e.endDate} onChange={(ev) => set({ endDate: ev.target.value })} />
                  </Field>
                  <Field label="Location">
                    <Input value={e.location} onChange={(ev) => set({ location: ev.target.value })} />
                  </Field>
                  <Field label="Tech (comma separated)">
                    <Input defaultValue={e.tech.join(", ")} onChange={(ev) => set({ tech: csv(ev.target.value) })} />
                  </Field>
                </div>
                <ItemControls
                  onUp={() => update({ experience: move(cv.experience, i, -1) })}
                  onDown={() => update({ experience: move(cv.experience, i, 1) })}
                  onRemove={() => update({ experience: cv.experience.filter((_, j) => j !== i) })}
                />
              </div>
              <Field label="Bullets (one per line)">
                <Textarea rows={Math.max(4, e.bullets.length + 1)} defaultValue={e.bullets.join("\n")} onChange={(ev) => set({ bullets: lines(ev.target.value) })} />
              </Field>
              {original && original.bullets.join("\n") !== e.bullets.join("\n") && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Original bullets in your master CV</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    {original.bullets.map((b, k) => (
                      <li key={k}>{b}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Projects</h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              update({ projects: [...cv.projects, { id: `proj-${Date.now()}`, name: "", description: "", bullets: [], tech: [] }] })
            }
          >
            <Plus className="size-4" /> Add project
          </Button>
        </div>
        {cv.projects.map((p, i) => {
          const set = (patch: Partial<typeof p>) =>
            update({ projects: cv.projects.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <div key={p.id} className="grid gap-3 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="grid flex-1 gap-3 sm:grid-cols-2">
                  <Field label="Name">
                    <Input value={p.name} onChange={(ev) => set({ name: ev.target.value })} />
                  </Field>
                  <Field label="Tech (comma separated)">
                    <Input defaultValue={p.tech.join(", ")} onChange={(ev) => set({ tech: csv(ev.target.value) })} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="One-line description">
                      <Input value={p.description} onChange={(ev) => set({ description: ev.target.value })} />
                    </Field>
                  </div>
                </div>
                <ItemControls
                  onUp={() => update({ projects: move(cv.projects, i, -1) })}
                  onDown={() => update({ projects: move(cv.projects, i, 1) })}
                  onRemove={() => update({ projects: cv.projects.filter((_, j) => j !== i) })}
                />
              </div>
              <Field label="Bullets (one per line)">
                <Textarea rows={3} defaultValue={p.bullets.join("\n")} onChange={(ev) => set({ bullets: lines(ev.target.value) })} />
              </Field>
            </div>
          );
        })}
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Education</h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              update({ education: [...cv.education, { institution: "", degree: "", field: "", startDate: "", endDate: "", grade: "" }] })
            }
          >
            <Plus className="size-4" /> Add
          </Button>
        </div>
        {cv.education.map((ed, i) => {
          const set = (patch: Partial<typeof ed>) =>
            update({ education: cv.education.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <div key={i} className="flex items-start gap-2 rounded-lg border p-3">
              <div className="grid flex-1 gap-3 sm:grid-cols-3">
                <Field label="Degree">
                  <Input value={ed.degree} onChange={(ev) => set({ degree: ev.target.value })} />
                </Field>
                <Field label="Field">
                  <Input value={ed.field} onChange={(ev) => set({ field: ev.target.value })} />
                </Field>
                <Field label="Institution">
                  <Input value={ed.institution} onChange={(ev) => set({ institution: ev.target.value })} />
                </Field>
                <Field label="Start">
                  <Input value={ed.startDate} onChange={(ev) => set({ startDate: ev.target.value })} />
                </Field>
                <Field label="End">
                  <Input value={ed.endDate} onChange={(ev) => set({ endDate: ev.target.value })} />
                </Field>
                <Field label="Grade">
                  <Input value={ed.grade} onChange={(ev) => set({ grade: ev.target.value })} />
                </Field>
              </div>
              <Button type="button" size="icon" variant="ghost" aria-label="Remove" onClick={() => update({ education: cv.education.filter((_, j) => j !== i) })}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Field label="Certifications (one per line)">
          <Textarea rows={3} defaultValue={cv.certifications.join("\n")} onChange={(e) => update({ certifications: lines(e.target.value) })} />
        </Field>
        <Field label="Achievements (one per line)">
          <Textarea rows={3} defaultValue={cv.achievements.join("\n")} onChange={(e) => update({ achievements: lines(e.target.value) })} />
        </Field>
      </section>

      <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t bg-card/95 px-4 py-3 backdrop-blur">
        <Button onClick={save} disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
      </div>
    </div>
  );
}
