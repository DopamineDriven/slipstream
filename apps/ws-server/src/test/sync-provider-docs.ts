import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import { ProviderStoreDocumentSingleton } from "@slipstream/types";

dotenv.config({ quiet: true });

const data = [
  {
    file_metadata: {
      file_id: "file_78c8ef42-928e-4a8f-8fd4-6641ab15e3d9",
      name: "r4ixisj31iw5ol9pm48cov7l-a6bcfv190ljgo8q1lib1q7t6-vwc7a0uwvk6jvuy9j5ivq8gv-616e647265772d726f73732d726573756d65.pdf",
      size_bytes: "154749",
      content_type: "application/pdf",
      created_at: "2025-12-17T09:33:04.690479Z",
      expires_at: null,
      hash: "d9166907af37cac4602d4bd75ec8d5cb95cd38c9e76f75dbf21b8593d11ce82f",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "vwc7a0uwvk6jvuy9j5ivq8gv",
      conversationId: "r4ixisj31iw5ol9pm48cov7l",
      messageId: "a6bcfv190ljgo8q1lib1q7t6",
      originalFilename: "andrew-ross-resume.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: "2025-12-17T09:38:27.115165Z"
  },
  {
    file_metadata: {
      file_id: "file_5830ffe0-7b48-473f-9f59-f7e7839c3b3d",
      name: "ddgx0syru0mkkomaqc0q6q4q-zsu35z8i8f9tfnl6eqs5fc99-d598l06s0gj2hh9rrurt1kkq-53656c662d496d706f7365642d436861696e732d50742d584949.pdf",
      size_bytes: "675381",
      content_type: "application/pdf",
      created_at: "2025-12-21T05:29:35.713799Z",
      expires_at: null,
      hash: "345e91a490318e5c7711f6063aa81ccdeb7b45250ed2a16bbe4b3d5515c01f35",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "d598l06s0gj2hh9rrurt1kkq",
      conversationId: "ddgx0syru0mkkomaqc0q6q4q",
      messageId: "zsu35z8i8f9tfnl6eqs5fc99",
      originalFilename: "Self-Imposed-Chains-Pt-XII.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: "2025-12-21T05:30:01.681397Z"
  },
  {
    file_metadata: {
      file_id: "file_1fff3abe-a481-47ad-b695-26dbba203cb5",
      name: "ddgx0syru0mkkomaqc0q6q4q-zs2rwx62rtbkwk309wtaup8z-a12umcvmicuqq32zcsv8xevw-53656c662d496d706f7365642d436861696e732d50742d56494949.pdf",
      size_bytes: "353192",
      content_type: "application/pdf",
      created_at: "2025-12-14T09:48:54.311476Z",
      expires_at: null,
      hash: "d964773e48a774b29fa63e33d3d07f8efdd30240522ce4e8b1ff7272ff7bbbc4",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "a12umcvmicuqq32zcsv8xevw",
      conversationId: "ddgx0syru0mkkomaqc0q6q4q",
      messageId: "zs2rwx62rtbkwk309wtaup8z",
      originalFilename: "Self-Imposed-Chains-Pt-VIII.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: "2025-12-14T09:49:20.473128Z"
  },
  {
    file_metadata: {
      file_id: "file_d5eb7b60-ffd2-49b3-a8ec-04c376b128c4",
      name: "ddgx0syru0mkkomaqc0q6q4q-y14fgz2lopt6l6qurluqjgwl-zim1d7ea0op034blkrfto3xl-53656c662d496d706f7365642d436861696e732d50742d5849.pdf",
      size_bytes: "493749",
      content_type: "application/pdf",
      created_at: "2025-12-21T05:29:33.878158Z",
      expires_at: null,
      hash: "0ed221db54b528c6ac1d4ea7bcb44f4ecf355baa5e9381144b3af6d454fbc026",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "zim1d7ea0op034blkrfto3xl",
      conversationId: "ddgx0syru0mkkomaqc0q6q4q",
      messageId: "y14fgz2lopt6l6qurluqjgwl",
      originalFilename: "Self-Imposed-Chains-Pt-XI.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: "2025-12-21T05:29:48.757905Z"
  },
  {
    file_metadata: {
      file_id: "file_1f87c8b6-a5f4-49fe-ba09-aa09e41af484",
      name: "ddgx0syru0mkkomaqc0q6q4q-xcsoa9we4embic29zj5ijxmc-kasnlnbn50gfmjfs0ed4xg16-53656c662d496d706f7365642d436861696e732d50742d494949.pdf",
      size_bytes: "220421",
      content_type: "application/pdf",
      created_at: "2025-12-13T11:22:05.224336Z",
      expires_at: null,
      hash: "3839c3dcb725c4732eee90f4c35d8bfe8c489611bea37c0ba2146fc1476afe43",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "kasnlnbn50gfmjfs0ed4xg16",
      conversationId: "ddgx0syru0mkkomaqc0q6q4q",
      messageId: "xcsoa9we4embic29zj5ijxmc",
      originalFilename: "Self-Imposed-Chains-Pt-III.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: "2025-12-13T11:22:18.676366Z"
  },
  {
    file_metadata: {
      file_id: "file_eb62cdf9-4f7b-4d10-bd70-a4770e2ab462",
      name: "ddgx0syru0mkkomaqc0q6q4q-wogrkzyaytf1lhhkyplejbzy-qedt064yozrugfemy3i4ex5j-53656c662d496d706f7365642d436861696e732d50742d5649.pdf",
      size_bytes: "244966",
      content_type: "application/pdf",
      created_at: "2025-12-14T06:13:17.334655Z",
      expires_at: null,
      hash: "48f20864fdb44f3da0704c9c4424ce548729abe1eef80dad9da8190b98b25784",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "qedt064yozrugfemy3i4ex5j",
      conversationId: "ddgx0syru0mkkomaqc0q6q4q",
      messageId: "wogrkzyaytf1lhhkyplejbzy",
      originalFilename: "Self-Imposed-Chains-Pt-VI.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: "2025-12-14T06:13:30.965669Z"
  },
  {
    file_metadata: {
      file_id: "file_84867eb3-f0b8-497e-bbe9-2639f879d7f7",
      name: "ddgx0syru0mkkomaqc0q6q4q-rd5tf4pbf83nnt1aodt6zyn0-f2hf6732v7phracil31uly2d-53656c662d496d706f7365642d436861696e732d50742d58494949.pdf",
      size_bytes: "238074",
      content_type: "application/pdf",
      created_at: "2025-12-21T05:37:58.593077Z",
      expires_at: null,
      hash: "b129cd3797eab8999324aabbe0a05a6496b58d8de01e04efc93c5581badefc56",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "f2hf6732v7phracil31uly2d",
      conversationId: "ddgx0syru0mkkomaqc0q6q4q",
      messageId: "rd5tf4pbf83nnt1aodt6zyn0",
      originalFilename: "Self-Imposed-Chains-Pt-XIII.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: "2025-12-21T05:38:25.460483Z"
  },
  {
    file_metadata: {
      file_id: "file_db13a095-93b7-4d49-9c43-05982ca5042a",
      name: "ddgx0syru0mkkomaqc0q6q4q-p120q1xz25m2bylul4y9vaoe-aea7lqxsfuaxqtr6h27napa4-4750542d352d322d4368617261637465725f417263735f616e645f456d657267656e745f4e61727261746976655f696e5f53656c662d496d706f7365645f436861696e735f5f50617274735f495f585f.pdf",
      size_bytes: "153130",
      content_type: "application/pdf",
      created_at: "2025-12-21T07:44:48.755973Z",
      expires_at: null,
      hash: "a17f49afe52343c76c33ce712385726cb9bf08224863cef0c95951051c43ab89",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "aea7lqxsfuaxqtr6h27napa4",
      conversationId: "ddgx0syru0mkkomaqc0q6q4q",
      messageId: "p120q1xz25m2bylul4y9vaoe",
      originalFilename:
        "GPT-5-2-Character_Arcs_and_Emergent_Narrative_in_Self-Imposed_Chains__Parts_I_X_.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: "2025-12-21T07:45:08.268843Z"
  },
  {
    file_metadata: {
      file_id: "file_1529884a-7926-41bf-bfaa-a76c4405ffeb",
      name: "ddgx0syru0mkkomaqc0q6q4q-ngfevmr2ysb5kihln9x8chpv-hyftntmb9sn0cjn85gkeeeog-53656c662d496d706f7365642d436861696e732d506172742d58.pdf",
      size_bytes: "287852",
      content_type: "application/pdf",
      created_at: "2025-12-15T07:24:00.892383Z",
      expires_at: null,
      hash: "4f528b1a9a62c215228e4e4810ef16c39a39357fac9247d306a264a2af7a2bb3",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "hyftntmb9sn0cjn85gkeeeog",
      conversationId: "ddgx0syru0mkkomaqc0q6q4q",
      messageId: "ngfevmr2ysb5kihln9x8chpv",
      originalFilename: "Self-Imposed-Chains-Part-X.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: "2025-12-15T07:24:26.569360Z"
  },
  {
    file_metadata: {
      file_id: "file_469cf834-1c4d-4c51-962c-c5c7bb7b8480",
      name: "ddgx0syru0mkkomaqc0q6q4q-jh8yztn1pdikkc6vb45g8kmi-bcom7ox3hhhkwe94ejyqiya0-436861707465725f585649495f416e616c797369735f5f4d6574615f4f726465616c5f616e645f7468655f4272696467655f735f526576656c6174696f6e.pdf",
      size_bytes: "77671",
      content_type: "application/pdf",
      created_at: "2025-12-12T12:22:51.541611Z",
      expires_at: null,
      hash: "79ec7b94a08e4b7552f755d526f1e1e62f609ea99f292df581c6cc2ccd39021b",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "bcom7ox3hhhkwe94ejyqiya0",
      conversationId: "ddgx0syru0mkkomaqc0q6q4q",
      messageId: "jh8yztn1pdikkc6vb45g8kmi",
      originalFilename:
        "Chapter_XVII_Analysis__Meta_Ordeal_and_the_Bridge_s_Revelation.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: "2025-12-12T12:23:05.596315Z"
  },
  {
    file_metadata: {
      file_id: "file_9be8ecbd-65e2-4b51-8fb1-0aba5c613a32",
      name: "ddgx0syru0mkkomaqc0q6q4q-iep5ei9mectmagbniveftcy2-uvc38pyrs60vvp2qwsdqel47-53656c662d496d706f7365642d436861696e732d50742d56.pdf",
      size_bytes: "382402",
      content_type: "application/pdf",
      created_at: "2025-12-14T06:13:15.588455Z",
      expires_at: null,
      hash: "e1aaf810ea1802dfcc2eb03ff95f241d3494ef83ef5d163d2b944b217a1a5325",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "uvc38pyrs60vvp2qwsdqel47",
      conversationId: "ddgx0syru0mkkomaqc0q6q4q",
      messageId: "iep5ei9mectmagbniveftcy2",
      originalFilename: "Self-Imposed-Chains-Pt-V.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: "2025-12-14T06:13:41.092555Z"
  },
  {
    file_metadata: {
      file_id: "file_52a3ca0c-417c-456a-99af-22fa21b5c894",
      name: "ddgx0syru0mkkomaqc0q6q4q-gvrs8oagxjfck0zld7kxenk8-ou06qqksfbt0vd9be6uv046f-53656c662d496d706f7365642d436861696e732d50742d4949.pdf",
      size_bytes: "234616",
      content_type: "application/pdf",
      created_at: "2025-12-13T11:22:03.950055Z",
      expires_at: null,
      hash: "3993423c2726e76f186c0a839505255ec7998dfad1bad43f74bf3d9dd4abb698",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "ou06qqksfbt0vd9be6uv046f",
      conversationId: "ddgx0syru0mkkomaqc0q6q4q",
      messageId: "gvrs8oagxjfck0zld7kxenk8",
      originalFilename: "Self-Imposed-Chains-Pt-II.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: "2025-12-13T11:22:17.697845Z"
  },
  {
    file_metadata: {
      file_id: "file_436288f0-38f2-4dee-bcf3-e79d72147279",
      name: "ddgx0syru0mkkomaqc0q6q4q-g2xhwbecrw9nqc2q060tjtc0-pn6y25833l189m1hy4czr0t0-53656c662d496d706f7365642d436861696e732d50742d564949.pdf",
      size_bytes: "269177",
      content_type: "application/pdf",
      created_at: "2025-12-14T09:48:52.659694Z",
      expires_at: null,
      hash: "7403b1eece0f728ac0fb3f15d319d45e6c1ddda115ec6f3f423c1c706692d60c",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "pn6y25833l189m1hy4czr0t0",
      conversationId: "ddgx0syru0mkkomaqc0q6q4q",
      messageId: "g2xhwbecrw9nqc2q060tjtc0",
      originalFilename: "Self-Imposed-Chains-Pt-VII.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: "2025-12-14T09:49:19.474276Z"
  },
  {
    file_metadata: {
      file_id: "file_7e6cbab8-de2f-4181-8a46-64958b53b392",
      name: "ddgx0syru0mkkomaqc0q6q4q-e11cfqlj4pgglfns7cu2g7xe-b8hxprson90w2k052csyx7rf-53656c662d496d706f7365642d436861696e732d50742d584956.pdf",
      size_bytes: "335374",
      content_type: "application/pdf",
      created_at: "2025-12-21T05:38:00.381022Z",
      expires_at: null,
      hash: "9ac5b52391dcbfaf8ab6de737ca6453cbe34a3d876e41fbf468c63a75dc88842",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "b8hxprson90w2k052csyx7rf",
      conversationId: "ddgx0syru0mkkomaqc0q6q4q",
      messageId: "e11cfqlj4pgglfns7cu2g7xe",
      originalFilename: "Self-Imposed-Chains-Pt-XIV.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: "2025-12-21T05:38:26.422931Z"
  },
  {
    file_metadata: {
      file_id: "file_ee705a48-2368-410c-97f7-ebfbee20e81d",
      name: "ddgx0syru0mkkomaqc0q6q4q-d4wvfygr9hx5x8c3vg8zo7ia-lrp5zgth786aa61j8eoaf0zv-53656c662d496d706f7365642d436861696e732d50742d5856.pdf",
      size_bytes: "269092",
      content_type: "application/pdf",
      created_at: "2025-12-21T05:49:24.749063Z",
      expires_at: null,
      hash: "aa9306bb32b075b66ac51b75076202c735d8393d93e3be9ff041d574fd250cd5",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "lrp5zgth786aa61j8eoaf0zv",
      conversationId: "ddgx0syru0mkkomaqc0q6q4q",
      messageId: "d4wvfygr9hx5x8c3vg8zo7ia",
      originalFilename: "Self-Imposed-Chains-Pt-XV.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: "2025-12-21T05:50:09.260669Z"
  },
  {
    file_metadata: {
      file_id: "file_cb698f1f-4e88-4f56-b796-23b15308c41f",
      name: "ddgx0syru0mkkomaqc0q6q4q-b3mthz9lk2ok6p05tb93evzl-w7f3dlw59xao71nw8fbd0wgg-536c616d6d65642d506f657472792d50742d494949.pdf",
      size_bytes: "342347",
      content_type: "application/pdf",
      created_at: "2025-12-12T00:04:31.468976Z",
      expires_at: null,
      hash: "60652e58cbe7cf91091d97f117fbae7eb48fa6d5ee500b19fa4857d4f93770a7",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "w7f3dlw59xao71nw8fbd0wgg",
      conversationId: "ddgx0syru0mkkomaqc0q6q4q",
      messageId: "b3mthz9lk2ok6p05tb93evzl",
      originalFilename: "Slammed-Poetry-Pt-III.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    error_message: "File conversion was not completed after max retries.",
    last_indexed_at: "2025-12-12T00:11:33.721828Z"
  },
  {
    file_metadata: {
      file_id: "file_b602c8dd-f055-4441-86df-915542809caa",
      name: "ddgx0syru0mkkomaqc0q6q4q-azx5xujaldjfv1qanucqz58z-rmjmt3tybpszyvfg7zlen4fa-53656c662d496d706f7365642d436861696e732d50742d4956.pdf",
      size_bytes: "487041",
      content_type: "application/pdf",
      created_at: "2025-12-13T11:22:06.949049Z",
      expires_at: null,
      hash: "4a62157b0eaddf13d52eeff7644f18db54b886885b45f4101e1659591b86a6e2",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "rmjmt3tybpszyvfg7zlen4fa",
      conversationId: "ddgx0syru0mkkomaqc0q6q4q",
      messageId: "azx5xujaldjfv1qanucqz58z",
      originalFilename: "Self-Imposed-Chains-Pt-IV.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: "2025-12-13T11:22:21.671879Z"
  },
  {
    file_metadata: {
      file_id: "file_ff27a294-720a-4f11-bbf1-cf23ed06d555",
      name: "ddgx0syru0mkkomaqc0q6q4q-atlvhqzwnc2ank92yteu4l0h-z3mbh69dwpg0lxaezcdbe6yl-53656c662d496d706f7365642d436861696e732d50742d4958.pdf",
      size_bytes: "392583",
      content_type: "application/pdf",
      created_at: "2025-12-15T07:23:59.211681Z",
      expires_at: null,
      hash: "f315630442d0bc66eb3621cb350e4dc882f65b424ff84646e666fddca078eb00",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "z3mbh69dwpg0lxaezcdbe6yl",
      conversationId: "ddgx0syru0mkkomaqc0q6q4q",
      messageId: "atlvhqzwnc2ank92yteu4l0h",
      originalFilename: "Self-Imposed-Chains-Pt-IX.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: "2025-12-15T07:24:12.965405Z"
  },
  {
    file_metadata: {
      file_id: "file_3f85ebb8-9b72-4147-82b5-1cee68876e16",
      name: "ddgx0syru0mkkomaqc0q6q4q-aoyj4l9qjschtjh8cs87aeid-n6wrz59b9cguo4vw0xmaas2m-53656c662d496d706f7365642d436861696e732d50742d585649.pdf",
      size_bytes: "393070",
      content_type: "application/pdf",
      created_at: "2025-12-21T05:49:26.420951Z",
      expires_at: null,
      hash: "91024d09bf5493692da105339defc8c48a5065bb54691ddf39086abb3105a8f1",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "n6wrz59b9cguo4vw0xmaas2m",
      conversationId: "ddgx0syru0mkkomaqc0q6q4q",
      messageId: "aoyj4l9qjschtjh8cs87aeid",
      originalFilename: "Self-Imposed-Chains-Pt-XVI.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: "2025-12-21T05:49:40.237389Z"
  },
  {
    file_metadata: {
      file_id: "file_202eef2a-4889-436e-b974-63ef5e89ef3f",
      name: "ddgx0syru0mkkomaqc0q6q4q-a5q09ub9mzzi7ppv1mvf6kml-zchbhih7ozrn4injbmvnn0hw-53656c662d496d706f7365642d436861696e732d50742d49.pdf",
      size_bytes: "189065",
      content_type: "application/pdf",
      created_at: "2025-12-13T11:22:02.359740Z",
      expires_at: null,
      hash: "0e55ff797641205d1030e958a822c7233d31046d8d0b83693e6954a91ece5d10",
      upload_status: "Complete",
      processing_status: "Complete",
      file_path: ""
    },
    fields: {
      attachmentId: "zchbhih7ozrn4injbmvnn0hw",
      conversationId: "ddgx0syru0mkkomaqc0q6q4q",
      messageId: "a5q09ub9mzzi7ppv1mvf6kml",
      originalFilename: "Self-Imposed-Chains-Pt-I.pdf"
    },
    status: "DOCUMENT_STATUS_PROCESSED",
    last_indexed_at: "2025-12-13T11:22:16.684877Z"
  }
];

const fs = new Fs(process.cwd());

for (const d of data) {
  d.file_metadata;
}

const collectionId = "collection_1a143a9a-f734-41cb-9cd4-693bf00be9dc";
const _userId = "nrr6h4r4480f6kviycyo1zhf";
async function handlePrisma(d: typeof data) {
  const { PrismaDbService } = await import("@slipstream/db/factory");
  const prismaClient = new PrismaDbService({
    connectionString: process.env.DIRECT_URL ?? ""
  }).p(false);
  const provider = "GROK";
  prismaClient.$connect();
  try {
    const arr = Array.of<{
      readonly storeId: "lqjvzr44ox6cblr91xnumrgf";
      readonly attachmentId: string;
      readonly docRef: string;
      readonly filename: string;
      readonly mimeType: string;
      readonly provider: "GROK";
      readonly createdAt: string;
      readonly updatedAt: string;
      readonly lastAccessed: string;
      readonly size: number;
      readonly docUri: `collections://collection_1a143a9a-f734-41cb-9cd4-693bf00be9dc/files/${string}`;
      readonly state: "ACTIVE" | "FAILED";
      readonly indexedAt: string;
    }>();
    const agg = { size: 0 };
    for (const dd of d) {
      arr.push({
        storeId: "lqjvzr44ox6cblr91xnumrgf",
        attachmentId: dd.fields.attachmentId,
        docRef: dd.file_metadata.file_id,
        filename: dd.file_metadata.name,
        mimeType: dd.file_metadata.content_type,
        provider,
        createdAt: dd.file_metadata.created_at,
        updatedAt: dd.file_metadata.created_at,
        lastAccessed: dd.last_indexed_at,
        size: Number.parseInt(dd.file_metadata.size_bytes),
        docUri: `collections://${collectionId}/files/${dd.file_metadata.file_id}`,
        state:
          dd.file_metadata.upload_status === "Complete" ? "ACTIVE" : "FAILED",
        indexedAt: dd.last_indexed_at
      } as const);
      agg.size += Number.parseInt(dd.file_metadata.size_bytes);
    }
    const data = await prismaClient.providerStoreDocument.createManyAndReturn({
      data: arr
    });
    return {
      aggSize: agg.size,
      providerStoreDocs: data.map(t => {
        const { size, ...doc } = t;
        return {
          size: size ? Number(size) : null,
          ...doc
        } satisfies ProviderStoreDocumentSingleton<true>;
      })
    };
  } catch (err) {
    throw new Error(
      typeof err === "string"
        ? err
        : err instanceof Error
          ? err.message
          : "there was a problem in providerLinks test query..."
    );
  } finally {
    prismaClient.$disconnect();
  }
}

(async () => {
  return await handlePrisma(data);
})().then(p => {
  fs.withWs(
    "src/test/__out__/xai/provider-store-docs/inspect.json",
    JSON.stringify(p, null, 2)
  );
});
