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
import { imgSrcMapper } from "./img-helper";
import { cn } from "./utils";

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
    const createElementHeadingStyles = {
      id: slug,
      className:
        "[h1]:text-4xl [h2]:text-3xl [h3]:text-2xl [h4]:text-2xl [h5]:text-xl [h6]:text-lg wrap-break-word whitespace-normal",
      ...rest
    };
    return createElement(target, createElementHeadingStyles, [
      createElement(
        "a",
        {
          href: `#${slug}`,
          key: `link-${slug}`,
          className: "anchor hover:text-current/95 ease-in-out wrap-break-word "
        },
        [children]
      )
    ]);
  };
  Heading.displayName = `Heading${level}`;

  return Heading;
}

function CustomLink({ href, children, ...props }: ComponentPropsWithRef<"a">) {
  if (href?.startsWith("/")) {
    return (
      <Link
        href={href}
        className={cn(
          props.className,
          "overflow-x-hidden wrap-break-word whitespace-normal"
        )}
        {...props}>
        {children}
      </Link>
    );
  }

  if (href?.startsWith("#")) {
    return (
      <Link
        href={href}
        className={cn(
          props.className,
          "overflow-x-hidden wrap-break-word whitespace-normal"
        )}
        {...props}>
        {children}
      </Link>
    );
  }

  return (
    <a
      href={href}
      className={cn(
        props.className,
        "overflow-x-hidden wrap-break-word whitespace-normal"
      )}
      target="_blank"
      rel="noopener noreferrer"
      {...props}>
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
      src={
        src ||
        "https://raw.githubusercontent.com/DopamineDriven/slipstream/refs/heads/main/turborepo/apps/web/public/aic-logo.svg"
      }
      alt={alt}
      width={width}
      unoptimized={
        typeof src === "string"
          ? imgSrcMapper.includes(src)
            ? false
            : true
          : false
      }
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
  code: ({ children, className, ...props }: ComponentPropsWithRef<"code">) => {
    return (
      <code
        className={cn(
          "inline wrap-anywhere! break-all! whitespace-pre-wrap!",
          "font-mono text-sm",
          "rounded-md px-1 py-0.5",
          "box-decoration-clone",
          "text-foreground/85",
          "max-w-none min-w-0 overflow-visible border-none",
          className
        )}
        {...props}>
        {children}
      </code>
    );
  },
  h1: createHeading(1),
  h2: createHeading(2),
  h3: createHeading(3),
  h4: createHeading(4),
  h5: createHeading(5),
  h6: createHeading(6),
  img: CustomImage,
  p: ({ className, children, ...props }: ComponentPropsWithRef<"p">) => (
    <p className={cn("mb-1.5 leading-7", className)} {...props}>
      {children}
    </p>
  ),
  li: ({ className, children, ...props }: ComponentPropsWithRef<"li">) => (
    <li
      className={cn(
        "leading-7 whitespace-normal! [&>p]:mb-1 [&>p:last-child]:mb-0",
        className
      )}
      {...props}>
      {children}
    </li>
  ),
  ol: ({ className, children, ...props }: ComponentPropsWithRef<"ol">) => (
    <ol
      className={cn(
        "mb-2 ml-6 list-decimal space-y-0.5 [&_ol]:mt-1 [&_ol]:mb-0 [&_ul]:mt-1 [&_ul]:mb-0 [&>li]:pl-2.5",
        className
      )}
      {...props}>
      {children}
    </ol>
  ),
  ul: ({ className, children, ...props }: ComponentPropsWithRef<"ul">) => (
    <ul
      className={cn(
        "mb-2 ml-6 list-disc space-y-0.5 [&_ol]:mt-1 [&_ol]:mb-0 [&_ul]:mt-1 [&_ul]:mb-0 [&>li]:pl-2.5",
        className
      )}
      {...props}>
      {children}
    </ul>
  ),
  div: ({ className, children, ...props }: ComponentPropsWithRef<"div">) => (
    <div className={cn(className)} {...props}>
      {children}
    </div>
  ),
  span: ({ children, className, ...props }: ComponentPropsWithRef<"span">) => (
    <span className={cn(className)} {...props}>
      {children}
    </span>
  ),
  blockquote: ({
    children,
    className,
    ...props
  }: ComponentPropsWithRef<"blockquote">) => (
    <blockquote
      className={cn("mb-2 border-l-4 pl-4 italic", className)}
      {...props}>
      {children}
    </blockquote>
  ),
  cite: ({ className, children, ...props }: ComponentPropsWithRef<"cite">) => (
    <cite className={cn(className)} {...props}>
      {children}
    </cite>
  ),
  hr: ({ className, ...props }: ComponentPropsWithRef<"hr">) => (
    <hr className={cn(className)} {...props} />
  ),
  br: ({ className, ...props }: ComponentPropsWithRef<"br">) => (
    <br className={cn(className)} {...props} />
  ),
  caption: ({
    className,
    children,
    ...props
  }: ComponentPropsWithRef<"caption">) => (
    <caption className={cn(className)} {...props}>
      {children}
    </caption>
  ),
  em: ({ className, children, ...props }: ComponentPropsWithRef<"em">) => (
    <em className={cn(className)} {...props}>
      {children}
    </em>
  ),
  strong: ({
    className,
    children,
    ...props
  }: ComponentPropsWithRef<"strong">) => (
    <strong className={cn("font-bold", className)} {...props}>
      {children}
    </strong>
  ),
  b: ({ className, children, ...props }: ComponentPropsWithRef<"b">) => (
    <b className={cn("font-bold", className)} {...props}>
      {children}
    </b>
  ),
  aside: ({
    className,
    children,
    ...props
  }: ComponentPropsWithRef<"aside">) => (
    <aside className={cn(className)} {...props}>
      {children}
    </aside>
  ),
  table: ({
    children,
    className,
    ...props
  }: ComponentPropsWithRef<"table">) => (
    <div
      className="-mx-3 my-3 overflow-x-auto overscroll-x-contain px-3 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] md:mx-0 [&::-webkit-scrollbar]:hidden"
      role="region"
      aria-label="Scrollable table">
      <table
        className={cn(
          "mb-4 w-full min-w-[80dvw] table-auto border-collapse",
          "border text-sm",
          className
        )}
        {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({
    children,
    className,
    ...props
  }: ComponentPropsWithRef<"thead">) => (
    <thead
      className={cn(
        "px-2.5 py-2 text-left align-top text-sm",
        "wrap-break-words whitespace-normal",
        className
      )}
      {...props}>
      {children}
    </thead>
  ),
  tbody: ({
    className,
    children,
    ...props
  }: ComponentPropsWithRef<"tbody">) => (
    <tbody className={cn(className)} {...props}>
      {children}
    </tbody>
  ),
  tspan: ({
    className,
    children,
    ...props
  }: ComponentPropsWithRef<"tspan">) => (
    <tspan className={cn(className)} {...props}>
      {children}
    </tspan>
  ),
  tfoot: ({
    className,
    children,
    ...props
  }: ComponentPropsWithRef<"tfoot">) => (
    <tfoot className={cn(className)} {...props}>
      {children}
    </tfoot>
  ),
  tr: ({ className, children, ...props }: ComponentPropsWithRef<"tr">) => (
    <tr className={cn("border-b", className)} {...props}>
      {children}
    </tr>
  ),
  td: ({ children, className, ...props }: ComponentPropsWithRef<"td">) => (
    <td
      className={cn(
        "px-3 py-1.5 align-top text-xs",
        "wrap-break-word hyphens-auto whitespace-normal",
        "[&_a]:wrap-break-word [&_code]:wrap-break-word [&_li]:wrap-break-word",
        className
      )}
      {...props}>
      {children}
    </td>
  ),
  th: ({ children, className, ...props }: ComponentPropsWithRef<"th">) => (
    <th
      className={cn(
        "border px-2.5 py-2 text-left align-top text-xs font-semibold",
        "wrap-break-word whitespace-normal",
        className
      )}
      {...props}>
      {children}
    </th>
  )
};

// export function preprocessMathDelimiters(content: string) {
//   const inlineMath = /\\\((.*?)\\\)/gs; // matches \( … \)
//   const displayMath = /\\\[(.*?)\\\]/gs; // matches \[ … \]
//   const result = content
//     .replace(displayMath, (_match, expr: string) => {
//       return `\n$$\n${expr}\n$$\n`;
//     })
//     .replace(inlineMath, (_match, expr: string) => {
//       return `$$${expr}$$`;
//     });
//   return result;
// }
export function preprocessMathDelimiters(content: string) {
  const currencyEscaped = content.replace(/\$(\d[\d,]*(?:\.\d+)?)/g, "\\$$$1");

  const inlineMath = /\\\((.*?)\\\)/gs; // matches $$ … $$
  const displayMath = /\\\[(.*?)\\\]/gs; // matches \[ … \]
  const result = currencyEscaped
    .replace(displayMath, (_match, expr: string) => {
      return `\n$$\n${expr}\n$$\n`;
    })
    .replace(inlineMath, (_match, expr: string) => {
      return `$$${expr}$$`;
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
  processor.use(remarkMath, Object.freeze({ singleDollarTextMath: true }));
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
