/**
 * CSP hash of the inline theme script in the document head.
 *
 * That script has to run before first paint to avoid a flash of the wrong
 * palette, so it cannot be an external file — and it is rendered by the root
 * layout, which is a static server component with no access to the per-request
 * nonce. A hash covers it instead: the content is a build-time constant, so the
 * browser can verify it without a nonce and the layout stays statically
 * renderable.
 *
 * `theme-script-hash.test.ts` recomputes this from the script itself, so
 * editing the script without updating this value fails the test suite rather
 * than silently breaking the theme in production.
 */
export const THEME_INIT_HASH = "sha256-hqzF3kMpRwatGDmR6ChEU2vj3fRyx8MGaQ4pkvXRpuA=";
