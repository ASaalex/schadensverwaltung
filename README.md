# Schadensverwaltung

Schadens- und Auftragsmanagement-Tool für Bauhof / Stadt / Gemeinde.

| Dokument | Inhalt |
|---|---|
| [KONZEPT.md](./KONZEPT.md) | Vollständiges Konzept mit Stack, Datenmodell, Modulen |
| [WORKFLOWS.md](./WORKFLOWS.md) | Akteur-zentrierte Abläufe + Statusmodelle |
| [mockup/index.html](./mockup/index.html) | Klickbarer HTML-Mockup (im Browser öffnen) |
| [app/README.md](./app/README.md) | Setup-Anleitung für die echte App |

## Schnellstart

```powershell
cd app
npm install
# .env.local mit Supabase-Werten befüllen, Schema in Supabase einspielen
npm run dev
```

Details siehe [app/README.md](./app/README.md).

## Stand

- **2026-05-21:** Konzept abgeschlossen, Projekt-Gerüst aufgesetzt, Datenbankschema fertig
- Implementiert: Login, Role-basiertes Routing, KPI-Dashboard (live aus DB), Admin-Nutzerliste
- Als nächstes: Erfasser-Flow (Position → Kategorie → Bemerkung/Geometrie → Fotos)
