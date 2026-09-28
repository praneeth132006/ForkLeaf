import { describe, expect, it, vi } from "vitest";
import { appendPhrase, createDictation, type RecognitionLike } from "./dictation";

/** A recognition double that records instances and lets a test drive them. */
function fakeRecognition() {
  const made: RecognitionLike[] = [];
  class Fake implements RecognitionLike {
    lang = "";
    interimResults = true;
    continuous = false;
    onresult: RecognitionLike["onresult"] = null;
    onerror: RecognitionLike["onerror"] = null;
    onend: RecognitionLike["onend"] = null;
    start = vi.fn();
    stop = vi.fn(() => this.onend?.());
    constructor() {
      made.push(this);
    }
  }
  const say = (instance: RecognitionLike, text: string, isFinal = true) =>
    instance.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript: text } }] });
  return { Fake, made, say };
}

describe("createDictation", () => {
  it("passes on finished phrases only, continuously, in the reader's language", () => {
    const { Fake, made, say } = fakeRecognition();
    const onText = vi.fn();
    const dictation = createDictation(Fake, { onText, onEnd: vi.fn() }, "en-GB");
    dictation.start();
    expect(made[0]).toMatchObject({ lang: "en-GB", continuous: true, interimResults: false });
    say(made[0]!, "osmosis moves", false);
    say(made[0]!, "osmosis moves water");
    expect(onText).toHaveBeenCalledOnce();
    expect(onText).toHaveBeenCalledWith("osmosis moves water");
  });

  it("keeps listening through a pause, and stops when asked", () => {
    const { Fake, made } = fakeRecognition();
    const onEnd = vi.fn();
    const dictation = createDictation(Fake, { onText: vi.fn(), onEnd });
    dictation.start();
    made[0]!.onend?.();
    expect(made).toHaveLength(2);
    expect(onEnd).not.toHaveBeenCalled();
    dictation.stop();
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("stops and says why when the microphone is refused, but not for silence", () => {
    const { Fake, made } = fakeRecognition();
    const onError = vi.fn();
    const onEnd = vi.fn();
    createDictation(Fake, { onText: vi.fn(), onEnd, onError }).start();
    made[0]!.onerror?.({ error: "no-speech" });
    expect(onError).not.toHaveBeenCalled();
    made[0]!.onerror?.({ error: "not-allowed" });
    made[0]!.onend?.();
    expect(onError).toHaveBeenCalledWith("not-allowed");
    expect(onEnd).toHaveBeenCalledOnce();
    expect(made).toHaveLength(1);
  });
});

describe("appendPhrase", () => {
  it("adds a capitalised, finished sentence after what is there", () => {
    expect(appendPhrase("", "water moves in")).toBe("Water moves in.");
    expect(appendPhrase("Water moves in.  ", "across a membrane!")).toBe(
      "Water moves in. Across a membrane!",
    );
    expect(appendPhrase("Kept", "  ")).toBe("Kept");
  });
});
