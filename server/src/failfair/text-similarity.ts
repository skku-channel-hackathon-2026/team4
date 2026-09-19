/** Local lexical retrieval: binary TF-IDF over words and Korean character n-grams.
 * No model call, training data, or outcome text is involved. Scores are not probabilities.
 */
export function tokenize(text: string): string[] {
  return (
    text
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}
function features(text: string): Set<string> {
  const result = new Set<string>();
  for (const token of tokenize(text)) {
    if (token.length < 2 || /^\d+$/.test(token)) continue;
    result.add(`w:${token}`);
    // Keep numeric expressions whole: 13일 must not produce a 3일 feature.
    if (/\d/.test(token)) continue;
    for (const size of [2, 3]) {
      for (let i = 0; i <= token.length - size; i++)
        result.add(`c:${token.slice(i, i + size)}`);
    }
  }
  return result;
}
export function createTextSimilarity(documents: string[]) {
  const frequency = new Map<string, number>();
  for (const document of documents) {
    for (const feature of features(document))
      frequency.set(feature, (frequency.get(feature) ?? 0) + 1);
  }
  const cache = new Map<string, Map<string, number>>();
  const vector = (text: string) => {
    const existing = cache.get(text);
    if (existing) return existing;
    const values = new Map(
      [...features(text)].map(
        (feature) =>
          [
            feature,
            1 +
              Math.log(
                1 + documents.length / (1 + (frequency.get(feature) ?? 0)),
              ),
          ] as const,
      ),
    );
    cache.set(text, values);
    return values;
  };
  return (a: string, b: string): number => {
    const av = vector(a),
      bv = vector(b);
    let dot = 0,
      an = 0,
      bn = 0;
    for (const [feature, value] of av) {
      an += value * value;
      dot += value * (bv.get(feature) ?? 0);
    }
    for (const value of bv.values()) bn += value * value;
    return an && bn ? Math.min(1, dot / Math.sqrt(an * bn)) : 0;
  };
}
