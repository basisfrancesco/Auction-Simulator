"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type User = { name: string; role: "participant" | "admin" };
type Auction = {
  id: number;
  make: string;
  model: string;
  year: string;
  mileage: string;
  fuel: string;
  transmission: string;
  price: number;
  date: string;
  time: string;
  accent: string;
};

const USERS: User[] = [
  { name: "Francesco Basis", role: "participant" },
  { name: "Vittorio Esposito", role: "participant" },
  { name: "Carlo Esposito", role: "participant" },
  { name: "Lorenzo Biava", role: "participant" },
  { name: "Admin", role: "admin" },
];

const INITIAL_AUCTIONS: Auction[] = [
  { id: 1, make: "Porsche", model: "911 Carrera 4S", year: "2021", mileage: "18.400", fuel: "Benzina", transmission: "PDK", price: 112000, date: "06 agosto", time: "18:30", accent: "#d9ff43" },
  { id: 2, make: "BMW", model: "M3 Competition", year: "2022", mileage: "24.100", fuel: "Benzina", transmission: "Automatico", price: 64500, date: "08 agosto", time: "20:00", accent: "#ff6b35" },
  { id: 3, make: "Mercedes-AMG", model: "GT 53 4MATIC+", year: "2020", mileage: "31.800", fuel: "Benzina", transmission: "Automatico", price: 78900, date: "12 agosto", time: "19:00", accent: "#70d7ff" },
];

const money = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function Mark() {
  return <div className="mark" aria-hidden="true"><span>AS</span></div>;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [selectedName, setSelectedName] = useState(USERS[0].name);
  const [auctions, setAuctions] = useState<Auction[]>(INITIAL_AUCTIONS);
  const [joined, setJoined] = useState<number[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const savedAuctions = localStorage.getItem("auction-simulator-auctions");
    const savedUser = localStorage.getItem("auction-simulator-user");
    if (savedAuctions) setAuctions(JSON.parse(savedAuctions));
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

  const addAuction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next: Auction = {
      id: Date.now(),
      make: String(data.get("make")), model: String(data.get("model")),
      year: String(data.get("year")), mileage: String(data.get("mileage")),
      fuel: String(data.get("fuel")), transmission: String(data.get("transmission")),
      price: Number(data.get("price")), date: String(data.get("date")),
      time: String(data.get("time")), accent: "#d9ff43",
    };
    const updated = [next, ...auctions];
    setAuctions(updated);
    localStorage.setItem("auction-simulator-auctions", JSON.stringify(updated));
    setShowForm(false);
  };

  const joinedSet = useMemo(() => new Set(joined), [joined]);

  if (!user) {
    return (
      <main className="login-shell">
        <div className="login-top"><Mark /><span>AUCTION<br />SIMULATOR</span></div>
        <section className="login-card">
          <div className="eyebrow"><i /> ACCESSO RISERVATO</div>
          <h1>La griglia<br />è pronta.</h1>
          <p>Scegli il tuo profilo per entrare nell&apos;area aste automobilistiche.</p>
          <form onSubmit={enter}>
            <label htmlFor="account">Profilo</label>
            <div className="select-wrap">
              <select id="account" value={selectedName} onChange={(e) => setSelectedName(e.target.value)}>
                {USERS.map((entry) => <option key={entry.name}>{entry.name}</option>)}
              </select>
            </div>
            <button className="primary" type="submit">ENTRA NEL PADDOCK <span>→</span></button>
          </form>
          <div className="access-note"><span>●</span><div><b>Accesso demo</b><small>Nessuna password richiesta</small></div></div>
        </section>
        <aside className="login-visual" aria-hidden="true">
          <div className="speed-lines" />
          <div className="car-silhouette"><div className="roof" /><div className="body" /><div className="wheel w1" /><div className="wheel w2" /></div>
          <div className="lot-number">LOT<br /><strong>001</strong></div>
          <p>CURATED CARS<br />FAIR BIDDING<br />PURE ADRENALINE</p>
        </aside>
      </main>
    );
  }

  const isAdmin = user.role === "admin";
  return (
    <main className="dashboard">
      <header>
        <div className="brand"><Mark /><span>AUCTION<br />SIMULATOR</span></div>
        <div className="profile"><div className="avatar">{user.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}</div><div><b>{user.name}</b><small>{isAdmin ? "Amministratore" : "Partecipante"}</small></div><button onClick={logout} aria-label="Esci">↗</button></div>
      </header>

      <section className="hero-row">
        <div><div className="eyebrow"><i /> {isAdmin ? "CABINA DI REGIA" : "PROSSIME PARTENZE"}</div><h1>{isAdmin ? "Gestisci le aste." : <>Pronto a<br /><em>rilanciare?</em></>}</h1><p>{isAdmin ? "Crea e controlla gli eventi disponibili per i partecipanti." : "Scopri le vetture selezionate e prenota il tuo posto in asta."}</p></div>
        <div className="stats"><div><strong>{auctions.length}</strong><span>ASTE<br />APERTE</span></div><div><strong>4</strong><span>PARTECIPANTI<br />ABILITATI</span></div></div>
      </section>

      <section className="content-head">
        <div><span className="section-number">01</span><h2>{isAdmin ? "Aste pubblicate" : "Aste disponibili"}</h2></div>
        {isAdmin && <button className="primary compact" onClick={() => setShowForm(true)}>+ NUOVA ASTA</button>}
      </section>

      <section className="auction-grid">
        {auctions.map((auction, index) => (
          <article className="auction-card" key={auction.id} style={{ "--accent": auction.accent } as React.CSSProperties}>
            <div className="card-top"><span>LOT {String(index + 1).padStart(3, "0")}</span><span className="live"><i /> APERTA</span></div>
            <div className="car-art" aria-hidden="true"><div className="mini-car"><div className="mini-roof" /><div className="mini-body" /><div className="mini-wheel mw1" /><div className="mini-wheel mw2" /></div><span>{auction.make.slice(0, 1)}</span></div>
            <div className="card-body"><small>{auction.make.toUpperCase()}</small><h3>{auction.model}</h3><div className="specs"><span>{auction.year}</span><span>{auction.mileage} km</span><span>{auction.fuel}</span><span>{auction.transmission}</span></div><div className="price"><span>BASE D&apos;ASTA</span><strong>{money.format(auction.price)}</strong></div></div>
            <div className="card-footer"><div><small>DATA</small><b>{auction.date}</b></div><div><small>ORA</small><b>{auction.time}</b></div>{!isAdmin && <button className={joinedSet.has(auction.id) ? "joined" : ""} onClick={() => setJoined((old) => old.includes(auction.id) ? old.filter((id) => id !== auction.id) : [...old, auction.id])}>{joinedSet.has(auction.id) ? "ISCRITTO ✓" : "PARTECIPA →"}</button>}</div>
          </article>
        ))}
      </section>

      {showForm && <div className="modal-backdrop" onMouseDown={() => setShowForm(false)}><section className="modal" onMouseDown={(e) => e.stopPropagation()}><button className="close" onClick={() => setShowForm(false)}>×</button><div className="eyebrow"><i /> NUOVO LOTTO</div><h2>Crea un&apos;asta</h2><form onSubmit={addAuction}><div className="form-grid"><label>Marca<input name="make" placeholder="es. Ferrari" required /></label><label>Modello<input name="model" placeholder="es. Roma" required /></label><label>Anno<input name="year" type="number" placeholder="2023" required /></label><label>Chilometri<input name="mileage" placeholder="12.500" required /></label><label>Alimentazione<select name="fuel"><option>Benzina</option><option>Diesel</option><option>Ibrida</option><option>Elettrica</option></select></label><label>Cambio<select name="transmission"><option>Automatico</option><option>Manuale</option><option>PDK</option></select></label><label>Base d&apos;asta (€)<input name="price" type="number" placeholder="85000" required /></label><label>Data<input name="date" placeholder="18 agosto" required /></label><label>Ora<input name="time" type="time" required /></label></div><button className="primary" type="submit">PUBBLICA ASTA <span>→</span></button></form></section></div>}
    </main>
  );
}
