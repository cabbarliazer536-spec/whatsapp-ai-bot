const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys');
const http = require('http');

// Render üçün HTTP Server (Port 10000)
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WhatsApp Bot Server Alive!');
}).listen(PORT, () => console.log(`Server listening on port ${PORT}`));

// Sizin nömrəniz
const PHONE_NUMBER = "994554219530"; 

// NAXCARDS RƏSMİ ŞABLONLARI
const TEMPLATES = {
    // 1. Qiymətlər, paketlər və ümumi məlumat
    pricing: `Salam hər vaxtınız xeyir,
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
Diqqətiniz üçün təşəkkürlər!`,

    // 2. Elanın harada paylaşılacağı
    sharing: `Salam hər vaxtınız xeyir olsun, elanı *Saytımızda , Facebookda səhifəmizdə və Maşın alqı-satqı qruplarımızda və həmçinin Telegramda elan alqı-satqı kanallarımızda* paylaşılır, avtomobilinizi bizimlə *sürətli* satın!`,

    // 3. Elan yerləşdirmək / şəkil istəmək
    posting: `Neçə günlük istəyirsiz zəhmət olmasa qeyd edin, avtomobilin şəkillərini və haqqında məlumatı göndərin , paylaşaq.`,

    // 4. Əlavə suallar üçün cavab
    defaultAnswer: `Salam hər vaxtınız xeyir, əlavə suallarınız varsa zəhmət olmasa buradan yazın cavablandırılacaq, təşəkkürlər.`,

    // 5. Ödəniş təsdiqi
    paymentConfirmed: `✅️Ödəniş təsdiqləndi, təşəkkürlər!`,

    // 6. Ödəniş xatırlatması
    paymentReminder: `⚠️DİQQƏT! XATIRLATMA! Elan ödənişi edilmədiyi təqdirdə gün sonunda 00:00'da elanınız platformalardan silinəcəkdir!`,

    // 7. Link gözləyənlərə
    linkReady: `Tamam , yerləşdirilib linki sizə atılacaq özünüz də baxacaqsınız, sonra ödəniş üçün məlumat göndəriləcək, təşəkkürlər.`
};

// Gələn mesaja görə uyğun şablonu seçən funksiya
function getReply(message) {
    const text = message.toLowerCase();

    if (text.includes('qiymət') || text.includes('paket') || text.includes('standart') || text.includes('premium') || text.includes('vip') || text.includes('sayt') || text.includes('link') || text.includes('neçə')) {
        return TEMPLATES.pricing;
    }
    if (text.includes('hara') || text.includes('facebook') || text.includes('telegram') || text.includes('qrup') || text.includes('paylaşılır')) {
        return TEMPLATES.sharing;
    }
    if (text.includes('elan') || text.includes('satmaq') || text.includes('şəkil') || text.includes('göndərim') || text.includes('yerləşdirmək')) {
        return TEMPLATES.posting;
    }
    if (text.includes('ödədim') || text.includes('ödəniş etdim') || text.includes('pulu göndərdim')) {
        return TEMPLATES.paymentConfirmed;
    }
    if (text.includes('xatırlat') || text.includes('silinəcək') || text.includes('vaxtı bitir')) {
        return TEMPLATES.paymentReminder;
    }
    if (text.includes('hazırdır') || text.includes('yerləşdirilib') || text.includes('baxdım')) {
        return TEMPLATES.linkReady;
    }

    // Əgər uyğun açar söz tapılmazsa standart cavab qayıtsın
    return TEMPLATES.defaultAnswer;
}

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
                console.log(`🔑 SİZİN TƏSDİQ KODUNUZ: ${code}`);
                console.log("==========================================\n");
            } catch (err) {
                console.error("Pairing code xətası:", err);
            }
        }, 5000);
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

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;

            const from = msg.key.remoteJid;
            if (from.endsWith('@g.us')) continue; 

            const userMessage = msg.message.conversation || 
                                msg.message.extendedTextMessage?.text || '';

            if (!userMessage) continue;

            console.log(`Gələn mesaj [${from}]: ${userMessage}`);

            try {
                await sock.readMessages([msg.key]);
                await delay(1500);
                await sock.sendPresenceUpdate('composing', from);

                // Birbaşa sizin şablonlardan cavab seçilir
                const replyText = getReply(userMessage);

                await sock.sendPresenceUpdate('paused', from);
                await sock.sendMessage(from, { text: replyText });

            } catch (error) {
                console.error('Mesaj göndərilərkən xəta:', error);
            }
        }
    });
}

startBot();
