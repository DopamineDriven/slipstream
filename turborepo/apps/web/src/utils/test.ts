import type { ExpandedImgSpecs } from "@d0paminedriven/metadata";

/**
 *
 * made up PORT_ONE, PORT_TWO, and PORT_THREE .env vars with no actual meaning other than testing
 * this allowed me to verify that the value for PORT as defined in the .env file (3333) could be
 * programmatically replaced by executing a cli process as shown below
 *
 * reference for key-vals defined in .env:
 *
 * ```sh
 * PORT=3333
 * PORT_ONE=4444
 * PORT_TWO=5555
 * PORT_THREE==6666
 *```
 *The script workup:
 *
  ```json
  {
    "test:set:1": "dotenv -- pnpm _test:set:1",
    "test:set:2": "dotenv -- pnpm _test:set:2",
    "test:set:3": "dotenv -- pnpm _test:set:3",
    "_test:set:1": "PORT=$PORT_ONE tsx src/utils/test.ts",
    "_test:set:2": "PORT=$PORT_TWO tsx src/utils/test.ts",
    "_test:set:3": "PORT=$PORT_THREE tsx src/utils/test.ts",
  }
  ```

the output:

 ```bash
$ pnpm test:set:1

> test:set:1 /home/dopaminedriven/cloneathon/t3-chat-clone/turborepo/apps/web
> dotenv -- pnpm _test:set:1


> _test:set:1 /home/dopaminedriven/cloneathon/t3-chat-clone/turborepo/apps/web
> PORT=$PORT_ONE tsx src/utils/test.ts

4444


$ pnpm test:set:2

> test:set:2 /home/dopaminedriven/cloneathon/t3-chat-clone/turborepo/apps/web
> dotenv -- pnpm _test:set:2


> _test:set:2 /home/dopaminedriven/cloneathon/t3-chat-clone/turborepo/apps/web
> PORT=$PORT_TWO tsx src/utils/test.ts

5555

$ pnpm test:set:3

> test:set:3 /home/dopaminedriven/cloneathon/t3-chat-clone/turborepo/apps/web
> dotenv -- pnpm _test:set:3


> _test:set:3 /home/dopaminedriven/cloneathon/t3-chat-clone/turborepo/apps/web
> PORT=$PORT_THREE tsx src/utils/test.ts

6666
```
---

Passing arbitrary args to hardcoded package.json scripts *just works*

Consider the following appended args `--target hello` as shown below

```bash
$ pnpm test:set:3 --target hello

> test:set:3 /home/dopaminedriven/cloneathon/t3-chat-clone/turborepo/apps/web
> dotenv -- pnpm _test:set:3 --target hello


> _test:set:3 /home/dopaminedriven/cloneathon/t3-chat-clone/turborepo/apps/web
> PORT=$PORT_THREE tsx src/utils/test.ts --target hello

6666 hello
```


 ```
    */

const testing = () => {
  if (process.argv[3] && process.argv[3].length > 1) {
    return (process.env.PORT ?? "no port") + ` ${process.argv[3]}`;
  } else return process.env.PORT ?? "no port";
};

console.log(testing());

function gcd(u: number, v: number): number {
  if (u === v) return u;
  if (u === 0) return v;
  if (v === 0) return u;

  if (~u & 1)
    if (v & 1) return gcd(u >> 1, v);
    else return gcd(u >> 1, v >> 1) << 1;

  if (~v & 1) return gcd(u, v >> 1);

  if (u > v) return gcd((u - v) >> 1, v);

  return gcd((v - u) >> 1, u) as number;
}

function ratio(w: number, h: number) {
  const p = gcd(w, h);
  return [w / p, h / p] as const;
}

const arr = Array.of<{ src: string; ratio: readonly [number, number] }>();
async function toMotionProps() {
  const [{ Extract }, { Fs }] = await Promise.all([
    import("@d0paminedriven/metadata"),
    import("@d0paminedriven/fs")
  ] as const);
  const fs = new Fs(process.cwd());
  const extract = new Extract();

  const readIt = fs
    .readDir("src/assets", { recursive: true })
    .map(t => [t, fs.fileToBuffer(`src/assets/${t}`)] as const);

  for (const [src, buf] of readIt) {
    const specs = (await extract.extractRemote(
      buf,
      4096 * 32
    )) as ExpandedImgSpecs;

    // const[n,d] = ratio(specs.width, specs.height);

    fs.withWs(`public/ui/${src}`, buf);

    arr.push({ src: `/ui/${src}`, ratio: ratio(specs.width, specs.height) });
  }
  // const ratios = [`${ratio[0]}/${ratio[1]}`, ratio[0]/ratio[1]]
  const template = JSON.stringify(
    arr.map(({ ratio, src }) => ({ src, ratio: ratio[0] / ratio[1] })),
    null,
    2
  );
  fs.withWs(
    `src/ui/atoms/stack/generated.tsx`,
    `export const defaultImages = ` + template
  );
}
toMotionProps();
