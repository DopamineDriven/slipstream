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
      // .replace(/```\n([\s\S]*?)```/g, (match, code: string) => {
      //   const lang = detectCodeLanguage(code);
      //   return lang !== "text" ? `\`\`\`${lang}\n${code}\`\`\`` : match;
      // })
  );
}
