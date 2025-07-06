import { Fs } from "@d0paminedriven/fs";
import * as dotenv from "dotenv";
import expand from "dotenv-expand";
import { Credentials } from "@/creds/index.ts";

dotenv.config();
class Postbuild {
  constructor(
    private additions: string,
    private creds: Credentials,
    private fs: Fs
  ) {}

  private credentialParser =
    /export\s+interface\s+CredentialEntity\s*\{[\s\S]*?\}/g;
  private stripLiterals = /^(\s*[\w?]+\s*:\s*)"[^"]*",?/gm;

  private deStringifyKeys = /^(\s*)"([^"]+)"(\?)?:/gm;

  private readTypesFile() {
    return this.fs.fileToBuffer("src/types/index.ts").toString("utf-8");
  }
  private myEnv() {
    return dotenv.config({ processEnv: {} });
  }

  public parseDotEnv() {
    return expand.expand(this.myEnv());
  }

  private async getCreds() {
    const arrHelper = Array.of<[string, string]>();
    try {
      return await Promise.all([this.creds.getAll()]).then(([secrets]) => {
        return Object.entries(secrets).map(([k, v]) => {
          arrHelper.push([k, v]);
          return [k, v] as [string, string];
        });
      });
    } catch (err) {
      console.error(err);
    } finally {
      return arrHelper;
    }
  }
  // TODO -- DEEP COMPARE -- IF A KEY ALREADY EXISTS ONCE IN THE CREDENTIALS STORE AND AGAIN LOCALLY IN DOTENV REMOVE IT FROM THE TRY BLOCK BEFORE IT GETS ADDED TO THE ARRHELPER FOR MERGING
  // NOTE -- NOT AN ISSUE YET BUT COULD BECOME AN ISSUE IN THE FUTURE IF NOT CAREFUL
  public async parseAdditions() {
    const arrHelper = Array.of<[string, string]>();
    const toArr = this.additions.split(/,/g);

    try {
      const parsed = this.parseDotEnv().parsed;
      if (!parsed) throw new Error("no parsed on parse env");
      toArr.forEach(function (p) {
        if (p in parsed) {
          arrHelper.push([p, parsed[p] ?? ""]);
        }
      });
    } catch (err) {
      console.error(err);
    } finally {
      const merge = (await this.getCreds()).concat(arrHelper);
      return { arr: merge, obj: Object.fromEntries(merge) };
    }
  }

  public async rmAndReplace() {
    const { obj } = await this.parseAdditions();

    const templateWorkup = JSON.stringify(obj, null, 2);

    const flatWorkup = JSON.stringify(obj);
    const file = this.readTypesFile();
    // prettier-ignore
    const templatedToWrite = `export interface CredentialEntity ${templateWorkup} \n`.concat(file.replace(this.credentialParser, "").trim())

    const secretsTemplate = `{"secrets":[${flatWorkup}]}`;
    return Promise.all([
      this.fs.withWs("src/service/__out__/secrets.json", secretsTemplate)
    ])
      .then(([_]) => {
        this.fs.withWs("src/types/index.ts", templatedToWrite);
        return "success";
      })
      .then(async v => {
        return this.fs.wait(1000).then(() => {
          let readIt = this.fs
            .fileToBuffer("src/types/index.ts")
            .toString("utf-8");
          readIt = readIt.replace(this.deStringifyKeys, "$1$2$3?:");
          readIt = readIt.replace(this.stripLiterals, "$1string;");

          this.fs.withWs("src/types/index.ts", readIt);

          return v;
        });
      });
  }
}

if (process.argv[2] === "--secrets" && process.argv[3]) {
  const fs = new Fs(process.cwd());

  const creds = new Credentials();
  const service = new Postbuild(process.argv[3] ?? "", creds, fs);

  service.rmAndReplace().then(data => {
    return data;
  });
}
