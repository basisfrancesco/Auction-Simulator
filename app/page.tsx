"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";

type User = { name: string; role: "participant" | "admin" };
type Bid = { id: string; bidder: string; amount: number; at: number; bot: boolean };
type Bot = { name: string; budget: number; aggression: number };
type LotResult = { lotNumber: number; vehicle: string; winner: string; finalPrice: number; bidCount: number };
type Auction = {
  id: string; name: string; createdAt: string; participants: string[]; accent: string;
  status: "waiting" | "live" | "between" | "closed"; startPrice: number; currentPrice: number;
  bids: Bid[]; endsAt: number; nextBotAt: number; targetBids: number; bots: Bot[]; winner: string;
  lotNumber: number; vehicle: string; results: LotResult[];
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
function Mark() { return <div className="mark" aria-hidden="true"><span>AS</span></div>; }

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [selectedName, setSelectedName] = useState(USERS[0].name);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [connectionError, setConnectionError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [startAuctionId, setStartAuctionId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const auctionsRef = useRef<Auction[]>([]);
  const engineBusy = useRef(false);
  const bidBusy = useRef(false);

  useEffect(() => { auctionsRef.current = auctions; }, [auctions]);

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
      const config = row.bot_config && !Array.isArray(row.bot_config) ? row.bot_config as { bots?: Bot[]; nextBotAt?: number; vehicle?: string; lotNumber?: number; results?: LotResult[] } : { bots: row.bot_config as Bot[] };
      const lotNumber = config.lotNumber || 1;
      return {
        id: String(row.id), name: row.name, createdAt: new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(new Date(row.created_at)),
        participants: participants.filter((item) => item.auction_id === row.id).map((item) => item.user_name), accent: colors[index % colors.length],
        status: row.status, startPrice: Number(row.start_price), currentPrice: Number(row.current_price),
        bids: bids.filter((bid) => bid.auction_id === row.id && Number(bid.lot_number || 1) === lotNumber).map((bid) => ({ id: String(bid.id), bidder: bid.bidder_name, amount: Number(bid.amount), at: new Date(bid.created_at).getTime(), bot: bid.is_bot })),
        endsAt: row.ends_at ? new Date(row.ends_at).getTime() : 0, nextBotAt: config.nextBotAt || 0,
        targetBids: row.target_bids || 50, bots: config.bots || [], winner: row.winner || "",
        lotNumber, vehicle: config.vehicle || "", results: config.results || [],
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

  useEffect(() => {
    const advance = async () => {
      const tick = Date.now(); setNow(tick);
      if (user?.role !== "admin" || engineBusy.current) return;
      const auction = auctionsRef.current.find((item) => item.status === "live"); if (!auction) return;
      engineBusy.current = true;
      try {
        if (tick >= auction.endsAt) {
          const winner = auction.bids[0]?.bidder || "Nessun offerente";
          const result: LotResult = { lotNumber: auction.lotNumber, vehicle: auction.vehicle, winner, finalPrice: auction.currentPrice, bidCount: auction.bids.length };
          await supabase.from("auctions").update({ status: "between", winner, bot_config: { bots: [], nextBotAt: 0, vehicle: auction.vehicle, lotNumber: auction.lotNumber, results: [...auction.results, result] } }).eq("id", auction.id);
        } else if (tick >= auction.nextBotAt && auction.bids.filter((bid) => bid.bot).length < auction.targetBids) {
          const step = incrementFor(auction.currentPrice, auction.startPrice); const lastBidder = auction.bids[0]?.bidder;
          const eligible = auction.bots.filter((bot) => bot.name !== lastBidder && bot.budget >= auction.currentPrice + step && Math.random() < (.5 + bot.aggression * .45));
          if (eligible.length) {
            const bot = eligible[Math.floor(Math.random() * eligible.length)]; const multiplier = Math.random() < bot.aggression * .22 ? (Math.random() < .78 ? 2 : 3) : 1;
            const amount = Math.min(bot.budget, auction.currentPrice + step * multiplier); const progress = (auction.bids.filter((bid) => bid.bot).length + 1) / auction.targetBids;
            const delay = progress < .3 ? 650 + Math.random() * 900 : progress < .75 ? 1000 + Math.random() * 1900 : 1800 + Math.random() * 4200;
            const endsAt = tick + 10000; const nextBotAt = tick + delay;
            await supabase.from("bids").insert({ auction_id: auction.id, bidder_name: bot.name, amount, is_bot: true, lot_number: auction.lotNumber });
            await supabase.from("auctions").update({ current_price: amount, ends_at: new Date(endsAt).toISOString(), bot_config: { bots: auction.bots, nextBotAt, vehicle: auction.vehicle, lotNumber: auction.lotNumber, results: auction.results } }).eq("id", auction.id);
          }
        }
      } finally { engineBusy.current = false; }
    };
    const timer = window.setInterval(() => void advance(), 250);
    return () => window.clearInterval(timer);
  }, [user]);

  const enter = async (event: FormEvent) => { event.preventDefault(); const next = USERS.find((entry) => entry.name === selectedName) ?? USERS[0]; const { data } = await supabase.auth.getSession(); if (!data.session) { const result = await supabase.auth.signInAnonymously(); if (result.error) { setConnectionError(result.error.message); return; } } localStorage.setItem("auction-simulator-user", JSON.stringify(next)); setUser(next); await loadAuctions(); };
  const logout = () => { localStorage.removeItem("auction-simulator-user"); setUser(null); setFocusedId(null); };
  const addAuction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name")).trim();
    void supabase.from("auctions").insert({ name }).then(({ error }) => { if (error) setConnectionError(error.message); else { setShowCreate(false); void loadAuctions(); } });
  };
  const toggleParticipation = async (id: string) => { if (!user || user.role !== "participant") return; const { data } = await supabase.auth.getUser(); if (!data.user) return; const auction = auctions.find((item) => item.id === id); if (auction?.participants.includes(user.name)) await supabase.from("auction_participants").delete().eq("auction_id", id).eq("user_id", data.user.id); else await supabase.from("auction_participants").insert({ auction_id: id, user_id: data.user.id, user_name: user.name }); await loadAuctions(); };
  const startAuction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (startAuctionId === null) return;
    const form = new FormData(event.currentTarget); const price = Number(form.get("price")); const vehicle = String(form.get("vehicle")).trim(); const startedAt = Date.now();
    const current = auctions.find((item) => item.id === startAuctionId); const lotNumber = current?.status === "between" ? current.lotNumber + 1 : 1; const results = current?.results || [];
    const estimatedValue = price * 1.5;
    const bots = BOT_NAMES.slice().sort(() => Math.random() - .5).slice(0, 8).map((name, index) => ({ name, budget: Math.round((estimatedValue * (.82 + Math.random() * .48)) / 100) * 100, aggression: .25 + (index % 4) * .18 }));
    const targetBids = 46 + Math.floor(Math.random() * 9); await supabase.from("auctions").update({ status: "live", start_price: price, current_price: price, ends_at: new Date(startedAt + 10000).toISOString(), winner: null, target_bids: targetBids, bot_config: { bots, nextBotAt: startedAt + 800, vehicle, lotNumber, results } }).eq("id", startAuctionId);
    setFocusedId(startAuctionId); setStartAuctionId(null);
  };
  const finishAuction = async (auction: Auction) => {
    await supabase.from("auctions").update({ status: "closed", bot_config: { bots: [], nextBotAt: 0, vehicle: auction.vehicle, lotNumber: auction.lotNumber, results: auction.results } }).eq("id", auction.id);
    await loadAuctions();
  };
  const placeBid = async (auction: Auction) => {
    if (!user || user.role !== "participant" || auction.status !== "live" || !auction.participants.includes(user.name) || bidBusy.current || auction.bids[0]?.bidder === user.name) return;
    bidBusy.current = true;
    try {
      const [{ data }, latestResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("bids").select("bidder_name,amount").eq("auction_id", auction.id).eq("lot_number", auction.lotNumber).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (!data.user || latestResult.data?.bidder_name === user.name) return;
      const currentPrice = Math.max(auction.currentPrice, Number(latestResult.data?.amount || 0));
      const amount = currentPrice + incrementFor(currentPrice, auction.startPrice); const time = Date.now();
      await supabase.from("bids").insert({ auction_id: auction.id, bidder_id: data.user.id, bidder_name: user.name, amount, is_bot: false, lot_number: auction.lotNumber });
      await supabase.from("auctions").update({ current_price: amount, ends_at: new Date(time + 10000).toISOString(), bot_config: { bots: auction.bots, nextBotAt: Math.max(auction.nextBotAt, time + 800), vehicle: auction.vehicle, lotNumber: auction.lotNumber, results: auction.results } }).eq("id", auction.id);
      await loadAuctions();
    } finally { bidBusy.current = false; }
  };

  const focused = useMemo(() => auctions.find((auction) => auction.id === focusedId) || auctions.find((auction) => auction.status === "live") || null, [auctions, focusedId]);
  if (!user) return <main className="login-shell"><div className="login-top"><Mark /><span>AUCTION<br />SIMULATOR</span></div><section className="login-card"><div className="eyebrow"><i /> ACCESSO RISERVATO</div><h1>La griglia<br />è pronta.</h1><p>Scegli il tuo nome per entrare nella tua area personale.</p><form onSubmit={enter}><label htmlFor="account">Profilo</label><div className="select-wrap"><select id="account" value={selectedName} onChange={(event) => setSelectedName(event.target.value)}>{USERS.map((entry) => <option key={entry.name}>{entry.name}</option>)}</select></div><button className="primary" type="submit">ACCEDI <span>→</span></button></form>{connectionError && <div className="connection-error">{connectionError}</div>}<div className="access-note"><span>●</span><div><b>Supabase Realtime</b><small>Dati condivisi tra tutti i dispositivi</small></div></div></section><aside className="login-visual" aria-hidden="true"><div className="speed-lines" /><div className="car-silhouette"><div className="roof" /><div className="body" /><div className="wheel w1" /><div className="wheel w2" /></div><div className="lot-number">LOT<br /><strong>001</strong></div></aside></main>;

  const isAdmin = user.role === "admin";
  return <main className="dashboard">
    <header><div className="brand"><Mark /><span>AUCTION<br />SIMULATOR</span></div><div className="profile"><div className="avatar">{user.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</div><div><b>{user.name}</b><small>{isAdmin ? "Amministratore" : "Partecipante"}</small></div><button onClick={logout} aria-label="Esci">↗</button></div></header>
    {connectionError && <div className="connection-error dashboard-error">{connectionError}</div>}
    <section className="hero-row"><div><div className="eyebrow"><i /> {isAdmin ? "REGIA D'ASTA" : "SALA D'ASTA"}</div><h1>{isAdmin ? "Avvia l'asta." : <>Alza la<br /><em>paletta.</em></>}</h1><p>{isAdmin ? "Inserisci una vettura alla volta, imposta la base e osserva la competizione in tempo reale." : "Iscriviti una volta e partecipa a tutti i lotti automobilistici dell'asta."}</p></div><div className="stats"><div><strong>{auctions.filter((auction) => auction.status === "live").length}</strong><span>ASTE<br />LIVE</span></div><div><strong>{auctions.reduce((sum, auction) => sum + auction.bids.length + auction.results.reduce((lotSum, result) => lotSum + result.bidCount, 0), 0)}</strong><span>OFFERTE<br />TOTALI</span></div></div></section>
    {focused && <section className={`live-room ${focused.status}`}><div className="live-main"><div className="live-heading"><span className="live-badge">{focused.status === "live" ? "● LIVE" : focused.status === "between" ? "LOTTO CONCLUSO" : focused.status === "closed" ? "ASTA CHIUSA" : "IN ATTESA"}</span><button onClick={() => setFocusedId(null)}>×</button></div><p>LOTTO {String(focused.lotNumber).padStart(2, "0")} · {focused.name}</p><h2>{focused.vehicle || "Prima vettura da inserire"}</h2>{focused.status !== "waiting" && <><div className="current-price"><small>{focused.status === "live" ? "OFFERTA ATTUALE" : "PREZZO DI AGGIUDICAZIONE"}</small><strong>{euros.format(focused.currentPrice)}</strong></div>{focused.status === "live" ? <div className="countdown"><span>CHIUSURA TRA</span><b>{Math.max(0, Math.ceil((focused.endsAt - now) / 1000))}</b><i style={{ width: `${Math.max(0, Math.min(100, (focused.endsAt - now) / 100))}%` }} /></div> : <div className="winner"><span>AGGIUDICATA A</span><strong>{focused.winner}</strong><small>{focused.bids.length} offerte ricevute</small></div>}</>}{isAdmin && focused.status === "between" && <div className="next-lot-actions"><button onClick={() => setStartAuctionId(focused.id)}>PROSSIMA AUTO →</button><button onClick={() => void finishAuction(focused)}>TERMINA ASTA</button></div>}</div><aside className="bid-feed"><div className="feed-title"><b>Registro offerte · lotto {focused.lotNumber}</b><span>{focused.bids.length}/{focused.targetBids || "—"}</span></div><div className="feed-list">{focused.bids.length === 0 ? <p>In attesa della prima offerta…</p> : focused.bids.slice(0, 12).map((bid, index) => <div className={index === 0 ? "top-bid" : ""} key={bid.id}><span className="bid-avatar">{bid.bot ? "BOT" : bid.bidder.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><span><b>{bid.bidder}</b><small>{bid.bot ? "Offerente automatico" : "Partecipante"}</small></span><strong>{euros.format(bid.amount)}</strong></div>)}</div>{!isAdmin && focused.status === "live" && <div className="bid-action">{focused.participants.includes(user.name) ? <button onClick={() => placeBid(focused)}>OFFRI {euros.format(focused.currentPrice + incrementFor(focused.currentPrice, focused.startPrice))} <span>↑</span></button> : <button onClick={() => toggleParticipation(focused.id)}>ISCRIVITI PER OFFRIRE</button>}<small>Ogni offerta riporta il timer a 10 secondi</small></div>}{focused.results.length > 0 && <div className="lot-history"><b>Auto aggiudicate</b>{focused.results.slice().reverse().map((result) => <div key={result.lotNumber}><span>{result.lotNumber}. {result.vehicle}</span><strong>{result.winner} · {euros.format(result.finalPrice)}</strong></div>)}</div>}</aside></section>}
    <section className="content-head"><div><span className="section-number">01</span><h2>Tutte le aste</h2></div>{isAdmin && <button className="primary compact" onClick={() => setShowCreate(true)}>+ NUOVA ASTA</button>}</section>
    <section className="auction-grid">{auctions.length === 0 && !connectionError ? <p className="empty-state">Nessuna asta presente. L&apos;admin può creare la prima.</p> : auctions.map((auction, index) => { const joined = auction.participants.includes(user.name); return <article className="auction-card simple-auction" key={auction.id} style={{ "--accent": auction.accent } as React.CSSProperties}><div className="card-top"><span>ASTA {String(index + 1).padStart(3, "0")}</span><span className={`status-${auction.status}`}>{auction.status === "live" ? "● LIVE" : auction.status === "between" ? "LOTTO CONCLUSO" : auction.status === "closed" ? "CHIUSA" : "DA AVVIARE"}</span></div><div className="auction-monogram" aria-hidden="true"><span>{auction.name.charAt(0).toUpperCase()}</span><i>{String(index + 1).padStart(2, "0")}</i></div><div className="card-body"><small>NOME DELL&apos;ASTA</small><h3>{auction.name}</h3>{auction.vehicle && <p className="current-vehicle">Lotto {auction.lotNumber}: <b>{auction.vehicle}</b></p>}<div className="auction-meta"><span>{auction.status === "waiting" ? `Creata il ${auction.createdAt}` : `Base ${euros.format(auction.startPrice)}`}</span><strong>{auction.results.length} auto aggiudicate</strong></div>{auction.status === "between" && <div className="card-winner">Ultimo lotto: <b>{auction.winner}</b></div>}</div><div className="card-footer simple-footer"><div><small>STATO</small><b>{auction.status === "live" ? euros.format(auction.currentPrice) : auction.status === "between" ? "Pronta per la prossima" : auction.status === "closed" ? `${auction.results.length} lotti conclusi` : `${auction.participants.length} iscritti`}</b></div>{isAdmin ? (auction.status === "waiting" ? <button onClick={() => setStartAuctionId(auction.id)}>PRIMA AUTO →</button> : auction.status === "between" ? <button onClick={() => setStartAuctionId(auction.id)}>PROSSIMA →</button> : <button onClick={() => setFocusedId(auction.id)}>SEGUI →</button>) : (auction.status === "waiting" ? <button className={joined ? "joined" : ""} onClick={() => toggleParticipation(auction.id)}>{joined ? "ISCRITTO ✓" : "PARTECIPA →"}</button> : <button onClick={() => setFocusedId(auction.id)}>{auction.status === "live" ? "ENTRA →" : "RISULTATI →"}</button>)}</div></article>; })}</section>
    {showCreate && <div className="modal-backdrop" onMouseDown={() => setShowCreate(false)}><section className="modal compact-modal" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setShowCreate(false)}>×</button><div className="eyebrow"><i /> NUOVA ASTA</div><h2>Crea un&apos;asta</h2><form onSubmit={addAuction}><label>Nome dell&apos;asta<input name="name" placeholder="es. Supercar d'estate" maxLength={60} autoFocus required /></label><button className="primary" type="submit">CREA ASTA <span>→</span></button></form></section></div>}
    {startAuctionId !== null && <div className="modal-backdrop" onMouseDown={() => setStartAuctionId(null)}><section className="modal compact-modal" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setStartAuctionId(null)}>×</button><div className="eyebrow"><i /> NUOVO LOTTO</div><h2>Inserisci l&apos;automobile</h2><p>Il prezzo base dovrebbe essere circa due terzi del valore stimato della vettura.</p><form onSubmit={startAuction}><label>Marca e modello<input name="vehicle" placeholder="es. Porsche 911 Carrera" maxLength={80} autoFocus required /></label><label>Prezzo iniziale (€)<input name="price" type="number" min="100" step="50" placeholder="es. 60.000" required /></label><button className="primary" type="submit">AVVIA LOTTO <span>●</span></button></form></section></div>}
  </main>;
}
