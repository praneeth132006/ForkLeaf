// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { SEAL_DELAY_MS, useEncryptedNotes, type WriteDocument } from "./useEncryptedNotes";
import { WrongPassphraseError, decryptNote, encryptNote, isEncrypted } from "@/lib/encryption";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const FAST = 100_000;
const PASS = "river piano lantern oak";

function setup() {
  const files = new Map<string, { content: string; frontmatter: Record<string, unknown> }>();
  const writeDocument = vi.fn(
    async (path: string, content: string, frontmatter: Record<string, unknown>) => {
      files.set(path, { content, frontmatter });
      return true;
    },
  );
  const hook = renderHook(() => useEncryptedNotes(writeDocument, { iterations: FAST }));
  return { hook, files, writeDocument };
}

describe("useEncryptedNotes", () => {
  it("encrypts a note, writing no title or tags, and keeps it open", async () => {
    const { hook, files } = setup();
    await act(() =>
      hook.result.current.encrypt(
        "diary.md",
        "# Dear diary",
        { title: "Diary", tags: ["x"] },
        PASS,
      ),
    );

    const file = files.get("diary.md")!;
    expect(isEncrypted(file.content)).toBe(true);
    expect(file.frontmatter).toEqual({});
    expect(await decryptNote(file.content, PASS)).toContain("title: Diary");

    const opened = hook.result.current.openedFor({ path: "diary.md", content: file.content });
    expect(opened?.body).toBe("# Dear diary");
  });

  it("opens a sealed note with its passphrase, and refuses a wrong one", async () => {
    const { hook } = setup();
    const content = await encryptNote("---\ntitle: Plans\n---\n\nSecret plans", PASS, FAST);

    // Asserted inside act: a rejected act() leaves the test renderer broken for every test after it.
    await act(async () => {
      await expect(
        hook.result.current.open("plans.md", content, "wrong passphrase"),
      ).rejects.toBeInstanceOf(WrongPassphraseError);
    });
    expect(hook.result.current.openedFor({ path: "plans.md", content })).toBeUndefined();

    await act(() => hook.result.current.open("plans.md", content, PASS));
    const opened = hook.result.current.openedFor({ path: "plans.md", content });
    expect(opened?.body.trim()).toBe("Secret plans");
    expect(opened?.frontmatter).toEqual({ title: "Plans" });
  });

  it("seals and writes typing after a pause, and the result still opens", async () => {
    const { hook, files, writeDocument } = setup();
    await act(() => hook.result.current.encrypt("n.md", "first", {}, PASS));
    writeDocument.mockClear();

    act(() => {
      hook.result.current.save("n.md", "second");
      hook.result.current.save("n.md", "third");
    });
    expect(writeDocument).not.toHaveBeenCalled();

    await waitFor(() => expect(writeDocument).toHaveBeenCalledTimes(1), {
      timeout: SEAL_DELAY_MS + 3000,
    });
    const written = files.get("n.md")!.content;
    expect(await decryptNote(written, PASS)).toBe("third");
    // The note the editor now sees is still one this tab sealed, so it stays open.
    expect(hook.result.current.openedFor({ path: "n.md", content: written })?.body).toBe("third");
  });

  it("locks again when the file changes underneath, instead of overwriting it", async () => {
    const { hook, files } = setup();
    await act(() => hook.result.current.encrypt("n.md", "mine", {}, PASS));
    const fromElsewhere = await encryptNote("theirs", PASS, FAST);
    expect(files.get("n.md")!.content).not.toBe(fromElsewhere);
    expect(hook.result.current.openedFor({ path: "n.md", content: fromElsewhere })).toBeUndefined();
  });

  it("writes pending typing before locking, then forgets the key", async () => {
    const { hook, files } = setup();
    await act(() => hook.result.current.encrypt("n.md", "draft", {}, PASS));
    act(() => hook.result.current.save("n.md", "draft, finished"));
    await act(() => hook.result.current.lock("n.md"));

    const content = files.get("n.md")!.content;
    expect(await decryptNote(content, PASS)).toBe("draft, finished");
    expect(hook.result.current.openedFor({ path: "n.md", content })).toBeUndefined();
  });

  it("removes encryption, writing the words and properties back", async () => {
    const { hook, files } = setup();
    await act(() => hook.result.current.encrypt("n.md", "plain again", { tags: ["a"] }, PASS));
    await act(async () => {
      expect(await hook.result.current.decrypt("n.md")).toBe(true);
    });
    expect(files.get("n.md")).toEqual({ content: "plain again", frontmatter: { tags: ["a"] } });
  });

  it("forgets a note it could not write when encrypting", async () => {
    const writeDocument = vi.fn<WriteDocument>(async () => false);
    const hook = renderHook(() => useEncryptedNotes(writeDocument, { iterations: FAST }));
    let written = true;
    await act(async () => {
      written = await hook.result.current.encrypt("n.md", "x", {}, PASS);
    });
    expect(written).toBe(false);
    const envelope = writeDocument.mock.calls[0]![1];
    expect(hook.result.current.openedFor({ path: "n.md", content: envelope })).toBeUndefined();
  });

  it("ignores a plain note", () => {
    const { hook } = setup();
    expect(hook.result.current.openedFor({ path: "p.md", content: "# Plain" })).toBeUndefined();
    expect(hook.result.current.openedFor(null)).toBeUndefined();
  });
});
