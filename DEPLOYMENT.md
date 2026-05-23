# Deployment auf Vercel

Schritt-für-Schritt-Anleitung, um die Schadensverwaltung auf Vercel zu deployen — kostenlos auf dem Hobby-Plan (für nicht-kommerzielle Nutzung) bzw. Pro-Plan (~20 $/Monat) für produktive Behördenanwendung.

## Voraussetzungen

- ✅ Git installiert (oder GitHub Desktop)
- ✅ GitHub-/GitLab-/Bitbucket-Account
- ✅ Vercel-Account (gleiches, das schon für die Feuerwehr-App)
- ✅ Supabase-Cloud-Projekt mit allen Migrations eingespielt

## Schritt 1 — Git-Repository einrichten

Im PowerShell-Terminal im Projekt-Root:

```powershell
cd C:\Schadensverwaltung
git init
git add .
git commit -m "Initial commit: Schadensverwaltung-App"
```

Dann auf GitHub ein neues, **leeres** Repository anlegen (z.B. `schadensverwaltung`). Du brauchst KEIN README/LICENSE/.gitignore von GitHub generieren — wir haben unsere eigenen.

Repository mit dem lokalen Verzeichnis verbinden:

```powershell
git remote add origin https://github.com/DEIN_USERNAME/schadensverwaltung.git
git branch -M main
git push -u origin main
```

> ⚠️ **Prüfe vor dem ersten Push**, dass `app/.env.local` nicht im Commit landet. Die enthält deinen Supabase-Anon-Key. Die `.gitignore` schließt sie aus, aber sicher ist sicher:
> ```powershell
> git status
> ```
> Wenn `.env.local` in der Liste auftaucht — STOP, in `.gitignore` ergänzen und neu committen.

## Schritt 2 — Vercel-Projekt anlegen

1. https://vercel.com → einloggen
2. **Add New → Project**
3. Repo `schadensverwaltung` auswählen → **Import**
4. **Configure Project:**

   | Feld | Wert |
   |---|---|
   | **Framework Preset** | Vite *(wird automatisch erkannt)* |
   | **Root Directory** | `app` *(wichtig — der Code liegt im app/-Unterordner)* |
   | **Build Command** | `npm run build` *(vorausgefüllt)* |
   | **Output Directory** | `dist` *(vorausgefüllt)* |
   | **Install Command** | `npm install` *(vorausgefüllt)* |

5. **Environment Variables** — drei wichtige Variablen:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://DEIN-PROJEKT.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `sb_publishable_...` *(dein Anon-Key)* |

   *(diese musst du händisch eintragen — niemals committen)*

6. **Deploy** klicken → Vercel baut und deployed (dauert 1–2 Minuten).

Nach Erfolg hast du eine URL wie `https://schadensverwaltung-XXX.vercel.app`.

## Schritt 3 — Supabase auf die neue Domain konfigurieren

Damit Auth-Redirects, CORS und E-Mail-Confirm-Links auf die Vercel-Domain zeigen:

1. **Supabase Dashboard → Authentication → URL Configuration**
2. **Site URL** auf `https://schadensverwaltung-XXX.vercel.app` setzen
3. **Redirect URLs** ergänzen (Komma-separiert oder eine pro Zeile):
   ```
   https://schadensverwaltung-XXX.vercel.app
   https://schadensverwaltung-XXX.vercel.app/login
   https://schadensverwaltung-XXX.vercel.app/**
   ```
4. **Speichern**

## Schritt 4 — Custom Domain (optional)

Wenn du eine eigene Domain wie `schadensverwaltung.deine-gemeinde.de` willst:

1. Vercel-Projekt → **Settings → Domains → Add**
2. Domain eintragen
3. DNS-Eintrag bei deinem Domain-Provider hinzufügen (Vercel zeigt die genauen Werte)
4. Nach Aktivierung: Site URL in Supabase ebenfalls auf die Custom Domain umstellen

## Updates deployen

Nach einer Code-Änderung:

```powershell
cd C:\Schadensverwaltung
git add .
git commit -m "Beschreibe deine Änderung"
git push
```

Vercel deployed automatisch — typischerweise innerhalb von 1 Minute.

Bei jedem Push gibt es:
- **Production Deploy** für `main`-Branch → live URL
- **Preview Deploy** für Feature-Branches → eigene Vorschau-URL pro Branch (gut zum Testen)

## Vercel-Hobby-Limits

| Resource | Limit |
|---|---|
| Bandwidth | 100 GB/Monat (großzügig für eine Bauhof-App) |
| Builds | 6000 Min/Monat (~100/Tag bei 60s Build-Zeit) |
| Deployments | 100/Tag |
| Function-Invocations | nicht relevant (wir nutzen keine Vercel-Functions, sondern Supabase) |
| Projekte | unbegrenzt |

Für eine Bauhof-App mit < 100 aktiven Nutzern reicht das locker.

## Troubleshooting

| Symptom | Lösung |
|---|---|
| **404 bei direktem URL-Aufruf** (z.B. `/dispo/damages`) | `vercel.json` mit `rewrites` ist da — wenn Problem bleibt, in Vercel-Projekt-Settings prüfen ob die `vercel.json` aus `app/` übernommen wird |
| **Build schlägt fehl mit "out of memory"** | In Vercel-Projekt-Settings → "Build & Development" → Build Command auf `NODE_OPTIONS=--max_old_space_size=4096 npm run build` |
| **Login funktioniert lokal, aber nicht auf Vercel** | Supabase Site URL + Redirect URLs prüfen (Schritt 3) |
| **Bilder laden nicht / CORS-Fehler** | Supabase Storage → Bucket "damage-photos" → Settings → "Allowed MIME types" und CORS prüfen |
| **`process is not defined` zur Laufzeit** | Vite ersetzt nur `import.meta.env.*` — niemals `process.env.*` im Client-Code nutzen |

## Was NICHT auf Vercel läuft (= weiterhin Supabase Cloud)

- Postgres-Datenbank
- Auth (Supabase Auth)
- Storage (Bilder)
- Realtime
- Edge Functions (falls jemals nötig)

Vercel hostet **nur** das statische Frontend-Bundle. Das ist auch der Grund warum wir die Architektur so gebaut haben — Supabase übernimmt alle Backend-Aufgaben.
