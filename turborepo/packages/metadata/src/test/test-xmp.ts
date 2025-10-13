async function testXMP() {
  const url = "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1758789194213-A_Day_in_Grokina_Grokamole_s_Truthful_Catullan_Vibe.pdf";

  console.log("Fetching PDF with XMP metadata...");
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const text = buffer.toString("latin1");

  // Extract XMP metadata
  const xmpMatch = text.match(/<\?xpacket[^>]*\?>([\s\S]*?)<\/x:xmpmeta>/);

  if (xmpMatch?.[1]) {
    console.log("\nXMP Metadata found!");

    // Look for date patterns in XMP
    const xmpContent = xmpMatch?.[1];

    // Common XMP date fields
    const patterns = [
      /xmp:CreateDate[>=]["']([^"'<]+)/,
      /xmp:ModifyDate[>=]["']([^"'<]+)/,
      /xmp:MetadataDate[>=]["']([^"'<]+)/,
      /pdf:CreationDate[>=]["']([^"'<]+)/,
      /pdf:ModDate[>=]["']([^"'<]+)/,
      /<CreateDate>([^<]+)<\/CreateDate>/,
      /<ModifyDate>([^<]+)<\/ModifyDate>/
    ];

    console.log("\nDate fields in XMP:");
    for (const pattern of patterns) {
      const match = xmpContent.match(pattern);
      if (match) {
        console.log(`  ${pattern.source.substring(0, 20)}...  =>  ${match[1]}`);
      }
    }

    // Show a preview of the XMP content
    console.log("\nXMP content preview (first 1000 chars):");
    console.log(xmpContent.substring(0, 1000));
  } else {
    console.log("No XMP metadata found");
  }

  // Also check for traditional Info dictionary
  console.log("\n" + "=".repeat(60));
  console.log("Traditional PDF Info dictionary search:");

  const infoMatch = text.match(/\/Info\s+(\d+)\s+\d+\s+R/);
  if (infoMatch) {
    console.log(`Info object reference found: ${infoMatch[1]} 0 R`);

    const objRegex = new RegExp(`${infoMatch[1]}\\s+0\\s+obj([\\s\\S]*?)endobj`);
    const objMatch = text.match(objRegex);

    if (objMatch?.[1]) {
      console.log("Info object content:");
      console.log(objMatch[1].substring(0, 500));
    }
  } else {
    console.log("No Info dictionary reference found in trailer");
  }
}

testXMP().catch(console.error);
