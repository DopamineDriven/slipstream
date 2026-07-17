import "./force-color.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MarkdownAnsiService } from "@/markdown-ansi.ts";
import pc from "picocolors";

const md = new MarkdownAnsiService();

describe("styleInline — spans within one complete line", () => {
  it("bold, italic, strikethrough (self-consistent against picocolors)", () => {
    assert.equal(md.styleInline("**bold**"), pc.bold("bold"));
    assert.equal(md.styleInline("__bold__"), pc.bold("bold"));
    assert.equal(md.styleInline("*em*"), pc.italic("em"));
    assert.equal(md.styleInline("_em_"), pc.italic("em"));
    assert.equal(md.styleInline("~~gone~~"), pc.strikethrough("gone"));
    assert.equal(
      md.styleInline("mix **b** and *i* here"),
      `mix ${pc.bold("b")} and ${pc.italic("i")} here`
    );
  });

  it("snake_case identifiers never italicize", () => {
    assert.equal(md.styleInline("use parsed_cookies here"), "use parsed_cookies here");
    assert.equal(md.styleInline("a file_name_with_many_parts"), "a file_name_with_many_parts");
  });

  it("inline code is cyan and its contents are protected from every transform", () => {
    assert.equal(md.styleInline("`code`"), pc.cyan("code"));
    assert.equal(
      md.styleInline("run `pnpm **not bold**` now"),
      `run ${pc.cyan("pnpm **not bold**")} now`
    );
  });

  it("links become OSC 8 hyperlinks with styled labels", () => {
    const out = md.styleInline("[docs](https://example.com)");
    assert.ok(out.includes("\x1b]8;;https://example.com\x1b\\"));
    assert.ok(out.includes(pc.cyan(pc.underline("docs"))));
  });

  it("images render as dim tagged hyperlinks", () => {
    const out = md.styleInline("![logo](https://x.co/l.svg)");
    assert.ok(out.includes("\x1b]8;;https://x.co/l.svg\x1b\\"));
    assert.ok(out.includes("[img: logo]"));
  });

  it("degradation: unclosed spans emit literally", () => {
    assert.equal(md.styleInline("**unclosed bold"), "**unclosed bold");
    assert.equal(md.styleInline("a lone ` backtick"), "a lone ` backtick");
    assert.equal(md.styleInline("*"), "*");
  });
});

describe("styleLine — block constructs by line prefix", () => {
  it("headings are bold+cyan whole-line", () => {
    assert.equal(md.styleLine("## Title"), pc.bold(pc.cyan("## Title")));
    assert.equal(md.styleLine("# A **raw** span"), pc.bold(pc.cyan("# A **raw** span")));
  });

  it("horizontal rules become a dim rule", () => {
    assert.equal(md.styleLine("---"), pc.dim("─".repeat(24)));
    assert.equal(md.styleLine("***"), pc.dim("─".repeat(24)));
  });

  it("blockquotes get a dim gutter and italic body", () => {
    assert.equal(md.styleLine("> wisdom"), `${pc.dim("│ ")}${pc.italic("wisdom")}`);
  });

  it("list bullets normalize with inline styling preserved", () => {
    assert.equal(md.styleLine("- item **b**"), `${pc.cyan("•")} item ${pc.bold("b")}`);
    assert.equal(md.styleLine("  - nested"), `  ${pc.cyan("•")} nested`);
    assert.equal(md.styleLine("2. second"), `${pc.cyan("2.")} second`);
  });

  it("plain prose flows through the inline styler", () => {
    assert.equal(md.styleLine("just *one* thing"), `just ${pc.italic("one")} thing`);
  });
});

describe("MarkdownStreamState — line buffering across pushes", () => {
  it("holds partial lines and emits styled completed lines", () => {
    const stream = md.createMarkdownStream();
    assert.equal(stream.push("**bo"), "");
    assert.equal(stream.push("ld** done\nnext par"), `${pc.bold("bold")} done\n`);
    assert.equal(stream.flush(), "next par");
    // flushed — nothing remains
    assert.equal(stream.flush(), "");
  });

  it("fence state spans pushes: code lines dim, no inline processing, exit restores", () => {
    const stream = md.createMarkdownStream();
    const opened = stream.push("```ts\nconst a = **1**\n");
    assert.equal(opened, `${pc.dim("```ts")}\n${pc.dim("const a = **1**")}\n`);
    const closed = stream.push("```\nafter **b**\n");
    assert.equal(closed, `${pc.dim("```")}\n` + `after ${pc.bold("b")}\n`);
  });

  it("multiple lines in one push all style", () => {
    const stream = md.createMarkdownStream();
    const out = stream.push("# H\n- a\n");
    assert.equal(out, `${pc.bold(pc.cyan("# H"))}\n${pc.cyan("•")} a\n`);
  });
});

describe("styleMarkdown — complete text (resume/expand path)", () => {
  it("styles a whole document with fence protection", () => {
    const doc = "# Title\nbody **b**\n```\nx = **raw**\n```\ntail";
    const out = md.styleMarkdown(doc);
    assert.ok(out.includes(pc.bold(pc.cyan("# Title"))));
    assert.ok(out.includes(`body ${pc.bold("b")}`));
    assert.ok(out.includes(pc.dim("x = **raw**")));
    assert.ok(out.endsWith("tail\n") || out.endsWith("tail"));
  });
});

describe("off switch — NO_COLOR passthrough", () => {
  it("returns input byte-exact when NO_COLOR is set", () => {
    process.env.NO_COLOR = "1";
    try {
      assert.equal(md.styleLine("# Title"), "# Title");
      assert.equal(md.styleInline("**b**"), "**b**");
      assert.equal(md.styleMarkdown("- item"), "- item");
    } finally {
      delete process.env.NO_COLOR;
    }
  });
});
