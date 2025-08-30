import type {
  LoggerOptions,
  Logger as PinoLogger,
  TransportSingleOptions
} from "pino";
import type { PrettyOptions } from "pino-pretty";
import { UserData } from "@/types/index.ts";
import pino, { stdTimeFunctions } from "pino";
import { EventTypeMap } from "@t3-chat-clone/types";

export interface EventLogContext<T extends keyof EventTypeMap> {
  type: T;
  payload?: { [P in T]: EventTypeMap[P] }[T];
}

export interface LogContext {
  userId?: string;
  conversationId?: string;
  provider?: string;
  model?: string;
  action?: string;
  duration?: number;
  error?: unknown;
  userData?: UserData;
  [key: string]: unknown;
}
export interface LoggerConfig {
  serviceName: string;
  environment: string;
  name?: string;
  region?: string;
  taskArn?: string;
  taskDefinition?: string;
  logLevel?: string;
  isProd: boolean;
}

export class LoggerService {
  private logger: PinoLogger;

  static #pino: LoggerService | null = null;
  private readonly serviceName: string;
  private readonly config: LoggerConfig;
  private readonly options?: Partial<LoggerOptions>;

  private constructor(
    config: LoggerConfig,
    options?: Partial<LoggerOptions>,
    existing?: PinoLogger
  ) {
    this.options = options ? { ...options } : undefined;
    this.config = { ...config };
    this.serviceName = config.serviceName;
    this.logger = existing ?? this.createLogger(this.options);
  }

  public static getLoggerInstance(cfg: LoggerConfig) {
    if (this.#pino === null) {
      const config = { ...cfg, isProd: cfg.isProd } as const;
      this.#pino = new LoggerService(config, {
        name: cfg.name,
        level: cfg.isProd ? "info" : "debug",
        timestamp: stdTimeFunctions.isoTime,
        formatters: {
          level: label => ({ level: label })
        },
        base: {
          service: cfg.serviceName,
          environment: cfg.isProd,
          region: cfg.region,
          taskArn: cfg.taskArn,
          taskDefinition: cfg.taskDefinition
        }
      });
    }
    return this.#pino;
  }

  public static hasInstance() {
    return this.#pino !== null;
  }

  public static async resetInstance() {
    if (this.#pino) {
      await this.#pino.flush();
      this.#pino = null;
    }
  }

  private createLogger(customOptions?: Partial<LoggerOptions>) {
    const baseOptions = {
      name: this.serviceName,
      level: this.config.isProd ? "info" : "debug",
      timestamp: stdTimeFunctions.isoTime,
      formatters: {
        level: label => ({ level: label }),
        bindings: () => ({
          pid: process.pid,
          node_version: process.version
        })
      },
      base: {
        service: this.config.serviceName,
        environment: this.config.isProd,
        region: this.config.region,
        taskArn: this.config.taskArn,
        taskDefinition: this.config.taskDefinition
      },
      ...customOptions
    } satisfies LoggerOptions;


    // Development: pretty transport
    const prettyOptions = {
      colorize: true,
      levelFirst: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
      messageFormat: "{lvl} {pid}"
    } satisfies PrettyOptions;

    const transport = {
      target: "pino-pretty",
      options: prettyOptions
    } satisfies TransportSingleOptions;

    const devOptions = { ...baseOptions, transport } satisfies LoggerOptions & {
      transport: TransportSingleOptions;
    };
    return pino(devOptions);
  }

  // Core logging methods with context
  public inf(message: string, context?: LogContext) {
    this.logger.info(context ?? {}, message);
  }

  public debugger(message: string, context?: LogContext) {
    this.logger.debug(context ?? {}, message);
  }

  public warning(message: string, context?: LogContext) {
    this.logger.warn(context ?? {}, message);
  }

  public errored(message: string, context?: LogContext) {
    const errorContext = this.formatError(context);
    this.logger.error(errorContext, message);
  }

  public fatality(message: string, context?: LogContext) {
    const errorContext = this.formatError(context);
    this.logger.fatal(errorContext, message);
  }

  // Specialized logging methods for your WebSocket server
  public logConnection(userId: string, metadata: Record<string, unknown>) {
    this.logger.info(
      "WebSocket connection established" +
        JSON.stringify({
          userId,
          action: "ws_connect",
          ...metadata
        })
    );
  }

  public logDisconnection(userId: string, reason?: string) {
    this.logger.info(
      "WebSocket connection closed " +
        JSON.stringify({
          userId,
          action: "ws_disconnect",
          reason
        })
    );
  }

  public logEvent<
    const T extends keyof EventTypeMap,
    const L extends
      | "fatal"
      | "error"
      | "warn"
      | "info"
      | "debug"
      | "trace" = "info"
  >(level: L, { type, payload }: EventLogContext<T>) {
    switch (payload?.type) {
      case `${type}`: {
        this.logger[level]({ ...payload });
        break;
      }
      default:
        break;
    }
  }

  public trying() {
    this.logEvent("debug", {
      type: "ai_chat_chunk",
      payload: {
        done: true,
        conversationId: "",
        type: "ai_chat_chunk",
        userId: ""
      }
    });
  }

  public logAIRequest(context: {
    userId: string;
    conversationId: string;
    provider: string;
    model?: string;
    prompt?: string;
  }) {
    this.logger.info(
      "AI chat request initiated \n".concat(
        JSON.stringify({
          ...context,
          action: "ai_request",
          // Don't log full prompt in production for privacy
          prompt: this.config.isProd
            ? `[${context.prompt?.length ?? 0} chars]`
            : context.prompt
        })
      )
    );
  }

  public logAIResponse(context: {
    userId: string;
    conversationId: string;
    provider: string;
    model?: string;
    duration: number;
    tokensUsed?: number;
    error?: unknown;
  }) {
    if (context.error) {
      this.logger.error(
        "AI chat request failed " + JSON.stringify({ ...context })
      );
    } else {
      this.logger.info(
        "AI chat request completed " +
          JSON.stringify({
            ...context,
            action: "ai_response"
          })
      );
    }
  }

  public logAssetOperation(operation: string, context: LogContext) {
    this.logger.info(
      `Asset operation: ${operation}` +
        JSON.stringify({
          ...context,
          action: `asset_${operation}`
        })
    );
  }

  // Performance logging
  public startTimer(start = process.hrtime.bigint()) {
    return () => Number(process.hrtime.bigint() - start) / 1e6;
  }

  public logPerformance(
    operation: string,
    durationMs: number,
    context?: LogContext
  ) {
    if (durationMs > 5000) {
      this.logger.warn(
        `Operation completed: ${operation} ` +
          JSON.stringify({
            ...context,
            duration: Math.round(durationMs),
            action: "performance"
          })
      );
    } else {
      this.logger.debug(
        `Operation completed: ${operation} ` +
          JSON.stringify({
            ...context,
            duration: Math.round(durationMs),
            action: "performance"
          })
      );
    }
  }

  // Error formatting helper
  private formatError(context?: LogContext) {
    if (!context?.error) return context ?? {};

    const { error, ...rest } = context;
    if (error instanceof Error) {
      return {
        ...rest,
        error: {
          message: error.message,
          name: error.name,
          stack: this.config.isProd ? undefined : error.stack,
          cause: error.cause ?? {}
        }
      };
    }

    return {
      error,
      ...rest
    };
  }

  // Flush logs (important for serverless/containerized environments)

  public async flush() {
    // Pino in sync mode returns undefined from flush()
    // No need to do anything here
    // only works with sync:false
    //this.logger.flush((cb) => (cb ? {...cb} : undefined));
    return Promise.resolve();
  }

  // Get the underlying Pino instance if needed
  public getPinoInstance() {
    return this.logger;
  }
}
