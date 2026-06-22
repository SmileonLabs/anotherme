// Web no-op: there is no native FCM background handler on web. Web/PWA incoming
// calls are delivered by the service worker + Web Push (see webPush.ts). Metro
// picks this file on web; fcmBackground.ts is used on native.
export {};
