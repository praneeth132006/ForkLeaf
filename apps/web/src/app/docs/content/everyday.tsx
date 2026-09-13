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
        Write a card in any note, and ForkLeaf shows it again just before you would forget it.
      </Lead>

      <H2 id="write">Writing cards</H2>
      <P>
        Type <Code>/flashcard</Code>, or write any of these. They work in Rich, Split and Source
        view, and they are the same spellings Obsidian&rsquo;s spaced-repetition plugin reads.
      </P>
      <Table
        head={["Write", "You get"]}
        rows={[
          [<Code key="1">Capital of Portugal :: Lisbon</Code>, "A card: question, then answer"],
          [
            <Code key="2">What is H2O?::Water</Code>,
            "The same, without spaces — when the question has several words or a question mark",
          ],
          [<Code key="3">Hola ::: Hello</Code>, "Two cards, one each way"],
          [
            <Code key="4">Lisbon is the capital of ==Portugal==</Code>,
            "A fill-in-the-blank card for each highlight, in notes tagged flashcards",
          ],
        ]}
      />
      <H3>A card over several lines</H3>
      <P>
        Put the question, then a line holding only <Code>?</Code>, then the answer, with no blank
        lines between them. Use <Code>??</Code> for a card each way.
      </P>
      <Pre label="in your note">{`What are the primary colours?
?
red
yellow
blue`}</Pre>
      <P>
        Formatting, links and escaped characters show as plain words on the card, so{" "}
        <Code>2 * 3 :: 6</Code> reads as written. Lines in code blocks, tables and headings are
        never cards, and <Code>std::vector</Code> is safe. A card written twice is asked once.
      </P>
      <Note>
        Highlights become blanks only in notes tagged <Code>flashcards</Code> — in the Tags field,
        or with <Code>#flashcards</Code> in the text — so highlighting for emphasis elsewhere makes
        no cards.
      </Note>

      <H2 id="review">Reviewing</H2>
      <OL>
        <LI>
          <strong>/ → Review flashcards</strong> shows the cards due today, then new ones — up to 20
          a session.
        </LI>
        <LI>
          Read the question and press <strong>Show answer</strong> (or <strong>Space</strong>).
        </LI>
        <LI>
          Grade it <strong>Again</strong>, <strong>Hard</strong>, <strong>Good</strong> or{" "}
          <strong>Easy</strong> (or <strong>1</strong>–<strong>4</strong>). Each button says when
          the card will come back; a card you forgot comes round again before the session ends.
        </LI>
      </OL>

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
