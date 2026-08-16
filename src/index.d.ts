import type { Context } from "@deepseek-ai/cordis";
import type { SettingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";
export { KeiroSearchProvider, KEIRO_DEFAULT_BASE_URL, KEIRO_PROVIDER_ID } from "./provider.js";
export type { KeiroSearchProviderOptions, KeiroSearchRequest } from "./provider.js";

/** Cordis plugin name used by loader diagnostics. */
export declare const name = "keiro-web-search";
/** The web seam this provider registers into. */
export declare const inject: readonly ["web"];

/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
  /** Literal Keiro API key; prefer {@link apiKeyEnv} so no secret enters configuration files. */
  apiKey?: string;
  /** Credential reference resolved for each search; defaults to `KEIRO_API_KEY`. */
  apiKeyEnv?: string;
  /** Endpoint base; `/api/v2/search/fast` is appended. Falls back to `$KEIRO_BASE_URL`. */
  baseURL?: string;
}

export declare const Config: z<{
  apiKey?: string;
  apiKeyEnv?: string;
  baseURL?: string;
}>;

export declare const KEIRO_WEB_SEARCH_SETTINGS_NAMESPACE: SettingsNamespace;

export declare function apply(ctx: Context, config: Config): void;
