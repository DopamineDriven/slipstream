import { Fs } from "@d0paminedriven/fs";

class SchemaService extends Fs {
  private restoreMap = new Map<string, string>();

  private nodeRegex = /generator\s+client\s*\{[^}]*\}/gm;

  private edgeRegex = /generator\s+edge\s*\{[^}]*\}/gm;

  private groupRegex =
    /generator\s+client\s*\{[^}]*\}(\s)+generator\s+edge\s*\{[^}]*\}|generator\s+edge\s*\{[^}]*\}(\s)+generator\s+client\s*\{[^}]*\}/gm;

  private targetsFile = "src/test/__out__/targets.txt" as const;

  constructor(public override cwd: string) {
    super((cwd ??= process.cwd()));
  }

  private schema() {
    return this.fileToBuffer("prisma/schema.prisma").toString("utf-8");
  }

  private exeTarget<
    const T extends "edge" | "from-edge" | "node" | "from-node" | "both"
  >(target: T) {
    if (target === "edge" || target === "from-edge") {
      return this.edgeRegex.exec(this.schema())?.[0];
    } else if (target === "node" || target === "from-node") {
      return this.nodeRegex.exec(this.schema())?.[0];
    } else return this.groupRegex.exec(this.schema())?.[0];
  }

  public replace<const T extends "edge" | "node">(target: T) {
    // this.restoreMap.set("schema-initial", this.schema);
    const targeted = this.exeTarget(target);
    const targets = this.exeTarget("both");
    if (targeted && targets) {
      try {
        this.restoreMap.set("targets", targets);
        this.withWs(this.targetsFile, targets);
      } finally {
        this.withWs(
          "prisma/schema.prisma",
          this.schema().replace(targets, targeted)
        );
      }
    } else {
      console.warn(
        "must provide a target flag and arg, eg: --target edge | --target node"
      );
    }
  }

  public restore<const T extends "from-edge" | "from-node">(target: T) {
    const targets = this.restoreMap.get("targets");
    const targeted = this.exeTarget(target);
    if (targeted) {
      if (!targets) {
        const targets = this.fileToBuffer(this.targetsFile).toString("utf-8");
        const schemaOut = this.schema().replace(targeted, targets);
        this.withWs("prisma/schema.prisma", schemaOut);
        return;
      }
      const schemaOut = this.schema().replace(targeted, targets);
      this.withWs("prisma/schema.prisma", schemaOut);
    } else {
      console.warn(
        "you must provide a target flag and arg, eg: --restore from-edge | --restore from-node"
      );
    }
  }
}

const manipulate = new SchemaService(process.cwd());

if (process.argv[2] === "--target" && process.argv[3]) {
  manipulate.replace(process.argv[3] as "edge" | "node");
}

if (process.argv[2] === "--restore" && process.argv[3]) {
  manipulate.restore(process.argv[3] as "from-edge" | "from-node");
}
