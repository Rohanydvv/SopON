# 3. Architecture Decision: Asynchronous Processing via BullMQ and Redis

## Status
Accepted

## Context
Long-running AI calls, email notifications, SLA monitoring, and event ingestion cannot block synchronous API requests.

## Decision
- Use BullMQ with Redis for asynchronous job processing.
- Separate queues by concern:
  - incident-processing: Raw event normalization & deduplication.
  - i-analysis: LLM classification, summarization, investigation, RCA.
  - 
otifications: Email, in-app alerts, webhooks.
  - sla: Scheduled countdown checks and breach escalations.
  - knowledge: Chunking, embedding, vector updates.
- All handlers must be **idempotent**, support exponential backoff retries, and handle failures without corrupting state.
