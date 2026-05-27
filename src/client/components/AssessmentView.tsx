import {
  AlertCircle,
  ArrowLeft,
  ChevronLeft,
  Download,
  Loader2,
  Printer,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import type { IAssessment, IQuestion } from "../../shared/types/assessment.js";
import { getAssessment } from "../api/assessments.api.js";

interface AssessmentViewProps {
  readonly assessmentId: string;
  readonly ownerId: string;
  readonly onBack: () => void;
  readonly onRegenerate: () => void;
}

const DifficultyBadge = ({
  difficulty,
}: {
  difficulty: IQuestion["difficulty"];
}): ReactElement => {
  const colorClass =
    difficulty === "Easy"
      ? "badge-easy"
      : difficulty === "Moderate"
      ? "badge-moderate"
      : "badge-hard";

  return <span className={`difficulty-badge ${colorClass}`}>{difficulty}</span>;
};

export const AssessmentView = ({
  assessmentId,
  ownerId,
  onBack,
  onRegenerate,
}: AssessmentViewProps): ReactElement => {
  const [assessment, setAssessment] = useState<IAssessment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchAssessment = async (): Promise<void> => {
      try {
        const data = await getAssessment(assessmentId, ownerId);
        if (isMounted) {
          setAssessment(data.assessment);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load assessment.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void fetchAssessment();

    return () => {
      isMounted = false;
    };
  }, [assessmentId, ownerId]);

  const handlePrint = (): void => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="assessment-loading">
        <Loader2 className="spin" size={48} />
        <p>Loading your assessment...</p>
      </div>
    );
  }

  if (error !== null || assessment === null) {
    return (
      <div className="assessment-error-shell">
        <div className="feedback feedback-error">
          <AlertCircle size={24} />
          <span>{error ?? "Assessment not found."}</span>
        </div>
        <button className="secondary-button" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to Creator
        </button>
      </div>
    );
  }

  return (
    <div className="assessment-view-container">
      <header className="view-header no-print">
        <div className="header-left">
          <button className="icon-button" onClick={onBack} title="Back">
            <ChevronLeft size={20} />
          </button>
          <div className="header-info">
            <h1>{assessment.title}</h1>
            <p>Generated via VedaAI • {new Date(assessment.createdAt).toLocaleDateString()}</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={onRegenerate}>
            <RefreshCw size={16} />
            <span>Regenerate</span>
          </button>
          <button className="primary-button" onClick={handlePrint}>
            <Printer size={16} />
            <span>Download PDF</span>
          </button>
        </div>
      </header>

      <main className="assessment-paper">
        <div className="paper-header">
          <div className="school-info">
            <h2>VEDA AI ASSESSMENT</h2>
            <p className="assessment-title">{assessment.title}</p>
          </div>
          
          <div className="exam-meta">
            <div className="meta-item">
              <span>Time Allowed:</span>
              <span>2 Hours</span>
            </div>
            <div className="meta-item">
              <span>Maximum Marks:</span>
              <span>{assessment.totalMarks}</span>
            </div>
          </div>
        </div>

        <div className="student-info-grid">
          <div className="info-field">
            <label>Name:</label>
            <div className="input-line"></div>
          </div>
          <div className="info-field">
            <label>Roll Number:</label>
            <div className="input-line"></div>
          </div>
          <div className="info-field">
            <label>Section:</label>
            <div className="input-line"></div>
          </div>
          <div className="info-field">
            <label>Date:</label>
            <div className="input-line"></div>
          </div>
        </div>

        <div className="instructions-section">
          <h3>General Instructions:</h3>
          <ul className="instructions-list">
            {assessment.globalInstructions.map((instruction, index) => (
              <li key={index}>{instruction}</li>
            ))}
          </ul>
        </div>

        {assessment.sections.map((section) => (
          <section key={section.sectionId} className="section-block">
            <div className="section-header">
              <div className="section-title-group">
                <h3>{section.title}</h3>
                <p className="section-instruction">{section.instructions}</p>
              </div>
              <span className="section-marks">[{section.totalMarks} Marks]</span>
            </div>

            <div className="questions-list">
              {section.questions.map((question, qIndex) => (
                <div key={question.questionId} className="question-item">
                  <div className="question-content">
                    <div className="question-text-row">
                      <span className="question-number">{qIndex + 1}.</span>
                      <p className="question-text">{question.prompt}</p>
                      <span className="question-marks">[{question.marks} Marks]</span>
                    </div>

                    {question.questionType === "MCQ" && (
                      <div className="mcq-options">
                        {question.options.map((option) => (
                          <div key={option.key} className="option-item">
                            <span className="option-key">{option.key})</span>
                            <span className="option-text">{option.text}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {(question.questionType === "ShortAnswer" || question.questionType === "LongAnswer") && (
                      <div className="answer-space">
                        {[...Array(question.questionType === "ShortAnswer" ? 2 : 5)].map((_, i) => (
                          <div key={i} className="answer-line"></div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        <footer className="paper-footer">
          <p>End of Question Paper</p>
        </footer>
      </main>
    </div>
  );
};
