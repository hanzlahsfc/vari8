import assert from "node:assert/strict";
import { isPointerOverlayEvent } from "./overlay-motion.mjs";

const event = (type, detail) => {
  const nativeEvent = new Event(type);
  if (detail !== undefined) {
    Object.defineProperty(nativeEvent, "detail", { value: detail });
  }
  return nativeEvent;
};

assert.equal(isPointerOverlayEvent(event("pointerdown")), true);
assert.equal(isPointerOverlayEvent(event("touchstart")), true);
assert.equal(isPointerOverlayEvent(event("click", 1)), true);
assert.equal(isPointerOverlayEvent(event("click", 0)), false);
assert.equal(isPointerOverlayEvent(event("keydown")), false);
assert.equal(isPointerOverlayEvent(event("focusout")), false);
assert.equal(isPointerOverlayEvent(event("custom")), false);
