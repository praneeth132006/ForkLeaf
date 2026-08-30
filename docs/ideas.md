# Ideas, and what has been built

The working list behind "What ForkLeaf Could Be". Each entry says how much has
to be invented before it can be built — **Small**, **Medium**, **Big** — which
is not the same as how long it takes. A small idea can still be a week's work.

Ticked entries link to nothing; the git history is the record.

## Asked for directly

- [x] **A PDF opens in the window you are already in**, in the middle column,
      with its contents beside it — not in a second browser tab
- [x] **Every column can be resized**, by dragging the seam between panels

## The whole app

- [ ] **Try a rewrite without losing the original** — Medium. A "Try this"
      button gives you a second copy of a note to experiment on, compared side
      by side; keep it or throw it away. It is a git branch, which ForkLeaf
      already has for free
- [ ] **Read your notebook as it was on any date** — Small. A date picker that
      takes the _whole notebook_ back, not one note at a time. The per-note
      time-travel panel already exists; this is the same idea one level up
- [ ] **Ask a sentence where it came from** — Medium. Click a sentence: "you
      wrote this on 12 January, changed it twice, it used to say the
      opposite." The blame view exists but reads like a developer tool
- [ ] **Suggest a change to someone else's notes** — Big. A reader of a
      published page fixes a mistake and you get a suggestion to accept or
      decline, without either of you touching GitHub. This is the single most
      distinctive thing ForkLeaf could ship
- [ ] **Notes that tell you when they have gone stale** — Medium. A list that
      comes to you, across the notebook: four notes link to a file that has
      been deleted, two mention a version that has moved on. The per-note
      freshness check already exists; this is the notebook-wide roll-up
- [ ] **Borrow somebody else's notebook** — Big. Link into their notes, pinned
      to a version, rather than copying and going stale
- [ ] **Search that knows what you are working on** — Small. Notes connected to
      the one you are in float to the top. The link graph is already built for
      backlinks; this uses it for ranking
- [ ] **Diagrams you can click through** — Medium. A box in a diagram can be a
      note, so a diagram becomes a map of the notebook

## PDFs

- [x] **Save this PDF into my notebook** — shipped before this list existed
- [x] **Open a PDF and see everything you have written about it** — Small
- [ ] **Search inside your PDFs from ⌘K** — Small. The text is already
      extracted for find-in-document; it just is not kept
- [ ] **Scroll one pane, the other follows** — Small. Scroll the note and the
      document moves to the page you are writing about, and back again
- [ ] **A list of citations that have broken** — Medium. Check every quotation
      in the notebook against the document as it stands now. The hard part —
      finding the sentence again — already works and is already tested. If one
      thing on this list gets built, it should be this one
- [ ] **See what changed between two versions of a PDF** — Medium. The file is
      in a repository, so old versions are kept: show page 12 then and now, and
      say whether the page you quoted is one of the ones that changed
- [ ] **Highlights that are just text files** — Medium. A highlight is an
      ordinary file beside the PDF, drawn over the page when you read
- [ ] **Start a note from a paper** — Small. Title, author and date fill
      themselves in; the paper's headings become the note's headings
- [ ] **Read scanned documents** — Big. Recognise the text once and keep it
      beside the file, so the work is shared with every device
- [ ] **Publish your reading, not just your notes** — Big. A public page of
      your commentary with the quoted passages set into it, each linking back
      to the exact page
- [ ] **Let other apps understand ForkLeaf's links** — Big. The link format is
      a web standard plus the `#page=` every reader has understood for twenty
      years. Write it up and invite Obsidian and Zotero plugins to use it
