/**
 * The parts of the File System Access and Launch Handler APIs that TypeScript's
 * DOM library does not ship yet.
 *
 * Both are implemented in Chromium and specified at the WICG rather than in a
 * finished standard, which is why `lib.dom.d.ts` stops at `FileSystemFileHandle`
 * and has nothing for the pickers, the permission methods, or the launch queue.
 * Declared here rather than pulling in `@types/wicg-file-system-access`, which
 * would redeclare handle types that `lib.dom` already has and conflict with
 * them.
 *
 * Everything here is guarded at runtime by `canEditLocalFiles` and
 * `canReceiveLaunchedFiles` in `lib/local-files.ts`. A type declaration is not
 * a feature detection, and Firefox and Safari have none of this.
 */

interface FilePickerAcceptType {
  description?: string;
  /** MIME type → the extensions that carry it, each including the dot. */
  accept: Record<string, string[]>;
}

interface OpenFilePickerOptions {
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
  multiple?: boolean;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
}

interface FileSystemHandlePermissionDescriptor {
  mode?: "read" | "readwrite";
}

interface FileSystemFileHandle {
  queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

/** What the operating system launched this window with. */
interface LaunchParams {
  targetURL?: string;
  /** Handles for the launched files. Empty for an ordinary launch. */
  files: FileSystemHandle[];
}

interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

interface Window {
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
  launchQueue?: LaunchQueue;
}
