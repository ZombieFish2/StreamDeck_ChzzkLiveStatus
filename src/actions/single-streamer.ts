import streamDeck, {
  action,
  KeyDownEvent,
  KeyUpEvent,
  SendToPluginEvent,
  SingletonAction,
  WillAppearEvent,
  WillDisappearEvent,
  DidReceiveSettingsEvent,
} from "@elgato/streamdeck";
import { SingleStreamerSettings } from "../types/chzzk.js";
import { ChzzkManager } from "../services/chzzk-manager.js";
import { ImageRenderer } from "../services/image-renderer.js";
import { ChzzkApi } from "../services/chzzk-api.js";

@action({ UUID: "com.chzzk.livestatus.single" })
export class SingleStreamerAction extends SingletonAction<SingleStreamerSettings> {
  private lastRenderedImageMap = new Map<string, string>();
  private manager = ChzzkManager.getInstance();

  override onWillAppear(ev: WillAppearEvent<SingleStreamerSettings>): void {
    const actionId = ev.action.id;
    const settings = ev.payload.settings;

    if (settings.proxyUrl && settings.proxyUrl.trim().length > 0) {
      this.manager.setProxyUrl(settings.proxyUrl);
    }

    if (settings.pollingInterval) {
      this.manager.setIntervalSec(settings.pollingInterval);
    }

    if (settings.channelId) {
      this.manager.subscribe(actionId, [settings.channelId], () => {
        this.updateActionDisplay(ev.action, ev.payload.settings);
      });
    }

    this.updateActionDisplay(ev.action, settings);
  }

  override onWillDisappear(ev: WillDisappearEvent<SingleStreamerSettings>): void {
    const actionId = ev.action.id;
    this.manager.unsubscribe(actionId);
    this.lastRenderedImageMap.delete(actionId);
  }

  override onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<SingleStreamerSettings>
  ): void {
    const actionId = ev.action.id;
    const settings = ev.payload.settings;

    if (settings.proxyUrl && settings.proxyUrl.trim().length > 0) {
      this.manager.setProxyUrl(settings.proxyUrl);
    }

    if (settings.pollingInterval) {
      this.manager.setIntervalSec(settings.pollingInterval);
    }

    if (settings.channelId) {
      this.manager.subscribe(actionId, [settings.channelId], () => {
        this.updateActionDisplay(ev.action, settings);
      });
    } else {
      this.manager.unsubscribe(actionId);
    }

    this.updateActionDisplay(ev.action, settings);
  }

  override onKeyDown(ev: KeyDownEvent<SingleStreamerSettings>): void {
    // 키 누름 처리 (추후 애니메이션 또는 햅틱 가능)
  }

  override onKeyUp(ev: KeyUpEvent<SingleStreamerSettings>): void {
    const settings = ev.payload.settings;
    if (settings.channelId) {
      const url = `https://chzzk.naver.com/live/${settings.channelId}`;
      streamDeck.system.openUrl(url);
    }
  }

  override async onSendToPlugin(
    ev: SendToPluginEvent<any, SingleStreamerSettings>
  ): Promise<void> {
    const payload = ev.payload;
    if (payload?.proxyUrl !== undefined) {
      ChzzkApi.setBaseUrl(payload.proxyUrl);
    }

    if (payload?.event === "searchChannels") {
      const results = await ChzzkApi.searchChannels(payload.keyword || "");
      await streamDeck.ui.current?.sendToPropertyInspector({
        event: "searchResults",
        requestId: payload.requestId,
        data: results as any,
      });
    } else if (payload?.event === "getChannelInfo") {
      const info = await ChzzkApi.getChannel(payload.channelId || "");
      await streamDeck.ui.current?.sendToPropertyInspector({
        event: "channelInfo",
        requestId: payload.requestId,
        data: info as any,
      });
    }
  }

  private updateActionDisplay(
    action: any,
    settings: SingleStreamerSettings
  ): void {
    const actionId = action.id;
    const channelId = settings.channelId;

    if (!channelId) {
      // 미설정 시 기본 안내 SVG 표시
      const emptySvg = this.getNotConfiguredSvg();
      if (this.lastRenderedImageMap.get(actionId) !== emptySvg) {
        this.lastRenderedImageMap.set(actionId, emptySvg);
        action.setImage(emptySvg);
      }
      return;
    }

    const status = this.manager.getChannelStatus(channelId);
    const imageBase64 = this.manager.getImageBase64(channelId);

    // 스트리머 이름이 비어있으면 백엔드에서 확인된 채널명으로 자동 저장
    if (status?.channelName && !settings.channelName) {
      settings.channelName = status.channelName;
      action.setSettings({
        ...settings,
        channelName: status.channelName,
      });
    }

    const isLive = status?.isLive ?? false;
    const renderedSvg = ImageRenderer.renderButtonSvg({
      imageBase64,
      isLive,
    });

    // 깜빡임 방지: 이전 렌더링 결과와 정확히 동일하면 setImage 호출 스킵
    if (this.lastRenderedImageMap.get(actionId) !== renderedSvg) {
      this.lastRenderedImageMap.set(actionId, renderedSvg);
      action.setImage(renderedSvg);
    }
  }

  private getNotConfiguredSvg(): string {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" rx="20" ry="20" fill="#1b1d24"/>
        <text x="72" y="65" fill="#8E9297" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" text-anchor="middle">치지직 설정</text>
        <text x="72" y="90" fill="#00FFA3" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" text-anchor="middle">채널을 등록하세요</text>
      </svg>
    `.trim();
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
}
