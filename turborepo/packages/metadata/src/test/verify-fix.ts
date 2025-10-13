import { Extract } from "@/index.ts";

const extract = new Extract();

async function testFix() {
  const url =
    "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760031788040-typescript-in-50-lessons.pdf";

  console.log("Testing TypeScript PDF with new fetchMinimalBuffer:");

  const result = await extract.fetchMinimalBuffer(url, 4096 * 24);
  console.log(`Buffer size fetched: ${result.buffer.length} bytes`);

  const text = result.buffer.toString("latin1");
  const hasCreationDate = text.includes("CreationDate");
  const hasModDate = text.includes("ModDate");

  console.log("CreationDate in buffer:", hasCreationDate);
  console.log("ModDate in buffer:", hasModDate);

  if (hasCreationDate) {
    const match = text.match(/\/CreationDate\s*\([^)]+\)/);
    console.log("CreationDate found:", match?.[0]);
  }

  if (hasModDate) {
    const match = text.match(/\/ModDate\s*\([^)]+\)/);
    console.log("ModDate found:", match?.[0]);
  }

  const docSpecs = extract.docs.getDocumentSpecsWorkup(
    result.buffer,
    result.contentType ?? "application/pdf"
  );

  console.log("\nParsed document specs:");
  console.log("Created Date:", docSpecs.createdDate);
  console.log("Modified Date:", docSpecs.modifiedDate);
  console.log("PDF Version:", docSpecs.pdfVersion);
}

testFix().catch(console.error);
