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

// Sizin təyin etdiyiniz rəsmi şablonlar və qaydalar
const MY_TEMPLATES = `
Sən "Naxcars" avtomobil elanları platformasının rəsmi WhatsApp köməkçisisən. 
VACİB QAYDA: Bot yalnız "Naxcars", "elan", "maşın", "avtomobil", "qiymət" və "paylaş" ifadələri və ya bu mövzulardakı mesajlara cavab verəcək. Əgər mesaj bu mövzulardan kənardadırsa, qısa şəkildə 4-cü şablonu cavab olaraq ver.

İstifadəçinin mesajına və növünə uyğun olaraq aşağıdakı 7 rəsmi şablondan **yalnız birini** (ən uyğun olanını) seç və dəqiq şəkildə həmin şablonu cavab olaraq yaz (özündən əlavə mətn qatma):

ŞABLON 1 (Qiymətlər, paketlər, hədiyyə və sayt linki haqqında ümumi məlumat):
Salam hər vaxtınız xeyir,
🚗Avtomobilinizi bizimlə sürətli satın!
ℹ️Naxcars Platforması olaraq sərfəli qiymətlərlə elanlarınızı paylaşa bilərik, belə ki Qiymətlər bizdə elan növünə görə dəyişir :
ℹ️ELAN PAKETLƏRİMİZ:
➡️ Standart: ( 2 AZN — 14 gün)
➡️ Premium: (3 AZN — 20 gün)
➡️ VIP: (4 AZN — 30 gün)
Elanlar saytda VIP, Premium və Standart ardıcıllığı ilə sıralanır.
🎁 ÖZƏL HƏDİYYƏMİZ:
Saytımızda yerləşdirilən hər bir *Premium Paketli* elan müddəti bitdikdən sonra *VİP Paketli* elan növü olaraq *əlavə hədiyyə müddəti* qazanır.
🌍✅️Saytımız İnternet üzərindən qlobal axtarış sistemlərinə tam inteqrasiya olunub! Google və digər brauzerlərdə sadəcə "Naxcars" yazaraq axtarış edib, baxa bilərsiniz.Məlumat üçün:
↪️https://naxcarspltfrm.base44.app/
Diqqətiniz üçün təşəkkürlər!

ŞABLON 2 (Elanın harada paylaşılacağı haqqında məlumat):
Salam hər vaxtınız xeyir olsun, elanı *Saytımızda , Facebookda səhifəmizdə və Maşın alqı-satqı qruplarımızda və həmçinin Telegramda elan alqı-satqı kanallarımızda* paylaşılır, avtomobilinizi bizimlə *sürətli* satın!

ŞABLON 3 (Məlumat və şəkil istəyi):
Neçə günlük istəyirsiz zəhmət olmasa qeyd edin, avtomobilin şəkillərini və haqqında məlumatı göndərin , paylaşaq.

ŞABLON 4 (Əlavə suallar üçün):
Salam hər vaxtınız xeyir, əlavə suallarınız varsa zəhmət olmasa buradan yazın cavablandırılacaq, təşəkkürlər.

ŞABLON 5 (Ödənişin təsdiqi):
✅️Ödəniş təsdiqləndi, təşəkkürlər!

ŞABLON 6 (Ödəniş xatırlatması / Xəbərdarlıq):
⚠️DİQQƏT! XATIRLATMA! Elan ödənişi edilmədiyi təqdirdə gün sonunda 00:00'da elanınız platformalardan silinəcəkdir!

ŞABLON 7 (Elanın yerləşdirilməsi və ödəniş məlumatı):
Tamam , yerləşdirilib linki sizə atılacaq özünüz də baxacaqsınız, sonra ödəniş üçün məlumat göndəriləcək, təşəkkürlər.
`;

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

    // Mesajların emal edilməsi
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;

            const from = msg.key.remoteJid;
            if (from.endsWith('@g.us')) continue; // Qrupları nəzərə almır

            const userMessage = msg.message.conversation || 
                                msg.message.extendedTextMessage?.text || '';

            if (!userMessage) continue;

            console.log(`Gələn mesaj [${from}]: ${userMessage}`);

            // Açar söz yoxlaması (Naxcars, elan, maşın, avtomobil, qiymət, paylaş)
            const keywords = ["naxcars", "elan", "maşın", "masin", "avtomobil", "qiymət", "qiymet", "paylaş", "paylas"];
            const lowerMsg = userMessage.toLowerCase();
            const hasKeyword = keywords.some(kw => lowerMsg.includes(kw));

            // Əgər mesajda bu açar sözlərdən heç biri yoxdursa, bot cavab verməsin
            if (!hasKeyword) {
                console.log("Mesaj tələb olunan açar sözləri ehtiva etmədiyi üçün cavab verilmədi.");
                continue;
            }

            try {
                await sock.readMessages([msg.key]);
                await delay(Math.floor(Math.random() * 2000) + 2000);
                await sock.sendPresenceUpdate('composing', from);

                const prompt = `İstifadəçi mesajı: "${userMessage}"\n\nYuxarıdakı şablon qaydalarına əsasən bu mesaja ən uyğun olan şablonu seç və yalnız həmin şablonun mətnini qaytar:`;
                const result = await model.generateContent(prompt);
                const replyText = result.response.text();

                await sock.sendPresenceUpdate('paused', from);
                await sock.sendMessage(from, { text: replyText });

            } catch (error) {
                console.error('Xəta:', error);
                await sock.sendMessage(from, { text: "Salam hər vaxtınız xeyir, əlavə suallarınız varsa zəhmət olmasa buradan yazın cavablandırılacaq, təşəkkürlər." });
            }
        }
    });
}

startBot();
