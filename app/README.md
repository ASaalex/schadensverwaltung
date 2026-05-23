# Schadensverwaltung — App

Web- und Mobil-App (Capacitor) für Schadens- und Auftragsmanagement im Bauhof.

Siehe Schwesterdokumente im Projekt-Root:
- [`../KONZEPT.md`](../KONZEPT.md) — vollständiges Konzept
- [`../WORKFLOWS.md`](../WORKFLOWS.md) — Abläufe je Rolle
- [`../mockup/index.html`](../mockup/index.html) — klickbarer UI-Mockup

## Stack

| Bereich | Wahl |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| UI | Tailwind CSS + shadcn/ui (manuell ergänzt) |
| State (Server) | TanStack Query |
| Backend | Supabase Cloud (Postgres + Auth + Storage + RLS) |
| Mobile | Capacitor 7 (Android + iOS) |
| Karte | Leaflet + OSM / TIM-Online (Thüringen) |
| Package Manager | **npm** (Konzept sah pnpm vor — kann jederzeit umgestellt werden) |

## Erst-Setup

### 1) Dependencies installieren

```powershell
cd C:\Schadensverwaltung\app
npm install
```

### 2) Supabase-Cloud-Projekt anlegen

1. Auf https://supabase.com einloggen → **New Project**
2. Region: Frankfurt (eu-central-1)
3. Datenbank-Passwort sicher ablegen
4. Nach Erstellung: **Project Settings → API** → `URL` und `anon public` Key kopieren

### 3) `.env.local` befüllen

```env
VITE_SUPABASE_URL=https://xxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### 4) Schema in Supabase ausführen

1. Im Supabase-Dashboard: **SQL Editor**
2. Inhalt von `supabase/migrations/20260521120000_initial_schema.sql` einfügen und ausführen
3. Danach Inhalt von `supabase/seeds/dev_seed.sql` einfügen und ausführen (legt Bauhof Erfurt, Kategorie-Baum, Karten-Layer an)

### 5) Ersten Admin-Nutzer anlegen

Da das Seed keine Auth-Nutzer anlegt (Supabase Auth verwaltet die separat):

1. Supabase-Dashboard → **Authentication → Users → Add user → Create new user**
2. E-Mail und Passwort vergeben
3. Die generierte User-ID kopieren
4. Im **SQL Editor** ausführen:

```sql
insert into public.users (id, company_id, role, full_name)
values (
  '<die User-ID aus Schritt 3>',
  '00000000-0000-0000-0000-000000000001',  -- Bauhof Erfurt
  'admin',
  'Dein Name'
);
```

### 6) Dev-Server starten

```powershell
npm run dev
```

Browser öffnet auf http://localhost:5173

## Projektstruktur

```
app/
├── src/
│   ├── auth/            AuthContext, LoginPage, ProtectedRoute
│   ├── components/
│   │   ├── layout/      AppShell (Desktop + Mobile-Variante)
│   │   └── ui/          shadcn-Komponenten (kommen iterativ)
│   ├── lib/             supabase-Client, cn-Helper
│   ├── routes/
│   │   ├── erfasser/    Mobile Erfasser-App (Tablet/Handy)
│   │   ├── dispo/       Disposition (Desktop)
│   │   ├── firma/       Firmenportal (Desktop/Tablet)
│   │   └── admin/       Administration
│   ├── types/           database.ts (handgepflegt, TODO: aus Supabase generieren)
│   ├── App.tsx          Routing + Role-basierte Weiterleitung
│   ├── main.tsx         Bootstrap (Providers)
│   └── index.css        Tailwind + shadcn-CSS-Variablen
├── supabase/
│   ├── migrations/      SQL-Schema (companies, damages, orders, RLS …)
│   └── seeds/           Entwicklungs-Stammdaten (Bauhof Erfurt + Katalog)
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── capacitor.config.ts
└── .env.local           (gitignored — Supabase-Credentials)
```

## Rollen & Routen

Die App-Routes leiten anhand der Nutzer-Rolle automatisch um:

| Rolle | Startroute | Zugang zu |
|---|---|---|
| `admin` | `/admin` | alle Bereiche |
| `dispatcher` | `/dispo` | Disposition + Erfasser |
| `field_worker` | `/erfasser` | nur Erfasser |
| `company_user` | `/firma` | nur Firmenportal |

## Capacitor (Mobile Builds)

```powershell
# Build erstellen
npm run build

# Android-Plattform hinzufügen (einmalig, erzeugt android/-Ordner)
npx cap add android

# iOS (nur auf macOS)
npx cap add ios

# Nach jedem Build: Web-Assets in Native-Projekt syncen
npm run cap:sync

# Android Studio öffnen
npm run cap:open:android
```

## Nächste Schritte (Implementierungs-Reihenfolge)

1. **Erfasser-Flow** — Position → Kategorie → Bemerkung/Geometrie → Fotos
2. **Disposition Schadensliste** — Tabelle + Karte + Filter + Export
3. **Schadendetail** mit Historie + Web-Nachträge
4. **Auftrags-Editor** mit Drag&Drop
5. **Firmenportal** Auftragsabwicklung
6. **Druckansicht** + PDF
7. **Offline-Modus** (IndexedDB)
8. **CSV-Importer**

## Hinweis: pnpm-Migration später

Wenn pnpm verfügbar ist:

```powershell
npm install -g pnpm
rm -r node_modules
rm package-lock.json
pnpm install
```
