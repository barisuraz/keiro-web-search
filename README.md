# @barisuraz/keiro-web-search

A [Keiro / KeiroLabs](https://www.keirolabs.cloud/)-backed `WebSearchProvider` for
the DeepSeek Harness web capability seam (`ctx.web`). It calls Keiro's dedicated
search endpoint (`POST {baseURL}/api/v2/search/fast`) and maps the structured
`results[]` into the seam's normalized `WebSearchResult`.

This is an **implementation** package: it registers a provider into `ctx.web`,
resolves its credential per search through the optional `ctx.credentials` seam,
records the auxiliary request in the initiating Agent session when one exists,
and does **not** register a model-facing tool. It is a DSH **provider plugin**
(same class as `@deepseek-ai/dsh-web-search-deepseek`), not a profile bundle.

## Install

Distributed from GitHub (no npm registry). Install directly from the repo into
your profile:

```bash
# pnpm resolves the public repo via git+https; dsh plugin forwards to pnpm.
dsh plugin --profile web add https://github.com/barisuraz/keiro-web-search.git
```

> The plugin's entry is `src/` (no build step), so a git install works
> directly; a later `dsh plugin --profile web update` pulls new commits.

Then add this to the profile's `cordis.patch.yml` (`$DSH_HOME/profiles/web/cordis.patch.yml`):

```yaml
# Register the Keiro provider.
- id: keiro-web-search
  name: '@barisuraz/keiro-web-search'
  config:
    apiKeyEnv: KEIRO_API_KEY
    baseURL: https://kierolabs.space

# Route the web_search capability through Keiro (replaces the whole `web` row
# config; DeepSeek stays installed as a fallback if you switch back).
- id: web
  config:
    searchProvider: keiro
```

Store the key in the managed credentials document (`$DSH_HOME/.credentials.yaml`)
or export it in the launching environment:

```yaml
# ~/.dsh/.credentials.yaml
KEIRO_API_KEY: keiro_...
```

Restart the profile (`dsh web`) so the loader imports the new module.

## Config

| Key | Default | Meaning |
|---|---|---|
| `apiKey` | omitted | Literal Keiro API key. Prefer `apiKeyEnv` so no secret enters configuration; a non-empty literal wins. |
| `apiKeyEnv` | `KEIRO_API_KEY` | Credential reference resolved for each search through `ctx.credentials`, or from the process environment when that seam is absent. A missing value fails as `WEB_PROVIDER_CREDENTIAL_MISSING`. |
| `baseURL` | `https://kierolabs.space` | Endpoint base; `/api/v2/search/fast` is appended. Falls back to `$KEIRO_BASE_URL` from any environment layer. |

`apiKey` carries `role('secret')`, so it never rides a `describe()` response.
The section is projected per call, so a changed endpoint or key reaches the next
search without re-registering (no selection flicker).

## How it differs from the DeepSeek provider

Keiro exposes a dedicated search endpoint, so one search is a plain HTTP call —
no model turn, no generated prose. The API key travels in the
`Authorization: Bearer` **header** (the v2 endpoint rejects body-only `apiKey`
auth; the body field is ignored).

## Mapping

Keiro returns `results[]` items with `title`, `url`, `snippet`, `position`,
`score` (plus envelope fields `count`, `creditsRemaining`, etc.). The provider
maps `url`, `title`, `snippet` into `WebSearchSource` and omits `publishedAt`
(Keiro returns no per-result date) and `content` (Keiro returns no
provider-generated answer from `/search/fast`). Results are deduplicated by URL.
The provider forwards the seam's `maxResults` as the v2 `maxResults` parameter
(a cost/latency optimization); the seam still truncates `sources[]` and sets
`truncated` when a provider over-returns.

| Keiro field | Seam source |
|---|---|
| `url` | `url` (required) |
| `title` | `title` |
| `snippet` | `snippet` |
| `position` / `score` | ignored |
| `publishedAt` | absent |

Provider failures become `WEB_PROVIDER_ERROR`; caller cancellation becomes
`WEB_ABORTED`. HTTP redirects are rejected before the `Location` target is
contacted and surface as `WEB_PROVIDER_ERROR`.

## Request logging

Immediately before dispatch, a search running under an initiating Agent appends
the log-only `web/keiro-search-request` session event containing the resolved
endpoint and the exact API-key-free JSON body (the key is redacted, so no secret
enters the log).

## Testing out-of-band

```bash
curl -s "https://kierolabs.space/api/v2/search/fast" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer API_KEY" \
  -d '{"query":"APT29 threat actor","maxResults":5}'
```

Response: `{"query":"...","results":[{"title":"...","url":"...","snippet":"...","position":1,"score":1}, ...], "count":..., "creditsRemaining":...}`.
