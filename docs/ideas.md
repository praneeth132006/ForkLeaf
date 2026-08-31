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
- [x] **Read your notebook as it was on any date** — Small. A date picker that
      takes the _whole notebook_ back: the files that existed that day, and
      each one readable as it stood. Read-only
- [x] **Ask a sentence where it came from** — Medium. Pointing at a paragraph
      now says what it used to say, taken from the revision before the change
      that produced it
- [ ] **Suggest a change to someone else's notes** — Big. A reader of a
      published page fixes a mistake and you get a suggestion to accept or
      decline, without either of you touching GitHub. This is the single most
      distinctive thing ForkLeaf could ship
- [x] **Notes that tell you when they have gone stale** — Medium. A list that
      comes to you, across the notebook: notes pointing at files that have
      gone, links matching no note, and claims that have aged
- [ ] **Borrow somebody else's notebook** — Big. Link into their notes, pinned
      to a version, rather than copying and going stale
- [x] **Search that knows what you are working on** — Small. Notes linked to
      the one you are in float to the top of ⌘K, by however many hops away
      they are
- [x] **Diagrams you can click through** — Medium. A `[[wikilink]]` in a box's
      label makes the box a way to the note. Clickable wherever a diagram is
      read; in the rich editor a click still opens the diagram for editing,
      which is what a click there has always meant

## PDFs

- [x] **Save this PDF into my notebook** — shipped before this list existed
- [x] **Open a PDF and see everything you have written about it** — Small
- [x] **Search inside your PDFs from ⌘K** — Small. The text is kept the first
      time a document is read, so ⌘K reaches inside the papers as well
- [ ] **Scroll one pane, the other follows** — Small. Scroll the note and the
      document moves to the page you are writing about, and back again
- [x] **A list of citations that have broken** — Medium. Every quotation in the
      notebook, checked against the document as it stands now: what has moved,
      what is gone, and a one-press fix for a stale page number
- [ ] **See what changed between two versions of a PDF** — Medium. The file is
      in a repository, so old versions are kept: show page 12 then and now, and
      say whether the page you quoted is one of the ones that changed
- [ ] **Highlights that are just text files** — Medium. A highlight is an
      ordinary file beside the PDF, drawn over the page when you read
- [x] **Start a note from a paper** — Small. Title, author and date fill
      themselves in; the paper's headings become the note's headings, each
      linked to the page it starts on
- [ ] **Read scanned documents** — Big. Recognise the text once and keep it
      beside the file, so the work is shared with every device
- [ ] **Publish your reading, not just your notes** — Big. A public page of
      your commentary with the quoted passages set into it, each linking back
      to the exact page
- [x] **Let other apps understand ForkLeaf's links** — Big. The format is
      written down at `/docs/citation-links`, and **Copy link** puts one on the
      clipboard. Inviting the plugin authors is the half that is still to do
