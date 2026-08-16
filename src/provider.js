/**
 * Keiro (KeiroLabs) search through the `https://kierolabs.space` HTTP API.
 *
 * Keiro exposes a dedicated search endpoint (`POST /api/v2/search/fast`) that
 * returns structured `results[]` — unlike DeepSeek, which requires a full
 * Messages model turn. The API key travels in the `Authorization: Bearer`
 * header (the v2 endpoint rejects body-only `apiKey` auth).
 */
import { WebError } from "@deepseek-ai/dsh-web";

/** User-Agent sent on every request. Bump with the package version. */
const USER_AGENT = "keiro-web-search/0.1.0";

/**
 * Build a `url → snippet` map from the results (unused: Keiro inlines snippets).
 * Kept for parity with the reference provider shape and future extensions.
 * @param results - the parsed `results[]`.
 * @returns the `url → snippet` map (populated from inline snippets).
 */
function inlineSnippets(results) {
  const map = /* @__PURE__ */ new Map();
  for (const item of results ?? []) {
    if (item?.url != null && item.url.length > 0 && !map.has(item.url)) {
      map.set(item.url, item.snippet ?? "");
    }
  }
  return map;
}

/**
 * Map a Keiro `POST /search` response body to a normalized search result.
 * Walks `results[]`, joins each to its inline `snippet`, and dedupes by `url`.
 * `publishedAt` is omitted: Keiro does not return a per-result date.
 *
 * @param body - the parsed search response body.
 * @returns a normalized result with deduped, snippet-joined sources.
 * @throws {WebError} when the response carries no `results` array.
 */
export function mapKeiroResponse(body) {
  const results = body?.results;
  if (!Array.isArray(results)) {
    throw new WebError("Keiro returned no results array; the response may be unprocessable", "WEB_PROVIDER_ERROR");
  }
  const seen = /* @__PURE__ */ new Set();
  const sources = [];
  for (const item of results) {
    const url = item?.url;
    if (typeof url !== "string" || url.length === 0 || seen.has(url)) continue;
    seen.add(url);
    const source = { url };
    if (typeof item.title === "string" && item.title.length > 0) source.title = item.title;
    if (typeof item.snippet === "string" && item.snippet.length > 0) source.snippet = item.snippet;
    sources.push(source);
  }
  return { sources, truncated: false };
}

/** The Keiro-backed search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
export class KeiroSearchProvider {
  resolveOptions;
  id = KEIRO_PROVIDER_ID;
  /**
   * @param resolveOptions - options for the NEXT operation, snapshotted once at
   * each operation's entry so one search never mixes two settings sections.
   */
  constructor(resolveOptions) {
    this.resolveOptions = resolveOptions;
  }
  /** Cheap local check: key resolvable + parseable endpoint. Never network. */
  available() {
    const options = this.resolveOptions();
    return (
      ((options.apiKey?.length ?? 0) > 0 || options.resolveApiKey !== void 0) &&
      URL.canParse(options.baseURL)
    );
  }
  async search(request, signal) {
    const options = this.resolveOptions();
    const apiKey = await this.apiKey(options, signal);
    throwIfSearchAborted(signal);
    const endpoint = `${options.baseURL}/api/v2/search/fast`;
    // Keiro v2 reads the key from the Authorization header (body apiKey is
    // ignored); `maxResults` is applied at the request layer as a cost/latency
    // optimization — the seam enforces the bound regardless.
    const body = {
      query: request.query,
      ...(request.maxResults !== void 0 ? { maxResults: request.maxResults } : {})
    };
    options.recordRequest?.({ endpoint, body });
    throwIfSearchAborted(signal);
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          accept: "application/json",
          "user-agent": USER_AGENT
        },
        body: JSON.stringify(body),
        ...(signal !== void 0 ? { signal } : {})
      });
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
      throw new WebError(`Keiro search request failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
    }
    if (!response.ok) {
      let message = `Keiro API error (HTTP ${response.status})`;
      try {
        const parsed = await response.json();
        const detail = parsed?.message ?? parsed?.error;
        if (typeof detail === "string" && detail.length > 0) message = detail;
        else if (detail && typeof detail === "object" && typeof detail.message === "string") message = detail.message;
      } catch (error) {
        if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
      }
      throw new WebError(message, "WEB_PROVIDER_ERROR");
    }
    try {
      return mapKeiroResponse(await response.json());
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
      if (error instanceof WebError) throw error;
      throw new WebError(`Keiro returned an unprocessable response body: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
    }
  }
  /**
   * Resolve one operation's credential without retaining it on the provider.
   * @param options - the caller's snapshot.
   * @param signal - abort signal for the surrounding search.
   * @returns the resolved key.
   */
  async apiKey(options, signal) {
    throwIfSearchAborted(signal);
    if (options.apiKey !== void 0 && options.apiKey.length > 0) return options.apiKey;
    let resolved;
    try {
      resolved = await abortable(options.resolveApiKey?.() ?? Promise.resolve(void 0), signal);
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
      throw new WebError(`Keiro search credential resolution failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
    }
    if (resolved !== void 0 && resolved.length > 0) return resolved;
    throw new WebError(
      `Keiro search has no API key for "${options.apiKeyEnv ?? "KEIRO_API_KEY"}"; store it through the credentials service, export it in the launching environment, or set a literal "apiKey" in the keiro-web-search config`,
      "WEB_PROVIDER_CREDENTIAL_MISSING"
    );
  }
}

/** Stable id this provider registers under. */
export const KEIRO_PROVIDER_ID = "keiro";

/** Default endpoint base; `/api/v2/search/fast` is appended. */
export const KEIRO_DEFAULT_BASE_URL = "https://kierolabs.space";

/**
 * Race a same-process asynchronous preflight against caller cancellation.
 */
function abortable(operation, signal) {
  if (signal === void 0) return operation;
  if (signal.aborted) return Promise.reject(searchAborted(signal));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(searchAborted(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(new Error(String(error).replace(/^Error: /u, ""), { cause: error }));
      }
    );
  });
}

/** Throw the provider's stable cancellation error when the caller already aborted. */
function throwIfSearchAborted(signal) {
  if (signal?.aborted === true) throw searchAborted(signal);
}

/** Build the provider's stable cancellation error while retaining the caller's reason. */
function searchAborted(signal, fallback) {
  return new WebError("Keiro search aborted", "WEB_ABORTED", {
    cause: signal?.aborted === true ? signal.reason : fallback
  });
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error) {
  return error instanceof DOMException && error.name === "AbortError";
}
