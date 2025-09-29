import { Fs } from "@d0paminedriven/fs";

const fs = new Fs(process.cwd());

//prettier-ignore
const targets = `generator client {
  provider        = "prisma-client"
  previewFeatures = ["typedSql"]
  output          = "../src/generated/prisma"
  runtime         = "nodejs"
}

generator edge {
  provider = "prisma-client-js"
  output   = "../edge/generated/client"
  runtime = "vercel-edge"
  previewFeatures = ["typedSql"]
}`;

// prettier-ignore
const edgeTarget = `generator edge {
  provider = "prisma-client-js"
  output   = "../edge/generated/client"
  runtime = "vercel-edge"
  previewFeatures = ["typedSql"]
}`;

// prettier-ignore
const nodeTarget =`generator client {
  provider        = "prisma-client"
  previewFeatures = ["typedSql"]
  output          = "../src/generated/prisma"
  runtime         = "nodejs"
}`;

function getSchema() {
  return fs.fileToBuffer("prisma/schema.prisma").toString("utf-8");
}

function handleEdgeVsNode(target: "edge" | "node") {
  const schema = getSchema();

  if (target === "edge") {
    const schemaOut = schema.replace(targets, edgeTarget);
    fs.withWs("prisma/schema.prisma", schemaOut);
  } else if (target === "node") {
    const schemaOut = schema.replace(targets, nodeTarget);
    fs.withWs("prisma/schema.prisma", schemaOut);
  } else {
    console.warn(
      "you must provide a target flag and arg, eg: --target edge | --target node"
    );
  }
}

function handleRestoreFrom(target: "from-edge" | "from-node") {
  const schema = getSchema();

  if (target === "from-edge") {
    const schemaOut = schema.replace(edgeTarget, targets);
    fs.withWs("prisma/schema.prisma", schemaOut);
  } else if (target === "from-node") {
    const schemaOut = schema.replace(nodeTarget, targets);
    fs.withWs("prisma/schema.prisma", schemaOut);
  } else {
    console.warn(
      "you must provide a target flag and arg, eg: --restore from-edge | --restore from-node"
    );
  }
}

if (process.argv[2] === "--target" && process.argv[3]) {
  handleEdgeVsNode(process.argv[3] as "edge" | "node");
}

if (process.argv[2] === "--restore" && process.argv[3]) {
  handleRestoreFrom(process.argv[3] as "from-edge" | "from-node");
}
