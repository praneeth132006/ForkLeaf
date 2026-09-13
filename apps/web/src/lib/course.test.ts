// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { orderLessons, quizFrom, type LessonSource } from "./course";
import { inCourse, useCourseBridge } from "./course-bridge";

afterEach(cleanup);

const note = (path: string, content: string, title?: string): LessonSource => ({
  path,
  title: title ?? path.split("/").pop()!.replace(/\.md$/, ""),
  content,
});

const paths = (sources: readonly LessonSource[]) =>
  orderLessons(sources).map((lesson) => lesson.path);

describe("orderLessons", () => {
  it("teaches a note after the notes it links to", () => {
    expect(
      paths([
        note("bio/dna.md", "Genes live in [[cells]]."),
        note("bio/genetics.md", "Built from [[dna]]."),
        note("bio/cells.md", "The unit of life."),
      ]),
    ).toEqual(["bio/cells.md", "bio/dna.md", "bio/genetics.md"]);
  });

  it("starts with the index, in the order its links are written", () => {
    expect(
      paths([
        note("bio/a.md", "First topic."),
        note("bio/b.md", "Second topic."),
        note("bio/index.md", "Read [[b]], then [[a]]."),
      ]),
    ).toEqual(["bio/index.md", "bio/b.md", "bio/a.md"]);
  });

  it("reads markdown links to notes as well as wikilinks", () => {
    expect(
      paths([note("bio/b.md", "See [cells](a.md) first."), note("bio/a.md", "Cells.")]),
    ).toEqual(["bio/a.md", "bio/b.md"]);
  });

  it("gets out of a circle of links, the note more build on first", () => {
    expect(
      paths([note("c/x.md", "[[y]]"), note("c/y.md", "[[x]]"), note("c/z.md", "[[x]]")]),
    ).toEqual(["c/x.md", "c/y.md", "c/z.md"]);
  });

  it("brings each lesson's flashcards and what it builds on", () => {
    const [cells, dna] = orderLessons([
      note("bio/dna.md", "Uses [[cells]].\n\nDNA :: deoxyribonucleic acid"),
      note("bio/cells.md", "Cell :: the unit of life\nNucleus :: holds the DNA"),
    ]);
    expect(cells!.cards.map((card) => card.answer)).toEqual(["the unit of life", "holds the DNA"]);
    expect(dna!.buildsOn).toEqual(["bio/cells.md"]);
    expect(dna!.intro).toBe(false);
  });
});

describe("quizFrom", () => {
  const lessons = orderLessons([
    note("q/a.md", "A1 :: 1\nA2 :: 2\nA3 :: 3"),
    note("q/b.md", "B1 :: 1"),
  ]);

  it("takes a card from each lesson in turn, up to the limit", () => {
    const quiz = quizFrom(lessons, "2026-09-13", 3);
    expect(quiz.map((card) => card.path)).toEqual(["q/a.md", "q/b.md", "q/a.md"]);
  });

  it("asks the same set for the same seed, and never more cards than there are", () => {
    expect(quizFrom(lessons, "s")).toEqual(quizFrom(lessons, "s"));
    expect(quizFrom(lessons, "s", 10)).toHaveLength(4);
  });
});

describe("the course bridge", () => {
  it("counts subfolders in, and the top of the notebook as its own course", () => {
    expect(inCourse("bio/cells/membrane.md", "bio")).toBe(true);
    expect(inCourse("biology.md", "bio")).toBe(false);
    expect(inCourse("top.md", "")).toBe(true);
    expect(inCourse("bio/paper.highlights.md", "bio")).toBe(false);
  });

  it("loads a folder as lessons with titles, and a quiz", async () => {
    const store = {
      folders: () => ["bio", "chem"],
      allNotes: vi.fn(async () => [
        note("bio/dna.md", "Uses [[Cells]].\n\nDNA :: deoxyribonucleic acid", "DNA"),
        note("bio/cells.md", "Cell :: the unit of life", "Cells"),
        note("chem/water.md", "H2O :: water", "Water"),
      ]),
      openNote: vi.fn(),
      currentFolder: () => "bio",
    };
    const { result } = renderHook(() => useCourseBridge(store));
    const bridge = result.current!;

    expect(await bridge.folders()).toEqual(["bio", "chem"]);
    expect(bridge.currentFolder?.()).toBe("bio");
    const course = await bridge.load("bio");
    expect(course.lessons).toEqual([
      { path: "bio/cells.md", title: "Cells", cards: 1, buildsOn: [] },
      { path: "bio/dna.md", title: "DNA", cards: 1, buildsOn: ["Cells"] },
    ]);
    expect(course.quiz.map((question) => question.lesson).sort()).toEqual(["Cells", "DNA"]);
    bridge.open("bio/dna.md");
    expect(store.openNote).toHaveBeenCalledWith("bio/dna.md");
  });

  it("offers nothing without a notebook", () => {
    const { result } = renderHook(() => useCourseBridge(null));
    expect(result.current).toBeUndefined();
  });
});
