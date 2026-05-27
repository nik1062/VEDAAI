import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  BadgePlus,
  CalendarClock,
  CheckCircle2,
  FileText,
  Hash,
  Loader2,
  Send,
  Upload,
} from "lucide-react";
import { useMemo } from "react";
import type { ReactElement } from "react";
import {
  type SubmitHandler,
  useForm,
} from "react-hook-form";
import { QUESTION_TYPES, type QuestionType } from "../../shared/types/assessment.js";
import { createAssessment } from "../api/assessments.api.js";
import { useAssignmentCreationStore } from "../stores/assignmentCreation.store.js";
import { useGenerationSocketStore } from "../stores/generationSocket.store.js";
import {
  assignmentFormSchema,
  type AssignmentFormInput,
  type AssignmentFormOutput,
} from "../validation/assignment-form.schema.js";

interface FieldErrorTextProps {
  readonly message: string | undefined;
}

const questionTypeLabels: Record<QuestionType, string> = {
  MCQ: "MCQs",
  ShortAnswer: "Short answer",
  LongAnswer: "Long answer",
};

const toDateTimeLocalValue = (date: Date): string => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
};

const FieldErrorText = ({
  message,
}: FieldErrorTextProps): ReactElement | null => {
  if (message === undefined) {
    return null;
  }

  return (
    <p className="field-error">
      <AlertCircle size={14} aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
};

export const AssignmentCreationForm = (): ReactElement => {
  const status = useAssignmentCreationStore((state) => state.status);
  const acceptedJob = useAssignmentCreationStore((state) => state.acceptedJob);
  const errorMessage = useAssignmentCreationStore((state) => state.errorMessage);
  const setSubmitting = useAssignmentCreationStore((state) => state.setSubmitting);
  const setAccepted = useAssignmentCreationStore((state) => state.setAccepted);
  const setFailed = useAssignmentCreationStore((state) => state.setFailed);
  const resetSubmission = useAssignmentCreationStore((state) => state.reset);
  const socketStatus = useGenerationSocketStore(
    (state) => state.connectionStatus,
  );
  const latestUpdate = useGenerationSocketStore((state) => state.latestUpdate);
  const connectSocket = useGenerationSocketStore((state) => state.connect);
  const minDueDate = useMemo(
    () => toDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1_000)),
    [],
  );
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting, isValid },
  } = useForm<AssignmentFormInput, undefined, AssignmentFormOutput>({
    resolver: zodResolver(assignmentFormSchema),
    mode: "onChange",
    defaultValues: {
      ownerId: "demo-owner",
      dueDate: minDueDate,
      questionTypes: ["MCQ"],
      numberOfQuestions: 10,
      totalMarks: 50,
      additionalInstructions: "",
    },
  });
  const watchedFileList = watch("sourceFile");
  const selectedFile = watchedFileList?.item(0) ?? null;
  const isBusy = isSubmitting || status === "submitting";

  const submitForm: SubmitHandler<AssignmentFormOutput> = async (values) => {
    const sourceFile = values.sourceFile.item(0);

    if (sourceFile === null) {
      setFailed("Source file is required.");
      return;
    }

    setSubmitting();

    try {
      const result = await createAssessment({
        ownerId: values.ownerId,
        sourceFile,
        dueDate: values.dueDate,
        questionTypes: values.questionTypes,
        numberOfQuestions: values.numberOfQuestions,
        totalMarks: values.totalMarks,
        ...(values.additionalInstructions === undefined
          ? {}
          : { additionalInstructions: values.additionalInstructions }),
      });

      setAccepted(result);
      connectSocket({
        jobId: result.jobId,
        assessmentId: result.assessmentId,
      });
    } catch (error: unknown) {
      setFailed(error instanceof Error ? error.message : "Submission failed.");
    }
  };

  const resetForm = (): void => {
    reset();
    resetSubmission();
  };

  return (
    <div className="assessment-shell">
      <form className="assessment-form" onSubmit={handleSubmit(submitForm)}>
        <div className="form-header">
          <p className="eyebrow">VedaAI System</p>
          <h1>Create Assessment</h1>
          <p className="description">Transform your source material into professional academic papers using AI.</p>
        </div>

        <div className="field-grid">
          <div className="field field-full">
            <span className="field-label">
              <Upload size={16} aria-hidden="true" />
              Source Material
            </span>
            <div className="file-input-wrapper">
              <input
                className="file-input"
                type="file"
                accept="application/pdf,text/plain,.pdf,.txt"
                {...register("sourceFile")}
              />
              <div className="file-input-content">
                <Upload size={32} />
                <p>{selectedFile === null ? "Upload PDF or Text file" : selectedFile.name}</p>
                <span className="file-hint">Drag and drop your file here</span>
              </div>
            </div>
            <FieldErrorText message={errors.sourceFile?.message} />
          </div>

          <label className="field">
            <span className="field-label">
              <CalendarClock size={16} aria-hidden="true" />
              Submission Due Date
            </span>
            <input
              type="datetime-local"
              min={minDueDate}
              {...register("dueDate")}
            />
            <FieldErrorText message={errors.dueDate?.message} />
          </label>

          <label className="field">
            <span className="field-label">
              <Hash size={16} aria-hidden="true" />
              Question Count
            </span>
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              placeholder="e.g. 10"
              {...register("numberOfQuestions")}
            />
            <FieldErrorText message={errors.numberOfQuestions?.message} />
          </label>

          <label className="field">
            <span className="field-label">
              <BadgePlus size={16} aria-hidden="true" />
              Total Marks
            </span>
            <input
              type="number"
              min={1}
              max={500}
              step={1}
              placeholder="e.g. 50"
              {...register("totalMarks")}
            />
            <FieldErrorText message={errors.totalMarks?.message} />
          </label>

          <label className="field">
            <span className="field-label">Instructor/Owner ID</span>
            <input type="text" placeholder="e.g. prof-smith" maxLength={128} {...register("ownerId")} />
            <FieldErrorText message={errors.ownerId?.message} />
          </label>
        </div>

        <fieldset className="question-types">
          <legend>Question types</legend>
          <div className="segmented-options">
            {QUESTION_TYPES.map((questionType) => (
              <label className="segmented-option" key={questionType}>
                <input
                  type="checkbox"
                  value={questionType}
                  {...register("questionTypes")}
                />
                <span>{questionTypeLabels[questionType]}</span>
              </label>
            ))}
          </div>
          <FieldErrorText message={errors.questionTypes?.message} />
        </fieldset>

        <label className="field field-full">
          <span className="field-label">Additional instructions</span>
          <textarea
            rows={5}
            maxLength={2_000}
            {...register("additionalInstructions")}
          />
          <FieldErrorText message={errors.additionalInstructions?.message} />
        </label>

        {errorMessage !== null && (
          <div className="feedback feedback-error" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        {acceptedJob !== null && (
          <div className="feedback feedback-success" role="status">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>Job accepted: {acceptedJob.jobId}</span>
          </div>
        )}

        <div className="action-row">
          <button className="secondary-button" type="button" onClick={resetForm}>
            Reset
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={!isValid || isBusy}
          >
            {isBusy ? (
              <Loader2 className="spin" size={17} aria-hidden="true" />
            ) : (
              <Send size={17} aria-hidden="true" />
            )}
            <span>{isBusy ? "Creating" : "Create assessment"}</span>
          </button>
        </div>
      </form>

      <aside className="status-panel" aria-label="Generation status">
        <div>
          <p className="eyebrow">Queue</p>
          <h2>{latestUpdate?.event ?? status}</h2>
        </div>
        <dl className="status-list">
          <div>
            <dt>Socket</dt>
            <dd>{socketStatus}</dd>
          </div>
          <div>
            <dt>Progress</dt>
            <dd>{latestUpdate?.progressPercent ?? 0}%</dd>
          </div>
          <div>
            <dt>Assessment</dt>
            <dd>{acceptedJob?.assessmentId ?? "Pending"}</dd>
          </div>
        </dl>
        <div className="progress-track" aria-hidden="true">
          <span
            style={{ width: `${latestUpdate?.progressPercent ?? 0}%` }}
          />
        </div>
        <p className="status-message">
          {latestUpdate?.message ?? "Waiting for submission."}
        </p>
      </aside>
    </div>
  );
};
