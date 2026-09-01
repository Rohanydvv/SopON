/**
 * Calculates cosine similarity between two unit vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const valA = a[i] ?? 0;
    const valB = b[i] ?? 0;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

/**
 * Formats a JavaScript number array into pgvector literal format: '[0.12, 0.45, ...]'
 */
export function formatVectorForPg(vector: number[]): string {
  return `[${vector.map((v) => Number(v.toFixed(6))).join(',')}]`;
}