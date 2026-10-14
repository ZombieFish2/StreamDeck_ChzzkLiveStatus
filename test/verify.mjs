import assert from "node:assert";
import { ChzzkApi } from "../src/services/chzzk-api.js";
import { ImageRenderer } from "../src/services/image-renderer.js";

async function runTests() {
  console.log("=== 치지직 스트림덱 플러그인 검증 시작 ===\n");

  // 1. 프록시 Base URL 정규화 테스트 (도메인, HTTPS, 포트, 로컬 호스트)
  console.log("1. 프록시 Base URL 정규화 테스트...");
  assert.strictEqual(
    ChzzkApi.normalizeBaseUrl(""),
    "https://api.chzzk.naver.com"
  );
  assert.strictEqual(
    ChzzkApi.normalizeBaseUrl("http://localhost:8000/"),
    "http://localhost:8000"
  );
  assert.strictEqual(
    ChzzkApi.normalizeBaseUrl("https://my-proxy.domain.com///"),
    "https://my-proxy.domain.com"
  );
  assert.strictEqual(
    ChzzkApi.normalizeBaseUrl("proxy.chzzk.com:8443"),
    "https://proxy.chzzk.com:8443"
  );
  assert.strictEqual(
    ChzzkApi.normalizeBaseUrl("192.168.1.100:8000"),
    "http://192.168.1.100:8000"
  );
  console.log("  ✓ 도메인, HTTPS, HTTP, 포트, 슬래시 정규화 완벽 통과");

  // 2. 치지직 채널 검색 API 테스트
  console.log("\n2. 치지직 채널 검색 API 테스트...");
  const searchResults = await ChzzkApi.searchChannels("침착맨");
  assert(Array.isArray(searchResults), "Search results must be an array");
  assert(searchResults.length > 0, "Search results must not be empty");
  const first = searchResults[0];
  console.log(`  ✓ 검색 성공: ${first.channelName} (${first.channelId})`);
  assert(first.channelId, "Channel ID must exist");
  assert(first.channelName, "Channel Name must exist");

  // 3. 최신 v3 live-detail API 테스트 (1회 호출로 상태+프로필 획득)
  console.log("\n3. 최신 v3 live-detail API 테스트...");
  const liveDetail = await ChzzkApi.getLiveDetail(first.channelId);
  assert(liveDetail !== null, "Live detail must not be null");
  console.log(`  ✓ v3 응답: 라이브=${liveDetail.isLive ? "ON" : "OFF"}, 채널명=${liveDetail.channelName}, 시청자=${liveDetail.concurrentUserCount}`);
  assert(liveDetail.channelName, "Channel name must exist in v3 live-detail");

  // 4. 프로필 이미지 Base64 변환 테스트
  console.log("\n4. 프로필 이미지 다운로드 및 Base64 변환 테스트...");
  const imageBase64 = await ChzzkApi.downloadImageAsBase64(liveDetail.channelImageUrl || first.channelImageUrl);
  assert(imageBase64.startsWith("data:image/"), "Image must be data URL");
  console.log(`  ✓ Base64 인코딩 완료 (길이: ${imageBase64.length} chars)`);

  // 4-1. 특정 스트리머(아오쿠모 린, 하나코 나나) 채널 조회 및 이미지 다운로드 테스트
  console.log("\n4-1. 특정 채널(아오쿠모 린, 하나코 나나) 채널 정보 및 이미지 검증...");
  const testChannelIds = [
    { id: "516937b5f85cbf2249ce31b0ad046b0f", expectedName: "아오쿠모 린" },
    { id: "4d812b586ff63f8a2946e64fa860bbf5", expectedName: "하나코 나나" },
  ];
  for (const tc of testChannelIds) {
    const ch = await ChzzkApi.getChannel(tc.id);
    assert(ch !== null, `Channel ${tc.id} must be fetched`);
    assert(ch.channelName.includes(tc.expectedName), `Channel name should be ${tc.expectedName}`);
    assert(ch.channelImageUrl, "Channel image URL must exist");
    const imgBase64 = await ChzzkApi.downloadImageAsBase64(ch.channelImageUrl);
    assert(imgBase64 && imgBase64.startsWith("data:image/"), "Downloaded image must be valid data URL");
    console.log(`  ✓ ${ch.channelName} 정보 및 이미지 다운로드 성공 (${imgBase64.length} chars)`);
  }

  // 5. SVG 렌더러 테스트 - 온라인 상태 (좌측 상단 빨간 원)
  console.log("\n5. SVG 렌더러 테스트 - 온라인 상태 (좌측 상단 빨간 원 인디케이터)...");
  const onlineSvg = ImageRenderer.renderButtonSvg({
    imageBase64,
    isLive: true,
  });
  assert(onlineSvg.startsWith("data:image/svg+xml;charset=utf-8,"), "Must be SVG Data URL");
  const decodedOnline = decodeURIComponent(onlineSvg);
  assert(!decodedOnline.includes('filter="url(#chzzk-desaturate)"'), "Online SVG must NOT have desaturate filter");
  assert(decodedOnline.includes("#FF1744"), "Online SVG must contain Red dot (#FF1744)");
  assert(!decodedOnline.includes(">LIVE<"), "Online SVG should NOT contain LIVE text");
  console.log("  ✓ 온라인 SVG 생성 성공 (텍스트 없이 선명한 빨간 원 인디케이터)");

  // 6. SVG 렌더러 테스트 - 오프라인 상태 (채도 25% + 좌측 상단 회색 원)
  console.log("\n6. SVG 렌더러 테스트 - 오프라인 상태 (채도 25% + 좌측 상단 회색 원)...");
  const offlineSvg = ImageRenderer.renderButtonSvg({
    imageBase64,
    isLive: false,
  });
  const decodedOffline = decodeURIComponent(offlineSvg);
  assert(decodedOffline.includes('filter="url(#chzzk-desaturate)"'), "Offline SVG must have desaturate filter");
  assert(decodedOffline.includes('type="saturate" values="0.25"'), "Offline SVG must contain saturate 0.25");
  assert(decodedOffline.includes('stroke="#FFFFFF"'), "Offline SVG must contain hollow white ring (stroke=#FFFFFF)");
  assert(decodedOffline.includes('fill="none"'), "Offline SVG ring must be hollow (fill=none)");
  assert(!decodedOffline.includes(">OFF<"), "Offline SVG should NOT contain OFF text");
  console.log("  ✓ 오프라인 SVG 생성 성공 (채도 25% + 선명한 화이트 도넛 링 인디케이터)");

  // 7. SVG 렌더러 테스트 - 통합 버튼 (확대된 +N 뱃지)
  console.log("\n7. SVG 렌더러 테스트 - 통합 버튼 (확대된 +N 뱃지)...");
  const multiSvg = ImageRenderer.renderButtonSvg({
    imageBase64,
    isLive: true,
    extraLiveCount: 3,
  });
  const decodedMulti = decodeURIComponent(multiSvg);
  assert(decodedMulti.includes("+3"), "Multi SVG must contain +3 badge");
  assert(decodedMulti.includes('font-size="18"'), "Multi SVG must have enlarged font (18px)");
  assert(decodedMulti.includes("#00FFA3"), "Must use Chzzk brand color for extra badge");
  console.log("  ✓ 통합 버튼 SVG 생성 성공 (확대된 +3 뱃지 및 브랜드 컬러)");

  // 8. 멀티 채널 우선순위 및 순환 로직 모의 검증
  console.log("\n8. 멀티 채널 우선순위 및 순환 로직 검증...");
  const mockChannels = [
    { channelId: "ch1", channelName: "스트리머1", isLive: false },
    { channelId: "ch2", channelName: "스트리머2", isLive: true },
    { channelId: "ch3", channelName: "스트리머3", isLive: true },
  ];

  // 1순위 온라인 채널: ch2
  const liveList = mockChannels.filter((c) => c.isLive);
  assert.strictEqual(liveList[0].channelId, "ch2", "1st priority live streamer should be ch2");
  assert.strictEqual(liveList.length - 1, 1, "Extra live count should be 1 (+1 badge)");

  // 순환 테스트: 0 -> 1 -> 0
  let curIndex = 0;
  curIndex = (curIndex + 1) % liveList.length;
  assert.strictEqual(liveList[curIndex].channelId, "ch3", "Next streamer should be ch3");
  curIndex = (curIndex + 1) % liveList.length;
  assert.strictEqual(liveList[curIndex].channelId, "ch2", "Next should cycle back to ch2");

  console.log("  ✓ 우선순위 온라인 탐색 및 순환 로직 통과");

  console.log("\n=========================================");
  console.log("🎉 모든 검증 테스트가 완벽하게 통과되었습니다!");
  console.log("=========================================");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
