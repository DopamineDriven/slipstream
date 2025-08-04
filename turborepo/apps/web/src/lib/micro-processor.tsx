"use client";

import type { Root } from "react-dom/client";
import { memo, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { processMarkdownToReact } from "@/lib/processor";

export const MicroMarkdown = memo(
  ({ chunk }: { chunk: string }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const rootRef = useRef<Root | undefined>(undefined);

    useEffect(() => {
      if (containerRef.current && !rootRef.current) {
        rootRef.current = createRoot(containerRef.current);
      }
    }, []);

    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;

      let cancelled = false;

      processMarkdownToReact(chunk)
        .then(result => {
          if (!cancelled) {
            root.render(result);
          }
        })
        .catch(error => {
          if (!cancelled) {
            console.error("Markdown processing failed:", error);
            root.render(<div>Error processing markdown</div>);
          }
        });

      // prevent state updates after unmount
      return () => {
        cancelled = true;
      };
    }, [chunk]);

    useEffect(() => {
      return () => {
        if (rootRef.current) {
          rootRef.current.unmount();
        }
      };
    }, []);

    return <div ref={containerRef} style={{ display: "contents" }} />;
  },
  (prev, next) => prev.chunk === next.chunk
);
