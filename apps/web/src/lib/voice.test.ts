import { describe, expect, it } from "vitest";
import { markdownToHtml } from "@forkleaf/markdown-engine";
import {
  MAX_RECORDING_SECONDS,
  formatDuration,
  pickRecordingType,
  recordingFileName,
  voiceNoteMarkdown,
} from "./voice";

describe("pickRecordingType", () => {
  it("takes the best format the browser supports", () => {
    expect(pickRecordingType(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickRecordingType((type) => type === "audio/mp4")).toBe("audio/mp4");
  });

  it("lets the browser choose when it supports none of them, or throws when asked", () => {
    expect(pickRecordingType(() => false)).toBe("");
    expect(
      pickRecordingType(() => {
        throw new Error("not supported");
      }),
    ).toBe("");
  });
});

describe("formatDuration", () => {
  it("writes minutes and seconds, and hours when there are some", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(151.9)).toBe("2:31");
    expect(formatDuration(MAX_RECORDING_SECONDS)).toBe("10:00");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(-4)).toBe("0:00");
  });
});

describe("recordingFileName", () => {
  it("names the file for when it was recorded, in the format it was recorded in", () => {
    const at = new Date(2026, 8, 13, 9, 5);
    expect(recordingFileName(at, "audio/webm;codecs=opus")).toBe("voice-note-2026-09-13-0905.webm");
    expect(recordingFileName(at, "audio/mp4")).toBe("voice-note-2026-09-13-0905.m4a");
    expect(recordingFileName(at, "")).toBe("voice-note-2026-09-13-0905.webm");
  });
});

describe("voiceNoteMarkdown", () => {
  const recordedAt = new Date(2026, 8, 13, 9, 5);

  it("writes a heading line and the link on its own, so the preview plays it", () => {
    const markdown = voiceNoteMarkdown({ src: "assets/voice-note.webm", seconds: 151, recordedAt });
    expect(markdown).toBe(
      "**Voice note** · September 13 at 9:05 AM · 2:31\n\n[Listen to the recording](assets/voice-note.webm)\n",
    );
    expect(markdownToHtml(markdown)).toContain("<audio");
  });

  it("quotes a transcript underneath, line by line", () => {
    const markdown = voiceNoteMarkdown({
      src: "assets/v.webm",
      seconds: 5,
      recordedAt,
      transcript: "  remember the milk \n\n call the bank ",
    });
    expect(markdown.endsWith("> remember the milk\n> call the bank\n")).toBe(true);
  });

  it("escapes characters in the path that would end the link", () => {
    const markdown = voiceNoteMarkdown({
      src: "My Notes/assets/v (1).webm",
      seconds: 5,
      recordedAt,
    });
    expect(markdown).toContain("(My%20Notes/assets/v%20%281%29.webm)");
  });
});
