import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from "@deepseek-ai/dsh-web";
import type { CredentialRef } from "@deepseek-ai/dsh-credentials";

/** Stable id this provider registers under. */
export declare const KEIRO_PROVIDER_ID = "keiro";
/** Default endpoint base; `/api/v2/search/fast` is appended. */
export declare const KEIRO_DEFAULT_BASE_URL = "https://kierolabs.space";

/** Exact secret-free Keiro search request recorded immediately before dispatch. */
export interface KeiroSearchRequest {
  readonly endpoint: string;
  readonly body: {
    readonly query: string;
    readonly maxResults?: number;
  };
}
declare module "@deepseek-ai/dsh-session/types" {
  interface SessionEventMap {
    "web/keiro-search-request": KeiroSearchRequest;
  }
}

/** Resolved provider options (the plugin's `apply` supplies credential and constant defaults). */
export interface KeiroSearchProviderOptions {
  apiKey?: string;
  resolveApiKey?: () => Promise<string | undefined>;
  apiKeyEnv?: CredentialRef;
  baseURL: string;
  recordRequest?: (request: KeiroSearchRequest) => void;
}

/** Map a Keiro `POST /api/v2/search/fast` response body to a normalized result. */
export declare function mapKeiroResponse(body: any): WebSearchResult;

/** The Keiro-backed search provider; redirects fail as `WEB_PROVIDER_ERROR`. */
export declare class KeiroSearchProvider implements WebSearchProvider {
  private readonly resolveOptions;
  readonly id = "keiro";
  constructor(resolveOptions: () => KeiroSearchProviderOptions);
  available(): boolean;
  search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
  private apiKey;
}
