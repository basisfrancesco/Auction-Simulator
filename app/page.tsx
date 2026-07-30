"use client";

import { FormEvent, useEffect, useState } from "react";

type User = { name: string; role: "participant" | "admin" };
type Auction = { id: number; name: string; createdAt: string; participants: string[]; accent: string };

const USERS: User[] = [
  { name: "Francesco Basis", role: "participant" },
  { name: "Vittorio Esposito", role: "participant" },
  { name: "Carlo Esposito", role: "participant" },
  { name: "Lorenzo Biava", role: "participant" },
  { name: "Admin", role: "admin" },
];

const INITIAL_AUCTIONS: Auction[] = [
  { id: 1, name: "Supercar d'estate", createdAt: "30 luglio 2026", participants: [], accent: "#d9ff43" },
  { id: 2, name: "Youngtimer italiane", createdAt: "29 luglio 2026", participants: [], accent: "#ff6b35" },
  { id: 3, name: "Sportive tedesche", createdAt: "28 luglio 2026", participants: [], accent: "#70d7ff" },
];

function Mark() { return <div className="mark" aria-hidden="true"><span>AS</span></div>; }

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [selectedName, setSelectedName] = useState(USERS[0].name);
  const [auctions, setAuctions] = useState<Auction[]>(INITIAL_AUCTIONS);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const savedAuctions = localStorage.getItem("auction-simulator-auctions");
    const savedUser = localStorage.getItem("auction-simulator-user");
    if (savedAuctions) {
      const parsed = JSON.parse(savedAuctions) as Array<Auction & { make?: string; model?: string }>;
      setAuctions(parsed.map((auction) => ({
        id: auction.id,
        name: auction.name || [auction.make, auction.model].filter(Boolean).join(" ") || "Asta senza nome",
        createdAt: auction.createdAt || "Creata in precedenza",
        participants: auction.participants || [],
        accent: auction.accent || "#d9ff43",
      })));
    }
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  const enter = (event: FormEvent) => {
    event.preventDefault();
    const next = USERS.find((entry) => entry.name === selectedName) ?? USERS[0];
    localStorage.setItem("auction-simulator-user", JSON.stringify(next));
    setUser(next);
  };

  const logout = () => {
    localStorage.removeItem("auction-simulator-user");
    setUser(null);
    setShowForm(false);
  };

  const saveAuctions = (updated: Auction[]) => {
    setAuctions(updated);
    localStorage.setItem("auction-simulator-auctions", JSON.stringify(updated));
  };

  const addAuction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next: Auction = {
      id: Date.now(),
      name: String(data.get("name")).trim(),
      createdAt: new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(new Date()),
      participants: [],
      accent: "#d9ff43",
    };
    saveAuctions([next, ...auctions]);
    setShowForm(false);
  };

  const toggleParticipation = (auctionId: number) => {
    if (!user || user.role !== "participant") return;
    saveAuctions(auctions.map((auction) => auction.id === auctionId ? {
      ...auction,
      participants: auction.participants.includes(user.name)
        ? auction.participants.filter((name) => name !== user.name)
        : [...auction.participants, user.name],
    } : auction));
  };

  if (!user) return (
    <main className="login-shell">
      <div className="login-top"><Mark /><span>AUCTION<br />SIMULATOR</span></div>
      <section className="login-card">
        <div className="eyebrow"><i /> ACCESSO RISERVATO</div>
        <h1>La griglia<br />è pronta.</h1>
        <p>Scegli il tuo nome per entrare nella tua area personale.</p>
        <form onSubmit={enter}>
          <label htmlFor="account">Profilo</label>
          <div className="select-wrap"><select id="account" value={selectedName} onChange={(e) => setSelectedName(e.target.value)}>{USERS.map((entry) => <option key={entry.name}>{entry.name}</option>)}</select></div>
          <button className="primary" type="submit">ACCEDI <span>→</span></button>
        </form>
        <div className="access-note"><span>●</span><div><b>Accesso demo</b><small>Nessuna password richiesta</small></div></div>
      </section>
      <aside className="login-visual" aria-hidden="true"><div className="speed-lines" /><div className="car-silhouette"><div className="roof" /><div className="body" /><div className="wheel w1" /><div className="wheel w2" /></div><div className="lot-number">LOT<br /><strong>001</strong></div><p>CURATED CARS<br />FAIR BIDDING<br />PURE ADRENALINE</p></aside>
    </main>
  );

  const isAdmin = user.role === "admin";
  return (
    <main className="dashboard">
      <header>
        <div className="brand"><Mark /><span>AUCTION<br />SIMULATOR</span></div>
        <div className="profile"><div className="avatar">{user.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</div><div><b>{user.name}</b><small>{isAdmin ? "Amministratore" : "Partecipante"}</small></div><button onClick={logout} aria-label="Esci">↗</button></div>
      </header>
      <section className="hero-row">
        <div><div className="eyebrow"><i /> {isAdmin ? "AREA AMMINISTRATORE" : "AREA PARTECIPANTE"}</div><h1>{isAdmin ? "Crea le aste." : <>Scegli la tua<br /><em>prossima asta.</em></>}</h1><p>{isAdmin ? "Dai un nome a una nuova asta e pubblicala per tutti i partecipanti." : "Consulta le aste disponibili e conferma la tua partecipazione con un clic."}</p></div>
        <div className="stats"><div><strong>{auctions.length}</strong><span>ASTE<br />APERTE</span></div><div><strong>4</strong><span>PARTECIPANTI<br />ABILITATI</span></div></div>
      </section>
      <section className="content-head"><div><span className="section-number">01</span><h2>{isAdmin ? "Aste create" : "Aste disponibili"}</h2></div>{isAdmin && <button className="primary compact" onClick={() => setShowForm(true)}>+ NUOVA ASTA</button>}</section>
      <section className="auction-grid">
        {auctions.map((auction, index) => {
          const joined = auction.participants.includes(user.name);
          return <article className="auction-card simple-auction" key={auction.id} style={{ "--accent": auction.accent } as React.CSSProperties}>
            <div className="card-top"><span>ASTA {String(index + 1).padStart(3, "0")}</span><span className="live"><i /> APERTA</span></div>
            <div className="auction-monogram" aria-hidden="true"><span>{auction.name.charAt(0).toUpperCase()}</span><i>{String(index + 1).padStart(2, "0")}</i></div>
            <div className="card-body"><small>NOME DELL&apos;ASTA</small><h3>{auction.name}</h3><div className="auction-meta"><span>Creata il {auction.createdAt}</span><strong>{auction.participants.length} {auction.participants.length === 1 ? "partecipante" : "partecipanti"}</strong></div>{isAdmin && auction.participants.length > 0 && <div className="participant-list">{auction.participants.map((name) => <span key={name}>{name}</span>)}</div>}</div>
            <div className="card-footer simple-footer"><div><small>STATO</small><b>Iscrizioni aperte</b></div>{!isAdmin && <button className={joined ? "joined" : ""} onClick={() => toggleParticipation(auction.id)}>{joined ? "PARTECIPO ✓" : "PARTECIPA →"}</button>}</div>
          </article>;
        })}
      </section>
      {showForm && <div className="modal-backdrop" onMouseDown={() => setShowForm(false)}><section className="modal compact-modal" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setShowForm(false)} aria-label="Chiudi">×</button><div className="eyebrow"><i /> NUOVA ASTA</div><h2>Crea un&apos;asta</h2><p>Scegli un nome chiaro: sarà subito visibile ai quattro partecipanti.</p><form onSubmit={addAuction}><label>Nome dell&apos;asta<input name="name" placeholder="es. Supercar d'estate" maxLength={60} autoFocus required /></label><button className="primary" type="submit">CREA ASTA <span>→</span></button></form></section></div>}
    </main>
  );
}
