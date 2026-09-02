export type PaddleApiFailureCode =
  | 'paddle_api_key_missing'
  | 'paddle_api_timeout'
  | 'paddle_api_rate_limited'
  | 'paddle_api_unavailable'
  | 'paddle_api_unauthorized'
  | 'paddle_api_not_found'
  | 'paddle_api_invalid_response';

export type PaddleApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; failureCode: PaddleApiFailureCode; retryable: boolean; stopBatch: boolean };

export async function fetchPaddleResource<T>(
  resourcePath: string,
  apiKey: string,
  timeoutMs = 8000,
): Promise<PaddleApiResult<T>> {
  if (!apiKey) {
    return {
      ok: false,
      failureCode: 'paddle_api_key_missing',
      retryable: true,
      stopBatch: true,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://api.paddle.com${resourcePath}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { ok: false, failureCode: 'paddle_api_unauthorized', retryable: true, stopBatch: true };
      }
      if (response.status === 404) {
        return { ok: false, failureCode: 'paddle_api_not_found', retryable: false, stopBatch: false };
      }
      if (response.status === 429) {
        return { ok: false, failureCode: 'paddle_api_rate_limited', retryable: true, stopBatch: true };
      }
      return { ok: false, failureCode: 'paddle_api_unavailable', retryable: true, stopBatch: response.status >= 500 };
    }

    const json = await response.json() as { data?: T };
    if (!json || !json.data || typeof json.data !== 'object') {
      return { ok: false, failureCode: 'paddle_api_invalid_response', retryable: true, stopBatch: false };
    }
    return { ok: true, data: json.data };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'AbortError';
    return {
      ok: false,
      failureCode: timedOut ? 'paddle_api_timeout' : 'paddle_api_unavailable',
      retryable: true,
      stopBatch: false,
    };
  } finally {
    clearTimeout(timer);
  }
}
