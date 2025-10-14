import { Extract, ImageSpecs } from "@slipstream/metadata";

export class ExtractService extends Extract {
  constructor() {
    super();
  }
  public grokMapper(
    data: {
      url: string;
      revised_prompt: string;
    }[]
  ) {
    return data.map(({ url, revised_prompt }, i) => {
      return { index: i, url, md: `![${revised_prompt}](${url})` };
    });
  }

  public grokContent(
    input: {
      index: number;
      url: string;
      md: string;
    }[]
  ) {
    return input
      .map(t => {
        return t.md;
      })
      .join("\n");
  }

  public imgSpecs = async (
    data: {
      index: number;
      url: string;
      md: string;
    }[]
  ) => {
    const arr = Array.of<{ imgSpecs: ImageSpecs; index: number }>();
    const expandedData = data
      .concat({
        url: "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758866145748-aicoalesce-og-final-II-scaled.png",
        index: 5,
        md: "testing"
      })
      .concat({
        url: "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1757123632828-IMG_3922.png",
        md: "iphone screen shot",
        index: 6
      })
      .concat({
        url: "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759114340631-grok-video-ba76af9e-7820-4007-b9bd-0ea4f16dfdd9.png",
        md: "apng test one",
        index: 7
      })
      .concat({
        url: "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758923529552-aicoalesce-vivified.png",
        md: "apng test two",
        index: 8
      })
      .concat({
        url: "https://assets-dev.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759051021488-grok-video-7b9c6db1-6ff8-4da7-9278-f29837c6ca44.png",
        md: "apng test three",
        index: 9
      })
      .concat({
        url: "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758924156875-nice.gif",
        md: "gif test",
        index: 10
      });
    for (const d of expandedData) {
      const specs = await this.extractRemote(d.url, 64 * 1024);
      const specsFiltered = specs.type === "IMAGE" ? specs : null;
      specsFiltered
        ? arr.push({ index: d.index, imgSpecs: specsFiltered })
        : null;
    }
    return arr;
  };
}
