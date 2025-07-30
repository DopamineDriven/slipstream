/**
 * Simplified markdown utilities based on actual AI outputs
 * No detection needed - provider is passed in!
 */

/**
 * Split markdown into logical blocks for efficient rendering
 */
export function splitIntoBlocks(markdown: string): string[] {
  const normalized = markdown.replace(/\\n/g, "\n");
  const blocks = normalized.split(/(```[\s\S]*?```|\n\n+)/);

  return blocks.filter(block => block.trim() !=="").map(block => block.trim());
}

/**
 * Provider-specific preprocessing based on actual observed patterns
 */
export const providerPreprocessors = {
  openai: (content: string) => {
    // GPT is the aggressive formatter
    return (
      content
        // Fix literal newlines
        .replace(/\\n/g, "\n")
        // Remove excessive bold (50+ chars)
        .replace(/\*\*([^*]{50,}?)\*\*/g, "$1")
        // Fix emphasis headers
        .replace(/^#{3,6}\s+\*\*(.+?)\*\*/gm, "### $1")
        // Headers used for emphasis (Note:, Important:, etc)
        .replace(/^#{3,6}\s+(Note|Important|Warning|Tip):/gim, "$1:")
        // Normalize list markers
        // eslint-disable-next-line no-useless-escape
        .replace(/^[\*\+]\s+/gm, "- ")
        // Remove bold from code
        .replace(/\*\*`([^`]+)`\*\*/g, "`$1`")
        // Fix spacing
        .replace(/([^\n])(\s*)(#{1,6}\s+)/g, "$1\n\n$3")
        .replace(/\n{4,}/g, "\n\n\n")
    );
  },

  anthropic: (content: string) => {
    // Claude has clean output, minimal processing
    return content
      .replace(/\\n/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();
  },

  google: (content: string) => {
    // Gemini has escape issues
    return (
      content
        .replace(/\\n/g, "\n")
        // Unescape common characters
        // eslint-disable-next-line no-useless-escape
        .replace(/\\([.\*_\[\]()#!])/g, "$1")
        // Fix double-space line endings
        .replace(/\s{2}$/gm, "  ")
        // Sometimes uses HTML
        .replace(/<b>(.+?)<\/b>/gi, "**$1**")
        .replace(/<i>(.+?)<\/i>/gi, "*$1*")
        .replace(/<code>(.+?)<\/code>/gi, "`$1`")
    );
  },

  grok: (content: string) => {
    // Based on your example, Grok has pretty clean output!
    return (
      content
        .replace(/\\n/g, "\n")
        // Ensure spacing around separators
        .replace(/\n?---\n?/g, "\n\n---\n\n")
        // Light cleanup
        .replace(/\n{4,}/g, "\n\n\n")
        .trim()
    );
  },

  // Fallback for unknown providers
  default: (content: string) => {
    return content
      .replace(/\\n/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();
  }
};

/**
 * Main preprocessing function
 */
export function preprocessMarkdown(content: string, provider: string): string {
  const preprocessor =
    providerPreprocessors[provider as keyof typeof providerPreprocessors] ||
    providerPreprocessors.default;

  return preprocessor(content);
}

/**
 * Cache key generator for processed blocks
 */
export function generateBlockCacheKey(
  content: string,
  messageId: string
): string {
  // Use content length and hash for cache key
  const hash = content.split("").reduce((acc, char) => {
    return (acc << 5) - acc + char.charCodeAt(0);
  }, 0);

  return `${messageId}-${content.length}-${hash}`;
}

/**
 * Detect code language with improved patterns
 */
export function detectCodeLanguage(code: string): string {
  const trimmed = code.trim();

  // TypeScript/JavaScript
  if (
    /\b(import|export|const|let|var|function|class|interface|type|enum)\b/.test(
      trimmed
    ) ||
    /\b(useState|useEffect|useCallback|useMemo)\b/.test(trimmed) ||
    /=>|async\s+function|\bawait\b/.test(trimmed)
  ) {
    if (/\b(interface|type|enum|namespace|declare)\b/.test(trimmed)) {
      return "typescript";
    }
    return "typescript";
  }

  // Python
  if (
    /^(from|import)\s+\w+/.test(trimmed) ||
    /^def\s+\w+\s*\(/.test(trimmed) ||
    /^class\s+\w+(\([\w.]+\))?:/.test(trimmed)
  ) {
    return "python";
  }

  // Shell/Bash
  if (
    /^[$#]\s/.test(trimmed) ||
    /^(npm|yarn|git|cd|echo|curl)\s/.test(trimmed)
  ) {
    return "bash";
  }

  // JSON
  // eslint-disable-next-line no-useless-escape
  if (/^[{\[].*[}\]]$/s.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch (err) {
      console.error(err);
      // Not valid JSON
    }
  }

  return "text";
}

/**
 * Quick inline markdown for streaming (lightweight)
 */
export function processInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    )
    .replace(/\n/g, "<br>");
}
