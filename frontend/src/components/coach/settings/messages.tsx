"use client";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { DEFAULT_SAVED_REPLIES, SAVED_REPLIES_LIMIT, uid } from "../model";
import { useCoach } from "../store";
import { Button, IconButton } from "../ui";
import {
  CommittedInput,
  SettingsCard,
  usePatchPreferences,
  useSaved,
} from "./shell";

export function MessagesSettings() {
  const { state, setState, toast } = useCoach();
  const patch = usePatchPreferences();
  const { saved, mark } = useSaved();
  // Absent means the built-in snippets; a saved list (even empty) is used.
  const replies = state.preferences.savedReplies;
  const list =
    replies ?? DEFAULT_SAVED_REPLIES.map((text) => ({ id: text, text }));
  const write = (next: { id: string; text: string }[]) => {
    patch({ savedReplies: next });
    mark();
  };
  const move = (index: number, dir: -1 | 1) => {
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(index + dir, 0, item);
    write(next);
  };
  const remove = (index: number) => {
    const item = list[index];
    write(list.filter((_, i) => i !== index));
    toast("Saved reply deleted", () => {
      setState((s) => {
        const current = s.preferences.savedReplies ?? [];
        const restored = [...current];
        restored.splice(Math.min(index, restored.length), 0, item);
        return {
          ...s,
          preferences: { ...s.preferences, savedReplies: restored },
        };
      });
    });
  };
  return (
    <SettingsCard
      id="settings-messages"
      title="Messages"
      description="Saved replies in the composer, up to 20."
      saved={saved}
    >
      <div className="cd-settings-replies">
        {list.length === 0 && (
          <p className="cd-settings-row-hint">
            No saved replies. The composer menu stays empty until you add one.
          </p>
        )}
        {list.map((reply, index) => (
          <div className="cd-settings-reply" key={reply.id}>
            <CommittedInput
              label={`Reply ${index + 1}`}
              value={reply.text}
              normalize={(v) => v.trim()}
              onCommit={(text) => {
                if (!text) return;
                write(list.map((r, i) => (i === index ? { ...r, text } : r)));
                mark();
              }}
            />
            <IconButton
              label={`Move reply ${index + 1} up`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp size={15} />
            </IconButton>
            <IconButton
              label={`Move reply ${index + 1} down`}
              disabled={index === list.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown size={15} />
            </IconButton>
            <IconButton
              label={`Delete reply ${index + 1}`}
              onClick={() => remove(index)}
            >
              <Trash2 size={15} />
            </IconButton>
          </div>
        ))}
      </div>
      <div className="cd-settings-reply-actions">
        <Button
          disabled={list.length >= SAVED_REPLIES_LIMIT}
          onClick={() => {
            write([...list, { id: uid("reply"), text: "New reply" }]);
            mark();
          }}
        >
          <Plus size={15} />
          Add reply
        </Button>
        {replies !== undefined && (
          <Button
            onClick={() => {
              setState((s) => ({
                ...s,
                preferences: {
                  ...s.preferences,
                  savedReplies: undefined,
                },
              }));
              mark();
            }}
          >
            Reset to default
          </Button>
        )}
      </div>
    </SettingsCard>
  );
}
