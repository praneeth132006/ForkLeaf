// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { detectLanguage, evenSpacing, isLinesOfText, looksLikeCode } from "./paste";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

/**
 * The paste that started this: a bash script and the list of commands above
 * it, copied out of a notes app.
 */
const SCRIPT = `#!/bin/bash
# Use the first argument as the domain name

domain=$1

# Define directories
base_dir="$domain"
info_path="$base_dir/info"

for path in "$info_path" "$subdomain_path"; do
        if [ ! -d "$path" ]; then
                mkdir -p "$path"
        fi
done

echo -e "\${RED} [+] Launching subfinder ... \${RESET}"
subfinder -d "$domain" > "$subdomain_path/found.txt"`;

const COMMANDS = `whois tcm-sec.com
subfinder -d tcm-sec.com
assetfinder tcm-sec.com
amass enum -d tcm-sec.com
cat tesla.txt | sort -u | httprobe -s -p https:443
gowitness file -f ./alive.txt -P ./pics --no-http`;

describe("telling code from writing", () => {
  it("knows a script", () => {
    expect(looksLikeCode(SCRIPT)).toBe(true);
  });

  it("knows a list of shell commands, which is the most common paste of all", () => {
    expect(looksLikeCode(COMMANDS)).toBe(true);
  });

  it("knows a short list of commands, where half the lines are bare words", () => {
    const short = [
      "whois tcm-sec.com",
      "subfinder -d tcm-sec.com",
      "assetfinder tcm-sec.com",
      "cat tesla.txt | sort -u",
    ].join("\n");

    expect(looksLikeCode(short)).toBe(true);
  });

  it("knows JavaScript", () => {
    expect(looksLikeCode("const total = items.length;\nconsole.log(total);")).toBe(true);
  });

  it("knows Python", () => {
    expect(looksLikeCode("import os\n\ndef main():\n    print(os.getcwd())")).toBe(true);
  });

  it("does not take short lowercase notes for commands without shell punctuation", () => {
    const notes = ["ring the bank", "book the flights", "email priya"].join("\n");
    expect(looksLikeCode(notes)).toBe(false);
  });

  it("leaves ordinary writing alone", () => {
    const prose = [
      "Met the team about the migration today.",
      "We agreed to ship the importer first and leave search until March.",
      "Priya is writing up the API contract.",
    ].join("\n");

    expect(looksLikeCode(prose)).toBe(false);
  });

  it("leaves a list of links alone", () => {
    const links = [
      "Subfinder - https://github.com/projectdiscovery/subfinder",
      "Assetfinder - https://github.com/tomnomnom/assetfinder",
      "Amass - https://github.com/OWASP/Amass",
    ].join("\n");

    expect(looksLikeCode(links)).toBe(false);
  });

  it("leaves a markdown document alone, fences and all", () => {
    const document = ["# Setup", "", "- install the tools", "- run the script", ""].join("\n");

    expect(looksLikeCode(document)).toBe(false);
    expect(looksLikeCode("Here is the fix:\n\n```js\nconst a = 1;\n```")).toBe(false);
  });

  it("never turns a single line into a code block", () => {
    // Sentences have brackets in them, and one line is not a program.
    expect(looksLikeCode("Call Priya (she has the keys) before Friday.")).toBe(false);
    expect(looksLikeCode("npm install")).toBe(false);
  });
});

describe("which language it is", () => {
  it("reads the shebang", () => {
    expect(detectLanguage(SCRIPT)).toBe("bash");
    expect(detectLanguage("#!/usr/bin/env python3\nprint(1)")).toBe("python");
    expect(detectLanguage("#!/usr/bin/env node\nconsole.log(1)")).toBe("javascript");
  });

  it("recognises a run of shell commands with no shebang at all", () => {
    expect(detectLanguage(COMMANDS)).toBe("bash");
  });

  it("recognises the languages people paste", () => {
    expect(detectLanguage("const a = 1;\nfunction go() {\n  return a;\n}")).toBe("javascript");
    expect(detectLanguage("interface Note {\n  title: string;\n}")).toBe("typescript");
    expect(detectLanguage("def main():\n    return 1")).toBe("python");
    expect(detectLanguage("package main\n\nfunc main() {\n}")).toBe("go");
    expect(detectLanguage("fn main() {\n    let mut x = 1;\n}")).toBe("rust");
    expect(detectLanguage("SELECT id FROM notes WHERE id = 3;")).toBe("sql");
    expect(detectLanguage("FROM node:20\nRUN npm ci")).toBe("dockerfile");
    expect(detectLanguage('{"a": [1, 2], "b": null}')).toBe("json");
    expect(detectLanguage("name: build\non: push\njobs: {}")).toBe("yaml");
  });

  it("says nothing rather than guessing", () => {
    expect(detectLanguage("one two three\nfour five six")).toBe("");
  });
});

describe("evening out the spacing", () => {
  it("collapses a run of blank lines to a single paragraph break", () => {
    expect(evenSpacing("one\n\n\n\ntwo")).toBe("one\n\ntwo");
  });

  it("drops trailing spaces and the blank lines around the whole paste", () => {
    expect(evenSpacing("\n\none   \ntwo\n\n\n")).toBe("one\ntwo");
  });

  it("normalises Windows line endings", () => {
    expect(evenSpacing("one\r\ntwo")).toBe("one\ntwo");
  });
});

describe("HTML that is only lines of text", () => {
  it("recognises one paragraph per line, which is what notes apps write", () => {
    const html = "<p>whois tcm-sec.com</p><p>subfinder -d tcm-sec.com</p><p>amass enum</p>";
    expect(isLinesOfText(html, parse)).toBe(true);
  });

  it("keeps out of the way of real structure", () => {
    expect(isLinesOfText("<h1>Title</h1><p>one</p><p>two</p>", parse)).toBe(false);
    expect(isLinesOfText("<ul><li>one</li><li>two</li></ul>", parse)).toBe(false);
    expect(isLinesOfText("<p>one</p><table><tr><td>x</td></tr></table>", parse)).toBe(false);
    expect(isLinesOfText("<pre><code>const a = 1;</code></pre>", parse)).toBe(false);
  });

  it("keeps out of the way of prose, which is paragraphs and means to be", () => {
    const paragraph = `<p>${"word ".repeat(40)}</p><p>${"word ".repeat(40)}</p>`;
    expect(isLinesOfText(paragraph, parse)).toBe(false);
  });

  it("refuses when a link would lose its label", () => {
    const labelled = '<p>see <a href="https://example.com/docs">the docs</a></p><p>then run it</p>';
    expect(isLinesOfText(labelled, parse)).toBe(false);
  });

  it("allows a bare address, which the plain text carries just as well", () => {
    const bare = '<p><a href="https://example.com">https://example.com</a></p><p>next line</p>';
    expect(isLinesOfText(bare, parse)).toBe(true);
  });
});
