// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OcrDialog } from "./OcrDialog";
import { BookQuoteDialog } from "./BookQuoteDialog";

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

const picture = () => new File([new Uint8Array([1, 2, 3])], "slide.png", { type: "image/png" });

function choose(label: string, file: File) {
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });
}

describe("OcrDialog", () => {
  it("reads a chosen picture, tidies the text and adds it with the picture", async () => {
    const onAdd = vi.fn(async () => {});
    render(
      <OcrDialog
        onClose={vi.fn()}
        onAdd={onAdd}
        recognise={async (_image, onProgress) => {
          onProgress?.({ stage: "reading", progress: 0.5 });
          return {
            text: "Agenda\n• Ship the\nbeta\n• Hire",
            lines: [],
            confidence: 91,
          };
        }}
      />,
    );
    choose("Choose a picture", picture());
    const text = (await screen.findByLabelText(
      "Text read from the picture",
    )) as HTMLTextAreaElement;
    expect(text.value).toBe("Agenda\n\n- Ship the beta\n- Hire");

    fireEvent.change(text, { target: { value: "Agenda\n\n- Ship the beta" } });
    fireEvent.click(screen.getByText("Add to the note"));
    await waitFor(() =>
      expect(onAdd).toHaveBeenCalledWith("Agenda\n\n- Ship the beta", expect.any(File)),
    );
  });

  it("adds the text alone when the picture is not wanted", async () => {
    const onAdd = vi.fn(async () => {});
    render(
      <OcrDialog
        onClose={vi.fn()}
        onAdd={onAdd}
        recognise={async () => ({ text: "Hello", lines: [], confidence: 95 })}
      />,
    );
    choose("Choose a picture", picture());
    await screen.findByLabelText("Text read from the picture");
    fireEvent.click(screen.getByLabelText("Put the picture in the note too"));
    fireEvent.click(screen.getByText("Add to the note"));
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith("Hello", null));
  });

  it("warns when the reader was unsure", async () => {
    render(
      <OcrDialog
        onClose={vi.fn()}
        onAdd={vi.fn()}
        recognise={async () => ({ text: "blurry", lines: [], confidence: 42 })}
      />,
    );
    choose("Choose a picture", picture());
    expect(await screen.findByText("Some words may be misread (42% sure)")).toBeTruthy();
  });

  it("says so when there are no words, or the file is not a picture", async () => {
    render(
      <OcrDialog
        onClose={vi.fn()}
        onAdd={vi.fn()}
        recognise={async () => ({ text: "  ", lines: [], confidence: 0 })}
      />,
    );
    choose("Choose a picture", picture());
    expect(await screen.findByText(/No words found in that picture/)).toBeTruthy();
    choose("Choose a picture", new File(["x"], "notes.txt", { type: "text/plain" }));
    expect(screen.getByRole("alert").textContent).toContain("That is not a picture");
  });

  it("reads a picture pasted while it is open", async () => {
    const recognise = vi.fn(async () => ({ text: "Pasted", lines: [], confidence: 90 }));
    render(<OcrDialog onClose={vi.fn()} onAdd={vi.fn()} recognise={recognise} />);
    const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & {
      clipboardData: { files: File[] };
    };
    Object.defineProperty(event, "clipboardData", { value: { files: [picture()] } });
    window.dispatchEvent(event);
    await waitFor(() => expect(recognise).toHaveBeenCalledTimes(1));
    expect(
      ((await screen.findByLabelText("Text read from the picture")) as HTMLTextAreaElement).value,
    ).toBe("Pasted");
  });

  it("shows what went wrong when the reader fails", async () => {
    render(
      <OcrDialog
        onClose={vi.fn()}
        onAdd={vi.fn()}
        recognise={async () => {
          throw new Error("The text reader could not start: offline");
        }}
      />,
    );
    choose("Choose a picture", picture());
    expect((await screen.findByRole("alert")).textContent).toBe(
      "The text reader could not start: offline",
    );
  });
});

describe("BookQuoteDialog", () => {
  const lines = [
    { text: "It was a bright cold day in April,", confidence: 90 },
    { text: "and the clocks were strik-", confidence: 90 },
    { text: "ing thirteen.", confidence: 90 },
    { text: "Page footer", confidence: 50 },
  ];

  function mount(onSave = vi.fn(async () => "books/1984.md")) {
    render(
      <BookQuoteDialog
        onClose={vi.fn()}
        books={[{ title: "1984", author: "George Orwell" }]}
        onSave={onSave}
        recognise={async () => ({ text: "", lines, confidence: 88 })}
      />,
    );
    return onSave;
  }

  it("offers the camera, then the lines of the page to choose from", async () => {
    mount();
    const camera = screen.getByLabelText("Take a photo of the page") as HTMLInputElement;
    expect(camera.getAttribute("capture")).toBe("environment");
    choose("Take a photo of the page", picture());
    const buttons = (await screen.findByTestId("book-lines")).querySelectorAll("button");
    expect(Array.from(buttons).map((button) => button.textContent)).toEqual(
      lines.map((line) => line.text),
    );
  });

  it("joins the chosen lines, mending hyphenation, and saves with book and page", async () => {
    const onSave = mount();
    choose("Take a photo of the page", picture());
    await screen.findByTestId("book-lines");
    fireEvent.click(screen.getByText(lines[0]!.text));
    fireEvent.click(screen.getByText(lines[2]!.text), { shiftKey: true });
    expect((screen.getByLabelText("The quote") as HTMLTextAreaElement).value).toBe(
      "It was a bright cold day in April, and the clocks were striking thirteen.",
    );

    fireEvent.change(screen.getByLabelText("Book"), { target: { value: "1984" } });
    expect((screen.getByLabelText("Author") as HTMLInputElement).value).toBe("George Orwell");
    fireEvent.change(screen.getByLabelText("Page"), { target: { value: "3" } });
    fireEvent.click(screen.getByText("Keep this quote"));

    await screen.findByText(/Kept in books\/1984.md/);
    expect(onSave).toHaveBeenCalledWith({
      book: "1984",
      author: "George Orwell",
      page: "3",
      text: "It was a bright cold day in April, and the clocks were striking thirteen.",
    });
  });

  it("takes a click and a shift-click made in the same moment", async () => {
    mount();
    choose("Take a photo of the page", picture());
    await screen.findByTestId("book-lines");
    const first = screen.getByText(lines[0]!.text);
    const third = screen.getByText(lines[2]!.text);
    act(() => {
      first.click();
      third.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    });
    expect((screen.getByLabelText("The quote") as HTMLTextAreaElement).value).toBe(
      "It was a bright cold day in April, and the clocks were striking thirteen.",
    );
  });

  it("keeps a correction typed into the quote", async () => {
    const onSave = mount();
    choose("Take a photo of the page", picture());
    await screen.findByTestId("book-lines");
    fireEvent.click(screen.getByText(lines[0]!.text));
    fireEvent.change(screen.getByLabelText("The quote"), {
      target: { value: "Corrected text here" },
    });
    fireEvent.click(screen.getByText(lines[3]!.text));
    expect((screen.getByLabelText("The quote") as HTMLTextAreaElement).value).toBe(
      "Corrected text here",
    );
    fireEvent.change(screen.getByLabelText("Book"), { target: { value: "New book" } });
    fireEvent.click(screen.getByText("Keep this quote"));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ text: "Corrected text here", author: null }),
      ),
    );
  });

  it("asks for the lines and the book before saving", async () => {
    const onSave = mount();
    choose("Take a photo of the page", picture());
    await screen.findByTestId("book-lines");
    fireEvent.click(screen.getByText("Keep this quote"));
    expect(screen.getByRole("alert").textContent).toBe(
      "Choose the lines to keep — tap them above.",
    );
    fireEvent.click(screen.getByText(lines[0]!.text));
    fireEvent.click(screen.getByText("Keep this quote"));
    expect(screen.getByRole("alert").textContent).toBe("Which book is it from?");
    expect(onSave).not.toHaveBeenCalled();
  });
});
