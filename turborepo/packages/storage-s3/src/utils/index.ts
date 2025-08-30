import type { HeadObjectCommandOutput } from "@aws-sdk/client-s3";


export class S3Utils {
  public stripQuotes = (s?: string | null) =>
    s ? s.replace(/^"(.*)"$/, "$1") : undefined;

  /**
   * for the following input: `"s3://my-s3-bucket/my-s3-key#versionversion"`
   *
   * the regex exec yields:  `["s3://my-s3-bucket/my-s3-key#versionversion", "my-s3-bucket", "my-s3-key", "versionversion"]`
   */
  public parseS3ObjectId(id: string): {
    bucket: string;
    key: string;
    versionId?: string;
  } {
    const m = /^s3:\/\/([^/]+)\/(.+?)(?:#(.+))?$/.exec(id);
    if (!m?.[1] || !m?.[2]) throw new Error(`Bad s3ObjectId: ${id}`);
    const versionId =
      typeof m?.[3] !== "undefined" && m[3] !== "nov" ? m[3] : undefined;
    return { bucket: m[1], key: m[2], versionId };
  }

  public extractCleanFilename(target: string) {
    return (target.split(/[/\\]/).pop() ?? "file").replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );
  }

  public checksum(head: HeadObjectCommandOutput) {
    return head.ChecksumSHA256
      ? ({ algo: "SHA256", value: head.ChecksumSHA256 } as const)
      : head.ChecksumCRC32C
        ? ({ algo: "CRC32C", value: head.ChecksumCRC32C } as const)
        : head.ChecksumCRC32
          ? ({ algo: "CRC32", value: head.ChecksumCRC32 } as const)
          : head.ChecksumSHA1
            ? ({ algo: "SHA1", value: head.ChecksumSHA1 } as const)
            : head.ChecksumCRC64NVME
              ? ({ algo: "CRC64NVME", value: head.ChecksumCRC64NVME } as const)
              : undefined;
  }

  public handleExpires(expiresString?: string) {
    return expiresString
      ? new Date(expiresString)
      : new Date(Date.now() + 604800 * 1000);
  }
}

// const fsx = new Fs(process.cwd());


// // unique filename generation
// // const filename =fsx.uniqueTmpName("img-probe", "txt");

// // fsx.writeTmp(filename, "hello");
//  const readIt = fsx.scanTmp(/(img-probe)+(.*?)+/gmi)
// function results() {
//   const arr = Array.of<[string, string]>();
//   let i = 0;

//   i <=readIt.length;
//   for (const tmpFile of readIt) {
//     fsx.wait(i++)
//     let content = fsx.readTmp(tmpFile).toString("utf-8");
//     arr.push([tmpFile, content]);
//   }
//   return arr;
// }

//   console.log(results())

// so this is the only node-native helper to use temporarily (reading the files individually from tmp)
// const readSync = fsx.readTmp("img-probe1755775895862-hello.txt");
// console.log(readSync);
