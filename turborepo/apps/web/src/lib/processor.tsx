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
import { VFile } from "vfile";

interface CustomImageProps extends ComponentPropsWithRef<typeof Image> {
  "data-zoomable"?: boolean;
  [key: string]: unknown;
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

function preprocessMathDelimiters(content: string) {
  const inlineMath = /\\$$(.*?)\\$$/gs; // matches $$ … $$
  const displayMath = /\\\[(.*?)\\\]/gs; // matches \[ … \]
  const result = content
    .replace(displayMath, (_match, expr: string) => {
      // console.log(`📐 Converting display math: "${match}" → "$$${expr}$$"`);
      return `$$${expr}$$`;
    })
    .replace(inlineMath, (_match, expr: string) => {
      // console.log(`📏 Converting inline math: "${match}" → "$${expr}$"`);
      return `$${expr}$`;
    });
  return result;
}

const sanitizeSchema = {
  allowComments: true,
  allowDoctypes: true,
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "video",
    "source",
    "iframe",
    ...mathmlTags,
    "math",
    "mrow",
    "mi",
    "mn",
    "mo",
    "mfrac",
    "msup",
    "msub",
    "msubsup",
    "msqrt",
    "mroot",
    "mtext",
    "mspace",
    "semantics",
    "annotation"
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      "className",
      "style",
      "id",
      "data-*"
    ],
    math: ["xmlns", "display", "displaystyle"],
    mrow: ["*"],
    mi: ["*"],
    mn: ["*"],
    mo: ["*"],
    mfrac: ["*"],
    msup: ["*"],
    msub: ["*"],
    msubsup: ["*"],
    msqrt: ["*"],
    mroot: ["*"],
    mtext: ["*"],
    mspace: ["*"],
    semantics: ["*"],
    annotation: ["encoding", "*"]
  },
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src ?? []), "data"]
  }
} satisfies RehypeSanitizeOptions;

export async function processMarkdownToReact(content: string) {
  const preprocessedContent = preprocessMathDelimiters(content);
  const processor = unified();
  processor.use(remarkParse);
  processor.use(remarkGfm);
  processor.use(remarkMath);
  processor.use(remarkRehype, {
    allowDangerousHtml: true
  } satisfies RemarkRehypeOptions);
  processor.use(rehypeSanitize, sanitizeSchema);
  processor.use(
    rehypeKatex,
    Object.freeze({
      output: "mathml",
      strict: false,
      trust: true,
      throwOnError: false,
      errorColor: "#cc0000"
    })
  );
  processor.use(rehypePrettyCode, prettyCodeOptions);
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
  const file = new VFile({ value: preprocessedContent });
  const result = await processor.process(file);

  return result.result as React.ReactElement satisfies ReactNode;
}
