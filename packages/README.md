# Shared packages

| Package | What it is |
|---|---|
| `provider-sdk` | The provider platform framework. No runtime dependencies; runs in Node, in a page, in an edge function |
| `providers` | The provider pack: first-party modules, rule packs, domain configs, and the adapter for the vendored fallback pack |
| `client` | Client side of the platform: bridge protocol, registry client, unified resolver |
| `content` | Category adapters (anime, sports, regional discovery) |
| `control-plane` | `charcoal-registry`: the registry as files, with history, audit and signing |
| `streamviva` | Vendored fallback engine (MIT) |

Start at `docs/platform/ARCHITECTURE.md`.
