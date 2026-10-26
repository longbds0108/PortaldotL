/**
 * Minimal Markdown for Agent replies: paragraphs, headings, lists, code, bold, italic and http(s) links.
 * Parses to plain data that the chat renders as React elements, so model output never becomes raw HTML.
 */
export type Inline =
  | { kind: "text" | "strong" | "em" | "code"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "p"; lines: Inline[][] }
  | { kind: "h"; inlines: Inline[] }
  | { kind: "ul" | "ol"; items: Inline[][] }
  | { kind: "pre"; text: string };

const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\*([^*\s](?:[^*]*[^*\s])?)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: "code", text: m[1] });
    else if (m[2] !== undefined || m[3] !== undefined) out.push({ kind: "strong", text: m[2] ?? m[3] });
    else if (m[4] !== undefined) out.push({ kind: "em", text: m[4] });
    else out.push({ kind: "link", text: m[5], href: m[6] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

const HEADING = /^#{1,6}\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
    } else if (line.trimStart().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) code.push(lines[i++]);
      i++; // closing fence (or end of input)
      blocks.push({ kind: "pre", text: code.join("\n") });
    } else if (HEADING.test(line)) {
      blocks.push({ kind: "h", inlines: parseInline(line.match(HEADING)![1]) });
      i++;
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const pattern = BULLET.test(line) ? BULLET : NUMBERED;
      const items: Inline[][] = [];
      while (i < lines.length && pattern.test(lines[i])) items.push(parseInline(lines[i++].match(pattern)![1]));
      blocks.push({ kind: pattern === BULLET ? "ul" : "ol", items });
    } else {
      const para: Inline[][] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !lines[i].trimStart().startsWith("```") &&
        !HEADING.test(lines[i]) &&
        !BULLET.test(lines[i]) &&
        !NUMBERED.test(lines[i])
      ) {
        para.push(parseInline(lines[i++]));
      }
      blocks.push({ kind: "p", lines: para });
    }
  }
  return blocks;
}
