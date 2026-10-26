# Familienküche

Rezepte aus Kochbüchern, Wochenplan, grober Vorrat und eine Einkaufsliste, die nur kauft, was fehlt.
Die App läuft im Browser (Handy und Computer) und speichert alles im OneDrive der Familie.

Adresse: https://mmikulik1969.github.io/Familienkueche/

## Aufbau

| Datei | Aufgabe |
|---|---|
| `index.html`, `style.css` | Seite und Gestaltung |
| `app.js` | Rezepte, Plan, Vorrat, Einkauf, Abgleich der Änderungen |
| `sync.js` | Microsoft-Anmeldung und Zugriff auf OneDrive (Microsoft Graph) |
| `ai.js` | Claude: Fotos auslesen, Rezepte im Netz suchen, Ausgewogenheits-Vorschläge |
| `vendor/msal-browser.min.js` | Microsoft-Anmeldebibliothek (MSAL 3.28.1, MIT-Lizenz), mitgeliefert statt von einem Fremdserver geladen |
| `sw.js`, `manifest.webmanifest` | Installierbar auf dem Startbildschirm, offline mit zuletzt geladenem Stand |

Es gibt keinen eigenen Server. Die Daten liegen in OneDrive im Ordner `Familienkueche`
(`daten.json` und `foto-*.jpg`).

## Einrichtung

1. **GitHub Pages:** Settings → Pages → Branch `main`, Ordner `/ (root)`.
2. **Azure-App:** Die Client-ID steht in `sync.js` (`CLIENT_ID`). In der App-Registrierung müssen stehen:
   - Plattform „Single-Page-Anwendung" mit der Umleitungs-URI `https://mmikulik1969.github.io/Familienkueche/`
   - Kontotypen: nur persönliche Microsoft-Konten (die App meldet sich über den Endpunkt `consumers` an)
   - API-Berechtigungen (delegiert, Microsoft Graph): `User.Read`, `Files.ReadWrite.All`
3. **Erste Person:** Öffnet die Adresse, meldet sich an, tippt „Ordner anlegen". Dann ⋮ → „Link erzeugen" und den Link an die Familie schicken.
4. **Alle anderen:** Öffnen die Adresse, melden sich mit ihrem Microsoft-Konto an, fügen den Link ein. Danach „Zum Startbildschirm hinzufügen".

## Claude-Funktionen (optional)

Foto-Auslesen, Rezeptsuche im Netz und Vorschläge für ausgewogenes Essen laufen über die Claude-Schnittstelle (Modell `claude-opus-5-5`).
Dafür braucht jedes Gerät einmal einen Schlüssel von console.anthropic.com (⋮ → Claude-Zugang). Der Schlüssel liegt nur im
`localStorage` des Geräts, nicht im Repository und nicht in OneDrive. Die Kosten laufen über das Anthropic-Konto; dort ein Monatslimit setzen.
Die Websuche muss in der Anthropic Console unter den Datenschutz-Einstellungen der Organisation erlaubt sein.
Ohne Schlüssel funktioniert die App wie bisher.

## Wie Änderungen zusammengeführt werden

Jedes Gerät merkt sich den zuletzt abgeglichenen Stand. Beim Speichern werden nur die eigenen Änderungen
auf den aktuellen Stand in OneDrive gelegt. Wer gleichzeitig verschiedene Dinge ändert, verliert nichts.
Ändern zwei Personen genau dasselbe Rezept oder denselben Artikel, gewinnt die später gespeicherte Änderung.
Alle 20 Sekunden und beim Öffnen prüft die App auf Neuigkeiten.

## Grenzen

- Der Familien-Link erlaubt jedem, der ihn kennt, den Ordner zu ändern. Nicht öffentlich weitergeben, bei Bedarf in OneDrive widerrufen.
- Ausgelesene und aus dem Netz gesuchte Rezepte können Fehler enthalten. Sie werden vor dem Speichern immer zur Prüfung angezeigt.
- Der Stand nach der Anmeldung hält etwa einen Tag. Danach fragt Microsoft einmal neu an.
