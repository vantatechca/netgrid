import { describe, it, expect } from "vitest";
import { parseCityAssignmentCsv } from "./city-assignment-csv";

describe("parseCityAssignmentCsv", () => {
  it("parses domain,city rows and lowercases the domain", () => {
    const csv = ["domain,city", "MontrealPeptides.com,Montreal", "ottawapeptides.ca,Ottawa"].join("\n");
    const { rows, errors } = parseCityAssignmentCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([
      { domain: "montrealpeptides.com", city: "Montreal" },
      { domain: "ottawapeptides.ca", city: "Ottawa" },
    ]);
  });

  it("handles a quoted city with a comma", () => {
    const csv = ["domain,city", 'site.ca,"Saint John, NB"'].join("\n");
    const { rows, errors } = parseCityAssignmentCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows[0].city).toBe("Saint John, NB");
  });

  it("skips a row with a missing city and reports it", () => {
    const csv = ["domain,city", "site.ca,"].join("\n");
    const { rows, errors } = parseCityAssignmentCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/missing city/i);
  });

  it("skips a row with a missing domain and reports it", () => {
    const csv = ["domain,city", ",Montreal"].join("\n");
    const { rows, errors } = parseCityAssignmentCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/missing domain/i);
  });

  it("skips a city longer than 120 characters", () => {
    const longCity = "x".repeat(121);
    const csv = ["domain,city", `site.ca,${longCity}`].join("\n");
    const { rows, errors } = parseCityAssignmentCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/max 120/);
  });

  it("dedupes a repeated domain, keeping the first occurrence", () => {
    const csv = ["domain,city", "site.ca,First", "site.ca,Second"].join("\n");
    const { rows, errors } = parseCityAssignmentCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].city).toBe("First");
    expect(errors.some((e) => /Duplicate domain/.test(e.message))).toBe(true);
  });

  it("reports missing expected columns instead of throwing", () => {
    const csv = ["domain,region", "site.ca,Ontario"].join("\n");
    const { rows, errors } = parseCityAssignmentCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/Missing expected column/);
  });
});
