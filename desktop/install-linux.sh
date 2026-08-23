#!/usr/bin/env bash
#
# Registers ForkLeaf with your desktop as a Markdown editor.
#
# After this, `xdg-open note.md` opens ForkLeaf, and ForkLeaf appears under
# "Open with" for .md files in Nautilus, Dolphin, Thunar and friends —
# the same way gedit or any other installed editor does.
#
# What it actually installs is three small files in your home directory:
#
#   ~/.local/bin/forkleaf                          a launcher script
#   ~/.local/share/applications/forkleaf.desktop   the menu entry
#   ~/.local/share/icons/.../forkleaf.png          the icon
#
# Nothing is installed system-wide and nothing needs root. To undo it, run this
# script with --uninstall.
#
# The launcher opens ForkLeaf as a Chromium app window pointed at your
# deployment. Set FORKLEAF_URL to point somewhere else — your own deployment,
# or http://localhost:3000 while developing.

set -euo pipefail

URL="${FORKLEAF_URL:-https://forkleaf.app}"

BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/512x512/apps"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say() { printf '  %s\n' "$*"; }
die() { printf '\nforkleaf: %s\n\n' "$*" >&2; exit 1; }

# ── Uninstall ───────────────────────────────────────────────────────────────

if [[ "${1:-}" == "--uninstall" ]]; then
  rm -f "$BIN_DIR/forkleaf" "$APP_DIR/forkleaf.desktop" "$ICON_DIR/forkleaf.png"
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APP_DIR" || true
  printf '\nForkLeaf removed from your desktop.\n\n'
  exit 0
fi

# ── Find a browser ──────────────────────────────────────────────────────────
#
# App mode (--app=) is a Chromium feature. Firefox has no equivalent, and its
# lack of the File System Access API means it could not write the file back
# even if it did — so this deliberately fails rather than installing a menu
# entry that opens a read-only copy of your note.

BROWSER=""
for candidate in \
  google-chrome google-chrome-stable chromium chromium-browser \
  microsoft-edge microsoft-edge-stable brave-browser vivaldi-stable
do
  if command -v "$candidate" >/dev/null 2>&1; then
    BROWSER="$candidate"
    break
  fi
done

[[ -n "$BROWSER" ]] || die "no Chromium-based browser found.

ForkLeaf needs one to edit files on this machine: writing a file back to disk
uses the File System Access API, which Firefox does not implement. Install
Chromium, Chrome, Edge, Brave or Vivaldi and run this again.

You can still use ForkLeaf in Firefox at $URL — notes are stored in the
browser and synced to GitHub as usual, just not to files on this computer."

printf '\nInstalling ForkLeaf for %s\n\n' "$USER"
say "browser   $BROWSER"
say "app       $URL"
echo

# ── The launcher ────────────────────────────────────────────────────────────

mkdir -p "$BIN_DIR" "$APP_DIR" "$ICON_DIR"

cat > "$BIN_DIR/forkleaf" <<LAUNCHER
#!/usr/bin/env bash
# Written by ForkLeaf's install-linux.sh. Edit FORKLEAF_URL to point elsewhere.
set -euo pipefail

URL="\${FORKLEAF_URL:-$URL}"
BROWSER="$BROWSER"

case "\${1:-}" in
  --new)       exec "\$BROWSER" --app="\$URL/editor?new=1" ;;
  --dashboard) exec "\$BROWSER" --app="\$URL/dashboard" ;;
esac

# No file: just open the editor.
if [[ \$# -eq 0 ]]; then
  exec "\$BROWSER" --app="\$URL/editor"
fi

# A file was passed. Chromium's installed-app file handling is what delivers it
# to the page, so the file is given to the *installed* app rather than to a
# fresh --app window: --app= would open a new window that never sees it.
exec "\$BROWSER" "\$@"
LAUNCHER

chmod +x "$BIN_DIR/forkleaf"
say "installed $BIN_DIR/forkleaf"

# ── Icon and menu entry ─────────────────────────────────────────────────────

if [[ -f "$HERE/../apps/web/public/brand/forkleaf-icon-512.png" ]]; then
  cp "$HERE/../apps/web/public/brand/forkleaf-icon-512.png" "$ICON_DIR/forkleaf.png"
  say "installed $ICON_DIR/forkleaf.png"
fi

install -m 644 "$HERE/forkleaf.desktop" "$APP_DIR/forkleaf.desktop"
say "installed $APP_DIR/forkleaf.desktop"

command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APP_DIR" || true
command -v gtk-update-icon-cache >/dev/null 2>&1 &&
  gtk-update-icon-cache -qtf "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" 2>/dev/null || true

echo
printf 'Done. Two things left, both one-off:\n\n'
printf '  1. Open %s and install it from the browser\n' "$URL"
printf '     (the install icon in the address bar). That is what registers\n'
printf '     ForkLeaf as a real file handler with your desktop.\n\n'
printf '  2. Make it the default for Markdown, if you want it to be:\n\n'
printf '       xdg-mime default forkleaf.desktop text/markdown\n\n'
printf 'Then `xdg-open note.md` opens it, and so does double-clicking one.\n\n'

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) printf 'Note: %s is not on your PATH, so the desktop entry may not find\n' "$BIN_DIR"
     printf 'the launcher. Add it to your shell profile.\n\n' ;;
esac
