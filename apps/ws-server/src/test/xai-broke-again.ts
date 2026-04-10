import { ListCollectionsResponse } from "@/xai/types.ts";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

const mgmtKey = process.env.X_AI_MANAGEMENT_API_KEY ?? "";
// both of the apis broke, get collections and get collection by id...
async function* getAllCollections(limit = 10) {
  let has_more = true;
  let count = 0;
  let pagination_token: string | undefined = undefined;
  let page_number = 0;

  while (has_more) {
    const url = pagination_token
      ? `https://management-api.x.ai/v1/collections?limit=${limit}&pagination_token=${pagination_token}`
      : `https://management-api.x.ai/v1/collections?limit=${limit}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mgmtKey}`
      }
    });

    const page = await response.json<ListCollectionsResponse>();

    has_more = typeof page.pagination_token !== "undefined";
    pagination_token = page.pagination_token;
    count += page.collections?.length ?? 0;

    yield {
      data: page.collections,
      count,
      page_number,
      has_more
    };

    page_number += 1;
  }
}

(async () => {
  for await (const s of getAllCollections()) {
    console.log(s);
  }
})();

// const x = Array.of<string>();
// const y = Array.of<string>();

// for (const v of d) {
//   const s = v as {
//     choices: [
//       {
//         index: 0;
//         delta: {
//           reasoning: string;
//           reasoning_details: [
//             { type: "reasoning.text"; text: string; format: string; index: 0 }
//           ];
//         };
//         logprobs: null;
//         finish_reason: null;
//       }
//     ];
//   };
//   for (const t of s.choices) {
//     if ("reasoning_details" in t.delta) {
//       x.push(t.delta.reasoning_details[0].text);
//     }
//   }
// }

// console.log(x.join(``))
