# Sol V2: Reconciliation After Fable's Rust Counter-Review

**Reviewed:** 2026-07-13

**Inputs:** [`sol.md`](./sol.md), [`fable.md`](./fable.md), the current CLI, `EventTypeMap`, the ws-server handshake, and the original single-operator plan

## Revised Verdict

Fable identifies two material problems in my first assessment:

1. I treated a shared-contract cleanup as an ordinary Rust milestone when it must be an independently reviewed contract change.
2. I described Rust as lower risk overall when the honest claim is that it trades the current coordination risks for generator, portability, and migration risks.

I accept both corrections.

I do not accept the conclusion that Rust should wait for an external user or that the production generator should initially omit asset, image, and TTS events. Those conditions conflict with the stated product and protocol decisions: this is a sovereign CLI for its operator, `EventTypeMap` is the absolute event authority, and the non-chat domains are intended CLI capabilities.

The refined recommendation is:

- Rust remains the recommended target architecture.
- Contract analysis, type generation, and headless transport are approved discovery work with independent value.
- Shared DTO narrowing is a separate approval gate, not bundled into the Rust work.
- Ratatui is a candidate that must pass a focused terminal spike before the full TUI is authorized.
- Cutover is gated on technical parity and operator acceptance, not an arbitrary external-user count.
- Login is a parallel launch requirement only if the product scope changes from the documented single-operator CLI to coworker distribution.

This is a staged commitment to a target, not an unconditional commitment to complete every phase regardless of evidence.

## Concessions to Fable

### 1. The language was too categorical

My statement that TypeScript is "no longer the lowest-risk foundation" was broader than the evidence supports. The observed facts establish a ceiling in the current `readline` plus raw-picker architecture, not a ceiling in TypeScript itself.

TypeScript could support a mature terminal client with a different input/rendering framework and an explicit reducer. Reaching that point would still require a substantial terminal-architecture change, but Rust is not the only language capable of it.

The corrected decision basis is:

- the desired client needs a stateful terminal kernel and local-agent runtime;
- the operator prefers Rust and is already competent with it;
- a standalone native client and Rust's state/concurrency model are good fits;
- a rewrite is justified only if the generator, transport, and terminal spikes validate those benefits.

Rust moves risk. It does not erase it.

### 2. Contract cleanup must be removed from R1

Fable's strongest criticism is correct. `HydrateConversationPage.convo` and `AIChatResponse.convo` currently expose `ConversationSingleton<true>`, a broad recursive Prisma-derived type. My first plan prescribed narrowing those members inside R1.

That is the wrong ownership boundary. `packages/types/src/events.ts` is deployed shared contract code consumed by web, web-next, ws-server, and CLI. Even a type-only narrowing that leaves runtime JSON unchanged can reveal or break consumer assumptions. It must not arrive as incidental support work in a CLI pull request.

The replacement sequence is:

1. Run a read-only contract graph audit from `EventTypeMap`.
2. Report recursive expansions, unsupported wire types, and declared-vs-observed payload mismatches.
3. Determine whether the generator can represent the existing authority precisely without changing it.
4. If not, propose exact wire DTOs in a separate architecture note and separate pull request.
5. Require explicit operator approval and green checks for every current consumer before the generator depends on the new DTOs.

The audit may prove the cleanup necessary, but it does not have license to perform it.

### 3. Ratatui needs its own proof gate

Fable is right that Ratatui is the largest visual and portability commitment in the plan. Inline viewport support is promising, but documentation is not a substitute for running the exact interaction model under WSL2, tmux, SSH, macOS terminals, narrow widths, Unicode, paste, resize, panic, and signals.

Ratatui should therefore move from "settled framework" to "preferred candidate pending spike." The spike must be disposable and must not depend on the real ws-server. It should demonstrate:

- an inline transcript above a stable active viewport;
- a streaming message, status line, multiline composer, and filtered popup;
- bracketed paste and burst input through one Crossterm event stream;
- resize without lost prompt state;
- clean normal, error, panic, and Ctrl+C restoration;
- no corrupted shell scrollback after exit;
- terminal-buffer snapshots plus real PTY smoke tests.

If that prototype fails, do not rationalize the failure. Re-evaluate a smaller Rust terminal layer or a TypeScript framework before building R3.

### 4. Login deserves an explicit parallel track when distribution is real

Fable correctly notes that a binary cannot be handed to another user while authentication is a hardcoded user ID plus an existing browser-created session. If coworker distribution is now a product objective, login/onboarding is a launch gate regardless of implementation language.

It is not yet safe to call that work "small" or assume it automatically ports. The current CLI only opens a login URL and tells the operator to refresh an existing session ([config.ts](../../../packages/cli/src/config.ts#L20)). There is no `aic` command, device flow, callback listener, credential artifact, or secure storage contract in this repository. The original plan explicitly defines the CLI as Andrew-only and login as a non-goal ([fable-5-plan.md](../fable-5-plan.md#L21)).

If scope changes, the auth track should begin by defining:

- what the browser or server returns to the CLI;
- whether the durable identity is user ID, session ID, token, cookie, or a new CLI credential;
- expiry and refresh behavior;
- storage location and permissions;
- logout/revocation;
- the format both TypeScript and Rust clients can read.

The current TypeScript CLI is a reasonable place to prove that flow. It can proceed in parallel with the contract audit and generator. It is not a reason to block single-operator Rust exploration.

### 5. A blanket TypeScript feature freeze is premature

The existing CLI is the daily driver and should continue receiving observed bug fixes and high-value operator UX work while C0-R2 run. A blanket freeze before the Rust assumptions are proven would make the operator pay for an experiment.

Once R3 is approved and parity work begins, feature duplication becomes a real cost. At that point new interactive features should normally target Rust, while TypeScript receives critical fixes until cutover.

## Where Fable's Counterargument Overreaches

### 1. The terminal cost is not purely hypothetical

I accept that split escape sequences, wide-character erasure, and resize corruption have not been reproduced as live failures. They should have been labeled latent boundary risks, not existing incidents.

Fable goes too far by treating the lack of terminal corruption as a refutation. The user-visible `/convo Expan` expectation required the current implementation to coordinate:

- promise `readline`;
- a separate keypress listener;
- forced prompt submission;
- raw stdin ownership in the picker;
- buffered "stray" character harvesting;
- manual ANSI erasure and restoration.

Those are present in [repl.ts](../../../packages/cli/src/repl.ts#L74), [repl.ts](../../../packages/cli/src/repl.ts#L145), and [convo-picker.ts](../../../packages/cli/src/convo-picker.ts#L153). The burst/paste race is documented in the production code itself. This is observed implementation complexity created by a required interaction, even if every theoretical failure has not yet appeared.

The Gemini dropped-text bug does prove that domain rendering defects can be fixed cheaply in TypeScript. It does not refute the terminal-ownership argument because it was a different bug in a different layer.

The refined claim is narrow: the current terminal architecture is a poor base for adding a multiline composer, simultaneous streaming/status, overlays, image placement, cancellation, resize, and future tool approvals. That claim is testable in the Ratatui spike.

### 2. Fable conflates the append-only transcript with the whole terminal

The current message renderer is append-only and has valuable properties. It should remain logically append-only for finalized transcript entries.

The CLI as a whole already owns and repaints screen regions. `CliConvoPicker.clear()` moves the cursor and erases everything below it, while the REPL pauses and resumes a separate reader. Therefore the statement that the current architecture "structurally cannot" have repaint or screen-ownership bugs is false for the actual product; it is true only for `render.ts` in isolation.

The proposed Ratatui design is hybrid, not a full-screen replacement of the transcript doctrine:

- finalized transcript content remains immutable and is inserted above the active viewport;
- only the active stream, composer, status, and overlay are redrawn;
- normal shell scrollback remains visible in inline mode;
- alternate-screen ownership is not required for parity.

Fable is still right that this hybrid must be proven across real terminals. The answer is a hard spike gate, not pretending that no screen manager will be needed for the requested UX.

### 3. The distribution premise is not established by the recorded plan

Fable makes "someone beyond Andrew wants it" a prerequisite for the TUI. That is a product-management condition, not an engineering invariant, and it contradicts the repository's original scope:

> This CLI is for Andrew and Andrew alone. That's not a v1 limitation - it's the design.

The current request also describes a sovereign CLI "of my own." An external-demand gate would make the operator's own repeated use count for less than a hypothetical coworker's interest. That is not appropriate for this product unless the operator explicitly changes the goal to distribution.

Use these gates instead:

- the headless client proves the protocol and transport;
- the terminal spike proves the interaction model on required environments;
- the operator confirms the resulting UX is worth replacing the TypeScript daily driver;
- parity and restoration tests pass.

If coworker distribution becomes a goal, add login and packaging gates. Do not retroactively make external adoption the justification for a sovereign tool.

### 4. A partial production event generator violates an explicit requirement

Fable recommends generating only chat, conversation, hydration, and provider events in phase 1. That conflicts with two explicit operator decisions:

- `EventTypeMap` is the absolute authority and consumers should be aware of all registered types.
- asset, image, and TTS capabilities are not intended to remain web-only.

A subset can be the first internal test fixture while implementing the generator, but it cannot be the accepted R1 output. A production `WireEvent` that knows only part of `EventTypeMap` recreates a manual allowlist at the language boundary and permits drift in precisely the domains expected next.

Generating all domains does increase the spike's workload. That is useful evidence: the point of the spike is to determine whether this hand-rolled approach can represent the actual authority, not an easy subset.

Fable also overstates that every non-chat domain requires the same DTO surgery. The current TTS events are small scalar payloads ([events.ts](../../../packages/types/src/events.ts#L773)); image response/progress events are ordinary nested JSON structures ([events.ts](../../../packages/types/src/events.ts#L669)); and asset events primarily exercise intersections, expiry helpers, literal unions, and metadata ([events.ts](../../../packages/types/src/events.ts#L233)). The known recursive Prisma graph is in the chat/hydration conversation payloads. Non-chat domains widen generator coverage, but deferring them does not remove that central blocker.

The practical compromise is implementation order, not contract scope:

1. prove primitives, unions, intersections, and discriminants with chat/control fixtures;
2. add conversation graph reporting without changing shared types;
3. add asset/image/TTS fixtures and mappings;
4. call R1 complete only when every `keyof EventTypeMap` member is generated.

### 5. "Claude Code is TypeScript" is not a reliable current premise

Even if Claude Code historically demonstrated that TypeScript can power an excellent agentic CLI, that proves capability, not that this repository's current terminal architecture is the best fit.

More importantly, Fable states the current implementation language as a verified fact while the public official repository does not expose the full product source. As of this review, Anthropic's official repository says npm installation is deprecated and directs users to native installation; current release reports also show platform-specific native binaries ([official repository](https://github.com/anthropics/claude-code), [official setup documentation](https://docs.anthropic.com/en/docs/claude-code/getting-started)). It is not possible from those sources to assert confidently that the present runtime is a TypeScript program merely because an npm distribution existed.

The fair conclusion is language-neutral: both native and TypeScript terminal agents can reach the caliber target. Slipstream should choose based on its ownership, protocol, local-tool, and maintenance constraints.

### 6. Starting only with the local-agent runtime creates a different integration risk

Rust is well suited to path containment, process supervision, patching, and sandbox policy. Fable is right that this is high-value Rust work with no mature incumbent in the CLI.

Starting there before proving the native protocol boundary would create a TypeScript UI plus Rust sidecar and require a second local IPC contract while the websocket contract remains TypeScript-only. That can be a valid architecture, but it is not automatically lower risk.

The better option is to prove the generator and headless Rust client first. After R2, read-only local tools can begin before the TUI if desired because they can live in the same Rust core and use the same app event/effect model. This captures the learning and new-capability value without committing to a permanent two-runtime product.

## Worktree Finding: General-Purpose Schema Codegen Is Not the Agreed Path

The current uncommitted worktree adds `ts-json-schema-generator` to:

- `packages/types/package.json`;
- `pnpm-workspace.yaml`;
- `pnpm-lock.yaml`.

It also pulls a second TypeScript version (5.9.3 alongside the workspace's 6.0.3) plus its own CLI/dependency chain. I did not modify or remove these parallel changes.

That dependency conflicts with the operator's explicit request for a hand-rolled solution and with both review documents' agreement that the generator should use the existing TypeScript compiler API directly. A JSON Schema intermediary also loses useful TypeScript checker context and introduces exactly the generalized codegen layer being avoided.

It may be a disposable experiment, but it must not become the implementation dependency or plan of record without a new explicit decision. The approved spike should use the workspace `typescript` package and a small internal IR.

## Revised Sequence

### C0: Read-only contract audit

Build the smallest compiler-API program that:

- resolves exported `EventTypeMap` through the real package tsconfig;
- enumerates every event key without a copied list;
- walks the reachable type graph;
- reports cycles, broad ORM graph expansion, `Date`, `bigint`, `unknown`, unresolved conditionals, and unsupported constructs;
- emits a deterministic audit report, not Rust and not contract edits.

**Exit:** The operator can see exactly which shared types block precise generation before approving any contract surgery.

### C1: Separate contract decision, only if C0 requires it

Propose exact wire DTOs and actual runtime frame fixtures in their own document and pull request. Keep event names and runtime payloads unchanged. Require explicit approval and all TypeScript consumers green.

**Exit:** Shared contract types describe actual JSON, or the operator deliberately accepts generation of the existing broader graph.

### R1: Complete generator

Implement the hand-rolled TypeChecker-to-IR-to-Rust emitter. Build it incrementally, but finish with every `EventTypeMap` member in the generated tagged enum. Add cross-language fixtures and a drift check.

**Exit:** No handwritten event list, no schema-codegen dependency, all event domains compile and round-trip, unsupported additions fail visibly.

### R2: Headless native client

Implement custom-header authentication, provider context, conversation indexing, hydration, chat streaming/finalization, explicit reconnect state, and intentional shutdown against fake and real servers.

**Exit:** Existing server flow is sufficient, no chat event changes are needed, and unsafe replay is eliminated.

### D1: Product and terminal decision

At this point decide independently:

- Is the product still single-operator, or is coworker distribution now a goal?
- Is the Rust headless core good enough to continue?
- Does a disposable Ratatui inline prototype pass the required terminal matrix?
- Does the operator prefer the prototype to continued investment in the TypeScript client?

If distribution is in scope, run the auth/onboarding track before release. It need not block C0-R2.

### R3: Interactive Rust client, conditional on D1

Build the full reducer, composer, transcript, pickers, cancellation, and rendering only after the terminal spike passes. Preserve the TypeScript client as fallback through parity and soak.

### R4+: Cutover, multimodal, and tools

Cut over after technical parity and daily-driver acceptance. Generate multimodal types in R1, then implement their UI deliberately. Read-only local tools may start after R2 and can run before or alongside R3; write/shell capabilities retain their own approval and sandbox gates.

## Final Assessment

Fable improves the plan by forcing the shared contract and Ratatui decisions into the open. Those amendments should be adopted. My first document should be read as the target architecture, not authorization to perform every phase immediately.

Fable does not establish that the current terminal design is sufficient for the requested future UX, that login is a prerequisite for a documented single-operator tool, or that a partial event generator honors the operator's protocol decision. Those parts should not be adopted.

Proceed with C0, then make the contract decision with evidence. If approved, complete R1 across the full `EventTypeMap` and build R2 headlessly. Treat Ratatui and cutover as separate evidence-based decisions after that. This preserves the working CLI, protects the production contract, and still moves decisively toward the Rust architecture rather than postponing it behind an unrelated external-adoption threshold.
