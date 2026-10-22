const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');

// Render üçün HTTP Server (Port 10000)
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WhatsApp Bot Server Alive!');
}).listen(PORT, () => console.log(`Server listening on port ${PORT}`));

// Gemini AI Setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Sizin Azərbaycan nömrəniz (994 + 554219530)
const PHONE_NUMBER = "994554219530"; 

const MY_TEMPLATES = `
Sen menim sexsi WhatsApp asistanimsa. Nəzakətli, qısa və aydın cavablar ver.
Bizim təklif etdiyimiz xidmətlər:
- Veb saytların və botların hazırlanması
- Xüsusi avtomatlaşdırma skriptləri
Sual verdikdə qısa və dürüst cavab ver.
`;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // QR kod lazımdır deyil
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    // Qeydiyyat olmayıbsa Pairing Code tələb et
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(PHONE_NUMBER);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log("\n==========================================");
                console.log(`🔑 SİZİN PAIRING KODUNUZ: ${code}`);
                console.log("==========================================\n");
            } catch (err) {
                console.error("Pairing code alınarkən xəta:", err);
            }
        }, 3000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Bağlantı kəsildi. Yenidən qoşulur...', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ Bot WhatsApp-a UĞURLA BAĞLANDI VƏ 7/24 AKTİVDİR!');
        }
    });

    // Mesajları emal etmək
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;

            const from = msg.key.remoteJid;
            if (from.endsWith('@g.us')) continue; // Qruplara cavab vermir

            const userMessage = msg.message.conversation || 
                                msg.message.extendedTextMessage?.text || '';

            if (!userMessage) continue;

            console.log(`Gələn mesaj [${from}]: ${userMessage}`);

            try {
                await sock.readMessages([msg.key]);
                await delay(Math.floor(Math.random() * 2000) + 2000);
                await sock.sendPresenceUpdate('composing', from);

                const prompt = `İstifadəçi mesajı: "${userMessage}"\n\nTəlimatlar:\n${MY_TEMPLATES}\n\nBu təlimatlara əsasən istifadəçiyə cavab yaz:`;
                const result = await model.generateContent(prompt);
                const replyText = result.response.text();

                await sock.sendPresenceUpdate('paused', from);
                await sock.sendMessage(from, { text: replyText });

            } catch (error) {
                console.error('Xəta:', error);
                await sock.sendMessage(from, { text: "Salam! Müraciətiniz qəbul olundu, qısa zamanda baxılacaq." });
            }
        }
    });
}

startBot();
