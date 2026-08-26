import { describe, it, expect } from "vitest";
import { mapPool } from "./pool";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("mapPool", () => {
  it("returns an empty result for no items without running the job", async () => {
    let calls = 0;
    const result = await mapPool([], 4, async () => {
      calls += 1;
      return 1;
    });
    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });

  it("keeps results in input order even when jobs finish out of order", async () => {
    const result = await mapPool([30, 10, 20, 0], 4, async (delay, index) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return `${index}:${delay}`;
    });
    expect(result).toEqual(["0:30", "1:10", "2:20", "3:0"]);
  });

  it("never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;

    await mapPool(
      Array.from({ length: 20 }, (_, i) => i),
      3,
      async () => {
        running += 1;
        peak = Math.max(peak, running);
        await tick();
        running -= 1;
      },
    );

    expect(peak).toBe(3);
  });

  it("runs every item exactly once", async () => {
    const seen: number[] = [];
    await mapPool(
      Array.from({ length: 50 }, (_, i) => i),
      5,
      async (item) => {
        await tick();
        seen.push(item);
      },
    );
    expect(seen).toHaveLength(50);
    expect(new Set(seen).size).toBe(50);
  });

  it("does not start more workers than there are items", async () => {
    let peak = 0;
    let running = 0;
    await mapPool([1, 2], 10, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      running -= 1;
    });
    expect(peak).toBe(2);
  });

  it("settles rather than hanging when the limit is zero or negative", async () => {
    await expect(mapPool([1, 2, 3], 0, async (n) => n * 2)).resolves.toEqual([2, 4, 6]);
    await expect(mapPool([1, 2, 3], -5, async (n) => n * 2)).resolves.toEqual([2, 4, 6]);
  });

  it("rejects when a job throws, rather than resolving with a hole", async () => {
    await expect(
      mapPool([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });

  it("stops taking new work once the signal aborts", async () => {
    const controller = new AbortController();
    let started = 0;

    await mapPool(
      Array.from({ length: 20 }, (_, i) => i),
      2,
      async () => {
        started += 1;
        if (started === 4) controller.abort();
        await tick();
      },
      { signal: controller.signal },
    );

    // The in-flight pair finishes; nothing new is picked up after that.
    expect(started).toBeLessThan(20);
    expect(started).toBeGreaterThanOrEqual(4);
  });
});
