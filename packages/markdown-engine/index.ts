import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import matter from 'gray-matter';

// Extract frontmatter and parse Markdown to AST
// This function helps in converting raw string MD to a structured AST with metadata
export function parseMarkdown(rawContent: string): { frontmatter: { [key: string]: any }, content: string, ast: any } {
  // Parse frontmatter using gray-matter
  const parsed = matter(rawContent);
  
  // Parse remaining content to AST using unified and remark-parse
  const processor = unified().use(remarkParse);
  const ast = processor.parse(parsed.content);
  
  return {
    frontmatter: parsed.data,
    content: parsed.content,
    ast,
  };
}

// Stringify AST back to markdown
// Used when the note has been modified and needs to be saved
export function stringifyMarkdown(ast: any): string {
  const processor = unified().use(remarkStringify);
  return processor.stringify(ast);
}

// Stringify raw markdown with frontmatter combined
export function stringifyWithFrontmatter(content: string, frontmatter: { [key: string]: any }): string {
  return matter.stringify(content, frontmatter);
}
