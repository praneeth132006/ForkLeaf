/**
 * Decision notes: a question, the options, their pros and cons, and what was chosen.
 *
 * Kept as a few readable lines in a ```decision block, so the note says the
 * same thing on github.com as it does here:
 *
 *     question: Which database?
 *     option: Postgres
 *     + mature (3)
 *     - more to run (2)
 *     option: SQLite
 *     + simple (2)
 *     chosen: Postgres
 *     history:
 *     - 2026-09-13: chose Postgres (1), over SQLite (2)
 *
 * A pro or con weighs 1 to 3; an option scores its pros less its cons. Choosing
 * adds a line to the history, so a decision changed later keeps its past.
 */

export interface Point {
  text: string;
  weight: 1 | 2 | 3;
}

export interface DecisionOption {
  name: string;
  pros: Point[];
  cons: Point[];
}

export interface Decision {
  question: string;
  options: DecisionOption[];
  chosen: string;
  history: string[];
}

const WEIGHT = /\s*\(([123])\)\s*$/;

export const emptyDecision = (): Decision => ({
  question: "",
  options: [
    { name: "Option A", pros: [], cons: [] },
    { name: "Option B", pros: [], cons: [] },
  ],
  chosen: "",
  history: [],
});

function point(text: string): Point {
  const weight = WEIGHT.exec(text);
  return {
    text: text.replace(WEIGHT, "").trim(),
    weight: weight ? (Number(weight[1]) as 1 | 2 | 3) : 1,
  };
}

export function parseDecision(text: string): Decision {
  const decision: Decision = { question: "", options: [], chosen: "", history: [] };
  let inHistory = false;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const field = /^(question|option|chosen|history)\s*:\s*(.*)$/i.exec(line);
    if (field) {
      const name = field[1]!.toLowerCase();
      const value = field[2]!.trim();
      inHistory = name === "history";
      if (name === "question") decision.question = value;
      else if (name === "option") decision.options.push({ name: value, pros: [], cons: [] });
      else if (name === "chosen") decision.chosen = value;
      continue;
    }
    if (inHistory) {
      if (line.startsWith("- ")) decision.history.push(line.slice(2).trim());
      continue;
    }
    const option = decision.options[decision.options.length - 1];
    if (!option) continue;
    if (line.startsWith("+ ")) option.pros.push(point(line.slice(2)));
    else if (line.startsWith("- ")) option.cons.push(point(line.slice(2)));
  }
  return decision;
}

const oneLine = (text: string) => text.replace(/\s*\n\s*/g, " ").trim();

export function formatDecision(decision: Decision): string {
  const lines = [`question: ${oneLine(decision.question)}`];
  for (const option of decision.options) {
    lines.push(`option: ${oneLine(option.name)}`);
    for (const pro of option.pros) lines.push(`+ ${oneLine(pro.text)} (${pro.weight})`);
    for (const con of option.cons) lines.push(`- ${oneLine(con.text)} (${con.weight})`);
  }
  if (decision.chosen) lines.push(`chosen: ${oneLine(decision.chosen)}`);
  if (decision.history.length > 0) {
    lines.push("history:", ...decision.history.map((entry) => `- ${oneLine(entry)}`));
  }
  return lines.join("\n");
}

export const scoreOf = (option: DecisionOption) =>
  option.pros.reduce((sum, pro) => sum + pro.weight, 0) -
  option.cons.reduce((sum, con) => sum + con.weight, 0);

/** The option with the highest score, or null when there is a tie at the top. */
export function leading(decision: Decision): DecisionOption | null {
  const ranked = [...decision.options].sort((a, b) => scoreOf(b) - scoreOf(a));
  if (ranked.length === 0) return null;
  if (ranked.length > 1 && scoreOf(ranked[0]!) === scoreOf(ranked[1]!)) return null;
  return ranked[0]!;
}

/** The decision with `name` chosen on `date`, and a history line saying so. */
export function choose(decision: Decision, name: string, date: string): Decision {
  const option = decision.options.find((each) => each.name === name);
  if (!option) return decision;
  const others = decision.options
    .filter((each) => each !== option)
    .map((each) => `${each.name} (${scoreOf(each)})`);
  const verb = decision.chosen && decision.chosen !== name ? `changed to ${name}` : `chose ${name}`;
  const entry = `${date}: ${verb} (${scoreOf(option)})${others.length ? `, over ${others.join(", ")}` : ""}`;
  return { ...decision, chosen: name, history: [...decision.history, entry] };
}
