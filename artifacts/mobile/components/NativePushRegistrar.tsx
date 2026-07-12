import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { AppState } from "react-native";
import { getCall, useGetMe, useRegisterPushToken } from "@workspace/api-client-react";
import { useCall } from "@/components/CallProvider";
import {
  cancelIncomingCallNotification,
  cancelExpiredIncomingCallNotifications,
  clearPendingCallIntent,
  consumePendingCallIntent,
  displayIncomingCallNotification,
  getTrackedIncomingCalls,
  setupCallNotifications,
  subscribeCallActions,
  type IncomingCallIntent,
} from "@/lib/callNotifications";
import {
  getInitialNotificationUrl,
  nativePushSupported,
  registerForPushTokenAsync,
  setupNotificationHandler,
  subscribeForegroundIncomingCall,
  subscribeNotificationOpen,
  subscribePushTokenRefresh,
} from "@/lib/nativePush";

/**
 * Native-only counterpart to PushRegistrar. Registers the device push token,
 * shows a full-screen incoming-call notification for `incoming_call` data
 * messages, and routes accept/decline taps into the call flow.
 */
export function NativePushRegistrar() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
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
  const routerRef = useRef(router);
  routerRef.current = router;
  const done = useRef(false);
  const initialNotificationHandled = useRef(false);

  // One-time native setup: notification display behaviour + the call channel.
  useEffect(() => {
    if (!nativePushSupported) return;
    setupNotificationHandler();
    void setupCallNotifications();
  }, []);

  // Reset the registration guard so a later sign-in / re-enable re-registers.
  useEffect(() => {
    if (!isSignedIn || me?.notificationEnabled === false) done.current = false;
  }, [isSignedIn, me?.notificationEnabled]);

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

  // FCM can rotate device tokens. Keep the server-side token list fresh instead
  // of waiting until the old token starts failing during sends.
  useEffect(() => {
    if (!nativePushSupported) return;
    if (!isSignedIn || !me?.notificationEnabled) return;
    return subscribePushTokenRefresh((token) => {
      void registerRef.current({ data: { token } }).catch(() => {});
    });
  }, [isSignedIn, me?.notificationEnabled]);

  // Route regular FCM notification taps. Incoming-call action taps stay on the
  // notifee path below because they need accept/decline semantics, not navigation.
  useEffect(() => {
    if (!nativePushSupported || !isSignedIn || !me?.id) return;

    const navigate = (url: string) => {
      routerRef.current.navigate(url as any);
    };

    const unsubscribe = subscribeNotificationOpen(navigate);
    if (!initialNotificationHandled.current) {
      initialNotificationHandled.current = true;
      void (async () => {
        const url = await getInitialNotificationUrl();
        if (url) navigate(url);
      })();
    }
    return unsubscribe;
  }, [isSignedIn]);

  // Wire incoming-call notifications and their accept/decline actions.
  useEffect(() => {
    if (!nativePushSupported || !isSignedIn || !me?.id) return;

    const isStillRinging = async (intent: IncomingCallIntent) => {
      try {
        const call = await getCall(intent.callId);
        return call.status === "ringing";
      } catch {
        // If the status check fails, prefer ringing over silently dropping a real call.
        return true;
      }
    };

    const accept = async (intent: IncomingCallIntent) => {
      await cancelIncomingCallNotification();
      return joinRef.current(intent.callId, intent.callerName, intent.media);
    };
    const decline = async (intent: IncomingCallIntent) => {
      await cancelIncomingCallNotification();
      // Tell the server so the call records as "declined" instead of ringing
      // out to "missed" on the caller's side.
      return declineRef.current(intent.callId);
    };

    const unsubActions = subscribeCallActions({
      onAccept: (intent) => {
        void accept(intent);
      },
      onDecline: (intent) => {
        void decline(intent);
      },
    });
    const unsubIncoming = subscribeForegroundIncomingCall((intent) => {
      void (async () => {
        if (await isStillRinging(intent)) {
          await displayIncomingCallNotification(intent);
        }
      })();
    });

    // Android can display a notification while this JS runtime is suspended.
    // Reconcile its persisted per-call IDs against the authenticated API whenever
    // the app wakes, rather than letting an old ringing notification survive.
    const reconcileTrackedNotifications = async () => {
      await cancelExpiredIncomingCallNotifications();
      const tracked = await getTrackedIncomingCalls();
      await Promise.all(
        tracked.map(async ({ intent }) => {
          try {
            if (!(await isStillRinging(intent))) {
              await cancelIncomingCallNotification(intent.callId);
              await clearPendingCallIntent(intent.callId);
            }
          } catch {}
        }),
      );
    };
    void reconcileTrackedNotifications();
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void reconcileTrackedNotifications();
    });

    // Cold start: an accept/decline tapped while the app was killed (handled in
    // the headless background context and persisted) is replayed here.
    void (async () => {
      const queued = await consumePendingCallIntent();
      if (!queued) return;
      if (!(await isStillRinging(queued.intent))) {
        await clearPendingCallIntent();
        return;
      }
      const handled =
        queued.action === "accept"
          ? await accept(queued.intent)
          : await decline(queued.intent);
      if (handled) await clearPendingCallIntent();
    })();

    return () => {
      unsubActions();
      unsubIncoming();
      appStateSubscription.remove();
    };
  }, [isSignedIn, me?.id]);

  return null;
}
