import { create } from "zustand";
import type { AcceptedAssessmentResponse } from "../api/assessments.api.js";

export type AssignmentSubmissionStatus =
  | "idle"
  | "submitting"
  | "accepted"
  | "failed";

interface AssignmentCreationState {
  readonly status: AssignmentSubmissionStatus;
  readonly acceptedJob: AcceptedAssessmentResponse | null;
  readonly errorMessage: string | null;
  readonly submittedAt: string | null;
  setSubmitting(): void;
  setAccepted(job: AcceptedAssessmentResponse): void;
  setFailed(message: string): void;
  reset(): void;
}

export const useAssignmentCreationStore = create<AssignmentCreationState>(
  (set) => ({
    status: "idle",
    acceptedJob: null,
    errorMessage: null,
    submittedAt: null,
    setSubmitting: () => {
      set({
        status: "submitting",
        acceptedJob: null,
        errorMessage: null,
        submittedAt: null,
      });
    },
    setAccepted: (job) => {
      set({
        status: "accepted",
        acceptedJob: job,
        errorMessage: null,
        submittedAt: new Date().toISOString(),
      });
    },
    setFailed: (message) => {
      set({
        status: "failed",
        errorMessage: message,
      });
    },
    reset: () => {
      set({
        status: "idle",
        acceptedJob: null,
        errorMessage: null,
        submittedAt: null,
      });
    },
  }),
);
