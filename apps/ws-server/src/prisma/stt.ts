import type { ExtractService } from "@/extract/index.ts";
import type { LoggerService } from "@/logger/index.ts";
import { PrismaTTSService } from "@/prisma/tts.ts";
import type { PrismaDbService } from "@slipstream/db/factory";
import type { $Enums } from "@slipstream/db/node/generated/client";
import type { STTEventRecord, STTTypes } from "@slipstream/types";

export type DictationCoupleParams = {
  messageId: string;
  conversationId: string;
  messageOrdinal: number;
};

export class PrismaSTTService extends PrismaTTSService {
  private readonly RECOVERY_WINDOW_MS = 60 * 60 * 1000;

  constructor(
    prisma: PrismaDbService,
    extractor: ExtractService,
    logger: LoggerService,
    isProd: boolean
  ) {
    super(prisma, extractor, logger, isProd);
  }
  private recoveryExpiresAt() {
    return new Date(Date.now() + this.RECOVERY_WINDOW_MS);
  }

  private get selectForDictationRecover() {
    return {
      draftId: true,
      batchId: true,
      ordinal: true,
      conversationId: true,
      content: true,
      terminationReason: true,
      recoveryExpiresAt: true,
      createdAt: true
    } as const;
  }

  /** `stt_user_connect` — row exists before the xai-client opens */
  public async dictationInsert({
    keyterms,
    ...rest
  }: STTEventRecord<true>["stt_user_connect"]) {
    const { userId } = this.draftIdEpimerize(rest.draftId);
    return await this.prismaClient.dictation.create({
      data: {
        ...rest,
        userId,
        keyterms: keyterms?.join("::"),
        content: ""
      }
    });
  }

  /** `transcript.created` — QUEUED → GENERATING, stamp xAI's job id */
  public async dictationGenerating(draftId: string, externalId: string) {
    return await this.prismaClient.dictation.update({
      where: { draftId },
      data: { externalId, status: "GENERATING" }
    });
  }

  /** `transcript.done` — COMPLETED / DECOUPLED; never expires */
  public async dictationComplete(
    draftId: string,
    done: STTTypes.Transcript.Done,
    terminationReason: Extract<
      $Enums.DictationTerminationReason,
      "USER_FINISHED" | "IDLE_TIMEOUT"
    >
  ) {
    return await this.prismaClient.dictation.update({
      where: { draftId },
      data: {
        content: done.text,
        durationMs: Math.round(done.duration * 1000),
        status: "COMPLETED",
        couplingStatus: "DECOUPLED",
        terminationReason
      }
    });
  }

  /**
   * xai error, frame gap, stall, or aic-client disconnect
   *
   * kept text → INTERRUPTED / RECOVERABLE (1 h); empty → FAILED / FAILED
   */
  public async dictationInterrupt(
    draftId: string,
    reconciled: { text: string; durationMs: number },
    terminationReason: Extract<
      $Enums.DictationTerminationReason,
      "UPSTREAM_ERROR" | "INTERNAL_ERROR" | "CLIENT_DISCONNECTED"
    >
  ) {
    const keep = reconciled.text.length > 0;
    if (keep) {
      const recoveryExpiresAt = this.recoveryExpiresAt();
      await this.prismaClient.dictation.update({
        where: { draftId },
        data: {
          content: reconciled.text,
          durationMs: reconciled.durationMs,
          status: "INTERRUPTED",
          couplingStatus: "RECOVERABLE",
          terminationReason,
          recoveryExpiresAt
        }
      });
      return {
        couplingStatus: "RECOVERABLE",
        recoveryExpiresAt: recoveryExpiresAt.getTime()
      } as const;
    }
    await this.prismaClient.dictation.update({
      where: { draftId },
      data: {
        status: "FAILED",
        couplingStatus: "FAILED",
        terminationReason
      }
    });
    return { couplingStatus: "FAILED", recoveryExpiresAt: null } as const;
  }

  /**
   * `stt_user_cancel` — two guarded `updateMany` calls so the keep/drop
   * decision and the write are the same statement
   */
  public async dictationCancel(
    draftId: string,
    userId: string,
    recoveryExpiresAt = this.recoveryExpiresAt()
  ) {
    const kept = await this.prismaClient.dictation.updateMany({
      where: {
        draftId,
        userId,
        status: "COMPLETED",
        couplingStatus: "DECOUPLED",
        content: { not: "" }
      },
      data: {
        status: "CANCELED",
        couplingStatus: "RECOVERABLE",
        terminationReason: "USER_CANCELED",
        recoveryExpiresAt
      }
    });
    if (kept.count === 1) {
      return {
        couplingStatus: "RECOVERABLE",
        recoveryExpiresAt: recoveryExpiresAt.getTime()
      } as const;
    }
    const orphaned = await this.prismaClient.dictation.updateMany({
      where: {
        draftId,
        userId,
        couplingStatus: { in: ["PENDING", "DECOUPLED"] }
      },
      data: {
        status: "CANCELED",
        couplingStatus: "ORPHANED",
        content: "",
        terminationReason: "USER_CANCELED",
        recoveryExpiresAt: null
      }
    });
    if (orphaned.count === 0) return null; // no row this user can cancel
    return { couplingStatus: "ORPHANED", recoveryExpiresAt: null } as const;
  }

  /**
   * `stt_user_restore` — RECOVERABLE → DECOUPLED; `status` is left as
   * CANCELED/INTERRUPTED (provenance). count 0 = nothing to restore.
   */
  public async dictationRestore(draftId: string, userId: string) {
    const restored = await this.prismaClient.dictation.updateMany({
      where: {
        draftId,
        userId,
        couplingStatus: "RECOVERABLE",
        recoveryExpiresAt: { gt: new Date() }
      },
      data: { couplingStatus: "DECOUPLED", recoveryExpiresAt: null }
    });
    return restored.count === 1;
  }

  /**
   * convergence point in `resolver/chat.ts` — DECOUPLED → COUPLED for the
   * whole batch; idempotent, count 0 never blocks the chat message
   */
  public async dictationCouple(
    batchId: string,
    userId: string,
    params: DictationCoupleParams
  ) {
    const coupled = await this.prismaClient.dictation.updateMany({
      where: { batchId, userId, couplingStatus: "DECOUPLED" },
      data: { ...params, couplingStatus: "COUPLED" }
    });
    return coupled.count;
  }

  /**
   * per-user housekeeping, drained in the background at handshake. Each step
   * yields its write count; a throwing step ends the pass and names itself.
   * Never touches a DECOUPLED row that has text — draft state has no expiry.
   */
  public async *dictationHousekeeping(userId: string) {
    const now = Date.now();
    // zero-content DECOUPLED rows older than the recovery window: a finish
    // over silence that was never sent; nothing to keep, not even for M3
    const emptyDecoupled = await this.prismaClient.dictation.deleteMany({
      where: {
        userId,
        couplingStatus: "DECOUPLED",
        messageId: null,
        content: "",
        createdAt: { lt: new Date(now - this.RECOVERY_WINDOW_MS) }
      }
    });
    yield {
      step: "delete-empty-decoupled",
      count: emptyDecoupled.count
    } as const;

    // PENDING rows a day old are sessions that died with the process (no
    // close handler ran): content is always "" before a terminal write
    const strandedPending = await this.prismaClient.dictation.deleteMany({
      where: {
        userId,
        couplingStatus: "PENDING",
        createdAt: { lt: new Date(now - 24 * 60 * 60 * 1000) }
      }
    });
    yield {
      step: "delete-stranded-pending",
      count: strandedPending.count
    } as const;

    // the per-user face of dictationSweep, so a returning user is clean
    // without waiting for the interval
    const tombstoned = await this.prismaClient.dictation.updateMany({
      where: {
        userId,
        couplingStatus: "RECOVERABLE",
        recoveryExpiresAt: { lt: new Date(now) }
      },
      data: { couplingStatus: "ORPHANED", content: "", recoveryExpiresAt: null }
    });
    yield {
      step: "tombstone-expired-recoverable",
      count: tombstoned.count
    } as const;
  }

  /** interval job — expired RECOVERABLE → ORPHANED tombstone; never touches DECOUPLED */
  public async dictationSweep() {
    const swept = await this.prismaClient.dictation.updateMany({
      where: {
        couplingStatus: "RECOVERABLE",
        recoveryExpiresAt: { lt: new Date() }
      },
      data: { couplingStatus: "ORPHANED", content: "", recoveryExpiresAt: null }
    });
    return swept.count;
  }

  /**
   * `stt_user_recover` — `conversationId` tri-state:
   * undefined = all; null = new-chat only; string = that conversation
   */
  public async dictationRecoverables(
    userId: string,
    conversationId?: string | null
  ) {
    return await this.prismaClient.dictation.findMany({
      where: {
        userId,
        couplingStatus: "RECOVERABLE",
        recoveryExpiresAt: { gt: new Date() },
        ...(conversationId === undefined ? {} : { conversationId })
      },
      orderBy: { createdAt: "desc" },
      select: this.selectForDictationRecover
    });
  }

  private async drainDictationHousekeeping(userId: string) {
    for await (const { step, count } of this.dictationHousekeeping(userId)) {
      if (count > 0) {
        this.logger.info({ userId, step, count }, "dictation housekeeping");
      }
    }
  }

  public async housekeepingSTT(userId: string) {
    return await this.drainDictationHousekeeping(userId).catch(
      (err: unknown) => {
        this.logger.warn(
          { userId, err: this.safeErrMsg(err) },
          "dictation housekeeping failed; connection unaffected"
        );
      }
    );
  }
}
