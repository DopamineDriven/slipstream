import type { ComponentPropsWithRef, ReactNode } from "react";
import type {
  CharsElement,
  LineElement,
  Options as RehypePrettyCodeOptions
} from "rehype-pretty-code";
import type { Options as RehypeSanitizeOptions } from "rehype-sanitize";
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
import { VFile } from "vfile";

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
  const processor = unified();
  processor.use(remarkParse);
  processor.use(remarkGfm);
  processor.use(remarkMath);
  processor.use(remarkRehype, { allowDangerousHtml: true });
  processor.use(rehypePrettyCode, prettyCodeOptions);
  processor.use(rehypeKatex);
  processor.use(rehypeSanitize, {
    allowDoctypes: true,
    ...(defaultSchema.tagNames
      ? {
          tagNames: [...defaultSchema.tagNames, ...commonMathMLTags]
        }
      : { tagNames: [...commonMathMLTags] }),
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
