# Save to ForkLeaf

A browser extension that sends what you find on the web to your ForkLeaf
inbox: a whole page, the text you selected, a link or an image.

## How it works

The extension never writes to your notebook itself. Every save opens ForkLeaf
in a new tab at its save address — the same one the phone share sheet and the
bookmarklet use — and ForkLeaf shows exactly what will be saved and asks before
writing anything. So the extension needs no account, holds no token, and cannot
put something in your notebook you have not seen.

What leaves the page: its address, its title, its one-line description, and the
text you had selected. Nothing else is read.

## Install (Chrome, Edge, Brave, Arc)

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Press **Load unpacked** and choose this `apps/extension` folder.
3. Open the extension's **Options** and set the address you use ForkLeaf at.
   It defaults to `https://forkleaf.vercel.app`; for a local copy use
   `http://localhost:3000`.

## Install (Firefox)

1. Open `about:debugging#/runtime/this-firefox` and press **Load Temporary
   Add-on…**.
2. Choose `apps/extension/manifest.json`.
3. Set your ForkLeaf address in the extension's **Preferences** if it is not
   `https://forkleaf.vercel.app`.

Firefox removes temporary add-ons when it restarts; load it again, or install a
signed copy once one is published. The same folder works in both browsers:
Chrome runs `background.service_worker`, Firefox (121 and later) runs
`background.scripts`, and each ignores the other.

## Use

- **Save the page:** press the toolbar button, or **Alt+Shift+S**. With text
  selected, the selection is saved as a quote instead.
- **Right-click** a page, a selection, a link or an image and choose **Save … to
  ForkLeaf**.

Signed in, saves go to a private `forkleaf-saves` repository on your GitHub
account, filed automatically as `pages/`, `quotes/`, `links/` and `images/` by
year and month, with an `INDEX.md` listing everything newest first. Signed out,
ForkLeaf offers to sign in or to keep the save in the open notebook's `inbox/`.
In ForkLeaf, ⌘K → **Show everything I saved** shows them as a grid.

## Permissions

| Permission     | Why                                                                        |
| -------------- | -------------------------------------------------------------------------- |
| `activeTab`    | Read the current page's title and selection, only when you ask to save it. |
| `scripting`    | Run that one read in the page.                                             |
| `contextMenus` | The right-click items.                                                     |
| `storage`      | Remember where your ForkLeaf is.                                           |

No host permissions: the extension cannot see any page you have not asked it to
save.

## Files

- `src/background.js` — menus and the toolbar button; opens the save address
- `src/requests.js` — what to save for each way of asking (tested)
- `src/extract.js` — the read that runs inside the page (tested)
- `src/save-url.js` — builds the save address and validates the ForkLeaf origin (tested)
- `src/options.html`, `src/options.js` — the options page
