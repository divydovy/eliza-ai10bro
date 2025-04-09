export function withRateLimit<T>(
  key: string,
  fn: () => Promise<T>,
  options: {
    maxRequests?: number;
    timeWindow?: number;
    onRateLimit?: () => void;
  } = {}
): Promise<T> {
  const {
    maxRequests = 10,
    timeWindow = 60000, // 1 minute
    onRateLimit
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
      throw new Error(`Rate limit exceeded for ${key}`);
    }

    requestCount++;
    return fn();
  })();
}