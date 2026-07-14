# Counter-Review: The Rust Rewrite Plan

**Author:** Claude Fable 5
**Reviewed:** 2026-07-13
**Subject:** [`sol.md`](./sol.md) — "Pragmatic Rust Rewrite of the Sovereign CLI," status *Recommended plan of record*
**Posture:** This is the requested critique / counter-argument. I agree with the *destination* and contest the *timing, scope, and the "plan of record" framing*. Where I push back, it is reasoned disagreement, not contrarianism — I converged with Andrew earlier this week that Rust is the right *eventual* home once distribution is real. Sol's plan is more aggressive than that conclusion, and the gap is worth arguing in the open before anyone writes `Cargo.toml` for real.

All factual claims below were re-verified against the tree on 2026-07-13.

## Verdict

Sol's document is the best-argued case for the rewrite that exists, and its engineering instincts are almost all correct. But as a *plan of record* it has three problems: (1) its core justification — that TS has hit a reliability ceiling — is asserted from *hypothetical* fragilities, not observed bugs; (2) it buries a prod-web-shared contract refactor inside a sub-bullet of "R1," the exact surgery Andrew has been most protective of; and (3) it commits now to the expensive, irreversible part (the Ratatui TUI + cutover) whose justification is weakest, while the thing actually gating distribution (`aic login`) goes unbuilt in either language. My counter is not "don't." It's "do R1–R2 as de-risking spikes with independent value, gate R3+ on real distribution demand, and don't touch the shared contract without treating it as its own reviewed change."

## What Sol gets right (and I won't relitigate)

These are correct, and the rewrite — if it happens — must carry them:

- **The state-machine argument is the plan's strongest point.** The coordination flags this session accreted — `pickerOpen`, `awaitingLine`, `pickerRequest` — are real, and Rust enums making illegal states unrepresentable (an attach-ack can only commit while `Attaching`) is a genuine, not cosmetic, win. This is the one place where the language change buys something the TS couldn't cheaply buy back.
- **The blind outbound queue is a latent correctness bug.** The transport flushes arbitrary queued frames on reconnect; a chat prompt caught mid-send *can* double-fire a turn. "The app owns semantic recovery, the transport does not replay" is the right model, and it's true regardless of language.
- **Generate-from-`EventTypeMap`, don't hand-mirror.** If you go Rust, a compiler-API generator off the authoritative type is the *only* drift-safe answer. Hand-maintaining a parallel Rust event mirror would reintroduce the exact drift `@slipstream/types` exists to kill. Credit — this is the correct mechanism.
- **Single terminal owner; earn the TUI through headless parity (R1→R2→R3).** Disciplined ordering. The `strip_prefix(previous)` UTF-8 porting trap (JS UTF-16 offsets vs Rust byte boundaries) is a sharp, correct catch that would have caused a panic on the first multibyte stream.
- **The concrete findings are all real.** Verified: the `./renderer` export points at `dist/renderer.js` while the build emits `dist/render.js` (a genuinely broken published subpath); the drain gate sends `user_tts_error` to *every* inbound event regardless of kind; the cookie metadata is built and never sent. Good catches, all fixable independently of any rewrite.

I'm not damning with faint praise here — roughly 70% of this plan is what I'd write too. The disagreement is about the 30% that decides whether this is churn.

## The counter-argument

### 1. The motivating pain is hypothetical, and the one real bug refutes the thesis

Sol's decision rests on: *"terminal ownership, event decoding, reconnect behavior, and UI state are more expensive to make reliable than the feature code itself."* But look at the evidence offered for the terminal "ceiling" (§1): split escape sequences, coalesced keypresses, wide-char repaint desync. Every one is prefixed with *can* — they are failure modes the byte-chunk picker is *theoretically* vulnerable to. **None has been observed as a live bug.** Sol even concedes the picker "correctly fixed the product problem."

Meanwhile the *actual* live bug this session — dropped text on the opus→gemini switch — was **not** a terminal-ownership failure. It was a render heuristic reading the wrong field, and it was fixed in TypeScript in one commit (`8d78338`) with 8 tests. The empirical record says the current architecture's real defects are cheap to fix in place. A rewrite justified primarily by problems that haven't bitten is a rewrite justified by aesthetics. That's a legitimate motivation *if named as such* — but it is not "TS is no longer the lowest-risk foundation."

### 2. "Lower risk" is a different risk profile, not less risk

Sol frames Rust as risk-reduction. Honestly accounted, it *moves* risk:

| Rust lowers | Rust raises |
|---|---|
| Illegal-state bugs (enums) | Rewrite churn on working software |
| Distribution (single binary) | TUI portability (tmux/WSL/SSH/wide-char) — Sol's own listed risk |
| Blind-replay correctness | Generator correctness against `UTR`/`DX`/Prisma types |
| — | Dual-runtime drift during a long parity window |
| — | Abandoning an append-only renderer that has *zero* screen-ownership bugs |

The existence proof matters: **Claude Code is TypeScript and is the stated caliber target.** So TS demonstrably reaches the bar. "Lowest-risk foundation for a working tool" is, tautologically, the working tool. Rust is worth its risks *for specific goals* (distribution, learning, the local-agent runtime) — but "lower risk overall" is not established, and the plan-of-record framing implies it is.

### 3. Ratatui abandons a house doctrine that is currently working

The renderer is append-only `stdout.write` — and "minimal processing between upstream and terminal" is a *documented* house rule, not an accident. Its superpower is that **it does not own the screen**, so it structurally cannot have the split-escape / repaint-desync / resize-corruption class of bug that §1 frets about. Sol's plan replaces it with Ratatui managing an inline viewport plus `insert_before` scrollback — a full terminal diff engine, betting that inline mode is robust across every terminal Andrew's coworkers will use.

That is trading a category of problems you *don't have* for a category you *will*. It may be worth it to get a durable composer/popup/spinner — but it's the single largest complexity increase in the plan, it's the part that's hardest to walk back, and §"Risks" even names "terminal portability consumes the roadmap" as a top risk. Adopting the framework that *creates* that risk surface should be the most-scrutinized decision, not a settled one.

### 4. R1 buries a prod-contract refactor — the exact surgery Andrew guards

This is the sharpest concern. The generator's correctness *depends* on narrowing `HydrateConversationPage.convo` and `AIChatResponse.convo` away from `ConversationSingleton<true>` (a recursive Prisma graph) to precise wire DTOs — Sol says so plainly in §"Contract hygiene." But that is a modification to `packages/types/src/events.ts`, which is **prod-web-shared, deployed territory**, touching web, web-next, and ws-server. Andrew halted the last `events.ts` expansion mid-flight and it's now standing policy in my memory: shared-contract changes get surgical treatment and his explicit sign-off, CLI needs get solved at the CLI layer first.

Sol lists this as an R1 sub-bullet ("narrow broad `ConversationSingleton` event members… compiling all consumers") as if it were routine. It is not routine — it is the highest-blast-radius change in the entire plan, it benefits the rewrite specifically, and it must be its own reviewed, signed-off change gated *before* any generator work, not folded into a Rust milestone. A plan that makes the crown-jewel contract a dependency of a CLI rewrite has its risk ordering inverted. (Sol is right that narrower DTOs would *also* help the web — but "it's a good change anyway" is not license to bundle it into R1.)

### 5. The sequencing skips the actual distribution gate

The rewrite exists to serve distribution ("hey coworkers, try my BYOK CLI"). But the real blocker to cohort one is **`aic login`** — the auth/onboarding flow, which does not exist yet, is TypeScript, and is required *regardless of what language the client is written in*. Sol's R0–R4 rebuild the client's internals while the feature that makes "hand it to a coworker" possible goes unbuilt. A Rust binary at full chat parity still cannot be given to anyone until login exists. Cohort one is developers — they have Node; `npm i -g` is a fine install for that audience (it's how Claude Code ships). So the value-ordering is backwards: it optimizes the engine before building the ignition.

### 6. "Generate all event domains in phase 1" multiplies the generator's blast radius against YAGNI

Sol wants asset, image-gen, and TTS events all generated in phase 1 "even when their UI arrives later." But those carry the gnarliest payloads in the contract — asset events with S3 object shapes, the ~40-field `ImageGenRequest`, TTS codecs. Generating them means the generator must correctly resolve *all* of it on day one, and the §4 DTO-narrowing must cover *all* of it. That is the generator's single biggest risk, multiplied, in service of UI that doesn't exist. A chat-first CLI needs chat + conversation + hydration + provider events generated; defer the rest. Smaller generator, smaller contract-surgery surface, faster to a testable R2. "Protocol awareness" does not require generating types no code consumes yet — that's the same over-provisioning the plan rightly rejects for no-op dispatchers.

## The honest thumb on the scale Sol omits

Sol argues purely on technical merit and reaches "rewrite now." But Andrew named a third factor: he *wants to learn Rust*, and this is a great vehicle. That legitimately shifts the calculus — but it shifts it toward **"do the Rust where the learning is richest and the risk is lowest,"** which is the **local-agent runtime (R6)**, not a reimplementation of a working WebSocket chat client. Filesystem search, sandboxed exec, patch application, path containment — that's where Rust is genuinely best-in-class *and* where there's no working TS incumbent to churn. If the goal includes learning, that argues for starting Rust at the *new* capability, not by rewriting the part that already works.

## Counter-recommendation

Not "never." **Sequence and de-risk instead of committing to cutover:**

1. **Build `aic login` in TS now.** It's the real distribution gate, it's small, and it ports to any future client. Ship the *working* TS CLI to dev coworkers and get the only signal that matters: do people use it? Everything downstream is speculative until that returns yes.
2. **Do R1 (the generator) as a standalone spike — but split the contract change out.** The generator is genuinely the highest-risk *assumption* and it has value independent of the rewrite (it's the drift-safe path for *any* second consumer). Prove it can resolve `EventTypeMap` through `UTR`/`DX`/Prisma types into precise Rust. But the `events.ts` DTO-narrowing it requires is its **own** reviewed change with Andrew's sign-off, landed and green across all three consumers *before* the generator depends on it — never a Rust-milestone sub-bullet.
3. **Do R2 (headless transport) next** — it's testable, it validates "the existing server flow is sufficient for a native client," and it commits you to nothing visual.
4. **Gate R3 (the Ratatui TUI) and R4 (cutover) on two conditions both being true:** the generator + headless transport proved out, *and* distribution demand is real (someone beyond you actually wants it). R3 is where the cost lives, where the append-only doctrine dies, and where the justification is thinnest today. Don't pre-commit it.
5. **Cut phase-1 generator scope to chat/conversation/hydration/provider.** Defer asset/image/TTS generation to when their UI is actually being built.

This gets every de-risking benefit Sol wants (generator proven, transport proven, state model designed) while keeping the expensive irreversible decisions gated on evidence — and it ships user-visible value (login → coworkers) *first* instead of last.

## Bottom line

Sol's plan is right that Rust is the plausible eventual home and right about nearly every implementation detail *within* the rewrite. It is wrong to present a full rewrite-and-cutover as *plan of record* when the motivating pain is hypothetical, the working renderer's doctrine gets discarded for a riskier one, a guarded prod contract is a hidden dependency, and the actual distribution blocker is a TS auth flow nobody has built. Adopt R1 and R2 as spikes; treat the contract change as sacred and separate; ship `aic login` and validate demand before greenlighting the TUI. A rewrite should buy explicit ownership *and* be paid for by proven need — Sol has the first half; the second half isn't here yet.

Proceed with the generator spike and the login flow. Do not start the Ratatui TUI or freeze the working TS CLI until both the generator proves out and a real user beyond Andrew is waiting.
