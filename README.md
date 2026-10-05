# Software-Marktplatz der Stadtverwaltung

Eine selbst hostbare, professionelle Web-Seite, auf der die IT-Strategie der
Stadtverwaltung intern betreute Software-Lösungen in einem Schaufenster-Raster
präsentiert – inklusive Backend zur Pflege aller Inhalte.

## Funktionen

**Öffentliche Seite (`/`)**
- Schaufenster-Raster mit **4 Programmen pro Zeile** (responsive: 3/2/1 Spalten
  auf kleineren Bildschirmen), Reihenfolge wird im Backend per Drag & Drop
  festgelegt
- Live-Suche nach Name/Kategorie
- Klick auf eine Kachel öffnet die Detailansicht mit:
  - Automatisch laufendem Screenshot-Karussell (pausiert bei Hover)
  - Infotext zu Funktionen & Nutzen
  - Informationen zur Beschaffung
  - Button zum Öffnen der Anleitung
  - Button, der eine Anforderung per **n8n-Webhook** an die IT-Strategie sendet
    (Name, E-Mail und Nachricht sind Pflichtfelder)
  - Optionale **Pflicht-Uploads** je Programm (z. B. Zertifikate, die vor der
    Freischaltung vorliegen müssen) – werden zusammen mit der Anforderung
    hochgeladen und per Webhook als Anhang mitgeschickt

**Backend (`/admin.html`)**
- Passwortgeschützter Admin-Bereich
- Programme anlegen, bearbeiten, löschen
- Reihenfolge der Programme per Drag & Drop in der Liste festlegen (bestimmt
  die Position im 4er-Raster auf der Webseite)
- Ein Screenshot lässt sich je Programm als Vorschaubild für die Kachel
  markieren
- Screenshots hochladen/löschen, Anleitung als Datei hochladen oder per Link
  hinterlegen, Infotexte & Beschaffungsinfos pflegen
- Pro Programm beliebig viele Pflicht-Uploads mit eigenem Label definieren
- Übersicht aller eingegangenen Anforderungen (inkl. Häufigkeitsstatistik,
  hochgeladener Unterlagen und Webhook-Status)

## Technik

- Node.js + Express Backend (kein externer Datenbankserver nötig – die Daten
  liegen als JSON-Datei unter `data/db.json`, Uploads unter `uploads/`)
- Reines HTML/CSS/JavaScript Frontend, keine Build-Tools notwendig
- Lässt sich direkt mit Node.js oder per Docker betreiben

## Schnellstart (lokal mit Node.js)

Voraussetzung: Node.js ≥ 18

```bash
npm install
cp .env.example .env
# .env öffnen und ADMIN_PASSWORD, SESSION_SECRET und N8N_WEBHOOK_URL anpassen
npm start
```

Anschließend:
- Öffentliche Seite: http://localhost:3000
- Admin-Bereich: http://localhost:3000/admin.html

Bei der allerersten Nutzung (noch keine `data/db.json` vorhanden) wird die
Seite automatisch mit sechs Beispiel-Programmen vorbefüllt (Taiga, Nextcloud,
HeKI, Speakr, draw.io, BBB) – jeder Eintrag lässt sich im Backend bearbeiten
oder löschen.

## Betrieb per Docker / Portainer (empfohlen für NAS)

Bei jedem Push auf `main` baut eine GitHub Action automatisch ein
fertiges Docker-Image (für amd64 **und** arm64) und veröffentlicht es unter
`ghcr.io/mcinferno79/software-it:latest`. Das NAS muss also **nichts selbst
bauen** – `docker-compose.yml` im Repo-Root zieht nur dieses fertige Image
und startet es auf **Port 8045**.

### Deployment in Portainer (Stack → Web editor)

1. In Portainer: **Stacks → Add stack**.
2. Namen vergeben, z. B. `software-it`.
3. Build-Methode **„Web editor"** wählen und den Inhalt von
   [`docker-compose.yml`](./docker-compose.yml) hinein kopieren (oder unten
   „Repository" verwenden, siehe nächster Abschnitt).
4. Im Bereich **„Environment variables"** mindestens setzen:
   - `ADMIN_PASSWORD` – Passwort für den Admin-Bereich
   - `SESSION_SECRET` – beliebiger zufälliger String (z. B. mit
     `openssl rand -hex 32` erzeugen)
   - `N8N_WEBHOOK_URL` – eure n8n-Webhook-URL (kann auch leer bleiben und
     später pro Programm im Backend gesetzt werden)
5. **Deploy the stack** klicken.
6. Nach dem Start ist die Anwendung unter `http://<NAS-IP>:8045` erreichbar,
   der Admin-Bereich unter `http://<NAS-IP>:8045/admin.html`.

Daten (`/app/data`) und Uploads (`/app/uploads`) landen in den benannten
Docker-Volumes `software_it_data` und `software_it_uploads` und bleiben
auch bei einem Stack-Update erhalten (nur „Remove volumes" beim Löschen des
Stacks würde sie entfernen).

### Alternative: Deployment direkt aus dem Git-Repository

Statt den Compose-Inhalt zu kopieren, kann in Portainer unter **Stacks →
Add stack → Repository** auch direkt
`https://github.com/MCInferno79/software-it` mit Compose-Pfad
`docker-compose.yml` eingetragen werden. Portainer lädt dann bei jedem
„Pull and redeploy" automatisch die neueste Version.

### Falls das GHCR-Image nicht gezogen werden kann

Das Package wird standardmäßig privat veröffentlicht. Damit das NAS es
pullen kann, entweder:

- **Package öffentlich machen** (einfachster Weg): auf GitHub unter
  `github.com/MCInferno79?tab=packages` → Package `software-it` öffnen →
  **Package settings** → Sichtbarkeit auf **Public** stellen, *oder*
- in Portainer unter **Registries → Add registry** eine GHCR-Anmeldung mit
  einem GitHub Personal Access Token (Scope `read:packages`) hinterlegen.

### Nur lokal bauen (ohne GHCR), z. B. für Entwicklung

```bash
cp .env.example .env
# .env anpassen
docker compose -f docker-compose.dev.yml up -d --build
```

Läuft dann unter http://localhost:3000, baut das Image lokal aus dem
Quellcode und nutzt Bind-Mounts (`./data`, `./uploads`) statt benannter
Volumes.

Für den produktiven Einsatz im Intranet empfiehlt sich in jedem Fall ein
Reverse Proxy (z. B. nginx, Caddy oder der NAS-eigene Reverse-Proxy) davor,
der HTTPS terminiert.

## Konfiguration (.env)

| Variable          | Beschreibung                                                                 |
|--------------------|-------------------------------------------------------------------------------|
| `PORT`             | Port, auf dem der Node-Prozess **im Container** lauscht (immer 3000; der nach außen sichtbare Port wird in `docker-compose.yml` über `8045:3000` gemappt) |
| `ADMIN_PASSWORD`   | Passwort für den Admin-Bereich – unbedingt ändern!                           |
| `SESSION_SECRET`   | Zufälliger geheimer String zum Signieren der Admin-Session                   |
| `N8N_WEBHOOK_URL`  | Globaler n8n-Webhook, der Anforderungen entgegennimmt (siehe unten)          |

Jedes Programm kann im Backend optional einen eigenen Webhook hinterlegen, der
den globalen `N8N_WEBHOOK_URL` für dieses Programm überschreibt – praktisch,
falls einzelne Softwarelösungen an einem anderen n8n-Workflow/Team hängen
sollen.

### n8n-Webhook einrichten

1. In n8n einen Workflow mit einem **Webhook**-Node (Methode `POST`) anlegen.
2. Die Webhook-URL in `.env` als `N8N_WEBHOOK_URL` eintragen (oder pro
   Programm im Backend hinterlegen).
3. Beim Klick auf „Anforderung an IT-Strategie senden" sendet der Server
   folgendes JSON an den Webhook:

```json
{
  "standId": "…",
  "standName": "Beispiel-Software",
  "category": "Projektmanagement",
  "requesterName": "Max Mustermann",
  "requesterEmail": "max.mustermann@stadt.de",
  "message": "Ich benötige Zugang für mein Projektteam.",
  "source": "Software-Marktplatz",
  "timestamp": "2026-01-01T10:00:00.000Z",
  "uploadedFiles": [
    { "label": "Zertifikat A", "filename": "...", "mimetype": "application/pdf", "size": 12345, "contentBase64": "..." }
  ]
}
```

`uploadedFiles` ist nur enthalten, wenn das Programm Pflicht-Uploads
hinterlegt hat und die anfordernde Person entsprechende Dateien hochgeladen
hat. Im n8n-Workflow lässt sich daraus z. B. automatisch eine E-Mail mit
Anhang an die IT-Strategie erzeugen.

## Daten & Uploads sichern

Für Backups genügt es, folgende Verzeichnisse zu sichern:
- `data/db.json` – alle Programme, Texte, Reihenfolge
- `data/anforderungen-uploads/` – hochgeladene Pflicht-Unterlagen (z. B.
  Zertifikate) zu eingegangenen Anforderungen
- `uploads/` – Screenshots und hochgeladene Anleitungen

## Projektstruktur

```
server/
  index.js        Express-Server, REST-API, Auth, Webhook-Proxy
  db.js           Einfache JSON-Dateidatenbank
public/
  index.html      Öffentliche Seite (Schaufenster-Raster)
  admin.html      Backend zur Pflege der Programme
  css/            Styles
  js/
    app.js        Grid-Rendering, Detailansicht, Anforderungsformular
    admin.js      Backend-Logik: Login, CRUD, Uploads, Drag & Drop
uploads/          Hochgeladene Screenshots & Anleitungen (persistent)
data/             JSON-Datenbank + Anforderungs-Uploads (persistent)
docker-compose.yml      Portainer/NAS-Setup: zieht fertiges GHCR-Image, Port 8045
docker-compose.dev.yml  Lokales Setup: baut Image selbst, Port 3000
.github/workflows/      GitHub Action, die das Image bei jedem Push baut & veröffentlicht
```

## Sicherheitshinweise

- Das Admin-Passwort wird über eine serverseitige Session verwaltet; stellt
  sicher, dass die Anwendung nur über HTTPS (Reverse Proxy) erreichbar ist,
  bevor sie im Intranet freigegeben wird.
- Lade-Endpunkte sind auf Bild- bzw. Dateigrößen begrenzt (Screenshots/
  Anleitungen max. 15 MB, Anforderungs-Uploads max. 10 MB).
- Anforderungs-Uploads (z. B. Zertifikate) liegen serverseitig unter
  `data/anforderungen-uploads/` statt unter `uploads/` und werden daher nicht
  öffentlich über `/uploads` ausgeliefert.
- Der n8n-Webhook wird serverseitig aufgerufen – die Webhook-URL wird
  niemals an den Browser der Mitarbeitenden ausgeliefert.
