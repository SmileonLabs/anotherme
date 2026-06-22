// Custom app entry. Registers the FCM background message handler (native only;
// web resolves to a no-op stub) BEFORE expo-router boots, so a killed or
// backgrounded Android device can render the full-screen incoming call. This
// file is the "main" in package.json — do not point "main" back at
// "expo-router/entry" or the killed-state handler will never register.
import "./lib/fcmBackground";
import "expo-router/entry";
