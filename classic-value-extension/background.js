const requests = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_CLASSIC_LOOKUP" && sender.tab?.id) {
    const lookupKey = `request_${sender.tab.id}`;
    chrome.storage.session.get(lookupKey, (stored) => sendResponse({ request: stored[lookupKey] || null }));
    return true;
  }
  if (message?.type === "START_CLASSIC_LOOKUP" && sender.tab?.id) {
    const appTabId = sender.tab.id;
    chrome.tabs.create({ url: "about:blank", active: true }, (tab) => {
      if (!tab.id || chrome.runtime.lastError) {
        chrome.tabs.sendMessage(appTabId, { type: "CLASSIC_LOOKUP_ERROR", message: "Non sono riuscito ad aprire Classic.com." });
        return;
      }
      const request = { appTabId, vehicle: message.vehicle };
      requests.set(tab.id, request);
      chrome.storage.session.set({ [`request_${tab.id}`]: request }, () => {
        chrome.tabs.update(tab.id, { url: message.url });
        chrome.tabs.sendMessage(appTabId, { type: "CLASSIC_LOOKUP_STARTED" });
      });
    });
    return;
  }

  if (!sender.tab?.id || !["CLASSIC_LOOKUP_RESULT", "CLASSIC_LOOKUP_ERROR"].includes(message?.type)) return;
  const lookupKey = `request_${sender.tab.id}`;
  chrome.storage.session.get(lookupKey, (stored) => {
    const request = requests.get(sender.tab.id) || stored[lookupKey];
    if (!request) return;
    chrome.tabs.sendMessage(request.appTabId, message);
    requests.delete(sender.tab.id);
    chrome.storage.session.remove(lookupKey);
    if (message.type === "CLASSIC_LOOKUP_RESULT") chrome.tabs.remove(sender.tab.id);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  requests.delete(tabId);
  chrome.storage.session.remove(`request_${tabId}`);
});
