// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildBook, type BookNote } from "./book";
import { COURSE_SCRIPT } from "./course";

const note = (path: string, markdown = "Body.", title?: string): BookNote => ({
  path,
  title: title ?? path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, ""),
  markdown,
  frontmatter: {},
});

const notes = [
  note("course/01-intro.md", "Welcome.", "Introduction"),
  note("course/quiz.md", "A note that happens to be called quiz.", "Quiz notes"),
  note("course/02-cells.md", "Cells <script>alert(1)</script>.", "Cells"),
];

const quiz = [
  { question: "What makes ATP?", answer: "Mitochondria", notePath: "course/02-cells.md" },
  { question: "Is 1 < 2 & true?", answer: "Yes <b>really</b>", notePath: "course/01-intro.md" },
];

const fileAt = (files: { path: string; content: string }[], path: string) =>
  files.find((file) => file.path === path)?.content ?? "";

async function course() {
  return buildBook(notes, {
    title: "Biology 101",
    theme: "light",
    renderDiagrams: false,
    course: { key: "acme/notes:biology", quiz },
  });
}

/** Loads a built page into this document and runs its course script, as a browser would. */
function open(html: string) {
  document.open();
  document.write(html.replace(/<script>[\s\S]*?<\/script>/g, ""));
  document.close();
  new Function(COURSE_SCRIPT)();
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  document.body.innerHTML = "";
});

describe("a book published as a course", () => {
  it("calls its chapters lessons, and keeps the quiz page's name free", async () => {
    const built = await course();
    expect(built.chapters.map((chapter) => chapter.slug)).toEqual([
      "01-intro",
      "quiz-2",
      "02-cells",
    ]);
    const lesson = fileAt(built.files, "02-cells.html");
    expect(lesson).toContain("Lesson 3 of 3");
    expect(lesson).toContain('data-lesson="02-cells"');
    expect(lesson).toContain('id="course-config"');
    expect(fileAt(built.files, "index.html")).toContain("3 lessons");
    expect(fileAt(built.files, "index.html")).toContain('href="quiz.html"');
  });

  it("writes a quiz page with every card, escaped, pointing at its lesson", async () => {
    const page = fileAt((await course()).files, "quiz.html");
    expect(page).toContain("2 questions from the lessons");
    expect(page).toContain("What makes ATP?");
    expect(page).toContain("Is 1 &lt; 2 &amp; true?");
    expect(page).toContain("Yes &lt;b&gt;really&lt;/b&gt;");
    expect(page).toContain('data-lesson="02-cells" data-lesson-title="Cells"');
  });

  it("changes nothing about a plain book", async () => {
    const built = await buildBook(notes, {
      title: "Biology",
      theme: "light",
      renderDiagrams: false,
    });
    expect(built.chapters.map((chapter) => chapter.slug)).toContain("quiz");
    // The note called quiz.md keeps its address in a book; only a course needs it.
    expect(fileAt(built.files, "quiz.html")).toContain("Quiz notes");
    expect(fileAt(built.files, "quiz.html")).not.toContain("course-quiz");
    expect(fileAt(built.files, "01-intro.html")).not.toContain("course-config");
    expect(fileAt(built.files, "01-intro.html")).toContain("Chapter 1 of 3");
  });

  it("keeps the config safe inside its script element", async () => {
    const built = await buildBook(notes, {
      title: "x",
      theme: "light",
      renderDiagrams: false,
      course: { key: "</script><script>alert(1)</script>", quiz: [] },
    });
    const page = fileAt(built.files, "01-intro.html");
    expect(page).not.toContain("</script><script>alert(1)");
    expect(page).toContain("\\u003c/script>");
  });
});

describe("the course script, in a browser", () => {
  it("ticks a lesson off, remembers it, and shows progress everywhere", async () => {
    const built = await course();
    open(fileAt(built.files, "02-cells.html"));
    const button = document.querySelector<HTMLButtonElement>(".course-done")!;
    expect(document.querySelector(".course-progress-label")!.textContent).toBe(
      "0 of 3 lessons done",
    );

    button.click();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".course-progress-label")!.textContent).toBe(
      "1 of 3 lessons done",
    );
    expect(JSON.parse(window.localStorage.getItem("forkleaf-course:acme/notes:biology")!)).toEqual([
      "02-cells",
    ]);

    open(fileAt(built.files, "index.html"));
    expect(
      document.querySelector('[data-toc-lesson="02-cells"]')!.classList.contains("is-done"),
    ).toBe(true);
    expect(
      document.querySelector('[data-toc-lesson="01-intro"]')!.classList.contains("is-done"),
    ).toBe(false);
  });

  it("says the course is complete when every lesson is done", async () => {
    window.localStorage.setItem(
      "forkleaf-course:acme/notes:biology",
      JSON.stringify(["01-intro", "quiz-2", "02-cells"]),
    );
    open(fileAt((await course()).files, "index.html"));
    expect(document.querySelector(".course-progress-label")!.textContent).toBe(
      "Course complete — every lesson done",
    );
  });

  it("scores the quiz and lists the lessons to go over again", async () => {
    open(fileAt((await course()).files, "quiz.html"));
    const cards = document.querySelectorAll(".quiz-card");
    const grade = (index: number, value: "1" | "0") => {
      const details = cards[index]!.querySelector("details")!;
      details.open = true;
      details.dispatchEvent(new Event("toggle"));
      cards[index]!.querySelector<HTMLButtonElement>(`button[data-grade="${value}"]`)!.click();
    };
    grade(0, "0");
    expect(document.querySelector<HTMLElement>(".quiz-result")!.hidden).toBe(true);
    grade(1, "1");

    const result = document.querySelector<HTMLElement>(".quiz-result")!;
    expect(result.hidden).toBe(false);
    expect(result.querySelector(".quiz-score")!.textContent).toBe("You knew 1 of 2");
    const link = result.querySelector<HTMLAnchorElement>(".quiz-revisit a")!;
    expect(link.textContent).toBe("Cells");
    expect(link.getAttribute("href")).toBe("02-cells.html");

    result.querySelector<HTMLButtonElement>(".quiz-again")!.click();
    expect(result.hidden).toBe(true);
  });

  it("still works when the browser refuses storage", async () => {
    const original = window.localStorage.getItem;
    Object.defineProperty(window.localStorage, "getItem", {
      configurable: true,
      value: () => {
        throw new Error("blocked");
      },
    });
    try {
      open(fileAt((await course()).files, "01-intro.html"));
      document.querySelector<HTMLButtonElement>(".course-done")!.click();
      expect(document.querySelector(".course-progress-label")!.textContent).toBe(
        "1 of 3 lessons done",
      );
    } finally {
      Object.defineProperty(window.localStorage, "getItem", {
        configurable: true,
        value: original,
      });
    }
  });
});
