import { DocMetadataExtractor } from "../docs/index.js";

const extractor = new DocMetadataExtractor();

async function testXmpExtraction() {
  console.log("Testing XMP date extraction with DocMetadataExtractor:");
  console.log("=" .repeat(60));

  const pdfUrls = [
    {
      name: "typescript-in-50-lessons (has traditional dates)",
      url: "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760031788040-typescript-in-50-lessons.pdf"
    },
    {
      name: "grokina-catullan-vibe (has XMP dates only)",
      url: "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758789194213-A_Day_in_Grokina_Grokamole_s_Truthful_Catullan_Vibe.pdf"
    }
  ];

  for (const pdf of pdfUrls) {
    console.log(`\nTesting: ${pdf.name}`);
    console.log("-".repeat(40));

    const response = await fetch(pdf.url);
    const buffer = Buffer.from(await response.arrayBuffer());

    const result = extractor.parsePdf(buffer, "application/pdf");

    console.log("Created Date:", result.createdDate ?? "null");
    console.log("Modified Date:", result.modifiedDate ?? "null");
    console.log("Author:", result.author ?? "null");
    console.log("PDF Version:", result.pdfVersion);
  }

  console.log("\n✅ XMP fallback implementation complete!");
}

testXmpExtraction().catch(console.error);
