async function analyzePdfInfo() {
  const url = "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1759640772691-minotaur.pdf";

  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const text = buffer.toString("latin1");

  // Find the trailer which should reference the Info object
  const trailerMatch = text.match(/trailer[\s\S]*?\/Info\s+(\d+)\s+(\d+)\s+R/);
  if (trailerMatch) {
    const objNum = trailerMatch[1];
    console.log(`Info dictionary is in object ${objNum}`);

    // Now find that object
    const objRegex = new RegExp(`${objNum}\\s+0\\s+obj([\\s\\S]*?)endobj`);
    const objMatch = text.match(objRegex);

    if (objMatch?.[1]) {
      console.log(`\nFound Info object ${objNum}:`);
      console.log(objMatch[1].substring(0, 500));

      // Check if it has dates
      const content = objMatch[1];
      if (content.includes("CreationDate")) {
        console.log("\nContains CreationDate!");
      }
      if (content.includes("ModDate")) {
        console.log("Contains ModDate!");
      }
    }
  }

  // Also check for cross-reference table issues
  console.log("\n\nChecking for indirect Info reference...");

  // Look for Info in root/catalog
  const rootMatch = text.match(/\/Root\s+(\d+)\s+\d+\s+R/);
  if (rootMatch) {
    console.log(`Root object: ${rootMatch[1]}`);
  }
}

analyzePdfInfo().catch(console.error);
