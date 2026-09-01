import * as crypto from 'crypto';

const EMBEDDING_DIMENSION = 1536;

export async function generateEmbedding(text: string): Promise<number[]> {
  const [embedding] = await generateEmbeddings([text]);
  return embedding ?? generateLocalSemanticVector(text);
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (openaiKey && openaiKey !== 'mock') {
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: texts,
        }),
      });

      if (res.ok) {
        const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
        return json.data.map((d) => d.embedding);
      }
    } catch {
      // Fallback to local semantic vector generator
    }
  }

  return texts.map((t) => generateLocalSemanticVector(t));
}

/**
 * Deterministic semantic vector generator (1536-dim)
 * Maps token n-grams and vocabulary clusters into a unit vector.
 */
export function generateLocalSemanticVector(text: string): number[] {
  const vector = new Float64Array(EMBEDDING_DIMENSION);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = normalized.split(/\s+/).filter((w) => w.length > 1);

  if (words.length === 0) {
    vector[0] = 1.0;
    return Array.from(vector);
  }

  // Token hashing across dimensions
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word) continue;
    const hash = crypto.createHash('sha256').update(word).digest();
    
    for (let j = 0; j < 12; j++) {
      const idx = hash.readUInt16BE(j * 2) % EMBEDDING_DIMENSION;
      const current = vector[idx] ?? 0;
      vector[idx] = current + 2.0;
    }

    // Stem prefix hashing (e.g. "remediation", "restart", "connect")
    if (word.length >= 4) {
      const stem = word.slice(0, 4);
      const stemHash = crypto.createHash('md5').update(stem).digest();
      for (let j = 0; j < 4; j++) {
        const idx = stemHash.readUInt16BE(j * 2) % EMBEDDING_DIMENSION;
        const current = vector[idx] ?? 0;
        vector[idx] = current + 1.0;
      }
    }

    // Bi-gram hashing
    if (i > 0) {
      const prevWord = words[i - 1];
      if (prevWord) {
        const bigram = `${prevWord}_${word}`;
        const biHash = crypto.createHash('md5').update(bigram).digest();
        for (let j = 0; j < 6; j++) {
          const idx = biHash.readUInt16BE(j * 2) % EMBEDDING_DIMENSION;
          const current = vector[idx] ?? 0;
          vector[idx] = current + 2.5;
        }
      }
    }
  }

  // Normalize vector to unit length (L2 norm)
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    const val = vector[i] ?? 0;
    norm += val * val;
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
      const val = vector[i] ?? 0;
      vector[i] = val / norm;
    }
  }

  return Array.from(vector);
}