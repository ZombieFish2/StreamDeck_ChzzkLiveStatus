export interface RenderOptions {
  imageBase64: string;
  isLive: boolean;
  extraLiveCount?: number; // 통합 버튼: 다른 라이브 중인 스트리머 수 (+N)
  showStatusDot?: boolean; // 좌측 상단 원형 상태 인디케이터 (기본: true)
}

export class ImageRenderer {
  /**
   * Stream Deck 144x144 고해상도 SVG 이미지 생성
   * - 프로필 사진 중심의 깔끔한 미니멀 디자인
   * - 좌측 상단: 라이브 시 빨간 원, 오프라인 시 회색 원 (배경에 묻히지 않도록 다크 백드롭 + 스트로크 + 그림자 처리)
   * - 오프라인: 채도 25%로 조정하여 스트리머 식별성 보장 + 차분한 오프라인 인지
   * - 통합 버튼: 다른 라이브 스트리머가 있을 시 +N 뱃지 확대 렌더링
   */
  static renderButtonSvg(options: RenderOptions): string {
    const {
      imageBase64,
      isLive,
      extraLiveCount = 0,
      showStatusDot = true,
    } = options;

    const width = 144;
    const height = 144;

    // Desaturation filter (채도 25% 유지하여 프로필 고유 색상 식별 가능)
    const filterDef = !isLive
      ? `
      <defs>
        <filter id="chzzk-desaturate" color-interpolation-filters="sRGB">
          <feColorMatrix type="saturate" values="0.25" />
        </filter>
        <clipPath id="avatar-clip">
          <rect width="144" height="144" rx="20" ry="20" />
        </clipPath>
      </defs>`
      : `
      <defs>
        <clipPath id="avatar-clip">
          <rect width="144" height="144" rx="20" ry="20" />
        </clipPath>
      </defs>`;

    const imageFilterAttr = !isLive
      ? 'filter="url(#chzzk-desaturate)" opacity="0.85"'
      : "";

    // Offline subtle dimming layer (약간의 톤다운으로 오프라인 느낌 부여)
    const offlineDimmer = !isLive
      ? '<rect width="144" height="144" fill="#000000" opacity="0.18" clip-path="url(#avatar-clip)"/>'
      : "";

    // 상태 표시 요소: 통합 버튼의 +N 뱃지 또는 개별 버튼의 원형 인디케이터
    let topBadgeSvg = "";

    if (extraLiveCount > 0) {
      // 1. 통합 버튼: 추가 라이브 인원 (+N) 뱃지
      const extraText = `+${extraLiveCount}`;
      const badgeWidth = extraText.length > 2 ? 62 : 52;
      const badgeHeight = 32;
      topBadgeSvg = `
        <!-- Extra Live Count Badge (Enlarged) -->
        <g transform="translate(8, 8)" filter="drop-shadow(0 3px 6px rgba(0,0,0,0.75))">
          <rect width="${badgeWidth}" height="${badgeHeight}" rx="16" fill="#00FFA3" />
          <text x="${badgeWidth / 2}" y="23" fill="#000000" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans KR', sans-serif" font-size="18" font-weight="900" text-anchor="middle" letter-spacing="-0.5">${extraText}</text>
        </g>
      `;
    } else if (showStatusDot) {
      // 2. 개별 버튼: 좌측 상단 원형 상태 인디케이터 (크기 확대 & 선명도 강화)
      // 배경에 묻히지 않도록 반투명 다크 백드롭 링 + 드롭 섀도 + 림 스트로크 적용
      const dotInnerRing = isLive
        ? '<circle cx="23" cy="23" r="9.5" fill="#FF1744" stroke="#FFA4B4" stroke-width="1.5" stroke-opacity="0.9" />'
        : '<circle cx="23" cy="23" r="8.5" fill="none" stroke="#FFFFFF" stroke-width="5.0" stroke-opacity="1" />';

      topBadgeSvg = `
        <!-- Status Dot Indicator (Top-Left, Enlarged) -->
        <g filter="drop-shadow(0 3px 6px rgba(0,0,0,0.95))">
          <!-- Dark Backdrop Capsule / Circle to ensure separation from any background -->
          <circle cx="23" cy="23" r="14" fill="rgba(14, 16, 22, 0.78)" stroke="rgba(255, 255, 255, 0.3)" stroke-width="1.5" />
          <!-- Inner Status Circle -->
          ${dotInnerRing}
        </g>
      `;
    }

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        ${filterDef}
        <rect width="144" height="144" rx="20" ry="20" fill="#14151a" />
        <g clip-path="url(#avatar-clip)">
          <image href="${imageBase64}" x="0" y="0" width="144" height="144" preserveAspectRatio="xMidYMid slice" ${imageFilterAttr} />
          ${offlineDimmer}
        </g>
        ${topBadgeSvg}
      </svg>
    `.trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
}
