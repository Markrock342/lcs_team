const inFlightGetRequests = new Map<string, Promise<unknown>>();

async function executeNeonRequest<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && payload.error
        ? payload.error
        : `Neon API request failed (${response.status})`;
    throw new Error(message);
  }
  return payload as T;
}

export function neonRequest<T>(input: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" || init?.signal) return executeNeonRequest<T>(input, init);

  const existing = inFlightGetRequests.get(input) as Promise<T> | undefined;
  if (existing) return existing;

  const request = executeNeonRequest<T>(input, init).finally(() => {
    if (inFlightGetRequests.get(input) === request) {
      inFlightGetRequests.delete(input);
    }
  });
  inFlightGetRequests.set(input, request);
  return request;
}
