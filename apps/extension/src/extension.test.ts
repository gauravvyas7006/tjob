import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectFields, fillField, readValue } from "./content/fields";
import { linkedin } from "./sites/linkedin";
import { naukri } from "./sites/naukri";

declare const happyDOM: { setURL(url: string): void };

// happy-dom has no layout; treat every element as visible.
beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    width: 100, height: 20, x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 20, toJSON: () => ({}),
  } as DOMRect);
});

describe("LinkedIn adapter", () => {
  it("reads the job being viewed from the search pane (currentJobId)", () => {
    happyDOM.setURL("https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=java");
    document.body.innerHTML = `
      <div class="job-details-jobs-unified-top-card__container--two-pane">
        <div class="job-details-jobs-unified-top-card__job-title"><h1>Senior Java Developer</h1></div>
        <div class="job-details-jobs-unified-top-card__company-name"><a>Acme Technologies</a></div>
        <div class="job-details-jobs-unified-top-card__primary-description-container"><span class="tvm__text">Pune, Maharashtra</span></div>
        <button class="jobs-apply-button">Easy Apply</button>
      </div>
      <div id="job-details">About the job. We need Java, Spring Boot and Kafka experience to build microservices for payments at scale.</div>`;
    expect(linkedin.jobKey()).toBe("li:4012345678");
    expect(linkedin.extractJob()).toMatchObject({
      source: "linkedin",
      externalId: "4012345678",
      url: "https://www.linkedin.com/jobs/view/4012345678/",
      title: "Senior Java Developer",
      company: "Acme Technologies",
      location: "Pune, Maharashtra",
      applyType: "easy_apply",
    });
    expect(linkedin.extractJob()?.description).toContain("Spring Boot and Kafka");
  });

  it("falls back to JobPosting JSON-LD when selectors change", () => {
    happyDOM.setURL("https://www.linkedin.com/jobs/view/4099999999/");
    document.body.innerHTML = `
      <script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "JobPosting",
        title: "Node.js Engineer",
        hiringOrganization: { name: "Globex" },
        jobLocation: { address: { addressLocality: "Bengaluru" } },
        description: "<p>Build APIs with <b>Node.js</b> and TypeScript.</p><ul><li>AWS</li><li>Docker</li></ul><p>Remote friendly team building developer tools.</p>",
      })}</script>`;
    const job = linkedin.extractJob();
    expect(job).toMatchObject({ title: "Node.js Engineer", company: "Globex", location: "Bengaluru" });
    expect(job?.description).toContain("Node.js and TypeScript");
    expect(job?.description).toContain("AWS");
  });

  it("detects LinkedIn's own 'application sent' confirmation", () => {
    happyDOM.setURL("https://www.linkedin.com/jobs/view/4012345678/");
    document.body.innerHTML = `<div role="dialog"><h3>Your application was sent to Acme Technologies!</h3></div>`;
    expect(linkedin.isApplySuccess()).toBe(true);
    document.body.innerHTML = `<div role="dialog"><h3>Apply to Acme</h3><input /></div>`;
    expect(linkedin.isApplySuccess()).toBe(false);
  });

  it("imports the applied-jobs list", () => {
    happyDOM.setURL("https://www.linkedin.com/my-items/saved-jobs/?cardType=APPLIED");
    document.body.innerHTML = `<ul>
      <li><a href="https://www.linkedin.com/jobs/view/111111111/">Java Developer</a><div>Initech</div><div>Pune</div><div>Applied 2w ago</div></li>
      <li><a href="https://www.linkedin.com/jobs/view/222222222/">Backend Engineer</a><div>Hooli</div><div>Remote</div><div>Application viewed</div></li>
    </ul>`;
    expect(linkedin.isAppliedListPage()).toBe(true);
    const items = linkedin.extractAppliedList();
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ externalId: "222222222", title: "Backend Engineer", company: "Hooli", statusText: "Application viewed" });
  });
});

describe("Naukri adapter", () => {
  it("reads job pages with hashed class names", () => {
    happyDOM.setURL("https://www.naukri.com/job-listings-java-developer-acme-pune-3-to-6-years-120924500123?src=jobsearch");
    document.body.innerHTML = `
      <section class="styles_jd-header__abc12">
        <h1 class="styles_jd-header-title__rZwM1">Java Developer</h1>
        <div class="styles_jd-header-comp-name__MvqAI"><a>Acme Pvt Ltd</a></div>
        <div class="styles_jhc__location__W_pVs"><a>Pune</a></div>
        <div class="styles_jhc__salary__jdfEC">12-18 Lacs P.A.</div>
      </section>
      <section class="styles_job-desc-container__txpYf">Job description: Java, Spring Boot, Hibernate, MySQL. 3-6 years. Build REST APIs for our banking platform.</section>
      <button id="apply-button">Apply</button>`;
    expect(naukri.jobKey()).toBe("nk:120924500123");
    expect(naukri.extractJob()).toMatchObject({
      externalId: "120924500123",
      url: "https://www.naukri.com/job-listings-java-developer-acme-pune-3-to-6-years-120924500123",
      title: "Java Developer",
      company: "Acme Pvt Ltd",
      location: "Pune",
      salaryText: "12-18 Lacs P.A.",
      applyType: "naukri",
    });
    expect(naukri.isApplySuccess()).toBe(false);
    document.getElementById("apply-button")!.textContent = "Applied";
    expect(naukri.isApplySuccess()).toBe(true);
  });
});

describe("form fields", () => {
  it("collects labelled empty fields and fills them like a user would", () => {
    document.body.innerHTML = `<form>
      <label for="np">Notice period *</label><input id="np" type="text">
      <input aria-label="Years of experience with Java" type="number">
      <label for="ctc">Current CTC</label><input id="ctc" value="already filled">
      <label for="reloc">Willing to relocate?</label>
      <select id="reloc"><option>Select an option</option><option>Yes</option><option>No</option></select>
      <fieldset><legend>Do you have a valid passport?</legend>
        <input type="radio" name="pp" id="pp1" value="Yes"><label for="pp1">Yes</label>
        <input type="radio" name="pp" id="pp2" value="No"><label for="pp2">No</label>
      </fieldset>
      <input type="hidden" name="csrf" value="x"><input type="file">
    </form>`;
    const fields = collectFields(document);
    expect(fields.map((f) => [f.label, f.type])).toEqual([
      ["Notice period", "text"],
      ["Years of experience with Java", "number"],
      ["Willing to relocate?", "select"],
      ["Do you have a valid passport?", "radio"],
    ]);
    expect(fields[2]!.options).toEqual(["Yes", "No"]);
    expect(fields[3]!.options).toEqual(["Yes", "No"]);

    const seen: string[] = [];
    fields[0]!.el.addEventListener("input", (e) => seen.push((e.target as HTMLInputElement).value));
    expect(fillField(fields[0]!, "30 days")).toBe(true);
    expect(seen).toEqual(["30 days"]); // frameworks listening to `input` see the new value
    expect(fillField(fields[2]!, "No")).toBe(true);
    expect(fillField(fields[3]!, "Yes")).toBe(true);
    expect(fillField(fields[2]!, "Maybe")).toBe(false);
    expect(fields.map(readValue)).toEqual(["30 days", "", "No", "Yes"]);
  });
});
