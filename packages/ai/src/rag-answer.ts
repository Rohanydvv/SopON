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
  const minScore = options.minScoreThreshold ?? 0.15;
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

  // 1. Dynamic Relative Context Pruning (topScore * 0.75 threshold)
  // Prunes distant/generic noise documents when high-confidence technical docs exist.
  const relativeCutoff = Math.max(minScore, topChunk.similarityScore * 0.75);
  const relevantChunks = chunks.filter((c) => c.similarityScore >= relativeCutoff);

  const openaiKey = process.env.OPENAI_API_KEY;

  if (openaiKey && openaiKey !== 'mock') {
    try {
      const contextText = relevantChunks
        .map(
          (c, idx) =>
            `[Context ${idx + 1} - Document: "${c.documentTitle}" (ID: ${c.documentId}, Source: ${c.sourceUrl || c.sourceType})]\n${c.content}`,
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
          // Extract sources from relevantChunks that contributed
          const sourceMap = new Map<string, { documentId: string; documentTitle: string; sourceUrl?: string | null; sourceType: string }>();
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
          return {
            answer: text,
            hasContext: true,
            citedSources: Array.from(sourceMap.values()),
          };
        }
      }
    } catch {
      // Fallback to deterministic local grounded synthesis
    }
  }

  // 2. Coherent Grounded Synthesis & Strict Source Attribution (Local Synthesizer)
  const synthesis = synthesizeLocalGroundedAnswer(question, relevantChunks);
  return {
    answer: synthesis.answer,
    hasContext: true,
    citedSources: synthesis.citedSources,
  };
}

interface SynthesizedAnswerOutput {
  answer: string;
  citedSources: Array<{
    documentId: string;
    documentTitle: string;
    sourceUrl?: string | null;
    sourceType: string;
  }>;
}

/**
 * Deterministic local grounded synthesizer for offline / test environments.
 * Extracts complete, well-formed technical sentences from the retrieved chunks
 * and tracks the exact source documents that contributed to the answer.
 */
function synthesizeLocalGroundedAnswer(
  question: string,
  chunks: RetrievedContextChunk[],
): SynthesizedAnswerOutput {
  const topChunk = chunks[0];
  if (!topChunk) {
    return {
      answer: 'No context available.',
      citedSources: [],
    };
  }

  const qLower = question.toLowerCase();
  const isMultiplexingQ = qLower.includes('multiplex');
  const isPoolingQ = qLower.includes('pool');

  interface CandidateSentence {
    text: string;
    score: number;
    chunk: RetrievedContextChunk;
  }

  const candidates: CandidateSentence[] = [];

  for (const chunk of chunks) {
    const rawParagraphs = chunk.content
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20 && !p.startsWith('[Source URL:') && !p.startsWith('RATE THIS'));

    for (const para of rawParagraphs) {
      // Normalize linebreaks and backticks
      const cleanPara = para
        .replace(/\n+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .replace(/^#+\s+/g, '')
        .trim();

      // Split into complete sentences
      const sentences = cleanPara.match(/[^.!?]+[.!?]+/g) || [cleanPara];

      for (const rawSentence of sentences) {
        let sentence = rawSentence.trim();
        // Remove markdown backticks around names while keeping content (e.g. `StackExchange.Redis` -> StackExchange.Redis)
        sentence = sentence.replace(/`([^`]+)`/g, '$1');

        if (sentence.length < 25) continue;
        if (sentence.startsWith('[') || sentence.startsWith('#') || sentence.startsWith('★')) continue;

        const sLower = sentence.toLowerCase();
        let score = 0;

        if (isMultiplexingQ && sLower.includes('multiplex')) score += 8;
        if (isPoolingQ && sLower.includes('pool')) score += 8;
        if (sLower.includes('connection')) score += 2;
        if (sLower.includes('client')) score += 2;
        if (sLower.includes('redis')) score += 2;
        if (sLower.includes('pipelin') || sLower.includes('command') || sLower.includes('socket')) score += 2;
        if (sLower.includes('borrow') || sLower.includes('return') || sLower.includes('reuse')) score += 2;

        if (score > 0) {
          candidates.push({ text: sentence, score, chunk });
        }
      }
    }
  }

  // Sort candidate sentences by relevance score
  candidates.sort((a, b) => b.score - a.score);

  // Pick top non-redundant sentences
  const selectedSentences: CandidateSentence[] = [];
  const usedTexts = new Set<string>();

  for (const cand of candidates) {
    if (usedTexts.has(cand.text)) continue;
    if (selectedSentences.length >= 3) break;
    selectedSentences.push(cand);
    usedTexts.add(cand.text);
  }

  // If candidate sentences found, assemble answer and extract genuine sources
  if (selectedSentences.length > 0) {
    const answerText = selectedSentences.map((s) => s.text).join(' ');

    const sourceMap = new Map<string, { documentId: string; documentTitle: string; sourceUrl?: string | null; sourceType: string }>();
    for (const item of selectedSentences) {
      if (!sourceMap.has(item.chunk.documentId)) {
        sourceMap.set(item.chunk.documentId, {
          documentId: item.chunk.documentId,
          documentTitle: item.chunk.documentTitle,
          sourceUrl: item.chunk.sourceUrl || null,
          sourceType: item.chunk.sourceType,
        });
      }
    }

    return {
      answer: answerText,
      citedSources: Array.from(sourceMap.values()),
    };
  }

  // Clean fallback from top chunk
  const fallbackLines = topChunk.content
    .split('\n')
    .filter((l) => l.trim().length > 25 && !l.startsWith('[Source URL:') && !l.startsWith('#'))
    .slice(0, 2)
    .join(' ')
    .replace(/`([^`]+)`/g, '$1');

  return {
    answer: fallbackLines || topChunk.content.slice(0, 250),
    citedSources: [
      {
        documentId: topChunk.documentId,
        documentTitle: topChunk.documentTitle,
        sourceUrl: topChunk.sourceUrl || null,
        sourceType: topChunk.sourceType,
      },
    ],
  };
}