"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { estimateVehicleValue, hasExactVehicleValue } from "./vehicle-values";

type User = { name: string; role: "participant" | "admin" };
type Bid = { id: string; bidder: string; amount: number; at: number; bot: boolean };
type Bot = { name: string; budget: number; aggression: number; interest?: number; patience?: number; heat?: number };
type LotResult = { lotNumber: number; vehicle: string; winner: string; finalPrice: number; bidCount: number };
type GarageCar = { id: string; vehicle: string; purchasePrice: number; auctionName: string; imageUrl: string };
type CarListing = { id: string; carId: string; sellerName: string; vehicle: string; imageUrl: string; price: number; createdAt: string };
type WheelOutcome = { reward: number; balanceAfter: number; alreadySpun: boolean };
type Auction = {
  id: string; name: string; createdAt: string; participants: string[]; accent: string;
  status: "waiting" | "live" | "between" | "closed"; startPrice: number; currentPrice: number;
  bids: Bid[]; endsAt: number; nextBotAt: number; targetBids: number; bots: Bot[]; winner: string;
  lotNumber: number; vehicle: string; results: LotResult[];
  lotStartedAt: number;
};

const USERS: User[] = [
  { name: "Francesco Basis", role: "participant" }, { name: "Vittorio Esposito", role: "participant" },
  { name: "Carlo Esposito", role: "participant" }, { name: "Lorenzo Biava", role: "participant" },
  { name: "Giulia Test", role: "participant" }, { name: "Matteo Test", role: "participant" },
  { name: "Sofia Test", role: "participant" }, { name: "Luca Test", role: "participant" },
  { name: "Elena Test", role: "participant" }, { name: "Marco Test", role: "participant" },
  { name: "Admin", role: "admin" },
];
const BOT_NAMES = ["Marco Rinaldi", "Andrea Costa", "Giulia Ferri", "Luca Romano", "Davide Conti", "Elena Moretti", "Simone Gallo", "Matteo De Luca", "Sofia Ricci", "Alessandro Greco"];
const SPECIAL_WHEEL_REWARDS = [250000, 2000000, 750000, -1000000, 250000, 5000000, 750000, -2000000, 250000, 750000];
// Uno spicchio speciale ogni cinque: probabilità invariate, distribuzione uniforme sulla circonferenza.
const WHEEL_REWARDS = Array.from({ length: 50 }, (_, index) => index % 5 === 4 ? SPECIAL_WHEEL_REWARDS[Math.floor(index / 5)] : 500000);
const wheelColor = (reward: number) => reward === 5000000 ? "#ffb000" : reward === 2000000 ? "#ff6b35" : reward < 0 ? "#e5422b" : reward === 750000 ? "#70d7ff" : reward === 250000 ? "#a98cff" : "#d9ff43";
const wheelBackground = `conic-gradient(${WHEEL_REWARDS.map((reward, index) => `${wheelColor(reward)} ${index * 2}% ${(index + 1) * 2}%`).join(",")})`;
const euros = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const classicSearchUrl = (vehicle: string) => {
  const query = vehicle
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\b\d[\d.,]*\s*(?:km|miglia|miles|cv|hp)\b/gi, " ")
    .split(/\s+(?:[-–—|•]|con|colore)\s+/i)[0]
    .replace(/\b(?:automatica|automatico|manuale|benzina|diesel|ibrida|elettrica)\b/gi, " ")
    .replace(/[^\p{L}\p{N}+'-]+/gu, " ")
    .trim().replace(/\s+/g, " ").split(" ").slice(0, 6).join(" ") || vehicle.trim();
  return `https://www.classic.com/search?${new URLSearchParams({ q: query }).toString()}`;
};
const incrementFor = (price: number, startPrice = price) => {
  const progress = Math.max(1, price / Math.max(startPrice, 1));
  const percentage = progress < 1.12 ? .006 : progress < 1.3 ? .009 : progress < 1.55 ? .013 : .018;
  const raw = Math.max(50, price * percentage);
  const rounding = price < 10000 ? 50 : price < 50000 ? 100 : price < 150000 ? 250 : 500;
  return Math.max(rounding, Math.round(raw / rounding) * rounding);
};
const isBetweenLots = (auction: Auction) => auction.status === "between" || (auction.status === "waiting" && auction.results.length > 0);
function Mark() { return <div className="mark" aria-hidden="true"><span>AS</span></div>; }

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [selectedName, setSelectedName] = useState(USERS[0].name);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [connectionError, setConnectionError] = useState("");
  const [balance, setBalance] = useState(250000);
  const [garage, setGarage] = useState<GarageCar[]>([]);
  const [listings, setListings] = useState<CarListing[]>([]);
  const [garageOpen, setGarageOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [sellCarId, setSellCarId] = useState<string | null>(null);
  const [externalSaleCarId, setExternalSaleCarId] = useState<string | null>(null);
  const [externalSalePrice, setExternalSalePrice] = useState<number | null>(null);
  const [purchaseListing, setPurchaseListing] = useState<CarListing | null>(null);
  const [marketPending, setMarketPending] = useState<string | null>(null);
  const [wheelAuction, setWheelAuction] = useState<Auction | null>(null);
  const [wheelOutcome, setWheelOutcome] = useState<WheelOutcome | null>(null);
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [optimisticLeader, setOptimisticLeader] = useState("");
  const [bidPending, setBidPending] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [startAuctionId, setStartAuctionId] = useState<string | null>(null);
  const [vehicleDraft, setVehicleDraft] = useState("");
  const [marketValueDraft, setMarketValueDraft] = useState("");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const auctionsRef = useRef<Auction[]>([]);
  const engineBusy = useRef(false);
  const bidBusy = useRef(false);
  const auctionLoadPromise = useRef<Promise<void> | null>(null);
  const auctionReloadQueued = useRef(false);
  const serverOffset = useRef(0);
  const realtimeRefresh = useRef<number | null>(null);

  useEffect(() => { auctionsRef.current = auctions; }, [auctions]);
  useEffect(() => {
    if (!optimisticLeader || !user) return;
    const timeout = window.setTimeout(() => {
      const auction = auctions.find((item) => `${item.id}:${item.lotNumber}` === optimisticLeader);
      if (auction?.bids[0] && auction.bids[0].bidder !== user.name) setOptimisticLeader("");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [auctions, optimisticLeader, user]);

  const loadParticipantProfile = async (name: string) => {
    const account = await supabase.from("participant_accounts").select("balance").eq("name", name).maybeSingle();
    if (!account.data && !account.error) await supabase.from("participant_accounts").insert({ name, balance: 250000 });
    setBalance(Number(account.data?.balance ?? 250000));
    const cars = await supabase.from("garage_cars").select("*").eq("owner_name", name).is("sold_at", null).order("won_at", { ascending: false });
    if (cars.data) setGarage(cars.data.map((car) => ({ id: String(car.id), vehicle: car.vehicle, purchasePrice: Number(car.purchase_price), auctionName: car.auction_name, imageUrl: car.image_url || "" })));
  };

  const loadMarketplace = async () => {
    const result = await supabase.from("car_listings").select("*").eq("status", "active").order("created_at", { ascending: false });
    if (result.error) { setConnectionError(`Mercato: ${result.error.message}`); return; }
    setListings((result.data || []).map((listing) => ({ id: String(listing.id), carId: String(listing.car_id), sellerName: listing.seller_name, vehicle: listing.vehicle, imageUrl: listing.image_url || "", price: Number(listing.price), createdAt: new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(new Date(listing.created_at)) })));
  };

  const uploadCarImage = async (car: GarageCar, file?: File) => {
    if (!user || !file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) { setConnectionError("La foto deve essere un’immagine di massimo 5 MB."); return; }
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.name.replaceAll(" ", "-").toLowerCase()}/${car.id}-${file.lastModified}.${extension}`;
    const upload = await supabase.storage.from("garage-images").upload(path, file, { upsert: true });
    if (upload.error) { setConnectionError(`Foto garage: ${upload.error.message}`); return; }
    const imageUrl = supabase.storage.from("garage-images").getPublicUrl(path).data.publicUrl;
    const update = await supabase.from("garage_cars").update({ image_url: imageUrl }).eq("id", car.id).eq("owner_name", user.name);
    if (update.error) setConnectionError(`Foto garage: ${update.error.message}`); else await loadParticipantProfile(user.name);
  };

  const listCar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!user || !sellCarId) return;
    const price = Number(new FormData(event.currentTarget).get("salePrice")); if (price <= 0) return;
    setMarketPending(sellCarId);
    const result = await supabase.rpc("list_car_for_sale", { p_car_id: sellCarId, p_seller_name: user.name, p_price: price });
    setMarketPending(null);
    if (result.error) { setConnectionError(result.error.message.replace("P0001: ", "")); return; }
    setSellCarId(null); setMarketOpen(true); setGarageOpen(false); await loadMarketplace();
  };

  const buyCar = async (listing: CarListing) => {
    if (!user || listing.sellerName === user.name || marketPending) return;
    setMarketPending(listing.id);
    const result = await supabase.rpc("buy_listed_car", { p_listing_id: listing.id, p_buyer_name: user.name });
    setMarketPending(null);
    if (result.error) { setConnectionError(result.error.message.replace("P0001: ", "")); await loadMarketplace(); return; }
    setPurchaseListing(null); setConnectionError(""); await Promise.all([loadMarketplace(), loadParticipantProfile(user.name)]);
  };

  const prepareExternalSale = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const price = Number(new FormData(event.currentTarget).get("externalSalePrice"));
    if (price >= 100) setExternalSalePrice(price);
  };

  const sellCarExternally = async () => {
    if (!user || !externalSaleCarId || externalSalePrice === null || marketPending) return;
    setMarketPending(externalSaleCarId);
    const result = await supabase.rpc("sell_car_externally", { p_car_id: externalSaleCarId, p_seller_name: user.name, p_price: externalSalePrice });
    setMarketPending(null);
    if (result.error) {
      const missingRpc = result.error.code === "PGRST202" || result.error.message.includes("schema cache");
      setConnectionError(missingRpc ? "La funzione di vendita esterna non è ancora installata su Supabase. Applica la migrazione 20260810_repair_external_sale_rpc.sql." : result.error.message.replace("P0001: ", ""));
      return;
    }
    setExternalSaleCarId(null); setExternalSalePrice(null); setConnectionError(""); await loadParticipantProfile(user.name);
  };

  const cancelListing = async (listing: CarListing) => {
    if (marketPending) return; setMarketPending(listing.id);
    const result = await supabase.rpc("cancel_car_listing", { p_listing_id: listing.id, p_seller_name: user?.name }); setMarketPending(null);
    if (result.error) setConnectionError(result.error.message.replace("P0001: ", "")); else await loadMarketplace();
  };

  const loadAuctions = async () => {
    auctionReloadQueued.current = true;
    if (auctionLoadPromise.current) return auctionLoadPromise.current;

    const task = (async () => {
      while (auctionReloadQueued.current) {
        auctionReloadQueued.current = false;
        const requestedAt = Date.now();
        const [auctionResult, participantResult, bidResult, serverTimeResult] = await Promise.all([
          supabase.from("auctions").select("*").order("created_at", { ascending: false }),
          supabase.from("auction_participants").select("auction_id,user_name"),
          supabase.from("bids").select("*").order("created_at", { ascending: false }),
          supabase.rpc("auction_server_now_ms"),
        ]);
        const error = auctionResult.error || participantResult.error || bidResult.error || serverTimeResult.error;
        if (error) { setConnectionError(`Supabase: ${error.message}`); continue; }
        const receivedAt = Date.now();
        serverOffset.current = Number(serverTimeResult.data) - Math.round((requestedAt + receivedAt) / 2);
        const participants = participantResult.data || []; const bids = bidResult.data || [];
        const colors = ["#d9ff43", "#ff6b35", "#70d7ff"];
        const mapped: Auction[] = (auctionResult.data || []).map((row, index) => {
          const config = row.bot_config && !Array.isArray(row.bot_config) ? row.bot_config as { bots?: Bot[]; nextBotAt?: number; vehicle?: string; lotNumber?: number; results?: LotResult[]; lotStartedAt?: number } : { bots: row.bot_config as Bot[] };
          const lotNumber = config.lotNumber || 1;
          const lotBids = bids.filter((bid) => bid.auction_id === row.id && (bid.lot_number != null ? Number(bid.lot_number) === lotNumber : !config.lotStartedAt || new Date(bid.created_at).getTime() >= config.lotStartedAt));
          return {
            id: String(row.id), name: row.name, createdAt: new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(new Date(row.created_at)),
            participants: participants.filter((item) => item.auction_id === row.id).map((item) => item.user_name), accent: colors[index % colors.length],
            status: row.status, startPrice: Number(row.start_price), currentPrice: Number(row.current_price),
            bids: lotBids.map((bid) => ({ id: String(bid.id), bidder: bid.bidder_name, amount: Number(bid.amount), at: new Date(bid.created_at).getTime(), bot: bid.is_bot })),
            endsAt: row.ends_at ? new Date(row.ends_at).getTime() : 0, nextBotAt: config.nextBotAt || 0,
            targetBids: row.target_bids || 50, bots: config.bots || [], winner: row.winner || "",
            lotNumber, vehicle: config.vehicle || "", results: config.results || [], lotStartedAt: config.lotStartedAt || 0,
          };
        });
        setAuctions(mapped);
        setConnectionError((current) => current.startsWith("Supabase:") ? "" : current);
      }
    })();
    auctionLoadPromise.current = task;
    try { await task; } finally { if (auctionLoadPromise.current === task) auctionLoadPromise.current = null; }
  };
  const scheduleAuctionRefresh = () => {
    if (realtimeRefresh.current) window.clearTimeout(realtimeRefresh.current);
    realtimeRefresh.current = window.setTimeout(() => void loadAuctions(), 120);
  };

  useEffect(() => {
    const savedUser = localStorage.getItem("auction-simulator-user");
    const connect = async () => {
      const { data } = await supabase.auth.getSession();
      if (savedUser && !data.session) await supabase.auth.signInAnonymously();
      if (savedUser) setUser(JSON.parse(savedUser));
      await Promise.all([loadAuctions(), loadMarketplace()]);
    };
    void connect();
    const channel = supabase.channel("auction-simulator-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "auctions" }, scheduleAuctionRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_participants" }, scheduleAuctionRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "bids" }, scheduleAuctionRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "car_listings" }, () => void loadMarketplace())
      .subscribe((status) => { if (status === "SUBSCRIBED") scheduleAuctionRefresh(); });
    const fallbackRefresh = window.setInterval(() => void loadAuctions(), 1500);
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") void loadAuctions(); };
    window.addEventListener("online", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      if (realtimeRefresh.current) window.clearTimeout(realtimeRefresh.current);
      window.clearInterval(fallbackRefresh);
      window.removeEventListener("online", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (user?.role !== "participant") return;
    const timeout = window.setTimeout(() => void loadParticipantProfile(user.name), 0);
    return () => window.clearTimeout(timeout);
  }, [user]);
  useEffect(() => {
    if (user?.role !== "participant") return;
    const channel = supabase.channel(`profile-${user.name}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "participant_accounts", filter: `name=eq.${user.name}` }, () => void loadParticipantProfile(user.name))
      .on("postgres_changes", { event: "*", schema: "public", table: "garage_cars", filter: `owner_name=eq.${user.name}` }, () => void loadParticipantProfile(user.name))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    const advance = async () => {
      const tick = Date.now() + serverOffset.current; setNow(tick);
      if (!user || engineBusy.current) return;
      const auction = auctionsRef.current
        .filter((item) => item.status === "live")
        .sort((left, right) => Math.min(left.endsAt, left.nextBotAt) - Math.min(right.endsAt, right.nextBotAt))
        .find((item) => tick >= item.endsAt || tick >= item.nextBotAt);
      if (!auction) return;
      engineBusy.current = true;
      try {
        if (tick >= auction.endsAt) {
          const closing = await supabase.rpc("close_auction_lot", { p_auction_id: auction.id });
          if (closing.error) { setConnectionError(`Chiusura lotto: ${closing.error.message}`); return; }
          if (closing.data) await loadAuctions();
        } else if (tick >= auction.nextBotAt && auction.bids.filter((bid) => bid.bot).length < auction.targetBids) {
          const step = incrementFor(auction.currentPrice, auction.startPrice); const lastBidder = auction.bids[0]?.bidder;
          const evolvedBots = auction.bots.map((bot) => ({ ...bot, heat: Math.max(0, Math.min(1, (bot.heat ?? .25) + (Math.random() - .53) * .22)) }));
          const eligible = evolvedBots.filter((bot) => {
            if (bot.name === lastBidder || bot.budget < auction.currentPrice + step) return false;
            const headroom = Math.max(0, (bot.budget - auction.currentPrice) / bot.budget);
            const interest = bot.interest ?? .55; const patience = bot.patience ?? .5; const heat = bot.heat ?? .25;
            const nearLimitPenalty = headroom < .08 ? .42 : headroom < .18 ? .2 : 0;
            const hesitation = Math.random() < (1 - patience) * .18;
            const desire = Math.max(.06, Math.min(.9, .12 + interest * .46 + bot.aggression * .22 + heat * .25 - nearLimitPenalty));
            return !hesitation && Math.random() < desire;
          });
          if (eligible.length) {
            const bot = eligible[Math.floor(Math.random() * eligible.length)]; const multiplier = Math.random() < bot.aggression * (.16 + (bot.heat ?? .25) * .18) ? (Math.random() < .8 ? 2 : 3) : 1;
            const amount = Math.min(bot.budget, auction.currentPrice + step * multiplier); const progress = (auction.bids.filter((bid) => bid.bot).length + 1) / auction.targetBids;
            const mood = (bot.interest ?? .55) + (bot.heat ?? .25); const delay = progress < .3 ? 550 + Math.random() * 1300 : progress < .75 ? 900 + Math.random() * (2800 - mood * 600) : 1700 + Math.random() * (5200 - mood * 1100);
            const nextBotAt = tick + delay;
            const nextBots = evolvedBots.map((entry) => entry.name === bot.name ? { ...entry, heat: Math.min(1, (entry.heat ?? .25) + .18 + Math.random() * .18) } : entry);
            const advanceAuction = await supabase.rpc("place_bot_bid", { p_auction_id: auction.id, p_expected_price: auction.currentPrice, p_bidder_name: bot.name, p_amount: amount, p_bots: nextBots, p_next_bot_at: Math.round(nextBotAt) });
            if (advanceAuction.error) setConnectionError(`Offerta bot: ${advanceAuction.error.message}`);
            else if (advanceAuction.data) await loadAuctions();
          } else {
            const hesitation = tick + 600 + Math.random() * 1800;
            const scheduled = await supabase.rpc("schedule_bot_attempt", { p_auction_id: auction.id, p_expected_price: auction.currentPrice, p_bots: evolvedBots, p_next_bot_at: Math.round(hesitation) });
            if (scheduled.error) setConnectionError(`Programmazione bot: ${scheduled.error.message}`);
            else if (scheduled.data) await loadAuctions();
          }
        }
      } finally { engineBusy.current = false; }
    };
    const timer = window.setInterval(() => void advance(), 250);
    return () => window.clearInterval(timer);
  }, [user]);

  const enter = async (event: FormEvent) => { event.preventDefault(); const next = USERS.find((entry) => entry.name === selectedName) ?? USERS[0]; const { data } = await supabase.auth.getSession(); if (!data.session) { const result = await supabase.auth.signInAnonymously(); if (result.error) { setConnectionError(result.error.message); return; } } localStorage.setItem("auction-simulator-user", JSON.stringify(next)); setUser(next); await Promise.all([loadAuctions(), loadMarketplace()]); };
  const logout = () => { localStorage.removeItem("auction-simulator-user"); setUser(null); setFocusedId(null); setGarageOpen(false); setMarketOpen(false); };
  const addAuction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name")).trim();
    void supabase.from("auctions").insert({ name }).then(({ error }) => { if (error) setConnectionError(error.message); else { setShowCreate(false); void loadAuctions(); } });
  };
  const toggleParticipation = async (id: string) => {
    if (!user || user.role !== "participant") return;
    const auction = auctions.find((item) => item.id === id); if (!auction) return;
    if (auction.participants.includes(user.name)) {
      await supabase.from("auction_participants").delete().eq("auction_id", id).eq("user_name", user.name);
      await loadAuctions(); return;
    }
    setWheelOutcome(null); setWheelRotation(0); setWheelAuction(auction);
  };

  const spinSignupWheel = async () => {
    if (!user || !wheelAuction || wheelSpinning) return;
    setWheelSpinning(true);
    const result = await supabase.rpc("join_auction_with_wheel", { p_auction_id: wheelAuction.id, p_user_name: user.name });
    if (result.error) { setWheelSpinning(false); setConnectionError(result.error.message.replace("P0001: ", "")); return; }
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    const outcome = { reward: Number(row.reward), balanceAfter: Number(row.balance_after), alreadySpun: Boolean(row.already_spun) };
    const matching = WHEEL_REWARDS.map((reward, index) => reward === outcome.reward ? index : -1).filter((index) => index >= 0);
    const targetIndex = matching[Math.floor(Math.random() * matching.length)] ?? 0;
    setWheelRotation(360 * 6 + 360 - (targetIndex + .5) * (360 / WHEEL_REWARDS.length));
    window.setTimeout(() => {
      setWheelOutcome(outcome); setWheelSpinning(false); setBalance(outcome.balanceAfter);
      void Promise.all([loadAuctions(), loadParticipantProfile(user.name)]);
    }, 3600);
  };
  const startAuction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (startAuctionId === null) return;
    const form = new FormData(event.currentTarget); const price = Number(form.get("price")); const vehicle = String(form.get("vehicle")).trim();
    const estimatedValue = Number(form.get("marketValue")) || estimateVehicleValue(vehicle);
    if (!estimatedValue) { setConnectionError("Modello non riconosciuto: inserisci il valore di mercato stimato prima di avviare il lotto."); return; }
    const marketMood = .62 + Math.random() * .66;
    const bots = BOT_NAMES.slice().sort(() => Math.random() - .5).slice(0, 8).map((name, index) => ({
      name, budget: Math.max(price + incrementFor(price, price), Math.round((estimatedValue * marketMood * (.72 + Math.random() * .35)) / 100) * 100),
      aggression: Math.max(.08, .14 + (index % 4) * .16 + Math.random() * .1 + (marketMood - 1) * .18),
      interest: Math.max(.08, Math.min(.98, .16 + Math.random() * .66 + (marketMood - 1) * .3)), patience: .18 + Math.random() * .76, heat: Math.random() * Math.max(.18, marketMood * .42),
    }));
    const targetBids = Math.max(12, Math.round(10 + marketMood * 24 + Math.random() * 22)); const startResult = await supabase.rpc("start_auction_lot", { p_auction_id: startAuctionId, p_vehicle: vehicle, p_start_price: price, p_target_bids: targetBids, p_bots: bots });
    if (startResult.error) { setConnectionError(`Avvio lotto: ${startResult.error.message}`); return; }
    const startedLot = Array.isArray(startResult.data) ? startResult.data[0] : null;
    setAuctions((current) => current.map((auction) => auction.id === startAuctionId ? { ...auction, status: "live", vehicle, startPrice: price, currentPrice: price, bids: [], bots, targetBids, winner: "", lotNumber: Number(startedLot?.lot_number ?? auction.results.length + 1), endsAt: new Date(startedLot?.ends_at ?? Date.now() + 10000).getTime() } : auction));
    setFocusedId(startAuctionId); setStartAuctionId(null); setVehicleDraft(""); setMarketValueDraft(""); setConnectionError("");
    await loadAuctions();
  };
  const finishAuction = async (auction: Auction) => {
    await supabase.from("auctions").update({ status: "closed", bot_config: { bots: [], nextBotAt: 0, vehicle: auction.vehicle, lotNumber: auction.lotNumber, results: auction.results, lotStartedAt: auction.lotStartedAt } }).eq("id", auction.id);
    await loadAuctions();
  };
  const placeBid = async (auction: Auction) => {
    if (!user || user.role !== "participant" || auction.status !== "live" || !auction.participants.includes(user.name) || bidBusy.current || auction.bids[0]?.bidder === user.name || optimisticLeader === `${auction.id}:${auction.lotNumber}`) return;
    bidBusy.current = true; setBidPending(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { setConnectionError("La sessione è scaduta: esci e accedi nuovamente."); return; }
      let result = await supabase.rpc("place_participant_bid_v2", { p_auction_id: auction.id, p_bidder_name: user.name });
      if (result.error?.code === "PGRST202" || result.error?.message.includes("schema cache")) {
        result = await supabase.rpc("place_participant_bid", { p_auction_id: auction.id, p_bidder_id: data.user.id, p_bidder_name: user.name });
      }
      if (result.error) { setConnectionError(result.error.message.replace("P0001: ", "")); await loadAuctions(); return; }
      setOptimisticLeader(`${auction.id}:${auction.lotNumber}`); setConnectionError("");
      await loadAuctions();
    } finally { bidBusy.current = false; setBidPending(false); }
  };

  const focused = useMemo(() => auctions.find((auction) => auction.id === focusedId) || null, [auctions, focusedId]);
  const listedCarIds = useMemo(() => new Set(listings.filter((listing) => listing.sellerName === user?.name).map((listing) => listing.carId)), [listings, user]);
  const isUserLeading = (auction: Auction) => auction.bids[0]?.bidder === user?.name || optimisticLeader === `${auction.id}:${auction.lotNumber}`;
  const lobbyTitle = (auction: Auction) => auction.status === "live" ? "Il lotto è aperto" : isBetweenLots(auction) ? "Lotto aggiudicato" : auction.status === "closed" ? "Asta terminata" : "La lobby è aperta";
  const lobbyCopy = (auction: Auction) => auction.status === "live" ? "Segui i rilanci in tempo reale e alza la paletta quando vuoi intervenire." : isBetweenLots(auction) ? "L’admin sta preparando la prossima automobile. Rimani nella lobby." : auction.status === "closed" ? "Consulta lo storico completo delle automobili aggiudicate." : "L’admin sta preparando il primo lotto. L’asta inizierà automaticamente.";
  if (!user) return <main className="login-shell"><div className="login-top"><Mark /><span>AUCTION<br />SIMULATOR</span></div><section className="login-card"><div className="eyebrow"><i /> ACCESSO RISERVATO</div><h1>La griglia<br />è pronta.</h1><p>Scegli il tuo nome per entrare nella tua area personale.</p><form onSubmit={enter}><label htmlFor="account">Profilo</label><div className="select-wrap"><select id="account" value={selectedName} onChange={(event) => setSelectedName(event.target.value)}>{USERS.map((entry) => <option key={entry.name}>{entry.name}</option>)}</select></div><button className="primary" type="submit">ACCEDI <span>→</span></button></form>{connectionError && <div className="connection-error">{connectionError}</div>}<div className="access-note"><span>●</span><div><b>Supabase Realtime</b><small>Dati condivisi tra tutti i dispositivi</small></div></div></section><aside className="login-visual" aria-hidden="true"><div className="speed-lines" /><div className="car-silhouette"><div className="roof" /><div className="body" /><div className="wheel w1" /><div className="wheel w2" /></div><div className="lot-number">LOT<br /><strong>001</strong></div></aside></main>;

  const isAdmin = user.role === "admin";
  return <main className={`dashboard ${focused && !isAdmin ? "lobby-active" : ""} ${garageOpen || marketOpen ? "garage-active" : ""}`}>
    <header><button className="brand brand-button" onClick={() => { setFocusedId(null); setGarageOpen(false); setMarketOpen(false); }} aria-label="Torna alla sala d'asta"><Mark /><span>AUCTION<br />SIMULATOR</span></button>{!isAdmin && <nav className="main-nav" aria-label="Navigazione principale"><button className={!garageOpen && !marketOpen ? "active" : ""} onClick={() => { setFocusedId(null); setGarageOpen(false); setMarketOpen(false); }}>Aste</button><button className={garageOpen ? "active" : ""} onClick={() => { setGarageOpen(true); setMarketOpen(false); }}>Garage <span>{garage.length}</span></button><button className={marketOpen ? "active" : ""} onClick={() => { setMarketOpen(true); setGarageOpen(false); }}>Mercato <span>{listings.length}</span></button></nav>}<div className="profile"><div className="avatar">{user.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</div><div><b>{user.name}</b><small>{isAdmin ? "Amministratore" : "Partecipante"}</small></div><button className="logout-button" onClick={logout} aria-label="Esci"><span>Esci</span> ↗</button></div></header>
    {connectionError && <div className="connection-error dashboard-error">{connectionError}</div>}
    {!isAdmin && garageOpen && <section className="garage-page"><div className="garage-page-head"><div><div className="eyebrow"><i /> COLLEZIONE PERSONALE</div><h1>Il mio garage.</h1><p>Le automobili che ti sei aggiudicato, tutte in un unico posto.</p></div><div className="garage-balance"><small>SALDO ATTUALE</small><strong>{euros.format(balance)}</strong></div></div>{garage.length === 0 ? <div className="garage-empty"><b>Il garage è vuoto.</b><span>Vinci un lotto per aggiungere la tua prima automobile.</span></div> : <div className="garage-grid">{garage.map((car) => <article className="garage-card" key={car.id}><div className="garage-photo">{car.imageUrl ? <img src={car.imageUrl} alt={car.vehicle} /> : <div><span>{car.vehicle.charAt(0)}</span><small>NESSUNA FOTO</small></div>}<label>CARICA FOTO<input type="file" accept="image/*" onChange={(event) => void uploadCarImage(car, event.target.files?.[0])} /></label></div><div className="garage-card-body"><small>AUTOMOBILE</small><h2>{car.vehicle}</h2><p>{car.auctionName}</p><div><span>PAGATA</span><strong>{euros.format(car.purchasePrice)}</strong></div><a className="market-value-link" href={classicSearchUrl(car.vehicle)} target="_blank" rel="noopener noreferrer">VALORE DI MERCATO <span>↗</span></a>{listedCarIds.has(car.id) ? <button className="button-muted" disabled>GIÀ SUL MERCATO</button> : <div className="garage-sale-actions"><button className="button-primary" onClick={() => setSellCarId(car.id)}>VENDI SUL MERCATO</button><button className="button-secondary" onClick={() => { setExternalSalePrice(null); setExternalSaleCarId(car.id); }}>VENDITA ESTERNA</button></div>}</div></article>)}</div>}</section>}
    {!isAdmin && marketOpen && <section className="garage-page market-page"><div className="garage-page-head"><div><div className="eyebrow"><i /> SCAMBI TRA PARTECIPANTI</div><h1>Mercato auto.</h1><p>Compra le auto degli altri utenti o gestisci i tuoi annunci.</p></div><div className="garage-balance"><small>SALDO DISPONIBILE</small><strong>{euros.format(balance)}</strong></div></div>{listings.length === 0 ? <div className="garage-empty"><b>Nessuna auto in vendita.</b><span>Puoi pubblicare il primo annuncio dal tuo garage.</span></div> : <div className="garage-grid">{listings.map((listing) => { const own = listing.sellerName === user.name; return <article className="garage-card market-card" key={listing.id}><div className="garage-photo">{listing.imageUrl ? <img src={listing.imageUrl} alt={listing.vehicle} /> : <div><span>{listing.vehicle.charAt(0)}</span><small>NESSUNA FOTO</small></div>}<span className="listing-date">IN VENDITA · {listing.createdAt}</span></div><div className="garage-card-body"><small>VENDITORE · {listing.sellerName}</small><h2>{listing.vehicle}</h2><div><span>PREZZO</span><strong>{euros.format(listing.price)}</strong></div>{own ? <button className="button-secondary" disabled={marketPending === listing.id} onClick={() => void cancelListing(listing)}>{marketPending === listing.id ? "ATTENDI…" : "RITIRA ANNUNCIO"}</button> : listing.price > balance ? <button className="button-muted" disabled>SALDO INSUFFICIENTE</button> : <button className="button-primary" disabled={marketPending === listing.id} onClick={() => setPurchaseListing(listing)}>ACQUISTA ORA</button>}</div></article>; })}</div>}</section>}
    {!isAdmin && <section className="participant-wallet"><div className="wallet-balance"><small>SALDO DISPONIBILE</small><strong>{euros.format(balance)}</strong><span>Budget utilizzabile in aste e mercato</span><div className="wallet-signal"><i /> Aggiornato in tempo reale</div></div><div className="garage-preview"><div><small>COLLEZIONE</small><span className="garage-count">{garage.length} {garage.length === 1 ? "AUTO" : "AUTO"}</span></div>{garage.length === 0 ? <p>Le auto che ti aggiudicherai o acquisterai compariranno qui.</p> : <div className="garage-cars">{garage.slice(0, 3).map((car) => <article key={car.id}><span>{car.vehicle.charAt(0)}</span><div><b>{car.vehicle}</b><small>{car.auctionName} · {euros.format(car.purchasePrice)}</small></div></article>)}</div>}</div></section>}
    <section className="hero-row"><div className="hero-copy"><div className="eyebrow"><i /> {isAdmin ? "REGIA D'ASTA" : "SALA D'ASTA"}</div><h1>{isAdmin ? "Avvia l'asta." : <>Alza la<br /><em>paletta.</em></>}</h1><p>{isAdmin ? "Inserisci una vettura alla volta, imposta la base e osserva la competizione in tempo reale." : "Iscriviti una volta e partecipa a tutti i lotti automobilistici dell'asta."}</p></div><div className="stats" aria-label="Statistiche della sala"><div><small>01</small><strong>{auctions.filter((auction) => auction.status === "live").length}</strong><span>ASTE<br />LIVE</span></div><div><small>02</small><strong>{auctions.reduce((sum, auction) => sum + auction.bids.length + auction.results.reduce((lotSum, result) => lotSum + result.bidCount, 0), 0)}</strong><span>OFFERTE<br />TOTALI</span></div></div></section>
    {focused && <section className={`live-room ${focused.status}`}><div className="live-main"><div className="live-heading"><span className="live-badge">{focused.status === "live" ? "● LIVE" : isBetweenLots(focused) ? "LOTTO CONCLUSO" : focused.status === "closed" ? "ASTA CHIUSA" : "IN ATTESA"}</span><button onClick={() => setFocusedId(null)} aria-label="Torna alle aste">←</button></div><div className={`lobby-banner lobby-${focused.status}`}><span>LOBBY · {focused.participants.length} PARTECIPANTI</span><b>{lobbyTitle(focused)}</b><small>{lobbyCopy(focused)}</small></div><p>LOTTO {String(focused.lotNumber).padStart(2, "0")} · {focused.name}</p><h2>{focused.vehicle || "Prima vettura da inserire"}</h2>{(focused.status !== "waiting" || isBetweenLots(focused)) && <><div className="current-price"><small>{focused.status === "live" ? "OFFERTA ATTUALE" : "PREZZO DI AGGIUDICAZIONE"}</small><strong>{euros.format(focused.currentPrice)}</strong></div>{focused.status === "live" ? <div className="countdown"><span>CHIUSURA TRA</span><b>{Math.max(0, Math.ceil((focused.endsAt - now) / 1000))}</b><i style={{ width: `${Math.max(0, Math.min(100, (focused.endsAt - now) / 100))}%` }} /></div> : <div className="winner"><span>AGGIUDICATA A</span><strong>{focused.winner}</strong><small>{focused.bids.length} offerte ricevute</small></div>}</>}{isAdmin && isBetweenLots(focused) && <div className="next-lot-actions"><button onClick={() => setStartAuctionId(focused.id)}>PROSSIMA AUTO →</button><button onClick={() => void finishAuction(focused)}>TERMINA ASTA</button></div>}</div><aside className="bid-feed"><div className="feed-title"><b>Registro offerte · lotto {focused.lotNumber}</b><span>{focused.bids.length}/{focused.targetBids || "—"}</span></div><div className="feed-list">{focused.bids.length === 0 ? <p>In attesa della prima offerta…</p> : focused.bids.slice(0, 12).map((bid, index) => <div className={index === 0 ? "top-bid" : ""} key={bid.id}><span className="bid-avatar">{bid.bot ? "BOT" : bid.bidder.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><span><b>{bid.bidder}</b><small>{bid.bot ? "Offerente automatico" : "Partecipante"}</small></span><strong>{euros.format(bid.amount)}</strong></div>)}</div>{!isAdmin && focused.status === "live" && <div className="bid-action">{focused.participants.includes(user.name) ? bidPending ? <button className="leading-bid" disabled>OFFERTA IN CORSO…</button> : isUserLeading(focused) ? <button className="leading-bid" disabled>SEI IL MIGLIOR OFFERENTE <span>✓</span></button> : focused.currentPrice + incrementFor(focused.currentPrice, focused.startPrice) > balance ? <button className="insufficient-bid" disabled>SALDO INSUFFICIENTE <span>!</span></button> : <button onClick={() => placeBid(focused)}>OFFRI {euros.format(focused.currentPrice + incrementFor(focused.currentPrice, focused.startPrice))} <span>↑</span></button> : <button onClick={() => toggleParticipation(focused.id)}>ISCRIVITI PER OFFRIRE</button>}<small>{bidPending ? "Sto registrando l’offerta nel database" : isUserLeading(focused) ? "Potrai rilanciare quando qualcuno supererà la tua offerta" : focused.currentPrice + incrementFor(focused.currentPrice, focused.startPrice) > balance ? `Ti mancano ${euros.format(focused.currentPrice + incrementFor(focused.currentPrice, focused.startPrice) - balance)} per rilanciare` : "Ogni offerta riporta il timer a 10 secondi"}</small></div>}{focused.results.length > 0 && <div className="lot-history"><b>Auto aggiudicate</b>{focused.results.slice().reverse().map((result) => <div key={result.lotNumber}><span>{result.lotNumber}. {result.vehicle}</span><strong>{result.winner} · {euros.format(result.finalPrice)}</strong></div>)}</div>}</aside></section>}
    <section className="content-head"><div><span className="section-number">01</span><h2>Tutte le aste</h2></div>{isAdmin && <button className="primary compact" onClick={() => setShowCreate(true)}>+ NUOVA ASTA</button>}</section>
    <section className="auction-grid">{auctions.length === 0 && !connectionError ? <p className="empty-state">Nessuna asta presente. L&apos;admin può creare la prima.</p> : auctions.map((auction, index) => { const joined = auction.participants.includes(user.name); return <article className="auction-card simple-auction" key={auction.id} style={{ "--accent": auction.accent } as React.CSSProperties}><div className="card-top"><span>ASTA {String(index + 1).padStart(3, "0")}</span><span className={`status-${auction.status}`}>{auction.status === "live" ? "● LIVE" : isBetweenLots(auction) ? "LOTTO CONCLUSO" : auction.status === "closed" ? "CHIUSA" : "DA AVVIARE"}</span></div><div className="auction-monogram" aria-hidden="true"><span>{auction.name.charAt(0).toUpperCase()}</span><i>{String(index + 1).padStart(2, "0")}</i></div><div className="card-body"><small>NOME DELL&apos;ASTA</small><h3>{auction.name}</h3>{auction.vehicle && <p className="current-vehicle">Lotto {auction.lotNumber}: <b>{auction.vehicle}</b></p>}<div className="auction-meta"><span>{auction.status === "waiting" && !isBetweenLots(auction) ? `Creata il ${auction.createdAt}` : `Base ${euros.format(auction.startPrice)}`}</span><strong>{auction.results.length} auto aggiudicate</strong></div>{isBetweenLots(auction) && <div className="card-winner">Ultimo lotto: <b>{auction.winner}</b></div>}</div><div className="card-footer simple-footer"><div><small>STATO</small><b>{auction.status === "live" ? euros.format(auction.currentPrice) : isBetweenLots(auction) ? "Pronta per la prossima" : auction.status === "closed" ? `${auction.results.length} lotti conclusi` : `${auction.participants.length} iscritti`}</b></div>{isAdmin ? (auction.status === "waiting" && !isBetweenLots(auction) ? <button onClick={() => setStartAuctionId(auction.id)}>PRIMA AUTO →</button> : isBetweenLots(auction) ? <button onClick={() => setStartAuctionId(auction.id)}>PROSSIMA →</button> : <button onClick={() => setFocusedId(auction.id)}>SEGUI →</button>) : (auction.status === "waiting" && !isBetweenLots(auction) ? (joined ? <button className="joined" onClick={() => setFocusedId(auction.id)}>ENTRA NELLA LOBBY →</button> : <button onClick={() => toggleParticipation(auction.id)}>PARTECIPA →</button>) : <button onClick={() => setFocusedId(auction.id)}>{auction.status === "live" ? "ENTRA NELLA LOBBY →" : isBetweenLots(auction) ? "TORNA NELLA LOBBY →" : "RISULTATI →"}</button>)}</div></article>; })}</section>
    {wheelAuction && <div className="modal-backdrop wheel-backdrop" onMouseDown={() => { if (!wheelSpinning) setWheelAuction(null); }}><section className="modal wheel-modal" onMouseDown={(event) => event.stopPropagation()}>{!wheelSpinning && <button className="close" onClick={() => setWheelAuction(null)}>×</button>}<div className="eyebrow"><i /> BONUS DI ISCRIZIONE</div><h2>Ruota della fortuna.</h2><p>Gira la ruota per completare l’iscrizione a <b>{wheelAuction.name}</b>. Il risultato verrà applicato subito al tuo saldo.</p><div className="wheel-stage"><i className="wheel-pointer" /><div className="fortune-wheel" style={{ background: wheelBackground, transform: `rotate(${wheelRotation}deg)` }}><div className="wheel-hub">AS</div></div></div>{wheelOutcome ? <div className={`wheel-result ${wheelOutcome.reward < 0 ? "negative" : "positive"}`}><small>{wheelOutcome.alreadySpun ? "PREMIO GIÀ RISCOSSO" : wheelOutcome.reward < 0 ? "PENALITÀ" : "HAI VINTO"}</small><strong>{wheelOutcome.reward > 0 ? "+" : ""}{euros.format(wheelOutcome.reward)}</strong><span>Nuovo saldo: {euros.format(wheelOutcome.balanceAfter)}</span><button className="primary" onClick={() => { setFocusedId(wheelAuction.id); setWheelAuction(null); }}>ENTRA NELL’ASTA →</button></div> : <><div className="wheel-legend"><span><i className="legend-main" />+500 mila <b>80%</b></span><span><i className="legend-other" />Altri premi <b>20%</b></span></div><button className="primary wheel-spin-button" disabled={wheelSpinning} onClick={() => void spinSignupWheel()}>{wheelSpinning ? "LA RUOTA GIRA…" : "GIRA E ISCRIVITI"} <span>↻</span></button></>}</section></div>}
    {sellCarId && <div className="modal-backdrop" onMouseDown={() => setSellCarId(null)}><section className="modal compact-modal" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setSellCarId(null)}>×</button><div className="eyebrow"><i /> NUOVO ANNUNCIO</div><h2>Scegli il prezzo.</h2><p>L’auto resterà nel tuo garage fino all’acquisto. Il ricavato verrà accreditato automaticamente.</p><form onSubmit={listCar}><label>Prezzo di vendita (€)<input name="salePrice" type="number" min="100" max="100000000" step="50" placeholder="es. 45.000" autoFocus required /></label><button className="primary" type="submit" disabled={marketPending === sellCarId}>{marketPending === sellCarId ? "PUBBLICAZIONE…" : "CONFERMA E PUBBLICA"} <span>→</span></button></form></section></div>}
    {externalSaleCarId && <div className="modal-backdrop" onMouseDown={() => { setExternalSaleCarId(null); setExternalSalePrice(null); }}><section className="modal compact-modal" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => { setExternalSaleCarId(null); setExternalSalePrice(null); }}>×</button><div className="eyebrow"><i /> VENDITA ESTERNA</div>{externalSalePrice === null ? <><h2>Inserisci il prezzo.</h2><p>Indica la cifra concordata per <b>{garage.find((car) => car.id === externalSaleCarId)?.vehicle}</b>. Potrai controllarla prima di vendere.</p><form onSubmit={prepareExternalSale}><label>Prezzo concordato (€)<input name="externalSalePrice" type="number" min="100" max="100000000" step="50" placeholder="es. 45.000" autoFocus required /></label><button className="primary" type="submit">CONTINUA <span>→</span></button></form></> : <><h2>Confermi la vendita?</h2><p>Controlla attentamente i dati: dopo la conferma l’auto uscirà dal garage.</p><div className="sale-confirm-summary"><span>AUTOMOBILE</span><strong>{garage.find((car) => car.id === externalSaleCarId)?.vehicle}</strong><span>PREZZO DI VENDITA</span><strong>{euros.format(externalSalePrice)}</strong><span>SALDO ATTUALE</span><strong>{euros.format(balance)}</strong><span>SALDO DOPO LA VENDITA</span><strong className="result-balance">{euros.format(balance + externalSalePrice)}</strong></div><div className="confirmation-actions"><button type="button" onClick={() => setExternalSalePrice(null)}>INDIETRO</button><button className="primary" type="button" disabled={marketPending === externalSaleCarId} onClick={() => void sellCarExternally()}>{marketPending === externalSaleCarId ? "VENDITA…" : "CONFERMA VENDITA"}</button></div></>}</section></div>}
    {purchaseListing && <div className="modal-backdrop" onMouseDown={() => setPurchaseListing(null)}><section className="modal compact-modal purchase-confirm" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setPurchaseListing(null)}>×</button><div className="eyebrow"><i /> CONFERMA ACQUISTO</div><h2>{purchaseListing.vehicle}</h2><p>Acquisti l’auto da <b>{purchaseListing.sellerName}</b>. Il passaggio di proprietà e il pagamento saranno immediati.</p><div className="purchase-summary"><span>PREZZO</span><strong>{euros.format(purchaseListing.price)}</strong><span>SALDO DOPO L’ACQUISTO</span><strong>{euros.format(balance - purchaseListing.price)}</strong></div><div className="confirmation-actions"><button onClick={() => setPurchaseListing(null)}>ANNULLA</button><button className="primary" disabled={marketPending === purchaseListing.id} onClick={() => void buyCar(purchaseListing)}>{marketPending === purchaseListing.id ? "ACQUISTO…" : "CONFERMA ACQUISTO"}</button></div></section></div>}
    {showCreate && <div className="modal-backdrop" onMouseDown={() => setShowCreate(false)}><section className="modal compact-modal" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setShowCreate(false)}>×</button><div className="eyebrow"><i /> NUOVA ASTA</div><h2>Crea un&apos;asta</h2><form onSubmit={addAuction}><label>Nome dell&apos;asta<input name="name" placeholder="es. Supercar d'estate" maxLength={60} autoFocus required /></label><button className="primary" type="submit">CREA ASTA <span>→</span></button></form></section></div>}
    {startAuctionId !== null && <div className="modal-backdrop" onMouseDown={() => { setStartAuctionId(null); setVehicleDraft(""); setMarketValueDraft(""); }}><section className="modal compact-modal" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => { setStartAuctionId(null); setVehicleDraft(""); setMarketValueDraft(""); }}>×</button><div className="eyebrow"><i /> NUOVO LOTTO</div><h2>Inserisci l&apos;automobile</h2><p>I bot stimano il proprio limite dal modello e dalla versione, indipendentemente dalla base d’asta.</p><form onSubmit={startAuction}><label>Marca, modello e versione<input name="vehicle" value={vehicleDraft} onChange={(event) => { const vehicle = event.target.value; setVehicleDraft(vehicle); setMarketValueDraft(vehicle.trim().length >= 3 ? String(estimateVehicleValue(vehicle)) : ""); }} placeholder="es. Ferrari 812 Competizione" maxLength={80} autoFocus required /></label>{vehicleDraft.trim().length >= 3 && <><div className="vehicle-estimate recognized"><span>{hasExactVehicleValue(vehicleDraft) ? "VALORE DAL CATALOGO" : "STIMA AUTOMATICA PER MARCA E VERSIONE"}</span><strong>{euros.format(estimateVehicleValue(vehicleDraft))}</strong></div><a className="classic-comps-link" href={classicSearchUrl(vehicleDraft)} target="_blank" rel="noopener noreferrer">CONTROLLA I COMPARABILI SU CLASSIC.COM ↗</a></>}<label>Valore di mercato stimato (€) <small>compilato automaticamente</small><input name="marketValue" type="number" min="100" step="500" value={marketValueDraft} onChange={(event) => setMarketValueDraft(event.target.value)} placeholder="La stima apparirà automaticamente" required /></label><label>Prezzo iniziale (€)<input name="price" type="number" min="100" step="50" placeholder="es. 60.000" required /></label><button className="primary" type="submit">AVVIA LOTTO <span>●</span></button></form></section></div>}
  </main>;
}
