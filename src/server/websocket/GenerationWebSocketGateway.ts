import type { IncomingMessage, Server as HttpServer } from "node:http";
import { URL } from "node:url";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { z } from "zod";
import {
  generationJobStateSchema,
} from "../../shared/validation/assessment-generation.schema.js";
import { createRedisConnection, type RedisConnection } from "../infrastructure/redis.js";

interface GenerationWebSocketGatewayOptions {
  readonly httpServer: HttpServer;
  readonly redisUrl: string;
  readonly path?: string;
}

const subscriptionMessageSchema = z
  .object({
    type: z.literal("subscribe"),
    jobId: z.string().trim().min(8).max(128).optional(),
    assessmentId: z.string().trim().min(8).max(128).optional(),
  })
  .strict()
  .refine(
    (message) =>
      message.jobId !== undefined || message.assessmentId !== undefined,
    "Subscription must include jobId or assessmentId.",
  );

const roomFromJobId = (jobId: string): string => `job:${jobId}`;
const roomFromAssessmentId = (assessmentId: string): string =>
  `assessment:${assessmentId}`;

const parseRequestUrl = (request: IncomingMessage): URL => {
  const host = request.headers.host ?? "localhost";
  const requestUrl = request.url ?? "/";

  return new URL(requestUrl, `http://${host}`);
};

export class GenerationWebSocketGateway {
  private readonly websocketServer: WebSocketServer;
  private readonly subscriber: RedisConnection;
  private readonly rooms = new Map<string, Set<WebSocket>>();
  private readonly socketRooms = new Map<WebSocket, Set<string>>();
  private readonly liveness = new WeakMap<WebSocket, boolean>();
  private heartbeatTimer: NodeJS.Timeout | undefined;

  constructor(options: GenerationWebSocketGatewayOptions) {
    this.websocketServer = new WebSocketServer({ noServer: true });
    this.subscriber = createRedisConnection(options.redisUrl);

    options.httpServer.on("upgrade", (request, socket, head) => {
      const requestUrl = parseRequestUrl(request);

      if (requestUrl.pathname !== (options.path ?? "/ws/generation")) {
        return;
      }

      this.websocketServer.handleUpgrade(request, socket, head, (websocket) => {
        this.websocketServer.emit("connection", websocket, request);
      });
    });

    this.websocketServer.on("connection", (websocket, request) => {
      console.log(`[WS] New connection attempt from ${request.socket.remoteAddress}`);
      this.registerConnection(websocket, request);
    });
  }

  async start(): Promise<void> {
    console.log("[WS] Subscribing to vedaai:generation channel...");
    await this.subscriber.subscribe("vedaai:generation");
    this.subscriber.on("message", (channel, message) => {
      console.log(`[WS] Received message on channel ${channel}: ${message.slice(0, 100)}...`);
      this.handleRedisMessage(message);
    });
    this.subscriber.on("error", (error) => {
      console.error(`Generation websocket Redis error: ${error.message}`);
    });
    this.heartbeatTimer = setInterval(() => this.heartbeat(), 30_000);
  }

  async close(): Promise<void> {
    if (this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer);
    }

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        this.websocketServer.close((error) => {
          if (error !== undefined) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
      this.subscriber.quit().then(() => undefined),
    ]);
  }

  private registerConnection(
    websocket: WebSocket,
    request: IncomingMessage,
  ): void {
    this.liveness.set(websocket, true);
    const requestUrl = parseRequestUrl(request);
    const jobId = requestUrl.searchParams.get("jobId");
    const assessmentId = requestUrl.searchParams.get("assessmentId");

    if (jobId !== null) {
      this.subscribe(websocket, roomFromJobId(jobId));
    }

    if (assessmentId !== null) {
      this.subscribe(websocket, roomFromAssessmentId(assessmentId));
    }

    if ((this.socketRooms.get(websocket)?.size ?? 0) === 0) {
      websocket.close(1008, "jobId or assessmentId query parameter is required.");
      return;
    }

    websocket.on("pong", () => {
      this.liveness.set(websocket, true);
    });
    websocket.on("message", (data) => {
      this.handleSocketMessage(websocket, data);
    });
    websocket.on("close", () => {
      this.unregisterSocket(websocket);
    });
  }

  private handleSocketMessage(websocket: WebSocket, data: RawData): void {
    try {
      const payloadText = Buffer.isBuffer(data)
        ? data.toString("utf8")
        : data.toString();
      const parsedPayload: unknown = JSON.parse(payloadText);
      const message = subscriptionMessageSchema.parse(parsedPayload);

      if (message.jobId !== undefined) {
        this.subscribe(websocket, roomFromJobId(message.jobId));
      }

      if (message.assessmentId !== undefined) {
        this.subscribe(websocket, roomFromAssessmentId(message.assessmentId));
      }

      websocket.send(
        JSON.stringify({
          type: "subscribed",
          jobId: message.jobId,
          assessmentId: message.assessmentId,
        }),
      );
    } catch {
      websocket.send(
        JSON.stringify({
          type: "error",
          code: "INVALID_SOCKET_MESSAGE",
          message: "WebSocket messages must be valid subscription payloads.",
        }),
      );
    }
  }

  private handleRedisMessage(message: string): void {
    try {
      const parsedPayload: unknown = JSON.parse(message);
      const update = generationJobStateSchema.parse(parsedPayload);
      const serializedUpdate = JSON.stringify({
        type: "generation_state",
        update,
      });

      this.broadcast(roomFromJobId(update.jobId), serializedUpdate);
      this.broadcast(roomFromAssessmentId(update.assessmentId), serializedUpdate);
    } catch (error: unknown) {
      const messageText =
        error instanceof Error ? error.message : "Unknown Redis payload error.";
      console.error(`Invalid generation state payload: ${messageText}`);
    }
  }

  private subscribe(websocket: WebSocket, room: string): void {
    const roomSockets = this.rooms.get(room) ?? new Set<WebSocket>();
    roomSockets.add(websocket);
    this.rooms.set(room, roomSockets);

    const rooms = this.socketRooms.get(websocket) ?? new Set<string>();
    rooms.add(room);
    this.socketRooms.set(websocket, rooms);
  }

  private unregisterSocket(websocket: WebSocket): void {
    const rooms = this.socketRooms.get(websocket);

    if (rooms !== undefined) {
      rooms.forEach((room) => {
        const roomSockets = this.rooms.get(room);
        roomSockets?.delete(websocket);

        if (roomSockets?.size === 0) {
          this.rooms.delete(room);
        }
      });
    }

    this.socketRooms.delete(websocket);
  }

  private broadcast(room: string, message: string): void {
    const roomSockets = this.rooms.get(room);

    if (roomSockets === undefined) {
      return;
    }

    roomSockets.forEach((websocket) => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.send(message);
      }
    });
  }

  private heartbeat(): void {
    this.websocketServer.clients.forEach((websocket) => {
      if (this.liveness.get(websocket) === false) {
        websocket.terminate();
        return;
      }

      this.liveness.set(websocket, false);
      websocket.ping();
    });
  }
}
