import type { Root } from "mdast";
import type { ComponentPropsWithRef, ReactNode } from "react";
import type {
  CharsElement,
  LineElement,
  Options as RehypePrettyCodeOptions
} from "rehype-pretty-code";
import type { Options as RehypeSanitizeOptions } from "rehype-sanitize";
import type { Options as RemarkRehypeOptions } from "remark-rehype";
import React, { createElement, Fragment } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import Image from "next/image";
import Link from "next/link";
import { mathmlTags } from "@/lib/mathml-tags";
import { shimmer } from "@/lib/shimmer";
import { slugify } from "@/lib/slugify";
import { CodeBlock } from "@/ui/atoms/code-block";
import { transformerMetaWordHighlight } from "@shikijs/transformers";
import rehypeKatex from "rehype-katex";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeReact from "rehype-react";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { VFile } from "vfile";

function _remarkFixHeadings() {
  return (tree: Root) => {
    visit(tree, "paragraph", (node, index, parent) => {
      if (!parent || !index) return;
      const fullText = node.children
        .map(child => {
          if (child.type === "text") return child.value;
          if (child.type === "inlineCode") return "`" + child.value + "`";
          if (child.type === "inlineMath") return "\\(" + child.value + "\\)";
          return "";
        })
        .join("");

      // Check if paragraph starts with heading syntax
      const headingMatch = fullText.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch?.[1] && headingMatch?.[2]) {
        const depth = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
        const headingText = headingMatch[2];

        // Parse the heading content back into inline nodes
        parent.children[index] = {
          type: "heading",
          depth,
          children: [
            {
              type: "text",
              value: headingText
            }
          ]
        };
      }

      const midMatch = fullText.match(/(.+?)(#{1,6})\s+(.+)/);
      if (
        midMatch?.[1] &&
        midMatch?.[2] &&
        midMatch?.[3] &&
        parent.type !== "root"
      ) {
        const [_, before, hashes, after] = midMatch;

        const depth = hashes.length as 1 | 2 | 3 | 4 | 5 | 6;

        // Split into: paragraph (before) + heading + paragraph (after)
        const newNodes = Array.of<
          | {
              type: "paragraph";
              children: {
                type: "text";
                value: string;
              }[];
            }
          | {
              type: "heading";
              depth: 1 | 2 | 3 | 4 | 5 | 6;
              children: {
                type: "text";
                value: string;
              }[];
            }
        >();
        if (before.trim()) {
          newNodes.push({
            type: "paragraph" as const,
            children: [{ type: "text" as const, value: before.trim() }]
          });
        }

        newNodes.push({
          type: "heading" as const,
          depth,
          children: [{ type: "text" as const, value: after.trim() }]
        });

        parent.children.splice(index, 1, ...newNodes);
      }
    });
  };
}

function remarkNormalizeMath() {
  return (tree: Root) => {
    visit(tree, "text", (node, index, parent) => {
      if (!parent || typeof index !== "number") return;

      // Only normalize obvious math delimiter issues
      let value = node.value;

      // Fix escaped parentheses that should be math delimiters
      value = value.replace(/\\$$/g, "$").replace(/\\$$/g, "$");

      // Fix escaped brackets for display math
      value = value.replace(/\\\[/g, "$$").replace(/\\\]/g, "$$");

      // Only update if we actually changed something
      if (value !== node.value) {
        node.value = value;
      }
    });
  };
}
interface CustomImageProps extends ComponentPropsWithRef<typeof Image> {
  "data-zoomable"?: boolean;
  [key: string]: any;
}

function createHeading(level: 1 | 2 | 3 | 4 | 5 | 6) {
  const Heading = ({
    children,
    ...rest
  }: { children: ReactNode } & Omit<
    ComponentPropsWithRef<`h${typeof level}`>,
    "children"
  >) => {
    const slug = typeof children === "string" ? slugify(children) : "";
    const target =
      `h${level}` as const satisfies keyof React.JSX.IntrinsicElements;
    return createElement(
      target,
      { id: slug, ...rest },
      [
        createElement("a", {
          href: `#${slug}`,
          key: `link-${slug}`,
          className: "anchor"
        })
      ],
      children
    );
  };
  Heading.displayName = `Heading${level}`;

  return Heading;
}

function CustomLink({ href, children, ...props }: ComponentPropsWithRef<"a">) {
  if (href?.startsWith("/")) {
    return (
      <Link href={href} {...props}>
        {children}
      </Link>
    );
  }

  if (href?.startsWith("#")) {
    return (
      <Link href={href} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
}
const prettyCodeOptions = {
  grid: true,
  keepBackground: true,
  theme: "dark-plus",
  bypassInlineCode: false,
  onVisitLine(node: LineElement) {
    if (node.children.length === 0) {
      node.children = [{ type: "text", value: " " }];
    }
  },
  onVisitHighlightedLine(node: LineElement) {
    node?.properties?.className?.push("highlighted");
  },
  onVisitHighlightedChars(node: CharsElement) {
    node.properties.className = ["word"];
  },
  transformers: [transformerMetaWordHighlight()]
} satisfies RehypePrettyCodeOptions;

function CustomImage({
  src,
  alt = "",
  width = 800,
  height = 600,
  "data-zoomable": _zoomable,
  ...props
}: CustomImageProps) {
  return (
    <Image
      src={src || "/placeholder.svg"}
      alt={alt}
      width={width}
      height={height}
      placeholder="blur"
      blurDataURL={shimmer([width, height])}
      sizes="100vw"
      style={{ width: "100%", height: "auto", objectFit: "cover" }}
      {...props}
    />
  );
}

const components = {
  a: CustomLink,
  pre: ({ children, ...props }: ComponentPropsWithRef<"pre">) => {
    return <CodeBlock {...props}>{children}</CodeBlock>;
  },
  h1: createHeading(1),
  h2: createHeading(2),
  h3: createHeading(3),
  h4: createHeading(4),
  h5: createHeading(5),
  h6: createHeading(6),
  img: CustomImage
};

/**
 * Need to pinpoint how each ai-model returns markdown -- are there special niche formats I'm unaware of?
 */
const commonMathMLTags = mathmlTags;
export async function processMarkdownToReact(content: string) {
  // const content = preprocessAIMarkdown(contentRaw);
  const processor = unified();
  processor.use(remarkParse);
  processor.use(remarkNormalizeMath);
  processor.use(remarkGfm);
  processor.use(remarkMath);
  processor.use(remarkRehype, {
    allowDangerousHtml: true
  } satisfies RemarkRehypeOptions);
  processor.use(rehypeKatex);
  processor.use(rehypePrettyCode, prettyCodeOptions);
  processor.use(rehypeSanitize, {
    allowDoctypes: true,
    allowComments: true,
    tagNames: [
      "a",
      "audio",
      "aside",
      "address",
      "b",
      "blockquote",
      "br",
      "code",
      "cite",
      "caption",
      "canvas",
      "data",
      "dd",
      "del",
      "details",
      "div",
      "dl",
      "dt",
      "em",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "hr",
      "g",
      "i",
      "label",
      "iframe",
      "img",
      "image",
      "input",
      "ins",
      "kbd",
      "li",
      "ol",
      "p",
      "picture",
      "pre",
      "q",
      "rp",
      "rt",
      "ruby",
      "s",
      "samp",
      "section",
      "source",
      "span",
      "strike",
      "strong",
      "sub",
      "summary",
      "sup",
      "svg",
      "table",
      "tbody",
      "video",
      "td",
      "tfoot",
      "th",
      "thead",
      "time",
      "tr",
      "tt",
      "ul",
      "var",
      ...commonMathMLTags
    ],
    attributes: {
      ...(defaultSchema.attributes ?? {}),
      "*": [
        "className",
        "style",
        "id",
        "data*",
        "data-line",
        "data-line-numbers"
      ],
      code: [
        "className",
        "data*",
        "style",
        "id",
        "data-language",
        "data-theme"
      ],
      span: ["className", "style", "data*", "id", "aria-hidden"],
      pre: ["className", "data*", "style", "tabIndex", "id"],
      div: ["className", "data*", "style", "aria-hidden"],
      annotation: ["encoding"],
      math: ["xmlns", "display"]
    },
    protocols: {
      ...defaultSchema.protocols,
      src: [...(defaultSchema.protocols?.src ?? []), "data"]
    }
  } satisfies RehypeSanitizeOptions);
  processor.use(rehypeReact, {
    jsx: jsxRuntime.jsx,
    jsxs: jsxRuntime.jsxs,
    Fragment: Fragment,
    createElement,
    components: {
      ...components
    },
    passNode: true
  });
  const file = new VFile({ value: content });
  const result = await processor.process(file);

  return result.result as React.ReactElement satisfies ReactNode;
}

declare module "vfile" {
  /**
   * a VFile class without conditionally undefined Type Coerceion in the `data` field
   */
  class VFileSansCoercion<
    TData extends { [P in keyof DataMap]: DataMap[P] }
  > extends VFile {
    data: TData;
  }
}
export default processMarkdownToReact;
