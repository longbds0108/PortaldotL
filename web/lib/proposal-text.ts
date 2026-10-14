export async function extractProposalText(name: string, type: string, bytes: Uint8Array): Promise<string> {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "pdf" || type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
    }
    return pages.join("\n").trim();
  }
  if (extension === "docx" || type.includes("wordprocessingml.document")) {
    const imported = await import("mammoth/mammoth.browser.js");
    const mammoth = imported.default ?? imported;
    const copy = bytes.slice().buffer as ArrayBuffer;
    return (await mammoth.extractRawText({ arrayBuffer: copy })).value.trim();
  }
  if (["txt", "md", "csv", "json"].includes(extension) || type.startsWith("text/")) {
    return new TextDecoder().decode(bytes).trim();
  }
  throw new Error(`Unsupported proposal format: ${extension || type || "unknown"}. Use PDF, DOCX, TXT, Markdown, CSV, or JSON.`);
}
