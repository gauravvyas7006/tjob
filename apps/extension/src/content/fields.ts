/**
 * Find application-form fields, read their labels, and fill them the way a person typing would
 * (native value setter + input/change events, so React-based forms like LinkedIn register it).
 */
export type FieldType = "text" | "textarea" | "number" | "select" | "radio" | "checkbox";

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  options: string[];
  el: HTMLElement;
  radios?: HTMLInputElement[];
}

const clean = (s: string | null | undefined) =>
  (s ?? "")
    .replace(/\s+/g, " ")
    .replace(/\*\s*$/, "")
    .replace(/\(?required\)?$/i, "")
    .trim();

function textOf(id: string | null): string {
  if (!id) return "";
  return id
    .split(/\s+/)
    .map((x) => document.getElementById(x)?.textContent ?? "")
    .join(" ");
}

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
}

export function labelFor(el: HTMLElement): string {
  const input = el as HTMLInputElement;
  const fromLabels = input.labels?.[0]?.textContent;
  const candidates = [
    fromLabels,
    textOf(el.getAttribute("aria-labelledby")),
    el.getAttribute("aria-label"),
    el.closest("fieldset")?.querySelector("legend")?.textContent,
    el.closest("label")?.textContent,
    el.getAttribute("placeholder"),
  ];
  for (const c of candidates) {
    const t = clean(c);
    if (t && t.length > 1) return t.slice(0, 300);
  }
  // Fall back to the nearest preceding text in the field's wrapper.
  let node: HTMLElement | null = el.parentElement;
  for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
    const t = clean(node.querySelector("label, legend, span, p, div")?.textContent);
    if (t && t.length > 1 && t.length < 300) return t;
  }
  return "";
}

let counter = 0;
function fieldId(el: HTMLElement): string {
  if (!el.dataset.tjobField) el.dataset.tjobField = `f${++counter}`;
  return el.dataset.tjobField;
}

function isEmpty(el: HTMLElement): boolean {
  if (el instanceof HTMLSelectElement) {
    const opt = el.selectedOptions[0];
    return !el.value || /^select|^choose|^--/i.test(opt?.textContent?.trim() ?? "");
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return !el.value.trim();
  return true;
}

/** Visible, empty, editable fields inside `root`. */
export function collectFields(root: ParentNode): FormField[] {
  const fields: FormField[] = [];
  const seenRadioGroups = new Set<string>();

  root.querySelectorAll<HTMLElement>("input, textarea, select").forEach((el) => {
    if (!visible(el) && !(el instanceof HTMLInputElement && el.type === "radio")) return;
    if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) return;

    if (el instanceof HTMLSelectElement) {
      if (!isEmpty(el)) return;
      const options = [...el.options].map((o) => o.textContent?.trim() ?? "").filter((o) => o && !/^select|^choose/i.test(o));
      fields.push({ id: fieldId(el), label: labelFor(el), type: "select", options, el });
      return;
    }
    if (el instanceof HTMLTextAreaElement) {
      if (!isEmpty(el)) return;
      fields.push({ id: fieldId(el), label: labelFor(el), type: "textarea", options: [], el });
      return;
    }
    const input = el as HTMLInputElement;
    const type = input.type.toLowerCase();
    if (["hidden", "file", "submit", "button", "image", "reset", "password", "search"].includes(type)) return;
    if (type === "radio") {
      const group = input.name || input.closest("fieldset")?.id || "";
      if (!group || seenRadioGroups.has(group)) return;
      seenRadioGroups.add(group);
      const radios = [...root.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(input.name)}"]`)];
      if (radios.some((r) => r.checked)) return;
      const fieldset = input.closest("fieldset");
      const label = clean(fieldset?.querySelector("legend")?.textContent) || labelFor(fieldset ?? input);
      fields.push({
        id: fieldId(input),
        label,
        type: "radio",
        options: radios.map((r) => clean(r.labels?.[0]?.textContent) || r.value),
        el: input,
        radios,
      });
      return;
    }
    if (type === "checkbox") {
      if (input.checked) return;
      fields.push({ id: fieldId(input), label: labelFor(input), type: "checkbox", options: [], el: input });
      return;
    }
    if (!isEmpty(input)) return;
    fields.push({ id: fieldId(input), label: labelFor(input), type: type === "number" ? "number" : "text", options: [], el: input });
  });

  return fields.filter((f) => f.label);
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

const norm = (s: string) => s.trim().toLowerCase();

/** Fill one field. Returns false if the value didn't fit (e.g. no matching option). */
export function fillField(f: FormField, value: string): boolean {
  if (!value) return false;
  const el = f.el;
  if (el instanceof HTMLSelectElement) {
    const opt = [...el.options].find((o) => norm(o.textContent ?? "") === norm(value)) ??
      [...el.options].find((o) => norm(o.textContent ?? "").startsWith(norm(value)));
    if (!opt) return false;
    el.value = opt.value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  if (f.type === "radio" && f.radios) {
    const i = f.options.findIndex((o) => norm(o) === norm(value));
    const radio = f.radios[i >= 0 ? i : f.options.findIndex((o) => norm(o).startsWith(norm(value)))];
    if (!radio) return false;
    radio.click();
    return true;
  }
  if (f.type === "checkbox") {
    if (/^(true|yes|y|1)$/i.test(value) && !(el as HTMLInputElement).checked) (el as HTMLInputElement).click();
    return true;
  }
  setNativeValue(el as HTMLInputElement | HTMLTextAreaElement, value);
  return true;
}

export function readValue(f: FormField): string {
  const el = f.el;
  if (f.type === "radio" && f.radios) {
    const i = f.radios.findIndex((r) => r.checked);
    return i >= 0 ? (f.options[i] ?? "") : "";
  }
  if (el instanceof HTMLSelectElement) return el.selectedOptions[0]?.textContent?.trim() ?? "";
  if (f.type === "checkbox") return (el as HTMLInputElement).checked ? "true" : "";
  return (el as HTMLInputElement).value?.trim() ?? "";
}

/** Outline a filled field: amber for AI drafts (check these), green for saved/profile answers. */
export function markField(f: FormField, source: "ai" | "saved" | "profile") {
  const target = f.type === "radio" ? (f.el.closest("fieldset") as HTMLElement | null) ?? f.el : f.el;
  target.style.outline = source === "ai" ? "2px solid #eda100" : "2px solid #1baf7a";
  target.style.outlineOffset = "2px";
  target.title = source === "ai" ? "Drafted by tjob AI — check before submitting" : "Filled by tjob from your saved answers";
}

/** Put a PDF into a file input (e.g. LinkedIn Easy Apply resume upload). */
export function attachFile(input: HTMLInputElement, file: File): void {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
