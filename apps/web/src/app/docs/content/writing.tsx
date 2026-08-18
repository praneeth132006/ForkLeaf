import { A, Code, Def, H2, H3, Lead, LI, Note, OL, P, Pre, Table, UL } from "@/components/prose";

export function Editor() {
  return (
    <>
      <Lead>
        One Markdown file, three ways to look at it, and one insert menu that behaves identically in
        all of them.
      </Lead>

      <H2 id="views">The three views</H2>
      <P>
        The view is stored per note, so a README can stay in Source while your meeting notes stay in
        Rich. Switch with the <strong>Rich / Split / Source</strong> control in the header.
      </P>
      <Def term="Rich">
        A block editor. Headings, lists, tables, checkboxes and diagrams render as you type.
        Markdown shorthand works: <Code># </Code> makes a heading, <Code>- </Code> a bullet,{" "}
        <Code>&gt; </Code> a quote. Selecting text pops a small formatting bar.
      </Def>
      <Def term="Split">
        CodeMirror on the left with the raw Markdown, a live preview on the right. Drag the divider,
        or focus it and use the arrow keys. This is the view to use when you want to see exactly
        what will be committed.
      </Def>
      <Def term="Source">
        The same CodeMirror editor, full width, centred at a readable measure. Syntax highlighting,
        line numbers, code folding, bracket matching and search.
      </Def>
      <Note>
        Switching views never reformats the file. All three read and write the same Markdown string
        — no round-tripping through a proprietary document model, no surprise whitespace changes in
        your diff.
      </Note>

      <H2 id="insert">The insert menu</H2>
      <P>
        Press <Code>/</Code> anywhere, or click <strong>Insert</strong> on the toolbar. Both give
        the same list, and it works in every view — in Rich it runs an editor command, in Split and
        Source it inserts the equivalent Markdown at your caret.
      </P>
      <Table
        head={["Item", "Rich text", "Markdown inserted"]}
        rows={[
          [
            <strong key="a">Diagram</strong>,
            "A live diagram block",
            <Code key="a2">```mermaid</Code>,
          ],
          ["Heading 1 / 2 / 3", "Heading node", <Code key="b">#</Code>],
          ["Text", "Plain paragraph", "—"],
          ["Bulleted list", "Bullet list", <Code key="c">- </Code>],
          ["Numbered list", "Ordered list", <Code key="d">1. </Code>],
          ["To-do list", "Checkbox list", <Code key="e">- [ ] </Code>],
          ["Code block", "Fenced code node", <Code key="f">```</Code>],
          ["Quote", "Blockquote", <Code key="g">&gt; </Code>],
          ["Table", "3×3 with a header row", "Pipe table"],
          ["Divider", "Horizontal rule", <Code key="h">---</Code>],
          ["Link", "Prompts for a URL", <Code key="i">[](…)</Code>],
          ["Image", "Prompts for a URL", <Code key="j">![](…)</Code>],
        ]}
      />
      <P>
        Search as you type: <Code>/erd</Code>, <Code>/flowchart</Code> and <Code>/gantt</Code> all
        find Diagram; <Code>/todo</Code> finds the checkbox list. Arrow keys move, Enter accepts,
        Escape dismisses.
      </P>
      <Note kind="warn">
        Links and images accept <Code>http://</Code>, <Code>https://</Code> and <Code>mailto:</Code>{" "}
        only. A <Code>javascript:</Code> or <Code>data:</Code> URL in a note would be a stored
        cross-site-scripting vector in every renderer that later displays it, so those are rejected.
      </Note>

      <H2 id="formatting">Inline formatting</H2>
      <P>
        In Rich view, select text to get bold, italic, strikethrough, inline code and highlight — or
        use the toolbar, or <Code>⌘B</Code> and <Code>⌘I</Code>. In Split and Source, type the
        Markdown.
      </P>

      <H2 id="files">Notes, folders and names</H2>
      <UL>
        <LI>
          Every note is one <Code>.md</Code> file. The title you type becomes a slugified filename —{" "}
          <Code>Q3 planning</Code> becomes <Code>q3-planning.md</Code>.
        </LI>
        <LI>
          Folders are real directories, nested as deeply as you like. The folder button beside{" "}
          <strong>New Note</strong> makes one at the top level; hovering a folder row gives you a
          note, a subfolder, a rename and a delete for that folder.
        </LI>
        <LI>
          A folder you have just made shows as <em>Empty</em> and lives on this device only, because
          Git has no concept of an empty directory — it becomes part of the repository as soon as
          its first note lands in it. Renaming or deleting a folder moves or deletes every note
          inside it, which is what those words mean in a repository.
        </LI>
        <LI>
          Renaming rewrites the path. On a connected repository that is a delete and a create in one
          atomic commit, so the file never briefly disappears.
        </LI>
        <LI>
          Deleting commits the deletion. The content is still in your git history, so it is
          recoverable — see <A href="/docs/sync">Syncing &amp; commits</A>.
        </LI>
      </UL>

      <H2 id="search">Finding things</H2>
      <P>
        The search box above the file tree filters by path and name as you type. Inside the Source
        view, <Code>⌘F</Code> opens CodeMirror&rsquo;s find-and-replace for the current note.
      </P>
      <P>
        Full-text search across every note in every connected repository is planned for Pro — see{" "}
        <A href="/docs/plans">Plans &amp; billing</A>.
      </P>
    </>
  );
}

export function Diagrams() {
  return (
    <>
      <Lead>
        Mermaid&rsquo;s real barrier is not the feature set, it is remembering the syntax. ForkLeaf
        gives you a blank canvas to drag on, the source beside it, and an editor that tells you
        which line is wrong.
      </Lead>

      <H2 id="insert">Inserting a diagram</H2>
      <OL>
        <li>
          Press <Code>/</Code> and choose <strong>Diagram</strong>, or click{" "}
          <strong>Diagram</strong> on the toolbar.
        </li>
        <li>
          The diagram studio opens as an overlay: an empty canvas with a shape palette on the right,
          and the Mermaid source on the left.
        </li>
        <li>
          Double-click the canvas to add your first box, or pick a shape from the palette. Prefer to
          start from something finished? <strong>Templates</strong> has a diagram of every type,
          ready to edit.
        </li>
        <li>
          Press <strong>Done</strong> or <Code>Esc</Code>. The diagram appears in your note as a
          rendered picture.
        </li>
      </OL>
      <P>Click any diagram in a note to reopen the studio.</P>

      <H2 id="panes">Source and canvas, side by side</H2>
      <P>
        Both panes are live views of the same Mermaid string, not two modes you switch between: type
        a node in the source and it appears on the canvas, drag a box and the source updates under
        your cursor. Drag the divider to give either one more room, or use the{" "}
        <strong>Source</strong> and <strong>Diagram</strong> toggles to hand one of them the whole
        width.
      </P>
      <P>
        For flowcharts and state diagrams the right pane offers <strong>Canvas</strong> and{" "}
        <strong>Preview</strong>. Every other diagram type shows the preview, since the canvas has
        no model for it yet — those are written as source, which is what the autocomplete, inline
        errors and syntax reference are for.
      </P>

      <H2 id="types">The diagram types</H2>
      <P>
        The template gallery is grouped by what you are trying to show rather than by
        Mermaid&rsquo;s internal names, and every card draws a small silhouette of the shape it
        produces.
      </P>
      <Table
        head={["Group", "Types", "Use when"]}
        rows={[
          [
            <strong key="a">Processes and flows</strong>,
            "Flowchart, flowchart with groups, state machine, user journey",
            "Steps, decisions, and what happens next",
          ],
          [
            <strong key="b">Conversations and time</strong>,
            "Sequence diagram, login flow, Gantt chart, timeline, git graph",
            "Who talks to whom, in what order, or over what period",
          ],
          [
            <strong key="c">Structure and data</strong>,
            "Class diagram, entity relationship, mind map",
            "How things are shaped and how they relate",
          ],
          [
            <strong key="d">Numbers</strong>,
            "Pie chart, quadrant chart",
            "Proportions and positioning",
          ],
        ]}
      />

      <H2 id="visual">The canvas</H2>
      <P>
        Available for flowcharts and state diagrams. Drag nodes to move them, drag from a
        node&rsquo;s edge handle to draw an arrow, double-click a node to rename it, and press
        Delete to remove the selection. The Mermaid source is regenerated as you go.
      </P>
      <P>Node positions are preserved in the file as a comment:</P>
      <Pre label="a flowchart with saved layout">{`flowchart TD
    %% forkleaf:layout a:100,50;b:100,200;c:300,200
    a[Draft] --> b{Review}
    b -->|approve| c[Publish]
    b -->|changes| a`}</Pre>
      <P>
        Mermaid ignores <Code>%%</Code> comments, so the diagram still renders correctly on GitHub
        and everywhere else — the layout is simply lost to anything that is not ForkLeaf, which is
        the right trade for keeping the file portable.
      </P>
      <Note>
        For a diagram type the canvas cannot draw, the pane says so and points at the source editor
        rather than leaving a tab that does nothing.
      </Note>

      <H2 id="source">The source editor</H2>
      <P>Everything the visual builder cannot do, you do here. It is not a plain text box:</P>
      <UL>
        <LI>
          <strong>Autocomplete</strong> that knows the current diagram type, so a sequence diagram
          suggests sequence keywords.
        </LI>
        <LI>
          <strong>Inline errors</strong> with the offending line number and a plain-English hint,
          pinned to the bottom of the preview so they are always on screen.
        </LI>
        <LI>
          <strong>Syntax help</strong> — a side panel of snippets for the current diagram type.
          Click one to insert it.
        </LI>
        <LI>
          <strong>A forgiving preview.</strong> While the source is mid-edit and temporarily
          invalid, the last diagram that rendered stays on screen instead of flashing an error.
        </LI>
      </UL>

      <H2 id="storage">How diagrams are stored</H2>
      <P>
        As an ordinary fenced code block. Nothing proprietary, nothing base64-encoded, no external
        image:
      </P>
      <Pre label="what is committed">
        {
          "```mermaid\nflowchart LR\n  A[Keystroke] --> B[(IndexedDB)]\n  B --> C{Online?}\n  C -->|yes| D[Commit]\n  C -->|no| B\n```"
        }
      </Pre>
      <P>
        GitHub renders <Code>```mermaid</Code> fences natively, so your diagrams show up when you
        browse the file there. So does Obsidian, GitLab, and most static site generators.
      </P>

      <H2 id="export">Exporting diagrams</H2>
      <P>
        Diagrams are rendered into HTML, PDF and Word exports as vector graphics. Individual
        diagrams can be exported as SVG or PNG — see <A href="/docs/export">Exporting</A>.
      </P>
    </>
  );
}

export function Properties() {
  return (
    <>
      <Lead>
        The Properties panel on the right is not app metadata living in a database. It is the YAML
        front matter at the top of the file, edited directly.
      </Lead>

      <H2 id="what">What you are editing</H2>
      <P>Set a title and some tags in the panel, and this is what is committed:</P>
      <Pre label="q3-planning.md">{`---
title: Q3 planning
tags:
  - planning
  - draft
created: 2026-08-14T09:12:00.000Z
updated: 2026-08-17T16:40:00.000Z
---

# Q3 planning

The first paragraph of the note…`}</Pre>
      <P>
        This is why a note written in ForkLeaf opens correctly in Obsidian, and why the same file
        can be a page in a Hugo or Jekyll site without being touched.
      </P>

      <H2 id="fields">The built-in fields</H2>
      <Table
        head={["Field", "Type", "Notes"]}
        rows={[
          [
            <Code key="a">title</Code>,
            "string",
            "Also shown in the header. If absent, ForkLeaf derives one from the first heading, then from the filename.",
          ],
          [
            <Code key="b">tags</Code>,
            "list of strings",
            "Type them comma-separated; they are written as a YAML list.",
          ],
          [<Code key="c">created</Code>, "ISO 8601", "Set once, on creation."],
          [<Code key="d">updated</Code>, "ISO 8601", "Refreshed on each save."],
        ]}
      />

      <H2 id="custom">Custom properties</H2>
      <P>
        Use <strong>Add a property…</strong> at the bottom of the list. Anything you add is written
        into the same YAML block, so you can carry fields your static site generator or your own
        tooling expects — <Code>draft</Code>, <Code>author</Code>, <Code>slug</Code>,{" "}
        <Code>weight</Code>, whatever.
      </P>
      <Note>
        Front matter is parsed as YAML but written back conservatively. Fields ForkLeaf does not
        understand are preserved untouched rather than dropped, so editing a note from an existing
        site will not strip its configuration.
      </Note>

      <H2 id="stats">Document statistics</H2>
      <P>
        Below the properties: word count, estimated reading time, heading count, diagram count and —
        when the note has checkboxes — how many are done. All computed from the Markdown, none of it
        stored anywhere.
      </P>

      <H2 id="outline">The outline</H2>
      <P>
        The <strong>Outline</strong> tab lists every heading, indented by level. Click one to jump
        to it. If it is empty, the note has no headings yet.
      </P>
    </>
  );
}

export function Export() {
  return (
    <>
      <Lead>
        Six formats, all generated in your browser. Nothing is uploaded to a conversion service, and
        no note leaves your machine to become a file.
      </Lead>

      <H2 id="formats">The formats</H2>
      <Table
        head={["Format", "What you get"]}
        rows={[
          [
            <strong key="a">Markdown (.md)</strong>,
            "The source exactly as committed, including front matter. The identity export.",
          ],
          [
            <strong key="b">PDF (.pdf)</strong>,
            "Typeset for printing, through the browser's own print pipeline — so the text is real, selectable, searchable text rather than an image.",
          ],
          [
            <strong key="c">HTML (.html)</strong>,
            "One self-contained file. Styles inlined, diagrams embedded as SVG. Open it anywhere, email it, host it.",
          ],
          [
            <strong key="d">Word (.docx)</strong>,
            "A real .docx with proper heading styles, lists and tables — not HTML renamed.",
          ],
          [<strong key="e">Plain text (.txt)</strong>, "Markdown syntax stripped out."],
          [
            <strong key="f">JSON (.json)</strong>,
            "The note as structured data: path, front matter, content, statistics. For scripting.",
          ],
        ]}
      />

      <H2 id="how">Exporting</H2>
      <P>
        Press <Code>⌘⇧E</Code>, or use <strong>Export</strong> in the header or the properties
        panel. Choose a format and a theme, and whether to include front matter.
      </P>
      <P>
        Exports can cover the current note or every note in the workspace. Exporting everything
        produces one file per note.
      </P>

      <H2 id="diagrams">Diagrams in exports</H2>
      <P>
        Diagrams are rendered to SVG and embedded, so they stay sharp at any zoom and print
        correctly. In the light theme they render with the light palette and in dark with the dark
        one, matching what you see on screen.
      </P>
      <P>Individual diagrams can also be exported on their own, as SVG or PNG.</P>

      <H2 id="pdf">A note on PDF</H2>
      <Note>
        PDF export opens your browser&rsquo;s print dialogue with a stylesheet applied. That is
        deliberate: the alternative is shipping a headless rendering engine, which would mean
        uploading your note to a server to be turned into a file — precisely what ForkLeaf exists to
        avoid. Choose &ldquo;Save as PDF&rdquo; as the destination.
      </Note>
    </>
  );
}

export function Shortcuts() {
  return (
    <>
      <Lead>
        Every shortcut in ForkLeaf. On Windows and Linux, read <Code>⌘</Code> as <Code>Ctrl</Code>.
      </Lead>

      <H2 id="global">Global</H2>
      <Table
        head={["Shortcut", "Does"]}
        rows={[
          [<Code key="a">/</Code>, "Open the insert menu, in any view"],
          [<Code key="b">⌘S</Code>, "Push pending changes to GitHub now, instead of waiting"],
          [<Code key="c">⌘⇧N</Code>, "New note"],
          [<Code key="d">⌘⇧E</Code>, "Export the current note"],
          [<Code key="e">⌘⇧?</Code>, "Open help"],
          [<Code key="f">Esc</Code>, "Close a dialog, the diagram studio, or the insert menu"],
        ]}
      />

      <H2 id="rich">Rich text</H2>
      <Table
        head={["Shortcut", "Does"]}
        rows={[
          [<Code key="a">⌘B</Code>, "Bold"],
          [<Code key="b">⌘I</Code>, "Italic"],
          [<Code key="c">⌘⇧X</Code>, "Strikethrough"],
          [<Code key="d">⌘E</Code>, "Inline code"],
          [<Code key="e">⌘Z / ⌘⇧Z</Code>, "Undo / redo"],
          [<Code key="f"># then space</Code>, "Heading (repeat # for deeper levels)"],
          [<Code key="g">- then space</Code>, "Bullet list"],
          [<Code key="h">1. then space</Code>, "Numbered list"],
          [<Code key="i">&gt; then space</Code>, "Quote"],
          [<Code key="j">``` then space</Code>, "Code block"],
          [<Code key="k">--- then Enter</Code>, "Divider"],
        ]}
      />

      <H2 id="source">Source and split</H2>
      <Table
        head={["Shortcut", "Does"]}
        rows={[
          [<Code key="a">⌘F</Code>, "Find in this note"],
          [<Code key="b">⌘⌥F</Code>, "Find and replace"],
          [<Code key="c">Tab / ⇧Tab</Code>, "Indent / outdent"],
          [<Code key="d">⌘/</Code>, "Toggle a comment on the current line"],
          [<Code key="e">⌥↑ / ⌥↓</Code>, "Move the current line up or down"],
          [<Code key="f">⌘D</Code>, "Select the next occurrence of the selection"],
          [<Code key="g">← / →</Code>, "Move the split divider, when it is focused"],
        ]}
      />

      <H3>In the diagram studio</H3>
      <Table
        head={["Shortcut", "Does"]}
        rows={[
          [<Code key="a">Ctrl Space</Code>, "Force autocomplete"],
          [<Code key="b">Delete</Code>, "Remove the selected node or edge, in the visual builder"],
          [<Code key="c">Double-click</Code>, "Rename a node, in the visual builder"],
          [<Code key="d">Esc</Code>, "Close the studio and return to the note"],
        ]}
      />
    </>
  );
}
