import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./chat-markdown";

describe("chat markdown", () => {
  it("parses bold, italic, code and links inline", () => {
    expect(parseInline("A **sealed** bid, *not* `revealed`, see [docs](https://plinths.app/docs).")).toEqual([
      { kind: "text", text: "A " },
      { kind: "strong", text: "sealed" },
      { kind: "text", text: " bid, " },
      { kind: "em", text: "not" },
      { kind: "text", text: " " },
      { kind: "code", text: "revealed" },
      { kind: "text", text: ", see " },
      { kind: "link", text: "docs", href: "https://plinths.app/docs" },
      { kind: "text", text: "." },
    ]);
  });

  it("keeps non-http links and stray asterisks as plain text", () => {
    expect(parseInline("[x](javascript:alert(1)) and 2 * 3 * 4")).toEqual([
      { kind: "text", text: "[x](javascript:alert(1)) and 2 * 3 * 4" },
    ]);
  });

  it("splits paragraphs, headings, lists and code fences", () => {
    const blocks = parseMarkdown("### Bonds\nIf you miss the reveal:\nthe bid is excluded.\n\n- **Bond** goes to the treasury\n- Never to the buyer\n\n1. Reveal\n2. Withdraw\n\n```\nforge test\n```");
    expect(blocks.map((b) => b.kind)).toEqual(["h", "p", "ul", "ol", "pre"]);
    expect(blocks[1]).toEqual({
      kind: "p",
      lines: [[{ kind: "text", text: "If you miss the reveal:" }], [{ kind: "text", text: "the bid is excluded." }]],
    });
    expect(blocks[2]).toMatchObject({ kind: "ul", items: [[{ kind: "strong", text: "Bond" }, { kind: "text", text: " goes to the treasury" }], [{ kind: "text", text: "Never to the buyer" }]] });
    expect(blocks[4]).toEqual({ kind: "pre", text: "forge test" });
  });
});
