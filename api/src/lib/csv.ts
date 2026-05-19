import { parse } from "csv-parse/sync";

export function parseCsv<T extends Record<string, string>>(content: string): T[] {
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as T[];
}
