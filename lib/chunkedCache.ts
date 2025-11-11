import { unstable_cache } from "next/cache";

const SAFE_CHUNK_SIZE_BYTES = 1_500_000;

function splitIntoChunks<T>(
  data: T,
  maxChunkSizeBytes = SAFE_CHUNK_SIZE_BYTES,
): string[] {
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

  return chunks;
}

function reassembleChunks<T>(chunks: string[]): T {
  const combinedJsonString = chunks.join("");
  return JSON.parse(combinedJsonString);
}

function createChunkKey(prefix: string, chunkIndex: number): string {
  return `${prefix}::chunk${chunkIndex}`;
}

// In-memory store for cache function data
// Note: This is used as a bridge to Next.js cache via unstable_cache
const chunkDataStore = new Map<string, string>();

type CacheFunction<T> = ReturnType<typeof unstable_cache<() => Promise<T>>>;

/**
 * Generic cache function factory that reduces duplication
 */
function createCacheFunction<T>(
  key: string,
  revalidateSeconds: number,
  tagPrefix: string,
  getData: () => T | null,
): CacheFunction<T> {
  const fn = async () => {
    const data = getData();
    if (data === null) {
      throw new Error(`Data not found for key: ${key}`);
    }
    return data;
  };

  return unstable_cache(fn, [key], {
    revalidate: revalidateSeconds,
    tags: [`${tagPrefix}:${key}`],
  });
}

/**
 * Cache function registry to avoid creating duplicate cache functions
 */
class CacheFunctionRegistry<T> {
  private cacheFunctions = new Map<string, CacheFunction<T>>();

  getOrCreate(
    key: string,
    revalidateSeconds: number,
    tagPrefix: string,
    getData: () => T | null,
  ): CacheFunction<T> {
    const cacheKey = `${key}:${revalidateSeconds}`;

    if (!this.cacheFunctions.has(cacheKey)) {
      this.cacheFunctions.set(
        cacheKey,
        createCacheFunction(key, revalidateSeconds, tagPrefix, getData),
      );
    }

    const cacheFn = this.cacheFunctions.get(cacheKey);
    if (!cacheFn) {
      throw new Error(`Failed to create cache function for ${key}`);
    }

    return cacheFn;
  }
}

const metadataCacheRegistry = new CacheFunctionRegistry<{
  chunkCount: number;
}>();
const chunkCacheRegistry = new CacheFunctionRegistry<string>();

async function storeMetadata(
  metadataKey: string,
  chunkCount: number,
  revalidateSeconds: number,
): Promise<void> {
  chunkDataStore.set(metadataKey, JSON.stringify({ chunkCount }));
  const cacheFn = metadataCacheRegistry.getOrCreate(
    metadataKey,
    revalidateSeconds,
    "metadata",
    () => {
      const data = chunkDataStore.get(metadataKey);
      return data ? (JSON.parse(data) as { chunkCount: number }) : null;
    },
  );
  await cacheFn();
}

async function retrieveMetadata(
  metadataKey: string,
  revalidateSeconds: number,
): Promise<{ chunkCount: number } | null> {
  try {
    const cacheFn = metadataCacheRegistry.getOrCreate(
      metadataKey,
      revalidateSeconds,
      "metadata",
      () => {
        const data = chunkDataStore.get(metadataKey);
        return data ? (JSON.parse(data) as { chunkCount: number }) : null;
      },
    );
    return await cacheFn();
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
  chunkDataStore.set(chunkKey, chunkData);
  const cacheFn = chunkCacheRegistry.getOrCreate(
    chunkKey,
    revalidateSeconds,
    "chunk",
    () => chunkDataStore.get(chunkKey) ?? null,
  );
  await cacheFn();
}

async function retrieveChunk(
  chunkKey: string,
  revalidateSeconds: number,
): Promise<string | null> {
  try {
    const cacheFn = chunkCacheRegistry.getOrCreate(
      chunkKey,
      revalidateSeconds,
      "chunk",
      () => chunkDataStore.get(chunkKey) ?? null,
    );
    return await cacheFn();
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

    const expectedChunkCount = metadata.chunkCount;
    const chunkKeys = Array.from({ length: expectedChunkCount }, (_, i) =>
      createChunkKey(cacheKeyPrefix, i),
    );

    // Retrieve all chunks in parallel (removed double retrieval)
    const chunks = await Promise.all(
      chunkKeys.map((chunkKey) => retrieveChunk(chunkKey, revalidateSeconds)),
    );

    // Validate all chunks are present
    const validChunks = chunks.filter(
      (chunk): chunk is string => chunk !== null,
    );

    if (validChunks.length !== expectedChunkCount) {
      console.log(
        `[ChunkedCache] Validation FAILED - Expected ${expectedChunkCount} chunks, got ${validChunks.length}`,
      );
      return null;
    }

    try {
      const data = reassembleChunks<T>(validChunks);
      return {
        data,
        chunkCount: validChunks.length,
      };
    } catch (error) {
      console.error(
        `[ChunkedCache] Validation FAILED - Failed to reassemble chunks: ${error}`,
      );
      return null;
    }
  }

  async function storeInCache(data: T): Promise<void> {
    const chunks = splitIntoChunks(data);
    const chunkKeys = chunks.map((_, index) =>
      createChunkKey(cacheKeyPrefix, index),
    );

    const jsonString = JSON.stringify(data);
    const sizeInMB =
      new TextEncoder().encode(jsonString).length / (1024 * 1024);
    console.log(
      `[ChunkedCache] Cache MISS - Storing ${chunks.length} chunks (${sizeInMB.toFixed(2)} MB)`,
    );

    await Promise.all([
      storeMetadata(metadataKey, chunks.length, revalidateSeconds),
      ...chunks.map((chunk, index) =>
        storeChunk(chunkKeys[index], chunk, revalidateSeconds),
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
