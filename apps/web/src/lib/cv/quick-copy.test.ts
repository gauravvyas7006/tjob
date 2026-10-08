import { describe, expect, it } from "vitest";
import { emptyCv } from "@tjob/shared";
import {
  allSkills,
  bulletBlock,
  educationLine,
  isCurrent,
  localPhone,
  monthYear,
  parseCvDate,
  splitName,
  tidyName,
  yearOf,
} from "./quick-copy";

describe("quick copy formats", () => {
  it("reads CV dates in the usual shapes", () => {
    expect(parseCvDate("May 2023")).toEqual({ year: "2023", month: "05" });
    expect(parseCvDate("September, 2021")).toEqual({ year: "2021", month: "09" });
    expect(parseCvDate("05/2023")).toEqual({ year: "2023", month: "05" });
    expect(parseCvDate("2023-11")).toEqual({ year: "2023", month: "11" });
    expect(parseCvDate("2019")).toEqual({ year: "2019", month: "" });
    expect(parseCvDate("Present")).toBeNull();
    expect(parseCvDate("")).toBeNull();
  });

  it("gives year-only and MM/YYYY versions", () => {
    expect(yearOf("Feb 2019")).toBe("2019");
    expect(monthYear("Dec 2024")).toBe("12/2024");
    expect(monthYear("2019")).toBe("");
    expect(monthYear("Present")).toBe("");
  });

  it("spots a current job", () => {
    expect(isCurrent("Present")).toBe(true);
    expect(isCurrent("till date")).toBe(true);
    expect(isCurrent("Nov 2024")).toBe(false);
  });

  it("splits and tidies names", () => {
    expect(splitName("Gaurav Vyas")).toEqual({ first: "Gaurav", middle: "", last: "Vyas" });
    expect(splitName("Ravi Kumar Sharma")).toEqual({ first: "Ravi", middle: "Kumar", last: "Sharma" });
    expect(splitName("Madonna")).toEqual({ first: "Madonna", middle: "", last: "" });
    expect(tidyName("GAURAV VYAS")).toBe("Gaurav Vyas");
    expect(tidyName("Ankit deSouza")).toBe("Ankit deSouza");
  });

  it("drops the country code from Indian phone numbers", () => {
    expect(localPhone("+91 63760 74920")).toBe("6376074920");
    expect(localPhone("063760 74920")).toBe("6376074920");
    expect(localPhone("63760-74920")).toBe("6376074920");
  });

  it("builds bullet blocks, skill lists and education lines", () => {
    expect(bulletBlock(["Built crawlers", " ", "Cut load time "])).toBe("• Built crawlers\n• Cut load time");
    const cv = emptyCv();
    cv.skills = [
      { category: "Languages", items: ["JavaScript", "SQL"] },
      { category: "Backend", items: ["Node.js", "javascript"] },
    ];
    expect(allSkills(cv)).toBe("JavaScript, SQL, Node.js");
    const edu = { institution: "University of East London", degree: "Master's degree", field: "Computer Science", startDate: "", endDate: "May 2023", grade: "" };
    expect(educationLine(edu)).toBe("Master's degree, Computer Science, University of East London (2023)");
    expect(educationLine({ ...edu, startDate: "Sep 2021" })).toContain("(2021–2023)");
  });
});
