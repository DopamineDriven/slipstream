import * as dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ quiet: true });

async function main() {
  const { Credentials } = await import("@slipstream/credentials");
  const creds = new Credentials();
  const connectionString = await creds.get("DATABASE_URL");
  const client = new Client({
    connectionString: process.env.DATABASE_URL ?? connectionString,
    connectionTimeoutMillis: 30000
  });

  await client.connect();

  try {
    const result = await client.query<{
      ttsJobId: string;
      status: string;
      voice: string;
      codec: string;
      durationMs: number | null;
      sizeBytes: string | null;
      ttsCdnUrl: string | null;
      sourceMessageId: string;
      msgContent: string;
      msgProvider: string;
      msgModel: string | null;
      msgType: string;
      attachmentId: string | null;
      attCdnUrl: string | null;
      attCompatCdnUrl: string | null;
      attAssetType: string | null;
      attFilename: string | null;
      attExt: string | null;
      attCompatExt: string | null;
      attOrigin: string | null;
      audioMetaId: string | null;
      audioDuration: number | null;
      audioSampleRate: number | null;
      audioChannels: number | null;
    }>(`
      SELECT
        tts."id"              AS "ttsJobId",
        tts."status",
        tts."voice",
        tts."codec",
        tts."durationMs",
        tts."sizeBytes",
        tts."cdnUrl"          AS "ttsCdnUrl",
        tts."sourceMessageId",
        LEFT(m."content", 80) AS "msgContent",
        m."provider"          AS "msgProvider",
        m."model"             AS "msgModel",
        m."messageType"       AS "msgType",
        tts."attachmentId",
        a."cdnUrl"            AS "attCdnUrl",
        a."compatCdnUrl"      AS "attCompatCdnUrl",
        a."assetType"         AS "attAssetType",
        a."filename"          AS "attFilename",
        a."ext"               AS "attExt",
        a."compatExt"         AS "attCompatExt",
        a."origin"            AS "attOrigin",
        audio."attachmentId"  AS "audioMetaId",
        audio."duration"      AS "audioDuration",
        audio."sampleRate"    AS "audioSampleRate",
        audio."channels"      AS "audioChannels"
      FROM "TTSJob" tts
      INNER JOIN "Message" m      ON m."id" = tts."sourceMessageId"
      LEFT  JOIN "Attachment" a   ON a."id" = tts."attachmentId"
      LEFT  JOIN "AudioMetadata" audio ON audio."attachmentId" = a."id"
      ORDER BY tts."createdAt" DESC
      LIMIT 25
    `);

    const rows = result.rows;

    console.log(`\n=== TTSJob Pipeline Audit (${rows.length} rows) ===\n`);

    const missing = {
      noAttachment: rows.filter(r => !r.attachmentId),
      noAttCdn: rows.filter(
        r => r.attachmentId && !r.attCdnUrl && !r.attCompatCdnUrl
      ),
      noAudioMeta: rows.filter(r => r.attachmentId && !r.audioMetaId),
      mismatchedCdn: rows.filter(r => {
        const attUrl = r.attCdnUrl ?? r.attCompatCdnUrl;
        return r.ttsCdnUrl && attUrl && r.ttsCdnUrl !== attUrl;
      })
    };

    for (const row of rows) {
      const attUrl = row.attCdnUrl ?? row.attCompatCdnUrl ?? "NONE";
      console.log(
        `[${row.status}] ${row.ttsJobId}\n` +
          `  msg:        ${row.sourceMessageId} (${row.msgProvider}/${row.msgModel}) [${row.msgType}]\n` +
          `  content:    "${row.msgContent}..."\n` +
          `  tts cdn:    ${row.ttsCdnUrl ?? "NULL"}\n` +
          `  att id:     ${row.attachmentId ?? "NULL"}\n` +
          `  att cdn:    ${attUrl}\n` +
          `  att asset:  ${row.attAssetType ?? "N/A"} | origin: ${row.attOrigin ?? "N/A"}\n` +
          `  audioMeta:  ${row.audioMetaId ? `${row.audioDuration}ms / ${row.audioSampleRate}Hz / ${row.audioChannels}ch` : "MISSING"}\n`
      );
    }

    console.log(`\n=== Summary ===`);
    console.log(`  Total TTSJobs:              ${rows.length}`);
    console.log(`  Missing attachmentId:       ${missing.noAttachment.length}`);
    console.log(`  Has attachment, no CDN:     ${missing.noAttCdn.length}`);
    console.log(
      `  Has attachment, no AudioMeta: ${missing.noAudioMeta.length}`
    );
    console.log(
      `  CDN mismatch (tts vs att):  ${missing.mismatchedCdn.length}`
    );

    if (missing.noAttachment.length > 0) {
      console.log(`\n  ⚠ TTSJobs with NULL attachmentId:`);
      for (const r of missing.noAttachment) {
        console.log(
          `    ${r.ttsJobId} [${r.status}] → msg ${r.sourceMessageId}`
        );
      }
    }
  } catch (err) {
    console.error("Query failed:", err instanceof Error ? err.message : err);
  } finally {
    await client.end();
  }
}

main();
