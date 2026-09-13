import { A, Code, H2, H3, Lead, LI, Note, OL, P, Pre, Table, UL } from "@/components/prose";

/**
 * How to use the everyday features, one page each.
 *
 * Every page answers the same three questions: where the button is, what to
 * type, and what ends up in the file — because each of these is a plain
 * markdown file in the end, and knowing that is what makes them trustworthy.
 */

export function SlashMenu() {
  return (
    <>
      <Lead>
        Two ways to find everything ForkLeaf can do: type <Code>/</Code> where you are writing, or
        press <strong>All tools</strong> at the top of the editor.
      </Lead>

      <H2 id="slash">The / menu</H2>
      <P>
        Type <Code>/</Code> at the start of a line, or after a space. A menu opens under the line —
        or above it near the bottom of the window — so what you type stays in view, and the menu
        repeats it at the top.
      </P>
      <Table
        head={["Group", "What is in it"]}
        rows={[
          ["Text", "Headings 1–3, plain text, quote"],
          ["Lists", "Bulleted, numbered, to-do"],
          ["Insert", "Table, divider, image, YouTube video, link, code block, diagram"],
          ["Study", "A flashcard, and reviewing the cards due today"],
          ["Plan", "A to-do with a due date, every open to-do, today's note, this week's review"],
          ["Templates", "A new note from each of your templates, and saving this note as one"],
          ["Capture", "Voice note, web source, importing, everything you saved, the bookmarklet"],
          ["See", "Graph, board, table, focus mode"],
          ["Protect", "Encrypt, lock, remove encryption, lock the note against editing"],
          [
            "History",
            "Version history, replay, who wrote what, deleted notes, the notebook on a date",
          ],
          ["Help", "All tools, connecting an AI assistant, the extension, help"],
          ["Formatting", "Bold, italic, strikethrough, inline code, line break, headings 4–6"],
        ]}
      />
      <UL>
        <LI>
          Keep typing to search every group at once: <Code>/flash</Code>, <Code>/voice</Code>,{" "}
          <Code>/graph</Code>, <Code>/h2</Code>. A group name works too — <Code>/study</Code>.
        </LI>
        <LI>
          <strong>↑ ↓</strong> to choose, <strong>Enter</strong> or <strong>Tab</strong> to use it,{" "}
          <strong>Esc</strong> to close.
        </LI>
        <LI>The same menu works in Rich, Split and Source view.</LI>
      </UL>

      <H2 id="all-tools">All tools</H2>
      <P>
        The <strong>All tools</strong> button (four squares, top right of the editor) opens every
        command as a button, grouped, with a filter box. Each shortcut is shown beside its command,
        so you learn the keyboard route by using the mouse one. <strong>⌘K</strong> is the same list
        again, together with your notes, for when you know what to type.
      </P>
    </>
  );
}

export function Journal() {
  return (
    <>
      <Lead>
        Templates for notes you write often, a note for every day, and a weekly look back.
      </Lead>

      <H2 id="templates">Templates</H2>
      <OL>
        <LI>
          Put any markdown file in a <Code>templates/</Code> folder — or open a note and choose{" "}
          <strong>/ → Save this note as a template</strong>.
        </LI>
        <LI>
          <strong>/ → New note from template: name</strong> (or ⌘K), and give it a title.
        </LI>
      </OL>
      <Table
        head={["Placeholder", "Becomes"]}
        rows={[
          [<Code key="t">{"{{title}}"}</Code>, "The title you typed"],
          [<Code key="d">{"{{date}}"}</Code>, "Today, 2026-09-13"],
          [<Code key="h">{"{{time}}"}</Code>, "Now, 14:05"],
          [<Code key="w">{"{{weekday}}"}</Code>, "Sunday"],
          [<Code key="y">{"{{yesterday}}"}</Code>, "2026-09-12"],
          [<Code key="m">{"{{tomorrow}}"}</Code>, "2026-09-14"],
        ]}
      />
      <P>
        Other <Code>{"{{braces}}"}</Code> are left alone. A template&rsquo;s tags and other
        properties are copied; its title and dates are not.
      </P>

      <H2 id="today">Today&rsquo;s note</H2>
      <P>
        <strong>/ → Open today&rsquo;s note</strong> opens <Code>journal/YYYY-MM-DD.md</Code>,
        making it if needed. Write <Code>templates/daily.md</Code> to decide what a new day starts
        with.
      </P>

      <H2 id="weekly-review">Weekly review</H2>
      <P>
        <strong>/ → Write this week&rsquo;s review</strong> makes <Code>journal/2026-w37.md</Code>{" "}
        and lists:
      </P>
      <UL>
        <LI>the notes you started, worked on and deleted;</LI>
        <LI>overdue and upcoming to-dos, each with a link to its note;</LI>
        <LI>
          <strong>Worth a look</strong> — notes that point at a file or a note that no longer
          exists, and notes the notebook check thinks have gone out of date, each with the reason;
        </LI>
        <LI>
          an empty <strong>Looking back</strong> heading for your own thoughts.
        </LI>
      </UL>
      <P>Running it again the same week opens the one you already have. Weeks start on Monday.</P>
    </>
  );
}

export function Resurfacing() {
  return (
    <>
      <Lead>
        A few older notes worth reading again, chosen for what you are working on — so notes you
        wrote to use later actually get used.
      </Lead>

      <H2 id="where">Where to find them</H2>
      <UL>
        <LI>
          <strong>Worth revisiting</strong> in the document panel, below Links. Click one to open
          it.
        </LI>
        <LI>
          <strong>/ → Open a note worth revisiting</strong> opens the first one.
        </LI>
      </UL>

      <H2 id="how">How they are chosen</H2>
      <OL>
        <LI>
          Notes linked to the one you have open — either way — that nobody has edited for a month.
          The context you already decided was related.
        </LI>
        <LI>Notes written on this day in an earlier year.</LI>
        <LI>Notes that have gone longest without an edit, a different few each day.</LI>
      </OL>
      <P>
        Each says why it was chosen — <em>Linked from this note · last edited 7 months ago</em>, or{" "}
        <em>Written a year ago today</em>. The list holds still for the whole day while the same
        note is open, so it is something to act on rather than something that shuffles.
      </P>
      <Note>
        Templates, the flashcard schedule, encrypted notes and anything edited in the last month are
        never suggested. A new notebook has nothing to show until its notes are a month old.
      </Note>
    </>
  );
}

export function Tasks() {
  return (
    <>
      <Lead>
        To-dos live in your notes as ordinary check boxes, and one list shows all of them.
      </Lead>

      <H2 id="write">Writing a to-do</H2>
      <P>
        Type <Code>/todo</Code> for a checklist, or <Code>/to-do with a date</Code> for one due
        tomorrow. In the file it is GitHub&rsquo;s task syntax:
      </P>
      <Pre label="in your note">{`- [ ] Send the invoice 📅 2026-09-14
- [ ] Book the venue due: 2026-09-20
- [x] Draft the agenda`}</Pre>
      <P>
        A date is <Code>📅 YYYY-MM-DD</Code> or <Code>due: YYYY-MM-DD</Code> — the same as the
        Obsidian Tasks plugin.
      </P>

      <H2 id="list">Every open to-do</H2>
      <UL>
        <LI>
          <strong>/ → Show every open to-do</strong> lists every unticked box in the notebook,
          overdue first.
        </LI>
        <LI>Tick one in the list and it is ticked in its note.</LI>
        <LI>To-dos in code blocks and in templates/ are ignored.</LI>
      </UL>
    </>
  );
}

export function Flashcards() {
  return (
    <>
      <Lead>
        Flashcards turn what is in your notes into things you remember. You see a question, try to
        recall the answer, then say how well you knew it — and ForkLeaf shows each card again just
        before you would forget it.
      </Lead>

      <H2 id="start">Where to start</H2>
      <P>
        <strong>/ → Flashcards</strong> (or ⌘K → <strong>Flashcards</strong>) opens the flashcards
        home. It shows how many cards are waiting today, explains how it works, and has everything
        below in one place.
      </P>

      <H2 id="make">Making cards</H2>
      <H3>1. Type one in</H3>
      <P>
        In <strong>Add a card</strong>, write the question and the answer, pick where to keep it in{" "}
        <strong>Save to</strong>, and press <strong>Add card</strong>. Your first card goes into a
        new note, <Code>flashcards/Flashcards.md</Code>. No syntax to learn.
      </P>
      <H3>2. Let your note suggest them</H3>
      <P>
        With a note open, <strong>Cards from “your note”</strong> lists the definitions it already
        contains — a bold term with its meaning, a list of <em>term — meaning</em> lines, a heading
        that asks a question and the paragraph under it. Untick any you do not want and press{" "}
        <strong>Add cards to this note</strong>. They are written under a <Code>## Flashcards</Code>{" "}
        heading at the end of the note.
      </P>
      <Pre label="a note that suggests three cards">{`**Osmosis**: water moving across a membrane
- Ribosome — makes proteins from RNA

## What is DNA?
The molecule that carries genetic instructions.`}</Pre>
      <H3>3. Write them in a note</H3>
      <Table
        head={["Write", "You get"]}
        rows={[
          [<Code key="1">Capital of Portugal :: Lisbon</Code>, "A card: question, then answer"],
          [<Code key="2">What is H2O?::Water</Code>, "The same, without spaces"],
          [<Code key="3">Hola ::: Hello</Code>, "Two cards, one each way"],
          [
            <Code key="4">Lisbon is the capital of ==Portugal==</Code>,
            "A fill-in-the-blank card, in notes tagged flashcards",
          ],
        ]}
      />
      <P>
        For a card over several lines, put the question, a line holding only <Code>?</Code>, then
        the answer. Code blocks, tables and headings are never cards.
      </P>

      <H2 id="study">Studying</H2>
      <OL>
        <LI>
          Press <strong>Study N cards</strong> for everything due, or <strong>Study</strong> beside
          one deck — every note with cards in it is a deck.
        </LI>
        <LI>
          Read the question and try to remember. Press <strong>Show answer</strong> (or{" "}
          <strong>Space</strong>).
        </LI>
        <LI>
          Say how well you knew it: <strong>Again</strong> (forgot it), <strong>Hard</strong>{" "}
          (barely), <strong>Good</strong> (knew it) or <strong>Easy</strong> (too easy) — or press{" "}
          <strong>1</strong>–<strong>4</strong>. Each button says when the card comes back.
        </LI>
      </OL>
      <P>
        A card you forget comes round again before the session ends. Cards you know come back in
        days, then weeks, then months. Nothing due? <strong>Practise</strong> a deck anyway.
      </P>

      <H2 id="schedule">Where the schedule is kept</H2>
      <P>
        In <Code>reviews/flashcards.md</Code>, a table with one row per card, so it syncs to every
        device and has history. Delete a row to start that card over.
      </P>
    </>
  );
}

export function Views() {
  return (
    <>
      <Lead>
        See the notebook as a map, a board or a spreadsheet — or see nothing but the note.
      </Lead>

      <H2 id="graph">Graph</H2>
      <UL>
        <LI>
          <strong>/ → Show the graph of my notes</strong>. Every note is a dot; every{" "}
          <Code>[[link]]</Code> is a line.
        </LI>
        <LI>
          It opens on the notes within two links of the one you are in.{" "}
          <strong>Whole notebook</strong> shows everything.
        </LI>
        <LI>
          Scroll to zoom, drag to move, point at a note to light up its neighbours, click to open.
        </LI>
      </UL>

      <H2 id="board">Board</H2>
      <UL>
        <LI>
          <strong>/ → Show this folder as a board</strong>: notes in columns by their{" "}
          <Code>status</Code> property, or any other property from <strong>Columns from</strong>.
        </LI>
        <LI>Drag a card to another column and that note&rsquo;s property changes.</LI>
      </UL>

      <H2 id="table">Table</H2>
      <UL>
        <LI>
          <strong>/ → Show this folder as a table</strong>: one row per note, one column per
          property.
        </LI>
        <LI>Click a header to sort, type in Filter to narrow, click a cell to edit it.</LI>
      </UL>
      <Note>
        The board and table store nothing of their own. Every change is written into the
        note&rsquo;s front matter.
      </Note>

      <H2 id="focus">Focus mode</H2>
      <P>
        <strong>⌘⇧F</strong> (or <strong>/ → Enter focus mode</strong>) hides the file tree, tabs,
        side panel and status bar. Press it again, or <strong>Leave focus</strong>, to get your
        layout back.
      </P>
    </>
  );
}

export function Saving() {
  return (
    <>
      <Lead>
        Keep pages, quotes, links and pictures from anywhere on the web — in a repository kept just
        for them, filed without you doing anything.
      </Lead>

      <H2 id="ways">Three ways to save</H2>
      <UL>
        <LI>
          <strong>The extension:</strong> the toolbar button or Alt+Shift+S, or right-click a
          selection, link or picture. <A href="/docs/browser-extension">Install it</A>.
        </LI>
        <LI>
          <strong>On a phone:</strong> add ForkLeaf to your home screen from the browser menu, then
          use <strong>Share → ForkLeaf</strong> in any app.
        </LI>
        <LI>
          <strong>The bookmarklet:</strong>{" "}
          <strong>/ → Copy the Save to ForkLeaf bookmarklet</strong>, make a bookmark, and paste it
          as the address. Press it on any page.
        </LI>
      </UL>
      <P>
        Each opens ForkLeaf&rsquo;s save page, which shows exactly what will be saved and where. You
        can change the title. Nothing is written until you press <strong>Save</strong>, because
        anyone can put the save address in a link.
      </P>

      <H2 id="repository">Where saves go</H2>
      <P>
        Signed in with GitHub, the first save creates a private repository called{" "}
        <Code>forkleaf-saves</Code>. Saves never go into your notebooks. Each is filed by kind, then
        year and month, with the date at the front of its name:
      </P>
      <Pre label="forkleaf-saves">{`INDEX.md                 everything, newest first, by month and kind
index.json               the same list, for the app
pages/2026/09/2026-09-13-how-rivers-move.md
quotes/2026/09/2026-09-13-cities-are-for-people.md
links/2026/09/2026-09-12-a-good-reading-list.md
images/2026/09/2026-09-11-sunset-over-lisbon.md`}</Pre>
      <UL>
        <LI>
          Every file has the address, the site, the kind and the date in its front matter, and reads
          well on github.com.
        </LI>
        <LI>
          Save the same page or link twice and ForkLeaf says when you saved it, with a choice to
          save it again. Quotes can always be saved again.
        </LI>
        <LI>
          Not signed in? The save page offers to sign in, or{" "}
          <strong>Keep it on this device instead</strong>, which puts it in the open
          notebook&rsquo;s <Code>inbox/</Code>.
        </LI>
      </UL>

      <H2 id="grid">Everything you saved</H2>
      <P>
        <strong>/ → Show everything I saved</strong> shows your saves — from the repository and from{" "}
        <Code>inbox/</Code> — as a grid: quotes as quotes, pictures as pictures, newest first.
        Filter by kind or search inside all of them. A card opens its file;{" "}
        <strong>Original</strong> opens the page it came from.
      </P>
    </>
  );
}

export function VoiceNotes() {
  return (
    <>
      <Lead>Record into a note. The recording is kept beside it and plays in the preview.</Lead>
      <OL>
        <LI>
          <strong>/ → Record a voice note</strong>, then <strong>Start recording</strong>.
        </LI>
        <LI>
          <strong>Stop</strong>, listen back, record again if you like.
        </LI>
        <LI>
          <strong>Add to note</strong>. The file goes in <Code>assets/</Code> and a{" "}
          <strong>Listen to the recording</strong> link is added to the end of the note.
        </LI>
      </OL>
      <UL>
        <LI>In Split and Source view and on published pages the link plays as an audio player.</LI>
        <LI>Up to 10 minutes a recording.</LI>
        <LI>
          <strong>Write a transcript as well</strong> is off by default: your browser does the
          transcribing, and Chrome sends the audio to Google to do it.
        </LI>
        <LI>Not offered in an encrypted note, whose recording would be stored unencrypted.</LI>
      </UL>
    </>
  );
}

export function EncryptedNotes() {
  return (
    <>
      <Lead>Seal a note so only its passphrase can read it — here, on GitHub, anywhere.</Lead>
      <OL>
        <LI>
          <strong>/ → Encrypt this note…</strong>
        </LI>
        <LI>
          Choose a passphrase, type it twice, and tick that you understand it cannot be recovered.
        </LI>
      </OL>
      <UL>
        <LI>
          The words, title and tags are sealed with AES-256-GCM.{" "}
          <strong>The filename is not</strong> — rename the note first if the name is private.
        </LI>
        <LI>
          Opening it asks for the passphrase; it then edits normally until you close the tab or
          choose <strong>/ → Lock this encrypted note</strong>.
        </LI>
        <LI>
          <strong>/ → Remove encryption from this note</strong> writes it back as plain text.
        </LI>
        <LI>Search, backlinks, to-dos and AI assistants do not see inside it.</LI>
      </UL>
      <Note kind="warn">
        Nobody can recover a forgotten passphrase — not ForkLeaf, not GitHub. Keep it somewhere
        safe.
      </Note>
    </>
  );
}

export function Importing() {
  return (
    <>
      <Lead>Bring an Obsidian vault or a Notion export across, links and pictures included.</Lead>
      <OL>
        <LI>
          <strong>/ → Import notes from Obsidian or Notion</strong>.
        </LI>
        <LI>Pick where it comes from, and the folder it goes into.</LI>
        <LI>
          <strong>Choose folder…</strong>, check what will come across, then <strong>Import</strong>
          .
        </LI>
      </OL>
      <H3>Obsidian</H3>
      <P>
        Choose the vault folder. Folders and front matter come across as they are;{" "}
        <Code>![[picture.png]]</Code> becomes an ordinary image and <Code>![[Note]]</Code> a{" "}
        <Code>[[Note]]</Code> link. <Code>.obsidian</Code> and <Code>.trash</Code> are left behind.
      </P>
      <H3>Notion</H3>
      <P>
        In Notion: <strong>Settings → Export all workspace content → Markdown &amp; CSV</strong>.
        Unzip it and choose the folder. The long ids Notion adds to names are removed and links are
        rewritten to match. Database tables (CSV) are skipped, and the import says so.
      </P>
      <P>
        Nothing already in the notebook is overwritten. Pictures, PDFs and recordings are copied;
        anything else, and any file over 3 MB, is listed as left out.
      </P>
    </>
  );
}

export function RunningCode() {
  return (
    <>
      <Lead>
        Run <Code>bash</Code>, <Code>python</Code> and <Code>javascript</Code> blocks where they are
        written, and keep the output in the note.
      </Lead>

      <H2 id="run">Running a block</H2>
      <OL>
        <LI>
          Type <Code>/code</Code> and pick the language from the dropdown on the block.
        </LI>
        <LI>
          Press <strong>Run</strong>. The output is written into an <Code>output</Code> block
          underneath, stamped with when it ran. Running again replaces it.
        </LI>
      </OL>

      <H2 id="input">Programs that ask for input</H2>
      <P>
        A program that reads input — <Code>input()</Code> in Python, <Code>read</Code> in a shell,{" "}
        <Code>process.stdin</Code> or <Code>readline</Code> in JavaScript — needs its answers before
        it runs, because nobody is at a keyboard inside the machine it runs on.
      </P>
      <Pre label="in your note">{`\`\`\`python
name = input("What is your name? ")
age = int(input("How old are you? "))
print(f"Hello {name}, next year you will be {age + 1}")
\`\`\``}</Pre>
      <OL>
        <LI>
          Press <strong>Run</strong>. ForkLeaf sees the program reads input and opens{" "}
          <strong>Program input</strong> instead of running it.
        </LI>
        <LI>
          Type the answers, one per line — here <Code>Ada</Code>, then <Code>36</Code>.
        </LI>
        <LI>
          Press <strong>Run</strong> again. Each line is what the program reads the next time it
          asks.
        </LI>
      </OL>
      <UL>
        <LI>
          <strong>Input</strong> in the block&rsquo;s header opens or closes the box at any time. It
          shows <strong>Input ✓</strong> when there is something in it.
        </LI>
        <LI>
          If a program stops because it ran out of input, the box opens and says so. Add the missing
          lines and run again.
        </LI>
        <LI>The input is not saved in the note — only the output is.</LI>
      </UL>

      <H2 id="where">Where the code runs</H2>
      <P>
        In a throwaway virtual machine made for the one run and destroyed afterwards — never on your
        computer. It has internet access, and a run can take up to 30 seconds.
      </P>
    </>
  );
}

export function AskNotebook() {
  return (
    <>
      <Lead>
        Ask a question and get back the passages in your notes that answer it — quoted, with the
        note, the heading and the line each came from.
      </Lead>

      <H2 id="use">Asking</H2>
      <OL>
        <LI>
          <strong>/ → Ask your notebook</strong>, or ⌘K → <strong>Ask your notebook</strong>.
        </LI>
        <LI>
          Type a question — <em>When do we launch the beta?</em> — and press <strong>Ask</strong>.
        </LI>
        <LI>
          Read the quoted passages, best answer first. The words that matched are highlighted.
        </LI>
        <LI>
          <strong>Open at line N</strong> opens the note there: Split and Source scroll to the line,
          Rich text scrolls to the paragraph.
        </LI>
      </OL>

      <H2 id="how">How it works</H2>
      <UL>
        <LI>
          Every paragraph and list item is a possible answer. Passages that contain more of the
          question beat ones that repeat one word, rare words count for more than common ones, and
          the note&rsquo;s title and the heading above a passage count a little.
        </LI>
        <LI>
          Word forms meet — <Code>shipping</Code>, <Code>ships</Code> and <Code>shipped</Code> all
          find <Code>ship</Code> — and words every sentence has (<Code>what</Code>, <Code>the</Code>
          ) are ignored.
        </LI>
        <LI>At most two passages come from one note, so one long note cannot fill the list.</LI>
      </UL>
      <Note>
        No AI writes the answer. Everything shown is something you wrote, so it cannot say anything
        your notes do not — and your notes never leave this device to be asked about. Code blocks,
        templates and encrypted notes are never quoted.
      </Note>
    </>
  );
}

export function MeetingNotes() {
  return (
    <>
      <Lead>
        Take notes in a meeting, or record it, and end with the three lists anybody needs a week
        later: what was decided, who is doing what, and what is still open.
      </Lead>

      <H2 id="start">Starting</H2>
      <P>
        <strong>/ → Start meeting notes</strong> makes a dated note in <Code>meetings/</Code> with
        Date, Attendees, Agenda and Notes. Rename it to what the meeting is about. To record
        instead, use <strong>/ → Record a voice note</strong> with a transcript.
      </P>

      <H2 id="write">Writing so it can be gathered</H2>
      <Table
        head={["Write", "Becomes"]}
        rows={[
          [<Code key="1">Decision: ship the beta on 2026-10-03</Code>, "A decision"],
          [<Code key="2">We agreed to keep the free plan</Code>, "A decision"],
          [
            <Code key="3">Action: Sam to draft the announcement by 2026-09-20</Code>,
            "A to-do for Sam, due that day",
          ],
          [<Code key="4">@Priya will book the venue</Code>, "A to-do for Priya"],
          [<Code key="5">Leo will review the pricing page</Code>, "A to-do for Leo"],
          [<Code key="6">Question: do we need a waitlist?</Code>, "An open question"],
        ]}
      />
      <P>
        Transcript lines like <Code>**Ana:** Action: send the survey</Code> give the action to the
        speaker. Lists, quotes and bold are read through; code blocks, headings and existing check
        boxes are left alone.
      </P>

      <H2 id="gather">Gathering</H2>
      <P>
        <strong>/ → Pull out decisions and to-dos</strong> writes a <strong>Summary</strong> at the
        end of the note, with <strong>Decisions</strong>, <strong>Action items</strong> and{" "}
        <strong>Open questions</strong>. Action items are check boxes with the owner and date, so
        they appear in <strong>Show every open to-do</strong> and the weekly review.
      </P>
      <P>
        Run it again after more notes and the summary is replaced, not repeated — it sits under its
        own heading, Meeting summary, and is never read back in as notes.
      </P>
    </>
  );
}

export function Canvases() {
  return (
    <>
      <Lead>
        A board for thinking in space: cards, notes, links and groups placed anywhere and joined
        with arrows — saved as a <Code>.canvas</Code> file that opens in Obsidian too.
      </Lead>

      <H2 id="start">Making one</H2>
      <UL>
        <LI>
          <strong>/ → New canvas</strong> makes <Code>canvases/Canvas 2026-09-13.canvas</Code> and
          opens it. Rename the file in the sidebar like any other.
        </LI>
        <LI>
          Click a <Code>.canvas</Code> file in the sidebar, or ⌘K →{" "}
          <strong>Open canvas: name</strong>, to open one.
        </LI>
      </UL>

      <H2 id="cards">Cards</H2>
      <Table
        head={["To", "Do this"]}
        rows={[
          ["Add a card", "Add card, or double-click empty space. Type straight away."],
          [
            "Edit a card",
            "Double-click it, or select it and press Enter or Edit. Click the background or press Esc when done.",
          ],
          [
            "Put a note on the board",
            "Add a note… — the card shows its title and first lines; Open note opens it",
          ],
          ["Add a link", "Paste an address into Paste a link… and press Add link"],
          ["Group cards", "Add group, then drag cards inside it. Moving the group moves them."],
          ["Colour", "Select cards, then pick one of the six colours, or No colour"],
          ["Delete", "Select, then Delete or Backspace — its arrows go with it"],
        ]}
      />

      <H2 id="moving">Moving around</H2>
      <UL>
        <LI>Drag a card to move it; Shift-click to select several and drag them together.</LI>
        <LI>Drag the square in a selected card&rsquo;s corner to resize it.</LI>
        <LI>
          Drag the dot on a selected card&rsquo;s right edge onto another card to draw an arrow.
          Click an arrow to select it.
        </LI>
        <LI>
          Drag the background to move the board. Scroll to pan; pinch, or ⌘/Ctrl-scroll, to zoom.{" "}
          <strong>Fit</strong> shows everything.
        </LI>
      </UL>

      <H2 id="file">The file</H2>
      <P>
        Every change is saved a moment later. The file is{" "}
        <A href="https://jsoncanvas.org">JSON Canvas</A>, the open format Obsidian uses, so a board
        made here opens there and the other way round, and fields another app wrote are kept. A file
        that is not a canvas is never opened as an empty board, so it cannot be overwritten by
        accident.
      </P>
    </>
  );
}
