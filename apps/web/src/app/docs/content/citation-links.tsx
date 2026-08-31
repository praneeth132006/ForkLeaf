import { A, Code, H2, H3, Lead, LI, Note, P, Pre, Table, UL } from "@/components/prose";

/**
 * The link format, written down so other tools can read it.
 *
 * ForkLeaf's citations are the one thing here that could outlive ForkLeaf. The
 * format is not an invention — it is a relative path, the `#page=` fragment
 * every PDF reader has understood for twenty years, and the W3C Web Annotation
 * text selector spelled into a query string. Nothing about it needs this app.
 *
 * That is only true if it is written down. A format that lives in one
 * codebase's head is a private format however standard its parts are, so this
 * page is the specification: what the fields mean, how they resolve, and what
 * another tool has to do to support them.
 */
export function CitationLinks() {
  return (
    <>
      <Lead>
        A ForkLeaf citation is an ordinary Markdown link. Nothing about it is proprietary and
        nothing about it needs this app: a relative path, plus a fragment made of the{" "}
        <Code>#page=</Code> convention every PDF reader has understood for twenty years and the W3C
        Web Annotation text selector. This page writes it down so that anything else — an Obsidian
        plugin, Zotero, a static site, a script — can read and write the same links.
      </Lead>

      <H2 id="shape">The shape of one</H2>
      <P>This is a whole citation, as it lands in a note:</P>

      <Pre label="A cited passage in a note">{`> Attention is all you need, and the rest is engineering.
>
> — [On Attention, p. 12](../papers/attention.pdf#page=12&q=Attention%20is%20all&pre=We%20show%20that&suf=%2C%20and%20the%20rest)`}</Pre>

      <P>
        The blockquote is the passage as it was read. The line under it is a Markdown link whose
        destination has two halves: a path, relative to the note holding it, and a fragment.
      </P>

      <Note>
        Because it is a relative path, the link resolves on github.com, in any Markdown editor, and
        on a static site built from the repository. Nothing has to understand the fragment for the
        link to open the right file — understanding the fragment only makes it open at the right
        place.
      </Note>

      <H2 id="fields">The fragment</H2>
      <P>
        Fields are <Code>key=value</Code> pairs joined by <Code>&amp;</Code>, percent-encoded, in
        any order. An unknown key is ignored rather than treated as an error.
      </P>

      <Table
        head={["Field", "Means", "Required"]}
        rows={[
          [
            <Code key="page">page</Code>,
            "The 1-based page the passage was on when the link was written. A hint, never the authority.",
            "One of page or q",
          ],
          [
            <Code key="q">q</Code>,
            "The quoted text itself, as it appeared on the page. Up to 512 characters.",
            "One of page or q",
          ],
          [
            <Code key="pre">pre</Code>,
            "Up to 48 characters immediately before the quotation, for telling two occurrences apart.",
            "No",
          ],
          [
            <Code key="suf">suf</Code>,
            "Up to 48 characters immediately after it, for the same reason.",
            "No",
          ],
        ]}
      />

      <P>
        <Code>p</Code> is accepted as a synonym for <Code>page</Code>, and <Code>quote</Code> for{" "}
        <Code>q</Code>. A bare <Code>#12</Code> means page 12, because that is what people type.
      </P>

      <H2 id="why">Why the quotation and not just the page</H2>
      <P>
        A page number is a claim that quietly stops being true. The author adds a figure to page 4
        and every citation after it points one page short — the link still opens, it just shows the
        wrong paragraph, and nothing tells you. Storing the sentence makes the link checkable:
        search the document as it stands now for those words, and use the page only as a hint about
        where to start looking.
      </P>

      <H3>How ForkLeaf resolves one</H3>
      <UL>
        <LI>
          Normalise the document&rsquo;s text and the quotation the same way — ligatures folded (
          <Code>ﬁ</Code> to <Code>fi</Code>), hyphenation across line breaks joined, runs of
          whitespace collapsed. This is what makes a search for &ldquo;find&rdquo; match a page that
          really contains <Code>ﬁnd</Code>.
        </LI>
        <LI>
          Look for the quotation, preferring the recorded page, then the pages around it, then the
          whole document.
        </LI>
        <LI>
          Where several occurrences match, <Code>pre</Code> and <Code>suf</Code> choose between
          them. That is what context is for: in a paper that says &ldquo;as discussed above&rdquo;
          forty times, the quotation alone identifies nothing.
        </LI>
        <LI>
          Report the outcome honestly — found where it said, found on another page, found only after
          normalising, or not found at all. A resolver that silently falls back to &ldquo;whatever
          is on page 12 now&rdquo; is the behaviour this format exists to avoid.
        </LI>
      </UL>

      <H2 id="writing">Writing one</H2>
      <P>
        Select a passage in ForkLeaf&rsquo;s reader and press <strong>Copy link</strong> to put
        exactly this form on the clipboard. To generate one elsewhere: take the selected text, the
        48 characters either side of it, and the page it is on; percent-encode each; and join them
        onto the file&rsquo;s path.
      </P>

      <Pre label="The minimum a tool has to produce">{`papers/attention.pdf#page=12&q=Attention%20is%20all%20you%20need`}</Pre>

      <H2 id="support">Supporting it in another tool</H2>
      <P>
        Reading these links is worth more than writing them, and it is the smaller job. A tool that
        already opens PDFs at a page needs only to notice <Code>q</Code>, search for it, and prefer
        what it finds over the page number.
      </P>
      <UL>
        <LI>
          <strong>Ignore what you do not use.</strong> A reader that only understands{" "}
          <Code>#page=</Code> behaves exactly as it does today; the extra fields cost it nothing.
        </LI>
        <LI>
          <strong>Do not require the fields to be in order.</strong> They are a query string, not a
          format.
        </LI>
        <LI>
          <strong>Treat the page as a hint.</strong> If the quotation is elsewhere in the document,
          the quotation is right and the page is stale.
        </LI>
      </UL>

      <P>
        If you are building something that reads or writes these, we would like to hear about it —{" "}
        <A href="/support">tell us</A>, and if the format is missing something you need, say so
        while it is still small enough to change.
      </P>
    </>
  );
}
