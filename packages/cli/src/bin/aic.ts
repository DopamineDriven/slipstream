#!/usr/bin/env node
import { SlipstreamReplService } from "@/repl.ts";

const repl = new SlipstreamReplService();
repl.start().catch((err: unknown) => {
  console.error(repl.safeErrMsg(err));
  process.exit(1);
});
