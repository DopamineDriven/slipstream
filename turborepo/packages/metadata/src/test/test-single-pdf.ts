import { Extract } from "../index.js";

const extract = new Extract();

async function testSinglePDF() {
  const url =
    "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760031788040-typescript-in-50-lessons.pdf";

  console.log("Testing PDF with improved fetchMinimalBuffer:");
  console.log("=".repeat(60));

  const result = await extract.extractRemote(url, 4096 * 24);

  console.log("Result:", JSON.stringify(result, null, 2));

  // Also check what the buffer contains
  console.log("\nDebug info:");
  const { buffer } = await extract.fetchMinimalBuffer(url, 4096 * 24);
  const text = buffer.toString("latin1");

  console.log("Buffer size:", buffer.length);
  console.log("Contains 'CreationDate':", text.includes("CreationDate"));
  console.log("Contains 'ModDate':", text.includes("ModDate"));
  console.log("Contains '%%EOF':", text.includes("%%EOF"));

  if (text.includes("CreationDate")) {
    const match = text.match(/\/CreationDate\s*\([^)]+\)/);
    console.log("CreationDate pattern:", match?.[0]);
  }

  if (text.includes("ModDate")) {
    const match = text.match(/\/ModDate\s*\([^)]+\)/);
    console.log("ModDate pattern:", match?.[0]);
  }
}

testSinglePDF().catch(console.error);
