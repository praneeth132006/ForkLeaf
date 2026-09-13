"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import {
  MAX_RECORDING_SECONDS,
  formatDuration,
  pickRecordingType,
  recordingFileName,
} from "@/lib/voice";

/**
 * Recording a voice note.
 *
 * Record, listen back, keep it or throw it away. The recording is made in the
 * browser and saved beside the note like a pasted picture; nothing is sent
 * anywhere to make it.
 *
 * A transcript is optional and off by default, because the browser's speech
 * recognition is not ForkLeaf's to promise anything about: Chrome sends the
 * audio to Google to transcribe it. The switch says so before anyone turns it
 * on, and is not shown at all in a browser that has no speech recognition.
 */

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

export interface VoiceMedia {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  MediaRecorder: typeof MediaRecorder;
  SpeechRecognition: (new () => SpeechRecognitionLike) | null;
}

export interface VoiceNoteDialogProps {
  onClose: () => void;
  /** Stores the recording and writes it into the note. */
  onSave: (file: File, seconds: number, transcript: string) => Promise<void>;
  /** For tests; defaults to the browser's own. */
  media?: VoiceMedia | null;
  now?: () => Date;
}

function browserMedia(): VoiceMedia | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return null;
  if (!navigator.mediaDevices?.getUserMedia) return null;
  const speech =
    (window as unknown as Record<string, unknown>).SpeechRecognition ??
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  return {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    MediaRecorder,
    SpeechRecognition:
      typeof speech === "function" ? (speech as new () => SpeechRecognitionLike) : null,
  };
}

type Phase =
  | { kind: "idle" }
  | { kind: "recording"; startedAt: number }
  | { kind: "recorded"; blob: Blob; url: string; seconds: number; type: string }
  | { kind: "saving" };

export function VoiceNoteDialog({ onClose, onSave, media, now }: VoiceNoteDialogProps) {
  const [available] = useState<VoiceMedia | null>(() =>
    media === undefined ? browserMedia() : media,
  );
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const [transcribe, setTranscribe] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const chunks = useRef<Blob[]>([]);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);
  const urlToRevoke = useRef<string | null>(null);
  const startedAt = useRef(0);

  const release = () => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    try {
      recognition.current?.stop();
    } catch {
      // Already stopped.
    }
    recognition.current = null;
  };

  // Leaving the dialog stops the microphone and forgets the recording's URL.
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      release();
      if (urlToRevoke.current) URL.revokeObjectURL(urlToRevoke.current);
    },
    [],
  );

  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  };

  const start = async () => {
    if (!available) return;
    setProblem(null);
    setTranscript("");
    chunks.current = [];
    try {
      const microphone = await available.getUserMedia({ audio: true });
      stream.current = microphone;
      const type = pickRecordingType((candidate) =>
        available.MediaRecorder.isTypeSupported(candidate),
      );
      const next = new available.MediaRecorder(microphone, type ? { mimeType: type } : undefined);
      recorder.current = next;

      next.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      next.onstop = () => {
        const seconds = (Date.now() - startedAt.current) / 1000;
        release();
        const recordedType = next.mimeType || type || "audio/webm";
        const blob = new Blob(chunks.current, { type: recordedType });
        if (urlToRevoke.current) URL.revokeObjectURL(urlToRevoke.current);
        const url = URL.createObjectURL(blob);
        urlToRevoke.current = url;
        setPhase({ kind: "recorded", blob, url, seconds, type: recordedType });
      };

      startedAt.current = Date.now();
      next.start(1000);
      setElapsed(0);
      setPhase({ kind: "recording", startedAt: startedAt.current });
      ticker.current = setInterval(() => {
        const seconds = (Date.now() - startedAt.current) / 1000;
        setElapsed(seconds);
        if (seconds >= MAX_RECORDING_SECONDS) stop();
      }, 250);

      if (transcribe && available.SpeechRecognition) {
        const speech = new available.SpeechRecognition();
        speech.continuous = true;
        speech.interimResults = false;
        speech.lang = navigator.language || "en-US";
        speech.onresult = (event) => {
          let heard = "";
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i]!;
            if (result.isFinal) heard += `${result[0]!.transcript.trim()} `;
          }
          if (heard) setTranscript((current) => `${current}${heard}`);
        };
        speech.onerror = () => {
          setProblem("The transcript stopped; the recording carries on.");
        };
        speech.start();
        recognition.current = speech;
      }
    } catch (error: unknown) {
      release();
      const denied =
        error instanceof Error &&
        /denied|allowed|permission/i.test(`${error.name} ${error.message}`);
      setProblem(
        denied
          ? "ForkLeaf was not allowed to use the microphone. Allow it for this site in your browser, then try again."
          : "The microphone could not be started.",
      );
      setPhase({ kind: "idle" });
    }
  };

  const save = async () => {
    if (phase.kind !== "recorded") return;
    const { blob, seconds, type } = phase;
    setPhase({ kind: "saving" });
    setProblem(null);
    try {
      const file = new File([blob], recordingFileName((now ?? (() => new Date()))(), type), {
        type,
      });
      await onSave(file, seconds, transcript.trim());
    } catch (error: unknown) {
      setProblem(error instanceof Error ? error.message : "The recording could not be saved.");
      setPhase({ kind: "recorded", blob, url: urlToRevoke.current ?? "", seconds, type });
    }
  };

  const discard = () => {
    if (urlToRevoke.current) URL.revokeObjectURL(urlToRevoke.current);
    urlToRevoke.current = null;
    setTranscript("");
    setPhase({ kind: "idle" });
  };

  return (
    <Dialog
      title="Record a voice note"
      subtitle="Saved beside this note, and linked from it"
      onClose={onClose}
    >
      <div className="flex flex-col items-center gap-3 text-center text-[13px]">
        {!available && (
          <p role="alert" className="text-[var(--fl-muted)]">
            This browser cannot record audio here. Recording needs a secure page and a browser that
            supports MediaRecorder.
          </p>
        )}

        {available && phase.kind === "idle" && (
          <>
            <p className="text-[var(--fl-muted)]">
              Up to {formatDuration(MAX_RECORDING_SECONDS)} minutes.
            </p>
            {available.SpeechRecognition && (
              <label className="flex max-w-sm items-start gap-2 text-left text-[12.5px] text-[var(--fl-muted)]">
                <input
                  type="checkbox"
                  checked={transcribe}
                  onChange={(event) => setTranscribe(event.target.checked)}
                  className="mt-[3px] accent-[var(--fl-accent)]"
                />
                <span>
                  Write a transcript as well. Your browser does this, not ForkLeaf — Chrome sends
                  the audio to Google to transcribe it.
                </span>
              </label>
            )}
            <button type="button" onClick={() => void start()} className="fl-btn fl-btn-primary">
              Start recording
            </button>
          </>
        )}

        {phase.kind === "recording" && (
          <>
            <p
              aria-live="polite"
              className="flex items-center gap-2 text-[22px] font-semibold tabular-nums text-[var(--fl-text)]"
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--fl-danger)]"
              />
              {formatDuration(elapsed)}
            </p>
            {transcribe && transcript && (
              <p className="max-h-24 max-w-sm overflow-y-auto text-[12.5px] text-[var(--fl-muted)]">
                {transcript}
              </p>
            )}
            <button type="button" onClick={stop} className="fl-btn fl-btn-primary">
              Stop
            </button>
          </>
        )}

        {phase.kind === "recorded" && (
          <>
            <audio controls src={phase.url} className="w-full" aria-label="The recording" />
            <p className="text-[var(--fl-muted)]">{formatDuration(phase.seconds)}</p>
            {transcript && (
              <blockquote className="max-h-32 w-full overflow-y-auto border-l-2 border-[var(--fl-accent)] px-3 text-left text-[12.5px] text-[var(--fl-text)]">
                {transcript}
              </blockquote>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={discard} className="fl-btn fl-btn-ghost">
                Record again
              </button>
              <button type="button" onClick={() => void save()} className="fl-btn fl-btn-primary">
                Add to note
              </button>
            </div>
          </>
        )}

        {phase.kind === "saving" && (
          <p role="status" className="text-[var(--fl-muted)]">
            Saving the recording…
          </p>
        )}

        {problem && (
          <p role="alert" className="text-[var(--fl-danger)]">
            {problem}
          </p>
        )}
      </div>
    </Dialog>
  );
}
