import { DocMetadataExtractor } from "../docs/index.js";

const extractor = new DocMetadataExtractor();

const pdfUrls = [
  {
    name: "typescript-in-50-lessons",
    url: "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760031788040-typescript-in-50-lessons.pdf"
  },
  {
    name: "minotaur",
    url: "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759640772691-minotaur.pdf"
  },
  {
    name: "grokina-catullan-vibe",
    url: "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758789194213-A_Day_in_Grokina_Grokamole_s_Truthful_Catullan_Vibe.pdf"
  }
];

async function testAllPDFs() {
  for (const pdf of pdfUrls) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Testing: ${pdf.name}`);
    console.log(`${"=".repeat(60)}`);

    try {
      // Download the full PDF
      console.log("Downloading full PDF...");
      const response = await fetch(pdf.url);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      console.log(`File size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

      // Parse with our extractor
      const result = extractor.parsePdf(buffer, "application/pdf");

      console.log("\nExtracted metadata:");
      console.log("  PDF Version:", result.pdfVersion);
      console.log("  Page Count:", result.pageCount);
      console.log("  Created Date:", result.createdDate ?? "null");
      console.log("  Modified Date:", result.modifiedDate ?? "null");
      console.log("  Author:", result.author ?? "null");
      console.log("  Subject:", result.subject ?? "null");
      console.log(
        "  Producer:",
        result.keywords?.find(k => k.includes("PDF")) ?? "null"
      );

      // Check raw text for date patterns
      const text = buffer.toString("latin1");

      // Look for any Info dictionary
      const infoMatches = text.match(/<<[^>]*\/Info[^>]*>>/);
      if (infoMatches) {
        console.log("\n✓ Info dictionary found");
      } else {
        console.log("\n✗ No Info dictionary found");
      }

      // Look for dates in various formats
      const creationDateMatch = text.match(/\/CreationDate\s*\([^)]+\)/);
      const modDateMatch = text.match(/\/ModDate\s*\([^)]+\)/);

      if (creationDateMatch || modDateMatch) {
        console.log("\nRaw date strings found in PDF:");
        if (creationDateMatch)
          console.log("  CreationDate:", creationDateMatch[0]);
        if (modDateMatch) console.log("  ModDate:", modDateMatch[0]);
      } else {
        console.log("\n✗ No date fields found in entire PDF");

        // Check if there's an Info object reference
        const trailerMatch = text.match(
          /trailer[\s\S]*?\/Info\s+(\d+)\s+\d+\s+R/
        );
        if (trailerMatch) {
          console.log(`  Info object referenced: ${trailerMatch[1]} 0 R`);

          // Try to find that object
          const objRegex = new RegExp(
            `${trailerMatch[1]}\\s+0\\s+obj([\\s\\S]*?)endobj`
          );
          const objMatch = text.match(objRegex);
          if (objMatch?.[1]) {
            console.log("  Info object content preview:");
            console.log(
              "    " + objMatch[1].substring(0, 200).replace(/\n/g, "\n    ")
            );
          }
        }
      }

      // Check for XMP metadata (another source of dates)
      const xmpMatch = text.match(/<\?xpacket[^>]*\?>[\s\S]*?<\/x:xmpmeta>/);
      if (xmpMatch) {
        console.log("\n✓ XMP metadata found");
        if (xmpMatch[0].includes("CreateDate")) {
          console.log("  Contains CreateDate in XMP");
        }
        if (xmpMatch[0].includes("ModifyDate")) {
          console.log("  Contains ModifyDate in XMP");
        }
      }
    } catch (error) {
      console.error("Error processing PDF:", error);
    }
  }
}

testAllPDFs().catch(console.error);
