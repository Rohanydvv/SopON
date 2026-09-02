import * as crypto from 'crypto';

const EMBEDDING_DIMENSION = 1536;

const STOP_WORDS = new Set([
  'a',
  'about',
  'above',
  'after',
  'again',
  'against',
  'all',
  'am',
  'an',
  'and',
  'any',
  'are',
  'aren',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'but',
  'by',
  'can',
  'cannot',
  'could',
  'did',
  'do',
  'does',
  'doing',
  'down',
  'during',
  'each',
  'few',
  'for',
  'from',
  'further',
  'had',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'herself',
  'him',
  'himself',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'isn',
  'it',
  'its',
  'itself',
  'just',
  'me',
  'more',
  'most',
  'my',
  'myself',
  'no',
  'nor',
  'not',
  'now',
  'of',
  'off',
  'on',
  'once',
  'only',
  'or',
  'other',
  'our',
  'ours',
  'ourselves',
  'out',
  'over',
  'own',
  'same',
  'she',
  'should',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'very',
  'was',
  'wasn',
  'we',
  'were',
  'weren',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'with',
  'work',
  'works',
  'worked',
  'would',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves',
]);

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
 * Normalizes a word to its semantic stem / lemma.
 */
function stemWord(word: string): string {
  let w = word.toLowerCase();
  if (w.length <= 3) return w;

  // Specific high-frequency technical domain stems
  if (w.startsWith('multiplex')) return 'multiplex';
  if (w.startsWith('pool')) return 'pool';
  if (w.startsWith('connect')) return 'connect';
  if (w.startsWith('exhaust')) return 'exhaust';
  if (w.startsWith('remediat')) return 'remedi';
  if (w.startsWith('restart')) return 'restart';
  if (w.startsWith('deploy')) return 'deploy';
  if (w.startsWith('config')) return 'config';
  if (w.startsWith('authenticat')) return 'auth';
  if (w.startsWith('authoriz')) return 'auth';
  if (w.startsWith('permiss')) return 'permiss';
  if (w.startsWith('incident')) return 'incid';
  if (w.startsWith('document')) return 'document';
  if (w.startsWith('postmortem')) return 'postmortem';
  if (w.startsWith('database')) return 'db';
  if (w.startsWith('quer')) return 'query';

  // Suffix rules
  if (w.endsWith('ing') && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith('tion') && w.length > 6) w = w.slice(0, -4);
  else if (w.endsWith('tions') && w.length > 7) w = w.slice(0, -5);
  else if (w.endsWith('ment') && w.length > 6) w = w.slice(0, -4);
  else if (w.endsWith('able') && w.length > 6) w = w.slice(0, -4);
  else if (w.endsWith('ies') && w.length > 5) w = w.slice(0, -3) + 'y';
  else if (w.endsWith('es') && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) w = w.slice(0, -1);
  else if (w.endsWith('ed') && w.length > 4) w = w.slice(0, -2);

  return w;
}

/**
 * Deterministic semantic vector generator (1536-dim)
 * Maps token n-grams, technical stems, and subwords into a dense unit vector.
 */
export function generateLocalSemanticVector(text: string): number[] {
  const vector = new Float64Array(EMBEDDING_DIMENSION);
  const rawWords = text
    .toLowerCase()
    .replace(/[^a-z0-9_\-\.\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (rawWords.length === 0) {
    vector[0] = 1.0;
    return Array.from(vector);
  }

  const meaningfulWords: string[] = [];
  const stems: string[] = [];

  for (const raw of rawWords) {
    const clean = raw.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
    if (clean.length < 2) continue;

    if (!STOP_WORDS.has(clean)) {
      meaningfulWords.push(clean);
      stems.push(stemWord(clean));
    }
  }

  // Fallback to raw words if everything was filtered
  const wordList = meaningfulWords.length > 0 ? meaningfulWords : rawWords.filter((w) => w.length > 1);
  const stemList = stems.length > 0 ? stems : wordList.map(stemWord);

  // 1. Unigram & Stem Hashing
  for (let i = 0; i < wordList.length; i++) {
    const word = wordList[i];
    const stem = stemList[i];
    if (!word || !stem) continue;

    const wordHash = crypto.createHash('sha256').update(word).digest();
    for (let j = 0; j < 16; j++) {
      const idx = wordHash.readUInt16BE(j * 2) % EMBEDDING_DIMENSION;
      const current = vector[idx] ?? 0;
      vector[idx] = current + 3.0;
    }

    const stemHash = crypto.createHash('sha256').update(stem).digest();
    for (let j = 0; j < 16; j++) {
      const idx = stemHash.readUInt16BE(j * 2) % EMBEDDING_DIMENSION;
      const current = vector[idx] ?? 0;
      vector[idx] = current + 3.5;
    }

    // Subword char 3-grams for technical tokens
    if (word.length >= 4) {
      for (let s = 0; s <= word.length - 3; s++) {
        const trigram = word.slice(s, s + 3);
        const triHash = crypto.createHash('sha256').update(trigram).digest();
        const idx = triHash.readUInt16BE(0) % EMBEDDING_DIMENSION;
        const current = vector[idx] ?? 0;
        vector[idx] = current + 0.8;
      }
    }
  }

  // 2. Bi-Gram & Stem Bi-Gram Hashing (Strong contextual collocation)
  for (let i = 0; i < wordList.length - 1; i++) {
    const w1 = wordList[i];
    const w2 = wordList[i + 1];
    const s1 = stemList[i];
    const s2 = stemList[i + 1];

    if (w1 && w2) {
      const bigram = `${w1}_${w2}`;
      const biHash = crypto.createHash('sha256').update(bigram).digest();
      for (let j = 0; j < 16; j++) {
        const idx = biHash.readUInt16BE(j * 2) % EMBEDDING_DIMENSION;
        const current = vector[idx] ?? 0;
        vector[idx] = current + 4.5;
      }
    }

    if (s1 && s2) {
      const stemBi = `${s1}_${s2}`;
      const sbiHash = crypto.createHash('sha256').update(stemBi).digest();
      for (let j = 0; j < 16; j++) {
        const idx = sbiHash.readUInt16BE(j * 2) % EMBEDDING_DIMENSION;
        const current = vector[idx] ?? 0;
        vector[idx] = current + 5.0;
      }
    }
  }

  // 3. Tri-Gram Hashing
  for (let i = 0; i < wordList.length - 2; i++) {
    const w1 = wordList[i];
    const w2 = wordList[i + 1];
    const w3 = wordList[i + 2];
    if (w1 && w2 && w3) {
      const trigram = `${w1}_${w2}_${w3}`;
      const triHash = crypto.createHash('sha256').update(trigram).digest();
      for (let j = 0; j < 16; j++) {
        const idx = triHash.readUInt16BE(j * 2) % EMBEDDING_DIMENSION;
        const current = vector[idx] ?? 0;
        vector[idx] = current + 4.0;
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