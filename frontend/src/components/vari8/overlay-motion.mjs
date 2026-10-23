/** @param {Event} event */
export function isPointerOverlayEvent(event) {
  if (event.type.startsWith("pointer") || event.type.startsWith("touch"))
    return true;

  if (!event.type.startsWith("mouse") && event.type !== "click") return false;
  return (
    "detail" in event && typeof event.detail === "number" && event.detail > 0
  );
}
