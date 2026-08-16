"use client"; // Required for Next.js App Router — marks this as a client component

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import type { Editor } from '@tiptap/core';
import { MermaidBlock } from './extensions/MermaidBlock';

// ─── Design System Tokens ───────────────────────────────────────────────────
// Waypoint color palette used throughout the editor UI
const COLORS = {
  basalt: '#14181F',      // Dark background (bubble menu bg)
  paper: '#F1EEE6',       // Light surface (slash menu bg)
  fog: '#1E2530',         // Dark surface variant
  chalk: '#EDEAE2',       // Light text / hover bg
  ink: '#22262E',         // Primary text
  signalAmber: '#E8A33D', // Accent / active state
  trailTeal: '#3FA796',   // Secondary accent
  ember: '#C1483B',       // Destructive / error
  mist: '#8A93A3',        // Placeholder text
  contour: '#2A3240',     // Borders / separators
} as const;

// ─── Slash Menu Command Definitions ─────────────────────────────────────────
// Each command represents a block type the user can insert via the slash menu
interface SlashCommand {
  title: string;     // Display name in the menu
  description: string; // Short help text below the title
  icon: string;      // Emoji icon for visual identification
  command: (editor: Editor) => void; // The chain of editor commands to execute
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    title: 'Heading 1',
    description: 'Large section heading',
    icon: 'H₁',
    // Toggle heading level 1 on the current block
    command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    icon: 'H₂',
    // Toggle heading level 2 on the current block
    command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    icon: 'H₃',
    // Toggle heading level 3 on the current block
    command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    title: 'Bulleted List',
    description: 'Create a simple bulleted list',
    icon: '•',
    // Toggle an unordered bullet list
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    title: 'Numbered List',
    description: 'Create a numbered list',
    icon: '1.',
    // Toggle an ordered numbered list
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    title: 'Task List',
    description: 'Track tasks with checkboxes',
    icon: '☑',
    // Toggle a task list with checkable items
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    title: 'Code Block',
    description: 'Capture a code snippet',
    icon: '</>',
    // Toggle a fenced code block
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    title: 'Quote',
    description: 'Capture a quote',
    icon: '"',
    // Toggle a blockquote wrapper
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    title: 'Divider',
    description: 'Visually divide blocks',
    icon: '—',
    // Insert a horizontal rule and move cursor after it
    command: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    title: 'Image',
    description: 'Upload or embed an image',
    icon: '🖼',
    // Prompt for an image URL and insert it
    command: (editor) => {
      const url = window.prompt('Enter image URL');
      if (url) {
        editor.chain().focus().setImage({ src: url }).run();
      }
    },
  },
  {
    title: 'Mermaid Diagram',
    description: 'Create a smart flowchart or diagram',
    icon: '📊',
    command: (editor) => editor.chain().focus().insertContent({ type: 'mermaidBlock' }).run(),
  },
];

// ─── SlashCommandMenu Component ─────────────────────────────────────────────
// Rendered inside the FloatingMenu — appears when user types "/" on an empty line
interface SlashCommandMenuProps {
  editor: Editor;          // The Tiptap editor instance
  onClose: () => void;     // Callback to dismiss the menu
}

const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({ editor, onClose }) => {
  // Track which item is highlighted for keyboard navigation
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Track the search query (text after the "/" character)
  const [query, setQuery] = useState('');
  // Ref to the menu container for scroll management
  const menuRef = useRef<HTMLDivElement>(null);

  // Filter commands based on user's search query after "/"
  const filteredCommands = SLASH_COMMANDS.filter((cmd) =>
    cmd.title.toLowerCase().includes(query.toLowerCase())
  );

  // Update the query by reading the text content of the current line
  useEffect(() => {
    // Handler runs on every editor transaction (keystroke, etc.)
    const handleUpdate = () => {
      const { state } = editor;
      const { from } = state.selection;
      // Resolve the position to find the parent block node
      const resolved = state.doc.resolve(from);
      const textBefore = resolved.parent.textContent;
      // Extract whatever the user typed after "/"
      const slashIndex = textBefore.lastIndexOf('/');
      if (slashIndex !== -1) {
        setQuery(textBefore.slice(slashIndex + 1));
      }
    };

    // Listen to editor transactions to keep query in sync
    editor.on('transaction', handleUpdate);
    return () => {
      editor.off('transaction', handleUpdate);
    };
  }, [editor]);

  // Reset selection index when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Execute a slash command: clear the "/" text, run the command, close menu
  const executeCommand = useCallback(
    (command: SlashCommand) => {
      const { state } = editor;
      const { from } = state.selection;
      const resolved = state.doc.resolve(from);
      const textBefore = resolved.parent.textContent;
      const slashIndex = textBefore.lastIndexOf('/');

      if (slashIndex !== -1) {
        // Calculate the absolute position of the "/" character in the document
        const start = from - textBefore.length + slashIndex;
        // Delete the "/" and any query text that followed it
        editor.chain().focus().deleteRange({ from: start, to: from }).run();
      }
      // Run the actual block insertion command
      command.command(editor);
      // Close the slash menu
      onClose();
    },
    [editor, onClose]
  );

  // Handle keyboard navigation (arrow keys, Enter, Escape) within the menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        // Move selection down, wrapping around to the top
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        // Move selection up, wrapping around to the bottom
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        // Execute the currently highlighted command
        if (filteredCommands[selectedIndex]) {
          executeCommand(filteredCommands[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // Dismiss the menu without inserting anything
        onClose();
      }
    };

    // Attach to the document so we capture keys even when editor is focused
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [filteredCommands, selectedIndex, executeCommand, onClose]);

  // Scroll the selected item into view when navigating with keyboard
  useEffect(() => {
    if (menuRef.current) {
      const selectedEl = menuRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Don't render anything if no commands match the query
  if (filteredCommands.length === 0) {
    return (
      <div
        style={{
          background: COLORS.paper,        // Paper-colored background
          borderRadius: '8px',             // Rounded corners
          padding: '8px 12px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', // Subtle elevation shadow
          border: `1px solid ${COLORS.chalk}`,       // Chalk border for definition
          color: COLORS.mist,              // Muted text for "no results"
          fontSize: '13px',
          fontFamily: '"Public Sans", sans-serif',   // Body font
        }}
      >
        No results
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      style={{
        background: COLORS.paper,          // Slash menu surface color
        borderRadius: '10px',              // Rounded container
        padding: '6px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.14)', // Floating elevation shadow
        border: `1px solid ${COLORS.chalk}`,       // Subtle border
        maxHeight: '320px',                // Scrollable if many items
        overflowY: 'auto',
        minWidth: '240px',
        fontFamily: '"Public Sans", sans-serif',   // Body font
      }}
    >
      {filteredCommands.map((cmd, index) => (
        <button
          key={cmd.title}
          // Execute the command on click
          onClick={() => executeCommand(cmd)}
          // Highlight on mouse hover
          onMouseEnter={() => setSelectedIndex(index)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            width: '100%',
            padding: '8px 10px',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            textAlign: 'left',
            // Highlight the selected item with chalk bg, others transparent
            background: index === selectedIndex ? COLORS.chalk : 'transparent',
            color: COLORS.ink,             // Ink-colored text
            fontSize: '14px',
            fontFamily: '"Public Sans", sans-serif',
            transition: 'background 0.1s ease',
          }}
        >
          {/* Icon container — rounded square with subtle background */}
          <span
            style={{
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
              background: index === selectedIndex ? COLORS.paper : COLORS.chalk,
              fontSize: '15px',
              fontWeight: 600,
              flexShrink: 0,
              border: `1px solid ${COLORS.chalk}`,
            }}
          >
            {cmd.icon}
          </span>
          {/* Title and description text */}
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 500, fontSize: '13.5px', lineHeight: '1.3' }}>
              {cmd.title}
            </span>
            <span style={{ fontSize: '12px', color: COLORS.mist, lineHeight: '1.3' }}>
              {cmd.description}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
};

// ─── BubbleToolbar Component ────────────────────────────────────────────────
// The floating formatting toolbar that appears when text is selected
interface BubbleToolbarProps {
  editor: Editor; // The Tiptap editor instance
}

// Individual formatting button configuration
interface FormatButton {
  label: string;       // Display text or symbol on the button
  action: () => void;  // Toggle command to run on click
  isActive: boolean;   // Whether the formatting is currently applied
}

const BubbleToolbar: React.FC<BubbleToolbarProps> = ({ editor }) => {
  // Define all available formatting buttons and their toggle commands
  const buttons: FormatButton[] = [
    {
      label: 'B',
      // Toggle bold formatting on the selection
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: editor.isActive('bold'),
    },
    {
      label: 'I',
      // Toggle italic formatting on the selection
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: editor.isActive('italic'),
    },
    {
      label: 'S',
      // Toggle strikethrough on the selection
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: editor.isActive('strike'),
    },
    {
      label: '⟨⟩',
      // Toggle inline code on the selection
      action: () => editor.chain().focus().toggleCode().run(),
      isActive: editor.isActive('code'),
    },
    {
      label: '🔗',
      // Set or unset a hyperlink on the selection
      action: () => {
        if (editor.isActive('link')) {
          // If already a link, remove it
          editor.chain().focus().unsetLink().run();
        } else {
          // Prompt for URL and set the link
          const url = window.prompt('Enter URL');
          if (url) {
            editor.chain().focus().setLink({ href: url }).run();
          }
        }
      },
      isActive: editor.isActive('link'),
    },
    {
      label: 'H',
      // Toggle highlight mark with signal-amber color
      action: () => editor.chain().focus().toggleHighlight({ color: COLORS.signalAmber }).run(),
      isActive: editor.isActive('highlight'),
    },
  ];

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        background: COLORS.basalt,      // Dark basalt background
        borderRadius: '8px',
        padding: '4px 6px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.24)', // Strong shadow for prominence
        border: `1px solid ${COLORS.contour}`,     // Contour border
      }}
    >
      {buttons.map((btn) => (
        <button
          key={btn.label}
          onClick={btn.action}
          style={{
            // Active buttons get signal-amber, inactive get chalk
            color: btn.isActive ? COLORS.signalAmber : COLORS.chalk,
            background: 'transparent',
            border: 'none',
            borderRadius: '4px',
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: btn.isActive ? 700 : 500,
            fontFamily: '"Public Sans", sans-serif',
            transition: 'color 0.15s ease, background 0.15s ease',
            lineHeight: '1.4',
          }}
          // Change background on hover for feedback
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = COLORS.fog;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
          // Accessible tooltip for screen readers
          title={btn.label}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
};

// ─── BlockHandle Component ──────────────────────────────────────────────────
// Shows a drag handle (⋮⋮) and add button (+) on the left side of blocks
// Displayed on hover over any block in the editor
interface BlockHandleProps {
  editor: Editor; // The Tiptap editor instance
}

const BlockHandle: React.FC<BlockHandleProps> = ({ editor }) => {
  // Track which block element the mouse is currently hovering over
  const [hoveredBlock, setHoveredBlock] = useState<HTMLElement | null>(null);
  // Position coordinates for the handle overlay
  const [handlePos, setHandlePos] = useState<{ top: number; left: number } | null>(null);
  // Ref to the editor DOM container
  const editorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Find the ProseMirror editor container element
    const editorElement = document.querySelector('.ProseMirror') as HTMLElement;
    if (!editorElement) return;
    editorRef.current = editorElement;

    const handleMouseMove = (e: MouseEvent) => {
      // Find the nearest block-level element under the cursor
      const target = e.target as HTMLElement;
      const block = target.closest(
        'p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre, hr, [data-type="taskList"]'
      ) as HTMLElement;

      if (block && editorElement.contains(block)) {
        setHoveredBlock(block);
        // Calculate handle position relative to the block's bounding box
        const rect = block.getBoundingClientRect();
        const editorRect = editorElement.getBoundingClientRect();
        setHandlePos({
          top: rect.top - editorRect.top,  // Vertical offset from editor top
          left: -36,                        // Positioned to the left of the content
        });
      } else {
        // Clear handle when mouse leaves all blocks
        setHoveredBlock(null);
        setHandlePos(null);
      }
    };

    const handleMouseLeave = () => {
      // Hide handle when cursor leaves the editor area
      setHoveredBlock(null);
      setHandlePos(null);
    };

    // Attach mouse tracking events
    editorElement.addEventListener('mousemove', handleMouseMove);
    editorElement.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      editorElement.removeEventListener('mousemove', handleMouseMove);
      editorElement.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [editor]);

  // Don't render if no block is hovered
  if (!handlePos || !hoveredBlock) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: `${handlePos.top}px`,
        left: `${handlePos.left}px`,
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        zIndex: 10,
        opacity: 0.7,                // Subtle when not interacted with
        transition: 'opacity 0.15s ease',
      }}
      // Full opacity on hover for clear visibility
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.opacity = '0.7';
      }}
    >
      {/* Add block button — inserts a new paragraph below the hovered block */}
      <button
        onClick={() => {
          // Find the position at the end of the hovered block
          const pos = editor.view.posAtDOM(hoveredBlock, 0);
          const resolved = editor.state.doc.resolve(pos);
          const after = resolved.after();
          // Insert a new empty paragraph and place cursor there
          editor
            .chain()
            .focus()
            .insertContentAt(after, { type: 'paragraph' })
            .setTextSelection(after + 1)
            .run();
        }}
        style={{
          width: '20px',
          height: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          color: COLORS.mist,         // Muted color for subtlety
          fontSize: '16px',
          fontWeight: 300,
          padding: 0,
          lineHeight: 1,
        }}
        // Highlight on hover
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = COLORS.chalk;
          (e.currentTarget as HTMLButtonElement).style.color = COLORS.ink;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = COLORS.mist;
        }}
        title="Add block below"
      >
        +
      </button>
      {/* Drag handle — visual indicator for block dragging (decorative) */}
      <button
        // Dragging is indicated visually; actual DnD would require a ProseMirror plugin
        draggable
        onDragStart={(e) => {
          // Find the ProseMirror position of the hovered block
          const pos = editor.view.posAtDOM(hoveredBlock, 0);
          const resolved = editor.state.doc.resolve(pos);
          // Select the entire parent node for a potential drag operation
          editor.commands.setNodeSelection(resolved.before());
        }}
        style={{
          width: '20px',
          height: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          borderRadius: '4px',
          cursor: 'grab',            // Grab cursor to indicate draggability
          color: COLORS.mist,
          fontSize: '12px',
          padding: 0,
          lineHeight: 1,
          letterSpacing: '1px',
        }}
        // Highlight on hover
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = COLORS.chalk;
          (e.currentTarget as HTMLButtonElement).style.color = COLORS.ink;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = COLORS.mist;
        }}
        title="Drag to reorder"
      >
        ⋮⋮
      </button>
    </div>
  );
};

// ─── EditorWYSIWYG Component ────────────────────────────────────────────────
// The rich Tiptap WYSIWYG editor with all extensions, slash menu, and bubble toolbar
interface EditorWYSIWYGProps {
  content: string;                      // HTML content string to render
  onUpdate: (html: string) => void;     // Callback fired when content changes
}

export const EditorWYSIWYG: React.FC<EditorWYSIWYGProps> = ({ content, onUpdate }) => {
  // State to track whether the slash menu is currently visible
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);

  // Initialize the Tiptap editor with all configured extensions
  const editor = useEditor({
    // Render immediately on the client (not SSR-deferred)
    immediatelyRender: false,
    extensions: [
      // StarterKit bundles essentials: document, paragraph, text, bold, italic, strike,
      // code, heading, codeBlock, blockquote, bulletList, orderedList, listItem,
      // horizontalRule, hardBreak, dropcursor, gapcursor, undoRedo, link
      StarterKit.configure({
        // Configure heading to support only levels 1–3
        heading: {
          levels: [1, 2, 3],
        },
      }),
      // Show placeholder text when a block is empty
      Placeholder.configure({
        placeholder: 'Type / for commands...',
      }),
      // TaskList & TaskItem for checkbox-based to-do lists
      TaskList,
      TaskItem.configure({
        nested: true, // Allow nested task items
      }),
      // Highlight mark for background-color emphasis
      Highlight.configure({
        multicolor: true, // Support multiple highlight colors
      }),
      // Typography extension auto-converts quotes, dashes, ellipsis, etc.
      Typography,
      // Image node for embedding images in the document
      Image.configure({
        inline: false, // Render images as block-level elements
      }),
      // Custom mermaid diagram block
      MermaidBlock,
    ],
    // Set initial content from prop
    content,
    // Fire onUpdate callback with the new HTML whenever the document changes
    onUpdate: ({ editor: ed }) => {
      onUpdate(ed.getHTML());
    },
    // Configure the ProseMirror editor's HTML attributes
    editorProps: {
      attributes: {
        // Apply base styling classes to the editor container
        class: 'font-sans outline-none',
        style: [
          'min-height: 200px',           // Minimum editing area height
          'padding: 12px 40px 12px 16px', // Content padding (extra left for block handles)
          `color: ${COLORS.ink}`,        // Ink-colored text
          'font-family: "Public Sans", sans-serif',
          'font-size: 16px',
          'line-height: 1.7',
          'caret-color: ' + COLORS.signalAmber,  // Amber cursor for visual flair
        ].join('; '),
      },
    },
  });

  // Sync content prop changes into the editor (for external updates)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      // emitUpdate: false prevents triggering onUpdate callback during sync
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  // Guard: don't render until editor is initialized
  if (!editor) return null;

  return (
    <div style={{ position: 'relative' }}>
      {/* Block drag handle + add button — appears on hover */}
      <BlockHandle editor={editor} />

      {/* Floating Bubble Menu — appears when text is selected */}
      <BubbleMenu
        editor={editor}
        // Only show bubble menu when there's an actual text selection (not collapsed cursor)
        shouldShow={({ state }: { state: any }) => {
          const { from, to } = state.selection;
          return from !== to; // Only show when text is selected
        }}
      >
        <BubbleToolbar editor={editor} />
      </BubbleMenu>

      {/* Floating Slash Menu — appears when cursor is on an empty line (for "/" commands) */}
      <FloatingMenu
        editor={editor}
        // Show the slash menu only when user types "/" on an empty-ish line
        shouldShow={({ state }: { state: any }) => {
          const { from } = state.selection;
          const resolved = state.doc.resolve(from);
          const textBefore = resolved.parent.textContent;
          // Show if the line starts with "/" (user just typed it)
          const shouldShow = textBefore.startsWith('/');

          // Sync the slash menu open state
          if (shouldShow !== slashMenuOpen) {
            setSlashMenuOpen(shouldShow);
          }
          return shouldShow;
        }}
        options={{
          placement: 'bottom-start', // Position below and aligned to the start of the line
          offset: { mainAxis: 8 },   // Small gap between cursor and menu
        }}
      >
        <SlashCommandMenu editor={editor} onClose={() => setSlashMenuOpen(false)} />
      </FloatingMenu>

      {/* The main editor content area */}
      <EditorContent editor={editor} />

      {/* Injected <style> tag for editor-specific styles that can't be done inline */}
      {/* This handles ProseMirror node styles like headings, code blocks, etc. */}
      <style>{`
        /* ── Heading styles: use serif font (Fraunces) ── */
        .ProseMirror h1 {
          font-family: "Fraunces", serif;
          font-size: 2em;
          font-weight: 700;
          margin: 1.2em 0 0.4em 0;
          line-height: 1.25;
          color: ${COLORS.ink};
        }
        .ProseMirror h2 {
          font-family: "Fraunces", serif;
          font-size: 1.5em;
          font-weight: 600;
          margin: 1em 0 0.3em 0;
          line-height: 1.3;
          color: ${COLORS.ink};
        }
        .ProseMirror h3 {
          font-family: "Fraunces", serif;
          font-size: 1.25em;
          font-weight: 600;
          margin: 0.8em 0 0.25em 0;
          line-height: 1.35;
          color: ${COLORS.ink};
        }

        /* ── Code block: monospace font (JetBrains Mono) ── */
        .ProseMirror pre {
          font-family: "JetBrains Mono", monospace;
          background: ${COLORS.fog};
          color: ${COLORS.chalk};
          border-radius: 8px;
          padding: 16px 20px;
          font-size: 14px;
          line-height: 1.6;
          overflow-x: auto;
          margin: 0.75em 0;
        }
        .ProseMirror pre code {
          font-family: inherit;
          background: none;
          color: inherit;
          padding: 0;
          font-size: inherit;
        }

        /* ── Inline code: monospace with subtle background ── */
        .ProseMirror code {
          font-family: "JetBrains Mono", monospace;
          background: ${COLORS.chalk};
          color: ${COLORS.ember};
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.9em;
        }

        /* ── Blockquote: left border accent ── */
        .ProseMirror blockquote {
          border-left: 3px solid ${COLORS.signalAmber};
          padding-left: 16px;
          margin: 0.75em 0;
          color: ${COLORS.mist};
          font-style: italic;
        }

        /* ── Horizontal rule: styled divider ── */
        .ProseMirror hr {
          border: none;
          border-top: 2px solid ${COLORS.chalk};
          margin: 1.5em 0;
        }

        /* ── Task list: checkbox styling ── */
        .ProseMirror ul[data-type="taskList"] {
          list-style: none;
          padding-left: 0;
        }
        .ProseMirror ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin: 4px 0;
        }
        .ProseMirror ul[data-type="taskList"] li > label {
          flex-shrink: 0;
          margin-top: 4px;
        }
        .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"] {
          width: 16px;
          height: 16px;
          accent-color: ${COLORS.trailTeal};
          cursor: pointer;
        }
        /* Strike-through checked items */
        .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div > p {
          text-decoration: line-through;
          color: ${COLORS.mist};
        }

        /* ── Regular list styles ── */
        .ProseMirror ul:not([data-type="taskList"]) {
          list-style-type: disc;
          padding-left: 24px;
        }
        .ProseMirror ol {
          list-style-type: decimal;
          padding-left: 24px;
        }
        .ProseMirror li {
          margin: 2px 0;
        }

        /* ── Links ── */
        .ProseMirror a {
          color: ${COLORS.trailTeal};
          text-decoration: underline;
          text-underline-offset: 2px;
          cursor: pointer;
        }
        .ProseMirror a:hover {
          color: ${COLORS.signalAmber};
        }

        /* ── Images ── */
        .ProseMirror img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 0.75em 0;
        }

        /* ── Highlight mark ── */
        .ProseMirror mark {
          background-color: ${COLORS.signalAmber};
          color: ${COLORS.ink};
          padding: 1px 3px;
          border-radius: 3px;
        }

        /* ── Paragraph spacing ── */
        .ProseMirror p {
          margin: 0.35em 0;
        }

        /* ── Placeholder text (from Placeholder extension) ── */
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: ${COLORS.mist};
          pointer-events: none;
          height: 0;
          font-style: italic;
        }
        /* Placeholder for empty nodes beyond the first */
        .ProseMirror .is-empty::before {
          content: attr(data-placeholder);
          float: left;
          color: ${COLORS.mist};
          pointer-events: none;
          height: 0;
        }

        /* ── Focus ring removal (we use caret-color instead) ── */
        .ProseMirror:focus {
          outline: none;
        }

        /* ── Selection highlight ── */
        .ProseMirror ::selection {
          background: rgba(232, 163, 61, 0.2);
        }
      `}</style>
    </div>
  );
};

// ─── EditorRaw Component ────────────────────────────────────────────────────
// A plain textarea for viewing and editing raw markdown/HTML content
interface EditorRawProps {
  content: string;                        // The raw content string
  onUpdate: (content: string) => void;    // Callback when content is edited
}

export const EditorRaw: React.FC<EditorRawProps> = ({ content, onUpdate }) => {
  return (
    <textarea
      value={content}
      // Update the content state on every keystroke
      onChange={(e) => onUpdate(e.target.value)}
      style={{
        width: '100%',
        minHeight: '400px',
        padding: '16px 20px',
        // Monospace font for raw code editing
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: '14px',
        lineHeight: '1.7',
        color: COLORS.chalk,            // Light text on dark background
        background: COLORS.fog,         // Dark code-editor background
        border: `1px solid ${COLORS.contour}`,
        borderRadius: '8px',
        resize: 'vertical',            // Allow vertical resize only
        outline: 'none',
        tabSize: 2,
      }}
      // Highlight border on focus
      onFocus={(e) => {
        (e.currentTarget as HTMLTextAreaElement).style.borderColor = COLORS.signalAmber;
      }}
      onBlur={(e) => {
        (e.currentTarget as HTMLTextAreaElement).style.borderColor = COLORS.contour;
      }}
      // Allow Tab key to insert actual tab characters instead of moving focus
      onKeyDown={(e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const target = e.currentTarget;
          const start = target.selectionStart;
          const end = target.selectionEnd;
          // Insert two spaces at cursor position (soft tab)
          const newValue = content.substring(0, start) + '  ' + content.substring(end);
          onUpdate(newValue);
          // Restore cursor position after the inserted spaces
          requestAnimationFrame(() => {
            target.selectionStart = start + 2;
            target.selectionEnd = start + 2;
          });
        }
      }}
      spellCheck={false}                 // Disable spellcheck for code editing
    />
  );
};

// ─── MdnotionEditor Component ───────────────────────────────────────────────
// The main wrapper component that manages the toggle state between
// WYSIWYG (rich) and Raw (text) editing modes, keeping content in sync
interface MdnotionEditorProps {
  initialContent?: string;               // Optional initial HTML content
  onChange?: (content: string) => void;   // Optional callback for external content updates
}

export const MdnotionEditor: React.FC<MdnotionEditorProps> = ({
  initialContent = '<p></p>',
  onChange,
}) => {
  // The current editing mode: 'wysiwyg' for rich editing, 'raw' for plain text
  const [mode, setMode] = useState<'wysiwyg' | 'raw'>('wysiwyg');
  // The shared content state (HTML string) used by both modes
  const [content, setContent] = useState(initialContent);

  // Sync external content if it changes
  useEffect(() => {
    if (initialContent !== undefined && initialContent !== content) {
      setContent(initialContent);
    }
  }, [initialContent]);

  // Wrapped content updater that also notifies external consumers
  const handleUpdate = useCallback(
    (newContent: string) => {
      setContent(newContent);
      // Fire the onChange callback if provided
      onChange?.(newContent);
    },
    [onChange]
  );

  return (
    <div
      style={{
        borderRadius: '12px',
        border: `1px solid ${COLORS.chalk}`,
        overflow: 'hidden',
        background: '#FFFFFF',           // White editor background
        fontFamily: '"Public Sans", sans-serif',
      }}
    >
      {/* ── Toolbar: mode toggle and info ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: `1px solid ${COLORS.chalk}`,
          background: COLORS.paper,       // Paper-colored toolbar
        }}
      >
        {/* Left side: editor mode label */}
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: COLORS.mist,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontFamily: '"Public Sans", sans-serif',
          }}
        >
          {/* Show the current active mode name */}
          {mode === 'wysiwyg' ? '✏️ Editor' : '⟨/⟩ Source'}
        </span>

        {/* Right side: toggle button to switch modes */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {/* WYSIWYG mode button */}
          <button
            onClick={() => setMode('wysiwyg')}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: 500,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontFamily: '"Public Sans", sans-serif',
              // Active mode gets basalt bg + chalk text; inactive gets transparent
              background: mode === 'wysiwyg' ? COLORS.basalt : 'transparent',
              color: mode === 'wysiwyg' ? COLORS.chalk : COLORS.mist,
              transition: 'all 0.15s ease',
            }}
          >
            WYSIWYG
          </button>
          {/* Raw source mode button */}
          <button
            onClick={() => setMode('raw')}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: 500,
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontFamily: '"Public Sans", sans-serif',
              // Active mode gets basalt bg + chalk text; inactive gets transparent
              background: mode === 'raw' ? COLORS.basalt : 'transparent',
              color: mode === 'raw' ? COLORS.chalk : COLORS.mist,
              transition: 'all 0.15s ease',
            }}
          >
            Raw
          </button>
        </div>
      </div>

      {/* ── Editor content area: render the active mode ── */}
      <div style={{ minHeight: '200px' }}>
        {mode === 'wysiwyg' ? (
          // Rich WYSIWYG editor with all extensions
          <EditorWYSIWYG content={content} onUpdate={handleUpdate} />
        ) : (
          // Plain text editor for raw HTML/markdown source
          <EditorRaw content={content} onUpdate={handleUpdate} />
        )}
      </div>
    </div>
  );
};
