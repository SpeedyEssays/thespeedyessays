import { describe, expect, it } from "vitest";
import {
  assignmentTypes,
  estimatePrice,
  formatOrderLength,
  lengthForAssignment,
  MAX_ORDER_PAGES,
  MAX_ORDER_SLIDES,
  MAX_ORDER_WORDS,
  parseOrderLength,
  PRESENTATION_TYPE,
  quoteLength,
} from "./pricing";

const base = { level: "undergraduate", deadline: "14d", pages: 1 } as const;

describe("order estimates", () => {
  it("keeps the existing writing price and deadline multiplier", () => {
    expect(estimatePrice({ ...base, deadline: "7d", pages: 3 })).toMatchObject({
      pages: 3,
      words: 825,
      perPage: 8.96,
      total: 26.88,
    });
  });

  it.each([
    ["writing", 8],
    ["editing", 6],
    ["proofreading", 5.2],
    ["revision", 6.4],
    ["humanizing", 6],
  ] as const)("applies the %s service rate", (service, price) => {
    expect(estimatePrice({ ...base, service }).total).toBe(price);
  });

  it.each([
    [1, 1],
    [100, 1],
    [275, 1],
    [276, 2],
    [550, 2],
    [551, 3],
  ])(
    "quotes %i words as %i billable pages and preserves the exact request",
    (words, pages) => {
      const quote = estimatePrice({
        ...base,
        ...quoteLength({ amount: String(words), unit: "words" }),
      });
      expect(quote).toMatchObject({ words, pages, total: pages * 8 });
    },
  );

  it("accepts large quantities and rejects invalid values", () => {
    expect(estimatePrice({ ...base, pages: 501 }).pages).toBe(501);
    expect(estimatePrice({ ...base, wordCount: MAX_ORDER_WORDS }).pages).toBe(
      MAX_ORDER_PAGES,
    );
    expect(parseOrderLength("", "words")).toBeUndefined();
    expect(parseOrderLength("1.5", "pages")).toBeUndefined();
    expect(parseOrderLength(MAX_ORDER_PAGES + 1, "pages")).toBeUndefined();
    expect(formatOrderLength(1, 100)).toBe("100 words (1 billable page)");
  });

  it("prices a large presentation by slide and keeps its unit on the order", () => {
    const length = lengthForAssignment(PRESENTATION_TYPE, {
      unit: "pages",
      amount: "600",
    });
    expect(length).toEqual({ unit: "slides", amount: "600" });
    expect(estimatePrice({ ...base, ...quoteLength(length) })).toMatchObject({
      slideCount: 600,
      pages: 0,
      perSlide: 4.8,
      total: 2880,
    });
    expect(
      estimatePrice({
        ...base,
        deadline: "7d",
        ...quoteLength(length),
      }),
    ).toMatchObject({ perSlide: 5.38, total: 3228 });
    expect(
      estimatePrice({
        ...base,
        service: "proofreading",
        slideCount: 1,
      }).total,
    ).toBe(3.12);
    expect(formatOrderLength(0, null, 600)).toBe("600 slides");
    expect(parseOrderLength(MAX_ORDER_SLIDES, "slides")).toBe(MAX_ORDER_SLIDES);
    expect(parseOrderLength(MAX_ORDER_SLIDES + 1, "slides")).toBeUndefined();
    expect(lengthForAssignment("Essay", length)).toEqual({
      unit: "pages",
      amount: "600",
    });
  });

  it("includes the new formats and retains legacy assignment values", () => {
    expect(assignmentTypes).toEqual(
      expect.arrayContaining([
        "Essay",
        "Admission Essay",
        "Dissertation Chapter",
        "Dissertation / Thesis",
        "Presentation / Slides",
        "Abstract Page",
        "1-Page Summary",
        "Book Review",
        "Multiple-Choice Questions / Quizzes",
        "Problems (Math, Physics, etc.)",
      ]),
    );
    expect(new Set(assignmentTypes).size).toBe(assignmentTypes.length);
  });
});
