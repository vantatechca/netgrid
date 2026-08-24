import { describe, it, expect } from "vitest";
import { parseHomepageSeoCsv } from "./homepage-seo-csv";

const HEADER =
  "domain,brand name,region / province / state,Country Code,Homepage Meta Title,Homepage Meta Description";

describe("parseHomepageSeoCsv", () => {
  it("parses quoted fields with embedded commas and periods", () => {
    const csv = [
      HEADER,
      'montrealpeptides.com,Montreal Peptides,Quebec,CA,Buy Peptides in Montreal,"Buy peptides in Montreal. Fast, secure, and reliable."',
    ].join("\n");

    const { rows, errors } = parseHomepageSeoCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([
      {
        domain: "montrealpeptides.com",
        brandName: "Montreal Peptides",
        region: "Quebec",
        countryCode: "CA",
        metaTitle: "Buy Peptides in Montreal",
        metaDescription: "Buy peptides in Montreal. Fast, secure, and reliable.",
      },
    ]);
  });

  it("lowercases the domain and uppercases the country code", () => {
    const csv = [HEADER, "OttawaPeptides.ca,Ottawa Peptides,Ontario,ca,Title,Description text here"].join("\n");
    const { rows } = parseHomepageSeoCsv(csv);
    expect(rows[0].domain).toBe("ottawapeptides.ca");
    expect(rows[0].countryCode).toBe("CA");
  });

  it("skips a row with a missing domain and reports it", () => {
    const csv = [HEADER, ",Brand,Ontario,CA,Title,Description"].join("\n");
    const { rows, errors } = parseHomepageSeoCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/missing domain/i);
  });

  it("skips a row where the meta title exceeds 70 characters", () => {
    const longTitle = "x".repeat(71);
    const csv = [HEADER, `site.ca,Brand,Ontario,CA,${longTitle},Description text here`].join("\n");
    const { rows, errors } = parseHomepageSeoCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/max 70/);
  });

  it("skips a row where the meta description exceeds 320 characters", () => {
    const longDesc = "x".repeat(321);
    const csv = [HEADER, `site.ca,Brand,Ontario,CA,Title,${longDesc}`].join("\n");
    const { rows, errors } = parseHomepageSeoCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/max 320/);
  });

  it("blanks an invalid country code but keeps the row", () => {
    const csv = [HEADER, "site.ca,Brand,Ontario,Canada,Title,Description text here"].join("\n");
    const { rows, errors } = parseHomepageSeoCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].countryCode).toBe("");
    expect(errors[0].message).toMatch(/isn't 2 letters/);
  });

  it("dedupes a repeated domain, keeping the first occurrence", () => {
    const csv = [
      HEADER,
      "site.ca,First Brand,Ontario,CA,First Title,First description here",
      "site.ca,Second Brand,Ontario,CA,Second Title,Second description here",
    ].join("\n");
    const { rows, errors } = parseHomepageSeoCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].brandName).toBe("First Brand");
    expect(errors.some((e) => /Duplicate domain/.test(e.message))).toBe(true);
  });

  it("reports missing expected columns instead of throwing", () => {
    const csv = ["domain,brand name", "site.ca,Brand"].join("\n");
    const { rows, errors } = parseHomepageSeoCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/Missing expected column/);
  });

  it("strips a UTF-8 BOM on the header line", () => {
    const csv = "﻿" + [HEADER, "site.ca,Brand,Ontario,CA,Title,Description text here"].join("\n");
    const { rows, errors } = parseHomepageSeoCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
  });
});
