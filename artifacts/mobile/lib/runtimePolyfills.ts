// Keep runtime globals that are required during module evaluation here.
// This module must be the first import in index.js because expo-router eagerly
// evaluates route modules, including livekit-client, before the app renders.
if (typeof globalThis.DOMException === "undefined") {
  class ReactNativeDOMException extends Error {
    readonly code = 0;

    constructor(message = "", name = "Error") {
      super(message);
      this.name = name;
      Object.setPrototypeOf(this, ReactNativeDOMException.prototype);
    }
  }

  Object.defineProperty(globalThis, "DOMException", {
    configurable: true,
    writable: true,
    value: ReactNativeDOMException,
  });
}
