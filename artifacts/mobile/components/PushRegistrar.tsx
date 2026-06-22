import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/expo";
import { useGetMe, useRegisterPushToken } from "@workspace/api-client-react";
import {
  ensureWebPushIfGranted,
  registerPushServiceWorker,
  webPushSupported,
} from "@/lib/webPush";

/**
 * Web-only: silently re-subscribes to web push on load when the user is signed
 * in, has notifications enabled, and has already granted permission. Never
 * prompts — the prompt is triggered from the notification settings toggle.
 */
export function PushRegistrar() {
  const { isSignedIn } = useAuth();
  const { data: me } = useGetMe();
  const registerPushToken = useRegisterPushToken();
  const done = useRef(false);

  // Hold the latest mutate fn in a ref so the registration effect does NOT
  // depend on the (unstable) mutation object. Each mutateAsync call flips the
  // mutation's isPending state, producing a new object reference — if that were
  // in the dependency array the effect would re-run and re-register on every
  // call, creating an infinite push-token registration loop.
  const registerRef = useRef(registerPushToken.mutateAsync);
  registerRef.current = registerPushToken.mutateAsync;

  // Reset the one-shot guard when the user signs out so a later sign-in
  // (possibly a different account) re-registers.
  useEffect(() => {
    if (!isSignedIn) done.current = false;
  }, [isSignedIn]);

  // Register the push service worker once on load. Web push (and `.ready`, which
  // several components await) only works once a SW controls the page, and the
  // Expo web app ships none by default — so register ours up front, independent
  // of sign-in. Idempotent + best-effort.
  useEffect(() => {
    if (!webPushSupported) return;
    void registerPushServiceWorker();
  }, []);

  // When the browser rotates the push subscription, the service worker
  // re-subscribes and posts the fresh subscription here so we re-register it
  // with the server immediately — preventing the stale endpoint from delivering
  // duplicate pushes alongside the new one.
  useEffect(() => {
    if (!webPushSupported) return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const data = e.data;
      if (data?.type === "push-subscription-changed" && typeof data.subscription === "string") {
        void registerRef.current({ data: { token: data.subscription } }).catch(() => {});
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!webPushSupported) return;
    if (!isSignedIn || !me?.notificationEnabled) return;
    if (done.current) return;
    // Claim the one-shot up-front so this never runs more than once per
    // sign-in / enable, even across rapid re-renders.
    done.current = true;
    let cancelled = false;
    void (async () => {
      try {
        await ensureWebPushIfGranted((token) =>
          registerRef.current({ data: { token } }),
        );
      } catch {
        // Transient failure — drop the guard so a later dependency change retries.
        if (!cancelled) done.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, me?.notificationEnabled]);

  return null;
}
