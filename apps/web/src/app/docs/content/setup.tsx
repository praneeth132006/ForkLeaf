import { A, Code, H2, H3, Lead, LI, Note, OL, P, Pre, Table, UL } from "@/components/prose";
import { REPO_URL } from "@/lib/constants";

/**
 * Setting up the two things that reach ForkLeaf from outside the editor: the
 * browser extension, and AI assistants over MCP.
 */

const EXTENSION_URL = `${REPO_URL}/tree/main/apps/extension`;
const MCP_URL = `${REPO_URL}/tree/main/packages/mcp`;
const ADDRESS = "https://forkleaf.vercel.app/api/mcp";

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
          Only if you run ForkLeaf somewhere other than <Code>https://forkleaf.vercel.app</Code>:
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
        ]}
      />
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
        Let Claude, Cursor, VS Code or any assistant that speaks the Model Context Protocol search,
        read and write your notebook. Setup is one address and a sign-in.
      </Lead>

      <Note>
        Your notebook needs to be connected to a GitHub repository. A notebook that lives only in
        this browser is not somewhere an assistant can reach.
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
          Choose the repository it may use — optionally a folder and a branch — and tick{" "}
          <strong>Read only</strong> if it should not write.
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

      <H2 id="safety">What it will not do</H2>
      <UL>
        <LI>Touch anything but .md and .mdx notes, or anything in a hidden folder like .github.</LI>
        <LI>Leave the repository — or the folder — you chose.</LI>
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
