import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

console.log("=== 치지직 스트림덱 플러그인 패키징 & 배포 시작 ===\n");

// 1. 빌드 확인 및 빌드 실행
console.log("1. 최신 코드 빌드 중...");
execSync("npm run build", { stdio: "inherit" });

const pluginDirName = "com.chzzk.livestatus.sdPlugin";
const sourcePluginDir = path.resolve(pluginDirName);
const outputPluginFile = path.resolve("com.chzzk.livestatus.streamDeckPlugin");

// 2. .streamDeckPlugin 패키지 파일 생성 (더블 클릭 설치 파일)
console.log("\n2. .streamDeckPlugin 설치 패키지 생성 중...");
if (fs.existsSync(outputPluginFile)) {
  fs.unlinkSync(outputPluginFile);
}

// Windows PowerShell Compress-Archive 활용
const tempZip = path.resolve("temp_plugin.zip");
if (fs.existsSync(tempZip)) {
  fs.unlinkSync(tempZip);
}

try {
  // Compress-Archive는 지정된 폴더 구조를 유지하며 zip 압축
  execSync(
    `powershell -Command "Compress-Archive -Path '${pluginDirName}' -DestinationPath '${tempZip}' -Force"`,
    { stdio: "inherit" }
  );

  // .zip -> .streamDeckPlugin 으로 이름 변경
  if (fs.existsSync(tempZip)) {
    fs.renameSync(tempZip, outputPluginFile);
    const stats = fs.statSync(outputPluginFile);
    console.log(
      `✓ 패키지 생성 완료: ${outputPluginFile} (${(stats.size / 1024).toFixed(1)} KB)`
    );
  }
} catch (e) {
  console.error("패키징 압축 오류:", e);
}

// 3. 사용자의 Stream Deck 플러그인 설치 경로에 자동 배포
console.log("\n3. 로컬 Stream Deck 플러그인 폴더 확인 중...");
const appData = process.env.APPDATA;
if (appData) {
  const streamDeckPluginsDir = path.join(appData, "Elgato", "StreamDeck", "Plugins");
  console.log(`- 대상 경로: ${streamDeckPluginsDir}`);

  if (fs.existsSync(streamDeckPluginsDir)) {
    const targetPluginDir = path.join(streamDeckPluginsDir, pluginDirName);
    console.log(`- 기존 플러그인 대상 폴더로 직접 복사 중... -> ${targetPluginDir}`);

    // 대상 폴더로 재귀적 복사
    fs.cpSync(sourcePluginDir, targetPluginDir, { recursive: true, force: true });
    console.log("✓ Stream Deck 설치 폴더로 자동 배포 완료!");
    console.log("  (Stream Deck 프로그램이 실행 중이라면 앱을 재시작하면 즉시 활성화됩니다.)");
  } else {
    console.log("! Stream Deck Plugins 폴더를 찾지 못했습니다. (.streamDeckPlugin 파일을 더블 클릭하여 설치하세요)");
  }
}

console.log("\n=========================================");
console.log("🎉 배포 준비가 모두 완료되었습니다!");
console.log(`👉 생성된 설치 파일: ${outputPluginFile}`);
console.log("=========================================");
