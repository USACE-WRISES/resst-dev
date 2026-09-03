// The drag-session mark for the two divider resizers: while a grip is being
// dragged, <html data-resizing="col|row"> lets the stylesheet turn off text
// selection page-wide and pin the resize cursor even when the pointer runs
// ahead of the 9 px grip under capture. The grips themselves are
// user-select: none, which is what stops a press from starting a selection
// in the first place (that rule also holds under remote browser isolation,
// where only the DOM and styles are mirrored to the screen and this script
// runs elsewhere); the mark is the belt over those braces.

export type ResizeAxis = "col" | "row";

export const beginResizeSession = (axis: ResizeAxis): void =>
  document.documentElement.setAttribute("data-resizing", axis);

/** Ends the session only if it is this axis's — one resizer's cleanup can
    never cut short the other's drag. */
export const endResizeSession = (axis: ResizeAxis): void => {
  if (document.documentElement.getAttribute("data-resizing") === axis) {
    document.documentElement.removeAttribute("data-resizing");
  }
};
