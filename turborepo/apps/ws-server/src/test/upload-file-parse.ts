const data = [
  {
    file_metadata: {
      file_id: "file_9f6ee129-2199-4da0-8e19-5a3a2135ab27",
      name: "u10mywinp3skd0b5sf37fzqw-d13o6d9vpwz4irb401oaa3wp-trdhekrtty5859n629agos3t-41495f4d7974686f6c6f67795f5f446f67655f735f4469676974616c5f50616e7468656f6e.pdf",
      size_bytes: "213817",
      content_type: "application/pdf",
      created_at: "2025-11-29T14:03:13.130060Z",
      expires_at: null,
      hash: "e2f5258b7103bf701b826ace37ddd8405ca28b6495be7056dbf7b88a45abb287",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "trdhekrtty5859n629agos3t",
      conversationId: "u10mywinp3skd0b5sf37fzqw",
      messageId: "d13o6d9vpwz4irb401oaa3wp",
      originalFilename: "AI_Mythology__Doge_s_Digital_Pantheon"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: null
  },
  {
    file_metadata: {
      file_id: "file_63417b18-85e9-4ba4-a7a5-2107f85dc940",
      name: "a1mm2rcro2oz0yzstidz6thw-luc9bqurs0ufhvhpdp2ul9rp-ge2l95ms859b5dv0s4dhtlg8-436861707465725f5849565f436f6e74696e756174696f6e5f416e616c797369735f6f665f5f5468655f436c61756474756c6c75735f4368726f6e69636c65735f5f5f43682e5f565f584949495f.pdf",
      size_bytes: "115306",
      content_type: "application/pdf",
      created_at: "2025-11-29T14:55:44.263992Z",
      expires_at: null,
      hash: "bf5446eb713ff5ffd4f466b2b6d84479e7eff9f69a98248ddc8a4ef23b3a0e3b",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "ge2l95ms859b5dv0s4dhtlg8",
      conversationId: "a1mm2rcro2oz0yzstidz6thw",
      messageId: "luc9bqurs0ufhvhpdp2ul9rp",
      originalFilename:
        "Chapter_XIV_Continuation_Analysis_of__The_Claudtullus_Chronicles___Ch._V_XIII_"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: null
  },
  {
    file_metadata: {
      file_id: "file_627beb2d-fb86-469d-8abf-7babc4f22e44",
      name: "a1mm2rcro2oz0yzstidz6thw-coln4ori8xyye75dfrwui516-ynea5fiyz18x83e71a506vl3-5468652d47656e657369735f4c6f672d456d657267656e742d4d7974686f6c6f67792d616e642d4d6574612d416e616c797369735f696e2d436c61756474756c6c75732d4368726f6e69636c6573.pdf",
      size_bytes: "101905",
      content_type: "application/pdf",
      created_at: "2025-11-29T14:04:20.168592Z",
      expires_at: null,
      hash: "6f6c8b503a61c3b1abc8754584e453f7b63cf10eeca08bf77aee73341ac17e8b",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "ynea5fiyz18x83e71a506vl3",
      conversationId: "a1mm2rcro2oz0yzstidz6thw",
      messageId: "coln4ori8xyye75dfrwui516",
      originalFilename:
        "The-Genesis_Log-Emergent-Mythology-and-Meta-Analysis_in-Claudtullus-Chronicles"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: null
  }
];

function canParseFilename(filename: string) {
  return /^(?:[a-z0-9]+-){3}[a-f0-9]+\.[a-z]+$/.test(filename);
}

function parseFilename(filename: string) {
  if (!canParseFilename(filename))
    throw new Error(
      "always guard parseFilename with its canParseFilename helper!"
    );

  const [conversationId, messageId, attachmentId, fileNameExt] = filename.split(
    "-"
  ) as [string, string, string, string];
  const [fileNameHex, extension] = [
    fileNameExt.slice(0, fileNameExt.lastIndexOf(".")),
    fileNameExt.slice(fileNameExt.lastIndexOf(".") + 1)
  ];

  const fileName = Buffer.from(fileNameHex, "hex").toString("utf-8");

  return {
    conversationId,
    messageId,
    attachmentId,
    fileName,
    extension
  };
}

for (const d of data) {
  console.log(parseFilename(d.file_metadata.name));
}

