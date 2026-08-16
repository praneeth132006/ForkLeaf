import { useState, useEffect } from 'react';

// A simple hook to manage synchronization state and local storage persistence
export function useSync(key: string, initialValue: string) {
  const [content, setContent] = useState<string>(initialValue);
  const [syncStatus, setSyncStatus] = useState<"synced" | "syncing" | "conflict" | "local">("local");

  // Load from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem(key);
    if (saved) {
      setContent(saved);
    }
  }, [key]);

  // Save to local storage on change with a small debounce
  useEffect(() => {
    setSyncStatus("syncing");
    
    const handler = setTimeout(() => {
      localStorage.setItem(key, content);
      setSyncStatus("synced");
    }, 1000);

    return () => clearTimeout(handler);
  }, [content, key]);

  return { content, setContent, syncStatus };
}
