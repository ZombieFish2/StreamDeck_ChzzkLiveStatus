import streamDeck from "@elgato/streamdeck";
import { SingleStreamerAction } from "./actions/single-streamer.js";
import { MultiStreamerAction } from "./actions/multi-streamer.js";
import { ChzzkManager } from "./services/chzzk-manager.js";
import { ChzzkGlobalSettings } from "./types/chzzk.js";

// 액션 등록
streamDeck.actions.registerAction(new SingleStreamerAction());
streamDeck.actions.registerAction(new MultiStreamerAction());

// 전역 설정 변경 리스너 (모든 버튼에 프록시 서버 주소 공통 적용)
streamDeck.settings.onDidReceiveGlobalSettings<ChzzkGlobalSettings>((ev) => {
  const globalSettings = ev.settings;
  if (globalSettings?.proxyUrl !== undefined) {
    ChzzkManager.getInstance().setProxyUrl(globalSettings.proxyUrl);
  }
});

// 스트림덱 소프트웨어와 연결
streamDeck.connect().then(async () => {
  try {
    const globalSettings = await streamDeck.settings.getGlobalSettings<ChzzkGlobalSettings>();
    if (globalSettings?.proxyUrl !== undefined) {
      ChzzkManager.getInstance().setProxyUrl(globalSettings.proxyUrl);
    }
  } catch (err) {
    console.error("[Plugin] Failed to get initial global settings:", err);
  }
});
