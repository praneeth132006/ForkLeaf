import { Code, H2, Lead, LI, Note, OL, P, Pre, Table, UL } from "@/components/prose";

/**
 * Writing well, studying and checking: the features that read the whole
 * notebook back to you. One page each, answering the same three questions as
 * every other page — where the button is, what to do, and what ends up in the
 * file.
 */

export function Spelling() {
  return (
    <>
      <Lead>
        Misspelt words get a wavy underline as you type, with the likely corrections a tap away — in
        rich text, split and source view. Everything is checked on this device.
      </Lead>

      <H2 id="use">Using it</H2>
      <UL>
        <LI>
          Finish a misspelt word — type the space or full stop after it — and a small bubble opens
          under it with up to five corrections, best first. Pick one and the word is replaced, in
          the case you typed it: <Code>Teh</Code> becomes <Code>The</Code>.
        </LI>
        <LI>Click, tap or arrow into any underlined word to open the bubble again.</LI>
        <LI>
          <strong>Add to dictionary</strong> keeps a word for good in this browser;{" "}
          <strong>Ignore</strong> leaves it alone until the page is reloaded. <strong>Esc</strong>{" "}
          closes the bubble.
        </LI>
        <LI>
          ⌘K → <strong>Turn spelling suggestions off</strong> (or on). The browser&rsquo;s own
          checker takes over while it is off.
        </LI>
      </UL>

      <H2 id="what">What is checked</H2>
      <P>
        Prose. Code, link addresses, file names, paths, email addresses, <Code>#tags</Code>,{" "}
        <Code>@mentions</Code>, acronyms (<Code>API</Code>) and mixed-case names (
        <Code>GitHub</Code>, <Code>iPhone</Code>) are never underlined, and neither is the word you
        are still typing. Everyday software words the dictionary lacks — backend, repo, config,
        todo, wikilink — are known out of the box.
      </P>
      <Note>
        The English Hunspell dictionary runs in a worker in your browser, served by ForkLeaf itself.
        Nothing you type is sent anywhere to be checked. English only, for now.
      </Note>
    </>
  );
}

export function Glossary() {
  return (
    <>
      <Lead>
        Define a term once, anywhere, the way you already would, and it explains itself wherever it
        appears in any note.
      </Lead>

      <H2 id="define">Defining a term</H2>
      <Pre label="Any of these defines a term">{`**Idempotent** means running it twice changes nothing.
**An event loop** is the scheduler that runs callbacks one at a time.
- **CAP theorem**: a distributed store can't have all three.

## Glossary
- Backlink: a link pointing at this note
- Wikilink — a [[double bracket]] link`}</Pre>
      <P>
        A bold term at the start of a sentence followed by <em>is</em>, <em>are</em>, <em>means</em>
        , <em>refers to</em>, <em>describes</em>, <em>stands for</em>, a colon or a dash; or any{" "}
        <Code>Term: definition</Code> line under a heading called Glossary, Definitions, Terms or
        Vocabulary.
      </P>

      <H2 id="read">Reading</H2>
      <UL>
        <LI>
          The term gets a faint dotted underline wherever it appears in rich text. Hover it — or tap
          it on a phone — for the definition and the note it is defined in, which opens at the line.
        </LI>
        <LI>
          Plurals and possessives match (<Code>APIs</Code>, <Code>API&rsquo;s</Code>), the longest
          term wins (<em>event loop</em> over <em>event</em>), and acronyms match only in capitals,
          so <Code>IT</Code> never underlines <em>it</em>.
        </LI>
        <LI>
          ⌘K → <strong>Glossary</strong> lists every term A to Z with every definition, filterable.
          A term defined in two notes shows both — worth knowing when they disagree.
        </LI>
        <LI>
          ⌘K → <strong>Stop underlining glossary terms</strong> switches the underlines off.
        </LI>
      </UL>
    </>
  );
}

export function Contradictions() {
  return (
    <>
      <Lead>
        Find the places your notes disagree with each other — written months apart, in different
        notes, and never noticed.
      </Lead>
      <P>
        ⌘K → <strong>Find contradictions in my notes</strong> compares every sentence in the
        notebook and lists pairs that say nearly the same thing but differ in one of three ways:
      </P>
      <Table
        head={["Kind", "Example"]}
        rows={[
          ["Different figures", "“…founded in Berlin in 2019” and “…founded in Berlin in 2021”"],
          [
            "Said, then denied",
            "“The staging database is backed up nightly” and “…is not backed up…”",
          ],
          ["Opposite words", "“Conversion rose sharply…” and “Conversion fell sharply…”"],
        ]}
      />
      <UL>
        <LI>
          Each pair is shown side by side with what differs marked, and both open at the line.
        </LI>
        <LI>
          <strong>Not a contradiction</strong> hides a pair for good on this device — two different
          years about two different things are fine.
        </LI>
        <LI>
          Code, front matter, headings, flashcards, templates and encrypted notes are left out.
        </LI>
      </UL>
      <Note>
        It compares words, not meaning, so it says where to look and never which sentence is right.
        Nothing leaves the device.
      </Note>
    </>
  );
}

export function ArgumentMap() {
  return (
    <>
      <Lead>
        See the shape of an essay: what it claims, the reasons it gives, the evidence behind each,
        and the objections — drawn as a canvas, with the weak reasons in red.
      </Lead>
      <P>
        Type <strong>/ → Map the argument</strong> where you want the map. It is an ordinary canvas
        block, so every card can be moved afterwards.
      </P>
      <Table
        head={["Becomes", "From"]}
        rows={[
          [
            "The claim (purple)",
            "A Claim: or Thesis: line, else the # title, else the first sentence",
          ],
          ["Reasons", "Each ## section, or sentences starting Because, First, Moreover, Also…"],
          [
            "Evidence (cyan)",
            "Sentences with a link, a citation, a figure, a quotation, or “a study found…”",
          ],
          [
            "Objections (orange)",
            "However…, Critics argue…, and sections called Objections, Risks or Limitations",
          ],
        ]}
      />
      <P>
        A reason with no evidence under it is drawn in red, with <em>No evidence yet</em> on the
        card — that is the part a reader will push on first. Explicit <Code>Reason:</Code>,{" "}
        <Code>Evidence:</Code>, <Code>Objection:</Code> and <Code>Rebuttal:</Code> labels always
        win.
      </P>
    </>
  );
}

export function Exam() {
  return (
    <>
      <Lead>
        A timed mock exam from your own notes, marked, with a list of exactly what to reread.
      </Lead>
      <OL>
        <LI>
          ⌘K → <strong>Take an exam on my notes</strong>, or <strong>/ → Study</strong>.
        </LI>
        <LI>
          Choose a folder (or the whole notebook), how many questions (5–30) and a time limit.
        </LI>
        <LI>
          Answer each question by typing. ⌘↵ moves on; <strong>Back</strong> revisits;{" "}
          <strong>Hand in now</strong> finishes early. When time runs out the paper is handed in.
        </LI>
        <LI>
          The marks show every miss beside what the notes say, each opening the note at the line.
        </LI>
      </OL>

      <H2 id="questions">Where the questions come from</H2>
      <Table
        head={["Question", "Made from", "Marked by"]}
        rows={[
          [
            "A card",
            <Code key="c">Question :: Answer</Code>,
            "The same check as typed flashcard review",
          ],
          [
            "What does X mean?",
            "Every term your notes define",
            "How much of the definition came back",
          ],
          [
            "Explain X",
            "Any ## section with a few sentences under it",
            "The share of its key ideas you covered, like Explain it back",
          ],
        ]}
      />

      <H2 id="results">The results note</H2>
      <P>
        <strong>Save results as a note</strong> writes{" "}
        <Code>exams/&lt;time&gt; &lt;folder&gt; exam.md</Code> with the score, a{" "}
        <em>To go over again</em> checklist linking straight to the heading to reread, and every
        question with your answer and the notes&rsquo; own. <strong>Retake this paper</strong> asks
        the same questions again; <strong>New exam</strong> draws a fresh set.
      </P>
    </>
  );
}

export function LiveCode() {
  return (
    <>
      <Lead>
        Explain a function in a note and the note tells you when the function changes — with what
        changed, and one click to bring the note up to date.
      </Lead>
      <OL>
        <LI>
          <strong>/ → Live code from a repository</strong>.
        </LI>
        <LI>
          Give the file, and a function or class name — or a range of lines. Leave the repository
          empty for this notebook&rsquo;s, or name any <Code>owner/name</Code>.
        </LI>
        <LI>
          <strong>Embed</strong>. The code is fetched and a copy kept in the note.
        </LI>
      </OL>
      <P>Each time the note is opened, the current code is fetched and compared with the copy:</P>
      <UL>
        <LI>
          <strong>Matches the repository</strong>, with the lines it is on and{" "}
          <strong>Open on GitHub</strong>.
        </LI>
        <LI>
          <strong>The code has changed since this note was written</strong>, with{" "}
          <strong>Show what changed</strong> (a line diff) and <strong>Update the note</strong>.
        </LI>
        <LI>A plain sentence when the function or the file is gone — the copy stays.</LI>
      </UL>
      <Pre label="What the note holds">
        {
          "```live-code\nrepo: acme/api\npath: src/lib/auth.ts\nsymbol: login\n---\nexport async function login(user, password) {\n  …\n}\n```"
        }
      </Pre>
      <P>
        The copy is what makes it portable: on github.com or in Obsidian the block is still the code
        it explains. Functions are found by how each language declares them — TypeScript and
        JavaScript (including arrow functions and methods), Python, Go, Rust, Java, Kotlin, Swift,
        the C family and Ruby — with the comment above them.
      </P>
    </>
  );
}

export function Pictures() {
  return (
    <>
      <Lead>
        Turn the words in a picture into text you can search and link: a screenshot, a slide, a
        whiteboard — or a page of a paper book, photographed with your phone.
      </Lead>

      <H2 id="text">Text from a picture</H2>
      <OL>
        <LI>
          ⌘K → <strong>Text from a picture</strong>, or <strong>/ → Capture</strong>.
        </LI>
        <LI>Paste a screenshot, drop a picture, or choose one.</LI>
        <LI>
          Check the text — paragraphs are rejoined where the column wrapped, bullets become a list —
          and correct anything misread.
        </LI>
        <LI>
          <strong>Add to the note</strong> puts it at the end of the note, with the picture or
          without it.
        </LI>
      </OL>

      <H2 id="books">Quote from a book</H2>
      <OL>
        <LI>
          ⌘K → <strong>Quote from a book (photo)</strong>. On a phone,{" "}
          <strong>Take a photo of the page</strong> opens the camera.
        </LI>
        <LI>
          Tap the lines worth keeping — shift-click for a run of them — and fix any misreading.
        </LI>
        <LI>
          Name the book and the page, and <strong>Keep this quote</strong>.
        </LI>
      </OL>
      <Pre label="books/dune.md">
        {
          '---\ntitle: "Dune"\ntype: book\nauthor: "Frank Herbert"\n---\n\n# Dune\n\n> I must not fear. Fear is the mind-killer.\n> — p. 8 · 2026-10-12'
        }
      </Pre>
      <P>
        Book notes are found by spaced reading, so every quote comes back to be reread alongside
        your PDF highlights. The photo itself is not kept.
      </P>
      <Note>
        Both read the picture on this device, with Tesseract running in your browser. The first use
        in a visit downloads the reader (about 7 MB, then cached); nothing about the picture is sent
        anywhere.
      </Note>
    </>
  );
}

export function Following() {
  return (
    <>
      <Lead>
        Follow the notebooks of people whose notes you learn from, see what they have written
        lately, and keep any passage in your own notes — credited, with a link back.
      </Lead>
      <OL>
        <LI>
          ⌘K → <strong>Notebooks I follow</strong>.
        </LI>
        <LI>
          Type <Code>owner/name</Code> or paste a GitHub address and press <strong>Follow</strong>.
          Any public repository of Markdown notes works.
        </LI>
        <LI>
          Each notebook lists the notes it added or changed since you last caught up (the last two
          weeks, the first time). Open one to read it with the new paragraphs marked.
        </LI>
        <LI>
          <strong>Add to my note</strong> quotes a paragraph at the end of the note you have open,
          with a permanent link to the exact commit and line. <strong>Caught up</strong> clears the
          list.
        </LI>
      </OL>
      <Pre label="What a borrowed paragraph looks like">
        {
          "> Buses come every five minutes.\n>\n> — from [cities](https://github.com/ada/notes/blob/9f2c…/ideas/cities.md#L5) by @ada"
        }
      </Pre>
      <P>
        Who you follow is an ordinary note, <Code>following.md</Code> — remove a line to unfollow.
        When you last caught up is kept on this device. Needs a GitHub sign-in.
      </P>
    </>
  );
}

export function CourseWebsite() {
  return (
    <>
      <Lead>
        Publish a folder as a course: lessons in order, progress for every visitor, and a quiz at
        the end — on GitHub Pages, from your own repository.
      </Lead>
      <OL>
        <LI>
          Right-click a folder → <strong>Publish as course website…</strong> (or tick{" "}
          <strong>Publish as a course</strong> in <strong>Publish as book…</strong>).
        </LI>
        <LI>
          Check the lesson order, then <strong>Publish book</strong>.
        </LI>
      </OL>
      <UL>
        <LI>
          Lessons are ordered by what builds on what — a note comes after the notes it links to, and
          an <Code>index.md</Code> or <Code>README.md</Code> opens the course.
        </LI>
        <LI>
          Every lesson has a progress bar and <strong>Mark this lesson done</strong>; the contents
          page ticks off finished lessons.
        </LI>
        <LI>
          <Code>quiz.html</Code> asks up to 30 of the folder&rsquo;s flashcards, answers behind a
          click, scores them, and links back to the lessons to go over again.
        </LI>
      </UL>
      <Note>
        Progress is kept in each visitor&rsquo;s own browser. The site is still plain static files,
        and the pages read fine with scripts off.
      </Note>
    </>
  );
}

export function StudyRooms() {
  return (
    <>
      <Lead>
        Study a shared deck with other people: a leaderboard of everybody studying it, kept in the
        deck&rsquo;s own GitHub Discussions.
      </Lead>
      <OL>
        <LI>
          In a note with a shared or copied deck (<strong>/ → Flashcards: shared deck</strong>),
          press <strong>Study room</strong>.
        </LI>
        <LI>
          See everybody in the room, ranked by cards reviewed this week, then streak, then how much
          of the deck they have mastered.
        </LI>
        <LI>
          <strong>Share my progress</strong> joins — and opens the room, if nobody has. Sharing
          again updates your one line rather than adding another.
        </LI>
      </OL>
      <Pre label="Your line in the room">
        {"Reviewed 38 cards this week · 5-day streak · 40 of 60 cards mastered"}
      </Pre>
      <P>
        Only that line is shared — nothing else from your notebook. The room is one discussion
        called <em>Study room</em> in the deck&rsquo;s repository, readable on github.com like any
        other. Decks shared from ForkLeaf now have Discussions switched on; for an older deck, its
        owner can turn it on in the repository&rsquo;s Settings → General → Features.
      </P>
    </>
  );
}
