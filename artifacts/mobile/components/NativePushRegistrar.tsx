import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/expo";
import { useGetMe, useRegisterPushToken } from "@workspace/api-client-react";
import { useCall } from "@/components/CallProvider";
import {
  cancelIncomingCallNotification,
  consumePendingCallIntent,
  displayIncomingCallNotification,
  setupCallNotifications,
  subscribeCallActions,
  type IncomingCallIntent,
} from "@/lib/callNotifications";
import {
  nativePushSupported,
  registerForPushTokenAsync,
  setupNotificationHandler,
  subscribeForegroundIncomingCall,
} from "@/lib/nativePush";

/**
 * Native-only counterpart to PushRegistrar. Registers the device push token,
 * shows a full-screen incoming-call notification for `incoming_call` data
 * messages, and routes accept/decline taps into the call flow.
 */
export function NativePushRegistrar() {
  const { isSignedIn } = useAuth();
  const { data: me } = useGetMe();
  const registerPushToken = useRegisterPushToken();
  const { joinFromCard, declineFromCard } = useCall();

  // Hold latest mutate / join fns in refs so the effects don't re-run (and
  // re-subscribe / re-register) every time these unstable objects change.
  const registerRef = useRef(registerPushToken.mutateAsync);
  registerRef.current = registerPushToken.mutateAsync;
  const joinRef = useRef(joinFromCard);
  joinRef.current = joinFromCard;
  const declineRef = useRef(declineFromCard);
  declineRef.current = declineFromCard;
  const done = useRef(false);

  // One-time native setup: notification display behaviour + the call channel.
  useEffect(() => {
    if (!nativePushSupported) return;
    setupNotificationHandler();
    void setupCallNotifications();
  }, []);

  // Reset the registration guard on sign-out so a later sign-in re-registers.
  useEffect(() => {
    if (!isSignedIn) done.current = false;
  }, [isSignedIn]);

  // Register the device push token once the user is signed in and has
  // notifications enabled.
  useEffect(() => {
    if (!nativePushSupported) return;
    if (!isSignedIn || !me?.notificationEnabled) return;
    if (done.current) return;
    done.current = true;
    void (async () => {
      try {
        const token = await registerForPushTokenAsync();
        if (token) await registerRef.current({ data: { token } });
      } catch {
        done.current = false;
      }
    })();
  }, [isSignedIn, me?.notificationEnabled]);

  // Wire incoming-call notifications and their accept/decline actions.
  useEffect(() => {
    if (!nativePushSupported) return;

    const accept = (intent: IncomingCallIntent) => {
      void cancelIncomingCallNotification();
      void joinRef.current(intent.callId, intent.callerName);
    };
    const decline = (intent: IncomingCallIntent) => {
      void cancelIncomingCallNotification();
      // Tell the server so the call records as "declined" instead of ringing
      // out to "missed" on the caller's side.
      void declineRef.current(intent.callId);
    };

    const unsubActions = subscribeCallActions({ onAccept: accept, onDecline: decline });
    const unsubIncoming = subscribeForegroundIncomingCall((intent) => {
      void displayIncomingCallNotification(intent);
    });

    // Cold start: an accept/decline tapped while the app was killed (handled in
    // the headless background context and persisted) is replayed here.
    void (async () => {
      const queued = await consumePendingCallIntent();
      if (queued?.action === "accept") accept(queued.intent);
      else if (queued?.action === "decline") decline(queued.intent);
    })();

    return () => {
      unsubActions();
      unsubIncoming();
    };
  }, []);

  return null;
}
