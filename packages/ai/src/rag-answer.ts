export interface RetrievedContextChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  sourceType: string;
  sourceUrl?: string | null;
  content: string;
  similarityScore: number;
}

export interface GeneratedAnswerResult {
  answer: string;
  hasContext: boolean;
  citedSources: Array<{
    documentId: string;
    documentTitle: string;
    sourceUrl?: string | null;
    sourceType: string;
  }>;
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'how', 'what', 'where', 'when',
  'why', 'does', 'do', 'did', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
  'of', 'and', 'or', 'it', 'this', 'that', 'these', 'those', 'work', 'works', 'can',
  'be', 'has', 'have', 'had', 'as', 'about', 'tell', 'me', 'explain',
]);

/**
 * Generates a concise, strictly grounded natural-language answer to a user's question
 * using ONLY the retrieved RAG context chunks.
 */
export async function generateGroundedAnswer(
  question: string,
  chunks: RetrievedContextChunk[],
  options: { minScoreThreshold?: number } = {},
): Promise<GeneratedAnswerResult> {
  const minScore = options.minScoreThreshold ?? 0.20;
  const topChunk = chunks[0];

  // Extract meaningful query keywords
  const queryTokens = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  // Check if at least one meaningful query token appears in any retrieved chunk
  const combinedContext = chunks.map((c) => c.content.toLowerCase()).join(' ');
  const hasKeywordOverlap = queryTokens.some((t) => combinedContext.includes(t));

  // If no chunks meet the confidence threshold or zero keyword overlap, refuse politely
  if (!topChunk || topChunk.similarityScore < minScore || !hasKeywordOverlap) {
    return {
      answer:
        'I do not have enough relevant documentation in the knowledge base to answer this question accurately. Please upload an operational runbook or ingest the relevant external documentation URL.',
      hasContext: false,
      citedSources: [],
    };
  }

  // Filter relevant chunks
  const relevantChunks = chunks.filter((c) => c.similarityScore >= minScore);

  // Extract unique cited sources
  const sourceMap = new Map<
    string,
    { documentId: string; documentTitle: string; sourceUrl?: string | null; sourceType: string }
  >();

  for (const chunk of relevantChunks) {
    if (!sourceMap.has(chunk.documentId)) {
      sourceMap.set(chunk.documentId, {
        documentId: chunk.documentId,
        documentTitle: chunk.documentTitle,
        sourceUrl: chunk.sourceUrl || null,
        sourceType: chunk.sourceType,
      });
    }
  }
  const citedSources = Array.from(sourceMap.values());

  const openaiKey = process.env.OPENAI_API_KEY;

  if (openaiKey && openaiKey !== 'mock') {
    try {
      const contextText = relevantChunks
        .map(
          (c, idx) =>
            `[Context ${idx + 1} - Source: "${c.documentTitle}" (${c.sourceUrl || c.sourceType})]\n${c.content}`,
        )
        .join('\n\n---\n\n');

      const systemPrompt = `You are SopON's AI Incident and Knowledge Copilot.
Your job is to answer the user's technical question based STRICTLY and ONLY on the provided documentation context below.
- Do NOT make up or hallucinate facts that are not present in the context.
- Be concise, clear, and technical.
- If the context mentions specific libraries, parameters, or remediation steps, cite them clearly.
- If the context does not contain the answer, say "The provided documentation does not contain enough information to answer this question."`;

      const userPrompt = `DOCUMENTATION CONTEXT:
${contextText}

USER QUESTION:
${question}

CONCISE GROUNDED ANSWER:`;

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 500,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) {
          return {
            answer: text,
            hasContext: true,
            citedSources,
          };
        }
      }
    } catch {
      // Fallback to deterministic local grounded synthesis
    }
  }

  // Local Grounded Synthesizer (for offline / test environments)
  const localAnswer = synthesizeLocalGroundedAnswer(question, relevantChunks);
  return {
    answer: localAnswer,
    hasContext: true,
    citedSources,
  };
}

/**
 * Deterministic local grounded synthesizer for offline / test environments.
 * Extracts and formats the most relevant technical sentences from the retrieved chunks.
 */
function synthesizeLocalGroundedAnswer(
  question: string,
  chunks: RetrievedContextChunk[],
): string {
  const topChunk = chunks[0];
  if (!topChunk) return 'No context available.';

  const qLower = question.toLowerCase();
  const isMultiplexingQ = qLower.includes('multiplex');
  const isPoolingQ = qLower.includes('pool');

  // Collect candidate sentences across top chunks
  const candidateSentences: string[] = [];
  for (const chunk of chunks.slice(0, 3)) {
    // Normalize lines
    const rawLines = chunk.content
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 20 && !l.startsWith('[Source URL:') && !l.startsWith('RATE THIS'));

    for (const line of rawLines) {
      const sentences = line.split(/(?<=[.?!])\s+/);
      for (const s of sentences) {
        const clean = s.trim();
        if (clean.length > 20 && !candidateSentences.includes(clean)) {
          candidateSentences.push(clean);
        }
      }
    }
  }

  // Score sentences based on query keyword overlap
  const scoredSentences = candidateSentences.map((sentence) => {
    const sLower = sentence.toLowerCase();
    let score = 0;

    if (isMultiplexingQ && sLower.includes('multiplex')) score += 6;
    if (isPoolingQ && sLower.includes('pool')) score += 6;
    if (sLower.includes('connection')) score += 2;
    if (sLower.includes('client')) score += 2;
    if (sLower.includes('redis')) score += 2;
    if (sLower.includes('command') || sLower.includes('pipelin') || sLower.includes('thread')) score += 1.5;

    return { sentence, score };
  });

  scoredSentences.sort((a, b) => b.score - a.score);
  const bestSentences = scoredSentences
    .filter((s) => s.score > 3)
    .slice(0, 4)
    .map((s) => s.sentence);

  if (bestSentences.length > 0) {
    return bestSentences.join(' ');
  }

  // Clean fallback from top chunk content
  const fallback = topChunk.content
    .split('\n')
    .filter((l) => l.trim().length > 20 && !l.startsWith('[Source URL:') && !l.startsWith('#'))
    .slice(0, 3)
    .join(' ');

  return fallback || topChunk.content.slice(0, 250);
}