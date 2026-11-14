/** The rendered parent can be a slot or a shadow host, not just parentElement. */
export function composedParent(element: Element): Element | null {
  return element.assignedSlot ?? element.parentElement ??
    (element.getRootNode() as ShadowRoot).host ?? null;
}

/** Walk the flattened tree: assigned content replaces slot fallback/light DOM. */
export function composedChildren(node: Node): Node[] {
  if (node.nodeType === 1) {
    const element = node as Element;
    if (element.localName === "slot") {
      const assigned = (element as HTMLSlotElement).assignedNodes({ flatten: true });
      if (assigned.length) return assigned;
    }
    if (element.shadowRoot) return Array.from(element.shadowRoot.childNodes);
  }
  return Array.from(node.childNodes);
}

export function queryComposedAll<T extends Element>(root: Node, selector: string): T[] {
  const found: T[] = [];
  const visited = new Set<Node>();
  const walk = (node: Node) => {
    if (visited.has(node)) return;
    visited.add(node);
    if (node.nodeType === 1 && (node as Element).matches(selector)) found.push(node as T);
    for (const child of composedChildren(node)) walk(child);
  };
  for (const child of composedChildren(root)) walk(child);
  return found;
}

export function composedContains(ancestor: Element, descendant: Element): boolean {
  for (let node: Element | null = descendant; node; node = composedParent(node)) {
    if (node === ancestor) return true;
  }
  return false;
}

const clips = (overflow: string) => /^(?:hidden|clip)$/.test(overflow);
const scrolls = (overflow: string) => /^(?:auto|scroll|overlay)$/.test(overflow);
const overflowAxis = (style: CSSStyleDeclaration, axis: "X" | "Y") =>
  style[`overflow${axis}`] || style.overflow;

/**
 * Capture visibility is scroll-accessibility, not intersection with the current
 * viewport. Scroll containers may reveal descendants; hidden/clip cannot.
 * Geometry is optional for detached structured HTML and layout-less test DOMs.
 */
export function isElementVisible(
  element: Element,
  { rendered = true, minimumSize = 0 }: { rendered?: boolean; minimumSize?: number } = {},
): boolean {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  const ancestors: Array<{ element: Element; style: CSSStyleDeclaration }> = [];
  for (let node: Element | null = element; node; node = composedParent(node)) {
    if (node.matches("[hidden], [inert], [aria-hidden='true']")) return false;
    const style = view?.getComputedStyle(node) ?? (node as HTMLElement).style;
    if (!style) continue;
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" ||
      style.contentVisibility === "hidden" || style.opacity === "0") return false;
    if (/^(?:absolute|fixed)$/.test(style.position) &&
      [style.left, style.top].some((value) => /^-\d/.test(value) && parseFloat(value) < -1000)) return false;
    if (/rect\(\s*0(?:px)?[ ,]+0(?:px)?[ ,]+0(?:px)?[ ,]+0(?:px)?\s*\)/i.test(style.clip) ||
      /inset\(\s*50%\s*\)/i.test(style.clipPath)) return false;
    if (style.display !== "contents" &&
      ((clips(overflowAxis(style, "X")) && parseFloat(style.width) <= 1) ||
       (clips(overflowAxis(style, "Y")) && parseFloat(style.height) <= 1))) return false;
    ancestors.push({ element: node, style });
  }
  if (!rendered) return true;
  // Boxless structural nodes can have visible descendants. Those descendants
  // are checked individually by the flattened text/element walkers.
  if (ancestors[0]?.style.display === "contents" || element.localName === "slot" || element.localName === "br") return true;
  const check = element as Element & { checkVisibility?: (options: { checkOpacity: boolean; checkVisibilityCSS: boolean }) => boolean };
  if (check.checkVisibility && !check.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
  const documentRect = doc.documentElement.getBoundingClientRect();
  if (documentRect.width <= 0 && documentRect.height <= 0) return true;
  const rect = element.getBoundingClientRect();
  if (rect.width <= minimumSize || rect.height <= minimumSize) return false;

  const fixedIndex = ancestors.findIndex(({ style }) => style.position === "fixed");
  const viewportFixed = fixedIndex >= 0 && !ancestors.slice(fixedIndex + 1).some(({ style }) =>
    [style.transform, style.perspective, style.filter].some((value) => value && value !== "none") ||
    /\b(?:paint|layout|strict|content)\b/.test(style.contain));
  let reachableX = viewportFixed ? 0 : view?.scrollX ?? 0;
  let reachableY = viewportFixed ? 0 : view?.scrollY ?? 0;
  for (const parent of ancestors.slice(1)) {
    if (parent.element === doc.scrollingElement) continue;
    if (scrolls(overflowAxis(parent.style, "X"))) reachableX += parent.element.scrollLeft;
    if (scrolls(overflowAxis(parent.style, "Y"))) reachableY += parent.element.scrollTop;
  }
  if (rect.right + reachableX <= 0 || rect.bottom + reachableY <= 0) return false;

  let { left, right, top, bottom } = rect;
  for (const parent of ancestors.slice(1)) {
    if (parent.style.display === "contents") continue;
    const x = overflowAxis(parent.style, "X");
    const y = overflowAxis(parent.style, "Y");
    if (!clips(x) && !clips(y) && !scrolls(x) && !scrolls(y)) continue;
    const bounds = parent.element.getBoundingClientRect();
    if (clips(x) || scrolls(x)) {
      if (bounds.width <= 1) return false;
      if (scrolls(x)) {
        // Scrolling stops at zero, so content that sits before the container's
        // origin can never be revealed and must stay out of review.
        const contentLeft = rect.left - bounds.left + parent.element.scrollLeft;
        if (contentLeft + rect.width <= 0) return false;
        const shift = right <= bounds.left ? bounds.left - left : left >= bounds.right ? bounds.right - right : 0;
        left += shift;
        right += shift;
      }
      left = Math.max(left, bounds.left);
      right = Math.min(right, bounds.right);
      if (right <= left) return false;
    }
    if (clips(y) || scrolls(y)) {
      if (bounds.height <= 1) return false;
      if (scrolls(y)) {
        // Scrolling stops at zero, so content that sits before the container's
        // origin can never be revealed and must stay out of review.
        const contentTop = rect.top - bounds.top + parent.element.scrollTop;
        if (contentTop + rect.height <= 0) return false;
        const shift = bottom <= bounds.top ? bounds.top - top : top >= bounds.bottom ? bounds.bottom - bottom : 0;
        top += shift;
        bottom += shift;
      }
      top = Math.max(top, bounds.top);
      bottom = Math.min(bottom, bounds.bottom);
      if (bottom <= top) return false;
    }
  }
  return !viewportFixed || !view || (right > 0 && bottom > 0 && left < view.innerWidth && top < view.innerHeight);
}
