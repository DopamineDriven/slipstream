
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
