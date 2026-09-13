import { describe, expect, it } from "vitest";
import { buildSupportIndex, checkClaim, isClaim, sentencesIn } from "./claims";

describe("isClaim", () => {
  it.each([
    ["Water boils at 100 degrees at sea level.", true],
    ["The mitochondria is the powerhouse of the cell.", true],
    ["Remote teams always ship slower than office teams.", true],
    ["What does the mitochondria actually do in a cell?", false],
    ["I think remote teams ship slower than office teams.", false],
    ["Maybe the budget is too small for this project.", false],
    ["The budget is tight.", false],
    ["Water boils at 100 degrees, see https://example.com for more.", false],
    ["The launch plan is described in [[Roadmap]] in detail.", false],
    ["We should call the supplier about the delivery dates.", false],
  ] as const)("%j → %s", (sentence, claim) => {
    expect(isClaim(sentence)).toBe(claim);
  });
});

describe("checkClaim", () => {
  const index = buildSupportIndex([
    {
      path: "science/water.md",
      title: "Water",
      content:
        "# Water\n\nWater boils at 100 degrees Celsius at sea level. It freezes at 0.\n\n```\nThe moon is made of cheese and has 3 craters.\n```",
    },
    {
      path: "inbox/remote.md",
      title: "A study on remote work",
      content: "> Remote teams shipped features faster than office teams in the 2023 survey.",
    },
    {
      path: "notes/draft.md",
      title: "Draft",
      content: "Sharks are older than trees by millions of years.",
    },
  ]);

  it("finds the passage that backs a claim, and says where", () => {
    expect(
      checkClaim(index, "At sea level, water boils at 100 degrees Celsius.", "notes/draft.md"),
    ).toEqual({
      status: "supported",
      source: {
        path: "science/water.md",
        title: "Water",
        line: 3,
        text: "Water boils at 100 degrees Celsius at sea level.",
      },
    });
  });

  it("flags a claim nothing backs", () => {
    expect(checkClaim(index, "Sharks can smell blood from 5 miles away in water.", null)).toEqual({
      status: "unsupported",
    });
  });

  it("does not count a passage whose numbers differ", () => {
    expect(
      checkClaim(index, "Water boils at 90 degrees Celsius at sea level.", "notes/draft.md").status,
    ).toBe("unsupported");
  });

  it("never lets a note back its own claims, nor code count as a source", () => {
    expect(
      checkClaim(index, "Sharks are older than trees by millions of years.", "notes/draft.md")
        .status,
    ).toBe("unsupported");
    expect(checkClaim(index, "The moon is made of cheese and has 3 craters.", null).status).toBe(
      "unsupported",
    );
  });

  it("reads saved quotes as sources, with different forms of the words", () => {
    expect(
      checkClaim(
        index,
        "Remote teams ship features faster than office teams, per the 2023 survey.",
        null,
      ).status,
    ).toBe("supported");
  });

  it("leaves what is not a claim alone", () => {
    expect(checkClaim(index, "Does water boil faster at altitude?", null)).toEqual({
      status: "not-a-claim",
    });
  });
});

describe("sentencesIn", () => {
  it("splits prose into sentences", () => {
    expect(sentencesIn("It is 3.5 km. Then 4 more! Done")).toEqual([
      "It is 3.5 km.",
      "Then 4 more!",
      "Done",
    ]);
  });
});
