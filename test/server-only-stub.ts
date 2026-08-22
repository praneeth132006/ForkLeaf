/**
 * Stub for the `server-only` package.
 *
 * That package exists to make a build fail when server code is imported into a
 * client bundle. Under vitest there is no such boundary, and its real entry
 * point throws on import — which would make every server module untestable.
 */
export {};
