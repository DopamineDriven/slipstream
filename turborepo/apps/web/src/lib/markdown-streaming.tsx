import type { JSX, ReactNode } from "react";
import { preprocessAIMarkdown } from "@/lib/preprocess";
import { preprocessMathDelimiters } from "@/lib/processor";

/**
 * Lightweight markdown processor for streaming messages
 * Supports:
 * - Headings (# to ######)
 * - Bold (**text**)
 * - Italic (*text*)
 * - Inline code (`code`)
 * - Code blocks (```language)
 * - Links ([text](url))
 * - Blockquotes (> text)
 * - Horizontal rules (---, ***, ___)
 * - Tables (with header separator)
 * - Unordered lists (-, *, +)
 * - Ordered lists (1., 2., etc.)
 * - Math expressions (\(...\) and \[...\])
 */
export function processStreamingMarkdown(content: string): ReactNode {
  // First convert math delimiters, then apply other preprocessing
  const mathProcessed = preprocessMathDelimiters(content);
  const preprocessed = preprocessAIMarkdown(mathProcessed);

  const blocks = preprocessed.split("\n\n");

  return (
    <>
      {blocks.map((block, i) => {
        if (!block.trim()) return null;

        // Handle horizontal rules
        if (/^[-*_]{3,}$/.test(block.trim())) {
          return <hr key={i} className="border-brand-border my-4" />;
        }

        // Handle code blocks
        if (block.startsWith("```")) {
          const lines = block.split("\n");
          const language = lines?.[0]?.slice(3) ?? "text";
          const code = lines.slice(1, -1).join("\n");

          return (
            <pre
              key={i}
              lang={language}
              className="my-2 overflow-x-auto rounded-md bg-slate-800 p-3">
              <code className={`text-sm text-slate-100 language-${language}`}>
                {code}
              </code>
            </pre>
          );
        }

        // Handle blockquotes
        if (block.startsWith(">")) {
          const quoteLines = block
            .split("\n")
            .map(line => line.replace(/^>\s?/, ""))
            .join("\n");

          const processedQuote = quoteLines
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.+?)\*/g, "<em>$1</em>")
            .replace(
              /`(.+?)`/g,
              '<code class="bg-slate-700 px-1 py-0.5 rounded text-xs">$1</code>'
            )
            .replace(
              /\[([^\]]+)\]\(([^)]+)\)/g,
              '<a href="$2" class="text-brand-primary hover:underline" target="_blank" rel="noopener noreferrer">$1</a>'
            )
            .replace(/\n/g, "<br>");

          return (
            <blockquote
              key={i}
              className="border-brand-primary/50 text-brand-text-muted my-3 border-l-4 pl-4">
              <p dangerouslySetInnerHTML={{ __html: processedQuote }} />
            </blockquote>
          );
        }

        // Handle tables
        if (block.includes("|") && block.split("\n").length > 2) {
          const lines = block.split("\n").filter(line => line.trim());

          // Check if it looks like a table (has header separator)
          // eslint-disable-next-line no-useless-escape
          if (lines.length >= 3 && lines?.[1]?.match(/^[\s\|:\-]+$/)) {
            const headers = lines?.[0]
              ?.split("|")
              .map(h => h.trim())
              .filter(h => h);
            const rows = lines.slice(2).map(row =>
              row
                .split("|")
                .map(cell => cell.trim())
                .filter(cell => cell !== undefined)
            );

            return (
              <div key={i} className="my-3 overflow-x-auto">
                <table className="divide-brand-border min-w-full divide-y">
                  <thead>
                    <tr>
                      {headers?.map((header, j) => (
                        <th
                          key={j}
                          className="text-brand-text-muted px-3 py-2 text-left text-xs font-medium tracking-wider uppercase">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-brand-border divide-y">
                    {rows.map((row, j) => (
                      <tr key={j}>
                        {row.map((cell, k) => (
                          <td
                            key={k}
                            className="text-brand-text px-3 py-2 text-sm whitespace-nowrap">
                            <span
                              dangerouslySetInnerHTML={{
                                __html: cell
                                  .replace(
                                    /\*\*(.+?)\*\*/g,
                                    "<strong>$1</strong>"
                                  )
                                  .replace(/\*(.+?)\*/g, "<em>$1</em>")
                                  .replace(
                                    /`(.+?)`/g,
                                    '<code class="bg-slate-700 px-1 py-0.5 rounded text-xs">$1</code>'
                                  )
                              }}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
        }

        // Handle headings
        const headingMatch = block.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
          const level = headingMatch?.[1]?.length ?? 0;
          const text = headingMatch[2];
          const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;
          const sizeClasses = [
            "text-2xl font-bold", // h1
            "text-xl font-bold", // h2
            "text-lg font-semibold", // h3
            "text-base font-semibold", // h4
            "text-sm font-medium", // h5
            "text-xs font-medium" // h6
          ];

          return (
            <HeadingTag
              key={i}
              className={`${sizeClasses?.[level - 1]} text-brand-text my-2 [&_h1]:text-4xl [&_h2]:text-3xl [&_h3]:text-2xl [&_h4,h5]:text-xl`}>
              {text}
            </HeadingTag>
          );
        }

        // Handle lists (both unordered and ordered)
        // eslint-disable-next-line no-useless-escape
        if (block.match(/^[\*\-\+]\s/) || block.match(/^\d+\.\s/)) {
          const lines = block.split("\n");
          const isOrderedStr = lines?.[0] ?? "";
          const isOrdered = /^\d+\./.test(isOrderedStr);

          const ListTag = isOrdered ? "ol" : "ul";
          const listClass = isOrdered ? "list-decimal" : "list-disc";

          const processListItem = (line: string) => {
            // Check for sub-items (2+ spaces or tab)
            const indentMatch = line.match(/^(\s+)/);
            const currentIndent = indentMatch
              ? Math.floor((indentMatch?.[1]?.length ?? 0) / 2)
              : 0;

            const cleanedItem = line
              .trim()
              // eslint-disable-next-line no-useless-escape
              .replace(/^[\*\-\+]\s+/, "")
              .replace(/^\d+\.\s+/, "");

            // Handle task list items (- [ ] or - [x])
            const taskMatch = cleanedItem.match(/^\[([ x])\]\s+(.+)$/);
            if (taskMatch) {
              const isChecked = taskMatch[1] === "x";
              const taskContent = (taskMatch[2] ?? "")
                .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                .replace(/\*(.+?)\*/g, "<em>$1</em>")
                .replace(
                  /`(.+?)`/g,
                  '<code class="bg-slate-700 px-1 py-0.5 rounded text-xs">$1</code>'
                );

              return {
                content: `<span class="flex items-center gap-2">
                  <input type="checkbox" ${isChecked ? "checked" : ""} disabled class="rounded border-brand-border" />
                  <span>${taskContent}</span>
                </span>`,
                indent: currentIndent,
                isTask: true
              };
            }

            const processedItem = cleanedItem
              .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
              .replace(/\*(.+?)\*/g, "<em>$1</em>")
              .replace(
                /`(.+?)`/g,
                '<code class="bg-slate-700 px-1 py-0.5 rounded text-xs">$1</code>'
              );

            return {
              content: processedItem,
              indent: currentIndent,
              isTask: false
            };
          };

          const items = lines
            .filter(line => line.trim())
            .map(line => processListItem(line));

          return (
            <ListTag
              key={i}
              className={`${listClass} text-brand-text my-2 list-inside space-y-1`}>
              {items.map((item, j) => (
                <li
                  key={j}
                  className={item.indent > 0 ? `ml-${item.indent * 4}` : ""}
                  dangerouslySetInnerHTML={{ __html: item.content }}
                />
              ))}
            </ListTag>
          );
        }

        // Handle paragraphs with inline formatting
        const processedText = block
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>")
          .replace(
            /`(.+?)`/g,
            '<code class="bg-slate-700 px-1 py-0.5 rounded text-sm">$1</code>'
          )
          .replace(
            /\[([^\]]+)\]\(([^)]+)\)/g,
            '<a href="$2" class="text-brand-primary hover:underline" target="_blank" rel="noopener noreferrer">$1</a>'
          )
          // eslint-disable-next-line no-regex-spaces
          .replace(/  \n/g, "<br>") // Two spaces at end of line = line break
          .replace(/\n/g, " "); // Regular line breaks become spaces

        return (
          <p
            key={i}
            className="text-brand-text mb-2 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: processedText }}
          />
        );
      })}
    </>
  );
}
