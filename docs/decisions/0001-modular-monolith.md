# 1. Architecture Decision: Modular Monolith vs Microservices

## Status
Accepted

## Context
SopON is a multi-tenant incident and support operations platform requiring transactional integrity, multi-tenant isolation, real-time events, and background job execution.

## Decision
We choose a **modular monolith** with separate runtime processes (API and Worker) sharing a unified domain model and single database.
- **apps/api**: NestJS with Fastify adapter serving HTTP REST endpoints, WebSockets, and Swagger OpenAPI.
- **apps/worker**: BullMQ background workers processing queues for asynchronous AI tasks, incident routing, SLA calculations, and notification dispatching.

## Consequences
- High developer productivity without network latency and distributed transaction overhead.
- Clear module boundaries allow independent scaling of the worker and API containers while preserving simple deployments.
