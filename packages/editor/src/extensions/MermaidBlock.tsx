import React, { useState, useEffect, useRef } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import mermaid from 'mermaid';

// Initialize mermaid with Waypoint theme settings
mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    primaryColor: '#F1EEE6',
    primaryTextColor: '#22262E',
    primaryBorderColor: '#2A3240',
    lineColor: '#3FA796',
    secondaryColor: '#E8A33D',
    tertiaryColor: '#14181F',
  },
  securityLevel: 'loose', // allow clicks, etc. if needed
});

const MermaidComponent: React.FC<NodeViewProps> = (props) => {
  const [content, setContent] = useState(props.node.attrs.content || 'graph TD\\n  A-->B;');
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(!props.node.attrs.content);

  // Re-render mermaid when content changes
  useEffect(() => {
    let isMounted = true;
    
    const renderDiagram = async () => {
      try {
        if (!content.trim()) {
          setSvg('');
          setError(null);
          return;
        }
        
        // Generate a unique ID for mermaid to mount to
        const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
        const { svg: renderedSvg } = await mermaid.render(id, content);
        
        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (e: any) {
        if (isMounted) {
          // Keep old SVG visible while showing error
          setError(e.message || 'Syntax Error');
        }
      }
    };
    
    const timeout = setTimeout(renderDiagram, 300); // Debounce rendering
    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [content]);

  // Sync back to Tiptap node attributes
  const updateContent = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    props.updateAttributes({ content: e.target.value });
  };

  return (
    <NodeViewWrapper className="mermaid-block relative my-6 rounded-lg overflow-hidden border border-[#EDEAE2]">
      {isEditing ? (
        <div className="bg-[#14181F] p-4 font-mono text-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[#8A93A3] text-xs uppercase tracking-wider font-semibold">Mermaid Source</span>
            <button 
              onClick={() => setIsEditing(false)}
              className="text-xs bg-[#E8A33D] text-[#14181F] px-2 py-1 rounded font-semibold hover:opacity-90"
            >
              Done
            </button>
          </div>
          <textarea
            value={content}
            onChange={updateContent}
            className="w-full bg-transparent text-[#EDEAE2] outline-none min-h-[100px] resize-y font-mono"
            placeholder="graph TD\\n  A-->B;"
            autoFocus
          />
          {error && <div className="text-[#C1483B] text-xs mt-2 border-t border-[#2A3240] pt-2">{error}</div>}
        </div>
      ) : (
        <div 
          className="bg-white p-6 flex items-center justify-center min-h-[150px] relative group cursor-pointer"
          onClick={() => setIsEditing(true)}
        >
          {/* Edit button appears on hover */}
          <button className="absolute top-2 right-2 bg-[#F1EEE6] text-[#22262E] px-2 py-1 text-xs rounded border border-[#EDEAE2] opacity-0 group-hover:opacity-100 transition-opacity">
            Edit Source
          </button>
          
          {svg ? (
            <div ref={containerRef} dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <span className="text-[#8A93A3] italic">Empty Diagram</span>
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
};

export const MermaidBlock = Node.create({
  name: 'mermaidBlock',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      content: {
        default: 'graph TD\\n  A-->B;',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="mermaid"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'mermaid' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidComponent);
  },
});
