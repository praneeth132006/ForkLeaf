import { A, Code, H2, H3, Lead, LI, Note, OL, P, Pre, Table, UL } from "@/components/prose";
import { REPO_URL } from "@/lib/constants";

/**
 * Setting up the two things that reach ForkLeaf from outside the editor: the
 * browser extension, and AI assistants over MCP.
 */

const EXTENSION_URL = `${REPO_URL}/tree/main/apps/extension`;
const MCP_URL = `${REPO_URL}/tree/main/packages/mcp`;
const ADDRESS = "https://www.forkleaf.in/api/mcp";

export function BrowserExtension() {
  return (
    <>
      <Lead>
        Save a page, a quote, a link or a picture with one click, from any site — into a repository
        kept just for saves, filed automatically.
      </Lead>

      <P>
        The extension never writes anything itself. Every save opens ForkLeaf in a new tab showing
        exactly what will be saved, and nothing is written until you press <strong>Save</strong>. So
        it needs no account, holds no token, and cannot read pages you have not asked it to save.
      </P>

      <H2 id="install">Install it</H2>
      <P>
        It works in Chrome, Edge, Brave, Arc and other Chromium browsers. It is not in the Chrome
        Web Store yet, so it is loaded from a copy of the repository.
      </P>
      <OL>
        <LI>
          Get the code: <A href={REPO_URL}>download the repository</A> as a ZIP (
          <strong>Code → Download ZIP</strong>) and unzip it, or clone it:
          <Pre label="Terminal">{`git clone ${REPO_URL}.git`}</Pre>
        </LI>
        <LI>
          Open <Code>chrome://extensions</Code> (in Edge, <Code>edge://extensions</Code>) and switch
          on <strong>Developer mode</strong>, top right.
        </LI>
        <LI>
          Press <strong>Load unpacked</strong> and choose the <Code>apps/extension</Code> folder —
          the one with <Code>manifest.json</Code> in it.
        </LI>
        <LI>
          Pin <strong>Save to ForkLeaf</strong> from the puzzle-piece menu so the button stays in
          the toolbar.
        </LI>
        <LI>
          Only if you run ForkLeaf somewhere other than <Code>https://www.forkleaf.in</Code>:
          right-click the button → <strong>Options</strong> and enter that address.
        </LI>
      </OL>
      <Note>
        Keep the folder where it is — Chrome loads the extension from it. To update, download the
        repository again and press the reload arrow on the extension&rsquo;s card.
      </Note>

      <H3>In Firefox</H3>
      <OL>
        <LI>
          Open <Code>about:debugging#/runtime/this-firefox</Code> and press{" "}
          <strong>Load Temporary Add-on…</strong>.
        </LI>
        <LI>
          Choose <Code>manifest.json</Code> inside the <Code>apps/extension</Code> folder.
        </LI>
        <LI>
          Only if you run ForkLeaf somewhere else: set its address in the add-on&rsquo;s{" "}
          <strong>Preferences</strong>.
        </LI>
      </OL>
      <P>
        Firefox 121 or later. It forgets a temporary add-on when it restarts, so load it again after
        a restart. The same folder works in Chrome and Firefox.
      </P>

      <H2 id="use">Use it</H2>
      <Table
        head={["To save", "Do this"]}
        rows={[
          [
            <strong key="p">The page you are on</strong>,
            "Press the toolbar button, or Alt+Shift+S",
          ],
          [
            <strong key="q">A quote</strong>,
            "Select the text, then press the button — or right-click the selection",
          ],
          [<strong key="l">A link</strong>, "Right-click it → Save link to ForkLeaf"],
          [<strong key="i">A picture</strong>, "Right-click it → Save image to ForkLeaf"],
          [
            <strong key="h">A highlight</strong>,
            "Select the text, right-click → Highlight and save to ForkLeaf",
          ],
        ]}
      />
      <P>
        A highlight is marked on the page and kept in one note for that page — every highlight you
        make there is added to the same note, as <Code>==marked==</Code> lines that come back in
        spaced reading. To see them again on a later visit, right-click the page →{" "}
        <strong>Show my ForkLeaf highlights here</strong>. The extension has no access to pages on
        its own, so it waits to be asked.
      </P>
      <P>
        Where it goes, and how it is filed, is in <A href="/docs/saving">Saving from the web</A>.
      </P>

      <H2 id="permissions">What it can see</H2>
      <Table
        head={["Permission", "Why"]}
        rows={[
          [
            <Code key="a">activeTab</Code>,
            "Read the page's title and selection, only when you save.",
          ],
          [<Code key="s">scripting</Code>, "Run that one read inside the page."],
          [<Code key="c">contextMenus</Code>, "The right-click items."],
          [
            <Code key="t">storage</Code>,
            "Remember the ForkLeaf address from Options, and your highlights on each page.",
          ],
        ]}
      />
      <P>
        The source is short and readable: <A href={EXTENSION_URL}>apps/extension on GitHub</A>.
      </P>
    </>
  );
}

export function Assistant() {
  return (
    <>
      <Lead>
        A model in a column beside the note you are writing — Claude, OpenAI, Gemini, or one running
        on your own machine. Your key, your provider, and nothing in between.
      </Lead>

      <P>
        Open it with <Code>⌥⌘A</Code>, the sparkle in the editor header, or{" "}
        <Code>⌘K → Ask the assistant</Code>. It is the <strong>Assistant</strong> tab of the column
        beside the note, next to <strong>Note</strong> and <A href="/docs/conversations">Chat</A>,
        and the seam beside it drags. Switching tabs keeps the conversation with the model.
      </P>

      <Note>
        This is the opposite way round from <A href="/docs/mcp">MCP</A>, and both are worth having.
        MCP sends an assistant <em>to</em> your notebook, to work through GitHub while you are
        elsewhere. This brings a model to the note in front of you, for the question you have while
        writing.
      </Note>

      <H2 id="setup">Set it up once</H2>
      <OL>
        <LI>Choose a provider: Claude, OpenAI, Gemini, or Local or other.</LI>
        <LI>
          Paste your key. <strong>Get a key</strong> beside the field goes to the right page for the
          provider you picked.
        </LI>
        <LI>
          Change the model if you want a different one. It is a text field, not a menu, so a model
          released tomorrow works today — the suggestions are only suggestions.
        </LI>
      </OL>
      <P>
        The form takes itself away as soon as there is a key. The chip in the panel header shows
        which model you are talking to, and opens the form again.
      </P>

      <H3>Why a key, and not a sign-in?</H3>
      <P>
        Because none of the providers offer one. A Claude Pro, ChatGPT Plus or Google AI
        subscription is for that company&rsquo;s own apps: there is no way for another application
        to sign you in and use it on your behalf, and no OAuth flow published for it. The API key is
        the only door any of them opens to a third party.
      </P>
      <P>
        It is a different account balance from a subscription, so an API key is billed by usage and
        a subscription you already pay for does not cover it. Creating one is free and takes about a
        minute; the free tiers are generous enough to try this out on. If you would rather pay
        nobody, run a model on your own machine — the next section.
      </P>

      <H2 id="models">Choosing a model</H2>
      <P>
        Once there is a key, the <strong>Model</strong> box is a list of what that key can actually
        use, fetched from the provider — not a list written into ForkLeaf. If the model ForkLeaf was
        holding is not on it, one that is gets chosen instead.
      </P>
      <P>
        That is on purpose. Providers retire models without warning, and a name hard-coded here
        would break the day they did — which is exactly what used to happen. Press{" "}
        <strong>Type a name instead</strong> for one the listing does not mention, such as a model
        on a server that has no listing at all.
      </P>

      <H3>&ldquo;You exceeded your current quota&rdquo;</H3>
      <P>
        Two different things arrive as that message, and only one of them is worth waiting out. A
        rate limit means you asked too quickly; the panel says roughly how long to wait and offers{" "}
        <strong>Try again</strong>. A quota of <strong>zero</strong> means the key is not allowed to
        use that model at all — which is what a free Google key gets for the Pro models — and no
        amount of waiting changes it. There the panel says so and offers{" "}
        <strong>Choose another model</strong> instead.
      </P>
      <P>
        Where it happens, the panel names a model that will work and offers to ask again on it in
        one press, rather than sending you to a menu to guess. This is also why ForkLeaf offers a
        Flash model first for Gemini: it is the one a free Google key can actually run. Pick a Pro
        model yourself and that choice is respected — and refused by Google until you add billing.
      </P>

      <H2 id="local">A model on your own machine</H2>
      <P>
        Choose <strong>Local or other</strong> and give it the address. For{" "}
        <A href="https://ollama.com">Ollama</A> that is <Code>http://localhost:11434/v1</Code>, and
        no key is needed. Ollama has to be told this page may talk to it:
      </P>
      <Pre label="Terminal">{`OLLAMA_ORIGINS='*' ollama serve`}</Pre>
      <P>
        LM Studio and anything else that speaks the OpenAI API work the same way.{" "}
        <A href="https://openrouter.ai">OpenRouter</A> is the one non-local address this option
        accepts: <Code>https://openrouter.ai/api/v1</Code>, with an OpenRouter key.
      </P>

      <H2 id="note">What it can see</H2>
      <P>
        The open note travels with each question, which is what makes the answers about your writing
        rather than about the world in general. The tick below the box says which note that is, and
        turning it off sends the question alone — the thing to do when the note is one you would
        rather not send anywhere.
      </P>
      <P>
        Nothing else goes: not your other notes, not your repository, not your GitHub token. A very
        long note is cut to fit, and the model is told it was.
      </P>

      <H2 id="answers">Using an answer</H2>
      <P>
        Answers are formatted as you would see them in a note. Four things can be done with one:
      </P>
      <UL>
        <LI>
          <strong>Add to note</strong> puts it at the end of the open note.
        </LI>
        <LI>
          <strong>Replace the note</strong> swaps the whole body for it — which is what a tidy-up or
          a rewrite is for. The previous text is one <Code>⌘Z</Code> away, and every save is a
          commit, so the version you replaced is still in the note&rsquo;s history.
        </LI>
        <LI>
          <strong>Copy</strong> takes the Markdown to the clipboard for anywhere else.
        </LI>
        <LI>
          <strong>Show Markdown</strong> swaps the formatted answer for the exact characters, for
          checking before you keep them.
        </LI>
      </UL>
      <P>
        A locked or encrypted note cannot be written to, and the panel says which rather than
        quietly dropping the buttons. <strong>Stop</strong> ends a long answer mid-sentence.
      </P>

      <H2 id="privacy">Where the key lives</H2>
      <P>
        In this browser, and nowhere else. Questions go straight from the page to the provider you
        chose: there is no ForkLeaf key, no ForkLeaf proxy and no ForkLeaf server in the path, and
        we could not read your conversations if we wanted to. Nothing is written into your
        repository either — a key is not a fact about your notebook.
      </P>
      <P>
        The trade is that a key in a browser is readable by anything that manages to run script on
        this page. It is your own key, scoped to your own account: if you ever want it gone, press{" "}
        <strong>Forget this key</strong>, and revoke it at the provider.
      </P>
      <Note>
        Billing is between you and the provider. ForkLeaf never sees a request and cannot be charged
        for one, which is also why there is no limit on how much you use this.
      </Note>
    </>
  );
}

export function McpServer() {
  return (
    <>
      <Lead>
        Let Claude, Cursor, VS Code or any assistant that speaks the Model Context Protocol search,
        read and write your notebook. Setup is one address and a sign-in.
      </Lead>

      <Note>
        Your notebook needs to be connected to a GitHub repository. A notebook that lives only in
        this browser is not somewhere an assistant can reach. For a model beside the note you are
        writing rather than an assistant working on the notebook from outside, see{" "}
        <A href="/docs/assistant">the assistant panel</A>.
      </Note>

      <H2 id="connect">Connect in one step</H2>
      <P>
        In the editor, open <strong>All tools → Connect an AI assistant</strong> (or type{" "}
        <Code>/connect</Code>) for these steps with your address filled in and copy buttons. Every
        assistant uses the same address:
      </P>
      <Pre label="MCP server address">{ADDRESS}</Pre>

      <H3>Claude Code</H3>
      <Pre label="Terminal">{`claude mcp add --transport http forkleaf ${ADDRESS}`}</Pre>
      <P>
        Then type <Code>/mcp</Code> in Claude Code, choose <strong>forkleaf</strong> and{" "}
        <strong>Authenticate</strong>.
      </P>

      <H3>Claude Desktop and claude.ai</H3>
      <P>
        <strong>Settings → Connectors → Add custom connector</strong>. Name it ForkLeaf, paste the
        address, press <strong>Add</strong>, then <strong>Connect</strong>.
      </P>

      <H3>Cursor</H3>
      <Pre label="~/.cursor/mcp.json">{`{
  "mcpServers": {
    "forkleaf": { "url": "${ADDRESS}" }
  }
}`}</Pre>

      <H3>VS Code</H3>
      <Pre label=".vscode/mcp.json">{`{
  "servers": {
    "forkleaf": { "type": "http", "url": "${ADDRESS}" }
  }
}`}</Pre>

      <H3>What happens next</H3>
      <OL>
        <LI>The assistant opens a ForkLeaf page in your browser. Sign in with GitHub if asked.</LI>
        <LI>
          Choose its default repository — optionally a folder and a branch — and tick{" "}
          <strong>Read only</strong> if it should not write.{" "}
          <strong>Also let it use my other repositories</strong> is ticked to begin with: untick it
          to keep the assistant to that one repository.
        </LI>
        <LI>
          Press <strong>Allow</strong>. GitHub confirms, and you are sent back to the assistant.
        </LI>
      </OL>
      <P>
        There is no token to create and nothing to install. The assistant keeps its own sign-in and
        renews it; ForkLeaf stores nothing about the connection.
      </P>

      <H2 id="what-it-can-do">What the assistant gets</H2>
      <Table
        head={["Tool", "What it does"]}
        rows={[
          [<Code key="0">list_repositories</Code>, "The repositories it can use, and the default"],
          [<Code key="1">search_notes</Code>, "Full-text search across every note"],
          [<Code key="2">list_notes</Code>, "The notes in the notebook, or in one folder"],
          [<Code key="3">read_note</Code>, "One note in full, with the notes that link to it"],
          [<Code key="4">write_note</Code>, "Create a note, or replace one, as a single commit"],
          [<Code key="5">append_to_daily_note</Code>, "Add to today's journal/YYYY-MM-DD.md"],
          [
            <Code key="6">read_note_conversation</Code>,
            "What collaborators said about a note, and the threads about its passages",
          ],
          [
            <Code key="7">list_conversations</Code>,
            "Every conversation, or only unanswered questions",
          ],
          [<Code key="8">read_conversation</Code>, "One conversation in full"],
          [
            <Code key="9">reply_to_conversation</Code>,
            "Post a reply under your name — only when you ask, after you have seen the text",
          ],
        ]}
      />
      <P>
        Every tool works on the default repository unless you name another —{" "}
        <em>&ldquo;add this to my work repository&rdquo;</em> or{" "}
        <em>&ldquo;in ada/handbook, update the onboarding note&rdquo;</em>.
      </P>
      <H3 id="where-notes-go">Where its notes go</H3>
      <UL>
        <LI>
          Next to related notes, in a folder that already exists — or in <Code>inbox/</Code> when
          you did not say where, the same folder <strong>Save to ForkLeaf</strong> uses.
        </LI>
        <LI>
          It will not make up a new folder unless you ask for one. Asked to write to a folder that
          does not exist, the tool refuses and lists the folders there are.
        </LI>
        <LI>
          After every write it tells you the repository, the full path and a link to the note, and
          the commit says it came from an assistant.
        </LI>
      </UL>
      <P>
        Try asking: <em>&ldquo;What did I write about the launch plan?&rdquo;</em>,{" "}
        <em>&ldquo;Add today&rsquo;s meeting notes to my daily note&rdquo;</em>, or{" "}
        <em>&ldquo;Summarise everything tagged research into a new note.&rdquo;</em>
      </P>

      <H2 id="safety">What it will not do</H2>
      <UL>
        <LI>Touch anything but .md and .mdx notes, or anything in a hidden folder like .github.</LI>
        <LI>
          Use a repository other than the default unless you allowed it, and you name it. Inside the
          default repository it stays in the folder you chose.
        </LI>
        <LI>Make up a folder for a new note.</LI>
        <LI>Write at all, if you ticked Read only.</LI>
        <LI>
          Read or overwrite an <strong>encrypted note</strong>. It has no passphrase, so it says the
          note is encrypted and leaves it alone.
        </LI>
      </UL>

      <H2 id="stop">Disconnecting</H2>
      <P>
        Remove the server in the assistant. To cut off every assistant at once, revoke ForkLeaf at{" "}
        <A href="https://github.com/settings/applications">GitHub → Settings → Applications</A> —
        this signs ForkLeaf out in your browsers too.
      </P>

      <H2 id="troubleshooting">If it does not connect</H2>
      <UL>
        <LI>
          <strong>The browser page says the link is not valid:</strong> start connecting again from
          the assistant; each sign-in link is good for ten minutes.
        </LI>
        <LI>
          <strong>&ldquo;could not be read … connect again&rdquo;:</strong> the repository was
          renamed, deleted, or access to it was removed. Remove the server and add it again.
        </LI>
        <LI>
          <strong>It asks to sign in again after months:</strong> GitHub&rsquo;s sign-in lasts six
          months without use. Authenticate again from the assistant.
        </LI>
      </UL>

      <H2 id="local">Advanced: run the server yourself</H2>
      <P>
        <A href={MCP_URL}>packages/mcp</A> is the same set of tools as a local server, for
        assistants that only run commands, or for keeping the connection off ForkLeaf entirely. It
        needs Node.js 20+, a clone of the repository with <Code>pnpm install</Code>, and a{" "}
        <A href="https://github.com/settings/personal-access-tokens/new">fine-grained token</A>{" "}
        limited to your notes repository with <strong>Contents: Read and write</strong>:
      </P>
      <Pre label="Terminal">{`claude mcp add forkleaf \\
  --env FORKLEAF_GITHUB_TOKEN=github_pat_... \\
  --env FORKLEAF_REPO=you/notes \\
  -- pnpm --silent --dir /path/to/ForkLeaf/packages/mcp start`}</Pre>
      <P>
        <Code>FORKLEAF_BRANCH</Code>, <Code>FORKLEAF_DIR</Code> and{" "}
        <Code>FORKLEAF_READ_ONLY=true</Code> are optional. Details in the package&rsquo;s README.
      </P>
    </>
  );
}
