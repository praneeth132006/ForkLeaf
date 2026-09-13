// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { WysiwygEditor, markdownOf } from "./WysiwygEditor";
import type { ClaimBridge } from "./extensions/ClaimChecker";

afterEach(cleanup);

const check: ClaimBridge["check"] = (sentence) =>
  /moon/i.test(sentence)
    ? { status: "unsupported" }
    : /water/i.test(sentence)
      ? { status: "supported", title: "Water" }
      : null;

function mount(markdown: string, claims?: ClaimBridge) {
  let editor: Editor | null = null;
  const onChange = vi.fn();
  const view = render(
    <WysiwygEditor
      value={markdown}
      onChange={onChange}
      onReady={(instance) => (editor = instance)}
      {...(claims ? { claims } : {})}
    />,
  );
  return {
    ...view,
    onChange,
    ready: async () => {
      await waitFor(() => expect(editor).not.toBeNull(), { timeout: 4000 });
      return editor!;
    },
  };
}

describe("claims marked in the text", () => {
  it("underlines what nothing backs, and says where a backed claim comes from", async () => {
    const view = mount("Water boils at 100 degrees here. The moon is made of cheese.", {
      enabled: true,
      check,
    });
    await view.ready();
    await waitFor(() =>
      expect(view.container.querySelector(".fl-claim-unsupported")).not.toBeNull(),
    );
    expect(view.container.querySelector(".fl-claim-unsupported")!.textContent).toBe(
      "The moon is made of cheese.",
    );
    const backed = view.container.querySelector(".fl-claim-supported")!;
    expect(backed.textContent).toBe("Water boils at 100 degrees here.");
    expect(backed.getAttribute("title")).toBe("Backed by Water");
  });

  it("marks sentences on their own lines, and skips headings and code", async () => {
    const view = mount(
      "# The moon is a heading.\n\nFirst line about water.\nThe moon line.\n\n```\nThe moon code.\n```",
      {
        enabled: true,
        check,
      },
    );
    await view.ready();
    await waitFor(() => expect(view.container.querySelectorAll("[data-claim]").length).toBe(2));
    expect(
      [...view.container.querySelectorAll("[data-claim]")].map((element) => element.textContent),
    ).toEqual(["First line about water.", "The moon line."]);
  });

  it("marks nothing while the checker is off, and never changes the note", async () => {
    const view = mount("The moon is made of cheese.", { enabled: false, check });
    const editor = await view.ready();
    expect(view.container.querySelector("[data-claim]")).toBeNull();

    view.rerender(
      <WysiwygEditor
        value="The moon is made of cheese."
        onChange={view.onChange}
        claims={{ enabled: true, check }}
      />,
    );
    await waitFor(() =>
      expect(view.container.querySelector(".fl-claim-unsupported")).not.toBeNull(),
    );
    expect(markdownOf(editor).trim()).toBe("The moon is made of cheese.");
    expect(view.onChange).not.toHaveBeenCalled();
  });
});
