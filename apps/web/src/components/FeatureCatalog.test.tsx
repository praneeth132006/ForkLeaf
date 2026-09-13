// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FeatureCatalog } from "./FeatureCatalog";
import { FEATURE_CATEGORIES, allFeatures, searchFeatures } from "@/lib/feature-catalog";

afterEach(cleanup);

describe("FeatureCatalog", () => {
  it("lists every feature under its category, with how to reach it", () => {
    render(<FeatureCatalog />);
    expect(screen.getByRole("status").textContent).toBe(`${allFeatures().length} features`);
    for (const category of FEATURE_CATEGORIES) {
      expect(screen.getByRole("heading", { level: 2, name: category.title })).toBeTruthy();
    }
    expect(screen.getByText("Type Question :: Answer, or / → Flashcard")).toBeTruthy();
  });

  it("links each category from the bar at the top", () => {
    render(<FeatureCatalog />);
    const nav = screen.getByRole("navigation", { name: "Categories" });
    expect(nav.querySelectorAll("a")).toHaveLength(FEATURE_CATEGORIES.length);
    expect(nav.querySelector('a[href="#papers"]')).toBeTruthy();
  });

  it("narrows to a search, and says when nothing matches", () => {
    render(<FeatureCatalog />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "flashcards" } });
    // Every feature that mentions flashcards — the card itself, and the / menu that offers them.
    const matching = searchFeatures("flashcards", null).flatMap((category) => category.features);
    expect(matching.length).toBeGreaterThan(0);
    expect(screen.getByRole("status").textContent).toBe(
      `${matching.length} of ${allFeatures().length} features`,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Flashcards" })).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "teleportation" } });
    expect(screen.getByText(/Nothing matches that yet/)).toBeTruthy();
  });

  it("shows only what is new when asked", () => {
    render(<FeatureCatalog />);
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    const fresh = allFeatures().filter((feature) => feature.tags?.includes("new"));
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(fresh.length);
  });
});
