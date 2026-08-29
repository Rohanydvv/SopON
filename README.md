# SopON

> Multi-tenant AI-powered incident and support operations platform.

## Overview
SopON centralizes incidents, prioritizes them, assigns them to the right team/member, tracks SLAs, searches historical knowledge, and uses AI to classify incidents and generate evidence-based investigation and resolution suggestions.

## Architecture
- **Frontend**: Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query
- **Backend API**: NestJS, Fastify adapter, REST API (/api/v1), Swagger/OpenAPI, WebSockets
- **Worker**: BullMQ, Redis
- **Database**: PostgreSQL with pgvector, Prisma ORM
- **AI Integration**: AIProvider abstraction (OpenAI / Google Gemini), structured output, embeddings & RAG
