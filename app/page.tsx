"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";

type User = { name: string; role: "participant" | "admin" };
type Bid = { id: string; bidder: string; amount: number; at: number; bot: boolean };
type Bot = { name: string; budget: number; aggression: number; interest?: number; patience?: number; heat?: number };
type LotResult = { lotNumber: number; vehicle: string; winner: string; finalPrice: number; bidCount: number };
type GarageCar = { id: string; vehicle: string; purchasePrice: number; auctionName: string; imageUrl: string };
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
  { name: "Admin", role: "admin" },
];
const BOT_NAMES = ["Marco Rinaldi", "Andrea Costa", "Giulia Ferri", "Luca Romano", "Davide Conti", "Elena Moretti", "Simone Gallo", "Matteo De Luca", "Sofia Ricci", "Alessandro Greco"];
const euros = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
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
  const [garageOpen, setGarageOpen] = useState(false);
  const [sellCarId, setSellCarId] = useState<string | null>(null);
  const [optimisticLeader, setOptimisticLeader] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [startAuctionId, setStartAuctionId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const auctionsRef = useRef<Auction[]>([]);
  const engineBusy = useRef(false);
  const bidBusy = useRef(false);

  useEffect(() => { auctionsRef.current = auctions; }, [auctions]);
  useEffect(() => {
    if (!optimisticLeader || !user) return;
    const auction = auctions.find((item) => `${item.id}:${item.lotNumber}` === optimisticLeader);
    if (auction?.bids[0] && auction.bids[0].bidder !== user.name) setOptimisticLeader("");
  }, [auctions, optimisticLeader, user]);

  const loadParticipantProfile = async (name: string) => {
    const account = await supabase.from("participant_accounts").select("balance").eq("name", name).maybeSingle();
    if (!account.data && !account.error) await supabase.from("participant_accounts").insert({ name, balance: 250000 });
    setBalance(Number(account.data?.balance ?? 250000));
    const cars = await supabase.from("garage_cars").select("*").eq("owner_name", name).is("sold_at", null).order("won_at", { ascending: false });
    if (cars.data) setGarage(cars.data.map((car) => ({ id: String(car.id), vehicle: car.vehicle, purchasePrice: Number(car.purchase_price), auctionName: car.auction_name, imageUrl: car.image_url || "" })));
  };

  const uploadCarImage = async (car: GarageCar, file?: File) => {
    if (!user || !file) return;
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) { setConnectionError("La foto deve essere un’immagine di massimo 5 MB."); return; }
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.name.replaceAll(" ", "-").toLowerCase()}/${car.id}-${Date.now()}.${extension}`;
    const upload = await supabase.storage.from("garage-images").upload(path, file, { upsert: true });
    if (upload.error) { setConnectionError(`Foto garage: ${upload.error.message}`); return; }
    const imageUrl = supabase.storage.from("garage-images").getPublicUrl(path).data.publicUrl;
    const update = await supabase.from("garage_cars").update({ image_url: imageUrl }).eq("id", car.id).eq("owner_name", user.name);
    if (update.error) setConnectionError(`Foto garage: ${update.error.message}`); else await loadParticipantProfile(user.name);
  };

  const sellCar = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!user || !sellCarId) return;
    const price = Number(new FormData(event.currentTarget).get("salePrice")); if (price <= 0) return;
    const sale = await supabase.from("garage_cars").update({ sold_at: new Date().toISOString(), sale_price: price }).eq("id", sellCarId).eq("owner_name", user.name).is("sold_at", null).select("id");
    if (sale.error || !sale.data?.length) { setConnectionError(sale.error?.message || "Questa automobile risulta già venduta."); return; }
    const credit = await supabase.from("participant_accounts").update({ balance: balance + price }).eq("name", user.name);
    if (credit.error) setConnectionError(`Accredito vendita: ${credit.error.message}`); else { setSellCarId(null); await loadParticipantProfile(user.name); }
  };

  const loadAuctions = async () => {
    const [auctionResult, participantResult, bidResult] = await Promise.all([
      supabase.from("auctions").select("*").order("created_at", { ascending: false }),
      supabase.from("auction_participants").select("auction_id,user_name"),
      supabase.from("bids").select("*").order("created_at", { ascending: false }),
    ]);
    const error = auctionResult.error || participantResult.error || bidResult.error;
    if (error) { setConnectionError(`Supabase: ${error.message}`); return; }
    const participants = participantResult.data || []; const bids = bidResult.data || [];
    const colors = ["#d9ff43", "#ff6b35", "#70d7ff"];
    const mapped: Auction[] = (auctionResult.data || []).map((row, index) => {
      const config = row.bot_config && !Array.isArray(row.bot_config) ? row.bot_config as { bots?: Bot[]; nextBotAt?: number; vehicle?: string; lotNumber?: number; results?: LotResult[]; lotStartedAt?: number } : { bots: row.bot_config as Bot[] };
      const lotNumber = config.lotNumber || 1;
      return {
        id: String(row.id), name: row.name, createdAt: new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(new Date(row.created_at)),
        participants: participants.filter((item) => item.auction_id === row.id).map((item) => item.user_name), accent: colors[index % colors.length],
        status: row.status, startPrice: Number(row.start_price), currentPrice: Number(row.current_price),
        bids: bids.filter((bid) => bid.auction_id === row.id && (!config.lotStartedAt || new Date(bid.created_at).getTime() >= config.lotStartedAt)).map((bid) => ({ id: String(bid.id), bidder: bid.bidder_name, amount: Number(bid.amount), at: new Date(bid.created_at).getTime(), bot: bid.is_bot })),
        endsAt: row.ends_at ? new Date(row.ends_at).getTime() : 0, nextBotAt: config.nextBotAt || 0,
        targetBids: row.target_bids || 50, bots: config.bots || [], winner: row.winner || "",
        lotNumber, vehicle: config.vehicle || "", results: config.results || [], lotStartedAt: config.lotStartedAt || 0,
      };
    });
    setAuctions(mapped); setConnectionError("");
  };

  useEffect(() => {
    const savedUser = localStorage.getItem("auction-simulator-user");
    const connect = async () => {
      const { data } = await supabase.auth.getSession();
      if (savedUser && !data.session) await supabase.auth.signInAnonymously();
      if (savedUser) setUser(JSON.parse(savedUser));
      await loadAuctions();
    };
    void connect();
    const channel = supabase.channel("auction-simulator-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "auctions" }, () => void loadAuctions())
      .on("postgres_changes", { event: "*", schema: "public", table: "auction_participants" }, () => void loadAuctions())
      .on("postgres_changes", { event: "*", schema: "public", table: "bids" }, () => void loadAuctions())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  useEffect(() => { if (user?.role === "participant") void loadParticipantProfile(user.name); }, [user]);
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
      const tick = Date.now(); setNow(tick);
      if (!user || engineBusy.current) return;
      const auction = auctionsRef.current.find((item) => item.status === "live"); if (!auction) return;
      engineBusy.current = true;
      try {
        if (tick >= auction.endsAt) {
          const winner = auction.bids[0]?.bidder || "Nessun offerente";
          const result: LotResult = { lotNumber: auction.lotNumber, vehicle: auction.vehicle, winner, finalPrice: auction.currentPrice, bidCount: auction.bids.length };
          const closing = await supabase.from("auctions").update({ status: "waiting", winner, bot_config: { bots: [], nextBotAt: 0, vehicle: auction.vehicle, lotNumber: auction.lotNumber, results: [...auction.results, result], lotStartedAt: auction.lotStartedAt } }).eq("id", auction.id).eq("status", "live").select("id");
          if (closing.error) { setConnectionError(`Chiusura lotto: ${closing.error.message}`); return; }
          if (!closing.data?.length) return;
          if (USERS.some((entry) => entry.role === "participant" && entry.name === winner)) {
            const garageInsert = await supabase.from("garage_cars").insert({ owner_name: winner, auction_id: auction.id, auction_name: auction.name, lot_number: auction.lotNumber, vehicle: auction.vehicle, purchase_price: auction.currentPrice });
            if (!garageInsert.error) {
              const account = await supabase.from("participant_accounts").select("balance").eq("name", winner).single();
              if (account.data) await supabase.from("participant_accounts").update({ balance: Math.max(0, Number(account.data.balance) - auction.currentPrice) }).eq("name", winner);
            }
          }
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
            const endsAt = tick + 10000; const nextBotAt = tick + delay;
            const nextBots = evolvedBots.map((entry) => entry.name === bot.name ? { ...entry, heat: Math.min(1, (entry.heat ?? .25) + .18 + Math.random() * .18) } : entry);
            const advanceAuction = await supabase.from("auctions").update({ current_price: amount, ends_at: new Date(endsAt).toISOString(), bot_config: { bots: nextBots, nextBotAt, vehicle: auction.vehicle, lotNumber: auction.lotNumber, results: auction.results, lotStartedAt: auction.lotStartedAt } }).eq("id", auction.id).eq("status", "live").eq("current_price", auction.currentPrice).select("id");
            if (advanceAuction.error) setConnectionError(`Aggiornamento asta: ${advanceAuction.error.message}`);
            if (!advanceAuction.data?.length) return;
            const bidInsert = await supabase.from("bids").insert({ auction_id: auction.id, bidder_name: bot.name, amount, is_bot: true });
            if (bidInsert.error) setConnectionError(`Offerta bot: ${bidInsert.error.message}`);
          } else {
            const hesitation = tick + 600 + Math.random() * 1800;
            await supabase.from("auctions").update({ bot_config: { bots: evolvedBots, nextBotAt: hesitation, vehicle: auction.vehicle, lotNumber: auction.lotNumber, results: auction.results, lotStartedAt: auction.lotStartedAt } }).eq("id", auction.id).eq("status", "live").eq("current_price", auction.currentPrice);
          }
        }
      } finally { engineBusy.current = false; }
    };
    const timer = window.setInterval(() => void advance(), 250);
    return () => window.clearInterval(timer);
  }, [user]);

  const enter = async (event: FormEvent) => { event.preventDefault(); const next = USERS.find((entry) => entry.name === selectedName) ?? USERS[0]; const { data } = await supabase.auth.getSession(); if (!data.session) { const result = await supabase.auth.signInAnonymously(); if (result.error) { setConnectionError(result.error.message); return; } } localStorage.setItem("auction-simulator-user", JSON.stringify(next)); setUser(next); await loadAuctions(); };
  const logout = () => { localStorage.removeItem("auction-simulator-user"); setUser(null); setFocusedId(null); setGarageOpen(false); };
  const addAuction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name")).trim();
    void supabase.from("auctions").insert({ name }).then(({ error }) => { if (error) setConnectionError(error.message); else { setShowCreate(false); void loadAuctions(); } });
  };
  const toggleParticipation = async (id: string) => { if (!user || user.role !== "participant") return; const { data } = await supabase.auth.getUser(); if (!data.user) return; const auction = auctions.find((item) => item.id === id); if (auction?.participants.includes(user.name)) await supabase.from("auction_participants").delete().eq("auction_id", id).eq("user_id", data.user.id); else await supabase.from("auction_participants").insert({ auction_id: id, user_id: data.user.id, user_name: user.name }); await loadAuctions(); };
  const startAuction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (startAuctionId === null) return;
    const form = new FormData(event.currentTarget); const price = Number(form.get("price")); const vehicle = String(form.get("vehicle")).trim(); const startedAt = Date.now();
    const current = auctions.find((item) => item.id === startAuctionId); const lotNumber = current && isBetweenLots(current) ? current.lotNumber + 1 : 1; const results = current?.results || [];
    const estimatedValue = price * 1.5;
    const bots = BOT_NAMES.slice().sort(() => Math.random() - .5).slice(0, 8).map((name, index) => ({
      name, budget: Math.round((estimatedValue * (.78 + Math.random() * .58)) / 100) * 100,
      aggression: .2 + (index % 4) * .18 + Math.random() * .08,
      interest: .22 + Math.random() * .7, patience: .25 + Math.random() * .7, heat: Math.random() * .45,
    }));
    const targetBids = 46 + Math.floor(Math.random() * 9); const startResult = await supabase.from("auctions").update({ status: "live", start_price: price, current_price: price, ends_at: new Date(startedAt + 10000).toISOString(), winner: null, target_bids: targetBids, bot_config: { bots, nextBotAt: startedAt + 800, vehicle, lotNumber, results, lotStartedAt: startedAt } }).eq("id", startAuctionId);
    if (startResult.error) { setConnectionError(`Avvio lotto: ${startResult.error.message}`); return; }
    setFocusedId(startAuctionId); setStartAuctionId(null);
  };
  const finishAuction = async (auction: Auction) => {
    await supabase.from("auctions").update({ status: "closed", bot_config: { bots: [], nextBotAt: 0, vehicle: auction.vehicle, lotNumber: auction.lotNumber, results: auction.results, lotStartedAt: auction.lotStartedAt } }).eq("id", auction.id);
    await loadAuctions();
  };
  const placeBid = async (auction: Auction) => {
    if (!user || user.role !== "participant" || auction.status !== "live" || !auction.participants.includes(user.name) || bidBusy.current || auction.bids[0]?.bidder === user.name || optimisticLeader === `${auction.id}:${auction.lotNumber}`) return;
    bidBusy.current = true;
    try {
      let latestQuery = supabase.from("bids").select("bidder_name,amount").eq("auction_id", auction.id).order("created_at", { ascending: false }).limit(1);
      if (auction.lotStartedAt) latestQuery = latestQuery.gte("created_at", new Date(auction.lotStartedAt).toISOString());
      const [{ data }, latestResult] = await Promise.all([
        supabase.auth.getUser(),
        latestQuery.maybeSingle(),
      ]);
      if (!data.user || latestResult.data?.bidder_name === user.name) return;
      const currentPrice = Math.max(auction.currentPrice, Number(latestResult.data?.amount || 0));
      const amount = currentPrice + incrementFor(currentPrice, auction.startPrice); const time = Date.now();
      if (amount > balance) { setConnectionError("Saldo insufficiente per questa offerta."); return; }
      const claim = await supabase.from("auctions").update({ current_price: amount, ends_at: new Date(time + 10000).toISOString(), bot_config: { bots: auction.bots, nextBotAt: Math.max(auction.nextBotAt, time + 800), vehicle: auction.vehicle, lotNumber: auction.lotNumber, results: auction.results, lotStartedAt: auction.lotStartedAt } }).eq("id", auction.id).eq("status", "live").eq("current_price", currentPrice).select("id");
      if (claim.error) { setConnectionError(`Offerta: ${claim.error.message}`); return; }
      if (!claim.data?.length) { await loadAuctions(); return; }
      const insert = await supabase.from("bids").insert({ auction_id: auction.id, bidder_id: data.user.id, bidder_name: user.name, amount, is_bot: false });
      if (insert.error) setConnectionError(`Offerta: ${insert.error.message}`);
      else setOptimisticLeader(`${auction.id}:${auction.lotNumber}`);
      await loadAuctions();
    } finally { bidBusy.current = false; }
  };

  const focused = useMemo(() => auctions.find((auction) => auction.id === focusedId) || null, [auctions, focusedId]);
  const isUserLeading = (auction: Auction) => auction.bids[0]?.bidder === user?.name || optimisticLeader === `${auction.id}:${auction.lotNumber}`;
  const lobbyTitle = (auction: Auction) => auction.status === "live" ? "Il lotto è aperto" : isBetweenLots(auction) ? "Lotto aggiudicato" : auction.status === "closed" ? "Asta terminata" : "La lobby è aperta";
  const lobbyCopy = (auction: Auction) => auction.status === "live" ? "Segui i rilanci in tempo reale e alza la paletta quando vuoi intervenire." : isBetweenLots(auction) ? "L’admin sta preparando la prossima automobile. Rimani nella lobby." : auction.status === "closed" ? "Consulta lo storico completo delle automobili aggiudicate." : "L’admin sta preparando il primo lotto. L’asta inizierà automaticamente.";
  if (!user) return <main className="login-shell"><div className="login-top"><Mark /><span>AUCTION<br />SIMULATOR</span></div><section className="login-card"><div className="eyebrow"><i /> ACCESSO RISERVATO</div><h1>La griglia<br />è pronta.</h1><p>Scegli il tuo nome per entrare nella tua area personale.</p><form onSubmit={enter}><label htmlFor="account">Profilo</label><div className="select-wrap"><select id="account" value={selectedName} onChange={(event) => setSelectedName(event.target.value)}>{USERS.map((entry) => <option key={entry.name}>{entry.name}</option>)}</select></div><button className="primary" type="submit">ACCEDI <span>→</span></button></form>{connectionError && <div className="connection-error">{connectionError}</div>}<div className="access-note"><span>●</span><div><b>Supabase Realtime</b><small>Dati condivisi tra tutti i dispositivi</small></div></div></section><aside className="login-visual" aria-hidden="true"><div className="speed-lines" /><div className="car-silhouette"><div className="roof" /><div className="body" /><div className="wheel w1" /><div className="wheel w2" /></div><div className="lot-number">LOT<br /><strong>001</strong></div></aside></main>;

  const isAdmin = user.role === "admin";
  return <main className={`dashboard ${focused && !isAdmin ? "lobby-active" : ""} ${garageOpen ? "garage-active" : ""}`}>
    <header><div className="brand"><Mark /><span>AUCTION<br />SIMULATOR</span></div><div className="profile"><div className="avatar">{user.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</div><div><b>{user.name}</b><small>{isAdmin ? "Amministratore" : "Partecipante"}</small></div><button onClick={logout} aria-label="Esci">↗</button></div></header>
    {connectionError && <div className="connection-error dashboard-error">{connectionError}</div>}
    {!isAdmin && garageOpen && <section className="garage-page"><div className="garage-page-head"><div><div className="eyebrow"><i /> COLLEZIONE PERSONALE</div><h1>Il mio garage.</h1><p>Le automobili che ti sei aggiudicato, tutte in un unico posto.</p></div><div className="garage-balance"><small>SALDO ATTUALE</small><strong>{euros.format(balance)}</strong><button onClick={() => setGarageOpen(false)}>← TORNA ALLE ASTE</button></div></div>{garage.length === 0 ? <div className="garage-empty"><b>Il garage è vuoto.</b><span>Vinci un lotto per aggiungere la tua prima automobile.</span></div> : <div className="garage-grid">{garage.map((car) => <article className="garage-card" key={car.id}><div className="garage-photo">{car.imageUrl ? <img src={car.imageUrl} alt={car.vehicle} /> : <div><span>{car.vehicle.charAt(0)}</span><small>NESSUNA FOTO</small></div>}<label>CARICA FOTO<input type="file" accept="image/*" onChange={(event) => void uploadCarImage(car, event.target.files?.[0])} /></label></div><div className="garage-card-body"><small>AUTOMOBILE</small><h2>{car.vehicle}</h2><p>{car.auctionName}</p><div><span>PAGATA</span><strong>{euros.format(car.purchasePrice)}</strong></div><button onClick={() => setSellCarId(car.id)}>VENDI AUTOMOBILE →</button></div></article>)}</div>}</section>}
    {!isAdmin && <section className="participant-wallet"><div className="wallet-balance"><small>SALDO DISPONIBILE</small><strong>{euros.format(balance)}</strong><span>Budget utilizzabile nelle aste</span></div><div className="garage-preview"><div><small>IL MIO GARAGE</small><button className="garage-open" onClick={() => setGarageOpen(true)}>{garage.length} AUTO · APRI →</button></div>{garage.length === 0 ? <p>Le auto che ti aggiudicherai compariranno qui.</p> : <div className="garage-cars">{garage.slice(0, 3).map((car) => <article key={car.id}><span>{car.vehicle.charAt(0)}</span><div><b>{car.vehicle}</b><small>{car.auctionName} · {euros.format(car.purchasePrice)}</small></div></article>)}</div>}</div></section>}
    <section className="hero-row"><div><div className="eyebrow"><i /> {isAdmin ? "REGIA D'ASTA" : "SALA D'ASTA"}</div><h1>{isAdmin ? "Avvia l'asta." : <>Alza la<br /><em>paletta.</em></>}</h1><p>{isAdmin ? "Inserisci una vettura alla volta, imposta la base e osserva la competizione in tempo reale." : "Iscriviti una volta e partecipa a tutti i lotti automobilistici dell'asta."}</p></div><div className="stats"><div><strong>{auctions.filter((auction) => auction.status === "live").length}</strong><span>ASTE<br />LIVE</span></div><div><strong>{auctions.reduce((sum, auction) => sum + auction.bids.length + auction.results.reduce((lotSum, result) => lotSum + result.bidCount, 0), 0)}</strong><span>OFFERTE<br />TOTALI</span></div></div></section>
    {focused && <section className={`live-room ${focused.status}`}><div className="live-main"><div className="live-heading"><span className="live-badge">{focused.status === "live" ? "● LIVE" : isBetweenLots(focused) ? "LOTTO CONCLUSO" : focused.status === "closed" ? "ASTA CHIUSA" : "IN ATTESA"}</span><button onClick={() => setFocusedId(null)} aria-label="Torna alle aste">←</button></div><div className={`lobby-banner lobby-${focused.status}`}><span>LOBBY · {focused.participants.length} PARTECIPANTI</span><b>{lobbyTitle(focused)}</b><small>{lobbyCopy(focused)}</small></div><p>LOTTO {String(focused.lotNumber).padStart(2, "0")} · {focused.name}</p><h2>{focused.vehicle || "Prima vettura da inserire"}</h2>{(focused.status !== "waiting" || isBetweenLots(focused)) && <><div className="current-price"><small>{focused.status === "live" ? "OFFERTA ATTUALE" : "PREZZO DI AGGIUDICAZIONE"}</small><strong>{euros.format(focused.currentPrice)}</strong></div>{focused.status === "live" ? <div className="countdown"><span>CHIUSURA TRA</span><b>{Math.max(0, Math.ceil((focused.endsAt - now) / 1000))}</b><i style={{ width: `${Math.max(0, Math.min(100, (focused.endsAt - now) / 100))}%` }} /></div> : <div className="winner"><span>AGGIUDICATA A</span><strong>{focused.winner}</strong><small>{focused.bids.length} offerte ricevute</small></div>}</>}{isAdmin && isBetweenLots(focused) && <div className="next-lot-actions"><button onClick={() => setStartAuctionId(focused.id)}>PROSSIMA AUTO →</button><button onClick={() => void finishAuction(focused)}>TERMINA ASTA</button></div>}</div><aside className="bid-feed"><div className="feed-title"><b>Registro offerte · lotto {focused.lotNumber}</b><span>{focused.bids.length}/{focused.targetBids || "—"}</span></div><div className="feed-list">{focused.bids.length === 0 ? <p>In attesa della prima offerta…</p> : focused.bids.slice(0, 12).map((bid, index) => <div className={index === 0 ? "top-bid" : ""} key={bid.id}><span className="bid-avatar">{bid.bot ? "BOT" : bid.bidder.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><span><b>{bid.bidder}</b><small>{bid.bot ? "Offerente automatico" : "Partecipante"}</small></span><strong>{euros.format(bid.amount)}</strong></div>)}</div>{!isAdmin && focused.status === "live" && <div className="bid-action">{focused.participants.includes(user.name) ? isUserLeading(focused) ? <button className="leading-bid" disabled>SEI IL MIGLIOR OFFERENTE <span>✓</span></button> : focused.currentPrice + incrementFor(focused.currentPrice, focused.startPrice) > balance ? <button className="insufficient-bid" disabled>SALDO INSUFFICIENTE <span>!</span></button> : <button onClick={() => placeBid(focused)}>OFFRI {euros.format(focused.currentPrice + incrementFor(focused.currentPrice, focused.startPrice))} <span>↑</span></button> : <button onClick={() => toggleParticipation(focused.id)}>ISCRIVITI PER OFFRIRE</button>}<small>{isUserLeading(focused) ? "Potrai rilanciare quando qualcuno supererà la tua offerta" : focused.currentPrice + incrementFor(focused.currentPrice, focused.startPrice) > balance ? `Ti mancano ${euros.format(focused.currentPrice + incrementFor(focused.currentPrice, focused.startPrice) - balance)} per rilanciare` : "Ogni offerta riporta il timer a 10 secondi"}</small></div>}{focused.results.length > 0 && <div className="lot-history"><b>Auto aggiudicate</b>{focused.results.slice().reverse().map((result) => <div key={result.lotNumber}><span>{result.lotNumber}. {result.vehicle}</span><strong>{result.winner} · {euros.format(result.finalPrice)}</strong></div>)}</div>}</aside></section>}
    <section className="content-head"><div><span className="section-number">01</span><h2>Tutte le aste</h2></div>{isAdmin && <button className="primary compact" onClick={() => setShowCreate(true)}>+ NUOVA ASTA</button>}</section>
    <section className="auction-grid">{auctions.length === 0 && !connectionError ? <p className="empty-state">Nessuna asta presente. L&apos;admin può creare la prima.</p> : auctions.map((auction, index) => { const joined = auction.participants.includes(user.name); return <article className="auction-card simple-auction" key={auction.id} style={{ "--accent": auction.accent } as React.CSSProperties}><div className="card-top"><span>ASTA {String(index + 1).padStart(3, "0")}</span><span className={`status-${auction.status}`}>{auction.status === "live" ? "● LIVE" : isBetweenLots(auction) ? "LOTTO CONCLUSO" : auction.status === "closed" ? "CHIUSA" : "DA AVVIARE"}</span></div><div className="auction-monogram" aria-hidden="true"><span>{auction.name.charAt(0).toUpperCase()}</span><i>{String(index + 1).padStart(2, "0")}</i></div><div className="card-body"><small>NOME DELL&apos;ASTA</small><h3>{auction.name}</h3>{auction.vehicle && <p className="current-vehicle">Lotto {auction.lotNumber}: <b>{auction.vehicle}</b></p>}<div className="auction-meta"><span>{auction.status === "waiting" && !isBetweenLots(auction) ? `Creata il ${auction.createdAt}` : `Base ${euros.format(auction.startPrice)}`}</span><strong>{auction.results.length} auto aggiudicate</strong></div>{isBetweenLots(auction) && <div className="card-winner">Ultimo lotto: <b>{auction.winner}</b></div>}</div><div className="card-footer simple-footer"><div><small>STATO</small><b>{auction.status === "live" ? euros.format(auction.currentPrice) : isBetweenLots(auction) ? "Pronta per la prossima" : auction.status === "closed" ? `${auction.results.length} lotti conclusi` : `${auction.participants.length} iscritti`}</b></div>{isAdmin ? (auction.status === "waiting" && !isBetweenLots(auction) ? <button onClick={() => setStartAuctionId(auction.id)}>PRIMA AUTO →</button> : isBetweenLots(auction) ? <button onClick={() => setStartAuctionId(auction.id)}>PROSSIMA →</button> : <button onClick={() => setFocusedId(auction.id)}>SEGUI →</button>) : (auction.status === "waiting" && !isBetweenLots(auction) ? (joined ? <button className="joined" onClick={() => setFocusedId(auction.id)}>ENTRA NELLA LOBBY →</button> : <button onClick={() => toggleParticipation(auction.id)}>PARTECIPA →</button>) : <button onClick={() => setFocusedId(auction.id)}>{auction.status === "live" ? "ENTRA NELLA LOBBY →" : isBetweenLots(auction) ? "TORNA NELLA LOBBY →" : "RISULTATI →"}</button>)}</div></article>; })}</section>
    {sellCarId && <div className="modal-backdrop" onMouseDown={() => setSellCarId(null)}><section className="modal compact-modal" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setSellCarId(null)}>×</button><div className="eyebrow"><i /> VENDITA AUTOMOBILE</div><h2>Quanto vuoi ricavare?</h2><p>La cifra verrà accreditata sul tuo saldo e l’auto uscirà dal garage.</p><form onSubmit={sellCar}><label>Prezzo di vendita (€)<input name="salePrice" type="number" min="1" step="50" placeholder="es. 45.000" autoFocus required /></label><button className="primary" type="submit">CONFERMA VENDITA <span>→</span></button></form></section></div>}
    {showCreate && <div className="modal-backdrop" onMouseDown={() => setShowCreate(false)}><section className="modal compact-modal" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setShowCreate(false)}>×</button><div className="eyebrow"><i /> NUOVA ASTA</div><h2>Crea un&apos;asta</h2><form onSubmit={addAuction}><label>Nome dell&apos;asta<input name="name" placeholder="es. Supercar d'estate" maxLength={60} autoFocus required /></label><button className="primary" type="submit">CREA ASTA <span>→</span></button></form></section></div>}
    {startAuctionId !== null && <div className="modal-backdrop" onMouseDown={() => setStartAuctionId(null)}><section className="modal compact-modal" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setStartAuctionId(null)}>×</button><div className="eyebrow"><i /> NUOVO LOTTO</div><h2>Inserisci l&apos;automobile</h2><p>Il prezzo base dovrebbe essere circa due terzi del valore stimato della vettura.</p><form onSubmit={startAuction}><label>Marca e modello<input name="vehicle" placeholder="es. Porsche 911 Carrera" maxLength={80} autoFocus required /></label><label>Prezzo iniziale (€)<input name="price" type="number" min="100" step="50" placeholder="es. 60.000" required /></label><button className="primary" type="submit">AVVIA LOTTO <span>●</span></button></form></section></div>}
  </main>;
}
