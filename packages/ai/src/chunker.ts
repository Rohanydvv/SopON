export interface DocumentChunk {
  content: string;
  chunkIndex: number;
  tokenCount: number;
}

export interface ChunkOptions {
  maxChunkSize?: number; // approximate character count
  overlap?: number;
}

/**
 * Splits markdown and text documents into coherent, semantic chunks
 * while preserving paragraph and header structure.
 */
export function splitDocumentIntoChunks(
  text: string,
  options: ChunkOptions = {},
): DocumentChunk[] {
  const maxChunkSize = options.maxChunkSize || 1000;
  const overlap = options.overlap || 150;

  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  // Split by major Markdown sections or double newlines
  const paragraphs = normalized.split(/\n\n+/);
  const chunks: DocumentChunk[] = [];

  let currentChunk = '';
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (currentChunk.length + trimmed.length + 2 <= maxChunkSize) {
      currentChunk = currentChunk ? `${currentChunk}\n\n${trimmed}` : trimmed;
    } else {
      if (currentChunk) {
        chunks.push({
          content: currentChunk,
          chunkIndex: chunkIndex++,
          tokenCount: Math.ceil(currentChunk.length / 4),
        });

        // Add overlap from previous chunk
        const overlapText = currentChunk.slice(-overlap).trim();
        currentChunk = overlapText ? `${overlapText}\n\n${trimmed}` : trimmed;
      } else {
        // Single paragraph larger than maxChunkSize, split by sentence or slice
        let start = 0;
        while (start < trimmed.length) {
          const slice = trimmed.slice(start, start + maxChunkSize);
          chunks.push({
            content: slice,
            chunkIndex: chunkIndex++,
            tokenCount: Math.ceil(slice.length / 4),
          });
          start += maxChunkSize - overlap;
        }
        currentChunk = '';
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      chunkIndex: chunkIndex++,
      tokenCount: Math.ceil(currentChunk.length / 4),
    });
  }

  return chunks;
}