async function debugCDN() {
  const urls = {
    cdn: "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760031788040-typescript-in-50-lessons.pdf",
    // If you have the S3 URL, we could test that too
  };

  console.log("Testing CDN behavior with Range requests:");
  console.log("=" .repeat(60));

  // Test 1: Try HEAD request
  console.log("\n1. Testing HEAD request:");
  try {
    const headResponse = await fetch(urls.cdn, { method: "HEAD" });
    console.log("   Status:", headResponse.status);
    console.log("   Accept-Ranges:", headResponse.headers.get("accept-ranges"));
    console.log("   Content-Length:", headResponse.headers.get("content-length"));
    console.log("   Content-Type:", headResponse.headers.get("content-type"));
    console.log("   Cache-Control:", headResponse.headers.get("cache-control"));
    console.log("   X-Cache:", headResponse.headers.get("x-cache")); // CloudFront cache status
  } catch (e) {
    console.log("   HEAD request failed:", e);
  }

  // Test 2: Try small Range request
  console.log("\n2. Testing Range request (bytes=0-1023):");
  const rangeResponse = await fetch(urls.cdn, {
    headers: { "Range": "bytes=0-1023" }
  });
  console.log("   Status:", rangeResponse.status);
  console.log("   Content-Range:", rangeResponse.headers.get("content-range"));
  console.log("   Accept-Ranges:", rangeResponse.headers.get("accept-ranges"));
  console.log("   Content-Length:", rangeResponse.headers.get("content-length"));
  console.log("   X-Cache:", rangeResponse.headers.get("x-cache"));

  // Test 3: If Range works, get total size and test end range
  if (rangeResponse.status === 206) {
    const contentRange = rangeResponse.headers.get("content-range");
    const totalMatch = contentRange?.match(/bytes \d+-\d+\/(\d+)/);

    if (totalMatch?.[1]) {
      const totalSize = parseInt(totalMatch[1], 10);
      console.log("\n3. File total size:", totalSize, "bytes");

      // Try fetching the last 1KB
      const endStart = totalSize - 1024;
      console.log(`\n4. Testing end Range request (bytes=${endStart}-${totalSize - 1}):`);

      const endResponse = await fetch(urls.cdn, {
        headers: { "Range": `bytes=${endStart}-${totalSize - 1}` }
      });

      console.log("   Status:", endResponse.status);
      console.log("   Content-Range:", endResponse.headers.get("content-range"));
      console.log("   X-Cache:", endResponse.headers.get("x-cache"));

      if (endResponse.status === 206) {
        const endBuffer = Buffer.from(await endResponse.arrayBuffer());
        const endText = endBuffer.toString("latin1");
        console.log("   Buffer size:", endBuffer.length);
        console.log("   Contains 'CreationDate':", endText.includes("CreationDate"));
        console.log("   Contains '%%EOF':", endText.includes("%%EOF")); // PDF end marker
      }
    }
  } else if (rangeResponse.status === 200) {
    const buffer = await rangeResponse.arrayBuffer();
    console.log("   ⚠️ Server returned full file instead of range!");
    console.log("   Full file size:", buffer.byteLength);
  }

  // Test 4: Check CloudFront behavior hints
  console.log("\n5. CloudFront configuration hints:");
  console.log("   If X-Cache shows 'Miss from cloudfront' or 'Hit from cloudfront',");
  console.log("   then CloudFront is caching the responses.");
  console.log("   If Accept-Ranges is missing, CloudFront might need configuration.");

  console.log("\n6. Recommendations:");
  console.log("   - Check CloudFront behavior settings for 'Cache Based on Selected Request Headers'");
  console.log("   - Ensure 'Range' is whitelisted if you want CloudFront to forward Range requests to S3");
  console.log("   - S3 natively supports Range requests, so the issue is likely CloudFront configuration");
}

debugCDN().catch(console.error);
