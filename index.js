const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 10000;
let sock = null;
let currentPairingCode = "Hələ yaradılmayıb. Aşağıdakı düyməni basın.";
let isConnected = false;

// Gemini AI Setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const PHONE_NUMBER = "994554219530"; 

// Şablonlar
const TEMPLATE_1 = `Salam hər vaxtınız xeyir,
🚗Avtomobilinizi bizimlə sürətli satın!
ℹ️Naxcars Platforması olaraq sərfəli qiymətlərlə elanlarınızı paylaşa bilərik, belə ki Qiymətlər bizdə elan növünə görə dəyişir :
ℹ️ELAN PAKETLƏRİMİZ:
➡️ Standart: ( 2 AZN — 14 gün)
➡️ Premium: (3 AZN — 20 gün)
➡️ VIP: (4 AZN — 30 gün)
Elanlar saytda VIP, Premium və Standart ardıcıllığı ilə sıralanır.
🎁 ÖZƏL HƏDİYYƏMİZ:
Saytımızda yerləşdirilən hər bir *Premium Paketli* elan müddəti bitdikdən sonra *VİP Paketli* elan növü olaraq *əlavə hədiyyə müddəti* qazanır.
🌍✅️Saytımız İnternet üzərindən qlobal axtarış sistemlərinə tam inteqrasiya olunub! Google və digər brauzerlərdə sadəcə "Naxcars" yazaraq axtarış edib, baxa bilərsiniz. Məlumat üçün:
↪️https://naxcarspltfrm.base44.app/
Diqqətiniz üçün təşəkkürlər!`;

const TEMPLATE_2 = `Salam hər vaxtınız xeyir olsun, elanı *Saytımızda , Facebookda səhifəmizdə və Maşın alqı-satqı qruplarımızda və həmçinin Telegramda elan alqı-satqı kanallarımızda* paylaşılır, avtomobilinizi bizimlə *sürətli* satın!`;
const TEMPLATE_3 = `Neçə günlük istəyirsiz zəhmət olmasa qeyd edin, avtomobilin şəkillərini və haqqında məlumatı göndərin , paylaşaq.`;
const TEMPLATE_4 = `Salam hər vaxtınız xeyir, əlavə suallarınız varsa zəhmət olmasa buradan yazın cavablandırılacaq, təşəkkürlər.`;
const TEMPLATE_7 = `Tamam , yerləşdirilib linki sizə atılacaq özünüz də baxacaqsınız, sonra ödəniş üçün məlumat göndəriləcək, təşəkkürlər.`;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ["Mac OS", "Chrome", "121.0.6167.160"],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            isConnected = false;
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                setTimeout(() => startBot(), 5000);
            }
        } else if (connection === 'open') {
            isConnected = true;
            currentPairingCode = "✅ Uğurla Qoşuldu!";
            console.log('✅ BOT UĞURLA QOŞULDU VƏ AKTİVDİR!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;

            const from = msg.key.remoteJid;
            if (from.endsWith('@g.us')) continue;

            const userMessage = (msg.message.conversation || 
                                msg.message.extendedTextMessage?.text || '').trim();

            if (!userMessage) continue;

            try {
                await sock.readMessages([msg.key]);
                await delay(1500);
                await sock.sendPresenceUpdate('composing', from);

                let replyText = "";
                const lowerMsg = userMessage.toLowerCase();

                if (userMessage === "?") {
                    replyText = TEMPLATE_4;
                }
                else if (lowerMsg.includes("il") && (lowerMsg.includes("qiymət") || lowerMsg.includes("satıram") || lowerMsg.includes("şəkil") || lowerMsg.includes("məlumat"))) {
                    replyText = TEMPLATE_7;
                }
                else if (lowerMsg.includes("naxcars") || lowerMsg.includes("elan") || lowerMsg.includes("maşın") || lowerMsg.includes("avtomobil") || lowerMsg.includes("qiymət") || lowerMsg.includes("paylaş")) {
                    await sock.sendMessage(from, { text: TEMPLATE_1 });
                    await delay(1500);
                    await sock.sendMessage(from, { text: TEMPLATE_2 });
                    await delay(1500);
                    replyText = TEMPLATE_3;
                } 
                else {
                    const prompt = `İstifadəçi mesajı: "${userMessage}"\n\nBu Naxcars avtomobil elanları platformasının köməkçisiyik. İstifadəçiyə qısa və nəzakətli cavab yaz.`;
                    const result = model.generateContent(prompt);
                    replyText = (await result).response.text();
                }

                await sock.sendPresenceUpdate('paused', from);
                if (replyText) {
                    await sock.sendMessage(from, { text: replyText });
                }

            } catch (error) {
                console.error('Xəta:', error);
                await sock.sendMessage(from, { text: "Salam! Müraciətiniz qəbul olundu, qısa zamanda baxılacaq." });
            }
        }
    });
}

// Veb Panel və On-Demand Kod İstəyi
http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    if (parsedUrl.pathname === '/generate-code' && sock && !isConnected) {
        try {
            let code = await sock.requestPairingCode(PHONE_NUMBER);
            code = code?.match(/.{1,4}/g)?.join("-") || code;
            currentPairingCode = code;
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true, code: code }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
        <!DOCTYPE html>
        <html lang="az">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Naxcars WhatsApp Bot - Panel</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 40px 20px; background: #0f172a; color: #f8fafc; }
                .card { background: #1e293b; padding: 25px; border-radius: 12px; display: inline-block; max-width: 400px; width: 100%; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
                h2 { color: #38bdf8; margin-bottom: 10px; }
                p { color: #94a3b8; font-size: 14px; }
                .code-box { font-size: 26px; font-weight: bold; background: #334155; padding: 15px; border-radius: 8px; margin: 20px 0; letter-spacing: 2px; color: #4ade80; word-break: break-all; }
                .btn-primary { background: #38bdf8; color: #0f172a; border: none; padding: 12px 20px; font-size: 16px; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%; margin-bottom: 10px; }
                .btn-primary:hover { background: #0ea5e9; }
                .btn-success { background: #22c55e; color: white; border: none; padding: 12px 20px; font-size: 16px; border-radius: 6px; cursor: pointer; font-weight: bold; width: 100%; }
                .btn-success:hover { background: #16a34a; }
                .msg { margin-top: 15px; color: #fbbf24; font-size: 14px; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>Naxcars WhatsApp Bot</h2>
                <p>Gecikməni aradan qaldırmaq üçün əvvəlcə düyməni sıxıb təzə kod yaradın:</p>
                <button class="btn-primary" onclick="generateCode()">🔄 Yeni Kod Al</button>
                <div class="code-box" id="codeText">${currentPairingCode}</div>
                <button class="btn-success" onclick="copyCode()">📋 Kodu Panoya Kopyala</button>
                <div class="msg" id="msg"></div>
            </div>
            <script>
                async function generateCode() {
                    document.getElementById('msg').innerText = '⏳ Kod yaradılır, gözləyin...';
                    try {
                        const res = await fetch('/generate-code');
                        const data = await res.json();
                        if(data.success) {
                            document.getElementById('codeText').innerText = data.code;
                            document.getElementById('msg').innerText = '✅ Yeni kod uğurla yaradıldı!';
                        } else {
                            document.getElementById('msg').innerText = '❌ Xəta baş verdi, yenidən sınayın.';
                        }
                    } catch(e) {
                        document.getElementById('msg').innerText = '❌ Bağlantı xətası!';
                    }
                }
                function copyCode() {
                    const code = document.getElementById('codeText').innerText;
                    if(code.includes("Hələ") || code.includes("Uğurla")) {
                        alert("Əvvəlcə 'Yeni Kod Al' düyməsinə basın!");
                        return;
                    }
                    navigator.clipboard.writeText(code).then(() => {
                        document.getElementById('msg').innerText = '✅ Kod panoya kopyalandı!';
                        setTimeout(() => document.getElementById('msg').innerText = '', 3000);
                    }).catch(err => {
                        alert('Xəta: ' + err);
                    });
                }
            </script>
        </body>
        </html>
    `);
}).listen(PORT, () => console.log(`Server listening on port ${PORT}`));

startBot();
