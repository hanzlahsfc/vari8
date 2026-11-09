"use client";

/**
 * Shared order control for setup lists that still use button-driven ordering.
 *
 * Group and field layout now lives in `structure-board.tsx`; this control
 * remains for the daily overview metrics, questions and training options.
 */

import { ArrowDown, ArrowUp } from "lucide-react";
import { IconButton } from "./ui";

/** Shared up/down control; buttons are keyboard accessible by default. */
export function OrderButtons({
  index,
  length,
  move,
  label = "item",
}: {
  index: number;
  length: number;
  move: (to: number) => void;
  label?: string;
}) {
  return (
    <span className="cd-order-buttons">
      <IconButton
        label={`Move ${label} up`}
        size="sm"
        disabled={index === 0}
        onClick={() => move(index - 1)}
      >
        <ArrowUp size={13} />
      </IconButton>
      <IconButton
        label={`Move ${label} down`}
        size="sm"
        disabled={index === length - 1}
        onClick={() => move(index + 1)}
      >
        <ArrowDown size={13} />
      </IconButton>
    </span>
  );
}
