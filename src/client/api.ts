export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function api<T>(
  url: string,
  options: RequestInit = {},
  timeoutMs = 0,
  retries = 0
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let response: Response;
      try {
        response = await fetch(url, {
          ...options,
          ...(timeoutMs > 0 ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
          credentials: "same-origin",
          headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers,
          },
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "TimeoutError") {
          throw new ApiError("The server took too long to respond. Please try again.", 408);
        }
        throw error;
      }

      if (!response.ok) {
        let message = `Request failed (${response.status}).`;
        try {
          const body: unknown = await response.json();
          if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
            message = body.error;
          }
        } catch {
          // ignore parse errors
        }
        throw new ApiError(message, response.status);
      }
      if (response.status === 204) return undefined as T;
      return response.json() as Promise<T>;
    } catch (error) {
      lastError = error;
      // Never retry HTTP errors from the server (4xx/5xx), except our own 408 timeout
      if (error instanceof ApiError && error.status !== 408) {
        throw error;
      }
      // Retry network/timeout errors if attempts remain
      if (attempt < retries) {
        await sleep(Math.pow(2, attempt) * 1000); // 1s, 2s, 4s ...
        continue;
      }
    }
  }

  throw lastError;
}
