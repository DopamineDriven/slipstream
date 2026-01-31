import { DbServiceAccelerate } from "./db-accelerate.ts";
import { DbService } from "./db.ts";

export interface DbOpts {
  connectionString: string;
  poolMax?: number;
  idleTimeoutMs?: number;
}
export interface HasDbOpts {
  readonly dbOpts: DbOpts;
}

export function dbBaseMixin<TBase extends Constructor>(Base: TBase) {
  return class DbBase extends Base implements HasDbOpts {
    readonly dbOpts: DbOpts;
    static sharedDbOpts: DbOpts;

    constructor(...args: any[]) {
      super(...(args as ConstructorParameters<TBase>));
      const maybeOpts = args[0] as DbOpts | undefined;
      this.dbOpts = maybeOpts ?? DbBase.sharedDbOpts;
    }

    static setSharedDbOpts(opts: DbOpts) {
      this.sharedDbOpts = opts;
    }
  };
}
export function DbServiceMixin<TBase extends Constructor<any[], HasDbOpts>>(
  Base: TBase
) {
  type DbSB = DbService;
  return class DbServiceMixinClass extends Base implements HasDbOpts {
    #dbBase?: DbSB;
    static sharedDbBase?: DbSB;

    get dbBase() {
      if (!this.#dbBase) {
        const shared = (this.constructor as typeof DbServiceMixinClass)
          .sharedDbBase;
        if (shared) {
          this.#dbBase = shared;
        } else {
          const {
            connectionString,
            poolMax = 100,
            idleTimeoutMs = 30000
          } = this.dbOpts;
          this.#dbBase = new DbService(
            connectionString,
            poolMax,
            idleTimeoutMs
          );
        }
      }
      return this.#dbBase;
    }

    static setSharedDbBase(instance: DbSB) {
      this.sharedDbBase = instance;
    }
  };
}

export function DbAccelerateMixin<TBase extends Constructor<any[], HasDbOpts>>(
  Base: TBase
) {
  type DbSA = DbServiceAccelerate;
  return class DbAccelerateMixinClass extends Base implements HasDbOpts {
    #dbAccelerate?: DbSA;
    static sharedDbAccelerate?: DbSA;

    get dbAccelerate() {
      if (!this.#dbAccelerate) {
        const shared = (this.constructor as typeof DbAccelerateMixinClass)
          .sharedDbAccelerate;
        if (shared) {
          this.#dbAccelerate = shared;
        } else {
          const {
            connectionString,
            poolMax = 100,
            idleTimeoutMs = 30000
          } = this.dbOpts;
          this.#dbAccelerate = new DbServiceAccelerate(
            connectionString,
            poolMax,
            idleTimeoutMs
          );
        }
      }
      return this.#dbAccelerate;
    }

    static setSharedDbAccelerate(instance: DbSA) {
      this.sharedDbAccelerate = instance;
    }
  };
}
class ServiceBase {
  constructor(protected opts: DbOpts) {}
}

export class PrismaDbService extends DbAccelerateMixin(
  DbServiceMixin(dbBaseMixin(ServiceBase))
) {
  public p(withAccelerate?: false | undefined): typeof this.dbBase.prismaClient;
  public p(
    withAccelerate: true | undefined
  ): typeof this.dbAccelerate.prismaClient;
  public p<const T extends boolean = true>(accelerate = true as T) {
    if (accelerate) {
      return this.dbAccelerate.prismaClient;
    } else {
      return this.dbBase.prismaClient;
    }
  }
}

export type Constructor<A extends unknown[] = any[], I = object> = new (
  ...args: A
) => I;
export type { PrismaClient } from "./generated/prisma/client.ts";
