const APP_SOURCE = "auction-simulator-app";
const EXTENSION_SOURCE = "auction-simulator-classic-extension";

window.postMessage({ source: EXTENSION_SOURCE, type: "CLASSIC_EXTENSION_READY" }, window.location.origin);

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.source !== APP_SOURCE) return;
  if (event.data?.type === "CLASSIC_EXTENSION_PING") {
    window.postMessage({ source: EXTENSION_SOURCE, type: "CLASSIC_EXTENSION_READY" }, window.location.origin);
    return;
  }
  if (event.data?.type !== "CLASSIC_LOOKUP_REQUEST") return;
  chrome.runtime.sendMessage({ type: "START_CLASSIC_LOOKUP", vehicle: event.data.vehicle, url: event.data.url });
});

chrome.runtime.onMessage.addListener((message) => {
  if (!message?.type?.startsWith("CLASSIC_LOOKUP_")) return;
  window.postMessage({ source: EXTENSION_SOURCE, ...message }, window.location.origin);
});
