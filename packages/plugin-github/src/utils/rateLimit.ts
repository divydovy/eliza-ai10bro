import { elizaLogger } from '@elizaos/core';

export function withRateLimit<T>(
  key: string,
  fn: () => Promise<T>,
  options: {
    maxRequests?: number;
    timeWindow?: number;
    onRateLimit?: () => void;
    getCachedData?: () => T | null;
  } = {}
): Promise<T> {
  const {
    maxRequests = 10,
    timeWindow = 60000, // 1 minute
    onRateLimit,
    getCachedData
  } = options;

  let requestCount = 0;
  let windowStart = Date.now();

  return (async () => {
    const now = Date.now();

    // Reset counter if we're in a new time window
    if (now - windowStart > timeWindow) {
      requestCount = 0;
      windowStart = now;
    }

    // Check if we've exceeded the rate limit
    if (requestCount >= maxRequests) {
      if (onRateLimit) {
        onRateLimit();
      }
      // Instead of throwing, try to get cached data
      if (getCachedData) {
        const cached = getCachedData();
        if (cached) {
          elizaLogger.warn(`Rate limit exceeded for ${key}, using cached data`);
          return cached;
        }
      }
      // If no cached data available, wait and retry
      const waitTime = timeWindow - (now - windowStart);
      elizaLogger.warn(`Rate limit exceeded for ${key}, waiting ${waitTime}ms before retry`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return withRateLimit(key, fn, options);
    }

    requestCount++;
    return fn();
  })();
}