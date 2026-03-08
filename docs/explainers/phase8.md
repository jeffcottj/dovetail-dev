# Phase 8: Semantic Search — What We Built and Why

This document explains what was accomplished in Phase 8 of the Dovetail project, written for a non-technical audience.

## What is Phase 8?

Phase 7 gave Dovetail keyword search — users could find articles containing specific words. Phase 8 adds **semantic search**, which finds articles by *meaning*. A query like "how to help someone facing eviction" will now surface articles about tenant rights, unlawful detainer, and lease termination — even if those articles never use the word "eviction." Phase 8 also introduces **hybrid search**, which combines keyword and semantic results so users get the best of both approaches.

## What We Built

### 1. Embedding Service (Task 8.1)

**What are embeddings?** An embedding is a list of numbers (a "vector") that represents the meaning of a piece of text. Two pieces of text with similar meanings will have vectors that point in similar directions. By comparing vectors, we can find articles that are semantically related to a search query without requiring exact word matches.

**Provider abstraction:** Different AI services can generate embeddings. Dovetail supports two:

- **OpenAI** (`text-embedding-3-small`) — A cloud API. Fast, high quality, requires an API key and internet access. This is the default.
- **Ollama** (`nomic-embed-text`) — Runs locally on your own hardware. No API key needed, no data leaves your network. Useful for air-gapped or privacy-sensitive deployments.

The embedding service (`apps/api/src/services/embeddings.ts`) defines a common interface (`EmbeddingProvider`) with two methods: `embed` (single text) and `embedMany` (batch). A factory function reads `EMBEDDING_PROVIDER` from the environment and returns the right implementation. Switching providers requires changing one environment variable — no code changes.

**Why this matters:** The abstraction means Dovetail isn't locked into any single AI provider. Organizations can choose based on cost, privacy, or infrastructure constraints.

### 2. Embedding Pipeline (Task 8.2)

**The challenge:** Embedding models have a maximum input length. A long article can't be embedded as a single piece of text — it needs to be split into smaller pieces first.

**Chunking:** The pipeline (`apps/api/src/services/embedding-pipeline.ts`) splits article text into chunks of approximately 2,000 characters with a 200-character overlap between adjacent chunks. The overlap ensures that ideas spanning a chunk boundary aren't lost — the end of one chunk and the beginning of the next share some context.

**The pipeline flow:**
1. Fetch the article from the database
2. Extract plain text from Tiptap JSON content (reusing the utility from Phase 7)
3. Split the text into overlapping chunks
4. Send all chunks to the embedding provider in a single batch
5. Delete any old embeddings for that article (in case content changed)
6. Store each chunk and its embedding vector in the `article_embeddings` table

**Async execution:** Embedding generation is **fire-and-forget** — it runs in the background after the HTTP response is sent. When a user saves an article, they get an immediate response. The embedding generation happens asynchronously and won't slow down the editing experience. If it fails (e.g., the embedding API is down), the error is logged but the article save still succeeds.

**When embeddings are generated:** Every time an article is created (`POST /api/articles`) or updated (`PATCH /api/articles/:id`), the pipeline runs automatically.

**Why this matters:** The search index updates itself. Authors don't need to think about embeddings — they just write and save. The async design means the embedding API's latency (which can be hundreds of milliseconds) never affects the user's editing experience.

### 3. Hybrid Search (Task 8.3)

**Three search modes:** The search endpoint (`GET /api/search`) now accepts a `mode` parameter:

- `mode=fulltext` (default) — Keyword search using PostgreSQL's tsvector, exactly as Phase 7 built it. Best for queries with specific terms the user knows appear in the content.

- `mode=semantic` — Vector similarity search using pgvector. The query is embedded into a vector, then compared against all stored article chunk embeddings using cosine similarity. Best for natural-language questions or conceptual queries.

- `mode=hybrid` — Runs both fulltext and semantic searches in parallel, then merges the results using a technique called **Reciprocal Rank Fusion (RRF)**.

**How Reciprocal Rank Fusion works:** RRF is a simple, effective algorithm for combining two ranked lists. Each result gets a score based on its position in each list: `1 / (k + rank)`, where `k` is a constant (60 by default). If an article appears in both lists, its scores are added together. The final list is sorted by combined score.

For example, if an article ranks #1 in fulltext results and #3 in semantic results, its RRF score is `1/61 + 1/63 = 0.0323`. An article ranking #2 in both gets `1/62 + 1/62 = 0.0323`. The algorithm naturally boosts articles that appear in both result sets while still surfacing articles found by only one method.

**Deduplication:** When the same article appears in both fulltext and semantic results, it only appears once in the merged output — with the higher-ranked version's metadata.

**Why this matters:** Different queries work better with different search methods. "§8 voucher" works best with keyword search (exact term match). "How do I help a client who can't pay rent" works best with semantic search (meaning match). Hybrid mode lets the system give good results regardless of how the user phrases their query.

## Files Changed

### New files
| File | Purpose |
|------|---------|
| `apps/api/src/services/embeddings.ts` | Embedding provider interface and OpenAI/Ollama implementations |
| `apps/api/src/services/embedding-pipeline.ts` | Text chunking and async embedding generation |
| `apps/api/src/__tests__/services/embeddings.test.ts` | Tests for embedding providers (10 tests) |
| `apps/api/src/__tests__/services/embedding-pipeline.test.ts` | Tests for chunking and pipeline (7 tests) |

### Modified files
| File | Change |
|------|--------|
| `apps/api/src/routes/search.ts` | Added `mode` parameter, semantic search, hybrid search with RRF |
| `apps/api/src/routes/articles.ts` | Added fire-and-forget embedding generation on create/update |
| `apps/api/src/__tests__/routes/search.test.ts` | Added tests for semantic, hybrid, and invalid mode (11 tests total, up from 5) |

## How It All Connects

```
Article saved → Extract plain text → Chunk text → Embed chunks → Store in article_embeddings
                                                                        ↓
User searches → GET /api/search?q=...&mode=hybrid                      ↓
                    ↓                                                   ↓
        ┌───────────┴───────────┐                                       ↓
  fulltext search          semantic search                              ↓
  (tsvector + GIN)     (embed query → cosine similarity on article_embeddings)
        └───────────┬───────────┘
              RRF merge
                 ↓
         Ranked results
```

**The embedding lifecycle:**
1. Author saves article → Express handler responds immediately
2. In the background: plain text extracted, chunked, sent to embedding provider
3. Embedding vectors stored in `article_embeddings` alongside chunk text
4. When someone searches in semantic or hybrid mode, the query is also embedded
5. pgvector finds the closest chunk embeddings by cosine similarity
6. In hybrid mode, these results are merged with fulltext results via RRF

## What's Next

Phase 9 adds the **RAG API** — a dedicated endpoint for LLM applications like LibreChat. It uses API key authentication (separate from user OAuth) and returns article chunks formatted for LLM consumption, building on the embedding infrastructure from this phase.
