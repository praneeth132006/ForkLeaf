import { describe, expect, it } from "vitest";
import { FEATURE_CATEGORIES, allFeatures, searchFeatures } from "./feature-catalog";

describe("the feature catalogue", () => {
  it("has unique ids across categories and features", () => {
    const categoryIds = FEATURE_CATEGORIES.map((category) => category.id);
    expect(new Set(categoryIds).size).toBe(categoryIds.length);
    const featureIds = allFeatures().map((feature) => feature.id);
    expect(new Set(featureIds).size).toBe(featureIds.length);
  });

  it("says, for every feature, what it is and how to reach it", () => {
    for (const feature of allFeatures()) {
      expect(feature.title.trim(), feature.id).not.toBe("");
      expect(feature.summary.length, feature.id).toBeGreaterThan(20);
      expect(feature.how.trim(), feature.id).not.toBe("");
    }
  });

  it("has no empty category", () => {
    for (const category of FEATURE_CATEGORIES) {
      expect(category.features.length, category.id).toBeGreaterThan(0);
    }
  });
});

describe("searchFeatures", () => {
  it("returns everything for an empty query", () => {
    expect(allFeatures(searchFeatures(""))).toHaveLength(allFeatures().length);
  });

  it("matches every word, across title, summary, how and category", () => {
    const found = allFeatures(searchFeatures("flashcards review"));
    expect(found.map((feature) => feature.id)).toEqual(["flashcards"]);
    expect(allFeatures(searchFeatures("PAPERS quote")).map((feature) => feature.id)).toContain(
      "quote",
    );
  });

  it("drops categories with nothing left, and filters by tag", () => {
    expect(searchFeatures("no feature is called this")).toEqual([]);
    const fresh = allFeatures(searchFeatures("", "new"));
    expect(fresh.length).toBeGreaterThan(5);
    expect(fresh.every((feature) => feature.tags?.includes("new"))).toBe(true);
  });
});
