export {
  parseDocument,
  serializeDocument,
  updateFrontmatter,
  type ParsedDocument,
} from "./frontmatter";

export {
  parseToAst,
  extractOutline,
  extractMermaidBlocks,
  documentStats,
  deriveTitle,
  extractTags,
  type OutlineEntry,
  type DiagramBlock,
  type DocumentStats,
} from "./analyze";

export { markdownToHtml, astToMarkdown, formatMarkdown, type RenderOptions } from "./render";
export {
  rewriteRelativeLinks,
  repairRelativeLinks,
  type LinkRepair,
  relativeFromNote,
  resolveFromNote,
  isRelativeLink,
} from "./relocate";
export {
  youtubeVideoFrom,
  youtubeEmbedUrl,
  youtubeWatchUrl,
  isYoutubeUrl,
  YOUTUBE_EMBED_ORIGIN,
  type YoutubeVideo,
} from "./youtube";

export {
  extractWikilinks,
  wikilinkTargets,
  resolveWikilink,
  wikilinkToPath,
  buildLinkGraph,
  remarkWikilink,
  type WikiLink,
  type LinkCandidate,
  type LinkSource,
  type LinkRef,
  type LinkGraph,
  type ResolvedWikilink,
  type WikilinkResolver,
} from "./wikilinks";

export { referencedPaths } from "./references";

export {
  normalizePath,
  joinPath,
  dirname,
  basename,
  extname,
  stripExtension,
  isMarkdownPath,
  slugifyFilename,
  uniquePath,
  isInsideFolder,
  relativeToDirectory,
} from "./paths";

export {
  diffLines,
  diffStats,
  diffWords,
  toHunks,
  type ChangeKind,
  type DiffHunk,
  type DiffLine,
  type DiffStats,
  type WordSpan,
} from "./diff";
