async function debugFetch() {
  const url = "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760031788040-typescript-in-50-lessons.pdf";
  const size = 4096 * 24;

  console.log("Fetching headers for PDF...");

  const headResponse = await fetch(url, { method: "HEAD" });
  const contentType = headResponse.headers.get("content-type");
  const acceptsRange = headResponse.headers.get("accept-ranges");
  const contentLength = parseInt(headResponse.headers.get("content-length") ?? "0");

  console.log("Content-Type:", contentType);
  console.log("Accept-Ranges:", acceptsRange);
  console.log("Content-Length:", contentLength);
  console.log("Size * 2:", size * 2);

  console.log("\nConditions for PDF special handling:");
  console.log("Is PDF?", contentType === "application/pdf");
  console.log("Accepts range?", acceptsRange === "bytes");
  console.log("Content > size*2?", contentLength > size * 2);

  if (contentType === "application/pdf" && acceptsRange === "bytes" && contentLength > size * 2) {
    console.log("\n✓ Should use special PDF handling!");

    const halfSize = Math.floor(size / 2);
    console.log(`Will fetch: 0-${halfSize} and ${contentLength - halfSize}-${contentLength - 1}`);

    // Test fetching the end
    const endStart = Math.max(0, contentLength - halfSize);
    const endResponse = await fetch(url, {
      headers: {
        Range: `bytes=${endStart}-${contentLength - 1}`
      }
    });

    console.log("\nEnd fetch status:", endResponse.status);
    if (endResponse.status === 206) {
      const endBuffer = Buffer.from(await endResponse.arrayBuffer());
      const endText = endBuffer.toString("latin1");

      console.log("End buffer size:", endBuffer.length);
      console.log("Contains CreationDate?", endText.includes("CreationDate"));
      console.log("Contains ModDate?", endText.includes("ModDate"));

      if (endText.includes("CreationDate")) {
        const match = endText.match(/\/CreationDate\s*\([^)]+\)/);
        console.log("CreationDate found:", match?.[0]);
      }
    }
  } else {
    console.log("\n✗ Will NOT use special PDF handling");
  }
}

debugFetch().catch(console.error);