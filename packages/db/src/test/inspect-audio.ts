import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import pg from "pg";

dotenv.config({ quiet: true });

type InspectTarget = "dev" | "prod";

/**
 * Only the fields the tally reads are named. Every other column rides along
 * in the jsonb untouched and lands in the file as the database has it.
 */
interface AudioMetaDump {
  attachmentId: string;
  duration: number;
  waveformPeaks: number[];
}

interface AudioGenOutputDump {
  id: string;
  jobId: string;
  attachmentId: string;
  kind: string;
  generatingModel: string | null;
  content: string | null;
}

interface AttachmentDump {
  id: string;
  messageId: string | null;
  cdnUrl: string | null;
  audio: AudioMetaDump | null;
  audioGenOutput: AudioGenOutputDump | null;
}

interface AudioGenJobDump {
  id: string;
  model: string;
  stage: string;
  output: AudioGenOutputDump | null;
}

interface MessageBlockDump {
  id: string;
  ordinal: number;
  type: string;
}

interface LyriaMessageDump {
  id: string;
  conversationId: string;
  ordinal: number;
  senderType: string;
  model: string | null;
  messageType: string;
  messageBlocks: MessageBlockDump[];
  /** present on the request message: the job hangs off the turn that asked for it */
  audioGenJob: AudioGenJobDump | null;
  /** present on the AI message: the generated track with its metadata and lineage */
  attachments: AttachmentDump[];
}

interface UnboundOutputDump extends AudioGenOutputDump {
  job: AudioGenJobDump | null;
  attachment: AttachmentDump | null;
}

/**
 * Read-only dump of the lyria lane, one entry per message, shaped like the
 * singletons: the message's own columns, then `messageBlocks`, `audioGenJob`
 * (with its `output`) and `attachments` (each with `audio` and
 * `audioGenOutput`). A message qualifies on any of four signals, so neither
 * side of a turn can slip through: typed AUDIO_GEN, sent to a lyria model,
 * requested a job, or carries a generated track. Outputs whose attachment is
 * bound to no message are listed separately so the file accounts for every
 * job, output, attachment and metadata row. Runs inside a READ ONLY
 * transaction; nothing here can write.
 */
class InspectAudioWorkup {
  constructor(protected fs: Fs) {}

  public safeErrMsg(err: unknown) {
    if (err instanceof Error) {
      return err.message;
    } else if (typeof err === "object" && err != null) {
      return JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
    } else if (typeof err === "string") {
      return err;
    } else if (typeof err === "number") {
      return err.toPrecision(5);
    } else if (typeof err === "boolean") {
      return `${err}`;
    } else return String(err);
  }

  private async resolveDbUrl(target: InspectTarget) {
    if (target === "dev") {
      if (process.env.DATABASE_URL) {
        return process.env.DATABASE_URL;
      } else {
        throw new Error("dev DATABASE_URL secret not found");
      }
    } else {
      const { Credentials } = await import("@slipstream/credentials");
      const cred = new Credentials();
      return await cred.get("DATABASE_URL");
    }
  }

  private tally(label: string, keys: string[]) {
    const counts = new Map<string, number>();
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    console.log(`\n${label} (${keys.length})`);
    for (const [key, count] of counts) console.log(`${count}\t${key}`);
  }

  public async inspect(target: InspectTarget) {
    const connectionString = await this.resolveDbUrl(target);

    if (!connectionString) {
      console.error("DATABASE_URL is not set");
      process.exit(1);
    }

    const client = new pg.Client({ connectionString });
    await client.connect();

    try {
      await client.query("BEGIN TRANSACTION READ ONLY");
      // prettier-ignore
      const messages = await client.query<{ message: LyriaMessageDump }>(
        `SELECT to_jsonb(m) || jsonb_build_object(
                  'messageBlocks', COALESCE((
                    SELECT jsonb_agg(to_jsonb(b) ORDER BY b."ordinal")
                    FROM "MessageBlock" b
                    WHERE b."messageId" = m."id"
                  ), '[]'::jsonb),
                  'audioGenJob', (
                    SELECT to_jsonb(j) || jsonb_build_object(
                             'output', (
                               SELECT to_jsonb(o)
                               FROM "AudioGenOutput" o
                               WHERE o."jobId" = j."id"
                             )
                           )
                    FROM "AudioGenJob" j
                    WHERE j."requestMessageId" = m."id"
                  ),
                  'attachments', COALESCE((
                    SELECT jsonb_agg(
                             to_jsonb(a) || jsonb_build_object(
                               'audio', (
                                 SELECT to_jsonb(am)
                                 FROM "AudioMetadata" am
                                 WHERE am."attachmentId" = a."id"
                               ),
                               'audioGenOutput', (
                                 SELECT to_jsonb(o)
                                 FROM "AudioGenOutput" o
                                 WHERE o."attachmentId" = a."id"
                               )
                             )
                             ORDER BY a."createdAt"
                           )
                    FROM "Attachment" a
                    WHERE a."messageId" = m."id"
                  ), '[]'::jsonb)
                ) AS "message"
         FROM "Message" m
         WHERE m."messageType" = 'AUDIO_GEN'
            OR m."model" LIKE 'lyria-%'
            OR EXISTS (
                 SELECT 1 FROM "AudioGenJob" j
                 WHERE j."requestMessageId" = m."id"
               )
            OR EXISTS (
                 SELECT 1
                 FROM "Attachment" a
                 JOIN "AudioGenOutput" o ON o."attachmentId" = a."id"
                 WHERE a."messageId" = m."id"
               )
         ORDER BY m."conversationId" ASC, m."ordinal" ASC`
      );
      // prettier-ignore
      const unbound = await client.query<{ output: UnboundOutputDump }>(
        `SELECT to_jsonb(o) || jsonb_build_object(
                  'job', (
                    SELECT to_jsonb(j)
                    FROM "AudioGenJob" j
                    WHERE j."id" = o."jobId"
                  ),
                  'attachment', to_jsonb(a) || jsonb_build_object(
                    'audio', (
                      SELECT to_jsonb(am)
                      FROM "AudioMetadata" am
                      WHERE am."attachmentId" = a."id"
                    )
                  )
                ) AS "output"
         FROM "AudioGenOutput" o
         JOIN "Attachment" a ON a."id" = o."attachmentId"
         WHERE a."messageId" IS NULL
         ORDER BY o."createdAt" ASC`
      );
      await client.query("COMMIT");

      const rows = messages.rows.map(r => r.message);
      const unboundOutputs = unbound.rows.map(r => r.output);

      if (rows.length === 0) {
        console.log("No lyria messages found");
      }

      const jobs = rows
        .map(m => m.audioGenJob)
        .filter((j): j is AudioGenJobDump => j !== null);
      const attachments = rows.flatMap(m => m.attachments);
      const outputs = attachments
        .map(a => a.audioGenOutput)
        .filter((o): o is AudioGenOutputDump => o !== null);
      const audio = attachments
        .map(a => a.audio)
        .filter((am): am is AudioMetaDump => am !== null);

      this.tally(
        "messages",
        rows.map(
          m => `${m.senderType} · ${m.model ?? "no model"} · ${m.messageType}`
        )
      );
      this.tally(
        "message blocks",
        rows.flatMap(m =>
          m.messageBlocks.map(b => `${m.senderType} · ${b.type}`)
        )
      );
      this.tally(
        "audio gen jobs",
        jobs.map(
          j => `${j.model} · ${j.stage} · output:${j.output ? "yes" : "none"}`
        )
      );
      this.tally(
        "audio gen outputs",
        outputs.map(
          o =>
            `${o.generatingModel ?? "no model"} · ${o.kind} · content:${o.content ? "yes" : "none"}`
        )
      );
      this.tally(
        "attachments",
        attachments.map(
          a =>
            `cdnUrl:${a.cdnUrl ? "yes" : "none"} · output:${a.audioGenOutput ? "yes" : "none"} · audio:${a.audio ? "yes" : "none"}`
        )
      );
      this.tally(
        "audio metadata",
        audio.map(
          am =>
            `peaks:${am.waveformPeaks.length} · duration:${am.duration > 0 ? "set" : "0"}`
        )
      );
      this.tally(
        "unbound outputs (attachment on no message)",
        unboundOutputs.map(
          o => `${o.generatingModel ?? "no model"} · ${o.kind}`
        )
      );

      const path = `src/test/__out__/inspect-audio/${target}.json`;
      this.fs.withWs(
        path,
        JSON.stringify(
          {
            target,
            generatedAt: new Date().toISOString(),
            counts: {
              messages: rows.length,
              messageBlocks: rows.reduce(
                (n, m) => n + m.messageBlocks.length,
                0
              ),
              audioGenJobs: jobs.length,
              audioGenOutputs: outputs.length,
              attachments: attachments.length,
              audioMetadata: audio.length,
              unboundOutputs: unboundOutputs.length
            },
            messages: rows,
            unboundOutputs
          },
          null,
          2
        )
      );
      console.log(`\nwrote ${path}`);
      return rows;
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(this.safeErrMsg(err));
    } finally {
      await client.end();
    }
  }
}

/**
 * pnpm tsx src/test/inspect-audio.ts --env dev
 * pnpm tsx src/test/inspect-audio.ts --env prod
 */

const env = process.argv[3];
if (env === "dev" || env === "prod") {
  const inspectWorkup = new InspectAudioWorkup(new Fs(process.cwd()));
  void inspectWorkup.inspect(env);
}
