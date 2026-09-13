// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { VoiceNoteDialog, type VoiceMedia } from "./VoiceNoteDialog";

afterEach(cleanup);

beforeAll(() => {
  // jsdom has no object URLs.
  Object.assign(URL, { createObjectURL: vi.fn(() => "blob:recording"), revokeObjectURL: vi.fn() });
});

class FakeRecorder {
  static isTypeSupported = (type: string) => type === "audio/webm;codecs=opus";
  static last: FakeRecorder | null = null;
  state = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? "";
    FakeRecorder.last = this;
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["sound"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

class FakeSpeech {
  static last: FakeSpeech | null = null;
  continuous = false;
  interimResults = true;
  lang = "";
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  start = vi.fn(() => {
    FakeSpeech.last = this;
  });
  stop = vi.fn();
}

function media(over: Partial<VoiceMedia> = {}): VoiceMedia {
  const track = { stop: vi.fn() };
  return {
    getUserMedia: vi.fn(async () => ({ getTracks: () => [track] }) as unknown as MediaStream),
    MediaRecorder: FakeRecorder as unknown as typeof MediaRecorder,
    SpeechRecognition: null,
    ...over,
  };
}

function open(over: Partial<React.ComponentProps<typeof VoiceNoteDialog>> = {}) {
  const props = {
    onClose: vi.fn(),
    onSave: vi.fn(async () => {}),
    media: media(),
    now: () => new Date(2026, 8, 13, 9, 5),
    ...over,
  };
  render(<VoiceNoteDialog {...props} />);
  return props;
}

describe("VoiceNoteDialog", () => {
  it("records, plays back, and adds the recording to the note", async () => {
    const props = open();
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    await screen.findByRole("button", { name: "Stop" });
    expect(props.media!.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(FakeRecorder.last!.mimeType).toBe("audio/webm;codecs=opus");

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(await screen.findByLabelText("The recording")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add to note" }));
    await waitFor(() => expect(props.onSave).toHaveBeenCalled());
    const [file, seconds, transcript] = vi.mocked(props.onSave).mock.calls[0] as unknown as [
      File,
      number,
      string,
    ];
    expect(file.name).toBe("voice-note-2026-09-13-0905.webm");
    expect(file.type).toBe("audio/webm;codecs=opus");
    expect(seconds).toBeGreaterThanOrEqual(0);
    expect(transcript).toBe("");
  });

  it("lets a recording be thrown away and made again", async () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    fireEvent.click(await screen.findByRole("button", { name: "Record again" }));
    expect(screen.getByRole("button", { name: "Start recording" })).toBeTruthy();
  });

  it("explains a refused microphone", async () => {
    const denied = Object.assign(new Error("Permission denied"), { name: "NotAllowedError" });
    open({ media: media({ getUserMedia: vi.fn(async () => Promise.reject(denied)) }) });
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "not allowed to use the microphone",
    );
    expect(screen.getByRole("button", { name: "Start recording" })).toBeTruthy();
  });

  it("says when the browser cannot record at all", () => {
    open({ media: null });
    expect(screen.getByRole("alert").textContent).toContain("cannot record audio");
    expect(screen.queryByRole("button", { name: "Start recording" })).toBeNull();
  });

  it("offers a transcript only where there is speech recognition, off, and says where the audio goes", () => {
    open();
    expect(screen.queryByRole("checkbox")).toBeNull();
    cleanup();
    open({ media: media({ SpeechRecognition: FakeSpeech as never }) });
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(screen.getByText(/sends the audio to Google/)).toBeTruthy();
  });

  it("writes down what the speech recognition heard when asked to", async () => {
    const props = open({ media: media({ SpeechRecognition: FakeSpeech as never }) });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    await screen.findByRole("button", { name: "Stop" });
    act(() => {
      FakeSpeech.last!.onresult!({
        resultIndex: 0,
        results: [Object.assign([{ transcript: " remember the milk " }], { isFinal: true })],
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add to note" }));
    await waitFor(() => expect(props.onSave).toHaveBeenCalled());
    expect((vi.mocked(props.onSave).mock.calls[0] as unknown as [File, number, string])[2]).toBe(
      "remember the milk",
    );
  });

  it("keeps the recording when saving it fails", async () => {
    open({ onSave: vi.fn(async () => Promise.reject(new Error("Storage is full."))) });
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add to note" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Storage is full.");
    expect(screen.getByRole("button", { name: "Add to note" })).toBeTruthy();
  });
});
