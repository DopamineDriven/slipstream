import type { WaveformPeaks } from "@d0paminedriven/audiodown";
import { AudioService } from "@d0paminedriven/audiodown";
import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import pg from "pg";

dotenv.config({ quiet: true });

type BackfillTarget = "dev" | "prod";

/** a lyria track whose AudioMetadata row has no envelope yet */
interface AudioRow {
  attachmentId: string;
  cdnUrl: string;
  filename: string | null;
  /** AudioMetadata.duration — milliseconds; 0 means the header walk had nothing */
  durationMs: number;
  /** cardinality of the stored waveformPeaks — 0 for `{}`, 1 for the `{0}` placeholder */
  storedPeaks: number;
  /** AudioGenJob.model — the lyria model that produced the track */
  model: string;
  /** a."createdAt" rendered as a UTC instant */
  createdAtUtc: string;
}

interface AnalyzedRow extends AudioRow {
  /** WAVEFORM_PEAK_COUNT buckets, 0..WAVEFORM_PEAK_SCALE — empty when the stream would not decode */
  waveformPeaks: number[];
  /** decoded length wins over the header walk when the stream decoded */
  decodedDurationMs: number | null;
  bytes: number;
  error: string | null;
}

class BackfillWaveformPeaksWorkup {
  constructor(protected fs: Fs) {}

  /** the live path's contract — `interactions-sse.ts` asks for 1024 buckets, `waveformPeaksColumn` quantises to 0..100 */
  protected WAVEFORM_PEAK_COUNT = 1024;
  protected WAVEFORM_PEAK_SCALE = 100;
  protected MAX_BYTES = 64 * 1024 * 1024;

  protected audio = new AudioService({ peakCount: this.WAVEFORM_PEAK_COUNT });

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

  private async resolveDbUrl(target: BackfillTarget) {
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

  /** identical to the extractor's `waveformPeaksColumn` so backfilled rows match live rows byte for byte */
  private waveformPeaksColumn(waveform: WaveformPeaks | null) {
    return waveform
      ? Array.from(waveform.envelope, v =>
          Math.round(Math.min(1, Math.max(0, v)) * this.WAVEFORM_PEAK_SCALE)
        )
      : [];
  }

  private async fetchBytes(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
    const declared = Number(res.headers.get("content-length"));
    if (declared > this.MAX_BYTES) {
      throw new Error(`${url}: declared ${declared} bytes, limit is ${this.MAX_BYTES}`);
    }
    const u8 = new Uint8Array(await res.arrayBuffer());
    if (u8.byteLength > this.MAX_BYTES) {
      throw new Error(`${url}: received ${u8.byteLength} bytes, limit is ${this.MAX_BYTES}`);
    }
    return u8;
  }

  /** read-only: every lyria track still missing an envelope, written out for review */
  public async genRows(target: BackfillTarget) {
    const connectionString = await this.resolveDbUrl(target);

    if (!connectionString) {
      console.error("DATABASE_URL is not set");
      process.exit(1);
    }

    const client = new pg.Client({ connectionString });
    await client.connect();

    try {
      // prettier-ignore
      const result = await client.query<AudioRow>(
        `SELECT a."id" AS "attachmentId",
                a."cdnUrl",
                a."filename",
                am."duration" AS "durationMs",
                cardinality(am."waveformPeaks")::int AS "storedPeaks",
                j."model",
                to_char(a."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAtUtc"
         FROM "AudioMetadata" am
         JOIN "Attachment" a ON a."id" = am."attachmentId"
         JOIN "AudioGenOutput" o ON o."attachmentId" = a."id"
         JOIN "AudioGenJob" j ON j."id" = o."jobId"
         WHERE cardinality(am."waveformPeaks") <= 1
           AND a."cdnUrl" IS NOT NULL
         ORDER BY a."createdAt" ASC`
      );

      if (result.rows.length === 0) {
        console.log("No lyria tracks without an envelope");
      }

      const tally = new Map<string, number>();
      for (const r of result.rows) {
        tally.set(r.model, (tally.get(r.model) ?? 0) + 1);
      }
      for (const [model, count] of tally) console.log(`${count}\t${model}`);

      this.fs.withWs(
        `src/test/__out__/backfill/waveform-peaks/${target}/rows.json`,
        JSON.stringify(result.rows, null, 2)
      );
      return result.rows;
    } catch (err) {
      throw new Error(this.safeErrMsg(err));
    } finally {
      await client.end();
    }
  }

  /**
   * Fetch each track from the CDN and run the same analysis the live path
   * runs at persist. A stream that will not decode keeps its header specs and
   * an empty envelope, exactly like `analyzeBuffer`'s fallback; it is
   * reported and never written. Sequential — the addon decodes on its own
   * blocking pool, and the CDN is not in a hurry.
   */
  public async analyze(target: BackfillTarget, rows: AudioRow[]) {
    const analyzed = Array.of<AnalyzedRow>();
    for (const row of rows) {
      try {
        const bytes = await this.fetchBytes(row.cdnUrl);
        let waveform: WaveformPeaks | null = null;
        let decodedDurationMs: number | null = null;
        try {
          const analysis = await this.audio.analyzeAudioAsync(
            bytes,
            undefined,
            row.cdnUrl
          );
          waveform = analysis.waveform;
          decodedDurationMs =
            Math.round(analysis.waveform.durationSec * 1000) ||
            analysis.specs.durationMs;
        } catch (err) {
          console.warn(
            `[${row.attachmentId}] decode failed, header specs only: ${this.safeErrMsg(err)}`
          );
        }
        const waveformPeaks = this.waveformPeaksColumn(waveform);
        analyzed.push({
          ...row,
          waveformPeaks,
          decodedDurationMs,
          bytes: bytes.byteLength,
          error: waveformPeaks.length > 1 ? null : "no envelope"
        });
        console.log(
          `[${row.attachmentId}] ${row.filename ?? "?"} · ${bytes.byteLength} bytes · ${waveformPeaks.length} peaks · ${decodedDurationMs ?? "?"} ms`
        );
      } catch (err) {
        analyzed.push({
          ...row,
          waveformPeaks: [],
          decodedDurationMs: null,
          bytes: 0,
          error: this.safeErrMsg(err)
        });
        console.warn(`[${row.attachmentId}] skipped: ${this.safeErrMsg(err)}`);
      }
    }

    this.fs.withWs(
      `src/test/__out__/backfill/waveform-peaks/${target}/analyzed.json`,
      JSON.stringify(analyzed, null, 2)
    );
    return analyzed;
  }

  public async backfill(target: BackfillTarget, rows: AnalyzedRow[]) {
    const connectionString = await this.resolveDbUrl(target);
    if (!connectionString) {
      console.error("DATABASE_URL is not set");
      process.exit(1);
    }

    const client = new pg.Client({ connectionString });
    await client.connect();

    try {
      let written = 0;
      await client.query("BEGIN");
      for (const row of rows) {
        if (row.waveformPeaks.length <= 1) continue;
        // prettier-ignore
        const res = await client.query(
          `UPDATE "AudioMetadata"
           SET "waveformPeaks" = $2::int[],
               "duration" = CASE WHEN "duration" = 0 THEN $3::int ELSE "duration" END
           WHERE "attachmentId" = $1
             AND cardinality("waveformPeaks") <= 1`,
          [row.attachmentId, row.waveformPeaks, row.decodedDurationMs ?? row.durationMs]
        );
        written += res.rowCount ?? 0;
      }
      await client.query("COMMIT");
      console.log(`wrote ${written} of ${rows.length} ${target} lyria tracks`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(this.safeErrMsg(err));
    } finally {
      await client.end();
    }
  }

  public async exe(target: BackfillTarget) {
    const rows = await this.genRows(target);
    const t0 = performance.now();
    if (rows.length > 0) {
      const analyzed = await this.analyze(target, rows);
      await this.backfill(target, analyzed);
    }
    const t1 = performance.now();
    console.log(
      `took ${t1 - t0}ms to backfill envelopes across ${rows.length} ${target} lyria tracks`
    );
  }

  public async crossCheck(target: BackfillTarget) {
    const connectionString = await this.resolveDbUrl(target);
    if (!connectionString) {
      console.error("DATABASE_URL is not set");
      process.exit(1);
    }

    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      // prettier-ignore
      const test = await client.query(
        `SELECT a."id"
         FROM "AudioMetadata" am
         JOIN "Attachment" a ON a."id" = am."attachmentId"
         JOIN "AudioGenOutput" o ON o."attachmentId" = a."id"
         WHERE cardinality(am."waveformPeaks") <= 1
           AND a."cdnUrl" IS NOT NULL`
      );

      if (test.rows.length === 0) {
        console.log(`no remaining rows for ${target}`);
      } else {
        console.log(
          `${test.rows.length} records not yet backfilled for ${target}`
        );
      }
    } catch (err) {
      throw new Error(this.safeErrMsg(err));
    } finally {
      await client.end();
    }
  }
}

/**
 * pnpm tsx src/test/backfill-waveform-peaks.ts --env dev --target gen-rows
 * pnpm tsx src/test/backfill-waveform-peaks.ts --env dev --target analyze
 * pnpm tsx src/test/backfill-waveform-peaks.ts --env dev --target exe
 * pnpm tsx src/test/backfill-waveform-peaks.ts --env dev --target cross-check
 */

const env = process.argv[3];
if (env === "dev" || env === "prod") {
  const backfillWorkup = new BackfillWaveformPeaksWorkup(new Fs(process.cwd()));
  if (process.argv[5] === "gen-rows") {
    void backfillWorkup.genRows(env);
  }
  if (process.argv[5] === "analyze") {
    void backfillWorkup
      .genRows(env)
      .then(rows => backfillWorkup.analyze(env, rows));
  }
  if (process.argv[5] === "exe") {
    void backfillWorkup.exe(env);
  }
  if (process.argv[5] === "cross-check") {
    void backfillWorkup.crossCheck(env);
  }
}
