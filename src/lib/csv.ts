// src/lib/csv.ts — small, dependency-free CSV reader.
// Handles: quoted cells, commas/line breaks inside quotes, "" escaped quotes, Excel's UTF-8 BOM,
// Windows/Mac/Unix line endings, and semicolon-separated files (Excel in many countries saves
// "CSV" with semicolons instead of commas).

export function parseCsv(input: string): string[][] {
  let text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  // Detect the delimiter from the first line (ignoring anything inside quotes).
  const firstLine = text.split(/\r\n|\n|\r/)[0] ?? '';
  const unquoted = firstLine.replace(/"[^"]*"/g, '');
  const delimiter = (unquoted.match(/;/g)?.length ?? 0) > (unquoted.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // "" -> literal quote
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"' && field === '') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop completely blank lines
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}
