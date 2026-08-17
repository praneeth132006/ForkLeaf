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

export { markdownToHtml, astToMarkdown, formatMarkdown } from "./render";

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
