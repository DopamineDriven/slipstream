https://github.com/DopamineDriven/slipstream/tree/main 

please analyze specifically the `packages/db/prisma/schema/userstore.prisma` and `packages/db/prisma/schema/memory.prisma` files. Also please see `packages/db/prisma/sql/searchUserStoreChunksHybrid.sql` as an example of the sql implementation of the `userstore.prisma` tables and columns. 

I also have the store implemented and live in `apps/ws-server/src/store/*` -- and, for example, you can see the store in `apps/ws-server/src/anthropic/vector-store.ts` and its handling in `apps/ws-server/src/anthropic/index.ts` (for one provider workup point of reference). The voyage service itself can be used with any vector related implementation, conversation memory vs provider agnostic user vector store alike. The idea is I want a complementary conversation memory layer that runs in the background after ever `n` messages have accumulated and feed voyage-context-4 (the newest context model, bump since context-3) the oldest slice of those messages to be indexed; I also then want a background task performed by a capable model (one capable of providing rich and comprehensive summaries) to summarize each section as its indexed, leaving the summary in conversation history as well as the message range its tied with. all messages have ordinals and the ordinal system is 0 based. so message one is ordinal 0, message two is ordinal 1, and so on. 

thoughts on finally getting this conversation memory layer moving and the table/column adjustments I should consider now rather than later? 

lastly, I will be repurposing this --> `apps/ws-server/src/test/transcript-gen.ts` into the transcript generator for each "section" that is indexed

ultimately I'll create custom tooling similar to the file_search tooling but for conversation memory handling. the goal is intra and inter-conversation memory traversal with semantic + exact match methods both being accepted just like the user store allows for.
