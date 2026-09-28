import { describe, expect, it } from "vitest";
import {
  initialDifficulty,
  initialStability,
  memoryFromSm2,
  nextInterval,
  remember,
  retrievability,
} from "./fsrs";

describe("FSRS", () => {
  it("schedules a review for the day recall falls to 90%", () => {
    expect(retrievability(0, 10)).toBe(1);
    expect(retrievability(10, 10)).toBeCloseTo(0.9, 5);
    expect(nextInterval(10)).toBe(10);
    expect(nextInterval(0.2)).toBe(1);
  });

  it("starts an easier first answer with a longer memory and a lower difficulty", () => {
    expect(initialStability(4)).toBeGreaterThan(initialStability(3));
    expect(initialStability(3)).toBeGreaterThan(initialStability(1));
    expect(initialDifficulty(4)).toBeLessThan(initialDifficulty(1));
  });

  it("grows stability when remembered, more for easy than for hard", () => {
    const card = { stability: 5, difficulty: 5 };
    const hard = remember(card, 2, 5);
    const good = remember(card, 3, 5);
    const easy = remember(card, 4, 5);
    expect(hard.stability).toBeGreaterThan(5);
    expect(good.stability).toBeGreaterThan(hard.stability);
    expect(easy.stability).toBeGreaterThan(good.stability);
  });

  it("shrinks stability and raises difficulty when forgotten", () => {
    const forgotten = remember({ stability: 30, difficulty: 5 }, 1, 30);
    expect(forgotten.stability).toBeLessThan(30);
    expect(forgotten.difficulty).toBeGreaterThan(5);
  });

  it("keeps difficulty between 1 and 10", () => {
    let card = { stability: 5, difficulty: 9.9 };
    for (let i = 0; i < 20; i += 1) card = remember(card, 1, 1);
    expect(card.difficulty).toBeLessThanOrEqual(10);
    for (let i = 0; i < 40; i += 1) card = remember(card, 4, card.stability);
    expect(card.difficulty).toBeGreaterThanOrEqual(1);
  });

  it("carries an SM-2 card over without losing its gap", () => {
    const memory = memoryFromSm2(20, 2.5);
    expect(memory.stability).toBe(20);
    expect(memoryFromSm2(20, 1.3).difficulty).toBeGreaterThan(memoryFromSm2(20, 2.9).difficulty);
  });
});
