# Schadensverwaltung — Workflows

**Stand:** 2026-05-21

Beschreibt die Abläufe Schritt für Schritt aus Sicht der jeweiligen Rolle. Ergänzt das [KONZEPT.md](./KONZEPT.md) um den dynamischen Teil.

---

## Übersicht der Akteure

| Akteur | Hauptgerät | Hauptaufgabe |
|---|---|---|
| **Erfasser** (Bauhof-Mitarbeiter draußen) | Tablet/Handy (App) | Schäden fotografieren & melden |
| **Disponent** (Disposition Bauhof) | Desktop (Web) | Sichten, Bündeln, Vergeben |
| **Chef** (Bauhofleitung) | Desktop (Web) | Entscheidet Reihenfolge der Abarbeitung |
| **Bearbeiter intern** (Bauhof) | Tablet/Handy (App) | Erledigt zugewiesene Aufträge |
| **Firma extern** | Web/Tablet (Portal) | Erledigt zugewiesene Aufträge |
| **Admin** | Desktop (Web) | Stammdaten, Nutzer, Katalog |

---

## Workflow 1: Schaden erfassen (Erfasser)

```
[ App öffnen ]
       ↓
[ "Neuer Schaden" tippen ]
       ↓
─── Schritt 1: Position ─────────────────────────────────
[ GPS wird automatisch geholt ] ──► Pin auf Karte
       ↓
[ Erfasser bestätigt oder verschiebt Pin ]
       ↓
[ Reverse-Geocoding → Adresse angezeigt ]
       ↓
─── Schritt 2: Kategorie ────────────────────────────────
[ Drill-Down durch Kategorie-Baum ]
   ├── Ebene 1: z.B. "Straße"
   ├── Ebene 2: z.B. "Belag"
   └── Ebene 3: z.B. "Schlagloch"
       ↓
   Kategorie ist Blatt → Geometrie-Typ und Custom-Fields bekannt
       ↓
─── Schritt 3: Bemerkung + Geometrie + Eigenschaften ────
   Falls Kategorie ist line oder polygon:
   ├── Karte öffnet sich im Zeichnen-Modus
   ├── Erfasser tippt Punkte auf Karte
   ├── "Fertig" schließt Geometrie ab
   └── (bei polygon) Fläche wird in m² berechnet & angezeigt
       ↓
   Custom-Fields (falls Kategorie welche hat):
   ├── z.B. Durchmesser (cm)
   ├── z.B. Material (select)
   └── z.B. Absperrung erforderlich (bool)
       ↓
   Priorität (Default: normal)
       ↓
   Bemerkung (optional, Spracheingabe)
       ↓
─── Schritt 4: Bilder (optional) ────────────────────────
   ├── 0..n Fotos via Kamera oder Galerie
   └── Kann übersprungen werden
       ↓
[ "Speichern" ]
       ↓
   Online?
   ├── Ja  → Direkt-Upload zu Supabase, Reverse-Geocoding läuft serverseitig
   └── Nein → IndexedDB-Queue, Indikator "1 wartet auf Sync"
       ↓
[ Bestätigung: "Schaden SCH-2026-0123 erfasst" ]
```

**Ziel-Zeit:** < 45 Sekunden bei Punkt-Schaden ohne Custom-Fields; deutlich länger bei Flächen-Schäden mit Polygon-Zeichnen (das ist OK — der Zeitaufwand entsteht durch die tatsächlich nötigen Schritte).

**Warum diese Reihenfolge?**

- **Position zuerst:** GPS hat manchmal Anlaufzeit — der Hintergrund-Fix läuft, während der Erfasser noch tippt. Zudem ist die Position der eindeutige Identifikator des Schadens.
- **Kategorie zweitens:** Die Kategorie entscheidet, ob danach Geometrie gezeichnet werden muss und welche Felder kommen.
- **Geometrie + Bemerkung + Felder:** Logische Einheit — sind alle abhängig von der Kategorie und alle inhaltlich verwandt.
- **Bilder zuletzt und optional:** In manchen Situationen (z.B. Regen, schlechte Sicht, Sicherheit) kann/will der Erfasser kein Foto machen — der Schaden soll trotzdem aufnehmbar sein.

---

## Workflow 2: Schaden sichten und bündeln (Disponent + Chef)

```
[ Disposition öffnet Schadensliste ]
       ↓
   ┌─────────────────────────────────────────────────┐
   │ Filter: Status=neu, Zeitraum=letzte 7 Tage      │
   │ Ansicht: Liste links + Karte rechts             │
   └─────────────────────────────────────────────────┘
       ↓
[ Schaden anklicken → Detail mit Fotos, Adresse, Karte ]
       ↓
   ┌────────────────────────────────┐
   │ Optional: Adresse korrigieren  │
   │ Optional: Kategorie ändern     │
   │ Optional: Priorität anheben    │
   │ Optional: Status "geprüft"     │
   │ Optional: ablehnen (Dublette)  │
   └────────────────────────────────┘
       ↓
[ Mehrere Schäden anhaken (Liste oder Karte-Lasso) ]
       ↓
[ Button: "Zu Auftrag bündeln" ]
       ↓
[ Auftrags-Editor öffnet ]
   ├── Titel, Beschreibung
   ├── Firma zuweisen (intern Bauhof / externe Firma X)
   ├── Geplanter Zeitraum (Start + Endtag)
   ├── Reihenfolge der Schäden per Drag&Drop  ◄── Chef entscheidet
   ├── Bei mehrtägig: Schäden auf Tagesspalten verteilen
   └── Optional pro Position: Start-/Endzeit
       ↓
[ "Versenden" ]
       ↓
   Externe Firma?
   ├── Ja  → PDF generieren + E-Mail mit Magic-Link
   │         Push-Notification falls App installiert
   └── Nein → Push an internen Bearbeiter, App-Liste aktualisiert sich
       ↓
[ Auftrag wechselt Status: Entwurf → versendet ]
[ Beteiligte Schäden bekommen Status: zugewiesen ]
```

---

## Workflow 3: Auftrag abarbeiten (Firma / Bearbeiter intern)

```
[ E-Mail/Push erhalten: "Neuer Auftrag AUF-2026-0042" ]
       ↓
[ Im Portal/App einloggen ]
       ↓
[ Auftrag öffnen ]
   └── Sieht: Kopf + Positionen in Reihenfolge (jeweils Vor-Foto, Adresse, Karte, Kategorie, Bemerkung)
       ↓
[ "Auftrag annehmen" ]  ──► Status: versendet → angenommen
       ↓
   Für jede Position:
   ├── Anfahren (Karte/Navigation)
   ├── Status auf "in Bearbeitung" setzen
   ├── Arbeit durchführen
   ├── Nach-Foto hochladen
   ├── Bemerkung schreiben (optional, z.B. "Material aufgebraucht")
   └── Status auf "erledigt" setzen
       ↓
   Bei Problemen:
   ├── "Übersprungen" mit Begründung → bleibt offen für nächste Runde
   └── Kommentar an Disposition für Rückfrage
       ↓
   Alle Positionen erledigt/übersprungen?
       ↓
[ "Auftrag fertig melden" ]  ──► Status: in Bearbeitung → fertiggemeldet
       ↓
[ Disposition erhält Push/Hinweis ]
[ Schäden mit "erledigt"-Position bekommen Status: erledigt ]
       ↓
─── Optionale Abnahme (Disposition) ─────────────────────
   Disposition kann:
   ├── "Abnehmen" → Status fertiggemeldet → abgeschlossen
   ├── "Nacharbeit anfordern" → Status zurück auf in Bearbeitung
   │      Begründung pflichtfeld; betroffene Position(en) markieren
   │      Schaden(s) gehen zurück auf "geprüft"
   │      Firma erhält Push/Mail mit Hinweis
   └── (nichts tun)
                ↓
        nach 7 Tagen (konfigurierbar):
        Cron-Job in Edge Function setzt automatisch auf "abgeschlossen"
        History-Event: auto_accepted_after_timeout
```

---

## Workflow 4: Status-Tracking (Disponent)

```
[ Dashboard öffnet ]
       ↓
[ Kennzahlen + Karte + "Letzte Aktivitäten" ]
       ↓
   Bei Bedarf:
   ├── Klick auf Schaden → Detail mit Timeline
   │       Timeline zeigt: created → status_changed → assigned_to_order
   │                       → comment_added → photo_added → status: erledigt
   ├── Klick auf Auftrag → Auftragsdetail mit Positionen + Verlauf
   └── Filter "Überfällig" → priorisierte Liste
```

**Historie ist Pflicht:** Jeder Statuswechsel, jede Bemerkung, jedes Foto wird in `damage_history` bzw. `order_history` protokolliert und in der Timeline angezeigt.

---

## Workflow 5: Adminaufgaben

### 5a) Schadenskatalog pflegen

```
[ Admin → Kategorien ]
       ↓
[ Baum-Ansicht, beliebig tief ]
       ↓
   Aktionen:
   ├── Knoten hinzufügen (Parent wählen)
   ├── Knoten umbenennen
   ├── Reihenfolge per Drag&Drop
   ├── Deaktivieren (nicht löschen — hist. Bezüge bleiben)
   └── Optional: Standard-Priorität, Standard-Firma
```

### 5b) Nutzer anlegen

```
[ Admin → Nutzer → "Neuer Nutzer" ]
       ↓
[ E-Mail, Name, Telefon, Rolle, ggf. Firma-Zuordnung ]
       ↓
[ Speichern → Supabase Auth erstellt Invite mit Link ]
       ↓
[ Nutzer setzt Passwort, ist aktiv ]
```

### 5c) Firma anlegen

```
[ Admin → Firmen → "Neue Firma" ]
       ↓
[ Stammdaten + Typ (intern/extern) + Standardkategorien ]
       ↓
[ "Login-Zugang erstellen" → erster Firmen-Nutzer wird angelegt ]
       ↓
[ Firma erhält Mail mit Setup-Link, Logo-Upload optional ]
```

---

## Statusmodell — Übersicht

### Schadens-Status

```
   neu  ──►  geprüft  ──►  zugewiesen  ──►  in Bearbeitung  ──►  erledigt
                  │
                  └─►  abgelehnt
```

- Sprung von `neu` direkt zu `zugewiesen` möglich (Disponent muss nicht erst "prüfen").
- `abgelehnt` jederzeit aus `neu` oder `geprüft` möglich (mit Begründung).
- Zurücksetzen aus `erledigt` durch Disponent möglich (Spezialfall: Nacharbeit nötig) — landet wieder in `geprüft`.

### Auftrags-Status

```
   Entwurf ──► versendet ──► angenommen ──► in Bearbeitung ──► fertiggemeldet ──► abgeschlossen
                                                  ↑                  │
                                                  │ Nacharbeit       │ Abnahme oder
                                                  └──────────────────┘ Auto nach 7 Tagen
                                                      │
                                                      └─► storniert
```

- `angenommen` ist optional und wird gesetzt, sobald Firma den Auftrag im Portal öffnet/annimmt.
- `fertiggemeldet` ist Zwischenzustand zwischen "in Bearbeitung" und "abgeschlossen", erlaubt optionale Abnahme durch Disposition.
- **Abnahme:** Disposition setzt manuell auf `abgeschlossen`, oder Cron tut das nach 7 Tagen Inaktivität automatisch.
- **Nacharbeit:** Disposition setzt zurück auf `in Bearbeitung`; betroffene Schäden gehen auf `geprüft`.
- Stornierung jederzeit aus `versendet` / `angenommen` / `in Bearbeitung` durch Disponent möglich — Schäden werden frei und gehen zurück auf `geprüft`.

---

## Sync-Verhalten (Offline-Modus)

| Aktion | Online | Offline |
|---|---|---|
| Schaden erfassen | Direkt-Upload | Queue + Indikator |
| Foto hochladen | Direkt-Upload | Queue (Blob in IndexedDB) |
| Status setzen (Firma) | Direkt | Queue, optimistische UI |
| Adresse auflösen | Sofort via Edge Function | Nachgeholt beim Sync |
| Auftrag annehmen | Direkt | Queue |

Sync-Reihenfolge: Fotos zuerst (Storage), dann Stamm-Datensätze (DB), dann Reverse-Geocoding.
