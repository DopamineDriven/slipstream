export function detectCodeLanguage(code: string) {
  const tsPatterns = [
    /\b(satisfies|keyof|typeof|as\s+const|instanceof)\b/,
    /\binterface\s+\w+\s*{/,
    /\btype\s+\w+\s*=/,
    /\benum\s+\w+\s*{/,
    /<[A-Z]\w*>/,
    // eslint-disable-next-line no-useless-escape
    /:\s*(string|number|boolean|void|never|any|unknown)(\[\])?[\s;,\)]/
  ];

  if (tsPatterns.some(pattern => pattern.test(code))) {
    return "typescript";
  }

  // prettier-ignore
  // eslint-disable-next-line no-useless-escape
  const es6ImportPattern = /import(?:(?:(?:[ \n\t]+([^ *\n\t\{\},]+)[ \n\t]*(?:,|[ \n\t]+))?([ \n\t]*\{(?:[ \n\t]*[^ \n\t"'\{\}]+[ \n\t]*,?)+\})?[ \n\t]*)|[ \n\t]*\*[ \n\t]*as[ \n\t]+([^ \n\t\{\}]+)[ \n\t]+)from[ \n\t]*(?:['"])([^'"\n]+)(['"])/;


  const otherTsPatterns = [
    es6ImportPattern,
    /\bexport\s+(default\s+)?(const|let|var|function|class|interface|type)\b/,
    /\b(async\s+)?function\s*\w*\s*\([^)]*\)\s*{/,
    /\bconst\s+\w+\s*=\s*(async\s*)?\([^)]*\)\s*=>/,
    /\b(useState|useEffect|useCallback|useMemo)\s*\(/ // React hooks
  ];

  if (otherTsPatterns.some(pattern => pattern.test(code))) {
    return "typescript";
  }
  // Shell commands
  if (
    /^[$#]\s/.test(code.trim()) ||
    /^(npm|yarn|pnpm|pdm|bun|npx|tsc|tsx|grep|git|cd|mkdir|echo|source|jq|curl|sudo|wget|bash|rm)\s/.test(
      code.trim()
    )
  ) {
    return "shell";
  }

  // Python
  const pythonPatterns = [
    /^from\s+[\w.]+\s+import\s+/m,
    /^import\s+[\w.]+$/m,
    /^def\s+\w+\s*\(/m,
    /^class\s+\w+(\([\w.]+\))?:/m,
    /^\s*if\s+__name__\s*==\s*['"]__main__['"]/m
  ];

  if (pythonPatterns.some(pattern => pattern.test(code))) {
    return "python";
  }

  // JSON
  // eslint-disable-next-line no-useless-escape
  if (/^[{\[]/.test(code.trim()) && /[}\]]$/.test(code.trim())) {
    try {
      JSON.parse(code);
      return "json";
    } catch (err) {
      console.log("json block err", err);
    }
  }

  const trimmed = code.trim(); // JSON
  // eslint-disable-next-line no-useless-escape
  if (/^[{\[].*[}\]]$/s.test(trimmed)) {
    try {
      JSON.parse(code);
      return "json";
    } catch (err) {
      console.log("json block err", err);
    }
  }

  return "text";
}
export function preprocessAIMarkdown(content: string) {
  return (
    content
      // Fix headings without proper spacing
      .replace(/([^\n])(#{1,6}\s+)/g, "$1\n\n$2")
      .replace(/(#{1,6}\s+[^\n]+)([^\n])/g, "$1\n$2")

      // Fix display math blocks
      .replace(/([^\n])\\\[/g, "$1\n\n\\[")
      .replace(/\\\]([^\n])/g, "\\]\n\n$1")

      // Fix inline math spacing (optional but helps)
      .replace(/([^\s])\\\(/g, "$1 \\(")
      .replace(/\\\)([^\s])/g, "\\) $1")

      // Fix lists that might be too close to other content
      .replace(/([^\n])\n(\s*[-*+]\s+)/g, "$1\n\n$2")
      .replace(/([^\n])\n(\s*\d+\.\s+)/g, "$1\n\n$2")

      // Fix code blocks
      .replace(/([^\n])```/g, "$1\n\n```")
      .replace(/```([^\n])/g, "```\n\n$1")

      // Clean up any triple+ newlines we created
      .replace(/\n{3,}/g, "\n\n")
  );
}

/**
 * Splits the markdown content into logical blocks.
 * This is a key part of the memoization strategy. We split by code blocks
 * and double newlines to create chunks that can be independently rendered.
 * @param markdown - The full markdown string.
 * @returns An array of markdown strings, each representing a block.
 */
export function splitIntoBlocks(markdown: string): string[] {
  // First, convert literal \n to actual newlines
  const withNewlines = markdown.replace(/\\n/g, "\n")

  // The regex splits the string by code blocks (\`\`\`...\`\`\`) or by double newlines.
  // The `s` flag allows `.` to match newlines, which is crucial for code blocks.
  // The capturing group `(\`\`\`[\s\S]*?\`\`\`)` ensures that the code blocks themselves
  // are included in the result array.
  const blocks = withNewlines.split(/(```[\s\S]*?```|\n{2,})/s)

  // The split can result in empty or undefined entries, so we filter them out.
  // We also trim each block to remove leading/trailing whitespace.
  return blocks.filter((block) => block && block.trim() !== "").map((block) => block.trim())
}

// TEMP

/**
 * Preprocesses LaTeX content within a markdown string to correct
 * common issues from AI model outputs.
 * @param content - The markdown string.
 * @returns A string with corrected LaTeX.
 */
export function preprocessTex(content: string): string {
  return (
    content
      // Normalize excessive backslashes from various AI models to a standard double backslash.
      .replace(/\\\\+/g, "\\\\")
      // Some models might escape single backslashes, turning \\ into \\\\. This reverts it.
      .replace(/(\s)\\\\/g, "$1\\\\")
  )
}

/**
 * Normalizes a markdown string by attempting to fix common formatting
 * issues, like missing newlines before headings or list items.
 * This makes the parser more resilient to malformed input.
 * @param markdown - The raw markdown string.
 * @returns A normalized markdown string.
 */
export function normalizeMarkdown(markdown: string): string {
  return (
    markdown
      // Convert literal \n to actual newlines first
      .replace(/\\n/g, "\n")
      // Add a newline before headings that are not at the start of the string.
      .replace(/(\S)(#{1,6} )/g, "$1\n\n$2")
      // Add a newline before list items that are not at the start of a line.
      .replace(/(\S)(\n?[-*] )/g, "$1\n$2")
      // Add a newline before numbered list items that are not at the start of a line.
      .replace(/(\S)(\n?\d+\. )/g, "$1\n$2")
      // Handle LaTeX delimiters more carefully - only convert if they're clearly block math
      .replace(/\\\[\s*\n/g, "\n$$\n")
      .replace(/\n\s*\\\]/g, "\n$$\n")
      // Convert inline math delimiters
      .replace(/\\\(/g, "$")
      .replace(/\\\)/g, "$")
  )
}
