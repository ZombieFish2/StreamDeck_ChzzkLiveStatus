import { ChzzkApi } from "./chzzk-api.js";
import { ChzzkLiveStatus } from "../types/chzzk.js";

type UpdateListener = () => void;

interface SubscriptionEntry {
  channelIds: string[];
  callback: UpdateListener;
  bypassProxy?: boolean;
}

interface ChannelData {
  channelId: string;
  channelName: string;
  channelImageUrl: string | null;
  imageBase64: string;
  isLive: boolean;
  liveTitle: string | null;
  concurrentUserCount: number;
  liveCategory: string | null;
  lastUpdated: number;
  lastInfoFetch: number;
}

export class ChzzkManager {
  private static instance: ChzzkManager;

  private channelDataMap = new Map<string, ChannelData>();
  private subscriptions = new Map<string, SubscriptionEntry>();
  private pollingTimer: NodeJS.Timeout | null = null;
  private currentIntervalSec = 60;
  private isPolling = false;

  private constructor() {
    this.startPolling(this.currentIntervalSec);
  }

  public static getInstance(): ChzzkManager {
    if (!ChzzkManager.instance) {
      ChzzkManager.instance = new ChzzkManager();
    }
    return ChzzkManager.instance;
  }

  /**
   * 폴링 주기 설정 (초 단위, 최소 10초)
   */
  public setIntervalSec(seconds: number): void {
    const sec = Math.max(10, Math.min(600, seconds || 30));
    if (this.currentIntervalSec !== sec) {
      this.currentIntervalSec = sec;
      this.startPolling(sec);
    }
  }

  /**
   * 구독 등록 (버튼 인스턴스별)
   */
  public subscribe(
    subscriberId: string,
    channelIds: string[],
    callback: UpdateListener,
    options?: { bypassProxy?: boolean }
  ): void {
    const validIds = channelIds.filter((id) => id && id.trim().length > 0);
    this.subscriptions.set(subscriberId, {
      channelIds: validIds,
      callback,
      bypassProxy: !!options?.bypassProxy,
    });

    // 새로 등록된 채널이 있으면 즉시 fetch 실행
    let hasNew = false;
    for (const cid of validIds) {
      if (!this.channelDataMap.has(cid)) {
        hasNew = true;
      }
    }

    if (hasNew) {
      this.pollChannels(validIds);
    }
  }

  /**
   * 구독 해제
   */
  public unsubscribe(subscriberId: string): void {
    this.subscriptions.delete(subscriberId);
  }

  /**
   * 채널의 현재 캐시 데이터 조회
   */
  public getChannelStatus(channelId: string): ChzzkLiveStatus | undefined {
    const data = this.channelDataMap.get(channelId);
    if (!data) return undefined;
    return {
      channelId: data.channelId,
      channelName: data.channelName,
      channelImageUrl: data.channelImageUrl,
      isLive: data.isLive,
      liveTitle: data.liveTitle,
      concurrentUserCount: data.concurrentUserCount,
      liveCategory: data.liveCategory,
      lastUpdated: data.lastUpdated,
    };
  }

  /**
   * 캐시된 Base64 프로필 이미지 조회
   */
  public getImageBase64(channelId: string): string {
    const data = this.channelDataMap.get(channelId);
    if (data?.imageBase64) {
      return data.imageBase64;
    }
    return ChzzkApi.getDefaultAvatarSvgBase64();
  }

  private startPolling(intervalSec: number): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }
    this.pollingTimer = setInterval(() => {
      this.pollAllSubscribedChannels();
    }, intervalSec * 1000);
  }

  /**
   * 전체 구독 채널 폴링
   */
  public async pollAllSubscribedChannels(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const allChannelIds = new Set<string>();
      for (const sub of this.subscriptions.values()) {
        for (const cid of sub.channelIds) {
          allChannelIds.add(cid);
        }
      }

      if (allChannelIds.size > 0) {
        await this.pollChannels(Array.from(allChannelIds));
      }
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * 프록시 Base URL 설정
   */
  public setProxyUrl(url?: string): void {
    ChzzkApi.setBaseUrl(url);
  }

  /**
   * 특정 채널 목록 폴링 & 업데이트 통지
   */
  private async pollChannels(channelIds: string[]): Promise<void> {
    const now = Date.now();

    // 병렬로 상태 조회 (채널별 타임아웃 6초)
    await Promise.all(
      channelIds.map(async (channelId) => {
        try {
          const bypassProxy = Array.from(this.subscriptions.values()).some(
            (sub) => sub.channelIds.includes(channelId) && sub.bypassProxy
          );

          let cached = this.channelDataMap.get(channelId);

          // 최신 v3 live-detail 호출 (1회 호출로 라이브 상태 + 스트리머 프로필 동시 획득)
          let liveDetail = await ChzzkApi.getLiveDetail(channelId, { bypassProxy });

          let channelName = liveDetail?.channelName || cached?.channelName;
          let channelImageUrl = liveDetail?.channelImageUrl || cached?.channelImageUrl;

          // 채널명이나 프로필 이미지가 없으면 채널 정보 API 추가 조회
          if (!channelName || !channelImageUrl) {
            const channelInfo = await ChzzkApi.getChannel(channelId, { bypassProxy });
            if (channelInfo) {
              channelName = channelName || channelInfo.channelName;
              channelImageUrl = channelImageUrl || channelInfo.channelImageUrl;
            }
          }

          // 기본 아바타 상태이거나 URL이 변경되었으면 이미지 다운로드 시도
          let imageBase64 = cached?.imageBase64;
          const isDefaultAvatar =
            !imageBase64 || imageBase64.startsWith("data:image/svg+xml");
          const isUrlChanged =
            channelImageUrl && channelImageUrl !== cached?.channelImageUrl;

          if (channelImageUrl && (isDefaultAvatar || isUrlChanged)) {
            const downloaded = await ChzzkApi.downloadImageAsBase64(channelImageUrl);
            if (downloaded) {
              imageBase64 = downloaded;
            }
          }

          if (liveDetail || channelName) {
            const isLive = liveDetail?.isLive ?? cached?.isLive ?? false;
            const liveTitle = liveDetail?.liveTitle ?? cached?.liveTitle ?? null;
            const concurrentUserCount = liveDetail?.concurrentUserCount ?? cached?.concurrentUserCount ?? 0;
            const liveCategory = liveDetail?.liveCategory ?? cached?.liveCategory ?? null;

            if (cached) {
              cached.channelName = channelName || cached.channelName || "스트리머";
              cached.channelImageUrl = channelImageUrl || cached.channelImageUrl;
              if (imageBase64) cached.imageBase64 = imageBase64;
              cached.isLive = isLive;
              cached.liveTitle = liveTitle;
              cached.concurrentUserCount = concurrentUserCount;
              cached.liveCategory = liveCategory;
              cached.lastUpdated = now;
            } else {
              cached = {
                channelId,
                channelName: channelName || "스트리머",
                channelImageUrl: channelImageUrl || null,
                imageBase64: imageBase64 || ChzzkApi.getDefaultAvatarSvgBase64(),
                isLive,
                liveTitle,
                concurrentUserCount,
                liveCategory,
                lastUpdated: now,
                lastInfoFetch: now,
              };
              this.channelDataMap.set(channelId, cached);
            }
          }
        } catch (err) {
          // 네트워크 실패 시 기존 캐시 100% 보존
          console.warn(`[ChzzkManager] Polling failed for channel ${channelId}, keeping last state:`, err);
        }
      })
    );

    // 변경사항이 있거나 최초 로드 시 모든 리스너에 알림
    for (const sub of this.subscriptions.values()) {
      try {
        sub.callback();
      } catch (e) {
        console.error("[ChzzkManager] Error invoking subscriber callback:", e);
      }
    }
  }
}
