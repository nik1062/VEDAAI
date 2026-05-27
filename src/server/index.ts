import "dotenv/config";
import { createServer } from "node:http";
import { loadRuntimeEnv } from "./config/env.js";
import { connectMongo, disconnectMongo } from "./database/mongoose.js";
import { createApplication } from "./app.js";
import { GenerationWebSocketGateway } from "./websocket/GenerationWebSocketGateway.js";

const env = loadRuntimeEnv();
await connectMongo(env);

const { app, queueBundle } = createApplication(env);
const httpServer = createServer(app);
const generationGateway = new GenerationWebSocketGateway({
  httpServer,
  redisUrl: env.redisUrl,
});

await generationGateway.start();

await new Promise<void>((resolve) => {
  httpServer.listen(env.port, "0.0.0.0", () => {
    console.log(`VedaAI API listening on port ${env.port}.`);
    resolve();
  });
});

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  console.log(`Received ${signal}. Shutting down VedaAI API.`);

  await Promise.allSettled([
    generationGateway.close(),
    queueBundle.queueEvents.close(),
    queueBundle.queue.close(),
    queueBundle.connection.quit(),
    disconnectMongo(),
  ]);

  httpServer.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", (signal) => {
  void shutdown(signal);
});

process.on("SIGTERM", (signal) => {
  void shutdown(signal);
});
