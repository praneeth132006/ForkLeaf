/**
 * Layout methods jsdom leaves off `Range`.
 *
 * jsdom does no layout, and unlike `Element` its `Range` does not even carry
 * the methods that would report an empty box. ProseMirror measures a text
 * selection with exactly those, and Tiptap's bubble menu now does so as soon as
 * it is created — so any test that selected text in the real editor threw
 * before it could assert anything. An empty box is what jsdom reports for an
 * element, so a range reports the same.
 *
 * Only ever filled in, never replaced, and a no-op in the node environment,
 * where there is no `Range` at all.
 */
if (typeof Range !== "undefined") {
  const empty = () => new DOMRect(0, 0, 0, 0);

  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = empty;
  }
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () =>
      Object.assign([] as DOMRect[], { item: () => null }) as unknown as DOMRectList;
  }
}
