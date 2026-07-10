# @slipstream/cli — sovereign cli

## Prereqs

1. Dev ws-server running (`ws://localhost:4000` — the default).
2. Valid session on file for your userId (if the handshake closes with 4001,
   log in via `http://localhost:3030/auth/login` in the browser, then retry).
3. Zero env needed locally — userId/wsUrl/loginUrl all have baked defaults;
   `packages/cli/.env` overrides (`SLIPSTREAM_USER_ID`, `SLIPSTREAM_WS_URL`,
   `SLIPSTREAM_LOGIN_URL`).

## Run

```bash
pnpm build:cli                                # from turborepo root
node packages/cli/dist/bin/slipstream.js      # or: tsx packages/cli/src/bin/slipstream.ts
```

You should see `• slipstream · ws://localhost:4000`, then
`• connected · fable (claude-fable-5) · /help`, then a green `❯` prompt.
(If the prompt appears but nothing else — the connect succeeded; it's a REPL,
it waits for YOU. Type at it.)

## Interact

- **Type anything** (not starting with `/`) and hit enter → it's sent as an
  `ai_chat_request` to the active model. The response streams in place:
  thinking dim-gray, text raw. When it finishes you get a
  `─ title · tokens · thought Ns` line and the prompt returns.
- First message opens a fresh conversation automatically (`new-chat-…` id;
  the first chunk rekeys it to the real id — same contract as the web app).
  It persists, indexes, and summarizes like any other conversation. HMEM
  applies.

## Commands

| command | effect |
|---|---|
| `/help` | list commands |
| `/model` | list the roster: fable · opus · gpt · grok · gemini · fugu |
| `/model <fuzzy>` | switch model (`/model gpt`, `/model grok`, even `/model 5.5`) |
| `/new` | start a fresh conversation on next send |
| `/convo <id>` | attach to an existing conversation by id (grab one from the web app URL) |
| `/system <text>` | set a system prompt for subsequent sends (`/system clear` to clear) |
| `/think` | toggle thinking-block rendering |
| `/quit` | exit (Ctrl+C also works) |

## The one-prompt double test

`/convo <id-of-Probing-the-Voyage>` then send any message → exercises the CLI
round-trip AND the HMEM substitution payload (verbatim charter → name-tagged
memory traces → live window) in a single prompt. Watch the dev server logs for
the assembled history.

## Troubleshooting

**Seeing `Welcome to Node.js … Type ".help"`?** That's NODE's repl, not ours —
the command wrapped/pasted as two lines, so bare `node` ran and the path was
evaluated as JavaScript (hence `Uncaught SyntaxError` when you typed at it).
Run it as ONE line:

```bash
node ./packages/cli/dist/bin/slipstream.js
```

Ours greets you with `• slipstream · ws://localhost:4000` and a green `❯` —
never a Node version banner.

## Known Phase-1 edges

No spinner before first token (silence ≈ model thinking with `/think` off);
no Esc-to-interrupt mid-stream; img-gen renders as raw notices; reconnect
exists (5 attempts, queued sends) courtesy of the ported ChatWebSocketClient.
