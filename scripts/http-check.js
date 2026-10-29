// Bounded GET retries for transient hosting responses; never retry a broken 404.
export async function checkedFetch(url, { attempts = 3, delayMs = 500, timeoutMs = 15000, onRetry = () => {} } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
      if (![429,500,502,503,504].includes(response.status) || attempt === attempts) return response;
      onRetry({ url: String(url), attempt, status: response.status });
      await response.body?.cancel();
    } catch (error) {
      if (attempt === attempts) throw error;
      onRetry({ url: String(url), attempt, error: error.message });
    }
    await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
  }
  throw new Error('Invalid retry configuration');
}
