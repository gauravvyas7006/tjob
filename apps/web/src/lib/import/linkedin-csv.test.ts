import { describe, expect, it } from "vitest";
import { parseLinkedInApplicationsCsv, parseLinkedInDate } from "./linkedin-csv";

describe("LinkedIn CSV import", () => {
  it("parses the export with loosely matched columns", () => {
    const csv = [
      "﻿Application Date,Contact Email,Contact Phone Number,Company Name,Job Title,Job Url,Resume Name,Question And Answers",
      '"10/5/24, 2:15 PM",,,"Acme, Inc.",Java Developer,https://www.linkedin.com/jobs/view/3901234567,cv.pdf,',
      '"1/12/25, 9:00 AM",,,Globex,Node.js Engineer,,,',
      ",,,,,,,",
    ].join("\n");
    const { rows, errors } = parseLinkedInApplicationsCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ company: "Acme, Inc.", title: "Java Developer", externalId: "3901234567" });
    expect(rows[0].appliedAt?.toISOString()).toBe("2024-10-05T14:15:00.000Z");
    expect(rows[1].externalId).toBeNull();
  });

  it("reports missing columns instead of importing garbage", () => {
    const { rows, errors } = parseLinkedInApplicationsCsv("Foo,Bar\n1,2");
    expect(rows).toEqual([]);
    expect(errors[0]).toMatch(/company\/title/);
  });

  it("parses other date formats", () => {
    expect(parseLinkedInDate("2024-10-05 14:15:00 UTC")?.toISOString()).toBe("2024-10-05T14:15:00.000Z");
    expect(parseLinkedInDate("12/1/2024")?.getUTCMonth()).toBe(11);
    expect(parseLinkedInDate("")).toBeNull();
  });
});
