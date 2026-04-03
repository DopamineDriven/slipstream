import { Fs } from "@d0paminedriven/fs";
import type { BufferEncodingUnion } from "@d0paminedriven/fs";

type Opts = {
  encoding?: BufferEncodingUnion | null | undefined;
  withFileTypes?: false | undefined;
  recursive?: boolean | undefined;
};

type Targets =
  | "root"
  | "src/auth"
  | "src/logger"
  | "src/pubsub"
  | "src/index"
  | "src/types"
  | "src/ws-server"
  | "public/inspect";

class OutputMd extends Fs {
  constructor(public override cwd: string) {
    super((cwd ??= process.cwd()));
  }

  private getTargetedDirs<const T extends Targets>(
    target: T,
    options = {
      encoding: "utf-8",
      recursive: true,
      withFileTypes: false
    } satisfies Opts
  ) {
    if (target === "root") {
      const { recursive: re = false, ...opts } = options;
      return (
        this.readDir(target, { recursive: re, ...opts })
          .filter(
            file =>
              /(?:(public|dist|patches|node_modules|\.(next|git|vscode|husky|changeset|github|turbo|gitignore|env)|pnpm-lock\.yaml))/g.test(
                file
              ) === false
          )
          .filter(file => /(?:(src\/(test|__out__)))/g.test(file) === false)
          // eslint-disable-next-line @typescript-eslint/prefer-string-starts-ends-with
          .filter(file => /\./g.test(file) && !/\.md$/g.test(file))
      );
    } else if (target === "src/index") {
      const { recursive: re = false, ...opts } = options;
      return this.readDir("src", { recursive: re, ...opts })
        .filter(file => /(?:(test|__out__))/g.test(file) === false)
        .filter(v => /\./g.test(v))
        .map(v => {
          return v;
        });
    } else
      return this.readDir(target, options)
        .filter(v => /\./g.test(v))
        .map(v => {
          return v;
        });
  }

  private getTargetedPaths<const T extends Targets>(
    tp: T,
    options = {
      encoding: "utf-8",
      recursive: true,
      withFileTypes: false
    } satisfies Opts
  ) {
    return this.getTargetedDirs(tp, options);
  }

  private fileExt(file: string) {
    return !file.startsWith(".")
      ? (file.split(/\./)?.reverse()?.[0] ?? "txt")
      : file.split(/\./gim)?.reverse()?.[0];
  }
  private commentRegex =
    // eslint-disable-next-line no-useless-escape
    /(?:(?:\/\*(?:[^*]|(?:\*+[^*\/]))*\*+\/)|(?:(?<!\:|\\\|\')\/\/.*))/gm;

  private handleComments<const T extends Targets>(
    target: T,
    file: string,
    removeComments = true
  ) {
    if (target === "root") {
      return file;
    } else if (!removeComments) {
      return file.trim();
    } else {
      return file.replace(this.commentRegex, "");
    }
  }

  public getRawFiles<const T extends Targets>(
    target: T,
    removeComments = true
  ) {
    const arr = Array.of<string>();
    try {
      return this.getTargetedPaths(target).map(file => {
        const handleInjectedTarget =
          target === "root"
            ? file
            : target === "src/index"
              ? `src/${file}`
              : `${target}/${file}`;
        const fileExtension = this.fileExt(file) === "rels" ? "xml" : this.fileExt(file);
        const fileContent =
          this.fileToBuffer(handleInjectedTarget).toString("utf-8");

        // prettier-ignore
        const toInject = `**File:** \`${handleInjectedTarget}\`

For more details, [visit the raw version of this file](https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/ws-server/${handleInjectedTarget}).

\`\`\`${fileExtension}

${this.handleComments(target, fileContent, removeComments)}

\`\`\`


**Related Resources:**
  - Raw file URL: https://raw.githubusercontent.com/DopamineDriven/t3-chat-clone/refs/heads/main/turborepo/apps/ws-server/${handleInjectedTarget}


---

`
        arr.push(toInject);
        return toInject;
      });
    } catch (err) {
      console.error(err);
    } finally {
      return arr;
    }
  }
  public incomingArgs(argv: string[]) {
    const omitComments = argv[4]?.includes("false") ? false : true;
    // prettier-ignore
    const msg = `must provide an argv3 command, \n\n index | root | auth | types | logger | pubsub | ws-server \n\n eg, \n\n \`\`\`bash \npnpm tsx src/test/output-md.ts --target ws-server\n \`\`\``;

    if (argv[3] && argv[3].length > 1) {
      if (argv[3]?.includes("auth")) {
        this.withWs(
          "src/test/__out__/auth.md",
          this.getRawFiles("src/auth", omitComments).join("\n")
        );
      } else if (argv[3]?.includes("types")) {
        this.withWs(
          "src/test/__out__/types.md",
          this.getRawFiles("src/types", omitComments).join("\n")
        );
      } else if (argv[3]?.includes("logger")) {
        this.withWs(
          "src/test/__out__/logger.md",
          this.getRawFiles("src/logger", omitComments).join("\n")
        );
      } else if (argv[3]?.includes("index")) {
        this.withWs(
          "src/test/__out__/index.md",
          this.getRawFiles("src/index", omitComments).join("\n")
        );
      } else if (argv[3]?.includes("inspect")) {
        this.withWs(
          "public/inspect/__out__/public/inspect.md",
          this.getRawFiles("public/inspect", false).join("\n")
        );
      } else if (argv[3]?.includes("pubsub")) {
        this.withWs(
          "src/test/__out__/pubsub.md",
          this.getRawFiles("src/pubsub", omitComments).join("\n")
        );
      } else if (argv[3]?.includes("ws-server")) {
        this.withWs(
          "src/test/__out__/ws-server.md",
          this.getRawFiles("src/ws-server", omitComments).join("\n")
        );
      } else if (argv[3]?.includes("root")) {
        this.withWs(
          "src/test/__out__/root.md",
          this.getRawFiles("root", omitComments).join("\n")
        );
      } else if (argv[3]?.includes("help")) {
        console.log(msg);
      } else {
        console.log(
          `argv[3] must be a valid value -- index | root | auth | types | logger | pubsub | ws-server`
        );
      }
    } else {
      console.log(msg);
    }
  }
}
const fs = new OutputMd(process.cwd());

fs.incomingArgs(process.argv);
