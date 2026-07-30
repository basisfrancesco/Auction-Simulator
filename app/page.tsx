"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type User = { name: string; role: "participant" | "admin" };
type Bid = { id: number; bidder: string; amount: number; at: number; bot: boolean };
type Bot = { name: string; budget: number; aggression: number };
type Auction = {
  id: number; name: string; createdAt: string; participants: string[]; accent: string;
  status: "waiting" | "live" | "closed"; startPrice: number; currentPrice: number;
  bids: Bid[]; endsAt: number; nextBotAt: number; targetBids: number; bots: Bot[]; winner: string;
};

const USERS: User[] = [
  { name: "Francesco Basis", role: "participant" }, { name: "Vittorio Esposito", role: "participant" },
  { name: "Carlo Esposito", role: "participant" }, { name: "Lorenzo Biava", role: "participant" },
  { name: "Admin", role: "admin" },
];
const BOT_NAMES = ["Marco Rinaldi", "Andrea Costa", "Giulia Ferri", "Luca Romano", "Davide Conti", "Elena Moretti", "Simone Gallo", "Matteo De Luca", "Sofia Ricci", "Alessandro Greco"];
const EMPTY_LIVE = { status: "waiting" as const, startPrice: 0, currentPrice: 0, bids: [] as Bid[], endsAt: 0, nextBotAt: 0, targetBids: 0, bots: [] as Bot[], winner: "" };
const INITIAL_AUCTIONS: Auction[] = [
  { id: 1, name: "Supercar d'estate", createdAt: "30 luglio 2026", participants: [], accent: "#d9ff43", ...EMPTY_LIVE },
  { id: 2, name: "Youngtimer italiane", createdAt: "29 luglio 2026", participants: [], accent: "#ff6b35", ...EMPTY_LIVE },
  { id: 3, name: "Sportive tedesche", createdAt: "28 luglio 2026", participants: [], accent: "#70d7ff", ...EMPTY_LIVE },
];
const euros = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const incrementFor = (price: number) => price < 1000 ? 25 : price < 5000 ? 50 : price < 20000 ? 100 : price < 50000 ? 250 : price < 100000 ? 500 : 1000;
const normalize = (raw: Partial<Auction> & { id: number; name?: string; make?: string; model?: string }): Auction => ({
  id: raw.id, name: raw.name || [raw.make, raw.model].filter(Boolean).join(" ") || "Asta senza nome",
  createdAt: raw.createdAt || "Creata in precedenza", participants: raw.participants || [], accent: raw.accent || "#d9ff43",
  status: raw.status || "waiting", startPrice: raw.startPrice || 0, currentPrice: raw.currentPrice || 0,
  bids: raw.bids || [], endsAt: raw.endsAt || 0, nextBotAt: raw.nextBotAt || 0, targetBids: raw.targetBids || 0,
  bots: raw.bots || [], winner: raw.winner || "",
});
function Mark() { return <div className="mark" aria-hidden="true"><span>AS</span></div>; }

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [selectedName, setSelectedName] = useState(USERS[0].name);
  const [auctions, setAuctions] = useState<Auction[]>(INITIAL_AUCTIONS);
  const [showCreate, setShowCreate] = useState(false);
  const [startAuctionId, setStartAuctionId] = useState<number | null>(null);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const persist = (items: Auction[]) => localStorage.setItem("auction-simulator-auctions", JSON.stringify(items));

  useEffect(() => {
    const saved = localStorage.getItem("auction-simulator-auctions");
    const savedUser = localStorage.getItem("auction-simulator-user");
    if (saved) setAuctions((JSON.parse(saved) as Array<Partial<Auction> & { id: number }>).map(normalize));
    if (savedUser) setUser(JSON.parse(savedUser));
    const sync = (event: StorageEvent) => { if (event.key === "auction-simulator-auctions" && event.newValue) setAuctions((JSON.parse(event.newValue) as Auction[]).map(normalize)); };
    window.addEventListener("storage", sync); return () => window.removeEventListener("storage", sync);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const tick = Date.now(); setNow(tick);
      setAuctions((current) => {
        let changed = false;
        const updated = current.map((auction) => {
          if (auction.status !== "live") return auction;
          if (tick >= auction.endsAt) {
            changed = true;
            return { ...auction, status: "closed" as const, winner: auction.bids[0]?.bidder || "Nessun offerente" };
          }
          if (tick < auction.nextBotAt || auction.bids.filter((bid) => bid.bot).length >= auction.targetBids) return auction;
          const step = incrementFor(auction.currentPrice);
          const lastBidder = auction.bids[0]?.bidder;
          const eligible = auction.bots.filter((bot) => bot.name !== lastBidder && bot.budget >= auction.currentPrice + step);
          if (!eligible.length) return { ...auction, nextBotAt: auction.endsAt + 1 };
          const bot = eligible[Math.floor(Math.random() * eligible.length)];
          const multiplier = Math.random() < bot.aggression * 0.18 ? (Math.random() < .75 ? 2 : 3) : 1;
          const amount = Math.min(bot.budget, auction.currentPrice + step * multiplier);
          const botBidCount = auction.bids.filter((bid) => bid.bot).length + 1;
          const progress = botBidCount / auction.targetBids;
          const delay = progress < .35 ? 500 + Math.random() * 900 : progress < .8 ? 900 + Math.random() * 1900 : 1800 + Math.random() * 3500;
          changed = true;
          return { ...auction, currentPrice: amount, endsAt: tick + 10000, nextBotAt: tick + delay, bids: [{ id: tick, bidder: bot.name, amount, at: tick, bot: true }, ...auction.bids] };
        });
        if (changed) persist(updated);
        return changed ? updated : current;
      });
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const save = (next: Auction[]) => { setAuctions(next); persist(next); };
  const enter = (event: FormEvent) => { event.preventDefault(); const next = USERS.find((entry) => entry.name === selectedName) ?? USERS[0]; localStorage.setItem("auction-simulator-user", JSON.stringify(next)); setUser(next); };
  const logout = () => { localStorage.removeItem("auction-simulator-user"); setUser(null); setFocusedId(null); };
  const addAuction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const next: Auction = { id: Date.now(), name: String(data.get("name")).trim(), createdAt: new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(new Date()), participants: [], accent: "#d9ff43", ...EMPTY_LIVE };
    save([next, ...auctions]); setShowCreate(false);
  };
  const toggleParticipation = (id: number) => { if (!user || user.role !== "participant") return; save(auctions.map((auction) => auction.id === id ? { ...auction, participants: auction.participants.includes(user.name) ? auction.participants.filter((name) => name !== user.name) : [...auction.participants, user.name] } : auction)); };
  const startAuction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (startAuctionId === null) return;
    const price = Number(new FormData(event.currentTarget).get("price")); const startedAt = Date.now();
    const bots = BOT_NAMES.slice().sort(() => Math.random() - .5).slice(0, 8).map((name, index) => ({ name, budget: Math.round((price * (1.35 + Math.random() * .95)) / 50) * 50, aggression: .25 + (index % 4) * .18 }));
    save(auctions.map((auction) => auction.id === startAuctionId ? { ...auction, status: "live", startPrice: price, currentPrice: price, bids: [], endsAt: startedAt + 10000, nextBotAt: startedAt + 800, targetBids: 46 + Math.floor(Math.random() * 9), bots, winner: "" } : auction));
    setFocusedId(startAuctionId); setStartAuctionId(null);
  };
  const placeBid = (auction: Auction) => {
    if (!user || user.role !== "participant" || auction.status !== "live" || !auction.participants.includes(user.name)) return;
    const amount = auction.currentPrice + incrementFor(auction.currentPrice); const time = Date.now();
    save(auctions.map((item) => item.id === auction.id ? { ...item, currentPrice: amount, endsAt: time + 10000, nextBotAt: Math.max(item.nextBotAt, time + 800), bids: [{ id: time, bidder: user.name, amount, at: time, bot: false }, ...item.bids] } : item));
  };

  const focused = useMemo(() => auctions.find((auction) => auction.id === focusedId) || auctions.find((auction) => auction.status === "live") || null, [auctions, focusedId]);
  if (!user) return <main className="login-shell"><div className="login-top"><Mark /><span>AUCTION<br />SIMULATOR</span></div><section className="login-card"><div className="eyebrow"><i /> ACCESSO RISERVATO</div><h1>La griglia<br />è pronta.</h1><p>Scegli il tuo nome per entrare nella tua area personale.</p><form onSubmit={enter}><label htmlFor="account">Profilo</label><div className="select-wrap"><select id="account" value={selectedName} onChange={(event) => setSelectedName(event.target.value)}>{USERS.map((entry) => <option key={entry.name}>{entry.name}</option>)}</select></div><button className="primary" type="submit">ACCEDI <span>→</span></button></form><div className="access-note"><span>●</span><div><b>Accesso demo</b><small>Nessuna password richiesta</small></div></div></section><aside className="login-visual" aria-hidden="true"><div className="speed-lines" /><div className="car-silhouette"><div className="roof" /><div className="body" /><div className="wheel w1" /><div className="wheel w2" /></div><div className="lot-number">LOT<br /><strong>001</strong></div></aside></main>;

  const isAdmin = user.role === "admin";
  return <main className="dashboard">
    <header><div className="brand"><Mark /><span>AUCTION<br />SIMULATOR</span></div><div className="profile"><div className="avatar">{user.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</div><div><b>{user.name}</b><small>{isAdmin ? "Amministratore" : "Partecipante"}</small></div><button onClick={logout} aria-label="Esci">↗</button></div></header>
    <section className="hero-row"><div><div className="eyebrow"><i /> {isAdmin ? "REGIA D'ASTA" : "SALA D'ASTA"}</div><h1>{isAdmin ? "Avvia l'asta." : <>Alza la<br /><em>paletta.</em></>}</h1><p>{isAdmin ? "Imposta il prezzo di partenza e osserva la competizione in tempo reale." : "Iscriviti, segui i rilanci e prova ad aggiudicarti l'asta."}</p></div><div className="stats"><div><strong>{auctions.filter((auction) => auction.status === "live").length}</strong><span>ASTE<br />LIVE</span></div><div><strong>{auctions.reduce((sum, auction) => sum + auction.bids.length, 0)}</strong><span>OFFERTE<br />TOTALI</span></div></div></section>
    {focused && <section className={`live-room ${focused.status}`}><div className="live-main"><div className="live-heading"><span className="live-badge">{focused.status === "live" ? "● LIVE" : focused.status === "closed" ? "CHIUSA" : "IN ATTESA"}</span><button onClick={() => setFocusedId(null)}>×</button></div><p>ASTA</p><h2>{focused.name}</h2>{focused.status !== "waiting" && <><div className="current-price"><small>OFFERTA ATTUALE</small><strong>{euros.format(focused.currentPrice)}</strong></div>{focused.status === "live" ? <div className="countdown"><span>CHIUSURA TRA</span><b>{Math.max(0, Math.ceil((focused.endsAt - now) / 1000))}</b><i style={{ width: `${Math.max(0, Math.min(100, (focused.endsAt - now) / 100))}%` }} /></div> : <div className="winner"><span>AGGIUDICATA A</span><strong>{focused.winner}</strong><small>{focused.bids.length} offerte ricevute</small></div>}</>}</div><aside className="bid-feed"><div className="feed-title"><b>Registro offerte</b><span>{focused.bids.length}/{focused.targetBids || "—"}</span></div><div className="feed-list">{focused.bids.length === 0 ? <p>In attesa della prima offerta…</p> : focused.bids.slice(0, 12).map((bid, index) => <div className={index === 0 ? "top-bid" : ""} key={bid.id}><span className="bid-avatar">{bid.bot ? "BOT" : bid.bidder.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><span><b>{bid.bidder}</b><small>{bid.bot ? "Offerente automatico" : "Partecipante"}</small></span><strong>{euros.format(bid.amount)}</strong></div>)}</div>{!isAdmin && focused.status === "live" && <div className="bid-action">{focused.participants.includes(user.name) ? <button onClick={() => placeBid(focused)}>OFFRI {euros.format(focused.currentPrice + incrementFor(focused.currentPrice))} <span>↑</span></button> : <button onClick={() => toggleParticipation(focused.id)}>ISCRIVITI PER OFFRIRE</button>}<small>Ogni offerta riporta il timer a 10 secondi</small></div>}</aside></section>}
    <section className="content-head"><div><span className="section-number">01</span><h2>Tutte le aste</h2></div>{isAdmin && <button className="primary compact" onClick={() => setShowCreate(true)}>+ NUOVA ASTA</button>}</section>
    <section className="auction-grid">{auctions.map((auction, index) => { const joined = auction.participants.includes(user.name); return <article className="auction-card simple-auction" key={auction.id} style={{ "--accent": auction.accent } as React.CSSProperties}><div className="card-top"><span>ASTA {String(index + 1).padStart(3, "0")}</span><span className={`status-${auction.status}`}>{auction.status === "live" ? "● LIVE" : auction.status === "closed" ? "CHIUSA" : "DA AVVIARE"}</span></div><div className="auction-monogram" aria-hidden="true"><span>{auction.name.charAt(0).toUpperCase()}</span><i>{String(index + 1).padStart(2, "0")}</i></div><div className="card-body"><small>NOME DELL&apos;ASTA</small><h3>{auction.name}</h3><div className="auction-meta"><span>{auction.status === "waiting" ? `Creata il ${auction.createdAt}` : `Base ${euros.format(auction.startPrice)}`}</span><strong>{auction.bids.length} offerte</strong></div>{auction.status === "closed" && <div className="card-winner">Vincitore: <b>{auction.winner}</b></div>}</div><div className="card-footer simple-footer"><div><small>STATO</small><b>{auction.status === "live" ? euros.format(auction.currentPrice) : auction.status === "closed" ? "Aggiudicata" : `${auction.participants.length} iscritti`}</b></div>{isAdmin ? (auction.status === "waiting" ? <button onClick={() => setStartAuctionId(auction.id)}>AVVIA →</button> : <button onClick={() => setFocusedId(auction.id)}>SEGUI →</button>) : (auction.status === "waiting" ? <button className={joined ? "joined" : ""} onClick={() => toggleParticipation(auction.id)}>{joined ? "ISCRITTO ✓" : "PARTECIPA →"}</button> : <button onClick={() => setFocusedId(auction.id)}>{auction.status === "live" ? "ENTRA →" : "RISULTATO →"}</button>)}</div></article>; })}</section>
    {showCreate && <div className="modal-backdrop" onMouseDown={() => setShowCreate(false)}><section className="modal compact-modal" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setShowCreate(false)}>×</button><div className="eyebrow"><i /> NUOVA ASTA</div><h2>Crea un&apos;asta</h2><form onSubmit={addAuction}><label>Nome dell&apos;asta<input name="name" placeholder="es. Supercar d'estate" maxLength={60} autoFocus required /></label><button className="primary" type="submit">CREA ASTA <span>→</span></button></form></section></div>}
    {startAuctionId !== null && <div className="modal-backdrop" onMouseDown={() => setStartAuctionId(null)}><section className="modal compact-modal" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setStartAuctionId(null)}>×</button><div className="eyebrow"><i /> AVVIO ASTA</div><h2>Prezzo di partenza</h2><p>All&apos;avvio entreranno in gara otto offerenti automatici con strategie e budget differenti.</p><form onSubmit={startAuction}><label>Prezzo iniziale (€)<input name="price" type="number" min="100" step="50" placeholder="es. 25.000" autoFocus required /></label><button className="primary" type="submit">AVVIA ORA <span>●</span></button></form></section></div>}
  </main>;
}
