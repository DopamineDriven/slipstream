import type { Voyage } from "@/voyage/types.ts";

export class VoyageEmbeddingService {
  constructor(private readonly apiKey: string) {}

  async embedChunksContextual<const T extends Voyage.InputType>({
    inputs,
    input_type,
    model = "voyage-context-3",
    encoding_format = null,
    output_dimension = 1024,
    output_dtype = "float"
  }: Voyage.Contextual.Input<T>) {
    const res = await fetch(
      "https://api.voyageai.com/v1/contextualizedembeddings",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs,
          encoding_format,
          input_type,
          output_dimension,
          output_dtype,
          model
        })
      }
    );
    if (res.status < 500) {
      return await res.json<Voyage.Contextual.Output<T>>();
    } else {
      throw new Error(
        `something went wrong with the embedChunksContextual method: [code]: ${res.status} [text]: ${res.statusText}`
      );
    }
  }

  async testingContextualized() {
    return await this.embedChunksContextual({
      input_type: "query",
      // enforces strict inputs, only one string member per inner array
      // (property) Voyage.Contextual<T extends Voyage.InputType = "document">.Input<"query">.inputs: readonly (readonly [string])[]
      inputs: [[""], [""]],
      model: "voyage-context-3"
    }).then(out => {
      if (!out.success)
        throw new Error(
          `error in voyage contextual fetch: ${out.response.detail}`
        );
      // enforces strict outputs, knows that list[]->data[0].embedding is of type number[],
      // where list[]-> borrows from groq syntax representing mapping of the outer array (nod to Sanity CMS queries)
      return out.response.data.map(list => {
        list.data[0].embedding;
      });
    });
  }

  async embedChunksMultimodal<
    const T extends Voyage.Multimodal.Input.ContentUnion
  >(
    type: T,
    {
      input_type = "document",
      inputs,
      model = "voyage-multimodal-3.5",
      output_encoding = null,
      truncation = true
    }: Voyage.Multimodal.Input<typeof type>
  ) {
    const res = await fetch(
      "https://api.voyageai.com/v1/multimodalembeddings",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputs,
          output_encoding,
          input_type,
          truncation,
          model
        })
      }
    );
    if (res.status < 500) {
      return await res.json<Voyage.Multimodal.Output>();
    } else {
      throw new Error(
        `something went wrong with the embedChunksMultimodal method: [code]: ${res.status} [text]: ${res.statusText}`
      );
    }
  }

  async testingMultimodal() {
    return await this.embedChunksMultimodal("url", {
      input_type: "document",
      inputs: [
        {
          content: [
            { type: "image_url", image_url: "" },
            { type: "video_url", video_url: "" },
            { type: "text", text: "" }
          ]
        },
        { content: [{ type: "video_url", video_url: "" }] }
      ],
      model: "voyage-multimodal-3.5"
    });
  }
}
