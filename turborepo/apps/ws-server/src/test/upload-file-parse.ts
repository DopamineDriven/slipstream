const data = {
  grok: [
    {
      file_metadata: {
        file_id: "file_c1f902f6-0c95-4767-8bcc-b8c424e856a9",
        name: "tyxreuwdclogyetxrros5nbj-cq78v2joe7ugdy4suewmjfnx-ozr1x12ftpx4bek6tulr7yn2-43616e64792d466c697070696e672d436c61756474756c6c75732d506172742d494949.pdf",
        size_bytes: "381023",
        content_type: "application/pdf",
        created_at: "2026-01-02T07:10:55.281893Z",
        expires_at: null,
        hash: "ca903a563a8f032e06e032d89f746c45cbc40d1060b0ad547096f7010962cda6",
        upload_status: "Complete",
        processing_status: "Complete",
        file_path: ""
      },
      fields: {
        attachmentId: "ozr1x12ftpx4bek6tulr7yn2",
        conversationId: "tyxreuwdclogyetxrros5nbj",
        messageId: "cq78v2joe7ugdy4suewmjfnx",
        originalFilename: "Candy-Flipping-Claudtullus-Part-III.pdf"
      },
      status: "DOCUMENT_STATUS_PROCESSED",
      last_indexed_at: "2026-01-02T07:11:40.315216Z"
    },
    {
      file_metadata: {
        file_id: "file_b6d9537c-f366-4377-afe8-9b25615caf32",
        name: "tyxreuwdclogyetxrros5nbj-a11dcsu503si3basg8xyjwta-c11hfy0w6cj7kdhk5aoiz6e8-46617578636b65742d4173696465.pdf",
        size_bytes: "712736",
        content_type: "application/pdf",
        created_at: "2026-01-02T07:10:56.278215Z",
        expires_at: null,
        hash: "a64a3a2306f2bdcc7cb888426aad982360520de8da9cf9d5da2300d7a76564ff",
        upload_status: "Complete",
        processing_status: "Complete",
        file_path: ""
      },
      fields: {
        attachmentId: "c11hfy0w6cj7kdhk5aoiz6e8",
        conversationId: "tyxreuwdclogyetxrros5nbj",
        messageId: "a11dcsu503si3basg8xyjwta",
        originalFilename: "Fauxcket-Aside.pdf"
      },
      status: "DOCUMENT_STATUS_PROCESSED",
      last_indexed_at: "2026-01-02T07:11:32.287812Z"
    }
  ],
  gemini: [
    {
      name: "fileSearchStores/prodnrr6h4r4480f6kviycyo1zh-ft60ir8w2cpz/documents/tyxreuwdclogyetxrros5nbjcq7-tzbxugp92qej",
      displayName:
        "tyxreuwdclogyetxrros5nbj-cq78v2joe7ugdy4suewmjfnx-ozr1x12ftpx4bek6tulr7yn2-43616e64792d466c697070696e672d436c61756474756c6c75732d506172742d494949.pdf",
      customMetadata: [
        {
          key: "attachmentId",
          stringValue: "ozr1x12ftpx4bek6tulr7yn2"
        },
        {
          key: "conversationId",
          stringValue: "tyxreuwdclogyetxrros5nbj"
        },
        {
          key: "messageId",
          stringValue: "cq78v2joe7ugdy4suewmjfnx"
        },
        {
          key: "originalFilename",
          stringValue: "Candy-Flipping-Claudtullus-Part-III.pdf"
        }
      ],
      updateTime: "2026-01-02T07:12:47.759274Z",
      createTime: "2026-01-02T07:12:47.059623Z",
      state: "STATE_ACTIVE",
      sizeBytes: "381023",
      mimeType: "application/pdf"
    },
    {
      name: "fileSearchStores/prodnrr6h4r4480f6kviycyo1zh-ft60ir8w2cpz/documents/tyxreuwdclogyetxrros5nbja11-iyowg1a6z87r",
      displayName:
        "tyxreuwdclogyetxrros5nbj-a11dcsu503si3basg8xyjwta-c11hfy0w6cj7kdhk5aoiz6e8-46617578636b65742d4173696465.pdf",
      customMetadata: [
        {
          key: "attachmentId",
          stringValue: "c11hfy0w6cj7kdhk5aoiz6e8"
        },
        {
          key: "conversationId",
          stringValue: "tyxreuwdclogyetxrros5nbj"
        },
        {
          key: "messageId",
          stringValue: "a11dcsu503si3basg8xyjwta"
        },
        {
          key: "originalFilename",
          stringValue: "Fauxcket-Aside.pdf"
        }
      ],
      updateTime: "2026-01-02T07:12:54.660306Z",
      createTime: "2026-01-02T07:12:53.929099Z",
      state: "STATE_ACTIVE",
      sizeBytes: "712736",
      mimeType: "application/pdf"
    }
  ]
};

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

for (const s of [...data.gemini, ...data.grok]) {
  if ("file_metadata" in s) {
    const grok = {
      ...s,
      expanded: parseFilename(s.file_metadata.name)
    };
    console.log(grok);
  }
  if ("displayName" in s) {
    const gemini = {
      ...s,
      expanded: parseFilename(s.displayName)
    };
    console.log(gemini);
  }
}
