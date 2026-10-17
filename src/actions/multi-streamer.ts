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
import { MultiStreamerSettings, MultiStreamerItem } from "../types/chzzk.js";
import { ChzzkManager } from "../services/chzzk-manager.js";
import { ImageRenderer } from "../services/image-renderer.js";
import { ChzzkApi } from "../services/chzzk-api.js";

interface ButtonState {
  currentDisplayIndex: number;
  lastClickTime: number;
  keyDownTime: number;
  holdTimer: NodeJS.Timeout | null;
  isHoldTriggered: boolean;
  isManualCycle: boolean; // 사용자가 클릭으로 수동 탐색 중인지 여부
}

@action({ UUID: "com.chzzk.livestatus.multi" })
export class MultiStreamerAction extends SingletonAction<MultiStreamerSettings> {
  private lastRenderedImageMap = new Map<string, string>();
  private buttonStates = new Map<string, ButtonState>();
  private manager = ChzzkManager.getInstance();

  private getButtonState(actionId: string): ButtonState {
    let state = this.buttonStates.get(actionId);
    if (!state) {
      state = {
        currentDisplayIndex: 0,
        lastClickTime: 0,
        keyDownTime: 0,
        holdTimer: null,
        isHoldTriggered: false,
        isManualCycle: false,
      };
      this.buttonStates.set(actionId, state);
    }
    return state;
  }

  override onWillAppear(ev: WillAppearEvent<MultiStreamerSettings>): void {
    const actionId = ev.action.id;
    const settings = ev.payload.settings;

    if (settings.proxyUrl && settings.proxyUrl.trim().length > 0) {
      this.manager.setProxyUrl(settings.proxyUrl);
    }

    if (settings.pollingInterval) {
      this.manager.setIntervalSec(settings.pollingInterval);
    }

    const channelIds = (settings.channels || []).map((c) => c.channelId);
    if (channelIds.length > 0) {
      this.manager.subscribe(actionId, channelIds, () => {
        this.updateActionDisplay(ev.action, ev.payload.settings);
      });
    }

    this.updateActionDisplay(ev.action, settings);
  }

  override onWillDisappear(ev: WillDisappearEvent<MultiStreamerSettings>): void {
    const actionId = ev.action.id;
    this.manager.unsubscribe(actionId);
    this.lastRenderedImageMap.delete(actionId);
    const state = this.buttonStates.get(actionId);
    if (state?.holdTimer) {
      clearTimeout(state.holdTimer);
    }
    this.buttonStates.delete(actionId);
  }

  override onDidReceiveSettings(
    ev: DidReceiveSettingsEvent<MultiStreamerSettings>
  ): void {
    const actionId = ev.action.id;
    const settings = ev.payload.settings;

    if (settings.proxyUrl && settings.proxyUrl.trim().length > 0) {
      this.manager.setProxyUrl(settings.proxyUrl);
    }

    if (settings.pollingInterval) {
      this.manager.setIntervalSec(settings.pollingInterval);
    }

    const channelIds = (settings.channels || []).map((c) => c.channelId);
    if (channelIds.length > 0) {
      this.manager.subscribe(actionId, channelIds, () => {
        this.updateActionDisplay(ev.action, settings);
      });
    } else {
      this.manager.unsubscribe(actionId);
    }

    // 설정 변경 시 1순위로 리셋
    const state = this.getButtonState(actionId);
    state.isManualCycle = false;
    state.currentDisplayIndex = 0;

    this.updateActionDisplay(ev.action, settings);
  }

  override onKeyDown(ev: KeyDownEvent<MultiStreamerSettings>): void {
    const actionId = ev.action.id;
    const state = this.getButtonState(actionId);
    const now = Date.now();

    state.keyDownTime = now;
    state.isHoldTriggered = false;

    // 500ms 이상 홀드 시 해당 채널 브라우저 열기
    if (state.holdTimer) clearTimeout(state.holdTimer);
    state.holdTimer = setTimeout(() => {
      state.isHoldTriggered = true;
      this.openCurrentStreamerUrl(ev.action, ev.payload.settings);
    }, 500);
  }

  override onKeyUp(ev: KeyUpEvent<MultiStreamerSettings>): void {
    const actionId = ev.action.id;
    const state = this.getButtonState(actionId);
    const now = Date.now();

    if (state.holdTimer) {
      clearTimeout(state.holdTimer);
      state.holdTimer = null;
    }

    // 홀드가 발동되었으면 클릭/더블클릭 무시
    if (state.isHoldTriggered) {
      return;
    }

    const channels = ev.payload.settings.channels || [];
    if (channels.length === 0) return;

    // 더블클릭 감지 (350ms 이내 재입력)
    const timeSinceLastClick = now - state.lastClickTime;
    state.lastClickTime = now;

    if (timeSinceLastClick < 350) {
      // 더블 클릭: 1순위(기본 모드)로 즉시 초기화
      state.isManualCycle = false;
      state.currentDisplayIndex = 0;
      this.updateActionDisplay(ev.action, ev.payload.settings);
      return;
    }

    // 단일 클릭: 다음 스트리머로 순환
    state.isManualCycle = true;
    this.cycleNextStreamer(ev.action, ev.payload.settings);
  }

  private cycleNextStreamer(action: any, settings: MultiStreamerSettings): void {
    const actionId = action.id;
    const state = this.getButtonState(actionId);
    const channels = settings.channels || [];
    if (channels.length === 0) return;

    const cycleOnlyLive = settings.cycleOnlyLive ?? true;
    const liveChannels = channels.filter((c) => {
      const status = this.manager.getChannelStatus(c.channelId);
      return status?.isLive ?? false;
    });

    const targetList = cycleOnlyLive && liveChannels.length > 0 ? liveChannels : channels;

    state.currentDisplayIndex = (state.currentDisplayIndex + 1) % targetList.length;
    this.updateActionDisplay(action, settings);
  }

  private openCurrentStreamerUrl(action: any, settings: MultiStreamerSettings): void {
    const actionId = action.id;
    const currentChannel = this.getCurrentDisplayedChannel(actionId, settings);
    if (currentChannel) {
      const url = `https://chzzk.naver.com/live/${currentChannel.channelId}`;
      streamDeck.system.openUrl(url);
    }
  }

  private getCurrentDisplayedChannel(
    actionId: string,
    settings: MultiStreamerSettings
  ): MultiStreamerItem | null {
    const channels = settings.channels || [];
    if (channels.length === 0) return null;

    const state = this.getButtonState(actionId);
    const cycleOnlyLive = settings.cycleOnlyLive ?? true;

    const liveChannels = channels.filter((c) => {
      const status = this.manager.getChannelStatus(c.channelId);
      return status?.isLive ?? false;
    });

    const targetList =
      cycleOnlyLive && liveChannels.length > 0 ? liveChannels : channels;

    if (!state.isManualCycle) {
      // 기본 모드: 온라인이 있으면 1순위 온라인 채널, 없으면 1순위 등록 채널
      return targetList[0] || channels[0];
    }

    const index = state.currentDisplayIndex % targetList.length;
    return targetList[index] || channels[0];
  }

  private updateActionDisplay(
    action: any,
    settings: MultiStreamerSettings
  ): void {
    const actionId = action.id;
    const channels = settings.channels || [];

    if (channels.length === 0) {
      const emptySvg = this.getNotConfiguredSvg();
      if (this.lastRenderedImageMap.get(actionId) !== emptySvg) {
        this.lastRenderedImageMap.set(actionId, emptySvg);
        action.setImage(emptySvg);
      }
      return;
    }

    // 채널 목록 중 이름이 미완성인 항목이 있으면 실제 이름으로 자동 동기화
    let channelsUpdated = false;
    for (const ch of channels) {
      const s = this.manager.getChannelStatus(ch.channelId);
      if (s?.channelName && (!ch.channelName || ch.channelName.endsWith("..."))) {
        ch.channelName = s.channelName;
        if (s.channelImageUrl && !ch.channelImageUrl) {
          ch.channelImageUrl = s.channelImageUrl;
        }
        channelsUpdated = true;
      }
    }
    if (channelsUpdated) {
      action.setSettings({
        ...settings,
        channels: [...channels],
      });
    }

    const currentChannel = this.getCurrentDisplayedChannel(actionId, settings);
    if (!currentChannel) return;

    const status = this.manager.getChannelStatus(currentChannel.channelId);
    const imageBase64 = this.manager.getImageBase64(currentChannel.channelId);

    const isLive = status?.isLive ?? false;
    const streamerName =
      currentChannel.channelName || status?.channelName || "스트리머";

    // 다른 라이브 스트리머 수 (+N)
    const totalLiveCount = channels.filter((c) => {
      const s = this.manager.getChannelStatus(c.channelId);
      return s?.isLive ?? false;
    }).length;

    // 현재 표시 중인 채널이 라이브면 (totalLiveCount - 1), 오프라인이면 totalLiveCount
    const extraLiveCount = isLive
      ? Math.max(0, totalLiveCount - 1)
      : totalLiveCount;

    const renderedSvg = ImageRenderer.renderButtonSvg({
      imageBase64,
      isLive,
      extraLiveCount,
    });

    // 깜빡임 방지: 이전과 동일하면 setImage 스킵
    if (this.lastRenderedImageMap.get(actionId) !== renderedSvg) {
      this.lastRenderedImageMap.set(actionId, renderedSvg);
      action.setImage(renderedSvg);
    }
  }

  override async onSendToPlugin(
    ev: SendToPluginEvent<any, MultiStreamerSettings>
  ): Promise<void> {
    const payload = ev.payload;
    if (payload?.proxyUrl && payload.proxyUrl.trim().length > 0) {
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

  private getNotConfiguredSvg(): string {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" rx="20" ry="20" fill="#1b1d24"/>
        <text x="72" y="65" fill="#8E9297" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="700" text-anchor="middle">치지직 통합</text>
        <text x="72" y="90" fill="#00FFA3" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="12" font-weight="600" text-anchor="middle">목록을 추가하세요</text>
      </svg>
    `.trim();
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
}
