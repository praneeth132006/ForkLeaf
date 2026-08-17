# ForkLeaf brand assets

The mark is a git fork whose branches terminate in leaves, over the root commit.

## Files

| File                           | Use                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `forkleaf-mark.svg`            | The mark alone, leaf green (`#3ecf8e`). For dark backgrounds.                                                 |
| `forkleaf-mark-light-bg.svg`   | The mark in forest green (`#16794c`). For white or light backgrounds.                                         |
| `forkleaf-mark-black.svg`      | Single-colour ink black. For print, stamps, and anywhere colour is unavailable.                               |
| `forkleaf-mark-white.svg`      | Single-colour white. For photos and coloured backgrounds.                                                     |
| `forkleaf-logo.svg`            | Mark plus wordmark, for dark backgrounds.                                                                     |
| `forkleaf-logo-light-bg.svg`   | Mark plus wordmark, for light backgrounds.                                                                    |
| `forkleaf-icon-1024.png`       | App icon: green mark on an ink-black rounded tile. Use this for app stores, social avatars, GitHub org icons. |
| `forkleaf-icon-512.png`        | Same, 512×512.                                                                                                |
| `forkleaf-icon-180.png`        | Same, 180×180. Also served as the Apple touch icon.                                                           |
| `forkleaf-icon-light-1024.png` | Forest-green mark on a white tile, for light-only contexts.                                                   |

The favicon is `apps/web/src/app/icon.svg`, which Next.js picks up automatically;
`apps/web/src/app/apple-icon.png` is the touch icon. Both are copies of the files
above — regenerate them together so the tab icon never drifts from the brand.

## Colours

| Token        | Value     | Use                  |
| ------------ | --------- | -------------------- |
| Leaf green   | `#3ecf8e` | The accent, on dark  |
| Forest green | `#16794c` | The accent, on light |
| Ink black    | `#0a0c0a` | The canvas           |
| Paper        | `#fcfcfa` | The light canvas     |

## Type

Instrument Sans for interface and body, Instrument Serif for display headings,
JetBrains Mono for code. All three are on Google Fonts.

## Clear space and minimum size

Leave clear space around the mark equal to the height of one leaf. Do not render
the mark below 16px — below that the leaves close up and it reads as a blob. Use
the solid icon tile instead at small sizes.

## Do not

Recolour the mark outside the palette above, add a gradient or a drop shadow to
it, rotate it, stretch it, or set the wordmark in a face other than Instrument
Sans.
