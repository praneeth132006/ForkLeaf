import { describe, expect, it } from "vitest";
import { MeaningIndex, type MeaningDoc } from "./meaning-index";

const doc = (id: string, title: string, text: string): MeaningDoc => ({
  id,
  workspaceId: "w",
  path: `${id}.md`,
  title,
  text,
});

// A small notebook where "churn" and "customers leaving" keep company in
// several notes, and one note uses only "churn".
const notebook = [
  doc(
    "a",
    "Retention",
    "Customers leaving after the trial is our churn problem. Churn rises when customers leave.",
  ),
  doc(
    "b",
    "Q3 review",
    "Churn went up; customers leaving cited price. Leaving customers want monthly billing.",
  ),
  doc(
    "c",
    "Pricing",
    "Customers leaving over price is churn we can fix with annual plans and churn offers.",
  ),
  doc("d", "Churn dashboard", "The churn dashboard tracks weekly churn by cohort and plan."),
  doc("e", "Garden", "Tomatoes need sun and water. Plant basil beside tomatoes for the garden."),
  doc("f", "Allotment", "Water the tomatoes daily in the garden; basil likes sun."),
];

describe("MeaningIndex", () => {
  it("finds a note by what it is about, without the words of the query in it", () => {
    const index = new MeaningIndex(notebook);
    const hits = index.search("customers leaving");
    const dashboard = hits.findIndex((hit) => hit.id === "d");
    const garden = hits.findIndex((hit) => hit.id === "e");
    expect(dashboard).toBeGreaterThanOrEqual(0);
    expect(garden === -1 || garden > dashboard).toBe(true);
  });

  it("keeps unrelated notes apart", () => {
    const hits = new MeaningIndex(notebook).search("tomatoes basil");
    expect(hits[0]?.id === "e" || hits[0]?.id === "f").toBe(true);
    expect(hits.map((hit) => hit.id)).not.toContain("d");
  });

  it("answers nothing for words it has never seen, and respects the workspace", () => {
    const index = new MeaningIndex(notebook);
    expect(index.search("quantum chromodynamics")).toEqual([]);
    expect(index.search("churn", { workspaceId: "other" })).toEqual([]);
    expect(index.size).toBe(6);
    expect(index.vocabulary).toBeGreaterThan(5);
  });
});
