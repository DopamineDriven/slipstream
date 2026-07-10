- edit 1:
  - path: apps/ws-server/src/memory/types.ts
  - lines: [112-138] (added)

- edit 2: 
  - path: apps/ws-server/src/prisma/convo-memory-service.ts
  - lines: [414-449] (added)

- edit 3: 
  - path: apps/ws-server/src/memory/vector-store.ts
  - lines: [650-693] (added)

- edit 4:
  - path: apps/ws-server/src/memory/vector-store.ts
  - lines: [6,7,10] (added)

- edit 5:
  - path: apps/ws-server/src/anthropic/vector-store.ts
  - lines: [341-368,372-382] (added)

- edit 6:
  - path: apps/ws-server/src/anthropic/vector-store.ts
  - lines: [538-549] (added)
  - note: looks like a compact? also what is happening? perhaps we keep the very first prompt that started it all and the response to said prompt (ordinal 0 and 1)? that way user would always be at the start of convo history without stubbing
