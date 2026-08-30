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
  countWords,
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
  neighbourhood,
  remarkWikilink,
  type WikiLink,
  type LinkCandidate,
  type LinkSource,
  type LinkRef,
  type LinkGraph,
  type ResolvedWikilink,
  type WikilinkResolver,
} from "./wikilinks";

export { referencedPaths, removeReferencesTo } from "./references";

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

export {
  buildTimeline,
  sparkline,
  type RevisionInput,
  type Timeline,
  type TimelineRevision,
  type SparklineGeometry,
} from "./timeline";

export {
  buildBlame,
  toBlocks,
  ageRatio,
  type Blame,
  type BlameBlock,
  type BlameLine,
  type BlameRevision,
} from "./blame";

export {
  MAX_OUTPUT,
  OUTPUT_LANGUAGE,
  durationOf,
  formatOutput,
  isOutput,
  isRunnable,
  runnerFor,
  type RunResult,
  type Runner,
} from "./runnable";

export {
  buildThreads,
  summariseReviews,
  type ReviewComment,
  type ReviewThread,
  type ReviewVerdict,
  type SubmittedReview,
  type ThreadOptions,
  type Verdict,
} from "./review";

export {
  formatSource,
  isCapturable,
  sourcesIn,
  type CapturedSource,
  type CitedSource,
} from "./provenance";

export {
  REPO_SCHEME,
  formatRepoTarget,
  freshnessOf,
  isRepoTarget,
  parseRepoTarget,
  pinRepoLink,
  repoTargetLabel,
  repoTargetUrl,
  repoTargetsIn,
  type LinkFreshness,
  type LinkedFile,
  type RepoTarget,
} from "./repolinks";

export {
  assessDecay,
  findPerishable,
  type DecayOptions,
  type DecayReport,
  type DecayVerdict,
  type PerishableKind,
  type PerishableMention,
} from "./decay";
