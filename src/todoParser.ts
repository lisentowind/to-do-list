export interface TodoItem {
  filePath: string;
  line: number;
  column: number;
  keyword: string;
  text: string;
  rawLine: string;
}

const DEFAULT_KEYWORDS = ['TODO', 'FIXME', 'HACK', 'XXX'];
const MAX_TEXT_LENGTH = 120;

export function parseTodosFromText(
  text: string,
  filePath: string,
  keywords: string[] = DEFAULT_KEYWORDS
): TodoItem[] {
  const normalizedKeywords = keywords
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  if (normalizedKeywords.length === 0) {
    return [];
  }

  const keywordPattern = normalizedKeywords.map(escapeRegExp).join('|');
  const markerPattern = new RegExp(`\\b(${keywordPattern})\\b\\s*[:：\\-]?\\s*(.*)$`, 'i');

  return text
    .split(/\r?\n/)
    .flatMap((rawLine, index) => {
      const match = rawLine.match(markerPattern);

      if (!match || match.index === undefined) {
        return [];
      }

      return [
        {
          filePath,
          line: index + 1,
          column: match.index + 1,
          keyword: match[1].toUpperCase(),
          text: limitText(match[2].trim()),
          rawLine: rawLine.trim()
        }
      ];
    });
}

function limitText(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_TEXT_LENGTH - 3)}...`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
