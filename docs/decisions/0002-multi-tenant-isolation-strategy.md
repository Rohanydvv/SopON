# 2. Architecture Decision: Multi-Tenant Data Isolation

## Status
Accepted

## Context
Multi-tenancy is critical. Data belonging to Organization A must never be accessible to Organization B.

## Decision
1. **Shared Database, Isolated Tenant Context**: All organization-owned tables include organizationId.
2. **Server-Side Context Resolution**: The organizationId is never trusted from frontend request bodies. It is resolved on the server from the authenticated user's active membership and validated RBAC permissions.
3. **Compound Indexes**: Queries on tenant entities leverage indexes on (organizationId, ...).
4. **Vector Retrieval Isolation**: RAG similarity queries must strictly filter chunks by organizationId.
