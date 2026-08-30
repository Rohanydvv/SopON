# SopON Architecture Overview

## Monorepo Layout
- **apps/web**: Next.js 15 (App Router), Tailwind CSS, React Query, shadcn/ui.
- **apps/api**: NestJS 11 (Fastify adapter), OpenAPI/Swagger, WebSockets Gateway.
- **apps/worker**: BullMQ worker process consuming Redis queues.
- **packages/database**: Prisma schema with pgvector extensions.
- **packages/contracts**: Shared DTOs, domain enums, error models, and Zod schemas.
- **packages/config**: Typed runtime configuration validation.
- **packages/ai**: Vendor-agnostic AIProvider abstraction.

## Core Flow
```
Inbound Event -> Ingest Endpoint -> BullMQ Queue -> Worker -> DB (Incident/Event)
                                                           -> AI Classification
                                                           -> Routing & Assignment
                                                           -> Notification & SLA Timers
                                                           -> WebSocket Broadcast
```
