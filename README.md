# Auction Simulator

Prototipo di un portale per aste automobilistiche con due aree:

- partecipanti: consultazione delle aste disponibili e iscrizione;
- amministratore: creazione di nuove aste.

## Profili demo

- Francesco Basis
- Vittorio Esposito
- Carlo Esposito
- Lorenzo Biava
- Admin

L'accesso non richiede password. In questa prima versione profilo, aste create e iscrizioni sono gestiti localmente nel browser: non sono ancora condivisi tra dispositivi diversi.

## Avvio

```bash
pnpm install
pnpm dev
```

## Pubblicazione

Ogni aggiornamento inviato al branch `main` viene pubblicato automaticamente su:

https://basisfrancesco.github.io/Auction-Simulator/

Nelle impostazioni del repository, GitHub Pages deve usare come origine **GitHub Actions**. Prima dell'uso reale serviranno autenticazione e persistenza condivisa lato server.
