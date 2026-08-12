const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== "hidden");

const requestForThisTab = async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_CLASSIC_LOOKUP" });
    return response?.request || null;
  } catch {
    return null;
  }
};

const bestMarketLink = (vehicle) => {
  const tokens = normalize(vehicle).split(" ").filter((token) => token.length > 1 && !/^\d{4}$/.test(token));
  return [...document.querySelectorAll('a[href*="/m/"]')]
    .filter(visible)
    .map((link) => ({ link, score: tokens.filter((token) => normalize(link.textContent || "").includes(token)).length }))
    .filter(({ score }) => score >= Math.max(1, Math.ceil(tokens.length * .45)))
    .sort((a, b) => b.score - a.score)[0]?.link;
};

const activateOneYear = () => {
  const control = [...document.querySelectorAll("button, [role=button], a")]
    .find((element) => visible(element) && /^1\s*year$/i.test(element.textContent?.trim() || ""));
  if (!control) return false;
  const selected = control.getAttribute("aria-pressed") === "true" || control.getAttribute("aria-selected") === "true" || /active|selected/i.test(control.className || "");
  if (!selected) control.click();
  return true;
};

const readAverage = () => {
  const labels = [...document.querySelectorAll("div, span, p")]
    .filter((element) => visible(element) && /^avg(?:erage)?$/i.test(element.textContent?.trim() || ""));
  for (const label of labels) {
    let container = label.parentElement;
    for (let depth = 0; container && depth < 5; depth += 1, container = container.parentElement) {
      const match = container.innerText?.match(/\$\s*([\d,.]+)\s*([kmb])?/i);
      if (match) {
        const suffix = match[2]?.toLowerCase();
        const compactNumber = suffix || /^[\d]{1,3}[.,]\d{1,2}$/.test(match[1]);
        const base = compactNumber ? Number(match[1].replace(",", ".")) : Number(match[1].replace(/,/g, ""));
        const multiplier = suffix === "k" ? 1_000 : suffix === "b" ? 1_000_000_000 : suffix === "m" || compactNumber ? 1_000_000 : 1;
        const valueUsd = Math.round(base * multiplier);
        if (valueUsd > 0) return valueUsd;
      }
    }
  }
  return 0;
};

(async () => {
  const request = await requestForThisTab();
  if (!request) return;

  for (let attempt = 0; attempt < 45; attempt += 1) {
    if (location.pathname.startsWith("/search")) {
      const market = bestMarketLink(request.vehicle);
      if (market) {
        location.href = market.href;
        return;
      }
    } else if (location.pathname.startsWith("/m/")) {
      if (activateOneYear()) {
        await sleep(1200);
        const valueUsd = readAverage();
        if (valueUsd) {
          chrome.runtime.sendMessage({ type: "CLASSIC_LOOKUP_RESULT", valueUsd, marketUrl: location.href });
          return;
        }
      }
    }
    await sleep(1000);
  }

  chrome.runtime.sendMessage({ type: "CLASSIC_LOOKUP_ERROR", message: "Non ho trovato automaticamente la media a un anno. Verifica che Classic.com mostri il mercato corretto." });
})();
