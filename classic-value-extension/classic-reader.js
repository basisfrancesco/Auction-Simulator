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

const marketContext = (link) => {
  let element = link;
  let context = `${link.textContent || ""} ${link.getAttribute("href") || ""}`;
  for (let depth = 0; element.parentElement && depth < 5; depth += 1) {
    element = element.parentElement;
    const text = element.innerText?.trim() || "";
    if (text.length > 900) break;
    context = `${context} ${text}`;
  }
  return normalize(context);
};

const rankedMarketLinks = (vehicle) => {
  const requestedYear = Number(vehicle.match(/\b(?:19|20)\d{2}\b/)?.[0] || 0);
  const tokens = normalize(vehicle).split(" ").filter((token) => token.length > 1 && !/^\d{4}$/.test(token));
  return [...document.querySelectorAll('a[href*="/m/"]')]
    .filter(visible)
    .map((link) => {
      const context = marketContext(link);
      const matchedTokens = tokens.filter((token) => context.includes(token));
      let score = matchedTokens.length * 3;
      if (matchedTokens.length === tokens.length) score += 5;
      const years = [...context.matchAll(/\b((?:19|20)\d{2})\b/g)].map((match) => Number(match[1]));
      if (requestedYear && years.includes(requestedYear)) score += 18;
      else if (requestedYear && years.length) {
        const distance = Math.min(...years.map((year) => Math.abs(year - requestedYear)));
        score += Math.max(-10, 5 - distance * 3);
      }
      return { link, score, matchedTokens: matchedTokens.length };
    })
    .filter(({ matchedTokens }) => matchedTokens >= Math.max(1, Math.ceil(tokens.length * .6)))
    .sort((a, b) => b.score - a.score);
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
      const markets = rankedMarketLinks(request.vehicle);
      const unambiguous = markets[0] && (!markets[1] || markets[0].score - markets[1].score >= 4);
      if (unambiguous) {
        location.href = markets[0].link.href;
        return;
      }
      if (markets.length > 1 && attempt === 8) chrome.runtime.sendMessage({ type: "CLASSIC_LOOKUP_PROGRESS", message: "Ci sono più versioni compatibili: seleziona nella scheda Classic.com quella dell’anno corretto." });
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

  chrome.runtime.sendMessage({ type: "CLASSIC_LOOKUP_ERROR", message: "Non ho trovato automaticamente un mercato univoco. Seleziona su Classic.com la versione dell’anno corretto e riprova." });
})();
