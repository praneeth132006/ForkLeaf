import { describe, expect, it } from "vitest";
import { ranOutOfInput, readsInput } from "./runnable";

describe("readsInput", () => {
  it("spots a program that reads input, in every language that runs", () => {
    expect(readsInput("python", 'name = input("Name? ")')).toBe(true);
    expect(readsInput("py", "import sys\nfor line in sys.stdin:\n    print(line)")).toBe(true);
    expect(readsInput("bash", "read -p 'Name? ' name\necho $name")).toBe(true);
    expect(readsInput("sh", "while read line; do echo $line; done")).toBe(true);
    expect(
      readsInput("js", "const rl = require('readline').createInterface({ input: process.stdin })"),
    ).toBe(true);
    expect(readsInput("javascript", "const data = require('fs').readFileSync(0, 'utf8')")).toBe(
      true,
    );
  });

  it("leaves programs that do not read input alone", () => {
    expect(readsInput("python", "print('input is great')")).toBe(false);
    expect(readsInput("bash", "echo already done")).toBe(false);
    expect(readsInput("bash", "cat README.md")).toBe(false);
    expect(readsInput("ruby", "gets")).toBe(false);
    expect(readsInput(null, "input()")).toBe(false);
  });
});

describe("ranOutOfInput", () => {
  it("recognises a program that stopped for want of input", () => {
    expect(ranOutOfInput({ stderr: "EOFError: EOF when reading a line" })).toBe(true);
    expect(ranOutOfInput({ stderr: "NameError: name 'x' is not defined" })).toBe(false);
    expect(ranOutOfInput({ stderr: "" })).toBe(false);
  });
});
