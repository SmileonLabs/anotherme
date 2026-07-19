const assert = require("node:assert/strict");
const test = require("node:test");
const {
  patchMainApplicationContent,
} = require("./withCallForegroundService");

const androidPackage = "com.anotherme.app";

test("registers the package in the Expo 54 Kotlin packages.apply template", () => {
  const source = `package com.anotherme.app

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactPackage

class MainApplication : Application() {
  override val reactNativeHost = object : DefaultReactNativeHost(this) {
    override fun getPackages(): List<ReactPackage> =
      PackageList(this).packages.apply {
        // Packages that cannot be autolinked yet can be added manually here.
      }
  }
}
`;

  const patched = patchMainApplicationContent(source, androidPackage, "kotlin");

  assert.match(patched, /import com\.anotherme\.app\.call\.CallForegroundPackage/);
  assert.match(
    patched,
    /PackageList\(this\)\.packages\.apply\s*\{\s*add\(CallForegroundPackage\(\)\)/,
  );
});

test("registers the package in a Java return-packages template", () => {
  const source = `package com.anotherme.app;

import android.app.Application;

public class MainApplication extends Application {
  protected List<ReactPackage> getPackages() {
    List<ReactPackage> packages = new PackageList(this).getPackages();
    return packages;
  }
}
`;

  const patched = patchMainApplicationContent(source, androidPackage, "java");

  assert.match(patched, /import com\.anotherme\.app\.call\.CallForegroundPackage;/);
  assert.match(patched, /packages\.add\(new CallForegroundPackage\(\)\);/);
});

test("is idempotent when the plugin runs more than once", () => {
  const source = `package com.anotherme.app

import com.facebook.react.PackageList

class MainApplication {
  fun getPackages() =
    PackageList(this).packages.apply {
    }
}
`;

  const once = patchMainApplicationContent(source, androidPackage, "kotlin");
  const twice = patchMainApplicationContent(once, androidPackage, "kotlin");

  assert.equal(
    twice.match(/import com\.anotherme\.app\.call\.CallForegroundPackage/g)?.length,
    1,
  );
  assert.equal(twice.match(/add\(CallForegroundPackage\(\)\)/g)?.length, 1);
});

test("fails the build when the native template is unsupported", () => {
  const source = `package com.anotherme.app

class MainApplication
`;

  assert.throws(
    () => patchMainApplicationContent(source, androidPackage, "kotlin"),
    /Unable to register CallForegroundPackage/,
  );
});
