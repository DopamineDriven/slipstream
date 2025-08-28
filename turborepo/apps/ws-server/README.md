# WS-SERVER

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

generator client {
  provider = "prisma-client"
  output   = "../src/generated/client"
  previewFeatures = ["typedSql"]
}
enum StreamingFormat {
  hls       // .m3u8 - HLS playlist/manifest
  dash      // .mpd - DASH manifest
  smooth    // .ism - Smooth Streaming
}

enum AudioCodec {
  aac       // most common in MP4
  mp3       // universal but older
  opus      // modern, efficient (WebM)
  vorbis    // older open codec (WebM)
  ac3       // Dolby Digital
  eac3      // Dolby Digital Plus
  dts       // DTS audio
  flac      // lossless
  pcm       // uncompressed
  mp2       // older MPEG audio
  unknown
}


enum VideoCodec {
  h264      // AVC, most compatible
  h265      // HEVC, better compression
  vp8       // older WebM codec
  vp9       // modern WebM codec
  av1       // newest, most efficient
  mpeg4     // older MPEG-4 Part 2
  h263      // very old
  theora    // open source, older
  prores    // Apple professional
  dnxhd     // Avid professional
  unknown
}

enum SenderType {
  USER
  AI
  SYSTEM
}

enum ThemePreference {
  LIGHT
  DARK
  SYSTEM
}

enum Provider {
  OPENAI
  GROK
  GEMINI
  ANTHROPIC
}

enum AssetOrigin {
  UPLOAD
  REMOTE
  GENERATED
}

enum AssetStatus {
  REQUESTED
  PLANNED
  UPLOADING
  STORED
  SCANNING
  READY
  FAILED
  QUARANTINED
  ATTACHED
}

enum HighlightKind {
  TEXT
  CODE
}

model User {
  id            String             @id @default(cuid(2))
  name          String?
  email         String             @unique
  emailVerified DateTime?
  image         String?
  profile       Profile?
  accounts      Account[]
  sessions      Session[]
  keys          UserKey[]
  attachments   Attachment[]
  conversations Conversation[]
  highlights    MessageHighlight[]
  settings      Settings?
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt
}

model Profile {
  id         String  @id @default(cuid(2))
  bio        String?
  city       String?
  region     String?
  country    String?
  postalCode String?
  lat        Float?
  lng        Float?
  timezone   String?
  user       User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId     String  @unique
}

model Account {
  id                String  @id @default(cuid(2))
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid(2))
  sessionToken String   @unique
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expires      DateTime
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model UserKey {
  id        String    @id @default(cuid(2))
  userId    String
  provider  Provider
  apiKey    String    @db.VarChar(512) // encrypted at rest
  iv        String    @db.VarChar(32) // 16-byte IV (nonce)
  authTag   String    @db.VarChar(32) // 16-byte auth-tag
  label     String?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages  Message[] @relation("MessageToUserKey")
  isDefault Boolean   @default(false)

  @@unique([userId, provider], name: "userId_provider")
  @@map("UserApiKey")
}

model Settings {
  id              String           @id @default(cuid(2))
  userId          String           @unique
  user            User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  theme           ThemePreference? @default(SYSTEM)
  defaultProvider Provider?
  defaultModel    String?
}

model Conversation {
  id                   String                @id @default(cuid(2))
  userId               String
  userKeyId            String?
  user                 User                  @relation(fields: [userId], references: [id], onDelete: Cascade)
  title                String?
  createdAt            DateTime              @default(now())
  updatedAt            DateTime              @updatedAt
  messages             Message[]
  branchId             String? // For branching conversations
  parentId             String? // For chat branching
  attachments          Attachment[]
  isShared             Boolean               @default(false)
  shareToken           String?               @unique
  conversationSettings ConversationSettings?
}

model ConversationSettings {
  id              String       @id @default(cuid(2))
  conversationId  String       @unique
  systemPrompt    String?
  enableThinking  Boolean?     @default(false)
  trackUsage      Boolean?     @default(false)
  enableWebSearch Boolean?     @default(false)
  enableAssetGen  Boolean?     @default(false)
  maxTokens       Int?
  usageAlerts     Boolean?     @default(true)
  temperature     Float?       @default(1.0)
  topP            Float?       @default(1.0)
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  conversation    Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
}

model Message {
  id               String             @id @default(cuid(2))
  conversationId   String
  userId           String?
  senderType       SenderType         @default(USER)
  provider         Provider
  model            String?
  userKeyId        String?
  content          String
  thinkingText     String?
  thinkingDuration Int?
  liked            Boolean?           @default(false)
  disliked         Boolean?           @default(false)
  tryAgain         Boolean?           @default(false) // resubmit previous prompt to output a new (branched?) response
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt
  userKey          UserKey?           @relation("MessageToUserKey", fields: [userKeyId], references: [id])
  attachments      Attachment[]
  highlights       MessageHighlight[]
  conversation     Conversation       @relation(fields: [conversationId], references: [id], onDelete: Cascade)
}

model MessageHighlight {
  id        String        @id @default(cuid(2))
  messageId String
  userId    String
  kind      HighlightKind @default(TEXT)
  textQuote Json
  start     Int?
  end       Int?
  language  String?
  color     String?
  note      String?
  isPinned  Boolean       @default(false)
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  message   Message       @relation(fields: [messageId], references: [id], onDelete: Cascade)
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  // prevent dupes -- selectorHash is computed in app (e.g., sha256 of normalized {messageId, exact, prefix, suffix})
  selectorHash String @unique @db.VarChar(64)

  @@index([messageId, createdAt])
  @@index([userId, createdAt])
  @@index([isPinned, createdAt])
}

model Attachment {
  id             String       @id @default(cuid(2))
  conversationId String
  userId         String
  messageId      String?
  origin         AssetOrigin  @default(UPLOAD)
  status         AssetStatus  @default(REQUESTED)
  bucket         String
  key            String
  region         String       @default("us-east-1")
  size           BigInt?
  mime           String?
  etag           String?
  checksumSha256 String?
  sourceUrl      String?
  meta           Json?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  message        Message?     @relation(fields: [messageId], references: [id], onDelete: SetNull)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([bucket, key])
  @@index([conversationId, createdAt])
  @@index([userId, createdAt])
  @@index([status, createdAt])
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime

  @@id([identifier, token])
}

```



