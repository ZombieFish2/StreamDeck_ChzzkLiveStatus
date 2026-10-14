let websocket = null;
let pluginUUID = null;
let actionInfo = null;
let currentSettings = {};
let currentGlobalSettings = {};
let searchTimeout = null;
let pendingSearchResolve = null;
let pendingChannelInfoResolve = null;

window.connectElgatoStreamDeckSocket = function (
  inPort,
  inPropertyInspectorUUID,
  inRegisterEvent,
  inInfo,
  inActionInfo
) {
  pluginUUID = inPropertyInspectorUUID;
  try {
    actionInfo = JSON.parse(inActionInfo);
    currentSettings = actionInfo.payload?.settings || {};
  } catch (e) {
    currentSettings = {};
  }

  websocket = new WebSocket("ws://127.0.0.1:" + inPort);

  websocket.onopen = function () {
    const registerPayload = {
      event: inRegisterEvent,
      uuid: inPropertyInspectorUUID,
    };
    websocket.send(JSON.stringify(registerPayload));

    // 전역 설정 요청 (모든 버튼 공통 프록시 서버 주소 등)
    websocket.send(
      JSON.stringify({
        event: "getGlobalSettings",
        context: inPropertyInspectorUUID,
      })
    );

    if (typeof window.initInspector === "function") {
      window.initInspector(currentSettings);
    }
  };

  websocket.onmessage = function (evt) {
    try {
      const data = JSON.parse(evt.data);
      if (data.event === "didReceiveGlobalSettings") {
        currentGlobalSettings = data.payload?.settings || {};
        if (typeof window.onGlobalSettingsLoaded === "function") {
          window.onGlobalSettingsLoaded(currentGlobalSettings);
        }
      } else if (data.event === "sendToPropertyInspector") {
        const payload = data.payload;
        if (payload?.event === "searchResults" && pendingSearchResolve) {
          pendingSearchResolve(payload.data || []);
          pendingSearchResolve = null;
        } else if (payload?.event === "channelInfo" && pendingChannelInfoResolve) {
          pendingChannelInfoResolve(payload.data || null);
          pendingChannelInfoResolve = null;
        }
      }
    } catch (e) {
      console.error("[PI] onmessage error:", e);
    }
  };
};

function saveSettings(newSettings) {
  currentSettings = { ...currentSettings, ...newSettings };
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(
      JSON.stringify({
        event: "setSettings",
        context: pluginUUID,
        payload: currentSettings,
      })
    );
  }
}

function saveGlobalSettings(newSettings) {
  currentGlobalSettings = { ...currentGlobalSettings, ...newSettings };
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(
      JSON.stringify({
        event: "setGlobalSettings",
        context: pluginUUID,
        payload: currentGlobalSettings,
      })
    );
  }
}

function sendToPlugin(payload) {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(
      JSON.stringify({
        event: "sendToPlugin",
        context: pluginUUID,
        payload: payload,
      })
    );
  }
}

function getEffectiveProxyUrl() {
  if (currentSettings.proxyUrl && currentSettings.proxyUrl.trim().length > 0) {
    return currentSettings.proxyUrl.trim();
  }
  if (currentGlobalSettings.proxyUrl && currentGlobalSettings.proxyUrl.trim().length > 0) {
    return currentGlobalSettings.proxyUrl.trim();
  }
  return "";
}

/**
 * 치지직 채널 검색 (직접 fetch 시도 후 백엔드 프록시 폴백)
 */
async function searchChzzkChannels(keyword) {
  if (!keyword || keyword.trim().length === 0) return [];
  const trimmed = keyword.trim();

  const proxy = getEffectiveProxyUrl();
  const baseUrl = proxy ? proxy.replace(/\/+$/, "") : "https://api.chzzk.naver.com";

  try {
    const res = await fetch(
      `${baseUrl}/service/v1/search/channels?keyword=${encodeURIComponent(
        trimmed
      )}&size=10`
    );
    if (res.ok) {
      const json = await res.json();
      if (json.code === 200 && json.content?.data) {
        return json.content.data.map((item) => ({
          channelId: item.channel.channelId,
          channelName: item.channel.channelName,
          channelImageUrl: item.channel.channelImageUrl,
          openLive: !!item.channel.openLive,
        }));
      }
    }
  } catch (e) {
    // CORS 또는 네트워크 오류 시 백엔드 플러그인에 요청
  }

  return new Promise((resolve) => {
    pendingSearchResolve = resolve;
    sendToPlugin({
      event: "searchChannels",
      keyword: trimmed,
      proxyUrl: proxy,
      requestId: Date.now().toString(),
    });
    // 4초 후 타임아웃
    setTimeout(() => {
      if (pendingSearchResolve) {
        pendingSearchResolve([]);
        pendingSearchResolve = null;
      }
    }, 4000);
  });
}

/**
 * 채널 상세 정보 조회 (채널 ID 기준)
 */
async function getChzzkChannelInfo(channelId) {
  if (!channelId || channelId.trim().length === 0) return null;
  const trimmed = channelId.trim();

  const proxy = getEffectiveProxyUrl();
  const baseUrl = proxy ? proxy.replace(/\/+$/, "") : "https://api.chzzk.naver.com";

  try {
    const res = await fetch(
      `${baseUrl}/service/v1/channels/${encodeURIComponent(trimmed)}`
    );
    if (res.ok) {
      const json = await res.json();
      if (json.code === 200 && json.content) {
        return {
          channelId: json.content.channelId,
          channelName: json.content.channelName,
          channelImageUrl: json.content.channelImageUrl,
          openLive: !!json.content.openLive,
        };
      }
    }
  } catch (e) {
    // CORS 또는 오류 시 백엔드 프록시 폴백
  }

  return new Promise((resolve) => {
    pendingChannelInfoResolve = resolve;
    sendToPlugin({
      event: "getChannelInfo",
      channelId: trimmed,
      proxyUrl: proxy,
      requestId: Date.now().toString(),
    });
    setTimeout(() => {
      if (pendingChannelInfoResolve) {
        pendingChannelInfoResolve(null);
        pendingChannelInfoResolve = null;
      }
    }, 4000);
  });
}
