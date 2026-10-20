export interface ChzzkChannel {
  [key: string]: any;
  channelId: string;
  channelName: string;
  channelImageUrl: string | null;
  openLive: boolean;
  followerCount?: number;
}

export interface ChzzkLiveStatus {
  [key: string]: any;
  channelId: string;
  channelName: string;
  channelImageUrl: string | null;
  isLive: boolean;
  liveTitle: string | null;
  concurrentUserCount: number;
  liveCategory: string | null;
  lastUpdated: number;
}

export interface SingleStreamerSettings {
  [key: string]: any;
  channelId?: string;
  channelName?: string;
  pollingInterval?: number; // 초 단위, 기본 60초
  proxyUrl?: string; // 프록시/캐시 서버 Base URL (예: https://proxy.domain.com 또는 http://localhost:8000)
  bypassProxy?: boolean; // 해당 버튼에 대해 공통 프록시를 끄고 공식 API 직접 연결
}

export interface MultiStreamerItem {
  [key: string]: any;
  channelId: string;
  channelName: string;
  channelImageUrl?: string | null;
}

export interface MultiStreamerSettings {
  [key: string]: any;
  channels?: MultiStreamerItem[];
  pollingInterval?: number; // 초 단위, 기본 60초
  cycleOnlyLive?: boolean; // 기본 true
  proxyUrl?: string; // 프록시/캐시 서버 Base URL
  bypassProxy?: boolean; // 해당 버튼에 대해 공통 프록시를 끄고 공식 API 직접 연결
}

export interface ChzzkGlobalSettings {
  [key: string]: any;
  proxyUrl?: string; // 플러그인 전체 공통 프록시/캐시 서버 Base URL
}

