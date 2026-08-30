# Local Development Runbook

## Prerequisites
- Node.js >= 20.x
- pnpm >= 9.x
- Docker & Docker Compose

## Setup Steps
1. Clone the repository and install dependencies:
   ```bash
   pnpm install
   ```
2. Start PostgreSQL, Redis, and Mailpit:
   ```bash
   docker compose up -d
   ```
3. Generate Prisma client & migrate:
   ```bash
   pnpm db:generate
   pnpm db:push
   ```
4. Run development services:
   ```bash
   # In separate terminals or concurrently
   pnpm dev:api      # Starts NestJS API on http://localhost:4000
   pnpm dev:worker   # Starts BullMQ Worker
   pnpm dev:web      # Starts Next.js frontend on http://localhost:3000
   ```
