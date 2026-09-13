import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * One manifest for Chrome and Firefox.
 *
 * Chrome's Manifest V3 runs a background service worker; Firefox's runs
 * background scripts. Since Chrome 121 and Firefox 121 each ignores the key it
 * does not use, so the same folder loads in both — as long as nobody drops one
 * of the keys, or points them at different files.
 */

const manifest = JSON.parse(readFileSync(join(__dirname, "..", "manifest.json"), "utf8")) as {
  manifest_version: number;
  permissions: string[];
  host_permissions?: string[];
  background: { service_worker?: string; scripts?: string[]; type?: string };
  browser_specific_settings?: { gecko?: { id?: string; strict_min_version?: string } };
};

describe("manifest.json", () => {
  it("runs the same background script in Chrome and in Firefox", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background.service_worker).toBe("src/background.js");
    expect(manifest.background.scripts).toEqual(["src/background.js"]);
    expect(manifest.background.type).toBe("module");
  });

  it("has the Firefox id and version an add-on needs", () => {
    expect(manifest.browser_specific_settings?.gecko?.id).toMatch(/^[\w.-]+@[\w.-]+$/);
    expect(manifest.browser_specific_settings?.gecko?.strict_min_version).toBe("121.0");
  });

  it("still asks for no access to any site", () => {
    expect(manifest.host_permissions ?? []).toEqual([]);
    expect(manifest.permissions.sort()).toEqual([
      "activeTab",
      "contextMenus",
      "scripting",
      "storage",
    ]);
  });
});
