import { A, Code, H2, H3, Lead, LI, Note, OL, P, Pre, Table, UL } from "@/components/prose";
import { REPO_URL } from "@/lib/constants";

/**
 * Setting up the two things that live outside the web app: the browser
 * extension and the MCP server.
 *
 * Both are in the repository rather than in a store or on npm, so both start
 * from a copy of it. These pages are the step-by-step version of the READMEs
 * beside the code, written for somebody who has never loaded an extension by
 * hand or edited an MCP config.
 */

const EXTENSION_URL = `${REPO_URL}/tree/main/apps/extension`;
const MCP_URL = `${REPO_URL}/tree/main/packages/mcp`;

export function BrowserExtension() {
  return (
    <>
      <Lead>
        Save a page, a quote, a link or a picture into your notebook with one click, from any site.
      </Lead>

      <P>
        The extension never writes to your notebook itself. Every save opens ForkLeaf in a new tab
        showing exactly what will be saved, and nothing is written until you press{" "}
        <strong>Save</strong>. So it needs no account, holds no token, and has no permission to read
        pages you have not asked it to save.
      </P>

      <H2 id="install">Install it</H2>
      <P>
        It works in Chrome, Edge, Brave, Arc and other Chromium browsers. It is not in the Chrome
        Web Store yet, so it is loaded from a copy of the repository.
      </P>
      <OL>
        <LI>
          Get the code. Either <A href={REPO_URL}>download the repository</A> as a ZIP from GitHub (
          <strong>Code → Download ZIP</strong>) and unzip it, or clone it:
          <Pre label="Terminal">{`git clone ${REPO_URL}.git`}</Pre>
        </LI>
        <LI>
          Open <Code>chrome://extensions</Code> (in Edge, <Code>edge://extensions</Code>) and switch
          on <strong>Developer mode</strong>, top right.
        </LI>
        <LI>
          Press <strong>Load unpacked</strong> and choose the <Code>apps/extension</Code> folder
          inside the copy — the folder that has <Code>manifest.json</Code> in it.
        </LI>
        <LI>
          Pin <strong>Save to ForkLeaf</strong> from the puzzle-piece menu so the button stays in
          the toolbar.
        </LI>
        <LI>
          Only if you run ForkLeaf somewhere other than <Code>https://forkleaf.vercel.app</Code>:
          right-click the button → <strong>Options</strong> and enter that address, for example{" "}
          <Code>http://localhost:3000</Code>.
        </LI>
      </OL>
      <Note>
        Keep the folder where it is. Chrome loads the extension from it every time it starts, and
        removing it removes the extension. To update, pull or download the repository again and
        press the reload arrow on the extension&rsquo;s card.
      </Note>

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
            "Select the text first, then press the button — or right-click the selection",
          ],
          [<strong key="l">A link</strong>, "Right-click it → Save link to ForkLeaf"],
          [<strong key="i">A picture</strong>, "Right-click it → Save image to ForkLeaf"],
        ]}
      />
      <P>
        Saves become notes in <Code>inbox/</Code>. To see them all as a grid, open{" "}
        <strong>All tools → Show everything I saved</strong> in the editor.
      </P>

      <H3>No extension? Two other ways in</H3>
      <UL>
        <LI>
          <strong>On a phone:</strong> install ForkLeaf from the browser menu (
          <strong>Add to Home Screen</strong>), then use <strong>Share → ForkLeaf</strong> from any
          app.
        </LI>
        <LI>
          <strong>In any desktop browser:</strong>{" "}
          <strong>All tools → Copy the Save to ForkLeaf bookmarklet</strong> gives you a bookmark
          that saves whatever page you are on.
        </LI>
      </UL>

      <H2 id="permissions">What it can see</H2>
      <Table
        head={["Permission", "Why"]}
        rows={[
          [
            <Code key="a">activeTab</Code>,
            "Read the page's title and selection, only when you save it.",
          ],
          [<Code key="s">scripting</Code>, "Run that one read inside the page."],
          [<Code key="c">contextMenus</Code>, "The right-click items."],
          [<Code key="t">storage</Code>, "Remember the ForkLeaf address from Options."],
        ]}
      />
      <P>
        The source is short and readable: <A href={EXTENSION_URL}>apps/extension on GitHub</A>.
      </P>
    </>
  );
}

export function McpServer() {
  return (
    <>
      <Lead>
        Let Claude, or any assistant that speaks the Model Context Protocol, search, read and write
        your notebook.
      </Lead>

      <P>
        The ForkLeaf MCP server runs on your own computer and talks to your notes repository on
        GitHub directly, with a token you give it. Nothing goes through ForkLeaf. Every write is an
        ordinary commit, so it shows up in the note&rsquo;s history and can be undone.
      </P>
      <Note>
        This needs your notebook to be connected to a GitHub repository. A notebook that lives only
        in this browser is not somewhere an assistant can reach.
      </Note>

      <H2 id="what-it-can-do">What the assistant gets</H2>
      <Table
        head={["Tool", "What it does"]}
        rows={[
          [<Code key="1">search_notes</Code>, "Full-text search across every note"],
          [<Code key="2">list_notes</Code>, "The notes in the notebook, or in one folder"],
          [<Code key="3">read_note</Code>, "One note in full, with the notes that link to it"],
          [<Code key="4">write_note</Code>, "Create a note, or replace one, as a single commit"],
          [<Code key="5">append_to_daily_note</Code>, "Add to today's journal/YYYY-MM-DD.md"],
        ]}
      />
      <P>
        Try asking: <em>&ldquo;What did I write about the launch plan?&rdquo;</em>,{" "}
        <em>&ldquo;Add today&rsquo;s meeting notes to my daily note&rdquo;</em>, or{" "}
        <em>&ldquo;Summarise everything tagged research into a new note.&rdquo;</em>
      </P>

      <H2 id="setup">Set it up</H2>
      <H3>1. What you need</H3>
      <UL>
        <LI>
          <A href="https://nodejs.org">Node.js</A> 20 or newer, and pnpm (
          <Code>npm install -g pnpm</Code>).
        </LI>
        <LI>A copy of the repository, with its packages installed:</LI>
      </UL>
      <Pre label="Terminal">{`git clone ${REPO_URL}.git
cd ForkLeaf
pnpm install`}</Pre>

      <H3>2. A GitHub token for your notes repository</H3>
      <OL>
        <LI>
          Open{" "}
          <A href="https://github.com/settings/personal-access-tokens/new">
            GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token
          </A>
          .
        </LI>
        <LI>
          Under <strong>Repository access</strong>, choose <strong>Only select repositories</strong>{" "}
          and pick your notes repository — the one ForkLeaf syncs to.
        </LI>
        <LI>
          Under <strong>Permissions → Contents</strong>, choose <strong>Read and write</strong> (or{" "}
          <strong>Read-only</strong>, if the assistant should only read).
        </LI>
        <LI>
          Generate it and copy the token, which starts <Code>github_pat_</Code>.
        </LI>
      </OL>
      <Note kind="warn">
        The token can change that repository. Keep it out of notes, chats and screenshots, and give
        it an expiry date — you can generate a new one any time.
      </Note>

      <H3>3. Add the server to your assistant</H3>
      <P>
        In each example, replace the token, <Code>you/notes</Code> with your repository&rsquo;s{" "}
        <Code>owner/name</Code>, and <Code>/path/to/ForkLeaf</Code> with where you cloned it.
      </P>

      <P>
        <strong>Claude Code</strong> — run once in a terminal:
      </P>
      <Pre label="Terminal">{`claude mcp add forkleaf \\
  --env FORKLEAF_GITHUB_TOKEN=github_pat_... \\
  --env FORKLEAF_REPO=you/notes \\
  -- pnpm --silent --dir /path/to/ForkLeaf/packages/mcp start`}</Pre>
      <P>
        Then start <Code>claude</Code> and run <Code>/mcp</Code>; <strong>forkleaf</strong> should
        be listed as connected.
      </P>

      <P>
        <strong>Claude Desktop</strong> — <strong>Settings → Developer → Edit Config</strong> opens{" "}
        <Code>claude_desktop_config.json</Code>. Add:
      </P>
      <Pre label="claude_desktop_config.json">{`{
  "mcpServers": {
    "forkleaf": {
      "command": "pnpm",
      "args": ["--silent", "--dir", "/path/to/ForkLeaf/packages/mcp", "start"],
      "env": {
        "FORKLEAF_GITHUB_TOKEN": "github_pat_...",
        "FORKLEAF_REPO": "you/notes"
      }
    }
  }
}`}</Pre>
      <P>
        Quit and reopen Claude Desktop. The tools appear under the <strong>+</strong> button in a
        new chat.
      </P>

      <P>
        <strong>Cursor, VS Code, and other clients</strong> use the same three parts: the command{" "}
        <Code>pnpm</Code>, the arguments{" "}
        <Code>--silent --dir /path/to/ForkLeaf/packages/mcp start</Code>, and the two environment
        variables. Put them wherever that client keeps its MCP servers.
      </P>

      <H2 id="settings">Settings</H2>
      <Table
        head={["Variable", "Meaning"]}
        rows={[
          [<Code key="t">FORKLEAF_GITHUB_TOKEN</Code>, "Required. The token from step 2."],
          [<Code key="r">FORKLEAF_REPO</Code>, "Required. owner/name of your notes repository."],
          [<Code key="b">FORKLEAF_BRANCH</Code>, "The branch, if not the repository's default."],
          [
            <Code key="d">FORKLEAF_DIR</Code>,
            "The folder your notes are in, if not the whole repository.",
          ],
          [<Code key="o">FORKLEAF_READ_ONLY</Code>, "true to offer only the tools that read."],
        ]}
      />

      <H2 id="safety">What it will not do</H2>
      <UL>
        <LI>Touch anything but .md and .mdx notes, or anything in a hidden folder like .github.</LI>
        <LI>Follow a path out of the notebook, or out of FORKLEAF_DIR when that is set.</LI>
        <LI>
          Read or overwrite an <strong>encrypted note</strong> — it has no passphrase, so it says
          the note is encrypted and leaves it alone.
        </LI>
      </UL>

      <H2 id="troubleshooting">If it does not connect</H2>
      <UL>
        <LI>
          <strong>&ldquo;Set FORKLEAF_REPO to your notes repository…&rdquo;</strong> or another
          sentence starting <em>Set</em>: the variable it names is missing or mistyped in the
          config.
        </LI>
        <LI>
          <strong>A 401 or 404 from GitHub:</strong> the token has expired, or was not given access
          to that repository.
        </LI>
        <LI>
          <strong>&ldquo;pnpm: command not found&rdquo;</strong> in Claude Desktop: use the full
          path to pnpm as the command — <Code>which pnpm</Code> in a terminal prints it.
        </LI>
        <LI>
          Run the command yourself to see its errors:{" "}
          <Code>FORKLEAF_GITHUB_TOKEN=… FORKLEAF_REPO=you/notes pnpm --dir packages/mcp start</Code>
          . It waits silently for an assistant when everything is right.
        </LI>
      </UL>
      <P>
        Source and more detail: <A href={MCP_URL}>packages/mcp on GitHub</A>.
      </P>
    </>
  );
}
