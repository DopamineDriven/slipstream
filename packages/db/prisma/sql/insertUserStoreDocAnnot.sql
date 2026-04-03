-- @param {String} $1:id
-- @param {String} $2:docId
-- @param {AnnotSubtype} $3:subtype
-- @param {String} $4:uri
-- @param {Float} $5:rectX1
-- @param {Float} $6:rectY1
-- @param {Float} $7:rectX2
-- @param {Float} $8:rectY2
-- @param {Int} $9:startOffset
-- @param {Int} $10:endOffset
-- @param {Int} $11:pageNumber?
-- @param {Boolean} $12:isCdnLink
-- @param {String} $13:linkedDocId?
-- @param {String} $14:attachmentId?

INSERT INTO "UserStoreDocAnnot" (
  id,
  "docId",
  subtype,
  uri,
  rect,
  "startOffset",
  "endOffset",
  "pageNumber",
  "isCdnLink",
  "linkedDocId",
  "attachmentId",
  "createdAt"
) VALUES (
  $1, $2,
  $3::"AnnotSubtype",
  $4,
  ARRAY[$5, $6, $7, $8]::float8[],
  $9, $10,
  $11,
  $12,
  $13,
  $14,
  NOW()
)
ON CONFLICT DO NOTHING
RETURNING id, "docId", subtype::"text" as subtype, uri;
