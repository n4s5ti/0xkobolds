/**
 * Safe Custom Element Decorator
 * 
 * Wrapper around Lit's @customElement that guards against duplicate registration
 * during hot module reload in development mode.
 */

import { customElement as litCustomElement } from "lit/decorators.js";

/**
 * Safe version of @customElement that checks if already defined
 */
export function customElement(tagName: string) {
  return (classOrDescriptor: any) => {
    if (customElements.get(tagName)) {
      console.warn(`[HMR] Custom element "${tagName}" already defined, skipping re-registration`);
      return classOrDescriptor;
    }
    return litCustomElement(tagName)(classOrDescriptor);
  };
}

// Re-export other decorators from lit
export { state, property, query, queryAll, queryAsync, queryAssignedElements, queryAssignedNodes } from "lit/decorators.js";
