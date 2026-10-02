import { resolve } from "node:path";
import { AudioService } from "@/audio/index.ts";
import { Fs } from "@d0paminedriven/fs";

const fs = new Fs(process.cwd());

const absPath = [
  "/home/dopaminedriven/cloneathon/t3-chat-clone/apps/ws-server/src/test/google/interactions/lyria/lyria-3-pop-punk.mp3",
  `/home/dopaminedriven/cloneathon/t3-chat-clone/apps/ws-server/src/test/google/interactions/lyria/lyria-3-pro-punk-meets-pop-punk.mp3`,
  `/home/dopaminedriven/cloneathon/t3-chat-clone/apps/ws-server/src/test/google/interactions/lyria/CARMEN-XXXIX-DE-OEDIPO-DIGITALI.mp3`,
  `/home/dopaminedriven/cloneathon/t3-chat-clone/apps/ws-server/src/test/google/interactions/lyria/grokina-meteorologist.mp3`,
  `/home/dopaminedriven/cloneathon/t3-chat-clone/apps/ws-server/src/test/google/interactions/lyria/tts-eve.wav`,
  `/home/dopaminedriven/cloneathon/t3-chat-clone/apps/ws-server/src/test/google/interactions/lyria/fauxcket-I.mp3`,
  `/home/dopaminedriven/cloneathon/t3-chat-clone/apps/ws-server/src/test/google/interactions/lyria/fauxcket-II.mp3`,
  `/home/dopaminedriven/cloneathon/t3-chat-clone/apps/ws-server/src/test/google/interactions/lyria/Fauxcket.mp3`,
  `/home/dopaminedriven/cloneathon/t3-chat-clone/apps/ws-server/src/test/google/interactions/lyria/g-wagon-grokina-reformatted-tts.wav`,
  `/home/dopaminedriven/cloneathon/t3-chat-clone/apps/ws-server/src/test/google/interactions/lyria/grokina-partitioned-foraging-report.wav`
] as const;

const audioService = new AudioService();
(async (path: string) => {
  return audioService.parseAudio(
    new Uint8Array(await fs.fileToBufferAsync(resolve(path)))
  );
})(absPath["9"]).then(t => {
  const filename = absPath["9"].slice(absPath["9"].lastIndexOf("/") + 1);

  fs.withWs(
    `src/test/__out__/audio/${filename}.json`,
    JSON.stringify(t, null, 2)
  );
});
