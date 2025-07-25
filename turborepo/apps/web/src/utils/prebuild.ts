import { Fs } from "@d0paminedriven/fs";

if (
  process.env.NODE_ENV !== "development" ||
  typeof process.env.NODE_ENV !== "undefined" ||
  process.env.VERCEL_ENV !== "development"
) {
  const fs = new Fs(process.cwd());
  console.log({
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV
  });
  /**
 removing this generator that uses puppeteer and causes a fire remotely

 generator erd {
  provider                  = "prisma-erd-generator"
  disable                   = true
  theme                     = "dark"
  mmdcPath                  = "../../node_modules/.bin"
  includeRelationFromFields = true
  erdDebug                  = true
}
 */
  const getSchema = fs.fileToBuffer("prisma/schema.prisma").toString("utf-8");
  const regex = /generator\s+erd\s*\{[\s\S]*?\}/g;
  fs.withWs("prisma/schema.prisma", getSchema.replace(regex, ""));
  console.info("> generator axed ✔")
}
