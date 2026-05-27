import { Printer } from "lucide-react";
import { useState } from "react";
import type { ReactElement } from "react";
import { AssignmentCreationForm } from "./components/AssignmentCreationForm.js";
import { AssessmentView } from "./components/AssessmentView.js";
import { useAssignmentCreationStore } from "./stores/assignmentCreation.store.js";
import { useGenerationSocketStore } from "./stores/generationSocket.store.js";

export const App = (): ReactElement => {
  const [view, setView] = useState<{
    type: "form" | "view";
    assessmentId?: string;
    ownerId?: string;
  }>({ type: "form" });

  const latestUpdate = useGenerationSocketStore((state) => state.latestUpdate);
  const activeAssessmentId = useGenerationSocketStore((state) => state.activeAssessmentId);
  const acceptedJobId = useAssignmentCreationStore((state) => state.acceptedJob?.assessmentId);
  const submissionStatus = useAssignmentCreationStore((state) => state.status);

  // If we have a completed update and we are still in form view, we could offer a way to navigate
  const handleViewAssessment = (assessmentId: string, ownerId: string): void => {
    setView({ type: "view", assessmentId, ownerId });
  };

  const handleBackToForm = (): void => {
    setView({ type: "form" });
  };

  const handleRegenerate = (): void => {
    // Reset socket and go back to form to allow adjustments before re-creating
    useGenerationSocketStore.getState().reset();
    setView({ type: "form" });
  };

  if (view.type === "view" && view.assessmentId && view.ownerId) {
    return (
      <AssessmentView
        assessmentId={view.assessmentId}
        ownerId={view.ownerId}
        onBack={handleBackToForm}
        onRegenerate={handleRegenerate}
      />
    );
  }

  const finalAssessmentId = activeAssessmentId || acceptedJobId;
  const showViewButton = latestUpdate?.event === "completed" || submissionStatus === "accepted";

  return (
    <div className="app-root">
      <AssignmentCreationForm />
      {showViewButton && finalAssessmentId && (
        <div className="navigation-overlay no-print">
          <button 
            className="primary-button floating-action" 
            onClick={() => handleViewAssessment(finalAssessmentId, "demo-owner")}
          >
            View Paper
          </button>
        </div>
      )}
    </div>
  );
};
