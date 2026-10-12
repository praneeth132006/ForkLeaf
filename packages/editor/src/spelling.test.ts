import { describe, expect, it } from "vitest";
import { findWords, matchCase, worthChecking } from "./spelling";

const words = (text: string) => findWords(text).map((entry) => entry.word);

describe("which words are checked", () => {
  it("finds the words of ordinary prose, with their offsets", () => {
    const found = findWords("Teh quick fox.");
    expect(found.map((entry) => entry.word)).toEqual(["Teh", "quick", "fox"]);
    expect(found[0]).toMatchObject({ from: 0, to: 3 });
    expect(found[2]).toMatchObject({ from: 10, to: 13 });
  });

  it("keeps apostrophes inside words and drops a closing quote", () => {
    expect(words("don't can’t 'quoted'")).toEqual(["don't", "can’t", "quoted"]);
  });

  it("leaves code, links and addresses alone", () => {
    expect(
      words(
        "See `consloe.log` and [[Somme notte]] at https://exmaple.com/pathh or [lnk](http://x.y/zz).",
      ),
    ).toEqual(["See", "and", "at", "or", "lnk"]);
  });

  it("leaves file names, paths, emails, tags and mentions alone", () => {
    expect(
      words("Edit notes.md in src/lib with me@exmaple.com for #todoo and @priyaa now"),
    ).toEqual(["Edit", "in", "with", "for", "and", "now"]);
  });

  it("leaves identifiers glued to digits alone", () => {
    expect(words("h2o v14 3rd mp3 the")).toEqual(["the"]);
  });

  it("skips acronyms, mixed case and single letters", () => {
    expect(worthChecking("NASA")).toBe(false);
    expect(worthChecking("GitHub")).toBe(false);
    expect(worthChecking("iPhone")).toBe(false);
    expect(worthChecking("camelCase")).toBe(false);
    expect(worthChecking("a")).toBe(false);
    expect(worthChecking("Recieve")).toBe(true);
    expect(worthChecking("recieve")).toBe(true);
  });

  it("reads letters from any alphabet", () => {
    expect(words("café naïve résumé")).toEqual(["café", "naïve", "résumé"]);
  });
});

describe("corrections keep the writer's case", () => {
  it("capitalises a correction for a capitalised word", () => {
    expect(matchCase("Teh", "the")).toBe("The");
  });

  it("keeps lower case lower", () => {
    expect(matchCase("recieve", "receive")).toBe("receive");
  });

  it("shouts back at a shouted word", () => {
    expect(matchCase("RECIEVE", "receive")).toBe("RECEIVE");
  });

  it("lets the dictionary's own capitals win", () => {
    expect(matchCase("english", "English")).toBe("English");
  });
});
