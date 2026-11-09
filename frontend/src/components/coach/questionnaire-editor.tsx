"use client";

import {
  Check,
  ChevronDown,
  Copy,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Input as Vari8Input,
  Select as Vari8Select,
} from "../vari8/components";
import { OrderButtons } from "./group-layout-editor";
import { type Question, uid, type Variant } from "./model";
import { reorderArray } from "./setup-layout";
import { Button, IconButton } from "./ui";

const TYPE_LABEL: Record<Question["type"], string> = {
  "Short text": "Short text",
  "Long text": "Long text",
  Numeric: "Numeric",
  Rating: "Rating",
  Choice: "Choice",
  "Visual upload": "Progress photos",
};

const TYPE_OPTIONS = [
  { value: "Short text", label: "Short text" },
  { value: "Long text", label: "Long text" },
  { value: "Numeric", label: "Numeric" },
  { value: "Rating", label: "Rating" },
  { value: "Choice", label: "Choice" },
  { value: "Visual upload", label: "Progress photos" },
];

const posesOf = (question: Question) =>
  question.options
    .split(",")
    .map((pose) => pose.trim())
    .filter(Boolean);

export function QuestionnaireEditor({
  variant,
  update,
  mode,
}: {
  variant: Variant;
  update: (fn: (current: Variant) => Variant) => void;
  mode: "template" | "client";
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [drag, setDrag] = useState<{
    id: string;
    pointerId: number;
    startY: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const dragRef = useRef<typeof drag>(null);
  const dropRef = useRef<typeof drop>(null);
  const focusId = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const patch = (id: string, changes: Partial<Question>) =>
    update((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === id ? { ...question, ...changes } : question,
      ),
    }));
  const insert = (index: number) => {
    const question: Question = {
      id: uid("question"),
      label: "New question",
      type: "Long text",
      required: false,
      options: "",
    };
    update((current) => {
      const questions = [...current.questions];
      questions.splice(index, 0, question);
      return { ...current, questions };
    });
    setExpanded((current) => new Set(current).add(question.id));
    focusId.current = question.id;
  };
  const move = (from: number, to: number) =>
    update((current) => ({
      ...current,
      questions: reorderArray(current.questions, from, to),
    }));

  useEffect(() => {
    const id = focusId.current;
    if (!id) return;
    focusId.current = null;
    requestAnimationFrame(() => {
      const card = listRef.current?.querySelector<HTMLElement>(
        `[data-question-card="${CSS.escape(id)}"]`,
      );
      card?.scrollIntoView({ block: "nearest" });
      card?.querySelector<HTMLInputElement>("[data-question-label]")?.focus();
    });
  });

  // Pointer drag mirrors the structure board: threshold, element under
  // pointer, and a before/after drop marker. Alt + arrows stay available.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const pointerId = dragRef.current?.pointerId;
    const moveEvent = (event: PointerEvent) => {
      if (pointerId === undefined || event.pointerId !== pointerId) return;
      const current = dragRef.current;
      if (!current) return;
      if (!current.moved && Math.abs(event.clientY - current.startY) < 4)
        return;
      event.preventDefault();
      const next = { ...current, y: event.clientY, moved: true };
      dragRef.current = next;
      setDrag(next);
      const element = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-question-card]");
      if (!element?.dataset.questionCard) {
        dropRef.current = null;
        setDrop(null);
        return;
      }
      const bounds = element.getBoundingClientRect();
      const target = {
        id: element.dataset.questionCard,
        after: event.clientY > bounds.top + bounds.height / 2,
      };
      dropRef.current = target;
      setDrop(target);
    };
    const finish = (event: PointerEvent) => {
      if (pointerId === undefined || event.pointerId !== pointerId) return;
      const current = dragRef.current;
      const target = dropRef.current;
      dragRef.current = null;
      dropRef.current = null;
      setDrag(null);
      setDrop(null);
      if (!current?.moved || !target) return;
      update((state) => {
        const from = state.questions.findIndex((q) => q.id === current.id);
        const overIndex = state.questions.findIndex((q) => q.id === target.id);
        if (from < 0 || overIndex < 0) return state;
        let to = overIndex + (target.after ? 1 : 0);
        if (to > from) to -= 1;
        if (to === from) return state;
        return {
          ...state,
          questions: reorderArray(state.questions, from, to),
        };
      });
    };
    const cancel = () => {
      dragRef.current = null;
      dropRef.current = null;
      setDrag(null);
      setDrop(null);
    };
    window.addEventListener("pointermove", moveEvent, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", moveEvent);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [dragging, update]);

  const beginDrag = (
    event: ReactPointerEvent<HTMLElement>,
    question: Question,
  ) => {
    if (event.button !== 0) return;
    const state = {
      id: question.id,
      pointerId: event.pointerId,
      startY: event.clientY,
      y: event.clientY,
      moved: false,
    };
    dragRef.current = state;
    dropRef.current = null;
    setDrag(state);
    setDrop(null);
  };

  const moveByKeyboard = (
    event: ReactKeyboardEvent<HTMLElement>,
    index: number,
  ) => {
    if (!event.altKey) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const to = index + (event.key === "ArrowUp" ? -1 : 1);
    if (to < 0 || to >= variant.questions.length) return;
    move(index, to);
  };

  return (
    <div className="cd-questionnaire" ref={listRef}>
      {variant.questions.map((question, index) => {
        const open = expanded.has(question.id);
        const isPhoto = question.type === "Visual upload";
        const poses = posesOf(question);
        const writePoses = (next: string[]) =>
          patch(question.id, { options: next.join(", ") });
        const dropHere =
          drop?.id === question.id
            ? { before: !drop.after, after: drop.after }
            : undefined;
        return (
          <Fragment key={question.id}>
            <div
              className="cd-qcard"
              data-question-card={question.id}
              data-dragging={
                drag?.id === question.id && drag.moved ? "" : undefined
              }
              data-drop-before={dropHere?.before ? "" : undefined}
              data-drop-after={dropHere?.after ? "" : undefined}
            >
              <div className="cd-qcard-head">
                <button
                  type="button"
                  className="cd-qcard-grip"
                  aria-label={`Drag ${question.label} to reorder; Alt plus arrow keys to move.`}
                  title="Drag or Alt + arrows to reorder"
                  onPointerDown={(event) => beginDrag(event, question)}
                  onKeyDown={(event) => moveByKeyboard(event, index)}
                >
                  <GripVertical size={15} />
                </button>
                <span className="cd-qcard-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Vari8Input
                  className="cd-qcard-label"
                  data-question-label=""
                  label={`Question ${index + 1} label`}
                  hideLabel
                  size="sm"
                  aria-label={`Question ${index + 1} label`}
                  value={question.label}
                  maxLength={120}
                  onChange={(event) =>
                    patch(question.id, { label: event.target.value })
                  }
                />
                <button
                  type="button"
                  className="cd-qcard-type"
                  aria-expanded={open}
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(question.id)) next.delete(question.id);
                      else next.add(question.id);
                      return next;
                    })
                  }
                >
                  {TYPE_LABEL[question.type]}
                </button>
                <button
                  type="button"
                  className="cd-qcard-required"
                  aria-pressed={question.required}
                  data-on={question.required ? "" : undefined}
                  onClick={() =>
                    patch(question.id, { required: !question.required })
                  }
                >
                  {question.required && <Check size={11} />}
                  {question.required ? "Required" : "Optional"}
                </button>
                <IconButton
                  className="cd-qcard-expand"
                  label={`${open ? "Hide" : "Show"} ${question.label} details`}
                  size="sm"
                  aria-expanded={open}
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(question.id)) next.delete(question.id);
                      else next.add(question.id);
                      return next;
                    })
                  }
                >
                  <ChevronDown size={14} data-open={open ? "" : undefined} />
                </IconButton>
                <IconButton
                  label={`Duplicate ${question.label}`}
                  size="sm"
                  onClick={() => {
                    const copy = { ...question, id: uid("question") };
                    update((current) => ({
                      ...current,
                      questions: [
                        ...current.questions.slice(0, index + 1),
                        copy,
                        ...current.questions.slice(index + 1),
                      ],
                    }));
                    setExpanded((current) => new Set(current).add(copy.id));
                    focusId.current = copy.id;
                  }}
                >
                  <Copy size={13} />
                </IconButton>
                <IconButton
                  label={`Remove ${question.label}`}
                  size="sm"
                  onClick={() =>
                    update((current) => ({
                      ...current,
                      questions: current.questions.filter(
                        (item) => item.id !== question.id,
                      ),
                    }))
                  }
                >
                  <Trash2 size={13} />
                </IconButton>
              </div>
              {open && (
                <div className="cd-qcard-details">
                  <div className="cd-qcard-detail-row">
                    <Vari8Select
                      label="Type"
                      value={question.type}
                      options={TYPE_OPTIONS}
                      onValueChange={(type) => {
                        const next = type as Question["type"];
                        patch(question.id, {
                          type: next,
                          options:
                            next === "Rating"
                              ? "1–10"
                              : next === "Visual upload" ||
                                  next === "Choice" ||
                                  next === "Numeric"
                                ? ""
                                : question.options,
                        });
                      }}
                    />
                    {question.type === "Rating" && (
                      <Vari8Select
                        label="Rating scale"
                        value={question.options || "1–10"}
                        options={[
                          { value: "1–10", label: "1–10" },
                          { value: "1–5", label: "1–5" },
                          { value: "Word labels", label: "Word labels" },
                        ]}
                        onValueChange={(options) =>
                          patch(question.id, { options })
                        }
                      />
                    )}
                  </div>
                  {question.type === "Choice" && (
                    <Vari8Input
                      label="Choices, separated by commas"
                      value={question.options}
                      placeholder="Good, Okay, Difficult"
                      onChange={(event) =>
                        patch(question.id, { options: event.target.value })
                      }
                    />
                  )}
                  {isPhoto && mode === "template" && (
                    <p className="cd-qcard-note">
                      Poses are set per client. Each photo question can carry
                      its own label.
                    </p>
                  )}
                  {isPhoto && mode === "client" && (
                    <div className="cd-qcard-poses">
                      <div className="cd-qcard-poses-head">
                        <span className="cd-structure-label">Poses</span>
                        <span className="cd-muted">
                          {poses.length
                            ? `${poses.length} pose${poses.length === 1 ? "" : "s"} for this client`
                            : "No poses: the client app shows a generic photo upload."}
                        </span>
                      </div>
                      {poses.map((pose, poseIndex) => (
                        <div className="cd-qcard-pose-row" key={pose}>
                          <Vari8Input
                            label={`Pose ${poseIndex + 1}`}
                            hideLabel
                            value={pose}
                            maxLength={40}
                            aria-label={`Pose ${poseIndex + 1} name`}
                            onChange={(event) => {
                              const next = [...poses];
                              next[poseIndex] = event.target.value;
                              writePoses(next);
                            }}
                          />
                          <OrderButtons
                            index={poseIndex}
                            length={poses.length}
                            label={`pose ${poseIndex + 1}`}
                            move={(to) => {
                              const next = reorderArray(poses, poseIndex, to);
                              writePoses(next);
                            }}
                          />
                          <IconButton
                            label={`Remove pose ${poseIndex + 1}`}
                            size="sm"
                            onClick={() =>
                              writePoses(
                                poses.filter(
                                  (_, itemIndex) => itemIndex !== poseIndex,
                                ),
                              )
                            }
                          >
                            <Trash2 size={13} />
                          </IconButton>
                        </div>
                      ))}
                      <Button
                        size="sm"
                        onClick={() =>
                          writePoses([...poses, `Pose ${poses.length + 1}`])
                        }
                      >
                        <Plus size={13} />
                        Add pose
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="cd-qcard-insert">
              <button
                type="button"
                aria-label={`Insert question after ${question.label}`}
                onClick={() => insert(index + 1)}
              >
                <Plus size={12} />
              </button>
            </div>
          </Fragment>
        );
      })}
      <div className="cd-qcard-add">
        <Button onClick={() => insert(variant.questions.length)}>
          <Plus size={14} />
          Add question
        </Button>
        <span className="cd-muted">
          New questions appear where you add them.
        </span>
      </div>
      {drag?.moved && <span className="cd-sr">Moving question</span>}
    </div>
  );
}
