import { ChzzkChannel } from "../types/chzzk.js";

const DEFAULT_OFFICIAL_URL = "https://api.chzzk.naver.com";

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json",
  Origin: "https://chzzk.naver.com",
  Referer: "https://chzzk.naver.com/",
};

export interface LiveDetailResult {
  isLive: boolean;
  liveTitle: string | null;
  concurrentUserCount: number;
  liveCategory: string | null;
  channelName?: string;
  channelImageUrl?: string | null;
}

export class ChzzkApi {
  private static customBaseUrl: string = DEFAULT_OFFICIAL_URL;

  /**
   * 프록시 Base URL 정규화
   * - 도메인, HTTPS, HTTP, 커스텀 포트, 슬래시 완벽 대응
   */
  public static normalizeBaseUrl(url?: string): string {
    if (!url || typeof url !== "string") {
      return DEFAULT_OFFICIAL_URL;
    }

    let trimmed = url.trim();
    if (trimmed.length === 0) {
      return DEFAULT_OFFICIAL_URL;
    }

    // 프로토콜(http:// 또는 https://)이 생략된 경우 자동 보정
    if (!/^https?:\/\//i.test(trimmed)) {
      if (
        trimmed.startsWith("localhost") ||
        trimmed.startsWith("127.0.0.1") ||
        trimmed.startsWith("192.168.") ||
        trimmed.startsWith("10.")
      ) {
        trimmed = `http://${trimmed}`;
      } else {
        // 일반 외부 도메인은 https:// 기본 적용
        trimmed = `https://${trimmed}`;
      }
    }

    // 끝의 모든 슬래시(/) 제거
    trimmed = trimmed.replace(/\/+$/, "");

    try {
      const parsed = new URL(trimmed);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(
        /\/+$/,
        ""
      );
    } catch {
      return trimmed;
    }
  }

  /**
   * Base URL 설정 (프록시/캐시 서버 지정)
   */
  public static setBaseUrl(url?: string): void {
    this.customBaseUrl = this.normalizeBaseUrl(url);
  }

  /**
   * 현재 적용 중인 Base URL
   */
  public static getBaseUrl(): string {
    return this.customBaseUrl;
  }

  /**
   * 채널 검색 (검색어 자동완성 지원)
   * - 프록시 서버가 검색을 지원하지 않거나 404를 반환하면 공식 치지직 서버로 자동 폴백
   */
  public static async searchChannels(keyword: string): Promise<ChzzkChannel[]> {
    if (!keyword || keyword.trim().length === 0) return [];
    const encoded = encodeURIComponent(keyword.trim());

    // 시도할 서버 목록 (프록시가 설정되어 있으면 프록시 먼저, 그 다음 공식 서버)
    const baseUrls = [this.getBaseUrl()];
    if (this.getBaseUrl() !== DEFAULT_OFFICIAL_URL) {
      baseUrls.push(DEFAULT_OFFICIAL_URL);
    }

    for (const base of baseUrls) {
      try {
        const res = await fetch(
          `${base}/service/v1/search/channels?keyword=${encoded}&size=10`,
          {
            headers: DEFAULT_HEADERS,
            signal: AbortSignal.timeout(5000),
          }
        );
        if (!res.ok) continue;

        const json = (await res.json()) as any;
        if (json.code !== 200 || !json.content?.data) continue;

        return json.content.data.map((item: any) => ({
          channelId: item.channel.channelId,
          channelName: item.channel.channelName,
          channelImageUrl: item.channel.channelImageUrl || null,
          openLive: !!item.channel.openLive,
          followerCount: item.channel.followerCount,
        }));
      } catch (err) {
        // 다음 URL 시도
      }
    }

    return [];
  }

  /**
   * 채널 상세 정보 조회 (service/v1/channels/{channelId})
   * - 프록시 실패 시 공식 서버로 자동 폴백
   */
  public static async getChannel(channelId: string): Promise<ChzzkChannel | null> {
    if (!channelId) return null;
    const encoded = encodeURIComponent(channelId.trim());

    const baseUrls = [this.getBaseUrl()];
    if (this.getBaseUrl() !== DEFAULT_OFFICIAL_URL) {
      baseUrls.push(DEFAULT_OFFICIAL_URL);
    }

    for (const base of baseUrls) {
      try {
        const res = await fetch(
          `${base}/service/v1/channels/${encoded}`,
          {
            headers: DEFAULT_HEADERS,
            signal: AbortSignal.timeout(5000),
          }
        );
        if (!res.ok) continue;

        const json = (await res.json()) as any;
        if (json.code !== 200 || !json.content) continue;

        return {
          channelId: json.content.channelId,
          channelName: json.content.channelName,
          channelImageUrl: json.content.channelImageUrl || null,
          openLive: !!json.content.openLive,
          followerCount: json.content.followerCount,
        };
      } catch (err) {
        // 다음 URL 시도
      }
    }

    return null;
  }

  /**
   * 실시간 라이브 상세 조회 (v3 live-detail 최우선, v2 및 polling 폴백)
   * - 1회 호출로 라이브 상태 + 스트리머 프로필/채널명 동시 수집
   */
  public static async getLiveDetail(
    channelId: string
  ): Promise<LiveDetailResult | null> {
    if (!channelId) return null;

    const base = this.getBaseUrl();

    // 1. 권장 표준인 v3 live-detail 시도
    try {
      const v3Url = `${base}/service/v3/channels/${encodeURIComponent(channelId)}/live-detail`;
      const res = await fetch(v3Url, {
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const json = (await res.json()) as any;
        if (json.code === 200 && json.content) {
          const content = json.content;
          return {
            isLive: content.status === "OPEN",
            liveTitle: content.liveTitle || null,
            concurrentUserCount: content.concurrentUserCount || 0,
            liveCategory: content.liveCategoryValue || null,
            channelName: content.channel?.channelName,
            channelImageUrl: content.channel?.channelImageUrl || null,
          };
        }
      }
    } catch {
      // v3 실패 시 v2 폴백 진행
    }

    // 2. v2 live-detail 폴백
    try {
      const v2Url = `${base}/service/v2/channels/${encodeURIComponent(channelId)}/live-detail`;
      const res = await fetch(v2Url, {
        headers: DEFAULT_HEADERS,
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const json = (await res.json()) as any;
        if (json.code === 200 && json.content) {
          const content = json.content;
          return {
            isLive: content.status === "OPEN",
            liveTitle: content.liveTitle || null,
            concurrentUserCount: content.concurrentUserCount || 0,
            liveCategory: content.liveCategoryValue || null,
            channelName: content.channel?.channelName,
            channelImageUrl: content.channel?.channelImageUrl || null,
          };
        }
      }
    } catch {
      // polling 엔드포인트 폴백
    }

    // 3. 기존 polling/v2 live-status 폴백
    return this.getLiveStatusFallback(channelId);
  }

  /**
   * 레거시 polling/v2 폴백 메서드
   */
  private static async getLiveStatusFallback(
    channelId: string
  ): Promise<LiveDetailResult | null> {
    try {
      const base = this.getBaseUrl();
      const res = await fetch(
        `${base}/polling/v2/channels/${encodeURIComponent(channelId)}/live-status`,
        {
          headers: DEFAULT_HEADERS,
          signal: AbortSignal.timeout(6000),
        }
      );
      if (!res.ok) return null;
      const json = (await res.json()) as any;
      if (json.code !== 200 || !json.content) return null;

      return {
        isLive: json.content.status === "OPEN",
        liveTitle: json.content.liveTitle || null,
        concurrentUserCount: json.content.concurrentUserCount || 0,
        liveCategory: json.content.liveCategoryValue || null,
      };
    } catch (err) {
      console.error(`[ChzzkApi] Error fetching fallback live status for ${channelId}:`, err);
      return null;
    }
  }

  /**
   * 프로필 이미지 다운로드 및 Base64 Data URL 변환
   * (네이버 이미지 CDN 호환: Origin/Referer 제거 및 스트림덱 최적 해상도 우선 다운로드)
   */
  public static async downloadImageAsBase64(
    imageUrl: string | null,
    fallbackToDefault: boolean = false
  ): Promise<string | null> {
    if (!imageUrl) {
      return fallbackToDefault ? this.getDefaultAvatarSvgBase64() : null;
    }

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    };

    // 네이버 phinf CDN 이미지인 경우 스트림덱 버튼 크기(120x120)에 맞춘 초경량 썸네일 우선 시도 (용량 2MB -> 28KB)
    const candidateUrls: string[] = [];
    if (imageUrl.includes("pstatic.net") && !imageUrl.includes("type=")) {
      const separator = imageUrl.includes("?") ? "&" : "?";
      candidateUrls.push(`${imageUrl}${separator}type=f120_120`);
    }
    candidateUrls.push(imageUrl);

    for (const targetUrl of candidateUrls) {
      try {
        const res = await fetch(targetUrl, {
          headers,
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;

        const mimeType = res.headers.get("content-type") || "image/png";
        const buffer = Buffer.from(await res.arrayBuffer());
        return `data:${mimeType};base64,${buffer.toString("base64")}`;
      } catch {
        // 다음 URL 시도
      }
    }

    console.warn(`[ChzzkApi] Failed to download image ${imageUrl}`);
    return fallbackToDefault ? this.getDefaultAvatarSvgBase64() : null;
  }

  /**
   * 기본 폴백 아바타 (이미지 없을 시)
   */
  public static getDefaultAvatarSvgBase64(): string {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#1b1d24"/>
        <circle cx="72" cy="54" r="26" fill="#4a4d57"/>
        <path d="M 30 120 C 30 92, 50 88, 72 88 C 94 88, 114 92, 114 120 Z" fill="#4a4d57"/>
      </svg>
    `.trim();
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }
}
