import { retry } from './retry.mjs';

export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
    this.status = status;
    // 4xx are caller errors: retrying will not help.
    this.retryable = status >= 500 || status === 429;
  }
}

/**
 * transport(url, { signal }) => Promise<{ status: number, body: string }>
 */
export function createClient({ transport, retries = 2, baseDelayMs = 50, sleep } = {}) {
  return {
    async getJson(url, { signal } = {}) {
      return retry(async () => {
        const res = await transport(url, { signal });
        if (res.status >= 400) throw new HttpError(res.status, url);
        return JSON.parse(res.body);
      }, { retries, baseDelayMs, sleep, signal });
    },
  };
}
