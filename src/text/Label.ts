// Canvas substitute for lib/label.c layout; plain text, explicit newlines and width wrapping.
export function wrapText(
  text: string,
  width: number,
  measure: (value: string) => number,
) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const char of paragraph) {
      if (line && measure(line + char) > width) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
    lines.push(line);
  }
  return lines;
}
