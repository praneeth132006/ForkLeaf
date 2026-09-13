import { audioExtensionFor } from "@/lib/media";

/**
 * Voice notes: the choices that are not about the microphone.
 *
 * Which format to record in, how long a recording may run, and what is written
 * into the note. The recording itself is a file in the repository's `assets/`
 * folder beside the note, like a pasted picture — so it syncs, has history, and
 * is still there if ForkLeaf is not.
 */

/**
 * The longest recording. A file is committed in one request, which caps it at
 * 3 MB; Opus speech at the bitrates browsers choose stays well inside that for
 * ten minutes, and a voice note longer than that is a meeting recording.
 */
export const MAX_RECORDING_SECONDS = 10 * 60;

/** Formats to try, best first: small, widely playable, and supported where they are. */
const PREFERRED_TYPES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/webm",
];

/** The first format this browser can record, or "" to let it choose. */
export function pickRecordingType(isTypeSupported: (type: string) => boolean): string {
  return (
    PREFERRED_TYPES.find((type) => {
      try {
        return isTypeSupported(type);
      } catch {
        return false;
      }
    }) ?? ""
  );
}

/** `m:ss`, or `h:mm:ss` past an hour. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** A filename for the recording, which the asset path is built around. */
export function recordingFileName(recordedAt: Date, type: string): string {
  const extension = audioExtensionFor(type) ?? "webm";
  return `voice-note-${recordedAt.getFullYear()}-${pad(recordedAt.getMonth() + 1)}-${pad(recordedAt.getDate())}-${pad(recordedAt.getHours())}${pad(recordedAt.getMinutes())}.${extension}`;
}

/**
 * What goes into the note.
 *
 * The link on a line of its own, so ForkLeaf's preview turns it into a player
 * and github.com shows a link to the file. A transcript, when there is one, is
 * written under it as a quotation — it is what the browser heard, not what the
 * writer wrote.
 */
export function voiceNoteMarkdown(options: {
  src: string;
  seconds: number;
  recordedAt: Date;
  transcript?: string;
}): string {
  const when = options.recordedAt.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const lines = [
    `**Voice note** · ${when} · ${formatDuration(options.seconds)}`,
    "",
    `[Listen to the recording](${options.src.replace(/[()\s]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`)})`,
  ];
  const transcript = options.transcript?.trim();
  if (transcript) {
    lines.push("", ...transcript.split(/\n+/).map((line) => `> ${line.trim()}`));
  }
  return `${lines.join("\n")}\n`;
}
