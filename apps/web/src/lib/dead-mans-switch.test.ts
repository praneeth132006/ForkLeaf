import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  WORKFLOW_PATH,
  addOnGitHubUrl,
  checkSwitch,
  switchWorkflow,
  type SwitchSettings,
} from "./dead-mans-switch";

const good: SwitchSettings = { days: 180, folder: "legacy", person: "trusted-friend" };

describe("checkSwitch", () => {
  it("accepts sensible settings", () => {
    expect(checkSwitch(good)).toBeNull();
    expect(checkSwitch({ ...good, folder: null })).toBeNull();
    expect(checkSwitch({ ...good, person: null })).toBeNull();
  });

  it("refuses anything that could reach the shell, or does nothing", () => {
    expect(checkSwitch({ ...good, days: 7 })).toBe("days");
    expect(checkSwitch({ ...good, folder: "../secrets" })).toBe("folder");
    expect(checkSwitch({ ...good, folder: "/etc" })).toBe("folder");
    expect(checkSwitch({ ...good, folder: 'a"; rm -rf ~; "' })).toBe("folder");
    expect(checkSwitch({ ...good, folder: "notes/$(whoami)" })).toBe("folder");
    expect(checkSwitch({ ...good, person: "x; curl evil" })).toBe("person");
    expect(checkSwitch({ ...good, person: "-leading" })).toBe("person");
    expect(checkSwitch({ days: 180, folder: null, person: null })).toBe("nothing");
  });
});

describe("switchWorkflow", () => {
  it("is valid YAML that runs daily and can be run by hand", () => {
    const workflow = parse(switchWorkflow(good));
    expect(workflow.name).toBe("If I stop writing");
    expect(workflow.on.schedule[0].cron).toBe("17 6 * * *");
    expect(workflow.on).toHaveProperty("workflow_dispatch");
    expect(workflow.permissions).toEqual({ contents: "write", issues: "write" });
  });

  it("does not count its own files as writing, warns two weeks early, and acts once", () => {
    const text = switchWorkflow(good);
    expect(text).toContain("':(exclude).github' ':(exclude).forkleaf'");
    const steps = parse(text).jobs.check.steps as { name?: string; if?: string; run?: string }[];
    const warn = steps.find((step) => step.name === "Remind the owner first")!;
    expect(warn.if).toContain("== '166'");
    const act = steps.find((step) => step.name === "Act, once")!;
    expect(act.if).toContain(">= 180");
    expect(act.if).toContain("hashFiles('.forkleaf/switch-fired') == ''");
    expect(act.run).toContain('cp -R "legacy/." "docs/legacy/"');
    expect(act.run).toContain("@trusted-friend");
    expect(act.run).toContain("switch-fired");
  });

  it("never deletes or changes visibility", () => {
    const text = switchWorkflow(good);
    expect(text).not.toMatch(/\brm\b/);
    expect(text).not.toMatch(/visibility|--private|--public/);
    expect(text).not.toContain("gh repo edit");
  });

  it("leaves out what was not chosen", () => {
    expect(switchWorkflow({ ...good, person: null })).not.toContain("You were named");
    expect(switchWorkflow({ ...good, folder: null })).not.toContain("cp -R");
  });

  it("refuses to write a file from bad settings", () => {
    expect(() => switchWorkflow({ ...good, folder: "../x" })).toThrow();
  });
});

describe("addOnGitHubUrl", () => {
  it("opens github.com's new-file page with the workflow filled in", () => {
    const url = new URL(
      addOnGitHubUrl({ owner: "me", repo: "notes", branch: "main" }, "name: x\n"),
    );
    expect(url.origin + url.pathname).toBe("https://github.com/me/notes/new/main");
    expect(url.searchParams.get("filename")).toBe(WORKFLOW_PATH);
    expect(url.searchParams.get("value")).toBe("name: x\n");
  });
});
