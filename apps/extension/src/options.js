// @ts-check
/* global chrome */

import { DEFAULT_ORIGIN, normaliseOrigin } from "./save-url.js";

const form = /** @type {HTMLFormElement} */ (document.getElementById("form"));
const input = /** @type {HTMLInputElement} */ (document.getElementById("origin"));
const status = /** @type {HTMLElement} */ (document.getElementById("status"));

chrome.storage.sync.get("origin").then((stored) => {
  input.value = normaliseOrigin(stored.origin) ?? DEFAULT_ORIGIN;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const origin = normaliseOrigin(input.value);
  if (!origin) {
    status.textContent = " That needs to be an https:// address (or http://localhost).";
    return;
  }
  await chrome.storage.sync.set({ origin });
  input.value = origin;
  status.textContent = " Saved.";
});
