/**
 * Register a Keiro (KeiroLabs) search provider in `ctx.web`.
 *
 * Keiro speaks a dedicated search endpoint (`POST {baseURL}/api/v2/search/fast`)
 * and reads the API key from the `Authorization: Bearer` header. Unlike the
 * DeepSeek provider, no model turn is involved, so a search is a plain HTTP call.
 *
 * @module keiro-web-search
 */
import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { KeiroSearchProvider, KEIRO_DEFAULT_BASE_URL } from "./provider.js";

/** Cordis plugin name used by loader diagnostics. */
export const name = "keiro-web-search";
/** The web seam this provider registers into. */
export const inject = ["web"];

const DEFAULT_API_KEY_ENV = "KEIRO_API_KEY";

/** Normalize the base URL (optional trailing slash before appending `/api/v2/search/fast`). */
function normalizeBase(raw) {
  return String(raw ?? "").replace(/\/+$/, "");
}

export const Config = z.object({
  /** Literal Keiro API key; a non-empty literal wins over `apiKeyEnv`. */
  apiKey: z.string().role("secret"),
  /** Credential reference; resolved per search through `ctx.credentials`. */
  apiKeyEnv: z.string().role("credential-ref").default(DEFAULT_API_KEY_ENV),
  /** Endpoint base; `/api/v2/search/fast` is appended. */
  baseURL: z.string()
});

/** Settings namespace carrying this provider's endpoint and key reference. */
export const KEIRO_WEB_SEARCH_SETTINGS_NAMESPACE = settingsNamespace("keiro-web-search");

/**
 * Project one resolved section into the options the provider serves its next
 * search with. Environment fallbacks stay here rather than in the provider.
 */
function resolveOptions(ctx, config) {
  const apiKeyEnv = credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV);
  const literalApiKey = config.apiKey !== void 0 && config.apiKey.length > 0 ? config.apiKey : void 0;
  return {
    ...(literalApiKey === void 0 ? {} : { apiKey: literalApiKey }),
    resolveApiKey: async () => {
      const credentials = ctx.get("credentials");
      if (credentials !== void 0) return (await credentials.resolve(apiKeyEnv))?.value;
      const ambient = launchEnvironmentOf(ctx).get(apiKeyEnv);
      return ambient !== void 0 && ambient.value.length > 0 ? ambient.value : void 0;
    },
    apiKeyEnv,
    baseURL: normalizeBase(
      config.baseURL ??
        launchEnvironmentOf(ctx).get("KEIRO_BASE_URL")?.value ??
        KEIRO_DEFAULT_BASE_URL
    ),
    recordRequest: (request) => {
      ctx.get("agents")?.currentInitiator()?.session.append("web/keiro-search-request", request);
    }
  };
}

/** Register the Keiro search provider with `ctx.web`. */
export function apply(ctx, config) {
  let current = () => config;
  installSettingsSection(ctx, KEIRO_WEB_SEARCH_SETTINGS_NAMESPACE, Config, config, {
    setSource: (source) => {
      current = source;
    },
    onChange: () => {}
  });
  ctx.web.registerSearchProvider(new KeiroSearchProvider(() => resolveOptions(ctx, current())));
}
