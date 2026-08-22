import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { THEME_INIT_SCRIPT } from "@/hooks/useTheme";
import { THEME_INIT_HASH } from "./theme-script-hash";

describe("theme script CSP hash", () => {
  it("matches the script that is actually inlined", () => {
    const digest = createHash("sha256").update(THEME_INIT_SCRIPT, "utf8").digest("base64");

    // If this fails, the theme script changed: put the printed value into
    // theme-script-hash.ts, or the browser will refuse to run it under CSP.
    expect(`sha256-${digest}`).toBe(THEME_INIT_HASH);
  });
});
