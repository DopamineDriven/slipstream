### The prompt sent to each model 

I am trying to make react a "sweet summer child"--that is, I am deliberatley rejecting the notion that react should be as load bearing as it is (eg,
vercel's MO). My backend websocket server can take care of that. What I've done is, I created a duplicate web app last night (web-next) and I have been trimming
fat and deleting files like crazy from it since. The goal: I want to use a custom sync external store that is very meticulously mapped out. This isn't a move
as fast as we can to get it done task, this is a careful architectural consideration for the cornerstone of the future frontend of my platform
(aicoalesece/slipstream). In the web app (apps/web), it works alright--not great -- especially when convos grow to 400, 500, or even 600 + messages (9+
provider/models can be in a single convo so it isn't that hard to achieve) -- the core problems are these. I am foolishly using server side rendering on my
@apps/web/src/app/(chat)/chat/[conversationId]/page.tsx route when in actuality I should not be fetchinig data from the server -- the server already delivers
the entire payload in ai_chat_response via a "convo" field following database persistance of an ai model's response (post stream completion) after the
ai_chat_chunk has completed. right now, there is a tug'o'war of sorts going on with how that happens, it works, but it's sus. I want to have a single
useSyncExternalStore and I am 100% uninterested in third party bloat/abstraciton (no store managers, I want to own it directly) and no zod (I'll write my own
type utils, zod can gtfo). The event types are located at @packages/types/src/events.ts , the types we use all over the workspace are housed in
@packages/types/src/types.ts . That is where the contract lives. currently, in the web app you'll notice how I use chat-websocket-context, ai-chat-context, etc,
which don't get me wrong, global subscribers are my favorite way to go. Except when it comes to websockets I want something of more substance than unreliable
useState/useRef etc which is whawt the useSyncExternalStore will give us. It will be the sole recipient of the @apps/web-next/src/utils/chat-ws-client.ts (which
has an additional workup hook in @apps/web-next/src/hooks/use-chat-ws.ts ). The current way this goes is @apps/web-next/src/context/ai-chat-context.tsx is the
conductor but it's brittle and prone to side effects...that is, again, where the store comes in. The second undesirable thing that happens is, as you can see in
@apps/web-next/src/app/(chat)/chat/[conversationId]/page.tsx , the server fetches directly and that page is being rendered as a server route.we should hold in
mind that we want it to be client side as a goal in web-next (we will not touch the apps/web dir at all, only the apps/web-next please). Then. a component named
"Dynamic" (stupid name I know) sits atop the chat components in @apps/web-next/src/ui/chat/dynamic/index.tsx and that is fed directly by the dynamic server
rendered route. But here's the thing. if we just use an swr workup I've alreaedy written up in @apps/web-next/src/hooks/use-conversation-messages.ts (but
haven't implemented yet) then we can let the ws server be the source of truth for hydrating our convo once already in a conversation (and previous messages have
been loaded, which is of course SWRs role here). So, I am trying to plan all of this out. Again, the server piece is done, nothing to do there,
ai_chat_response sends back "convo" which is a ConversationSingleton<true> type signature containing precisely 1 message (the most recent -- the AI's persisted
message) and all the attachments etc if applicable that come with it (image gen and so on). my front end needs to stop trying to be "smart" and start being lazy
and stupid--I just want it to receive the data and not have this thrashing anymore. the other file to see is @apps/web-next/src/context/chat-ws-context.tsx .
