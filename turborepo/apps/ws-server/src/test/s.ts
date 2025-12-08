import JSONDATA from "@/__out__/conversations/Slammed Poetry/xjmdkh4ava0tiggddedkw39x.json" with { type: "json" };

const msgs = JSONDATA.messages;
const lastIndex = msgs.findLastIndex(
  m => m.provider === "GROK" && m.senderType === "AI"
);

const isFirstGrokMsg = lastIndex === -1;

const processedContext = isFirstGrokMsg
  ? undefined
  : msgs.slice(0, lastIndex + 1);

const freshContext = isFirstGrokMsg
  ? msgs
  : msgs.slice(lastIndex + 1, msgs.length);

console.log({
  msgIdFresh: freshContext[0]?.id,
  msgIdNotFresh: processedContext?.at(-1)?.id
});

const allAttachmentsSinceLastMsg = processedContext
  ?.map(v => {
    const attArr = Array.of<string>();
    if (v.attachments.length > 0) {
      for (const att of v.attachments) {
        const url =
          att.compatStatus === "ACTIVE" ? att.compatCdnUrl : att.cdnUrl;
        attArr.push(`\n\n${att.id}:\n`);
        if (att.assetType === "IMAGE") {
          attArr.push(`![${att.filename}](${url})`);
        } else if (att.assetType === "DOCUMENT") {
          attArr.push(`[${att.filename}](${url})`);
        }
      }
    }
    return attArr.join("\n");
  })
  .filter(p => p.length > 0);

console.log({
  lastGrokIndex: lastIndex,
  msgLength: allAttachmentsSinceLastMsg?.join("")
});

console.log({lastMsgId: msgs.at(msgs.length-1)?.id, slicedMsgId: msgs.slice(-1)[0]?.id});
