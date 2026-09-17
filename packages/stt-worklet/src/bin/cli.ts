#!/usr/bin/env node

import { join, resolve } from "node:path";
import { Fs } from "@d0paminedriven/fs";

class STTWorkletWorkup extends Fs {
  constructor() {
    super(process.cwd());
  }

  private workletPath() {
    return resolve(
      join(
        this.cwd,
        `../../node_modules/@d0paminedriven/stt-worklet/dist/worklet.js`
      )
    );
  }

  public exe(out = "public/worklets", name = "pcm-capture.js") {
    const t0 = performance.now();
    const worklet = this.fileToBuffer(this.workletPath());
    this.withWs(`${out}/${name}`, worklet);
    console.log(
      `emitted ${out}/${name} in ${(performance.now() - t0).toPrecision(4)}ms`
    );
  }
}

const workletGen = new STTWorkletWorkup();

if (
  process.argv[2] === "--out" &&
  process.argv[3] &&
  process.argv[4] === "--name" &&
  process.argv[5]
) {
  workletGen.exe(process.argv[3], process.argv[5]);
} else {
  workletGen.exe();
}
