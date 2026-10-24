/**
 * TP-Link TL-WA850RE V7.0 Management Utility
 * Pure WLAN-LAN-Bridge / Client Mode Manager
 *
 * Usage:
 *   node wa850re_client_mode.js status [ip] [password]
 *   node wa850re_client_mode.js disable-ap [ip] [password]
 *   node wa850re_client_mode.js enable-ap [ip] [password]
 *   node wa850re_client_mode.js backup [ip] [password]
 */

const http = require('http');
const fs = require('fs');
const readline = require('readline');

function encrypt(e, t, r) {
    if (!r) r = 'yLwVl0zKqws7LgKPRQ84Mdt708T1qQ3Ha7xv3H7NyU84p21BriUWBU43odz3iP4rBL3cD02KZciXTysVXiV8ngg6vL48rPJyAUw0HurW20xqxv9aYb4M9wK1Ae0wlro510qXeU07kV57fQMc8L6aLgMLwygtc0F10a0Dg70TOoouyFhdysuRMO51yY5ZlOZZLEal1h0t9YQW0Ko7oBwmCAHoic4HYbUyVeU3sfQ1xtXcPcf1aT303wAQhv66qzW';
    if (!t) t = 'RDpbLfCPsJZ7fiv';
    let n = '', s = 187, a = 187, o = e.length, l = t.length, u = r.length, d = l < o ? o : l;
    for (let h = 0; h < d; h++) {
        a = s = 187;
        if (o <= h) a = t.charCodeAt(h);
        else if (l <= h) s = e.charCodeAt(h);
        else { s = e.charCodeAt(h); a = t.charCodeAt(h); }
        n += r.charAt((s ^ a) % u);
    }
    return n;
}

function request(ip, path, body) {
    return new Promise((resolve, reject) => {
        const bodyBuf = Buffer.from(body || '', 'utf-8');
        const req = http.request({
            hostname: ip,
            port: 80,
            path: path,
            method: body !== null && body !== undefined ? 'POST' : 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
                'Accept': '*/*',
                'Referer': `http://${ip}/`,
                'Content-Type': 'text/plain;charset=UTF-8',
                'Content-Length': bodyBuf.length
            }
        }, (res) => {
            let bufs = [];
            res.on('data', chunk => bufs.push(chunk));
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, data: Buffer.concat(bufs) }));
        });
        req.on('error', reject);
        if (bodyBuf.length > 0) req.write(bodyBuf);
        req.end();
    });
}

async function login(ip, password) {
    const checkRes = await request(ip, '/?code=7&asyn=1', 'loginCheck');
    const parts = checkRes.data.toString('utf-8').replace(/\r\n$/, '').split('\r\n');
    const o = parts.slice(1);
    const encPwd = encrypt(password);
    const sessionToken = encrypt(o[2], encPwd, o[3]);
    const loginRes = await request(ip, `/?code=7&asyn=0&id=${encodeURIComponent(sessionToken)}`, '');
    if (loginRes.statusCode !== 200 && !loginRes.data.toString('utf-8').startsWith('00000')) {
        throw new Error('Authentifizierung fehlgeschlagen. Bitte Passwort prüfen.');
    }
    return sessionToken;
}

async function getStatus(ip, token) {
    const r33 = await request(ip, `/?code=2&asyn=0&id=${encodeURIComponent(token)}`, '33|1,1,0');
    const r32 = await request(ip, `/?code=2&asyn=0&id=${encodeURIComponent(token)}`, '32|1,0,0');
    const wds = await request(ip, `/?code=0&asyn=0&id=${encodeURIComponent(token)}`, 'wlan wdsstatus 2g');
    const lan = await request(ip, `/?code=0&asyn=0&id=${encodeURIComponent(token)}`, 'main lan -gwlinkstatus');
    const online = await request(ip, `/?code=0&asyn=0&id=${encodeURIComponent(token)}`, 'main onlineTest');

    const lines33 = r33.data.toString('utf-8').split('\r\n');
    const lines32 = r32.data.toString('utf-8').split('\r\n');

    const getVal = (lines, key) => {
        const found = lines.find(l => l.startsWith(key + ' '));
        return found ? found.substring(key.length + 1) : '';
    };

    return {
        apEnabled: getVal(lines33, 'bEnable') === '1',
        apBcast: getVal(lines33, 'bBcastSsid') === '1',
        apSsid: decodeURIComponent(getVal(lines33, 'cSsid')),
        bridgeEnabled: getVal(lines32, 'bBridgeEnabled') === '1',
        hostSsid: decodeURIComponent(getVal(lines32, 'cBridgedSsid')),
        hostBssid: getVal(lines32, 'cBridgedBssid'),
        wdsStatus: wds.data.toString('utf-8').trim().split('\r\n')[1] || '',
        lanStatus: lan.data.toString('utf-8').trim().split('\r\n')[1] || '',
        onlineStatus: online.data.toString('utf-8').trim().split('\r\n')[1] || ''
    };
}

async function setApState(ip, token, enable) {
    const readRes = await request(ip, `/?code=2&asyn=0&id=${encodeURIComponent(token)}`, '33|1,1,0');
    const raw = readRes.data.toString('utf-8').replace(/\r\n$/, '').split('\r\n');
    if (raw[0] === '00000') raw.shift();

    const targetVal = enable ? 'bEnable 1' : 'bEnable 0';
    const updated = raw.map(line => {
        if (line.startsWith('bEnable ')) return targetVal;
        return line;
    });

    const payload = updated.join('\r\n') + '\r\n';
    const writeRes = await request(ip, `/?code=1&asyn=0&id=${encodeURIComponent(token)}`, payload);
    const respStr = writeRes.data.toString('utf-8');
    if (!respStr.startsWith('00000')) {
        throw new Error('Fehler beim Schreiben der Konfiguration: ' + respStr);
    }
}

async function main() {
    const action = process.argv[2] || 'status';
    const ip = process.argv[3] || process.env.ROUTER_IP || '192.168.178.126';
    let password = process.argv[4] || process.env.ROUTER_PASSWORD;

    if (!password) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        password = await new Promise(resolve => rl.question('Repeater Web-Passwort eingeben: ', ans => { rl.close(); resolve(ans.trim()); }));
    }

    console.log(`[Info] Verbinde mit TL-WA850RE (${ip})...`);
    const token = await login(ip, password);
    console.log(`[OK] Authentifizierung erfolgreich.`);

    if (action === 'status') {
        const s = await getStatus(ip, token);
        console.log('\n--- Aktueller Status des Repeaters ---');
        console.log(`WLAN-Client-Bridge (WDS):  ${s.bridgeEnabled ? 'AKTIV' : 'INAKTIV'} (Verbunden mit: "${s.hostSsid}", BSSID: ${s.hostBssid})`);
        console.log(`Verbindungsstatus (WDS):   ${s.wdsStatus === '5' ? 'Verbunden (Code 5)' : 'Code ' + s.wdsStatus}`);
        console.log(`Ethernet LAN-Port:         ${s.lanStatus === '1' ? 'Aktiv / Verbunden (Code 1)' : 'Getrennt (Code ' + s.lanStatus + ')'}`);
        console.log(`Internet-Verbindung:       ${s.onlineStatus === '2' ? 'Online (Code 2)' : 'Code ' + s.onlineStatus}`);
        console.log(`Erweitertes WLAN (AP):     ${s.apEnabled ? 'AKTIVIERT (SSID: "' + s.apSsid + '")' : 'VOLLSTÄNDIG DEAKTIVIERT (bEnable=0)'}`);
        console.log(`SSID-Broadcast:            ${s.apBcast ? 'Sichtbar (bBcastSsid=1)' : 'Ausgeblendet (bBcastSsid=0)'}`);
        if (!s.apEnabled && s.wdsStatus === '5' && s.lanStatus === '1') {
            console.log('\n>>> MODUS: Reine WLAN-LAN-Bridge (Reiner Client-Betrieb ohne AP-Beacons) ist AKTIV! <<<');
        }
    } else if (action === 'disable-ap') {
        console.log('[Aktion] Deaktiviere erweiterten Access Point (bEnable = 0)...');
        await setApState(ip, token, false);
        console.log('[OK] Access Point erfolgreich abgeschaltet. Reiner WLAN-Client-Bridge-Modus ist aktiv.');
    } else if (action === 'enable-ap') {
        console.log('[Aktion] Aktiviere erweiterten Access Point (bEnable = 1)...');
        await setApState(ip, token, true);
        console.log('[OK] Access Point wieder aktiviert.');
    } else if (action === 'backup') {
        console.log('[Aktion] Lade vollständiges Konfigurations-Backup herunter...');
        const res = await request(ip, `/?code=0&asyn=0&id=${encodeURIComponent(token)}`, null);
        // Wait, for backup the URL is /config.bin
        const bkpRes = await request(ip, `/config.bin?code=0&asyn=0&id=${encodeURIComponent(token)}`, null);
        const filename = `backup_config_${Date.now()}.bin`;
        fs.writeFileSync(filename, bkpRes.data);
        console.log(`[OK] Backup erfolgreich gespeichert in: ${filename}`);
    } else {
        console.log('Unbekannte Aktion. Verfügbar: status, disable-ap, enable-ap, backup');
    }
}

main().catch(err => {
    console.error('[Fehler]', err.message);
    process.exit(1);
});
