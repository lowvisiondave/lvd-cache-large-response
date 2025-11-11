# Chunked Cache for Large Responses

A Next.js demonstration of caching large API responses (over 2MB) by splitting them into chunks to work around Next.js's ~2MB cache entry limit.

## Overview

Next.js `unstable_cache` has a ~2MB limit per cache entry. This project implements a chunked caching strategy that automatically splits large responses into smaller chunks, stores them separately, and reassembles them on retrieval.

## Features

- **Automatic Chunking**: Splits large responses into chunks under 2MB each
- **Validation**: Ensures all chunks are present before reassembly
- **Error Handling**: Detects and handles partial cache eviction
- **Self-Documenting Code**: Clean, readable implementation without excessive comments

## How It Works

1. **Storage**: When caching large data, it's split into chunks (default: 1.5MB each)
2. **Metadata**: Stores chunk count in a separate metadata cache entry
3. **Retrieval**: Validates that all expected chunks are present before reassembly
4. **Reassembly**: Combines chunks back into the original data structure

If any chunk is missing (due to cache eviction), the cache is treated as invalid and fresh data is fetched.

## Usage

```typescript
import { createChunkedCache } from "@/lib/chunkedCache";

const cache = createChunkedCache(
  "cache-key-prefix",
  async () => {
    // Your fetch function that returns large data
    const response = await fetch("https://api.example.com/large-data");
    return response.json();
  },
  3600 // Cache revalidation time in seconds
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

The implementation includes minimal logging:
- `[ChunkedCache] Cache MISS - Fetching fresh data` - When cache miss occurs
- `[ChunkedCache] Cache MISS - Storing X chunks (Y MB)` - When storing chunks
- `[ChunkedCache] Cache HIT - Retrieved X chunks` - When retrieving from cache
- `[ChunkedCache] Validation FAILED - ...` - When chunk validation fails
