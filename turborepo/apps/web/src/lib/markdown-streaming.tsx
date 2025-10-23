import type { JSX, ReactNode } from "react";
import { preprocessAIMarkdown } from "@/lib/preprocess";
import { preprocessMathDelimiters } from "@/lib/processor";
import { cn } from "@/lib/utils";
import { CodeBlock } from "@/ui/atoms/code-block";

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
          return <hr key={i} className="my-3" />;
        }

        // Handle code blocks
        if (block.startsWith("```")) {
          const lines = block.split("\n");
          const language = lines?.[0]?.slice(3) ?? "text";
          const code = lines.slice(1, -1).join("\n");

          return (
            <CodeBlock key={i} className="my-2">
              <code className={cn(`language-${language}`)}>{code}</code>
            </CodeBlock>
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
              '<code class="px-1 py-0.5 rounded text-[0.9em] font-mono bg-black/20">$1</code>'
            )
            .replace(
              /\[([^\]]+)\]\(([^)]+)\)/g,
              '<a href="$2" class="hover:underline" target="_blank" rel="noopener noreferrer">$1</a>'
            )
            .replace(/\n/g, "<br>");

          return (
            <blockquote key={i} className="mb-2 border-l-4 pl-4 italic">
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
              <div
                key={i}
                className="-mx-3 my-3 overflow-x-auto overscroll-x-contain px-3 [-webkit-overflow-scrolling:touch] md:mx-0"
                role="region"
                aria-label="Scrollable table">
                <table className="mb-4 w-full min-w-[80dvw] table-fixed border-collapse border">
                  <thead className="wrap-break-words px-2.5 py-2 text-left align-top text-sm whitespace-normal">
                    <tr className="border-b">
                      {headers?.map((header, j) => (
                        <th
                          key={j}
                          className="wrap-break-words px-2.5 py-2 text-left align-top text-sm whitespace-normal">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, j) => (
                      <tr key={j} className="border-b">
                        {row.map((cell, k) => (
                          <td
                            key={k}
                            className="wrap-break-words [&_a]:wrap-break-words [&_code]:wrap-break-words [&_li]:wrap-break-words px-3 py-1.5 align-top text-sm whitespace-normal">
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
                                    '<code class="px-1 py-0.5 rounded text-[0.9em] font-mono bg-black/20">$1</code>'
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
            "text-5xl", // h1
            "text-4xl", // h2
            "text-3xl", // h3
            "text-2xl", // h4
            "text-xl", // h5
            "text-lg" // h6
          ];

          return (
            <HeadingTag key={i} className={cn(`${sizeClasses?.[level - 1]}`)}>
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
                  '<code class="px-1 py-0.5 rounded text-[0.9em] font-mono bg-black/20">$1</code>'
                );

              return {
                content: `<span class="flex items-center gap-2">\n<input type="checkbox" ${isChecked ? "checked" : ""} disabled class="rounded border" />\n<span>${taskContent}</span>\n</span>`,
                indent: currentIndent,
                isTask: true
              };
            }

            const processedItem = cleanedItem
              .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
              .replace(/\*(.+?)\*/g, "<em>$1</em>")
              .replace(
                /`(.+?)`/g,
                '<code class="px-1 py-0.5 rounded text-[0.9em] font-mono bg-black/20">$1</code>'
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
              className={cn(
                `mb-2 ml-6 ${listClass} space-y-0.5 [&_ol]:mt-1 [&_ol]:mb-0 [&_ul]:mt-1 [&_ul]:mb-0 [&>li]:pl-2.5`
              )}>
              {items.map((item, j) => (
                <li
                  key={j}
                  className="leading-7 whitespace-normal"
                  style={
                    item.indent > 0
                      ? { marginLeft: item.indent * 16 }
                      : undefined
                  }
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
            '<code class="px-1 py-0.5 rounded text-[0.9em] font-mono bg-black/20">$1</code>'
          )
          .replace(
            /\[([^\]]+)\]\(([^)]+)\)/g,
            '<a href="$2" class="hover:underline" target="_blank" rel="noopener noreferrer">$1</a>'
          )
          // eslint-disable-next-line no-regex-spaces
          .replace(/  \n/g, "<br>"); // Two spaces at end of line = line break

        return (
          <p
            key={i}
            className="mb-1.5 leading-7"
            dangerouslySetInnerHTML={{ __html: processedText }}
          />
        );
      })}
    </>
  );
}
