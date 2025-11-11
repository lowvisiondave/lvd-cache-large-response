import { unstable_cache } from "next/cache";

const SAFE_CHUNK_SIZE_BYTES = 1_500_000;

function splitIntoChunks<T>(
  data: T,
  maxChunkSizeBytes = SAFE_CHUNK_SIZE_BYTES,
): { chunks: string[]; jsonString: string } {
  const jsonString = JSON.stringify(data);
  const chunks: string[] = [];

  for (
    let startIndex = 0;
    startIndex < jsonString.length;
    startIndex += maxChunkSizeBytes
  ) {
    const chunk = jsonString.slice(startIndex, startIndex + maxChunkSizeBytes);
    chunks.push(chunk);
  }

  return { chunks, jsonString };
}

function reassembleChunks<T>(chunks: string[]): T {
  const combinedJsonString = chunks.join("");
  return JSON.parse(combinedJsonString);
}

function createChunkKey(prefix: string, chunkIndex: number): string {
  return `${prefix}::chunk${chunkIndex}`;
}

/**
 * Request-scoped temporary store for values being cached.
 * This only exists during the current request and is used as a bridge
 * to get values into unstable_cache. It's not persisted across requests.
 */
const requestStore = new Map<string, unknown>();

/**
 * Stores a value in the cache.
 * The value is temporarily stored in requestStore, then cached via unstable_cache.
 */
async function storeCachedValue<T>(
  key: string,
  value: T,
  revalidateSeconds: number,
  tagPrefix: string,
): Promise<void> {
  const cacheKey = `${key}:${revalidateSeconds}`;

  // Store value temporarily for this request only
  requestStore.set(cacheKey, value);

  // Create cache function that reads from requestStore
  const cachedFn = unstable_cache(
    async () => {
      const stored = requestStore.get(cacheKey) as T | undefined;
      if (stored === undefined) {
        throw new Error(`Cache miss for key: ${cacheKey}`);
      }
      return stored;
    },
    [cacheKey],
    {
      revalidate: revalidateSeconds,
      tags: [`${tagPrefix}:${key}`],
    },
  );

  // Call it to cache the value
  await cachedFn();
}

/**
 * Retrieves a cached value. Returns null if cache miss.
 * Note: requestStore is empty on retrieval (new serverless invocation),
 * but unstable_cache should return cached value without executing the function.
 */
async function getCachedValue<T>(
  key: string,
  revalidateSeconds: number,
  tagPrefix: string,
): Promise<T | null> {
  const cacheKey = `${key}:${revalidateSeconds}`;

  try {
    // Create cache function with same structure
    // If cache exists, unstable_cache returns cached value without executing function
    // If cache misses, function executes, reads empty requestStore, throws
    const cachedFn = unstable_cache(
      async () => {
        const stored = requestStore.get(cacheKey) as T | undefined;
        if (stored === undefined) {
          throw new Error(`Cache miss for key: ${cacheKey}`);
        }
        return stored;
      },
      [cacheKey],
      {
        revalidate: revalidateSeconds,
        tags: [`${tagPrefix}:${key}`],
      },
    );

    return await cachedFn();
  } catch {
    // Cache miss - return null
    return null;
  }
}

async function storeMetadata(
  metadataKey: string,
  chunkCount: number,
  revalidateSeconds: number,
): Promise<void> {
  await storeCachedValue(
    metadataKey,
    { chunkCount },
    revalidateSeconds,
    "metadata",
  );
}

async function retrieveMetadata(
  metadataKey: string,
  revalidateSeconds: number,
): Promise<{ chunkCount: number } | null> {
  try {
    const result = await getCachedValue<{ chunkCount: number }>(
      metadataKey,
      revalidateSeconds,
      "metadata",
    );
    return result;
  } catch (error) {
    console.error(`[ChunkedCache] Failed to retrieve metadata: ${error}`);
    return null;
  }
}

async function storeChunk(
  chunkKey: string,
  chunkData: string,
  revalidateSeconds: number,
): Promise<void> {
  await storeCachedValue(chunkKey, chunkData, revalidateSeconds, "chunk");
}

async function retrieveChunk(
  chunkKey: string,
  revalidateSeconds: number,
): Promise<string | null> {
  try {
    const result = await getCachedValue<string>(
      chunkKey,
      revalidateSeconds,
      "chunk",
    );
    return result;
  } catch (error) {
    console.error(
      `[ChunkedCache] Failed to retrieve chunk ${chunkKey}: ${error}`,
    );
    return null;
  }
}

export function createChunkedCache<T>(
  cacheKeyPrefix: string,
  fetchData: () => Promise<T>,
  revalidateSeconds: number = 60 * 60,
) {
  const metadataKey = `metadata::${cacheKeyPrefix}`;

  async function retrieveFromCache(): Promise<{
    data: T;
    chunkCount: number;
  } | null> {
    const metadata = await retrieveMetadata(metadataKey, revalidateSeconds);

    if (!metadata) {
      return null;
    }

    const chunkKeys = Array.from({ length: metadata.chunkCount }, (_, i) =>
      createChunkKey(cacheKeyPrefix, i),
    );

    // Retrieve all chunks in parallel
    const chunks = await Promise.all(
      chunkKeys.map((chunkKey) => retrieveChunk(chunkKey, revalidateSeconds)),
    );

    // Filter out null chunks (missing chunks will cause JSON.parse to fail)
    const validChunks = chunks.filter(
      (chunk): chunk is string => chunk !== null,
    );

    try {
      const data = reassembleChunks<T>(validChunks);
      return {
        data,
        chunkCount: metadata.chunkCount,
      };
    } catch (error) {
      console.error(
        `[ChunkedCache] Validation FAILED - Failed to reassemble chunks: ${error}`,
      );
      return null;
    }
  }

  async function storeInCache(data: T): Promise<void> {
    const { chunks, jsonString } = splitIntoChunks(data);

    const sizeInMB =
      new TextEncoder().encode(jsonString).length / (1024 * 1024);
    console.log(
      `[ChunkedCache] Cache MISS - Storing ${chunks.length} chunks (${sizeInMB.toFixed(2)} MB)`,
    );

    await Promise.all([
      storeMetadata(metadataKey, chunks.length, revalidateSeconds),
      ...chunks.map((chunk, index) =>
        storeChunk(
          createChunkKey(cacheKeyPrefix, index),
          chunk,
          revalidateSeconds,
        ),
      ),
    ]);
  }

  async function get(): Promise<T> {
    const cached = await retrieveFromCache();

    if (cached !== null) {
      console.log(
        `[ChunkedCache] Cache HIT - Retrieved ${cached.chunkCount} chunks`,
      );
      return cached.data;
    }

    console.log("[ChunkedCache] Cache MISS - Fetching fresh data");
    const freshData = await fetchData();
    await storeInCache(freshData);
    return freshData;
  }

  return { get };
}
