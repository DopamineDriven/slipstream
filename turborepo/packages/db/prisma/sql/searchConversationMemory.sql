 -- @param {String} $1:contextStateId
 -- @param {String} $2:embedding
 -- @param {Int} $3:limit
 -- @param {Float} $4:threshold

 SELECT
   id, "provenanceId", "messageIdStart", "messageIdEnd",
   "messageTimestampStart", "messageTimestampEnd", "contentHash",
   "transcriptMarkdown", "modelProvidersInChunkRaw", "tokenCount",
   1 - (embedding <=> $2::vector) as score
 FROM "ConversationMemoryChunk"
 WHERE ("contextStateId" = $1 OR "provenanceId" = $1)
   AND embedding IS NOT NULL
   AND 1 - (embedding <=> $2::vector) >= $4
 ORDER BY embedding <=> $2::vector
 LIMIT $3;
