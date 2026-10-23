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

// Sizin Azərbaycan nömrəniz
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

let isCodeRequested = false; // Kodun təkrar-təkrar istənilməsinin qarşısını alan kontrol

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    // Qeydiyyat yoxdursa, 10 saniyə gözləyib YALNIZ 1 DƏFƏ kod tələb edir
    if (!sock.authState.creds.registered && !isCodeRequested) {
        isCodeRequested = true;
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(PHONE_NUMBER);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log("\n==========================================");
                console.log(`🔑 SİZİN SABİT PAIRING KODUNUZ: ${code}`);
                console.log("QOŞULMAQ ÜÇÜN TƏLƏS MƏDƏN BU KODU İSTİFADƏ EDİN!");
                console.log("==========================================\n");
            } catch (err) {
                console.error("Pairing code alınarkən xəta:", err);
                isCodeRequested = false; // Xəta olarsa, yenidən cəhd etməyə icazə ver
            }
        }, 10000); // 10 saniyə gözləmə vaxtı
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

    // Mesaj cavablandırma məntiqi
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
                await delay(Math.floor(Math.random() * 1000) + 1000);
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

startBot();
