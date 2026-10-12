import { describe, expect, it } from "vitest";
import {
  buildExam,
  examFolders,
  examNote,
  examTitle,
  gradeAnswer,
  questionBank,
  summarise,
  type ExamNote,
} from "./exam";

const CELLS: ExamNote = {
  path: "biology/cells.md",
  title: "Cells",
  content: [
    "# Cells",
    "",
    "**Mitochondria** are the organelles that make ATP for the cell.",
    "",
    "## Photosynthesis",
    "",
    "Plants turn light into sugar inside the chloroplast. The light reactions split water and release oxygen.",
    "The Calvin cycle then uses ATP and NADPH to fix carbon dioxide into glucose over many steps.",
    "",
    "What powers the Calvin cycle? :: ATP and NADPH",
    "Where does the oxygen come from? :: Water",
    "",
    "## Tiny",
    "",
    "Too short to explain.",
  ].join("\n"),
};

const HISTORY: ExamNote = {
  path: "history/rome.md",
  title: "Rome",
  content: "When did Rome fall? :: 476",
};

describe("questionBank", () => {
  it("asks cards, definitions and sections with enough to explain", () => {
    const bank = questionBank([CELLS, HISTORY], null);
    expect(bank.map((question) => [question.kind, question.prompt])).toEqual([
      ["card", "What powers the Calvin cycle?"],
      ["card", "Where does the oxygen come from?"],
      ["define", "What does “Mitochondria” mean?"],
      ["explain", "Explain “Photosynthesis”, from Cells."],
      ["card", "When did Rome fall?"],
    ]);
    const define = bank.find((question) => question.kind === "define")!;
    expect(define.expected).toBe("Organelles that make ATP for the cell.");
    expect(bank[0]!.heading).toBe("Photosynthesis");
  });

  it("keeps to one folder", () => {
    expect(questionBank([CELLS, HISTORY], "history").map((question) => question.prompt)).toEqual([
      "When did Rome fall?",
    ]);
  });

  it("never asks about templates, the flashcard schedule or old exams", () => {
    expect(
      questionBank(
        [
          { ...HISTORY, path: "templates/card.md" },
          { ...HISTORY, path: "exams/old.md" },
          { ...HISTORY, path: "reviews/flashcards.md" },
        ],
        null,
      ),
    ).toEqual([]);
  });
});

describe("buildExam", () => {
  it("is the same paper for the same seed, and a different one for another", () => {
    const notes = Array.from({ length: 30 }, (_, i) => ({
      path: `deck/n${i}.md`,
      title: `N${i}`,
      content: `Question ${i}? :: Answer ${i}`,
    }));
    const first = buildExam(notes, { folder: null, count: 10, seed: 7 });
    expect(first).toHaveLength(10);
    expect(buildExam(notes, { folder: null, count: 10, seed: 7 })).toEqual(first);
    expect(buildExam(notes, { folder: null, count: 10, seed: 8 })).not.toEqual(first);
  });

  it("mixes in definitions and explanations when there are some", () => {
    const exam = buildExam([CELLS, HISTORY], { folder: null, count: 5, seed: 1 });
    expect(new Set(exam.map((question) => question.kind))).toEqual(
      new Set(["card", "define", "explain"]),
    );
  });

  it("asks only as many as there are", () => {
    expect(buildExam([HISTORY], { folder: null, count: 10, seed: 1 })).toHaveLength(1);
    expect(buildExam([], { folder: null, count: 10, seed: 1 })).toEqual([]);
  });
});

describe("gradeAnswer", () => {
  const [calvin] = questionBank([CELLS], null);
  const define = questionBank([CELLS], null).find((question) => question.kind === "define")!;
  const explain = questionBank([CELLS], null).find((question) => question.kind === "explain")!;

  it("marks a card the way typed flashcard review does", () => {
    expect(gradeAnswer(calvin!, "ATP and NADPH").verdict).toBe("right");
    expect(gradeAnswer(calvin!, "atp, nadph").verdict).toBe("right");
    expect(gradeAnswer(calvin!, "ATP and NADHP").verdict).toBe("partly");
    expect(gradeAnswer(calvin!, "glucose").verdict).toBe("wrong");
    expect(gradeAnswer(calvin!, "   ").verdict).toBe("skipped");
  });

  it("marks a definition by how much of its meaning came back", () => {
    expect(gradeAnswer(define, "organelles making ATP for the cell").verdict).toBe("right");
    expect(gradeAnswer(define, "they make energy").verdict).not.toBe("right");
  });

  it("marks an explanation like Explain it back, and names what was missed", () => {
    const full = gradeAnswer(
      explain,
      "Plants turn light into sugar in the chloroplast. Light reactions split water and release oxygen. The Calvin cycle uses ATP and NADPH to fix carbon dioxide into glucose in many steps.",
    );
    expect(full.verdict).toBe("right");

    const thin = gradeAnswer(explain, "Plants make sugar from light.");
    expect(thin.verdict).toBe("wrong");
    expect(thin.missing.length).toBeGreaterThan(0);
  });
});

describe("the results note", () => {
  const questions = questionBank([CELLS], null);
  const answers = ["ATP and NADPH", "", "organelles making ATP for the cell", "Plants make sugar."];
  const grades = questions.map((question, index) => gradeAnswer(question, answers[index]!));

  it("adds up a half for partly right", () => {
    expect(
      summarise([
        { verdict: "right", score: 1, missing: [] },
        { verdict: "partly", score: 0.5, missing: [] },
      ]),
    ).toMatchObject({
      points: 1.5,
      percent: 75,
    });
  });

  it("says the score, links every miss back to the notes, and lists every question", () => {
    const note = examNote({
      questions,
      answers,
      grades,
      folder: "biology",
      takenAt: "2026-10-12 14:05",
      minutesUsed: 6,
      minutesAllowed: 10,
    });
    expect(note).toContain("# Exam: biology");
    expect(note).toContain("**2 / 4 (50%)** · 2 right, 0 partly, 1 wrong, 1 skipped · 6 of 10 min");
    expect(note).toContain(
      "- [ ] [[biology/cells#Photosynthesis|Cells: Photosynthesis]]: Where does the oxygen come from?",
    );
    expect(note).toContain("### 2. Where does the oxygen come from? — — Skipped");
    expect(note).toContain("**Your answer:** _(none)_");
    expect(note).toContain("> Water");
  });

  it("names the note for the folder and time", () => {
    expect(examTitle({ folder: "biology/plants", takenAt: "2026-10-12 14:05" })).toBe(
      "2026-10-12 1405 plants exam",
    );
    expect(examTitle({ folder: null, takenAt: "2026-10-12 14:05" })).toBe(
      "2026-10-12 1405 Notebook exam",
    );
  });
});

describe("examFolders", () => {
  it("lists every folder holding notes, nested ones too", () => {
    expect(
      examFolders([
        "biology/cells.md",
        "biology/plants/leaf.md",
        "readme.md",
        "templates/x.md",
        "img/a.png",
      ]),
    ).toEqual(["biology", "biology/plants"]);
  });
});
