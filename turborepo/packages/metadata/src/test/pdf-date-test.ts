import { DocMetadataExtractor } from "../docs/index.js";
import * as fs from "fs";

const extractor = new DocMetadataExtractor();

// Test the PDF we downloaded
const buffer = fs.readFileSync("test.pdf");
const result = extractor.parsePdf(buffer, "application/pdf");

console.log("PDF Metadata:");
console.log("Created Date:", result.createdDate);
console.log("Modified Date:", result.modifiedDate);
console.log("Author:", result.author);
console.log("PDF Version:", result.pdfVersion);

// Test the date extraction directly
const text = buffer.toString("latin1");

// Check what the raw text contains
const creationMatch = text.match(/\/CreationDate\s*\(([^)]+)\)/);
console.log("\nRaw CreationDate match:", creationMatch?.[1]);

const modDateMatch = text.match(/\/ModDate\s*\(([^)]+)\)/);
console.log("Raw ModDate match:", modDateMatch?.[1]);