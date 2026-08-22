/**
 * How the editor talks to whatever is storing images.
 *
 * The editor package deliberately knows nothing about GitHub, repositories or
 * API routes — it is a markdown editor, and the app it is embedded in decides
 * where a pasted screenshot ends up. All it needs is a way to hand a file over
 * and get back the `src` to write into the document, plus a way to turn that
 * `src` into something a browser can actually load.
 */
export interface ImageBridge {
  /**
   * Stores a file and returns the `src` to write into the markdown.
   *
   * Throwing is how a failure is reported; the editor shows the message.
   */
  upload?: (file: File) => Promise<string>;
  /**
   * Maps a `src` written in the document to one the browser can load.
   *
   * Images are referenced by repository-relative path so the note keeps
   * working outside this app, and such a path means nothing to the page
   * showing it.
   */
  resolve?: (src: string) => string;
  /** False when there is nowhere to store files, so the UI can say so. */
  canUpload?: boolean;
}

/** MIME types the editor will accept from a paste or a drop. */
const ACCEPTED = /^image\/(png|jpeg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)$/i;

/** The `accept` attribute for a file picker, matching what paste accepts. */
export const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.avif,.bmp,.ico,image/*";

export function isEditableImage(file: File): boolean {
  return ACCEPTED.test(file.type);
}

/** Every image in a clipboard or drag payload, in order. */
export function imagesFrom(data: DataTransfer | null | undefined): File[] {
  if (!data) return [];

  const files: File[] = [];
  for (const item of Array.from(data.files ?? [])) {
    if (isEditableImage(item)) files.push(item);
  }

  // Screenshots pasted from the system clipboard arrive as `items` with no
  // entry in `files` in some browsers, so both have to be looked at.
  if (files.length === 0) {
    for (const item of Array.from(data.items ?? [])) {
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (file && isEditableImage(file)) files.push(file);
    }
  }

  return files;
}
