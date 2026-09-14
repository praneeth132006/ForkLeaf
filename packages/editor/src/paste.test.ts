// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  detectLanguage,
  evenSpacing,
  isLinesOfText,
  isProseLine,
  isStructuredDocument,
  looksLikeCode,
} from "./paste";

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

  it("leaves a bulleted list copied off a web page alone, indented as its plain text is", () => {
    // What the browser puts on the clipboard for an article's <ul>: every item
    // indented, which used to read as four lines of code.
    const article = [
      "In software development, Security by Design works the same way. When creating an app, developers think about security right from the planning stage. This can include:",
      "",
      "    Threat modeling: Like imagining all the ways someone might break into your house, threat modeling helps developers figure out potential risks to the app early on.",
      "    Secure code reviews: After writing the code, developers carefully check it to make sure there are no weak spots, similar to inspecting the house’s foundation for cracks before finishing construction.",
      "\tServers and databases: These are like the land your house sits on and the water supply it uses. If they aren’t secure, the whole system is at risk.",
      "\tAuthentication and authorization: Think of these as high-quality locks on your doors. Authentication ensures only the right people can get in, while authorization makes sure they can only access the rooms (data) they’re allowed to.",
    ].join("\n");

    expect(looksLikeCode(article)).toBe(false);
  });

  it("leaves indented sentences that open with a keyword alone", () => {
    const notes = [
      "  if the build fails again we should roll back the release",
      "  for now keep the old importer running (just in case)",
      "  return the loaner laptop to Priya before the end of the week",
    ].join("\n");

    expect(looksLikeCode(notes)).toBe(false);
  });

  it("still knows indented code, and comments that read like sentences", () => {
    const python = [
      "# Work out which of the domains are still alive and worth a look",
      "def alive(domains):",
      "    return [d for d in domains if ping(d)]",
    ].join("\n");

    expect(looksLikeCode(python)).toBe(true);
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

describe("a line of writing", () => {
  it("knows a sentence, however it is indented", () => {
    expect(
      isProseLine("    Threat modeling: Like imagining all the ways someone might break in."),
    ).toBe(true);
  });

  it("does not take code or commands for one", () => {
    expect(isProseLine("    return [d for d in domains if ping(d)]")).toBe(false);
    expect(isProseLine('echo -e "${RED} [+] Launching subfinder ... ${RESET}"')).toBe(false);
    expect(isProseLine("const total = items.length;")).toBe(false);
    expect(isProseLine("amass enum -d tcm-sec.com")).toBe(false);
  });
});

describe("HTML that is already a document", () => {
  it("recognises lists, headings and quotes", () => {
    expect(
      isStructuredDocument("<ul><li><code>Threat modeling</code>: risks</li></ul>", parse),
    ).toBe(true);
    expect(isStructuredDocument("<h2>Setup</h2><p>one</p>", parse)).toBe(true);
    expect(isStructuredDocument("<blockquote>said so</blockquote>", parse)).toBe(true);
  });

  it("recognises paragraphs of prose", () => {
    const html = "<p>We agreed to ship the importer first and leave search until March.</p>";
    expect(isStructuredDocument(html, parse)).toBe(true);
  });

  it("leaves code, and one paragraph per command, to the code check", () => {
    expect(
      isStructuredDocument("<pre><code>const a = 1;</code></pre><ul><li>x</li></ul>", parse),
    ).toBe(false);
    expect(
      isStructuredDocument("<p>whois tcm-sec.com</p><p>subfinder -d tcm-sec.com</p>", parse),
    ).toBe(false);
    expect(isStructuredDocument("<div><span>const a = 1;</span></div>", parse)).toBe(false);
    const script = "<p># Use the first argument as the domain name</p><p>domain=$1</p>";
    expect(isStructuredDocument(script, parse)).toBe(false);
  });
});
