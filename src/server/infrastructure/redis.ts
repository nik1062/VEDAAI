import {
  loadRuntimeModule,
  readRuntimeConstructor,
} from "./runtime-module.js";

export interface RedisConnectionOptions {
  readonly maxRetriesPerRequest: number | null;
  readonly enableReadyCheck: boolean;
  readonly lazyConnect?: boolean;
  readonly family?: number;
  readonly reconnectOnError?: (err: Error) => boolean;
}

export interface RedisConnection {
  readonly status?: string;
  duplicate(): RedisConnection;
  publish(channel: string, message: string): Promise<number>;
  subscribe(...channels: string[]): Promise<number>;
  on(event: "message", listener: (channel: string, message: string) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  quit(): Promise<string>;
  disconnect(): void;
}

type RedisConstructor = new (
  url: string,
  options: RedisConnectionOptions,
) => RedisConnection;

const loadRedisConstructor = (): RedisConstructor => {
  const moduleRecord = loadRuntimeModule("ioredis");

  if (typeof moduleRecord === "function") {
    return moduleRecord as unknown as RedisConstructor;
  }

  const defaultExport = moduleRecord.default;

  if (typeof defaultExport === "function") {
    return defaultExport as RedisConstructor;
  }

  return readRuntimeConstructor<RedisConstructor>(moduleRecord, "Redis");
};

export const createRedisConnection = (
  redisUrl: string,
  options?: Partial<RedisConnectionOptions>,
): RedisConnection => {
  const Redis = loadRedisConstructor();

  return new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    family: 0, // Try both IPv4 and IPv6
    reconnectOnError: (err: Error) => {
      const targetError = "READONLY";
      if (err.message.includes(targetError)) {
        return true;
      }
      return false;
    },
    ...options,
  });
};
