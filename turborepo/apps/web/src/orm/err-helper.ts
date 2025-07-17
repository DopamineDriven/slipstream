export const errHelper = <
  const L extends
    | "debug"
    | "group"
    | "error"
    | "info"
    | "log"
    | "table"
    | "warn"
>(
  err: unknown,
  target?: L
) => {
  if (!target) {
    return console.info(
      err instanceof Error ? err.message : JSON.stringify(err, null, 2)
    );
  } else
    return console[target](
      err instanceof Error ? err.message : JSON.stringify(err, null, 2)
    );
};

export class ErrorHelperService {
  public errHelper = <
    const L extends
      | "debug"
      | "group"
      | "error"
      | "info"
      | "log"
      | "table"
      | "warn"
  >(
    err: unknown,
    target?: L
  ) => {
    if (!target) {
      return console.info(
        err instanceof Error ? err.message : JSON.stringify(err, null, 2)
      );
    } else
      return console[target](
        err instanceof Error ? err.message : JSON.stringify(err, null, 2)
      );
  };
}
