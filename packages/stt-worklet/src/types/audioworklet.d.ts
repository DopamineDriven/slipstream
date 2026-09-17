declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}

declare function registerProcessor(
  name: string,
  ctor: new (...args: never[]) => AudioWorkletProcessor
): void;

declare const sampleRate: number;
declare const currentTime: number;
declare const currentFrame: number;
