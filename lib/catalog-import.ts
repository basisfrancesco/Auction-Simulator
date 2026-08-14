export type CatalogLotStatus = "preview" | "ready" | "active" | "completed" | "skipped";

export type ImportedCatalogLot = {
  sourceId: string;
  sourceLotNumber: string;
  position: number;
  vehicle: string;
  category: "vehicle" | "motorcycle" | "memorabilia" | "other";
  included: boolean;
  currency: string;
  estimateLow: number | null;
  estimateHigh: number | null;
  resultPrice: number | null;
  resultStatus: string;
  valuationSource: "estimate-range" | "single-estimate" | "result-fallback" | "missing";
  marketValue: number;
  startPrice: number;
  imageUrl: string;
  sourceUrl: string;
  collection: string;
};

export type ImportedCatalog = {
  source: string;
  sourceKey: string;
  sourceUrl: string;
  name: string;
  lots: ImportedCatalogLot[];
  warnings: string[];
};

type RmLot = {
  id?: string; header?: string; publicName?: string; lot?: string; value?: string;
  valueType?: string; preSaleEstimate?: string; link?: string; crop?: string;
  collection?: string; referenceId?: string;
};

type RmResponse = {
  items?: RmLot[];
  pager?: { totalItems?: number; totalPages?: number };
};

const RM_HOSTS = new Set(["rmsothebys.com", "www.rmsothebys.com", "w3.rmsothebys.com"]);

export function parseCatalogUrl(rawUrl: string) {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error("Il link non è un URL valido."); }
  if (url.protocol !== "https:") throw new Error("È richiesto un link HTTPS.");
  if (!RM_HOSTS.has(url.hostname.toLowerCase())) throw new Error("Casa d’aste non ancora supportata.");
  const match = url.pathname.match(/^\/auctions\/([a-z0-9-]+)(?:\/lots)?\/?$/i);
  if (!match) throw new Error("Il link RM Sotheby’s non identifica un’asta.");
  const sourceKey = match[1].toLowerCase();
  return { source: "rm-sothebys", sourceKey, sourceUrl: `https://rmsothebys.com/auctions/${sourceKey}/lots/` };
}

function amounts(raw = "") {
  const currency = raw.match(/\b(USD|EUR|GBP|CHF|CAD|AUD|HKD)\b/i)?.[1]?.toUpperCase() || "USD";
  const values = [...raw.matchAll(/(?:[$€£]\s*)?([\d][\d,.]*)/g)]
    .map((match) => Number(match[1].replace(/,/g, ""))).filter(Number.isFinite);
  return { currency, values };
}

function categoryFor(item: RmLot): ImportedCatalogLot["category"] {
  const ref = (item.referenceId || "").toLowerCase();
  const name = (item.publicName || "").toLowerCase();
  if (ref.startsWith("n") || /painting|poster|helmet|cap|sign|memorabilia|sculpture|watch|book|brochure/.test(name)) return "memorabilia";
  if (/motorcycle|motorbike|vespa|bonneville|sidecar/.test(name)) return "motorcycle";
  if (/\b(19|20)\d{2}\b/.test(name) || ref.startsWith("r")) return "vehicle";
  return "other";
}

function lotPosition(lot = "", fallback: number) {
  const parsed = Number(lot.match(/\d+/)?.[0]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRmLot(item: RmLot, index: number, sourceUrl: string): ImportedCatalogLot {
  const value = amounts(item.value || item.preSaleEstimate || "");
  const sold = /sold/i.test(item.valueType || "") && !/not sold/i.test(item.valueType || "");
  const estimate = sold ? amounts(item.preSaleEstimate || "") : value;
  const resultPrice = sold && value.values.length === 1 ? value.values[0] : null;
  const estimateLow = estimate.values[0] ?? null;
  const estimateHigh = estimate.values[1] ?? estimateLow;
  const hasEstimateRange = estimateLow !== null && estimateHigh !== null && estimateHigh > estimateLow;
  const estimatedValue = hasEstimateRange
    ? estimateLow + (estimateHigh - estimateLow) * .6
    : estimateLow;
  // A realised price is evidence of one transaction, not an appraisal. When RM removes
  // the pre-sale estimate after the auction, keep the result only as an explicit fallback.
  const fallbackValue = resultPrice === null ? 0 : resultPrice * 1.1;
  const marketValue = Math.round(((estimatedValue ?? fallbackValue) || 0) / 500) * 500;
  const valuationSource: ImportedCatalogLot["valuationSource"] = hasEstimateRange
    ? "estimate-range"
    : estimateLow !== null
      ? "single-estimate"
      : resultPrice !== null
        ? "result-fallback"
        : "missing";
  const category = categoryFor(item);
  return {
    sourceId: item.id || item.referenceId || `${index + 1}`,
    sourceLotNumber: item.lot || `${index + 1}`,
    position: lotPosition(item.lot, index + 1),
    vehicle: (item.publicName || "Lotto senza nome").trim(),
    category,
    included: category === "vehicle",
    currency: value.currency,
    estimateLow,
    estimateHigh,
    resultPrice,
    resultStatus: (item.valueType || "").trim(),
    valuationSource,
    marketValue,
    startPrice: Math.max(100, Math.round((marketValue * .62) / 500) * 500),
    imageUrl: item.crop || "",
    sourceUrl: new URL(item.link || "", sourceUrl).toString(),
    collection: item.collection || "",
  };
}

export async function importCatalog(rawUrl: string, fetcher: typeof fetch = fetch): Promise<ImportedCatalog> {
  const parsed = parseCatalogUrl(rawUrl);
  const response = await fetcher("https://rmsothebys.com/api/search/SearchLots?page=1&pageSize=200", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ Auction: parsed.sourceKey, SortBy: "Default" }),
  });
  if (!response.ok) throw new Error(`RM Sotheby’s ha risposto con errore ${response.status}.`);
  const data = await response.json() as RmResponse;
  if (!Array.isArray(data.items) || data.items.length === 0) throw new Error("Nessun lotto trovato nel catalogo.");
  if ((data.pager?.totalPages || 1) > 1) throw new Error("Il catalogo supera 200 lotti: la paginazione non è ancora supportata.");
  const lots = data.items.map((item, index) => normalizeRmLot(item, index, parsed.sourceUrl))
    .sort((a, b) => a.position - b.position || a.sourceLotNumber.localeCompare(b.sourceLotNumber));
  const excluded = lots.filter((lot) => !lot.included).length;
  const fallbackLots = lots.filter((lot) => lot.included && lot.valuationSource === "result-fallback").length;
  const missingLots = lots.filter((lot) => lot.included && lot.valuationSource === "missing").length;
  return {
    ...parsed,
    name: (data.items[0]?.header || parsed.sourceKey).replace(/\s+/g, " ").trim(),
    lots,
    warnings: [
      ...(excluded ? [`${excluded} lotti non automobilistici sono stati esclusi automaticamente.`] : []),
      ...(fallbackLots ? [`${fallbackLots} auto non hanno più una stima pubblica: il valore proposto è un fallback basato sul risultato di vendita (+10%) e va verificato.`] : []),
      ...(missingLots ? [`${missingLots} auto non hanno né stima né risultato e richiedono un valore manuale.`] : []),
    ],
  };
}
