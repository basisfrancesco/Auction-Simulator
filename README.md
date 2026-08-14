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

## Importazione di cataloghi esterni

L'area Admin può creare un'asta partendo dalla pagina dei lotti di una casa d'aste. Il flusso è diviso in componenti riutilizzabili:

- `lib/catalog-import.ts`: modello normalizzato e adapter della sorgente (attualmente RM Sotheby's);
- `POST /api/catalog-import`: proxy server-side nel Cloudflare Worker, necessario per CORS e validazione dell'URL;
- `auction_lots`: coda persistente dei lotti, indipendente dalla sorgente;
- anteprima Admin: inclusione, correzione del nome, valore di mercato e base d'asta prima del salvataggio.

Prima di usare l'import applicare in Supabase la migrazione:

```text
supabase/migrations/20260814_imported_auction_catalogs.sql
```

Il proxy viene incluso da `npm run build:sites`. Se il frontend statico viene ospitato separatamente (per esempio su GitHub Pages), impostare `NEXT_PUBLIC_IMPORT_API_URL` all'origine pubblica del Worker che espone `/api/catalog-import`. L'endpoint accetta solo host e percorsi riconosciuti dall'adapter, per evitare richieste server-side arbitrarie.
