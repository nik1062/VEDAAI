import {
  loadRuntimeModule,
  readRuntimeConstructor,
} from "../infrastructure/runtime-module.js";

export interface BullMqJobsOptions {
  readonly attempts?: number;
  readonly backoff?:
    | number
    | {
        readonly type: "fixed" | "exponential";
        readonly delay: number;
      };
  readonly jobId?: string;
  readonly removeOnComplete?: boolean | number;
  readonly removeOnFail?: boolean | number;
}

export interface BullMqJob<TPayload> {
  readonly id?: string;
  readonly name: string;
  readonly data: TPayload;
  readonly attemptsMade: number;
  readonly opts: BullMqJobsOptions;
  updateProgress(progress: number): Promise<void>;
}

export interface BullMqQueue<TPayload> {
  add(
    name: string,
    data: TPayload,
    options?: BullMqJobsOptions,
  ): Promise<BullMqJob<TPayload>>;
  close(): Promise<void>;
}

export interface BullMqQueueEvents {
  close(): Promise<void>;
}

export interface BullMqWorker<TPayload> {
  on(
    event: "completed",
    listener: (job: BullMqJob<TPayload>) => void,
  ): BullMqWorker<TPayload>;
  on(
    event: "failed",
    listener: (job: BullMqJob<TPayload> | undefined, error: Error) => void,
  ): BullMqWorker<TPayload>;
  on(event: "error", listener: (error: Error) => void): BullMqWorker<TPayload>;
  close(): Promise<void>;
}

interface QueueRuntimeOptions {
  readonly connection: unknown;
  readonly defaultJobOptions?: BullMqJobsOptions;
}

interface WorkerRuntimeOptions {
  readonly connection: unknown;
  readonly concurrency: number;
}

type QueueConstructor = new <TPayload>(
  name: string,
  options: QueueRuntimeOptions,
) => BullMqQueue<TPayload>;

type QueueEventsConstructor = new (
  name: string,
  options: { readonly connection: unknown },
) => BullMqQueueEvents;

type WorkerConstructor = new <TPayload>(
  name: string,
  processor: (job: BullMqJob<TPayload>) => Promise<void>,
  options: WorkerRuntimeOptions,
) => BullMqWorker<TPayload>;

export interface BullMqRuntime {
  readonly Queue: QueueConstructor;
  readonly QueueEvents: QueueEventsConstructor;
  readonly Worker: WorkerConstructor;
}

export const loadBullMqRuntime = (): BullMqRuntime => {
  const moduleRecord = loadRuntimeModule("bullmq");

  return {
    Queue: readRuntimeConstructor<QueueConstructor>(moduleRecord, "Queue"),
    QueueEvents: readRuntimeConstructor<QueueEventsConstructor>(
      moduleRecord,
      "QueueEvents",
    ),
    Worker: readRuntimeConstructor<WorkerConstructor>(moduleRecord, "Worker"),
  };
};
