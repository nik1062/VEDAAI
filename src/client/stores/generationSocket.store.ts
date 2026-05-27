import { create } from "zustand";
import { z } from "zod";
import { generationJobStateSchema } from "../../shared/validation/assessment-generation.schema.js";
import { buildGenerationWebSocketUrl } from "../api/assessments.api.js";

const generationStateEnvelopeSchema = z
  .object({
    type: z.literal("generation_state"),
    update: generationJobStateSchema,
  })
  .strict();

export type SocketConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "closed"
  | "failed";

export type GenerationStateUpdate = z.infer<typeof generationJobStateSchema>;

interface ConnectInput {
  readonly jobId: string;
  readonly assessmentId: string;
}

interface GenerationSocketState {
  readonly connectionStatus: SocketConnectionStatus;
  readonly activeJobId: string | null;
  readonly activeAssessmentId: string | null;
  readonly latestUpdate: GenerationStateUpdate | null;
  readonly errorMessage: string | null;
  connect(input: ConnectInput): void;
  disconnect(): void;
  reset(): void;
}

let activeSocket: WebSocket | null = null;

const closeActiveSocket = (): void => {
  if (activeSocket !== null) {
    activeSocket.close();
    activeSocket = null;
  }
};

export const useGenerationSocketStore = create<GenerationSocketState>(
  (set, get) => ({
    connectionStatus: "idle",
    activeJobId: null,
    activeAssessmentId: null,
    latestUpdate: null,
    errorMessage: null,
    connect: ({ jobId, assessmentId }) => {
      const currentState = get();

      if (
        currentState.activeJobId === jobId &&
        currentState.connectionStatus === "connected"
      ) {
        return;
      }

      closeActiveSocket();
      set({
        connectionStatus: "connecting",
        activeJobId: jobId,
        activeAssessmentId: assessmentId,
        latestUpdate: null,
        errorMessage: null,
      });

      const socket = new WebSocket(buildGenerationWebSocketUrl(jobId, assessmentId));
      activeSocket = socket;

      socket.addEventListener("open", () => {
        set({ connectionStatus: "connected", errorMessage: null });
      });

      socket.addEventListener("message", (event) => {
        const rawData = typeof event.data === "string" ? event.data : "";

        if (rawData.length === 0) {
          return;
        }

        let parsedJson: unknown;

        try {
          parsedJson = JSON.parse(rawData) as unknown;
        } catch {
          set({ errorMessage: "Received an invalid real-time update." });
          return;
        }

        const parsedPayload = generationStateEnvelopeSchema.safeParse(parsedJson);

        if (parsedPayload.success) {
          set({ latestUpdate: parsedPayload.data.update });
        }
      });

      socket.addEventListener("close", () => {
        set((state) => ({
          connectionStatus:
            state.connectionStatus === "failed" ? "failed" : "closed",
        }));
      });

      socket.addEventListener("error", () => {
        set({
          connectionStatus: "failed",
          errorMessage: "Real-time connection failed.",
        });
      });
    },
    disconnect: () => {
      closeActiveSocket();
      set({ connectionStatus: "closed" });
    },
    reset: () => {
      closeActiveSocket();
      set({
        connectionStatus: "idle",
        activeJobId: null,
        activeAssessmentId: null,
        latestUpdate: null,
        errorMessage: null,
      });
    },
  }),
);
