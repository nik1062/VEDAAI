import type {
  IGenerationJobStateUpdate,
} from "../../shared/types/generation-job.js";
import { createRedisConnection, type RedisConnection } from "../infrastructure/redis.js";

export interface GenerationJobStatePublisher {
  publish(update: IGenerationJobStateUpdate): Promise<void>;
}

export class NoopGenerationJobStatePublisher
  implements GenerationJobStatePublisher
{
  async publish(): Promise<void> {
    await Promise.resolve();
  }
}

export class RedisGenerationJobStatePublisher
  implements GenerationJobStatePublisher
{
  private readonly redis: RedisConnection;

  constructor(redisUrl: string, redis?: RedisConnection) {
    this.redis = redis ?? createRedisConnection(redisUrl);
  }

  async publish(update: IGenerationJobStateUpdate): Promise<void> {
    const payload = JSON.stringify({
      ...update,
      occurredAt: update.occurredAt.toISOString(),
    });

    await Promise.all([
      this.redis.publish(`vedaai:generation:${update.jobId}`, payload),
      this.redis.publish("vedaai:generation", payload),
    ]);
  }
}
