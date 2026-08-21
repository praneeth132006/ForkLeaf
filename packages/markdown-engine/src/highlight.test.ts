import { describe, expect, it } from "vitest";
import { markdownToHtml } from "./render";

/**
 * The point of loading lowlight's full set rather than its `common` bundle:
 * `common` is 37 languages, and everything outside it renders as flat text.
 */
describe("syntax highlighting", () => {
  it.each([
    ["python", "def greet(name):\n    return f'hi {name}'"],
    ["rust", 'fn main() { println!("x"); }'],
    ["sql", "SELECT id FROM users WHERE id = 1;"],
    // All outside highlight.js's `common` bundle.
    ["haskell", 'main :: IO ()\nmain = putStrLn "hi"'],
    ["elixir", "defmodule M do\n  def go, do: :ok\nend"],
    ["ocaml", 'let () = print_endline "hi"'],
  ])("highlights %s", (lang, code) => {
    const html = markdownToHtml("```" + lang + "\n" + code + "\n```");
    expect(html).toContain(`language-${lang}`);
    expect(html.match(/hljs-[a-z_]+/g) ?? []).not.toHaveLength(0);
  });

  it("leaves unlabelled blocks alone rather than guessing the language", () => {
    const html = markdownToHtml("```\njust some text\n```");
    expect(html.match(/hljs-[a-z_]+/g) ?? []).toHaveLength(0);
  });

  it("keeps highlight markup within the sanitiser's schema", () => {
    const html = markdownToHtml("```js\nconst a = 1; // <img src=x onerror=alert(1)>\n```");
    // The payload survives as escaped *text* inside the code block, which is
    // the correct outcome — it must not survive as a live element.
    expect(html).not.toContain("<img");
    expect(html).toContain("&#x3C;img");
    expect(html).toContain("hljs");
  });
});

/**
 * Highlighting in a colour.
 *
 * `==text==` carries no colour, so a second one has to be written some other
 * way. `<mark class="fl-hl-green">` is the form that degrades honestly: GitHub
 * renders a mark as a highlight, and anything showing raw HTML shows a tag
 * whose meaning is obvious.
 */
describe("coloured highlights", () => {
  it("renders the colour it was given", () => {
    const html = markdownToHtml('<mark class="fl-hl-green">done</mark>');

    expect(html).toContain('<mark class="fl-hl-green">done</mark>');
  });

  it("still renders the plain form as a plain highlight", () => {
    expect(markdownToHtml("==done==")).toContain("<mark>done</mark>");
  });

  it("refuses a class that is not one of ours", () => {
    const html = markdownToHtml('<mark class="fl-hl-chartreuse">x</mark>');

    expect(html).not.toContain("fl-hl-chartreuse");
    // The tag is dropped as the unparsed HTML it is; the words survive.
    expect(html).toContain("x");
  });

  it("does not open the door to other HTML", () => {
    const html = markdownToHtml('<mark class="fl-hl-green" onclick="alert(1)">x</mark>');

    expect(html).not.toContain("onclick");
  });
});
