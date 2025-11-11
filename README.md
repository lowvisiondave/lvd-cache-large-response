# Chunked Cache for Large Responses

A Next.js demonstration of caching large API responses (over 2MB) by splitting them into chunks to work around Next.js's ~2MB cache entry limit.

## Overview

Next.js `unstable_cache` has a ~2MB limit per cache entry. This project implements a chunked caching strategy that automatically splits large responses into smaller chunks, stores them separately, and reassembles them on retrieval.

## Features

- **Automatic Chunking**: Splits large responses into chunks (default: 1.5MB each, safely under the 2MB limit)
- **Parallel Retrieval**: Fetches all chunks concurrently for optimal performance
- **Automatic Validation**: Missing chunks are detected during JSON parsing
- **Error Handling**: Detects and handles partial cache eviction gracefully
- **Type-Safe**: Full TypeScript support with generic types

## How It Works

1. **Storage**: When caching large data, it's automatically split into chunks (default: 1.5MB each)
2. **Metadata**: Stores chunk count in a separate metadata cache entry for validation
3. **Retrieval**: Fetches all chunks in parallel using `Promise.all` for optimal performance
4. **Reassembly**: Combines chunks back into the original JSON string and parses it

**Architecture**: Uses Next.js `unstable_cache` for persistence across serverless invocations. A request-scoped temporary store is used as a bridge to get values into the cache during storage, but persistence is handled entirely by Next.js's cache system.

**Error Handling**: If any chunk is missing (due to cache eviction), the JSON will be incomplete and `JSON.parse` will fail during reassembly. This causes the cache to be treated as invalid, triggering a fresh data fetch automatically.

## Usage

```typescript
import { createChunkedCache } from "@/lib/chunkedCache";

const cache = createChunkedCache(
  "cache-key-prefix", // Unique prefix for this cache
  async () => {
    // Your fetch function that returns large data
    const response = await fetch("https://api.example.com/large-data");
    return response.json();
  },
  3600 // Optional: Cache revalidation time in seconds (default: 3600)
);

const data = await cache.get(); // Returns cached or fresh data
```

## Example

See `app/page.tsx` for a working example that fetches and caches country data from the REST Countries API (~4.68 MB response).

## Getting Started

First, install dependencies:

```bash
pnpm install
```

Then, run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the demo.

## Project Structure

- `lib/chunkedCache.ts` - Core chunked caching implementation
- `lib/countries.ts` - Example data fetching and types
- `app/page.tsx` - Demo page showing chunked cache in action

## Logging

The implementation includes helpful logging for debugging:

**Cache Operations:**
- `[ChunkedCache] Cache MISS - Fetching fresh data` - When cache miss occurs
- `[ChunkedCache] Cache MISS - Storing X chunks (Y MB)` - When storing chunks
- `[ChunkedCache] Cache HIT - Retrieved X chunks` - When successfully retrieving from cache

**Errors:**
- `[ChunkedCache] Validation FAILED - Failed to reassemble chunks: ...` - When JSON parsing fails (usually due to missing chunks)
- `[ChunkedCache] Failed to retrieve metadata: ...` - When metadata retrieval fails
- `[ChunkedCache] Failed to retrieve chunk ...` - When individual chunk retrieval fails
