const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, delay, Browsers } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const http = require('http');
const pino = require('pino');
const fs = require('fs');

// Render üçün HTTP Server (Port 10000)
const PORT = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WhatsApp Bot Server Alive!');
}).listen(PORT, () => console.log(`Server listening on port ${PORT}`));

// Gemini AI Setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateGeminiReply(prompt) {
    const modelsToTry = ["gemini-2.0-flash", "gemini-1.5-flash-latest", "gemini-1.5-flash"];
    
    for (const modelName of modelsToTry) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            if (result && result.response) {
                return result.response.text();
            }
        } catch (err) {
            console.warn(`[${modelName}] modeli xəta verdi, növbəti modelə keçilir...`);
        }
    }
    throw new Error("Bütün Gemini modelləri xəta verdi.");
}

const PHONE_NUMBER = "994554219530"; 

const MY_TEMPLATES = `
Sən "Naxcars" avtomobil elanları platformasının rəsmi WhatsApp köməkçisən. 
Müştərinin mesajında "naxcars", "elan", "maşın", "paylaş", "avtomobil", "qiymət", "ödəniş" kimi sözlər və ya bu mövzularda suallar olduqda, mütləq aşağıdakı 7 rəsmi şablondan birini seçərək cavab ver:

1. Ümumi məlumat, qiymətlər və paketlər soruşulduqda:
- Salam hər vaxtınız xeyir, 🚗Avtomobilinizi bizimlə sürətli satın!
- Naxcars Platforması olaraq sərfəli qiymətlərlə elanlarınızı paylaşa bilərik, belə ki Qiymətlər bizdə elan növünə görə dəyişir :
ℹ️ELAN PAKETLƏRİMİZ:
➡️ Standart: ( 2 AZN — 14 gün)
➡️ Premium: (3 AZN — 20 gün)
➡️ VIP: (4 AZN — 30 gün)
Elanlar saytda VIP, Premium və Standart ardıcıllığı ilə sıralanır.
🎁 ÖZƏL HƏDİYYƏMİZ: Saytımızda yerləşdirilən hər bir *Premium Paketli* elan müddəti bitdikdən sonra *VİP Paketli* elan növü olaraq *əlavə hədiyyə müddəti* qazanır.
🌍✅️Saytımız İnternet üzərindən qlobal axtarış sistemlərinə tam inteqrasiya olunub! Google və digər brauzerlərdə sadəcə "Naxcars" yazaraq axtarış edib, baxa bilərsiniz. Məlumat üçün:
↪️https://naxcarspltfrm.base44.app/
Diqqətiniz üçün təşəkkürlər!

2. Elanın harada paylaşılacağı soruşulduqda:
- Salam hər vaxtınız xeyir olsun, elanı *Saytımızda , Facebookda səhifəmizdə və Maşın alqı-satqı qruplarımızda və həmçinin Telegramda elan alqı-satqı kanallarımızda* paylaşılır, avtomobilinizi bizimlə *sürətli* satın!

3. Elan yerləşdirmək istədikdə / şəkil və məlumat istədikdə:
- Neçə günlük istəyirsiz zəhmət olmasa qeyd edin, avtomobilin şəkillərini və haqqında məlumatı göndərin , paylaşaq.

4. Əlavə suallar olduqda:
- Salam hər vaxtınız xeyir, əlavə suallarınız varsa zəhmət olmasa buradan yazın cavablandırılacaq, təşəkkürlər.

5. Ödəniş təsdiqləndikdə:
- ✅️Ödəniş təsdiqləndi, təşəkkürlər!

6. Ödəniş xatırlatması (ödənilməyibsə):
- *⚠️DİQQƏT! XATIRLATMA! Elan ödənişi edilmədiyi təqdirdə gün sonunda 00:00'da elanınız platformalardan silinəcəkdir!*

7. Elan yerləşdirildikdən sonra link gözləyənlərə:
- Tamam , yerləşdirilib linki sizə atılacaq özünüz də baxacaqsınız, sonra ödəniş üçün məlumat göndəriləcək, təşəkkürlər.

Təlimat: Müştəri mesajını təhlil et və yuxarıdakı şablonlardan ən uyğun olanını seçərək dəqiq cavab qaytar.
`;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Desktop'), // WhatsApp tərəfindən ən stabil qəbul edilən imza
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 10000
    });

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(PHONE_NUMBER);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log("\n==========================================");
                console.log(`🔑 YENİ TƏSDİQ KODUNUZ: ${code}`);
                console.log("==========================================\n");
            } catch (err) {
                console.error("Pairing code almaq alınmadı:", err.message);
            }
        }, 7000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log('Bağlantı kəsildi, səbəb kodu:', statusCode);
            
            if (statusCode === 401 || statusCode === DisconnectReason.loggedOut) {
                console.log('⚠️ Sessiya yenilənir, auth qovluğu təmizlənir...');
                try {
                    fs.rmSync('auth_info_baileys', { recursive: true, force: true });
                } catch (e) {}
            }

            setTimeout(() => startBot(), 4000);
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
                await delay(2000);
                await sock.sendPresenceUpdate('composing', from);

                const prompt = `Müştəri mesajı: "${userMessage}"\n\nAçar sözlər və şablonlar:\n${MY_TEMPLATES}\n\nBu təlimata əsasən müştəriyə uyğun rəsmi şablon cavabını yaz:`;
                
                const replyText = await generateGeminiReply(prompt);

                await sock.sendPresenceUpdate('paused', from);
                await sock.sendMessage(from, { text: replyText });

            } catch (error) {
                console.error('Gemini AI Cavab Xətası:', error);
                await sock.sendMessage(from, { text: "Salam! Müraciətiniz qəbul olundu, qısa zamanda baxılacaq." });
            }
        }
    });
}

startBot();
