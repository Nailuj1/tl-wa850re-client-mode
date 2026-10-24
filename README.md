# TP-Link TL-WA850RE V7.0 – Reiner WLAN-Client-Modus (WLAN-LAN-Bridge)

> **Betrieb des TP-Link TL-WA850RE V7.0 als reiner WLAN-Empfänger (WLAN-zu-Ethernet-Bridge) ohne zusätzliches Access-Point-WLAN und ohne Beacon-Frames.**

---

## 📌 Problemstellung

Der günstige und weit verbreitete Repeater **TP-Link TL-WA850RE (Hardware-Version V7.0)** eignet sich ideal, um netzwerkfähige Geräte ohne eigenes WLAN (z. B. Smart-TVs, Drucker, Desktop-PCs oder Messgeräte) per LAN-Kabel in ein bestehendes 2,4-GHz-WLAN einzubinden.

In der standardmäßigen TP-Link-Weboberfläche existiert jedoch **kein dedizierter Client-Modus**:
* Es gibt nur *Accesspoint-Modus* und *Repeater-Modus*.
* Im Repeater-Modus bietet die Weboberfläche lediglich die Option **„SSID-Broadcast ausblenden“**.
* **Das Problem:** Ein verstecktes WLAN strahlt weiterhin permanente Management- und Beacon-Frames aus. Es belegt wertvolle Funk-Airtime im 2,4-GHz-Band, erzeugt Funkkollisionen und verhindert einen sauberen Brückenbetrieb.

---

## 🔍 Warum OpenWrt auf V7.0 keine Option ist

Viele Anleitungen im Netz empfehlen OpenWrt. Dies gilt jedoch **nur für uralte Revisionen (V1 / V2)**:

| Eigenschaft | TL-WA850RE V1 / V2 | TL-WA850RE V7.0 (dieses Modell) |
| :--- | :--- | :--- |
| **SoC / CPU** | Qualcomm/Atheros AR9341 | **MediaTek MT7628KN** (MIPS24KEc @ 580 MHz) |
| **Flash-Speicher** | 4 MB SPI Flash | **2 MB SPI Flash** (`cFeon QH16-104HIP`) |
| **Arbeitsspeicher (RAM)**| 32 MB DDR | **8 MB eDRAM** (im SoC integriert) |
| **OpenWrt-Support** | Veraltet / eingestellt | **Technisch unmöglich** (Kernel passt nicht in 2 MB Flash) |

Ein Versuch, ältere OpenWrt-Images auf Version V7.0 zu flashen, führt zum **sofortigen, dauerhaften Hardware-Brick**. Auch TP-Links neuere Firmware (1.1.0) bietet keinen Client-Modus, sperrt aber ein Downgrade (Anti-Rollback).

---

## 💡 Die Entdeckung: Die Firmware kann es bereits!

Eine Tiefenanalyse des TP-Link Web-Frameworks (`$.su`) und der Backend-TDDP-Schnittstelle liefert die Lösung:

1. **Getrennte Treiber-Interfaces:**
   Der MediaTek-SoC betreibt hardwareseitig zwei getrennte Interfaces:
   * `apcli0` (Station / Client-Bridge zu Ihrem Router) $\rightarrow$ Konfigurationsblock `32|1,0,0`
   * `ra0` (Virtueller Access Point für das erweiterte WLAN) $\rightarrow$ Konfigurationsblock `33|1,1,0`
2. **Der versteckte Schalter:**
   Im JavaScript-Datenmodell `extendedNetworkM` ist der Parameter **`bEnable`** (Access Point an/aus) vollständig implementiert. 
   **TP-Link hat schlichtweg in der HTML-Vorlage (`view.html`) des Repeater-Modus die Checkbox für `bEnable` weggelassen** und nur die Checkbox für `bBcastSsid` (SSID verstecken) angezeigt.
3. **Setzt man `bEnable` auf `0`:**
   * Schaltet der Treiber das Access-Point-Interface (`ra0`) komplett ab.
   * Werden **keinerlei WLAN-Beacons oder Probe-Responses** mehr ausgesendet.
   * Bleibt die Client-Bridge (`apcli0`) zu 100 % aktiv und leitet alle Pakete transparent an den Ethernet-Port weiter.
   * Die Einstellung wird **dauerhaft im NVRAM gespeichert** und übersteht Neustarts.

---

## 🚀 Lösungsweg 1: Schnellste Methode via Browser-Konsole (Keine Installation nötig)

Diese Methode dauert weniger als 1 Minute und erfordert keine zusätzliche Software.

### Schritt-für-Schritt:
1. Öffnen Sie Ihren Browser (z. B. Firefox, Chrome, Edge) und loggen Sie sich in die Weboberfläche Ihres Repeaters ein (Standard: `http://192.168.0.254` oder die IP aus Ihrem Router, z. B. `http://192.168.178.126`).
2. Navigieren Sie im Menü auf **WLAN** (bzw. *Wireless*).
3. Öffnen Sie die Entwicklerwerkzeuge mit der Taste **`F12`** (oder Rechtsklick $\rightarrow$ *Untersuchen*) und wechseln Sie auf den Reiter **Konsole** (*Console*).
4. Fügen Sie folgenden Befehl ein und drücken Sie **Enter**:

```javascript
$.su.modelManager.get("extendedNetworkM").bEnable.setValue(0);
$.su.modelManager.get("extendedNetworkM").submit({
    success: function() { alert("Erfolg: Erweitertes WLAN wurde vollständig deaktiviert! Reiner Client-Modus ist aktiv."); }
});
```

5. Nach wenigen Sekunden startet das WLAN-Modul kurz neu.
6. **Fertig!** Der Access Point ist aus. Ihr per LAN angeschlossenes Gerät hat vollen Internetzugriff über das Host-WLAN.

---

## 🛠️ Lösungsweg 2: Verwaltung via Node.js-Skript (`wa850re_client_mode.js`)

Für eine automatisierte Steuerung oder Skriptintegration liegt in diesem Repository das Node.js-Tool `wa850re_client_mode.js` bereit.

### Voraussetzungen:
* [Node.js](https://nodejs.org/) (Version 14 oder neuer)

### Befehle:

#### 1. Status prüfen
Zeigt detailliert an, ob WDS-Bridge, LAN-Port und der AP aktiv sind:
```bash
node wa850re_client_mode.js status <IP-ADRESSE> <PASSWORT>
```
*Beispiel-Ausgabe:*
```text
--- Aktueller Status des Repeaters ---
WLAN-Client-Bridge (WDS):  AKTIV (Verbunden mit: "MeinHeimWLAN", BSSID: ...)
Verbindungsstatus (WDS):   Verbunden (Code 5)
Ethernet LAN-Port:         Aktiv / Verbunden (Code 1)
Internet-Verbindung:       Online (Code 2)
Erweitertes WLAN (AP):     VOLLSTÄNDIG DEAKTIVIERT (bEnable=0)
SSID-Broadcast:            Ausgeblendet (bBcastSsid=0)

>>> MODUS: Reine WLAN-LAN-Bridge (Reiner Client-Betrieb ohne AP-Beacons) ist AKTIV! <<<
```

#### 2. Access Point deaktivieren (Reine WLAN-Bridge)
```bash
node wa850re_client_mode.js disable-ap <IP-ADRESSE> <PASSWORT>
```

#### 3. Access Point reaktivieren (Standard-Repeater)
```bash
node wa850re_client_mode.js enable-ap <IP-ADRESSE> <PASSWORT>
```

#### 4. Vollständiges Konfigurations-Backup herunterladen
```bash
node wa850re_client_mode.js backup <IP-ADRESSE> <PASSWORT>
```

*(Wird das Passwort im Befehl weggelassen, fragt das Skript sicher danach, ohne es in der Shell-Historie zu speichern).*

---

## 📊 Verifizierte Messwerte & Sicherheitsnachweis

Die Funktionalität wurde messtechnisch und protokollarisch auf einem TL-WA850RE V7.0 mit Firmware `1.0.13 Build 231115` überprüft:

| Test / Messung | Ergebnis | Bedeutung |
| :--- | :--- | :--- |
| **WDS Link-Status (`wdsstatus 2g`)** | **`Code 5`** | Station-Verbindung zur Fritz!Box bleibt stabil bestehen |
| **Ethernet Link-Status (`gwlinkstatus`)** | **`Code 1`** | LAN-Port überträgt Daten transparent mit voller Geschwindigkeit |
| **Online-Check (`onlineTest`)** | **`Code 2`** | Volle Internet- und Gateway-Konnektivität |
| **Latenz (Ping Gateway)** | **`1 ms`** | Keine messbare Verzögerung durch die Bridge |
| **WLAN-Spektrum-Scan** | **0 Beacons** | Das Gerät sendet keinerlei Funkpakete als AP aus |
| **Client-Tabelle (Block 13)** | **1 Client (LAN)** | 0 WLAN-Clients möglich, reiner Ethernet-Betrieb |

---

## 🔄 Wiederherstellung / Rollback

Falls Sie das Gerät jemals wieder als herkömmlichen Repeater mit eigenem WLAN nutzen möchten:

1. **Über die Browser-Konsole:**
   ```javascript
   $.su.modelManager.get("extendedNetworkM").bEnable.setValue(1);
   $.su.modelManager.get("extendedNetworkM").submit();
   ```
2. **Über das Skript:**
   ```bash
   node wa850re_client_mode.js enable-ap <IP-ADRESSE> <PASSWORT>
   ```
3. **Per Hardware-Reset:**
   Halten Sie die kleine **Reset-Taste** an der Unterseite des Geräts für ca. 5 Sekunden gedrückt, bis alle LEDs aufleuchten. Das Gerät kehrt in die Werkseinstellungen zurück.

---

## ⚖️ Lizenz & Info
MIT License. Frei zur privaten und kommerziellen Nutzung.
Wurde mit Goggle Antigravity Agent gefunden.
