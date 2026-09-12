import { describe, expect, it } from "vitest";
import { collectOpenTasks, dueState, findTasks, setTaskDone } from "./tasks";

describe("findTasks", () => {
  it("reads open and finished boxes, in any list marker", () => {
    const tasks = findTasks("- [ ] one\n* [x] two\n1. [X] three\n  + [ ] nested");
    expect(tasks.map((task) => [task.text, task.done, task.line])).toEqual([
      ["one", false, 0],
      ["two", true, 1],
      ["three", true, 2],
      ["nested", false, 3],
    ]);
  });

  it("ignores to-dos inside a code block", () => {
    const tasks = findTasks("```md\n- [ ] example\n```\n- [ ] real");
    expect(tasks.map((task) => task.text)).toEqual(["real"]);
  });

  it("does not close a ``` fence on a ~~~ line", () => {
    expect(findTasks("```\n~~~\n- [ ] still code\n```\n- [ ] real")).toHaveLength(1);
  });

  it("skips an empty box, which is a template's slot", () => {
    expect(findTasks("- [ ] \n- [ ]   ")).toEqual([]);
  });

  it("does not take a link that happens to look like a box", () => {
    expect(findTasks("[ ] not in a list\n- [link](x)")).toEqual([]);
  });

  it("reads a due date in either dialect", () => {
    const [a, b, c] = findTasks("- [ ] ship 📅 2026-09-14\n- [ ] pay due: 2026-10-01\n- [ ] later");
    expect([a!.due, b!.due, c!.due]).toEqual(["2026-09-14", "2026-10-01", null]);
  });
});

describe("setTaskDone", () => {
  it("changes only the box", () => {
    const content = "# Plan\n\n- [ ] write it 📅 2026-09-14\n- [ ] ship it";
    const [task] = findTasks(content);
    expect(setTaskDone(content, task!, true)).toBe(
      "# Plan\n\n- [x] write it 📅 2026-09-14\n- [ ] ship it",
    );
  });

  it("unticks", () => {
    const [task] = findTasks("- [x] done");
    expect(setTaskDone("- [x] done", task!, false)).toBe("- [ ] done");
  });

  it("follows a task that moved to another line", () => {
    const [task] = findTasks("- [ ] call Sam");
    expect(setTaskDone("new first line\n- [ ] call Sam", task!, true)).toBe(
      "new first line\n- [x] call Sam",
    );
  });

  it("refuses when the task is gone or ambiguous", () => {
    const [task] = findTasks("- [ ] call Sam");
    expect(setTaskDone("- [ ] call Alex", task!, true)).toBeNull();
    expect(setTaskDone("x\n- [ ] call Sam\n- [ ] call Sam", task!, true)).toBeNull();
  });
});

describe("collectOpenTasks", () => {
  const notes = [
    { path: "b.md", title: "B", content: "- [ ] no date" },
    { path: "a.md", title: "A", content: "- [x] finished" },
    { path: "c.md", title: "C", content: "- [ ] soon 📅 2026-09-20" },
    { path: "d.md", title: "D", content: "- [ ] sooner 📅 2026-09-13" },
    { path: "templates/daily.md", title: "Daily", content: "- [ ] water plants" },
  ];

  it("lists notes with open tasks, soonest due first, then by path", () => {
    const result = collectOpenTasks(notes, { exclude: (path) => path.startsWith("templates/") });
    expect(result.map((entry) => entry.path)).toEqual(["d.md", "c.md", "b.md"]);
  });
});

describe("dueState", () => {
  it("compares dates as days", () => {
    expect(dueState("2026-09-11", "2026-09-12")).toBe("overdue");
    expect(dueState("2026-09-12", "2026-09-12")).toBe("today");
    expect(dueState("2026-09-13", "2026-09-12")).toBe("later");
  });
});
