# Schadensverwaltung — Schadens- und Auftragsmanagement für Bauhof/Gemeinde

**Status:** Konzept (in Arbeit) · **Stand:** 2026-05-21

Lebendes Dokument. Wird Stück für Stück erweitert, sobald neue Module/Anforderungen besprochen sind. Format an `C:\Foodcraft\KONZEPT.md` angelehnt, damit beide Projekte einheitlich strukturiert sind.

---

## 1. Ziel

Werkzeug für Bauhof / Stadt / Gemeinde, um **Schäden im Außenbereich mobil zu erfassen, zentral zu disponieren und an interne Trupps oder externe Firmen als Auftrag weiterzugeben**. Mobile Erfassung mit Foto, GPS und mehrstufiger Kategorie steht im Mittelpunkt; die Disposition bündelt Schäden zu Aufträgen und steuert die Abarbeitung mit Reihenfolge, Tagesplanung und optionalen Zeiten.

**Typische Anwendung:** Streckenbegehung, Sturm-/Unwetterfolgen, Bürgerschadensmeldungen, regelmäßige Kontrolle (Straßen, Beleuchtung, Spielplätze, Grünflächen, Wege, Schilder).

**Qualitätsziele:**
- Mobile Erfassung muss **schnell** sein — drei Klicks und ein Foto, fertig.
- **Offline-fähig** im Feld (Funkloch ist Alltag, sonst wertlos).
- Disposition am Desktop muss **eine Liste + eine Karte** flüssig handhaben — auch bei 1000+ offenen Schäden.
- Externe Firmen brauchen einen **simplen, fokussierten** Login — keine überfrachtete Oberfläche.
- Lückenlose **Historie** je Schaden (wer, wann, was) als Nachweis.

---

## 2. Technologie-Stack

| Bereich | Entscheidung |
|---|---|
| **Datenbank / Auth / Storage / Realtime** | **Supabase** (Postgres + Auth + Storage + Realtime + RLS) |
| **Frontend-Framework** | **React 18 + Vite + TypeScript** |
| **Mobile-Runtime** | **Capacitor** (für Tablet/Handy mit nativer Kamera + GPS + Hintergrund-Sync) |
| **UI-Komponenten** | **shadcn/ui** auf Tailwind CSS |
| **Icons** | Lucide React |
| **Routing** | React Router |
| **Server-State / Caching** | TanStack Query |
| **Client-State** | Zustand (sparsam) |
| **Formulare / Validierung** | React Hook Form + Zod |
| **Datumslogik** | date-fns |
| **Karte** | **Leaflet** mit OpenStreetMap-Tiles (kostenlos), Marker-Clustering via `leaflet.markercluster` |
| **Drag & Drop (Reihenfolge in Aufträgen)** | @dnd-kit |
| **Offline-Storage (mobile Erfassung)** | IndexedDB via Dexie + Sync-Queue |
| **Bild-Kompression (client)** | browser-image-compression |
| **Reverse-Geocoding** | Nominatim/OpenStreetMap (kostenlos, 1 req/s) für MVP — Fallback Photon/Komoot; Aufgelöste Adressen werden gecached |
| **Push / Realtime-Updates** | Supabase Realtime + Capacitor Push (Firma erhält neuen Auftrag) |
| **PDF-Generierung** | jsPDF (Auftrags-PDF für Versand an Firmen) |
| **Transactional Mail** | Resend (via Supabase Edge Function) |
| **Hosting Frontend Web** | Nginx/Caddy auf eigenem Server |
| **Hosting Supabase** | Phase 1: Supabase Cloud · später Self-Hosted möglich |
| **Package Manager** | pnpm |
| **Lint / Format** | ESLint + Prettier |
| **Tests** | Vitest (Unit), Playwright (E2E, später) |

### Warum Capacitor (statt reine PWA)?

- **Zuverlässige Kamera** ohne Browser-Eigenheiten — Bauhof-Mitarbeiter dürfen nicht an iOS-Quirks scheitern.
- **Stabiles GPS** auch im Hintergrund (kurze Streckenbegehung).
- **Robuste Offline-Speicherung** über native Schicht (kein Browser-Storage-Quota-Risiko).
- **Push-Notifications** ohne PWA-Sonderlogik.
- **App-Icon** auf Tablet/Handy ohne Browser-Drumherum, optional in eigenem MDM ausrollbar.
- Web-Build bleibt parallel verfügbar (gleiche Codebasis) — Disposition läuft im Browser.

---

## 3. Architektur-Eckdaten

| Bereich | Entscheidung | Begründung |
|---|---|---|
| Auth | Supabase Auth (E-Mail/Passwort) | Eine Auth-Quelle für Bauhof-Mitarbeiter und externe Firmen, getrennt über Rolle |
| Rechtesystem | Postgres Row-Level-Security | DB-erzwungen, schließt externe Firmen sicher von fremden Daten aus |
| Datei-Storage | Supabase Storage | Schadens-Fotos vor/nach, separater Bucket pro Bild-Typ |
| Realtime | Supabase Realtime | Status-Updates der Firma erscheinen sofort in Disposition |
| Mobile | Capacitor + Web (gleiche Codebasis) | Bauhof = App, Disposition = Browser |
| Mandantenfähigkeit | Single-Tenant jetzt, Multi-Tenant-vorbereitet | `company_id` in allen Tabellen — analog Foodcraft |
| Audit | `damage_history`-Tabelle als Event-Log | Lückenloser Nachweis, Anzeige als Timeline im Schadendetail |

---

## 4. Module — Überblick

Geplant für MVP:

- **§5 Rollen & Rechte** — wer darf was
- **§6 Mobile Schadenserfassung** — Foto, GPS, Kategorie, Bemerkung, Offline-Sync
- **§7 Schadenskatalog** — mehrstufig, Pflege im Adminbereich
- **§8 Schäden** — Datenmodell, Lebenszyklus, Historie
- **§9 Aufträge** — Bildung, Reihenfolge, Tages-/Zeitplanung
- **§10 Firmen & externes Portal** — Stammdaten, Login, Auftragsabwicklung
- **§11 Dashboard** — Status auf einen Blick
- **§12 Administration** — Nutzer, Firmen, Katalog, Gemeinde-Stammdaten

Spätere Erweiterungen (Platzhalter):
- **§13 Tour-Optimierung** — Reihenfolge per OSRM/TSP statt manuell
- **§14 Statistik & Reporting** — Bearbeitungszeiten, Schwerpunkte, Firma-Performance
- **§15 Kostenstellen / Abrechnung** — Mengen/Stunden je Auftrag, Rechnungsschnittstelle

---

## 5. Rollen & Rechte

| Rolle | Wer | Hauptzugriff | Sieht |
|---|---|---|---|
| **Admin** | Bauhofleitung, IT | Web (Desktop) | Alles innerhalb der Organisation |
| **Disponent** | Disposition Bauhof | Web (Desktop) | Alle Schäden, alle Aufträge der Organisation; legt Aufträge an |
| **Erfasser** | Bauhof-Mitarbeiter draußen | App (Tablet/Handy) | Eigene Erfassungen + Status; kann neue Schäden anlegen |
| **Bearbeiter intern** | Bauhof-Mitarbeiter, der Auftrag ausführt | App (Tablet/Handy) | Eigene zugewiesene Aufträge — Bearbeitung wie externe Firma |
| **Firmen-Nutzer** | Externe Firma | Web/Mobile-Browser | Nur die der eigenen Firma zugewiesenen Aufträge + zugehörige Schäden |

**Hinweis:** Bearbeiter intern und Firmen-Nutzer haben funktional dieselbe Sicht auf Aufträge — Unterschied nur in der Zuordnung (eigene Organisation vs. externe Firma).

---

## 6. Mobile Schadenserfassung

**Ziel:** Wenige Schritte, eindeutige Reihenfolge — die häufigste Aktion soll in unter 45 Sekunden erledigt sein.

### Erfassungs-Flow (neue Reihenfolge)

1. App öffnen → großer Button **"Neuer Schaden"**.
2. **Position bestimmen** — GPS automatisch + Karte zur Bestätigung/Korrektur des Pins. Reverse-Geocoding zeigt Adresse an.
3. **Kategorie wählen** — mehrstufiges Drill-Down (z.B. *Straße → Belag → Schlagloch*); zuletzt verwendete Kategorien oben. Die Kategorie steuert den nächsten Schritt:
   - **Punkt-Kategorie** (z.B. *Lampe defekt*): Geometrie ist erledigt (Pin aus Schritt 2).
   - **Linien-Kategorie** (z.B. *Riss*): Linie auf Karte zeichnen.
   - **Flächen-Kategorie** (z.B. *Sturmschaden Grünfläche*): Polygon auf Karte zeichnen.
   - Zusätzlich kann die Kategorie **Pflicht- und Optional-Felder** definieren (siehe §7).
4. **Bemerkung + Geometrie + Kategorie-Felder** — auf einem Schritt zusammengefasst:
   - Geometrie zeichnen (falls Kategorie es verlangt) — Linie/Polygon auf der Karte.
   - Kategorie-spezifische Eingaben (z.B. *Tiefe in cm*, *Anzahl*, *Material*).
   - Freitext-Bemerkung, optional Spracheingabe.
   - Priorität (Default normal, kann durch Erfasser angepasst werden).
5. **Bilder (optional)** — Kamera oder Galerie, 0 bis n Fotos. Erfasser kann diesen Schritt überspringen.
6. **Speichern** — geht in lokale Queue, Sync sobald online.

### Felder am Schaden

- **Position** — `gps_lat`, `gps_lng`, `gps_accuracy_m`
- **Geometrie** — optional `LineString` oder `Polygon` (GeoJSON), wenn die Kategorie es vorsieht; ansonsten reicht der Punkt
- **Adresse** — automatisch via Reverse-Geocoding, manuell überschreibbar
- **Schadenskategorie** — FK zum Katalog
- **Kategorie-Eigenschaften** — JSONB mit den Werten zu den vom Katalog definierten Feldern
- **Bemerkung** — Freitext
- **Priorität** — niedrig / normal / hoch / dringend
- **Fotos** — bis 5 vor-Fotos (durch Erfasser), bis 5 nach-Fotos (durch Firma/Bearbeiter), zusätzlich bis 5 Detail-Fotos durch Disposition (Web-Upload). Komprimierung clientseitig: Längsseite 1280 px, JPEG-Qualität 80 (~120 KB pro Bild). Bei Erreichen des Limits wird der "+"-Knopf deaktiviert
- **Status** — siehe §8
- **Ersteller, Erstellzeitpunkt** — automatisch

### Adress-Auflösung

- Bei Sync: Anfrage an Nominatim → Adresse wird in DB gespeichert.
- Wenn offline beim Erfassen: GPS-Koordinaten genügen; Adresse wird beim Sync nachgeholt.
- Manuelle Korrektur möglich im Schadendetail (z.B. wenn GPS ungenau war).

### Offline-Modus

- IndexedDB (Dexie) speichert Schadens-Entwürfe **inkl. Foto-Blobs**.
- Sync-Queue arbeitet im Hintergrund, sobald Verbindung da.
- UI-Indikator: "3 Schäden warten auf Sync".
- Konflikt-Strategie: Erfassung gewinnt (Schaden ist neu — kein Konflikt möglich, außer bei Doppel-Sync, der per UUID idempotent ist).

---

## 7. Schadenskatalog (mehrstufig)

**Pflege im Adminbereich.** Baum-Struktur, beliebig tief, in der Praxis 2–3 Ebenen.

**Beispiel:**

```
Straße
├── Belag
│   ├── Schlagloch
│   ├── Riss
│   └── Absackung
├── Markierung
└── Verkehrsschild
    ├── verbogen
    ├── verschmutzt
    └── fehlt

Beleuchtung
├── Lampe defekt
└── Mast beschädigt

Grünflächen
├── Baum
│   ├── umgestürzt
│   └── Astbruch
└── Hecke

Spielplatz
└── Gerät defekt
```

### Eigenschaften pro Kategorie

**Grundfelder:**
- Name, Code (kurz), Beschreibung (optional)
- Parent-Kategorie (NULL = Wurzel)
- Sortierreihenfolge (Drag&Drop in Admin)
- Aktiv/Inaktiv (statt löschen — wegen historischer Bezüge)
- Optional: **Standard-Priorität** (z.B. *Baum umgestürzt* = dringend)
- Optional: **Standard-Firma** (wenn Kategorie typisch von einer Firma erledigt wird → Vorschlag bei Auftragsbildung)

**Geometrie-Typ** *(neu — steuert das Erfassen in der App):*

| Wert | Bedeutung | Erfassung in App |
|---|---|---|
| `point` *(Default)* | Punkt-Objekt | Nur GPS-Pin — nichts zusätzlich zu zeichnen |
| `line` | Linien-Objekt (z.B. Riss, Straßenmarkierung über mehrere Meter) | Polyline mit Fingerzeichnen auf Karte |
| `polygon` | Flächen-Objekt (z.B. Sturmschaden, Bodenabsenkung großflächig) | Polygon mit Fingerzeichnen auf Karte |

Geometrie-Typ wird **pro Blatt-Kategorie** gepflegt (Eltern-Knoten können einen Default für ihre Kinder vorgeben, der überschreibbar ist).

**Zusatz-Eigenschaften (Custom Fields)** *(neu — kategorie-spezifische Eingabefelder):*

Pro Kategorie kann eine Liste zusätzlicher Felder definiert werden, die der Erfasser im Schritt "Bemerkung + Geometrie" ausfüllt.

Felddefinition: `name` · `label` · `field_type` · `unit` (optional) · `required` (bool) · `options[]` (bei Auswahl)

Verfügbare Feldtypen:

| Typ | Beispiel-Nutzung |
|---|---|
| `text` | Hersteller, Serien-Nr. |
| `number` | Anzahl, Stückzahl |
| `decimal` mit `unit` | Tiefe (cm), Höhe (m), Breite (m), Durchmesser (cm) |
| `select` mit `options[]` | Material (Asphalt/Pflaster/Beton), Größe (klein/mittel/groß) |
| `boolean` | Sicherheitsrelevant ja/nein, Absperrung nötig |
| `date` | Letzte Wartung, voraussichtliches Ablaufdatum |

**Beispiel** *Straße → Belag → Schlagloch*:
- `geometry_type = point`
- Felder:
  - *Durchmesser* (decimal, cm, optional)
  - *Tiefe* (decimal, cm, optional)
  - *Material* (select: Asphalt / Pflaster / Beton, optional)
  - *Absperrung erforderlich* (boolean, optional)

**Beispiel** *Grünflächen → Sturmschaden*:
- `geometry_type = polygon`
- Felder:
  - *Geschätzte Fläche* (decimal, m², optional — wird ggf. aus Polygon vorbelegt)
  - *Aufräumbedarf* (select: gering / mittel / hoch)

Property-Werte am Schaden werden als JSONB gespeichert (`property_values`). Änderungen am Katalog (Feld umbenennen, entfernen) berühren historische Schäden nicht — alte Werte bleiben sichtbar.

---

## 8. Schäden — Lebenszyklus & Historie

### Status-Workflow

```
neu  →  geprüft  →  zugewiesen  →  in Bearbeitung  →  erledigt
                ↘  abgelehnt
```

- **neu** — vom Erfasser angelegt, noch nicht von Disposition gesichtet
- **geprüft** — Disposition hat den Schaden gesehen (vermeidet doppelte Erfassung)
- **zugewiesen** — Schaden ist Teil eines Auftrags (gekoppelt an `order_items`)
- **in Bearbeitung** — Firma/Bearbeiter hat begonnen
- **erledigt** — Firma/Bearbeiter hat abgeschlossen + Foto "danach" hochgeladen
- **abgelehnt** — Disposition hat Schaden verworfen (Dublette, kein Schaden, falsche Zuständigkeit) — mit Begründung

### Historie

Jedes Ereignis wird als Event in `damage_history` protokolliert:

- `created` — neu erfasst
- `status_changed` — alte→neue Status
- `assigned_to_order` — in Auftrag aufgenommen
- `comment_added` — Bemerkung (Disposition oder Firma)
- `photo_added` — neues Foto (mit Typ vor/nach/Detail)
- `address_resolved` — Reverse-Geocoding hat Adresse ergänzt
- `address_edited` — manuelle Adresskorrektur
- `priority_changed`
- `category_changed`

**Darstellung:** Timeline im Schadendetail, neueste oben. Jeder Eintrag mit Zeitstempel und Auslöser.

---

## 9. Aufträge

### Konzept

Ein **Auftrag** bündelt mehrere Schäden, die von **einer Firma** (intern oder extern) **in einem zusammenhängenden Arbeitsblock** erledigt werden sollen. Zeitlich umfasst er **einen Tag oder mehrere Tage** und enthält eine **definierte Reihenfolge** der Schäden, optional mit Ausführungszeiten.

### Bildung eines Auftrags (Disposition)

1. Disposition sieht **Liste + Karte** aller offenen Schäden (Status `neu` oder `geprüft`).
2. Mehrere Schäden anhaken (per Checkbox in Liste oder Lasso auf Karte).
3. **"Zu Auftrag bündeln"** → Auftrags-Editor öffnet.
4. Firma zuweisen, Titel/Beschreibung, geplanter Zeitraum.
5. **Reihenfolge per Drag&Drop** (Zeilen verschieben).
6. Bei mehrtägigen Aufträgen: Schäden auf Tage verteilen (Drag zwischen Tages-Spalten).
7. Optional pro Schaden: Start-/Endzeit eintragen.
8. **Versenden** → Auftrag wird abgeschickt:
   - Externe Firma: PDF + E-Mail mit Magic-Link zum Portal, Push falls App installiert
   - Intern: Push an zugewiesenen Bearbeiter

### Status-Workflow Auftrag

```
Entwurf → versendet → angenommen → in Bearbeitung → fertiggemeldet → abgeschlossen
                                                          │              ↑
                                                          │      (Abnahme oder
                                                          │       Auto nach 7 Tagen)
                                                          │
                                                          ↓ Nacharbeit
                                                  zurück zu in Bearbeitung
                                                          
                          jederzeit aus versendet / angenommen / in Bearbeitung:  storniert
```

### Optionale Abnahme

- Firma drückt **"Auftrag fertig melden"** → Status `fertiggemeldet`.
- Disposition hat drei Optionen im Detailansicht:
  - **Abnehmen** → Status `abgeschlossen`, Schäden bleiben auf `erledigt`.
  - **Nacharbeit anfordern** → Status zurück auf `in Bearbeitung`, Firma erhält Push/Mail mit Begründung; einzelne Schadens-Positionen können gezielt als "Nacharbeit nötig" markiert werden (deren Schaden geht zurück auf `geprüft`).
  - **Nichts tun** → nach **7 Tagen** automatisch `abgeschlossen` (Cron-Job in Edge Function).
- Die Frist ist global einstellbar (Admin-Stammdaten), Default 7 Tage.
- Auto-Abnahme erzeugt einen History-Eintrag `auto_accepted_after_timeout`.

### Auftragspositionen (`order_items`)

Ein Auftrag besteht aus mehreren Positionen, jede verweist auf einen Schaden:

- `sort_order` — Reihenfolge (per Drag&Drop pflegbar, auch nach Versand)
- `planned_date` — Tag (bei mehrtägigen Aufträgen)
- `planned_start_time`, `planned_end_time` — **optional**, falls Termine fix sind
- `status` — offen / in Bearbeitung / erledigt / übersprungen
- `company_notes` — Bemerkung der ausführenden Firma (z.B. "Material fehlt", "Zusatzarbeit nötig")
- `completed_at`

### Versand an Firma

- **PDF** mit Auftragsdaten, Schadensliste in Reihenfolge, Vor-Fotos klein, Karte als Übersicht, QR-Code zum Portal.
- **E-Mail** mit PDF im Anhang + Magic-Link.
- Im Portal sieht die Firma exakt dieselben Daten interaktiv, kann Statusupdates und Fotos hochladen.

### Reihenfolge ändern nach Versand

Disposition kann die Reihenfolge auch nach Versand noch ändern — Änderung erzeugt Event in `order_history`, Firma erhält Push/Mail-Hinweis.

---

## 10. Firmen & externes Portal

### Firmen-Stammdaten

- Name, Typ (intern Bauhof / extern)
- Kontaktdaten (Ansprechpartner, E-Mail, Telefon, Adresse)
- Logo (optional, für PDF)
- Verknüpfte Nutzer (1..n Firmen-Nutzer)
- Standard-Kategorien (welche Schadensarten typischerweise zugewiesen)
- Aktiv/Inaktiv

### Firmenportal — Funktionsumfang

- **Login** mit eigener Auth — Firma sieht nur eigene Aufträge (per RLS erzwungen).
- **Liste der Aufträge** — sortiert nach Status (offen oben), Filterbar nach Zeitraum.
- **Auftragsdetail**:
  - Auftragskopf (Titel, Zeitraum, Auftraggeber-Kontakt)
  - Schadensliste in Reihenfolge — pro Schaden: Foto vor, Kategorie, Bemerkung, Adresse, Karte
  - Status setzen pro Schaden (begonnen, erledigt, übersprungen)
  - Foto "danach" hochladen
  - Bemerkung schreiben (sichtbar für Disposition)
- **"Auftrag abschließen"** wenn alle Positionen fertig.
- Bewusst **schlank** — keine Statistiken, keine Admin-Funktionen, keine fremden Schäden.

### Auth-Trennung

- Eine `auth.users` Tabelle (Supabase), Rollen unterscheiden:
  - `admin`, `dispatcher`, `field_worker` → Organisations-interne Rollen
  - `company_user` → externe Firma
- RLS-Policy filtert anhand `company_id` der zugewiesenen Firma — externe Firma kann nur `orders` lesen, wo `assigned_company_id = ihre company_id`.

---

## 11. Dashboard

**Zielbild:** Disponent sieht in 3 Sekunden, wo Druck ist.

### Widgets (Vorschlag, anpassbar)

- **Kennzahlen-Kacheln**: Offene Schäden · Heute fällig · Überfällig · Aufträge in Bearbeitung
- **Karte** mit Pins (Status-farbcodiert) — Schwerpunkt-Erkennung
- **Letzte Aktivitäten** (Live via Realtime): "Firma X hat Auftrag Y abgeschlossen", "Neuer Schaden erfasst durch Z"
- **Aufträge dieser Woche** — kompakte Timeline
- **Top-Kategorien** (Balken) — wo häufen sich Meldungen
- Optional: **Trend** (Schäden pro Woche der letzten Monate)

---

## 11a. Schadensliste in der Disposition

Die Schadensliste ist das **Arbeitswerkzeug der Disposition** — sie muss mit großen Datenmengen flott umgehen.

### Spalten (Standard)

| Spalte | Sortierbar | Bemerkung |
|---|---|---|
| Auswahl (Checkbox) | — | Mehrfachauswahl für Bündeln |
| ID (`SCH-…`) | ✓ | Standardsortierung absteigend |
| **Aufnahmedatum** | ✓ *(Default)* | Datum + Uhrzeit |
| Kategorie | ✓ | Voller Pfad anzeigen, mit Tooltip |
| Adresse | ✓ | Straße + Ort |
| Erfasst von | ✓ | Nutzer-Name |
| Priorität | ✓ | Badge |
| Status | ✓ | Badge |
| Auftrag (wenn vergeben) | — | Link zum Auftrag |

Spalten ein-/ausblendbar (Persistenz pro Nutzer), Spalten-Reihenfolge anpassbar.

### Filter

Filterleiste oberhalb der Tabelle. **Aktive Filter werden gleichzeitig auf Tabelle UND Karte angewendet** — beide Ansichten zeigen immer den selben Datenstand.

- **Zeitraum** — von/bis (Aufnahmedatum), Quick-Picker (heute / 7 Tage / 30 Tage / Quartal / Jahr / individuell)
- **Schadensart** — Multi-Select aus Katalog (Mehrfachauswahl auf jeder Baum-Ebene; "Straße" wählt alle Unter-Kategorien implizit mit)
- **Status** — Multi-Select
- **Priorität** — Multi-Select
- **Erfasser** — Multi-Select
- **Zugewiesene Firma** — Multi-Select
- **Volltextsuche** — über Bemerkung, ID, Adresse
- **Räumlicher Filter** — Lasso-/Rechteck-Auswahl auf Karte filtert die Tabelle

Filter sind als **gespeicherte Ansichten** ablegbar (z.B. "Heute · Kategorie Straße · Status neu") und pro Nutzer persistent.

### Sortierung

- Klick auf Spaltenkopf sortiert; zweiter Klick wechselt Richtung
- Mehrfach-Sortierung mit Shift+Klick (z.B. erst nach Prio, dann Datum)

### Karte synchron zur Tabelle

- **Zoombar** mit Standard-Map-Controls (+/-, Pinch, Scroll-Zoom)
- **Pins selektierbar** — Klick auf Pin markiert auch die Tabellenzeile; Klick auf Tabellenzeile zentriert/highlightet den Pin
- **Lasso/Rechteck-Auswahl** auf der Karte selektiert mehrere Schäden gleichzeitig in der Tabelle
- **Clustering** bei vielen Pins (Marker-Cluster), Aufbrechen beim Reinzoomen

### Export

Export-Button öffnet Auswahl:

| Format | Inhalt |
|---|---|
| **CSV / Excel** | Aktuell gefilterte Tabelle, alle Spalten + ggf. Custom Fields, ohne Bilder |
| **PDF (Liste)** | Querformat, Logo/Briefkopf, gefilterte Schäden in Tabellenform |
| **PDF (Mappe)** | Eine A4-Seite pro Schaden in Druckansicht (siehe §11c), kombiniert zu einem Dokument |
| **GeoJSON** | Für GIS-Import (mit Geometrie) |

Export berücksichtigt immer den aktuellen Filterstand.

---

## 11b. Schadendetail — Nachträge im Web (Disposition)

Die Disposition kann am Schaden auch nachträglich Informationen ergänzen:

- **Weitere Fotos hochladen** — z.B. Foto vom Bauamt, Fotos aus E-Mail eines Bürgers per Drag&Drop. Fotos werden als `photo_type = detail` markiert und in der Bilderleiste angezeigt.
- **Bemerkungen ergänzen** — als eigene Kommentar-Einträge in einer Kommentar-Liste (nicht Überschreibung der Erfasser-Bemerkung), mit Zeitstempel und Autor.
- **Eigenschaftswerte ändern** — Custom Fields aus der Kategorie nachträglich befüllen oder korrigieren.
- **Geometrie nachträglich zeichnen** — falls in der App vergessen oder Kategorie nachträglich geändert wurde, kann auf der Karte im Web eine Linie/Fläche gezogen werden.

Jede Ergänzung wird in `damage_history` als Event protokolliert (`photo_added`, `comment_added`, `properties_edited`, `geometry_edited`).

---

## 11c. Druckansicht eines Schadens

Druck-optimierte A4-Seite, aufrufbar pro Schaden über **"Drucken"**-Button im Schadendetail. Eigene Route (`/dispo/damage/:id/print`) mit `@media print`-Stylesheet, sodass auch der Browser-Druckdialog ein sauberes Ergebnis liefert.

### Inhalt der Druckansicht

```
┌─────────────────────────────────────────────────────┐
│  [Logo Gemeinde]    Schadensmeldung                 │
│                     SCH-2026-0118                   │
│                     gedruckt am 21.05.2026 14:32    │
├─────────────────────────────────────────────────────┤
│  Status   Neu          Priorität   Hoch             │
│  Erfasst  21.05.2026 08:14 · M. Huber               │
│                                                     │
│  Kategorie    Straße › Belag › Schlagloch           │
│                                                     │
│  Adresse      Hauptstraße 12, 4020 Linz             │
│  Koordinaten  48.30543, 14.28612 (±4 m)             │
│                                                     │
│  ┌─────────────────────┐  ┌──────────────────────┐  │
│  │                     │  │                      │  │
│  │   Foto 1 (groß)     │  │  Karte mit Pin/      │  │
│  │                     │  │  Geometrie           │  │
│  │                     │  │                      │  │
│  └─────────────────────┘  └──────────────────────┘  │
│                                                     │
│  Eigenschaften                                      │
│  · Durchmesser  40 cm                               │
│  · Tiefe        8 cm                                │
│  · Material     Asphalt                             │
│                                                     │
│  Bemerkung                                          │
│  Schlagloch ca. 40 cm Durchmesser, mitten in der    │
│  Fahrspur stadteinwärts. Wasser sammelt sich…       │
│                                                     │
│  ─── Weitere Fotos ───────────────────────────────  │
│  [Foto 2] [Foto 3]                                  │
│                                                     │
│  ─── Historie ────────────────────────────────────  │
│  21.05.2026 08:14   Erfasst von M. Huber            │
│  21.05.2026 08:14   GPS aufgelöst (±4 m)            │
│  21.05.2026 09:20   Priorität → hoch (A. Berger)    │
│                                                     │
│                  Seite 1 / 1                        │
└─────────────────────────────────────────────────────┘
```

### Details

- Karte als **statisches Bild** gerendert (Leaflet → Canvas → PNG), damit Drucken nicht von Live-Tiles abhängt.
- Bei Linien-/Flächen-Geometrie: in der Karte mit eingezeichnet.
- Bei vielen Fotos: erste 1–2 groß, restliche als Thumbnail-Strip; ggf. mehrseitig.
- Druckansicht **enthält kein Browser-Drumherum** (kein Navi, keine Buttons) — sieht so aus wie das spätere PDF.
- Über die selbe Route lässt sich auch ein PDF generieren (Client-Side via `html2canvas + jsPDF`, das wir schon im Feuerwehr-App-Stack haben, oder Server-Side über Edge Function).

---

## 12. Administration

- **Nutzerverwaltung** — anlegen, Rolle, Firma-Zuordnung, deaktivieren, Passwort-Reset
- **Firmen** — Stammdaten wie §10
- **Schadenskatalog** — mehrstufiger Baum, Drag&Drop-Sortierung, Aktivierung; pro Knoten **Geometrie-Typ** (Punkt/Linie/Fläche), **Custom-Fields** (siehe §7), Standard-Priorität und Standard-Firma
- **Gemeinde-Stammdaten** — Name, Logo, Briefkopf-Daten für PDF/Druckansicht, Standard-Kartenausschnitt
- **Audit-Log** — wer hat was geändert (über alle Module hinweg)
- Optional später: **Status-/Prioritäts-Anpassungen** (Custom Labels), **Vorlagen** für Auftragstitel

---

## 13. Datenmodell (Entwurf)

> Nur Grobskizze — Spalten/Indizes/Triggers werden beim DB-Setup feinjustiert.

```
companies        (id, name, type, contact_email, address, logo_path, active)
users            (id=auth.users.id, company_id, role, full_name, phone, active)
                 -- role: admin | dispatcher | field_worker | company_user

damage_categories (id, company_id, parent_id, name, code, sort_order,
                  default_priority, default_company_id, active,
                  geometry_type,            -- 'point' | 'line' | 'polygon'
                  property_schema jsonb)    -- Felddefinitionen (Custom Fields)

damages          (id, company_id, code, category_id, status, priority,
                  gps_lat, gps_lng, gps_accuracy,
                  geometry jsonb,           -- GeoJSON LineString/Polygon, NULL bei Punkt
                  property_values jsonb,    -- Werte zu category.property_schema
                  address_street, address_house_number, address_postal_code,
                  address_city, address_resolved_at,
                  description, created_by, created_at,
                  reviewed_by, reviewed_at)

damage_photos    (id, damage_id, storage_path, photo_type, taken_at, uploaded_by)
                 -- photo_type: before | after | detail

damage_history   (id, damage_id, event_type, payload jsonb, created_by, created_at)

orders           (id, company_id, code, title, description,
                  assigned_company_id, status,
                  planned_start_date, planned_end_date,
                  created_by, created_at, sent_at, accepted_at, completed_at)

order_items      (id, order_id, damage_id, sort_order,
                  planned_date, planned_start_time, planned_end_time,
                  status, company_notes, completed_at)

order_history    (id, order_id, event_type, payload jsonb, created_by, created_at)

order_comments   (id, order_id, user_id, message, created_at)
```

**Konventionen:** `company_id` überall (Mandanten-Vorbereitung), `created_at`/`updated_at` automatisch via Trigger, IDs als UUID, fortlaufende lesbare Codes (`SCH-2026-0001`, `AUF-2026-0042`) per Sequence.

---

## 14. Mandantenfähigkeit / RLS

- `company_id` in **jeder** sachlichen Tabelle.
- RLS-Policy Standardregel:
  - Interne Rollen (`admin`, `dispatcher`, `field_worker`): `row.company_id = current_user.company_id`
  - `company_user`: zusätzlicher Filter über Auftragszuweisung (`orders.assigned_company_id = current_user.company_id`); sieht nur Schäden, die Teil zugewiesener Aufträge sind.
- Beim Schritt zu echtem Multi-Tenant ändert sich **kein Schema**, nur die Auswahl-Logik im Frontend.

---

## 15. Adress-Auflösung, GPS & Karten

- **GPS-Quelle:** Capacitor Geolocation (hohe Genauigkeit, Timeout 10s, Fallback: letzte bekannte Position mit Hinweis).
- **Reverse-Geocoding:** Nominatim (kostenlos, 1 req/s, User-Agent-Pflicht). Lookup serverseitig in Edge Function (vermeidet CORS und respektiert Rate-Limit zentral).
- **Cache:** Aufgelöste Adressen werden in `damages` gespeichert — bei Auftragsbildung kein neuer Lookup nötig.
- **Karten-Tiles (Default-Setup für Thüringen):**
  - **OpenStreetMap** (Standard, weltweit)
  - **Luftbild Thüringen** über Geoportal Thüringen / TIM-Online (WMS, kostenlos für öffentliche Nutzung)
  - **ALKIS-Kataster Thüringen** über Geoportal Thüringen (WMS, Grundstücksgrenzen + Flurstücke)
  - User-Switch (Layer-Wechsler oben rechts auf der Karte)
- **Karten-Konfigurierbarkeit** *(wichtig — System soll auch außerhalb Thüringens einsetzbar bleiben):*
  - Tabelle `map_layers` mit Definition pro Layer: `name`, `type` (xyz/wms/wmts), `url_template`, `attribution`, `min_zoom`, `max_zoom`, `default` (bool), `sort_order`, `enabled` (bool), `company_id` (Mandant)
  - Admin-Maske im Adminbereich zum Pflegen der Layer (Hinzufügen, Aktivieren, Reihenfolge, Default)
  - Bei Setup neuer Gemeinden: passende Layer-Konfiguration je Bundesland (z.B. Bayern: BVV; NRW: Geobasis NRW; AT: basemap.at) als vorgefertigte Presets, die der Admin importieren kann
- **Karten-Funktionen** (Disposition):
  - Standard-Map-Controls (Zoom, Pan, Pinch, Scroll-Zoom)
  - **Marker-Clustering** bei vielen Pins (>50 im Viewport)
  - Pin-Auswahl mit visueller Hervorhebung (synchron mit Tabelle)
  - Lasso-/Rechteck-Werkzeug für Mehrfach-Auswahl
  - Layer-Wechsler (OSM / Luftbild / Kataster) oben rechts
- **Geometrie zeichnen** (Erfasser-App & Disposition):
  - Mobile: Finger-Polyline/Polygon-Tool basierend auf Leaflet-Draw (oder Capacitor-Plugin)
  - Desktop: Maus-Polyline/Polygon-Tool
  - Geometrie wird als GeoJSON gespeichert (`damages.geometry`)
- **Manuelle Korrektur:** Disponent kann Adresse und Geometrie im Schadendetail editieren (Events in History).

---

## 16. Offline-Modus

| Szenario | Verhalten |
|---|---|
| Erfasser ist offline beim Schadens-Erfassen | Schaden + Fotos in IndexedDB; Status "wartet auf Sync"; UI zeigt Counter |
| Verbindung kommt zurück | Sync-Queue arbeitet Schaden für Schaden ab: Upload Fotos → INSERT Schaden → Reverse-Geocoding nachholen |
| Erfasser hat App schon mal gestartet, aber Katalog veraltet | Katalog wird im Hintergrund refresht (TanStack Query stale-while-revalidate) |
| Disposition offline | Nicht unterstützt — Disposition ist Desktop-Arbeit mit Netz |
| Firma offline beim Auftragsabschluss | Statusänderungen + Fotos werden in lokaler Queue zwischengespeichert, später synct |

---

## 17. Phasen & Roadmap

### Phase 1 — MVP (Kernfunktion)

- Projekt-Setup (Vite + React + Supabase + Capacitor + shadcn/ui)
- Datenbankschema + RLS
- Auth + Rollen
- Schadenserfassung mobil (Foto, GPS, Kategorie, Bemerkung) — **online**
- Reverse-Geocoding
- Schadensliste & -karte für Disposition
- Schadenskatalog-Pflege im Admin
- Auftragsbildung + Reihenfolge per Drag&Drop
- Firmen-Stammdaten + Firmen-Login
- Firmenportal mit Statusupdates und Nach-Foto
- Dashboard mit Basis-Kennzahlen
- Historie/Timeline je Schaden

### Phase 2 — Robustheit

- **Offline-Modus** mit IndexedDB + Sync-Queue
- **PDF-Export** Aufträge
- **E-Mail-Versand** an Firmen via Resend
- **Mehrtägige Aufträge** mit Tagesplanung
- **Push-Notifications** (Capacitor)
- **Realtime-Updates** im Dashboard
- **CSV-Importer** für Schäden (Spalten-Mapping, Vorschau, Validierung, Dry-Run)
- **Optionale Abnahme** mit Auto-Freigabe-Cron (siehe §9)

### Phase 3 — Komfort & Effizienz

- Tour-Optimierung (OSRM)
- Statistik & Reporting
- Erweiterte Filter, Sammelaktionen
- Weitere Karten-Layer-Presets je Bundesland

### Phase 4 — Anschluss

- Schnittstellen (Buchhaltung, GIS-Export)
- Multi-Tenant-Schalter
- Self-Hosting Supabase

---

## 18. Entscheidungen und offene Punkte

### Entschieden (2026-05-21)

- **Firmenportal-Zugang:** Eigener Login pro Firma. Magic-Link verworfen — wir setzen auf normale Authentifizierung mit eigenen Accounts.
- **Standard-Bearbeitungsdauer auf Kategorien:** Wird **nicht** mitgeführt. Reihenfolge und Tagesplanung folgen der Entscheidung des Chefs — keine automatische Auslastungsberechnung.
- **Bürger-Meldekanal:** **Nicht im Scope.** Phase 3-Punkt aus §17 wird gestrichen. Erfassung erfolgt ausschließlich durch interne Bauhof-Mitarbeiter.
- **Foto-Limit:** Max. 5 vor + 5 nach + 5 Detail pro Schaden. Komprimierung 1280 px Längsseite, JPEG 80 (≈ 120 KB).
- **Priorität:** Reines Sortier-Merkmal — keine SLA-Fristen. Disposition entscheidet selbst über Dringlichkeit.
- **Karten:** OSM + Luftbild Thüringen (TIM-Online) + ALKIS-Kataster Thüringen als Default-Setup. Layer-Definitionen über Tabelle `map_layers` **konfigurierbar**, damit auch andere Regionen unterstützt werden können.
- **Mehrsprachigkeit:** **Hartcodiert deutsch.** Kein i18n-Setup. Falls später nötig, ist Refactoring zu i18next absehbar — aktuell kein Bedarf.
- **Bewertung/Abnahme:** **Optionale Abnahme** mit Auto-Freigabe nach 7 Tagen (siehe §9). Disposition kann abnehmen, Nacharbeit fordern oder nichts tun.
- **Massenimport:** **CSV-Import** als Phase-2-Feature. Spalten-Mapping, Vorschau, Dry-Run, Validierung der Kategorie-Referenzen.

### Damit sind alle Konzeptpunkte geklärt — bereit für Projekt-Setup.

Nächster Schritt: Projektgerüst (Vite + React + TypeScript + Supabase + Capacitor + shadcn/ui), Datenbankschema mit RLS, Auth + Rollen. Siehe §17 Phase 1.
