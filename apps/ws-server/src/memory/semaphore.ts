/**
 * §8.5's primitive scoped to the summarizer: an in-process FIFO counting
 * semaphore bounding concurrent summarizer LLM calls across ALL
 * conversations. Waves fan out per-context (sweepBatchSize) and the boot
 * resume fans out across every pending context — without a global cap the
 * extreme backfill is contexts × sweepBatchSize concurrent calls (the OTPM
 * blowout). Per-instance by design: cross-instance safety remains the
 * watermark/summary-state CAS, and the cap can rise as MoE arms spread load.
 */
export class SummaryJobSemaphore {
  private inFlightCount = 0;
  private readonly waiters = Array.of<() => void>();

  constructor(private readonly capacity: number) {}

  public async acquire() {
    if (this.inFlightCount < this.capacity) {
      this.inFlightCount += 1;
      return;
    }
    const { promise, resolve } = Promise.withResolvers<void>();
    this.waiters.push(resolve);
    await promise;
  }

  public release() {
    const next = this.waiters.shift();
    if (next) {
      // slot hands off directly — inFlightCount stays constant
      next();
      return;
    }
    if (this.inFlightCount > 0) {
      this.inFlightCount -= 1;
    }
  }

  /** observability: jobs currently holding a slot */
  public get inFlight() {
    return this.inFlightCount;
  }

  /** observability: jobs currently waiting on a slot */
  public get queued() {
    return this.waiters.length;
  }
}
