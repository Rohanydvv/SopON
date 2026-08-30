# 4. Architecture Decision: AI Provider Abstraction and Safety

## Status
Accepted

## Context
AI capabilities (classification, summarization, investigation, RCA) must not be coupled to specific vendor SDKs, must enforce structured outputs, and must operate safely.

## Decision
1. **Abstraction**: Define AIProvider interface with discrete domain methods.
2. **Adapters**: Implement GeminiProvider and OpenAIProvider behind the interface.
3. **Structured Outputs**: All LLM outputs must adhere to strict JSON schemas validated via Zod.
4. **Safety & Assistant Role**: AI is an assistant. It never executes destructive operations or production commands autonomously. Suggestions explicitly indicate confidence and citations.
