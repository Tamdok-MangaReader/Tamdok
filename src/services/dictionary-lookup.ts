export type DictionaryEntry = {
  word: string;
  phonetic?: string;
  meanings: Array<{
    partOfSpeech?: string;
    definitions: Array<{ definition: string; example?: string }>;
  }>;
};

export async function lookupWord(word: string): Promise<DictionaryEntry | null> {
  const normalized = word.trim().toLowerCase().replace(/[^a-z'-]/gi, '');
  if (!normalized) return null;

  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normalized)}`);
    if (!response.ok) return null;
    const payload = (await response.json()) as Array<{
      word: string;
      phonetic?: string;
      meanings?: Array<{
        partOfSpeech?: string;
        definitions?: Array<{ definition?: string; example?: string }>;
      }>;
    }>;
    const first = payload[0];
    if (!first) return null;
    return {
      word: first.word,
      phonetic: first.phonetic,
      meanings:
        first.meanings?.map((meaning) => ({
          partOfSpeech: meaning.partOfSpeech,
          definitions:
            meaning.definitions
              ?.map((item) => ({
                definition: item.definition ?? '',
                example: item.example,
              }))
              .filter((item) => item.definition) ?? [],
        })) ?? [],
    };
  } catch {
    return null;
  }
}

export function pickWordNearTap(text: string, tapX: number, tapY: number, width: number, height: number): string | null {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const column = Math.min(words.length - 1, Math.max(0, Math.floor((tapX / Math.max(width, 1)) * words.length)));
  return words[column] ?? null;
}
