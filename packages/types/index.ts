// Define basic user type
// Represents a user within the mdnotion system
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

// Define the frontmatter typically found in note markdown files
// This brings a typed structure to gray-matter parsing results
export interface NoteFrontmatter {
  title: string;
  tags?: string[];
  createdAt?: Date | string;
  updatedAt?: Date | string;
  [key: string]: any; // Allow arbitrary frontmatter
}

// Represents a fully parsed Markdown Note including its AST or content
// Allows backend and frontend to understand the shape of a Note
export interface Note {
  id: string;
  frontmatter: NoteFrontmatter;
  content: string; // The raw markdown string (excluding frontmatter)
}
