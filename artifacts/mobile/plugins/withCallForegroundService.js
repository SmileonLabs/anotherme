const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

const SERVICE_NAME = ".call.CallForegroundService";

function addPermission(manifest, name) {
  const permissions = manifest.manifest["uses-permission"] ?? [];
  if (!permissions.some((permission) => permission.$?.["android:name"] === name)) {
    permissions.push({ $: { "android:name": name } });
  }
  manifest.manifest["uses-permission"] = permissions;
}

function addService(manifest) {
  const application = manifest.manifest.application?.[0];
  if (!application) return;
  const services = application.service ?? [];
  const existing = services.find((service) => service.$?.["android:name"] === SERVICE_NAME);
  if (existing) {
    existing.$ = {
      ...existing.$,
      "android:enabled": "true",
      "android:exported": "false",
      "android:stopWithTask": "true",
      "android:foregroundServiceType": "microphone|camera",
    };
  } else {
    services.push({
      $: {
        "android:name": SERVICE_NAME,
        "android:enabled": "true",
        "android:exported": "false",
        "android:stopWithTask": "true",
        "android:foregroundServiceType": "microphone|camera",
      },
    });
  }
  application.service = services;
}

function javaSources(androidPackage) {
  const javaPackage = `${androidPackage}.call`;
  return {
    "CallForegroundService.java": `package ${javaPackage};

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

public class CallForegroundService extends Service {
  public static final String EXTRA_MEDIA = "media";
  private static final String CHANNEL_ID = "active-calls";
  private static final int NOTIFICATION_ID = 2719;
  private PowerManager.WakeLock wakeLock;

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    // Never resurrect an old call after Android restarts a killed service.
    if (intent == null) {
      stopSelf(startId);
      return START_NOT_STICKY;
    }
    String media = intent != null ? intent.getStringExtra(EXTRA_MEDIA) : null;
    try {
      startInForeground("video".equals(media));
      acquireWakeLock();
    } catch (Exception e) {
      // Some Android builds throw from startForeground() for foreground-service
      // type, notification, or while-in-use permission restrictions. Do not let
      // a failed keep-alive service crash the whole call/app process.
      releaseWakeLock();
      stopSelf(startId);
      return START_NOT_STICKY;
    }
    return START_NOT_STICKY;
  }

  @Override
  public void onTaskRemoved(Intent rootIntent) {
    // Swiping the task away is an explicit end to this app-owned call lifecycle.
    stopSelf();
  }

  @Override
  public void onDestroy() {
    releaseWakeLock();
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE);
    } else {
      stopForeground(true);
    }
    super.onDestroy();
  }

  private void acquireWakeLock() {
    if (wakeLock != null && wakeLock.isHeld()) return;
    PowerManager manager = (PowerManager) getSystemService(POWER_SERVICE);
    if (manager == null) return;
    wakeLock = manager.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      getPackageName() + ":CallForegroundService"
    );
    wakeLock.setReferenceCounted(false);
    wakeLock.acquire();
  }

  private void releaseWakeLock() {
    if (wakeLock == null) return;
    try {
      if (wakeLock.isHeld()) wakeLock.release();
    } catch (Exception ignored) {}
    wakeLock = null;
  }

  private void startInForeground(boolean video) {
    createChannel();
    Notification notification = buildNotification(video);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      int serviceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
      if (video) serviceType |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
      startForeground(NOTIFICATION_ID, notification, serviceType);
    } else {
      startForeground(NOTIFICATION_ID, notification);
    }
  }

  private Notification buildNotification(boolean video) {
    Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
    PendingIntent pendingIntent = null;
    if (launchIntent != null) {
      int flags = PendingIntent.FLAG_UPDATE_CURRENT;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
      pendingIntent = PendingIntent.getActivity(this, 0, launchIntent, flags);
    }

    Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
      ? new Notification.Builder(this, CHANNEL_ID)
      : new Notification.Builder(this);

    builder
      .setSmallIcon(android.R.drawable.stat_sys_phone_call)
      .setContentTitle(video ? "영상통화 중" : "보이스톡 중")
      .setContentText("잠금 화면에서도 통화 오디오를 유지합니다")
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_CALL)
      .setContentIntent(pendingIntent);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      builder.setVisibility(Notification.VISIBILITY_PUBLIC);
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      builder.setPriority(Notification.PRIORITY_LOW);
    }
    return builder.build();
  }

  private void createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager manager = getSystemService(NotificationManager.class);
    if (manager == null) return;
    NotificationChannel channel = new NotificationChannel(
      CHANNEL_ID,
      "통화 중",
      NotificationManager.IMPORTANCE_LOW
    );
    channel.setDescription("통화 오디오 유지를 위한 실행 중 알림");
    manager.createNotificationChannel(channel);
  }
}
`,
    "CallForegroundModule.java": `package ${javaPackage};

import android.content.Intent;
import android.os.Build;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class CallForegroundModule extends ReactContextBaseJavaModule {
  private final ReactApplicationContext reactContext;

  public CallForegroundModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
  }

  @Override
  public String getName() {
    return "CallForegroundService";
  }

  @ReactMethod
  public void start(String media, Promise promise) {
    try {
      Intent intent = new Intent(reactContext, CallForegroundService.class);
      intent.putExtra(CallForegroundService.EXTRA_MEDIA, "video".equals(media) ? "video" : "audio");
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent);
      } else {
        reactContext.startService(intent);
      }
      promise.resolve(null);
    } catch (Exception e) {
      promise.reject("ERR_CALL_FOREGROUND_START", e);
    }
  }

  @ReactMethod
  public void stop(Promise promise) {
    try {
      Intent intent = new Intent(reactContext, CallForegroundService.class);
      reactContext.stopService(intent);
      promise.resolve(null);
    } catch (Exception e) {
      promise.reject("ERR_CALL_FOREGROUND_STOP", e);
    }
  }
}
`,
    "CallForegroundPackage.java": `package ${javaPackage};

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class CallForegroundPackage implements ReactPackage {
  @Override
  public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
    List<NativeModule> modules = new ArrayList<>();
    modules.add(new CallForegroundModule(reactContext));
    return modules;
  }

  @Override
  public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
    return Collections.emptyList();
  }
}
`,
  };
}

function patchMainApplication(file, androidPackage) {
  if (!fs.existsSync(file)) return;
  let contents = fs.readFileSync(file, "utf8");
  const isJava = file.endsWith(".java");
  const importLine = `import ${androidPackage}.call.CallForegroundPackage${isJava ? ";" : ""}`;
  if (!contents.includes(importLine)) {
    contents = contents.replace(/^(package .*\n)/m, `$1\n${importLine}\n`);
  }
  const hasPackageAdd =
    contents.includes("packages.add(CallForegroundPackage())") ||
    contents.includes("packages.add(new CallForegroundPackage())");
  if (!hasPackageAdd) {
    if (isJava) {
      contents = contents.replace(
        /(\n\s*)return packages;/,
        "$1packages.add(new CallForegroundPackage());$1return packages;",
      );
    } else {
      contents = contents.replace(
        /(\n\s*)return packages/,
        "$1packages.add(CallForegroundPackage())$1return packages",
      );
    }
  }
  fs.writeFileSync(file, contents);
}

module.exports = function withCallForegroundService(config) {
  config = withAndroidManifest(config, (mod) => {
    addPermission(mod.modResults, "android.permission.FOREGROUND_SERVICE");
    addPermission(mod.modResults, "android.permission.FOREGROUND_SERVICE_MICROPHONE");
    addPermission(mod.modResults, "android.permission.FOREGROUND_SERVICE_CAMERA");
    addPermission(mod.modResults, "android.permission.WAKE_LOCK");
    addService(mod.modResults);
    return mod;
  });

  return withDangerousMod(config, [
    "android",
    (mod) => {
      const androidPackage = mod.android?.package;
      if (!androidPackage) return mod;
      const packagePath = androidPackage.split(".").join(path.sep);
      const javaRoot = path.join(
        mod.modRequest.projectRoot,
        "android",
        "app",
        "src",
        "main",
        "java",
        packagePath,
      );
      const callDir = path.join(javaRoot, "call");
      fs.mkdirSync(callDir, { recursive: true });
      const sources = javaSources(androidPackage);
      Object.entries(sources).forEach(([name, source]) => {
        fs.writeFileSync(path.join(callDir, name), source);
      });
      patchMainApplication(path.join(javaRoot, "MainApplication.kt"), androidPackage);
      patchMainApplication(path.join(javaRoot, "MainApplication.java"), androidPackage);
      return mod;
    },
  ]);
};
