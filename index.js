const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fetch = require('node-fetch');

// 🔑 API Açarını Render-in Environment Variables hissəsindən təhlükəsiz götürürük
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 📝 SİZİN ŞABLON CAVABLARINIZ
const MY_TEMPLATES = `
1. Qiymət və ya xidmət soruşursa: "Salam! Xidmətlərimiz haqqında ətraflı məlumatı saytımızdan əldə edə bilərsiniz."
2. İş saatları soruşursa: "Salam! İş saatlarımız həftəiçi 09:00 - 18:00 kimidir."
3. Sadəcə salam verirsə: "Salam! Müraciətiniz üçün təşəkkür edirik, qısa müddətdə geri dönüş edəcəyik."
`;

function getRandomDelay(minSeconds, maxSeconds) {
    return Math.floor(Math.random() * (maxSeconds - minSeconds + 1) + minSeconds) * 1000;
}

async function getAIResponse(incomingMessage) {
    try {
        if (!GEMINI_API_KEY) {
            console.error("XƏTA: GEMINI_API_KEY təyin edilməyib!");
            return "Salam! Müraciətiniz qəbul olundu, qısa zamanda baxılacaq.";
        }

        const prompt = `Sən WhatsApp asistansan. Şablonlar:\n${MY_TEMPLATES}\nGələn Mesaj: "${incomingMessage}"\nYuxarıdakı şablonlardan ən uyğununu seç və qısa, nəzakətli cavab yaz.`;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error("AI Error:", error);
        return "Salam! Müraciətiniz qəbul olundu, qısa zamanda baxılacaq.";
    }
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({ auth: state, printQRInTerminal: true, browser: ["Ubuntu", "Chrome", "20.0.04"] });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBot();
        } else if (connection === 'open') {
            console.log('✅ Bot 7/24 Aktivdir!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe || msg.key.remoteJid.includes('@g.us')) return;

        const senderJid = msg.key.remoteJid;
        const incomingText = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        if (!incomingText) return;

        console.log(`📩 Yeni mesaj gəldi: ${incomingText}`);

        try {
            await sock.readMessages([msg.key]);
            await delay(getRandomDelay(2, 4));
            await sock.sendPresenceUpdate('composing', senderJid);

            const aiReply = await getAIResponse(incomingText);
            await delay(1500);

            await sock.sendMessage(senderJid, { text: aiReply });
            await sock.sendPresenceUpdate('paused', senderJid);
        } catch (err) {
            console.error("Xəta:", err);
        }
    });
}

startBot();
