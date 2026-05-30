/**
 * Convert accumulated raw PCM chunks (16-bit signed LE, mono) into a
 * WAV Blob playable by the browser `<audio>` element.
 *
 * WAV = 44-byte RIFF header + raw PCM data.
 */
export function pcmChunksToWavBlob(
  chunks: Uint8Array[],
  sampleRate = 24000
) {
  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.byteLength;
  }

  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  // RIFF chunk descriptor
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + totalLength, true); // ChunkSize
  writeString(view, 8, "WAVE");

  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (PCM = 16)
  view.setUint16(20, 1, true); // AudioFormat (PCM = 1)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, totalLength, true);

  // Merge all PCM chunks into a single ArrayBuffer for BlobPart compat
  const pcmBuffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    pcmBuffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Blob(
    [header, pcmBuffer.buffer satisfies ArrayBufferLike as ArrayBuffer],
    { type: "audio/wav" }
  );
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
