const requests = new Map();

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "GET_CLASSIC_LOOKUP" && sender.tab?.id) {
    const lookupKey = `request_${sender.tab.id}`;
    chrome.storage.session.get(lookupKey, (stored) => chrome.tabs.sendMessage(sender.tab.id, { type: "CLASSIC_LOOKUP_CONTEXT", request: stored[lookupKey] || null }));
    return;
  }
  if (message?.type === "START_CLASSIC_LOOKUP" && sender.tab?.id) {
    chrome.tabs.create({ url: message.url, active: true }, (tab) => {
      if (!tab.id) return;
      requests.set(tab.id, { appTabId: sender.tab.id, vehicle: message.vehicle });
      chrome.storage.session.set({ [`request_${tab.id}`]: { appTabId: sender.tab.id, vehicle: message.vehicle } });
      chrome.tabs.sendMessage(sender.tab.id, { type: "CLASSIC_LOOKUP_STARTED" });
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
