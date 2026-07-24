/**
 * Build web assets, sync Capacitor, then assemble a debug APK with Gradle.
 * Output: release/SeedOfTheAbyss-debug.apk
 *
 * Requires: JDK 17+ and Android SDK (install Android Studio once).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const androidDir = join(root, 'android');
const outDir = join(root, 'release');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

function run(cmd, args, cwd = root) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function findJavaHome() {
  if (process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  const candidates = [
    'C:\\Program Files\\Android\\Android Studio\\jbr',
    'C:\\Program Files\\Android\\Android Studio\\jre',
    'C:\\Program Files\\Eclipse Adoptium\\jdk-17',
    'C:\\Program Files\\Microsoft\\jdk-17',
    'C:\\Program Files\\Java\\jdk-17',
  ];
  for (const c of candidates) {
    const java = join(c, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    if (existsSync(java)) return c;
  }
  return null;
}

function findAndroidSdk() {
  if (process.env.ANDROID_HOME && existsSync(process.env.ANDROID_HOME)) return process.env.ANDROID_HOME;
  if (process.env.ANDROID_SDK_ROOT && existsSync(process.env.ANDROID_SDK_ROOT)) {
    return process.env.ANDROID_SDK_ROOT;
  }
  const candidates = [
    join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
    join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Android', 'Sdk'),
    'C:\\Android\\Sdk',
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

console.log('=== Seed of the Abyss · Android APK builder ===');

if (!existsSync(androidDir)) {
  console.error('android/ 不存在。请先运行: npx cap add android');
  process.exit(1);
}

const javaHome = findJavaHome();
const sdk = findAndroidSdk();

if (!javaHome) {
  console.error(`
[缺少 JDK]
本机没有找到 Java / Android Studio JBR。

请先安装 Android Studio（推荐）:
  https://developer.android.com/studio

安装并打开一次 Android Studio，完成 SDK 下载后执行:
  npm run android:apk
`);
  process.exit(2);
}

if (!sdk) {
  console.error(`
[缺少 Android SDK]
请安装 Android Studio 并打开一次，完成 SDK 下载。
默认路径通常是: %LOCALAPPDATA%\\Android\\Sdk

装好后执行:
  npm run android:apk
`);
  process.exit(3);
}

process.env.JAVA_HOME = javaHome;
process.env.ANDROID_HOME = sdk;
process.env.ANDROID_SDK_ROOT = sdk;
process.env.PATH = `${join(javaHome, 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH || ''}`;

writeFileSync(join(androidDir, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '/')}\n`);
console.log(`JAVA_HOME   = ${javaHome}`);
console.log(`ANDROID_SDK = ${sdk}`);

// 1) web build + cap sync
run('npm', ['run', 'build']);
run('npx', ['cap', 'sync', 'android']);

// 2) gradle assembleDebug
run(gradlew, ['assembleDebug'], androidDir);

// 3) copy apk
const apkPath = join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!existsSync(apkPath)) {
  console.error('Gradle 完成了，但没找到 app-debug.apk:', apkPath);
  process.exit(4);
}

mkdirSync(outDir, { recursive: true });
const dest = join(outDir, 'SeedOfTheAbyss-debug.apk');
copyFileSync(apkPath, dest);
const mb = (statSync(dest).size / (1024 * 1024)).toFixed(2);
console.log(`
========================================
APK 已生成:
  ${dest}
  大小: ${mb} MB

发给朋友安装时，手机需允许“未知来源/安装未知应用”。
========================================
`);
