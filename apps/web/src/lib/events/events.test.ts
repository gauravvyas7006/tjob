import { describe, expect, it } from "vitest";
import { eventTopics, looksLikeAd, selectEvents } from "./classify";
import { dayLabel, googleCalendarUrl, istDay, mergeDuplicates, placeText, timeRange } from "./display";
import { eventbritePage, inDays, lumaResponse, meetupPage } from "./fixtures";
import { jsonAfter, parseEventbrite, parseLuma, parseMeetup, zonedDate, type ScrapedEvent } from "./parse";

describe("event parsers", () => {
  it("reads Luma's discovery feed, with price and registration notes", () => {
    const start = inDays(3);
    const [free, paid] = parseLuma(
      lumaResponse([
        { id: "evt-1", name: "GenAI Builders Meetup", start, calendar: "AI Collective" },
        { id: "evt-2", name: "LLM Summit", start, free: false },
      ]),
    );
    expect(free).toMatchObject({
      source: "luma",
      externalId: "evt-1",
      url: "https://luma.com/slug-evt-1",
      organizer: "AI Collective",
      isFree: true,
      price: "",
      going: 120,
      note: "Host approval needed",
      inPerson: true,
      venue: "Hub Hall",
    });
    expect(free.startsAt.getTime()).toBe(start.getTime());
    // A "Personal" calendar means a one-off host: show their name instead.
    expect(paid).toMatchObject({ organizer: "Asha Rao", isFree: false, price: "₹499" });
    expect(() => parseLuma({ error: "nope" })).toThrow(/changed shape/);
  });

  it("reads Meetup's embedded Apollo cache; no fee settings means free", () => {
    const events = parseMeetup(
      meetupPage([
        { id: "101", title: "React Meetup #109", start: inDays(5) },
        { id: "102", title: "Paid workshop", start: inDays(6), fee: { amount: 300, currency: "INR" } },
      ]),
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      source: "meetup",
      externalId: "101",
      organizer: "ReactJS Bangalore",
      isFree: true,
      going: 85,
      city: "Bengaluru",
      address: "Diamond District, Domlur, Bengaluru",
    });
    expect(events[1]).toMatchObject({ isFree: false, price: "₹300" });
    expect(() => parseMeetup("<html>blocked</html>")).toThrow(/layout/);
  });

  it("reads both Eventbrite page layouts and converts local times", () => {
    const start = inDays(10);
    for (const layout of ["search_data", "event_data"] as const) {
      const [e] = parseEventbrite(eventbritePage([{ id: "9", name: "AltSecCON", start }], layout), { free: true });
      expect(e).toMatchObject({ externalId: "9", isFree: true, venue: "Hilton", city: "Bengaluru" });
      expect(timeRange(e.startsAt, e.endsAt)).toBe("10:00 am – 5:00 pm");
    }
    const [unknown] = parseEventbrite(eventbritePage([{ id: "9", name: "x", start }]), { free: false });
    expect(unknown.isFree).toBeNull();
    // Organizer set the wrong zone: 09:00 Dubai is 10:30 in India.
    expect(zonedDate("2027-06-02", "09:00", "Asia/Dubai").toISOString()).toBe("2027-06-02T05:00:00.000Z");
    expect(zonedDate("2027-06-02", "09:00", "Asia/Kolkata").toISOString()).toBe("2027-06-02T03:30:00.000Z");
  });

  it("finds the right object after a marker, ignoring braces inside strings", () => {
    expect(jsonAfter(`x = 1; window.D = {"a": "}{", "b": {"c": [1]}}; var y = {"z": 2};`, "window.D")).toEqual({
      a: "}{",
      b: { c: [1] },
    });
    expect(jsonAfter("nothing here", "window.D")).toBeNull();
  });
});

describe("event topics and filters", () => {
  it("tags topics without confusing Java with JavaScript", () => {
    expect(eventTopics("Spring Boot and Java 25 deep dive")).toEqual(["java"]);
    expect(eventTopics("Node.js Bangalore #42")).toEqual(["javascript"]);
    expect(eventTopics("JavaScript on the server")).toEqual(["javascript"]);
    expect(eventTopics("Agentic AI with Kafka on AWS")).toEqual(["ai", "cloud", "data"]);
    expect(eventTopics("Bangalore Product Mixer #4")).toEqual(["startups"]);
    expect(eventTopics("Mumbai food walk")).toEqual([]);
  });

  it("only trusts specific keywords in descriptions", () => {
    expect(eventTopics("October meetup", "We'll pair on code and data, then chai")).toEqual([]);
    expect(eventTopics("October meetup", "Talks on Kubernetes operators")).toEqual(["cloud"]);
  });

  it("spots course and placement ads", () => {
    expect(looksLikeAd("Free DevOps Demo Class in Electronic City Bangalore")).toBe(true);
    expect(looksLikeAd("Best Software Testing Coaching Center Electronic City")).toBe(true);
    expect(looksLikeAd("How to Crack MAANG Interviews & Target a 50 LPA Job")).toBe(true);
    expect(looksLikeAd("React Meetup #109")).toBe(false);
  });

  it("keeps upcoming in-person Bengaluru tech events only", () => {
    const base: ScrapedEvent = {
      source: "meetup",
      externalId: "1",
      title: "Java User Group meetup",
      url: "https://example.com/1",
      startsAt: inDays(2),
      endsAt: null,
      venue: "",
      address: "",
      organizer: "",
      isFree: null,
      price: "",
      going: null,
      note: "",
      inPerson: true,
      city: "Bangalore",
      details: "",
    };
    const kept = selectEvents([
      base,
      { ...base, externalId: "2", inPerson: false },
      { ...base, externalId: "3", city: "Pune" },
      { ...base, externalId: "4", startsAt: inDays(-2) },
      { ...base, externalId: "5", title: "Sunday trek to Savandurga" },
      { ...base, externalId: "6", title: "Java full course in Marathahalli" },
      // Same listing seen twice: the copy that confirms it's free wins.
      { ...base, isFree: true },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ externalId: "1", isFree: true, topics: ["java"] });
    expect(kept[0]).not.toHaveProperty("details");
  });
});

describe("event display", () => {
  const row = (id: string, source: "luma" | "meetup" | "eventbrite", title: string, extra = {}) => ({
    id,
    source,
    url: `https://${source}.example/${id}`,
    title,
    startsAt: new Date("2026-10-16T09:30:00Z"),
    isFree: null as boolean | null,
    mark: null as "interested" | "going" | "hidden" | null,
    ...extra,
  });

  it("merges the same event listed on several sites", () => {
    const merged = mergeDuplicates([
      row("a", "meetup", "Swift Bengaluru × Okta", { isFree: true }),
      row("b", "luma", "Swift Bengaluru x Okta"),
      row("c", "luma", "Something else"),
    ]);
    expect(merged).toHaveLength(2);
    const swift = merged.find((m) => m.title.startsWith("Swift"))!;
    expect(swift).toMatchObject({ id: "b", isFree: true, alsoOn: [{ source: "meetup", url: "https://meetup.example/a" }] });
    // The copy the user marked stays the main one.
    const [marked] = mergeDuplicates([row("a", "meetup", "Swift"), row("b", "luma", "Swift"), row("x", "eventbrite", "Swift", { mark: "going" })]);
    expect(marked.id).toBe("x");
  });

  it("formats days, times and calendar links in India time", () => {
    const now = new Date("2026-10-08T20:00:00Z"); // 9 Oct, 01:30 in India
    expect(dayLabel("2026-10-09", now)).toBe("Today");
    expect(dayLabel("2026-10-10", now)).toBe("Tomorrow");
    expect(dayLabel("2026-10-17", now)).toBe("Sat, 17 Oct");
    expect(istDay(now)).toBe("2026-10-09");
    expect(timeRange(new Date("2026-10-16T09:30:00Z"), new Date("2026-10-18T12:30:00Z"))).toBe("3:00 pm – 18 Oct");

    const url = new URL(
      googleCalendarUrl({
        title: "React Meetup",
        url: "https://meetup.com/e/1",
        startsAt: new Date("2026-10-31T08:30:00Z"),
        endsAt: null,
        venue: "Hub Hall",
        address: "Hub Hall, Koramangala",
      }),
    );
    expect(url.searchParams.get("dates")).toBe("20261031T083000Z/20261031T103000Z");
    expect(url.searchParams.get("location")).toBe("Hub Hall, Koramangala");
    expect(placeText({ venue: "Thoughtworks", address: "Domlur" })).toBe("Thoughtworks, Domlur");
  });
});
