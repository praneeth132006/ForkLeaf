import { describe, it, expect } from "vitest";
import {
  mermaidToSequence,
  sequenceToMermaid,
  addMessage,
  moveMessage,
  moveParticipant,
  removeParticipant,
  type SequenceDiagram,
} from "./sequence-model";

const source = `sequenceDiagram
    autonumber
    actor User
    participant App
    participant API as Notes API
    User->>App: Click save
    App->>API: PUT /notes/42
    API-->>App: 200 OK
    App--)User: Saved`;

describe("mermaidToSequence", () => {
  it("reads participants, actors and display names", () => {
    const diagram = mermaidToSequence(source)!;

    expect(diagram.autonumber).toBe(true);
    expect(diagram.participants).toEqual([
      { id: "User", label: "User", actor: true },
      { id: "App", label: "App", actor: false },
      { id: "API", label: "Notes API", actor: false },
    ]);
  });

  it("keeps messages in the order they happen", () => {
    const diagram = mermaidToSequence(source)!;
    expect(diagram.messages.map((message) => message.label)).toEqual([
      "Click save",
      "PUT /notes/42",
      "200 OK",
      "Saved",
    ]);
  });

  it("tells the arrow kinds apart", () => {
    const diagram = mermaidToSequence(source)!;
    // `--)` is the dotted async arrow, not the solid `-)` one. Reading it as
    // the solid arrow is exactly the bug the specificity order exists to stop.
    expect(diagram.messages.map((message) => message.arrow)).toEqual([
      "solid",
      "solid",
      "reply",
      "async-reply",
    ]);
  });

  it("records a participant first mentioned in a message", () => {
    const diagram = mermaidToSequence("sequenceDiagram\n    A->>B: hi")!;
    expect(diagram.participants.map((participant) => participant.id)).toEqual(["A", "B"]);
  });

  it("does not invent a participant by splitting a dotted arrow", () => {
    // `App--)User` must not be read as `App-` sending `)User` anything.
    const diagram = mermaidToSequence("sequenceDiagram\n    App--)User: Saved")!;
    expect(diagram.participants.map((participant) => participant.id)).toEqual(["App", "User"]);
  });

  it("refuses a diagram using blocks it cannot draw", () => {
    // Opening one of these on the canvas would drop the branches on the first
    // edit, which is worse than not offering the canvas at all.
    expect(
      mermaidToSequence("sequenceDiagram\n    loop every minute\n    A->>B: poll\n    end"),
    ).toBeNull();
    expect(
      mermaidToSequence("sequenceDiagram\n    A->>B: hi\n    Note right of B: thinking"),
    ).toBeNull();
    expect(mermaidToSequence("sequenceDiagram\n    activate A")).toBeNull();
  });

  it("is not fooled by a diagram of another kind", () => {
    expect(mermaidToSequence("flowchart TD\n    a --> b")).toBeNull();
  });
});

describe("sequenceToMermaid", () => {
  it("round-trips without losing anything", () => {
    const diagram = mermaidToSequence(source)!;
    const again = mermaidToSequence(sequenceToMermaid(diagram))!;

    expect(again.participants).toEqual(diagram.participants);
    expect(again.messages.map((m) => [m.from, m.to, m.label, m.arrow])).toEqual(
      diagram.messages.map((m) => [m.from, m.to, m.label, m.arrow]),
    );
    expect(again.autonumber).toBe(true);
  });

  it("writes a placeholder for an unlabelled message", () => {
    // Mermaid cannot parse a message with an empty label, so a message being
    // drawn before it has been named still has to produce valid source.
    const diagram: SequenceDiagram = {
      participants: [
        { id: "A", label: "A", actor: false },
        { id: "B", label: "B", actor: false },
      ],
      messages: [{ id: "m0", from: "A", to: "B", label: "", arrow: "solid" }],
      autonumber: false,
    };

    expect(sequenceToMermaid(diagram)).toContain("A->>B: …");
    expect(mermaidToSequence(sequenceToMermaid(diagram))?.messages[0]?.label).toBe("");
  });
});

describe("editing", () => {
  const diagram = mermaidToSequence(source)!;

  it("reorders messages, which is what changes the meaning", () => {
    const moved = moveMessage(diagram, diagram.messages[3]!.id, 0);
    expect(moved.messages.map((message) => message.label)).toEqual([
      "Saved",
      "Click save",
      "PUT /notes/42",
      "200 OK",
    ]);
  });

  it("reorders participants across the page", () => {
    const moved = moveParticipant(diagram, "API", 0);
    expect(moved.participants.map((participant) => participant.id)).toEqual(["API", "User", "App"]);
  });

  it("removes a participant along with its messages", () => {
    const without = removeParticipant(diagram, "API");
    expect(without.participants.map((p) => p.id)).toEqual(["User", "App"]);
    expect(without.messages.map((m) => m.label)).toEqual(["Click save", "Saved"]);
  });

  it("inserts a message at a position rather than only at the end", () => {
    const inserted = addMessage(
      diagram,
      { from: "App", to: "User", label: "Working…", arrow: "reply" },
      1,
    );
    expect(inserted.messages[1]?.label).toBe("Working…");
    expect(inserted.messages).toHaveLength(5);
  });
});
