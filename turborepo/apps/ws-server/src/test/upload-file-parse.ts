const data = [
  {
    bytes: 115302,
    created_at: 1764242811,
    expires_at: null,
    filename:
      "fivmeoq4nu5ce5h9g27asdw6-x5vjobnludahghuhl9g4kmlo-ragzcay7daxeck7ox6tiqiys-436861707465725f5849565f416e616c79736973.pdf",
    id: "file_be95836f-4ba1-4698-827b-33ccde3a1944",
    object: "file",
    purpose: ""
  },
  {
    bytes: 103107,
    created_at: 1764242812,
    expires_at: null,
    filename:
      "fivmeoq4nu5ce5h9g27asdw6-e7zzhk11z6kd10t5pp6qushq-emc89hz8bihmqteuvx3t99ag-436f6e74696e756974795f616e645f5472616e73666f726d6174696f6e5f696e5f5f436c61756474756c6c75735f4368726f6e69636c65735f5f5f436861707465725f584949495f50745f49495f.pdf",
    id: "file_608ee8b5-fcec-4113-b31f-490e98a02497",
    object: "file",
    purpose: ""
  },
  {
    bytes: 368243,
    created_at: 1764242813,
    expires_at: null,
    filename:
      "anp0m7wkp2807jjrm7e3eure-m2l0d1ivj212qkyibhj1wny6-ao6q17vpurfsn88f2du2yxso-4275696c64696e672d666f722d50726f64756374696f6e5f2d412d526576697365642d506c6179626f6f6b2d666f722d456e74657270726973652d52656164792d47656e657261746976652d41492d536f6c7574696f6e735f4d412d4d414e44414c.pdf",
    id: "file_b882bf9c-b35f-4aa5-8182-cd24f6c568d7",
    object: "file",
    purpose: ""
  },
  {
    bytes: 196332,
    created_at: 1764242814,
    expires_at: null,
    filename:
      "r814391qlrlholqxfg7w0g4q-qxrpfcu6twqdt0365qeg8ung-xwv07otkpqkcy7a6nc71xlyg-726573756d652d6173726f7373.pdf",
    id: "file_a6bf222f-8378-474d-bba7-c46e453dd436",
    object: "file",
    purpose: ""
  },
  {
    bytes: 618109,
    created_at: 1764242815,
    expires_at: null,
    filename:
      "r814391qlrlholqxfg7w0g4q-qxrpfcu6twqdt0365qeg8ung-monl9eulaxzie5an9jbyt1z1-736c697073747265616d2d73696d706c69666965642d6f76657276696577.pdf",
    id: "file_708e200a-14d5-48fd-a100-b5855b34dad3",
    object: "file",
    purpose: ""
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
  const [fileNameHex, extension] = fileNameExt.split(".") as [string, string];

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
  console.log(parseFilename(d.filename));
}

for (const d of data) {
  console.log(parseFilename(d.filename));
}
