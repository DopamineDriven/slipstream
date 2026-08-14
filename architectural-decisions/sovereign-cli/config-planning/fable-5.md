# Sovereign CLI — Config & Settings: Preliminary Findings / Outlook

> fable-5, 2026-07-28. Status: PLANNING — nothing here is built. Companion
> to `sovereign-cli/local-tool-bridge.md` (as-built) and the CONTINUITY
> docs. The thesis driving this: if anything gets monetized, it's the CLI —
> provider-agnostic seamless switching + HMEM is the product; the web
> platform is the storefront. Config, then auth, are the load-bearing
> prerequisites for that.

## 0. Position (TL;DR)

Two planes, split by what the setting is ABOUT:

- **Machine plane** — a local file (`~/.config/aic/config.json`). Settings
  about THIS machine/terminal: default `--env`, markdown rendering,
  workspace arming overrides. Works offline, zero auth, Claude Code
  `settings.json` parity. Ships first, alone, with no schema work.
- **Identity plane** — dedicated CLI tables in pg, **server-mediated over
  the socket the CLI already authenticates**. Settings about the USER that
  should roam across machines: default model/provider, showThinking,
  (later) entitlements.

**Recommendation: no `pg` dependency in `packages/cli`.** Andrew offered
it ("if that means adding pg to the deps list then so be it") — but direct
pg from the CLI means a `DATABASE_URL` on every user machine, which is a
secret-distribution problem AND a total-authority problem (a raw pg client
has no row-level story; any paying user could read any table). The CLI
already holds an authenticated, typed, reconnecting channel to a server
that owns Prisma, caching, and write-through discipline — config CRUD is
just another event pair on it. Offline degradation is natural: the machine
plane still loads; the identity plane arrives post-handshake like
`providerContext` already does. If a future headless/admin tool truly
needs direct pg, that's a separate ops package, not the user-facing CLI.

**Decision already made (Andrew, 2026-07-28): CLI config lives in its OWN
tables.** Existing config-shaped models (`Settings`,
`ConversationSettings`, `Profile`, `UserKey`) are web-only and stay that
way — even at the cost of more tables. No shared columns, no kind
discriminators bolted onto web models.

## 1. What exists today (inventory)

- `CliConfigService` (dep-free chain base): `wsUrl` (precedence: `--env`
  ctor injection → `SLIPSTREAM_WS_URL` → dev default), `loginUrl`,
  `userId` (`SLIPSTREAM_USER_ID` → Andrew's hardcoded cuid). Explicitly
  documented as single-operator: auth is a constant, not a flow.
- **argv flags**: `--workspace [root]`, `--no-workspace`, `--env dev|prod`,
  `--no-markdown` (+ `NO_COLOR` env). All per-invocation, nothing persists.
- **`ChatSessionState`** (evaporates on exit): roster entry (`/model`),
  `systemPrompt`, `showThinking`. These are the settings users re-type
  every session — the itch this whole plan scratches.
- **`via: "cli" | "web"`** now threads the entire stack (handshake cookie
  → `stashUserData` → `UserData` → resolver → providers → tool catalog).
  The server already knows which client kind is talking.
- **The refresh pattern to mirror**: `connection_established` delivers
  `providerContext` milliseconds post-handshake;
  `provider_context_ping/pong` + `provider_context_update/update_ack` keep
  it fresh. Identity-plane config should ride the exact same lifecycle.
- **Auth today**: `?id=` on the handshake → `getAndValidateUserSessionById`
  against the `Session` table (better-auth managed, web-minted). The CLI
  borrows a browser session; expiry means "go log in via the browser."

## 2. The two-plane split (what goes where)

| Setting | Plane | Why |
| --- | --- | --- |
| default `--env` target | machine | dev on the workstation, prod on the laptop |
| markdown / NO_COLOR / render prefs | machine | terminal-specific |
| workspace auto-arm default, per-repo boundary overrides | machine | path-shaped, machine-local |
| default model/provider (roster alias) | identity | the whole point of seamless switching — follows the user |
| showThinking default | identity | preference, roams |
| HMEM defaults (scope, dual-wield hints) | identity | product behavior, roams |
| BYOK keys | identity — **already solved** (`UserKey` + providerContext) | do not duplicate |
| entitlements / plan flags | identity (server-authoritative, read-only to client) | monetization |

**Precedence (highest wins), one resolver at the composition root:**
`argv flag → env var → machine file → identity config → shipped default`.
Same shape the wsUrl already follows; config generalizes it.

## 3. Wire contract sketch (Phase 2 — needs Andrew's events.ts sign-off)

Two options, not mutually exclusive:

1. **Piggyback**: `connection_established` gains `cliConfig?: CliConfigDTO`
   — populated only when the socket's `via === "cli"` (the server already
   narrows this in `stashUserData`). Zero extra round trips; the REPL has
   its roaming defaults before the first prompt renders.
2. **Event pair for writes**: `cli_config_update` (client → server, partial
   patch of typed knobs) / `cli_config_update_ack` (server → client, full
   canonical DTO back). Mirrors `provider_context_update/update_ack`
   exactly — optimistic local echo, ack reconciles.

`packages/types/src/events.ts` is Andrew's territory — these members land
only with his explicit sign-off, and the runtime parsers stay
satisfies-coupled to `EventTypeMap` per the standing convention.

## 4. Schema sketch (dedicated tables, per the separation decision)

```prisma
enum CliConfigSchemaVersion {
  v1_0
}

model CliConfig {
  id              String            @id @default(cuid(2))
  userId          String            @unique
  user            User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  defaultProvider Provider          @default(ANTHROPIC)
  defaultModel    String            @default("claude-fable-5")
  showThinking    Boolean           @default(true)
  schemaVersion   CliConfigSchemaVersion @default(v1_0)
  createdAt       DateTime               @default(now())
  updatedAt       DateTime               @updatedAt
}
```

Ground rules (Andrew, 2026-07-28):

- **No JSONB, ever** — prisma's `Json` fields are hell in a handbasket.
  Every knob is a typed column; additive knobs land as migrations, not
  blob keys. There is no escape hatch by design.
- **No system prompt exposure** — prompts are not config. Neither a
  `systemPrompt` column nor a preset table; `/system` stays a per-session
  REPL affair (`ChatSessionState`) that evaporates on exit.
- **`defaultProvider` is the `Provider` prisma enum, required**, defaulting
  `ANTHROPIC`; `defaultModel` required, defaulting `"claude-opus-5"`
  (roster alias `opus-5`). The provider↔model pairing is validated at the
  service layer against the roster (a `defaultModel` must belong to
  `defaultProvider`); the DB doesn't try to encode that relation.

Server-side owner: a `CliConfigService` on the ws-server, constructed in
`exe()` like everything else, cache keyed by `userId` with write-through
on update (registry pattern).

## 5. REPL surface (the "config editor")

- **`/config`** — opens a picker (the `CliConvoPicker` ephemeral-class
  precedent; standing preference: picker lists over typed identifiers).
  Rows: `key · current value · plane badge (machine/roaming)`. Selecting a
  row edits it — enum knobs cycle through a sub-picker, free-text knobs
  drop into a readline prompt.
- **Two-stage default-model selection** (Andrew's target UX): editing the
  default opens a PROVIDER list (the fourteen `Provider` members the user
  has access to) which branches into that provider's MODEL list — the
  registry/codegen tables already map both directions
  (`model-ids-by-provider`, `display-names-by-provider`). Same component
  later backs `/model` itself, replacing alias-typing with the branching
  picker.
- **`/config get <key>` / `/config set <key> <value>`** — non-interactive
  lane for scripts and muscle memory.
- Machine-plane writes → atomic rewrite of the local file (`0600`).
  Identity-plane writes → `cli_config_update`, optimistic echo, ack
  reconciles (exactly the BYOK update UX the web already has).
- Tab-completion joins the existing completer (commands + roster aliases +
  convo titles + config keys).
- New chain link: `CliSettingsService` between config and context, or an
  ephemeral `CliConfigEditor` injected at the repl — strict class
  encapsulation either way; no module-level functions.

## 6. Auth outlook (the road the config work paves)

Phased so config never blocks on auth, but auth slots in without rework:

- **Phase A (today, unchanged)**: single-operator constant. `?id=` +
  browser-minted session. `SLIPSTREAM_USER_ID` override for a second user.
- **Phase B — device-code login**: `aic login` prints a short code + opens
  `loginUrl?flow=device`. The web app (already owns better-auth) completes
  the grant and mints a **`CliSession`** row — a NEW table (separation
  decision applies to auth artifacts too; web `Session` stays web's):
  long-lived, revocable, `deviceLabel`, `lastSeenAt`, hashed token. Token
  lands in the machine file with `0600`. The handshake gains
  token-validation for `via: "cli"` sockets; `?id=` derives from the token
  instead of env. Kills the hardcoded cuid.
- **Phase C — entitlements (PARKED, Andrew 2026-07-28)**: not until
  payment rails exist — "that's a whole other can of worms." When the day
  comes: `CliEntitlement` (or plan flags on `CliConfig`) gating roster
  breadth, HMEM depth (`all_conversations` recall as the paid tier?),
  local-tool round budgets. Server-authoritative, delivered read-only in
  the same DTO; the CLI renders state, never enforces it. Until then,
  everything is unlocked for everyone with a session.

The monetization-shaped observation: the thing users would pay for —
one terminal, thirteen providers, persistent cross-conversation memory,
local repo tools — is exactly the surface this config/auth pair unlocks
for someone who isn't Andrew.

## 6.5 API keys on local devices (answer: they aren't)

Claude Code / gh prior art: `PROVIDER_API_KEY` env vars in shell profiles,
OS keychains, 0600 credential files — all because those clients call
providers directly. Slipstream's CLI never does; every request routes
through the ws-server, which already owns BYOK resolution (`UserKey`,
AES-256-GCM, key-scoped `providerContext`). So:

- **Provider keys never persist on the device.** `UserKey` is the single
  vault, shared by web and CLI. The only local secret ever is the Phase-B
  `CliSession` token (machine file, 0600).
- **The CLI gets an INPUT lane, not a storage lane** — and per Andrew
  (2026-07-28) the **ws-server owns it**: cleaner than teaching the CLI to
  call the web app's Next-action lane, and the ws-server already holds the
  cipher key (it decrypts at request time; encrypting is the same
  privilege). Web keeps its Next-action front door; two ingestion fronts,
  one vault, one cipher.
- **Transport**: a raw key riding the WSS frame is byte-for-byte as
  protected as the web's HTTPS POST — WSS IS TLS, terminating at the same
  ALB. The wire was never the risk.
- **Client-side encryption, decided (2026-07-28)**: encrypting in the CLI
  with `@slipstream/encryption` (AES-256-GCM) is REJECTED for the product
  era — symmetric means the CLI must hold the vault's master
  `ENCRYPTION_KEY`, i.e. every install ships the key that decrypts every
  user's rows; fine single-operator, fatal at scale, and inside TLS it
  defeats no attacker the TLS didn't already defeat. If
  encrypted-inside-TLS is ever wanted, the correct shape is the
  **sealed-box** variant: the server publishes a PUBLIC key (it could ride
  `connection_established`), the CLI encrypts against it, only the
  server's private key opens it — nothing secret ships in the client.
  Optional hardening, not v1.
- **The operational disciplines are the actual safety** (the risks live in
  process memory and logs, not the wire):
  1. `sendVolatile` ONLY — a raw-key frame must never enter the reconnect
     queue where it could sit in memory and replay later.
  2. Dedicated event pair (`cli_user_key_set` / `_ack` — events.ts
     sign-off) that is structurally excluded from payload logging: the
     resolver logs `{ provider }` and nothing else, no
     `JSON.stringify(event)` on any error path, ever.
  3. Server side: validate (key-validator), encrypt immediately, upsert
     `UserKey`, ack with refreshed `providerContext`; the raw key never
     enters a cache, registry, or log line.
  4. Client side: masked readline prompt, excluded from REPL history;
     `PROVIDER_API_KEY` env notation honored as a read-once input default,
     never written to any aic file.

## 7. Phasing (each ships alone, green, useful)

1. **Machine file + `/config` editor** — no schema, no events.ts, no auth.
   Loader + precedence resolver at the composition root; picker + get/set;
   persists env/markdown/workspace/default-alias locally. Immediate QoL.
2. **Identity plane** — `CliConfig` migration; ws-server
   `CliConfigService` in `exe()`; `connection_established` piggyback +
   update/ack pair (events.ts sign-off); `/config` rows grow their roaming
   badge; machine file keeps working offline.
3. **Device-code auth** — `CliSession` table, `aic login`, token handshake
   lane, revocation UI on the web (list of device labels).
4. **The branching picker** — the provider → model two-stage selector
   lands on `/config` and `/model` alike. (Entitlements/plan flags stay
   PARKED behind payment rails — see §6 Phase C.)

## 8. Open questions for Andrew

1. Piggyback on `connection_established` vs a dedicated
   `cli_config_get/ack` pair — piggyback is zero-RTT and my lean, but it
   grows a frame you own. Both?
2. Which knobs make identity-plane v1? My cut after the ground rules:
   defaultProvider + defaultModel + showThinking, nothing else.
   (Temperature/topP get no knob anywhere: `ConversationSettings` is
   essentially a dead table (Andrew, 2026-07-28 — top_p etc. never
   actually used or exposed), and its premise was wrong on its own terms —
   if sampling params were ever active they'd be per-MODEL, not per-convo,
   since a conversation cycles through many models and valid top_p ranges
   vary by model. Don't cite it as precedent, don't replicate the mistake
   CLI-side. HMEM scope stays model-instructed unless it proves itself as
   a knob — if it ever does, it becomes a prisma enum column, never a
   string.)
3. Device flow lands on `apps/web` or proves out on `web-next` first?
4. Machine file format: JSON (parse with the `JSON.parse<T>` augmentation)
   vs JSONC? Plain JSON is my lean — no comment-stripping dependency.
5. Should the branching provider→model picker gate on the user's
   providerContext (`isSet` — only list providers with a working key lane)
   or show the full fourteen with locked badges? The locked-badge version
   doubles as the entitlements surface later.
