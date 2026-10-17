let websocket = null;
let pluginUUID = null;
let actionInfo = null;
let currentSettings = {};
let currentGlobalSettings = {};
let searchTimeout = null;
const pendingSearchResolvers = new Map();
const pendingChannelInfoResolvers = new Map();

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
        if (payload?.event === "searchResults") {
          const reqId = payload.requestId;
          if (reqId && pendingSearchResolvers.has(reqId)) {
            pendingSearchResolvers.get(reqId)(payload.data || []);
            pendingSearchResolvers.delete(reqId);
          } else {
            // fallback: 첫 번째 대기 중인 resolver 처리
            for (const [id, resolve] of pendingSearchResolvers.entries()) {
              resolve(payload.data || []);
              pendingSearchResolvers.delete(id);
              break;
            }
          }
        } else if (payload?.event === "channelInfo") {
          const reqId = payload.requestId;
          if (reqId && pendingChannelInfoResolvers.has(reqId)) {
            pendingChannelInfoResolvers.get(reqId)(payload.data || null);
            pendingChannelInfoResolvers.delete(reqId);
          } else {
            for (const [id, resolve] of pendingChannelInfoResolvers.entries()) {
              resolve(payload.data || null);
              pendingChannelInfoResolvers.delete(id);
              break;
            }
          }
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
 * 치지직 채널 검색 (플러그인 백엔드를 통해 안전하게 검색)
 */
async function searchChzzkChannels(keyword) {
  if (!keyword || keyword.trim().length === 0) return [];
  const trimmed = keyword.trim();
  const reqId = Date.now().toString() + "_" + Math.random().toString(36).substring(2, 7);
  const proxy = getEffectiveProxyUrl();

  return new Promise((resolve) => {
    pendingSearchResolvers.set(reqId, resolve);
    sendToPlugin({
      event: "searchChannels",
      keyword: trimmed,
      proxyUrl: proxy,
      requestId: reqId,
    });
    // 5초 타임아웃
    setTimeout(() => {
      if (pendingSearchResolvers.has(reqId)) {
        pendingSearchResolvers.get(reqId)([]);
        pendingSearchResolvers.delete(reqId);
      }
    }, 5000);
  });
}

/**
 * 채널 상세 정보 조회 (채널 ID 기준)
 */
async function getChzzkChannelInfo(channelId) {
  if (!channelId || channelId.trim().length === 0) return null;
  const trimmed = channelId.trim();
  const reqId = Date.now().toString() + "_" + Math.random().toString(36).substring(2, 7);
  const proxy = getEffectiveProxyUrl();

  return new Promise((resolve) => {
    pendingChannelInfoResolvers.set(reqId, resolve);
    sendToPlugin({
      event: "getChannelInfo",
      channelId: trimmed,
      proxyUrl: proxy,
      requestId: reqId,
    });
    setTimeout(() => {
      if (pendingChannelInfoResolvers.has(reqId)) {
        pendingChannelInfoResolvers.get(reqId)(null);
        pendingChannelInfoResolvers.delete(reqId);
      }
    }, 5000);
  });
}
