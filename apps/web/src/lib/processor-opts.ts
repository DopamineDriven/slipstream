import type { Options as RehypeKatexOpts } from "rehype-katex";
import type {
  CharsElement,
  LineElement,
  Options as RehypePrettyCodeOpts
} from "rehype-pretty-code";
import type { Components, Options as RehypeReactOpts } from "rehype-react";
import type { Options as RehypeSanitizeOptions } from "rehype-sanitize";
import type { Options as RemarkMathOpts } from "remark-math";
import type { Options as RemarkRehypeOpts } from "remark-rehype";
import { Fragment } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { transformerMetaWordHighlight } from "@shikijs/transformers";
import { defaultSchema } from "rehype-sanitize";
import { mathmlTags } from "@slipstream/ui";

export const sanitizeSchema = {
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

export const rehypeReactOpts = (components: Components) =>
  ({
    jsx: jsxRuntime.jsx,
    jsxs: jsxRuntime.jsxs,
    Fragment,
    components: {
      ...components
    },
    passNode: true
  }) satisfies RehypeReactOpts;

export const rehypeKatexOpts = {
  output: "mathml",
  strict: false,
  trust: true,
  errorColor: "#cc0000"
} satisfies RehypeKatexOpts;

export const remarkMathOpts = {
  singleDollarTextMath: true
} satisfies RemarkMathOpts;

export const remarkRehypeOpts = {
  allowDangerousHtml: true
} satisfies RemarkRehypeOpts;

export const prettyCodeOptions = {
  grid: true,
  keepBackground: true,
  theme: "dark-plus",
  defaultLang: { block: "markdown", inline: "markdown" },
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
} satisfies RehypePrettyCodeOpts;
