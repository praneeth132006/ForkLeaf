"use client";

/**
 * Reading the words in a picture, on this device.
 *
 * Tesseract, compiled to WebAssembly, in a worker. Its files are served from
 * this app (`public/ocr`, copied at build time) and nothing about the picture
 * leaves the browser. The engine is loaded the first time it is needed and
 * kept for a minute after, so a run of photos is not a run of cold starts.
 */

export interface RecognisedLine {
  text: string;
  /** 0–100, Tesseract's own estimate. */
  confidence: number;
}

export interface Recognised {
  text: string;
  lines: RecognisedLine[];
  confidence: number;
}

/** What the recogniser is doing, for a progress bar. */
export interface OcrProgress {
  stage: "loading" | "reading";
  /** 0–1. */
  progress: number;
}

interface TesseractWorker {
  recognize: (image: Blob) => Promise<{
    data: {
      text: string;
      confidence: number;
      lines?: Array<{ text: string; confidence: number }>;
    };
  }>;
  terminate: () => Promise<unknown>;
}

let worker: Promise<TesseractWorker> | null = null;
let idle: ReturnType<typeof setTimeout> | null = null;
let listener: ((progress: OcrProgress) => void) | null = null;

const IDLE_MS = 60_000;

function start(): Promise<TesseractWorker> {
  worker ??= import("tesseract.js")
    .then(
      ({ createWorker }) =>
        createWorker("eng", 1 /* LSTM only: the engine shipped */, {
          workerPath: "/ocr/worker.min.js",
          corePath: "/ocr",
          langPath: "/ocr/lang",
          gzip: true,
          // Loaded from this origin, not wrapped in a blob: a blob worker would
          // inherit the page's script policy and be refused its WebAssembly.
          workerBlobURL: false,
          logger: (message: { status: string; progress: number }) => {
            const reading = message.status.startsWith("recognizing");
            listener?.({ stage: reading ? "reading" : "loading", progress: message.progress });
          },
        }) as unknown as Promise<TesseractWorker>,
    )
    .catch((error: unknown) => {
      worker = null;
      throw new Error(
        `The text reader could not start: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  return worker;
}

function release(): void {
  if (idle) clearTimeout(idle);
  idle = setTimeout(() => {
    const current = worker;
    worker = null;
    void current?.then((instance) => instance.terminate()).catch(() => {});
  }, IDLE_MS);
}

/** The text in a picture, line by line. */
export async function recognise(
  image: Blob,
  onProgress?: (progress: OcrProgress) => void,
): Promise<Recognised> {
  if (idle) clearTimeout(idle);
  listener = onProgress ?? null;
  try {
    const instance = await start();
    const { data } = await instance.recognize(image);
    const lines = (data.lines ?? [])
      .map((line) => ({ text: line.text.replace(/\s+$/, ""), confidence: line.confidence }))
      .filter((line) => line.text.trim());
    return {
      text: data.text,
      lines: lines.length > 0 ? lines : linesOf(data.text, data.confidence),
      confidence: data.confidence,
    };
  } finally {
    listener = null;
    release();
  }
}

function linesOf(text: string, confidence: number): RecognisedLine[] {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
    .map((line) => ({ text: line, confidence }));
}

/**
 * Matches the bullets slides and screenshots use: •, ●, ▪, –, -, *, o — and
 * the characters a recogniser most often reads a round bullet as: +, «, », ©.
 */
const BULLET = /^\s*(?:[•●▪◦‣∙·*+«»©–—-]|o(?=\s))\s+/;
const NUMBERED = /^\s*(\d{1,3})[.)]\s+/;

/**
 * Recognised text as Markdown.
 *
 * A recogniser returns the lines as they were laid out on the picture: a
 * paragraph broken wherever the column ended, words hyphenated across lines,
 * bullets drawn as "•". This joins a paragraph's lines back into one, mends
 * hyphenation, turns bullets into a list, and keeps blank lines as paragraph
 * breaks.
 */
export function structureText(text: string): string {
  const blocks: string[] = [];
  let paragraph: string[] = [];

  // Prose wraps where the column ends, so a line that runs most of the way
  // across belongs with the next. A short line — a slide's title, a line of an
  // address, the last line of a paragraph — ends where it ends.
  const widest = Math.max(
    0,
    ...text.split("\n").map((line) => line.replace(/\s+/g, " ").trim().length),
  );
  const wraps = (line: string) =>
    line.length >= widest * 0.6 || /[-,;:]$/.test(line) || /^[\p{Ll}]/u.test(line);

  const flush = () => {
    if (paragraph.length === 0) return;
    let joined = "";
    for (const line of paragraph) {
      if (!joined) joined = line;
      else if (/[\p{L}]-$/u.test(joined) && /^[\p{Ll}]/u.test(line)) {
        // "infor-" + "mation" → "information"
        joined = joined.slice(0, -1) + line;
      } else joined = `${joined} ${line}`;
    }
    blocks.push(joined);
    paragraph = [];
  };

  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) {
      flush();
      continue;
    }
    const bullet = BULLET.exec(raw);
    const numbered = NUMBERED.exec(raw);
    if (bullet || numbered) {
      flush();
      blocks.push(
        bullet
          ? `- ${raw.slice(bullet[0].length).trim()}`
          : `${numbered![1]}. ${raw.slice(numbered![0].length).trim()}`,
      );
      continue;
    }
    // A line that continues the bullet above it (it was wrapped).
    const last = blocks[blocks.length - 1];
    if (paragraph.length === 0 && last && /^(- |\d+\. )/.test(last) && /^[\p{Ll}]/u.test(line)) {
      blocks[blocks.length - 1] = `${last} ${line}`;
      continue;
    }
    const previous = paragraph[paragraph.length - 1];
    if (previous !== undefined && !wraps(previous) && !/^[\p{Ll}]/u.test(line)) flush();
    paragraph.push(line);
  }
  flush();

  // Consecutive list items stay together; everything else is its own paragraph.
  let out = "";
  blocks.forEach((block, index) => {
    if (index > 0) {
      const bothList = /^(- |\d+\. )/.test(block) && /^(- |\d+\. )/.test(blocks[index - 1]!);
      out += bothList ? "\n" : "\n\n";
    }
    out += block;
  });
  return out;
}
