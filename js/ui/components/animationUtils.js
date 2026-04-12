/**
 * Trigger a CSS animation on an element by force-restarting it.
 * Removes the class, flushes layout, then re-adds the class.
 */
export function restartAnimation(element, animClass) {
  element.classList.remove(animClass);
  void element.offsetHeight; // force reflow to reset animation
  element.classList.add(animClass);
}

/**
 * Apply animation class only if shouldAnimate is true.
 * If false, the element is shown without animation.
 */
export function applyConditionalAnimation(element, animClass, shouldAnimate) {
  element.classList.remove(animClass);
  if (shouldAnimate) {
    void element.offsetHeight;
    element.classList.add(animClass);
  }
}
