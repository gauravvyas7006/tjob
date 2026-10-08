import { describe, expect, it } from "vitest";
import { profileFieldFor } from "./autofill-fields";

describe("profileFieldFor", () => {
  it.each([
    ["What is your notice period?", "noticePeriod"],
    ["Current CTC (in LPA)", "currentCtc"],
    ["Expected CTC", "expectedCtc"],
    ["Total experience (in years)", "totalExperience"],
    ["Years of experience", "totalExperience"],
    ["How many years of work experience do you have?", "totalExperience"],
    ["Current location", "location"],
    ["Preferred locations", "preferredLocations"],
    ["Mobile phone number", "phone"],
    ["LinkedIn Profile", "linkedinUrl"],
    ["Email address", "email"],
    ["Full name", "fullName"],
  ])("%s → %s", (label, field) => {
    expect(profileFieldFor(label)).toBe(field);
  });

  it.each([
    "How many years of experience do you have with Java?",
    "Years of experience in Spring Boot",
    "Are you willing to relocate?",
    "Do you have experience using Kafka?",
  ])("leaves skill/other questions for saved answers or AI: %s", (label) => {
    expect(profileFieldFor(label)).toBeNull();
  });
});
