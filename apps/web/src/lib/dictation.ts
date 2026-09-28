/**
 * Continuous dictation, from the browser's own speech recognition.
 *
 * Explaining a note back is a better test said aloud than typed: typing lets
 * you pause, look away and polish, while speaking is closer to how you would
 * actually explain it to someone. The words are recognised by the browser —
 * on some browsers that means the audio goes to the browser maker's speech
 * service, which the explain page says before it listens.
 *
 * Only finished phrases are passed on, each once, so the text box never fills
 * with half-heard guesses that are then corrected under the cursor.
 */

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}

export interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export type RecognitionConstructor = new () => RecognitionLike;

export interface Dictation {
  start: () => void;
  stop: () => void;
}

/** The browser's recognition, or null where there is none (Firefox, most WebViews). */
export function browserRecognition(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const found = ((window as unknown as Record<string, unknown>).SpeechRecognition ??
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as
    RecognitionConstructor | undefined;
  return typeof found === "function" ? found : null;
}

export function createDictation(
  Recognition: RecognitionConstructor,
  handlers: {
    /** A finished phrase. */
    onText: (text: string) => void;
    /** Listening stopped, by `stop()` or on its own. */
    onEnd: () => void;
    /** Why it could not listen: "not-allowed", "no-speech", … */
    onError?: (reason: string) => void;
  },
  lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US",
): Dictation {
  let recognition: RecognitionLike | null = null;
  let wanted = false;

  const begin = () => {
    const next = new Recognition();
    recognition = next;
    next.lang = lang;
    next.continuous = true;
    next.interimResults = false;
    next.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]!;
        const text = result[0].transcript.trim();
        if (result.isFinal && text) handlers.onText(text);
      }
    };
    next.onerror = (event) => {
      // Silence is not an error worth stopping for; being refused is.
      if (event.error === "no-speech" || event.error === "aborted") return;
      wanted = false;
      handlers.onError?.(event.error);
    };
    next.onend = () => {
      // Browsers end a "continuous" session after a pause; carry on until asked to stop.
      if (wanted) {
        try {
          begin();
          return;
        } catch {
          wanted = false;
        }
      }
      recognition = null;
      handlers.onEnd();
    };
    next.start();
  };

  return {
    start: () => {
      if (wanted) return;
      wanted = true;
      begin();
    },
    stop: () => {
      wanted = false;
      recognition?.stop();
    },
  };
}

/** A phrase added to what has been written so far, with one space and a capital. */
export function appendPhrase(written: string, phrase: string): string {
  const clean = phrase.trim();
  if (!clean) return written;
  const sentence = clean.charAt(0).toUpperCase() + clean.slice(1);
  const ended = /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
  const before = written.replace(/\s+$/, "");
  return before ? `${before} ${ended}` : ended;
}
