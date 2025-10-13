async function debugSpecialHandling() {
  const url = "https://assets.aicoalesce.com/upload/nrr6h4r4480f6kviycyo1zhf/1760031788040-typescript-in-50-lessons.pdf";
  const size = 4096 * 24; // 98304 bytes

  console.log("Debugging PDF special handling conditions:");
  console.log("=" .repeat(60));

  // Do the test range request like in the code
  const testRangeResponse = await fetch(url, {
    headers: { Range: "bytes=0-1023" }
  });

  const contentType = testRangeResponse.headers.get("content-type");
  const supportsRange = testRangeResponse.status === 206;
  let contentLength = 0;

  if (supportsRange) {
    const contentRange = testRangeResponse.headers.get("content-range");
    console.log("Content-Range header:", contentRange);
    const totalMatch = contentRange?.match(/bytes \d+-\d+\/(\d+)/);
    console.log("Regex match result:", totalMatch);
    contentLength = totalMatch?.[1] ? parseInt(totalMatch[1], 10) : 0;
  }

  console.log("\nExtracted values:");
  console.log("contentType:", contentType);
  console.log("supportsRange:", supportsRange);
  console.log("contentLength:", contentLength);
  console.log("size:", size);
  console.log("size * 2:", size * 2);

  console.log("\nCondition evaluation:");
  console.log("contentType === 'application/pdf':", contentType === "application/pdf");
  console.log("supportsRange:", supportsRange);
  console.log("contentLength > size * 2:", contentLength > size * 2, `(${contentLength} > ${size * 2})`);

  const shouldUseSpecialHandling =
    contentType === "application/pdf" &&
    supportsRange &&
    contentLength > size * 2;

  console.log("\nShould use special PDF handling:", shouldUseSpecialHandling);

  if (shouldUseSpecialHandling) {
    console.log("\n✓ Special handling WOULD be triggered!");
    console.log("Will fetch beginning and end of the PDF");
  } else {
    console.log("\n✗ Special handling NOT triggered");
    console.log("Will use regular range request");
  }
}

debugSpecialHandling().catch(console.error);