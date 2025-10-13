import { DocMetadataExtractor } from "../docs/index.js";

const extractor = new DocMetadataExtractor();

// Test with the actual PDF URLs from workup.ts that are failing
const testUrls = [
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760031788040-typescript-in-50-lessons.pdf",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759640772691-minotaur.pdf",
  "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758789194213-A_Day_in_Grokina_Grokamole_s_Truthful_Catullan_Vibe.pdf"
];

async function testPdfDates() {
  for (const url of testUrls) {
    console.log(`\nTesting: ${url.split('/').pop()}`);
    console.log('=' .repeat(50));

    try {
      // Fetch the PDF with full content (not just partial)
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      console.log(`Buffer size: ${buffer.length} bytes`);

      // Parse with our extractor
      const result = extractor.parsePdf(buffer, "application/pdf");

      console.log("Created Date:", result.createdDate ?? "null");
      console.log("Modified Date:", result.modifiedDate ?? "null");
      console.log("PDF Version:", result.pdfVersion);

      // Check raw text for date patterns
      const text = buffer.toString("latin1");

      // Look for any date-like patterns in the Info dictionary
      const infoMatch = text.match(/<<[^>]*\/Info[^>]*>>/);
      if (infoMatch) {
        console.log("\nInfo dictionary found (truncated):", infoMatch[0].substring(0, 200) + "...");
      }

      // Check for CreationDate in various formats
      const patterns = [
        /\/CreationDate\s*\([^)]+\)/,
        /\/CreationDate\s*<[^>]+>/,
        /\/CreationDate\s+D:[^\s/>]+/
      ];

      let foundDate = false;
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          console.log(`Found date with pattern ${pattern.source}: ${match[0]}`);
          foundDate = true;
        }
      }

      if (!foundDate) {
        console.log("No CreationDate found in PDF");

        // Check if dates might be in compressed streams
        const objPattern = /(\d+) 0 obj[\s\S]*?endobj/g;
        let objMatch;
        let infoObjFound = false;

        while ((objMatch = objPattern.exec(text)) !== null) {
          if (objMatch[0].includes('/Info')) {
            console.log(`\nInfo reference found in object ${objMatch[1]}`);
            infoObjFound = true;
          }
        }

        if (!infoObjFound) {
          console.log("No /Info dictionary found in PDF");
        }
      }

    } catch (error) {
      console.error("Error processing PDF:", error);
    }
  }
}

testPdfDates().catch(console.error);
