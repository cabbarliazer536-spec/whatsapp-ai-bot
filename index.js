process.on('uncaughtException', (err) => {
    console.error('Gözlənilməz xəta (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Təmin olunmamış imtina (Unhandled Rejection):', promise, 'Səbəb:', reason);
});

const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, delay, initAuthCreds } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { MongoClient, Binary } = require('mongodb');
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

const PHONE_NUMBER = "994554219530"; 
const MONGODB_URI = process.env.MONGODB_URI;

const MY_TEMPLATES = `
Sən "Naxcars" avtomobil elanları platformasının rəsmi WhatsApp köməkçisisən. 
VACİB QAYDA: Bot yalnız "Naxcars", "elan", "maşın", "avtomobil", "qiymət" və "paylaş" ifadələri və ya bu mövzulardakı mesajlara cavab verəcək. Əgər mesaj bu mövzulardan kənardadırsa, 4-cü şablonu cavab olaraq ver.

İstifadəçinin mesajına uyğun olaraq aşağıdakı 7 şablondan yalnız ən uyğun olanını seç və tam olaraq həmin şablonu cavab olaraq yaz:

ŞABLON 1 (Qiymətlər, paketlər və sayt linki):
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

ŞABLON 2 (Elanın harada paylaşılacağı):
Salam hər vaxtınız xeyir olsun, elanı *Saytımızda , Facebookda səhifəmizdə və Maşın alqı-satqı qruplarımızda və həmçinin Telegramda elan alqı-satqı kanallarımızda* paylaşılır, avtomobilinizi bizimlə *sürətli* satın!

ŞABLON 3 (Məlumat və şəkil istəyi):
Neçə günlük istəyirsiz zəhmət olmasa qeyd edin, avtomobilin şəkillərini və haqqında məlumatı göndərin , paylaşaq.

ŞABLON 4 (Əlavə suallar üçün):
Salam hər vaxtınız xeyir, əlavə suallarınız varsa zəhmət olmasa buradan yazın cavablandırılacaq, təşəkkürlər.

ŞABLON 5 (Ödənişin təsdiqi):
✅️Ödəniş təsdiqləndi, təşəkkürlər!

ŞABLON 6 (Ödəniş xatırlatması):
⚠️DİQQƏT! XATIRLATMA! Elan ödənişi edilmədiyi təqdirdə gün sonunda 00:00'da elanınız platformalardan silinəcəkdir!

ŞABLON 7 (Yerləşdirmə və ödəniş məlumatı):
Tamam , yerləşdirilib linki sizə atılacaq özünüz də baxacaqsınız, sonra ödəniş üçün məlumat göndəriləcək, təşəkkürlər.
`;

// Buffer-ləri qüsursuz qoruyan JSON köməkçiləri
function bufferReplacer(key, value) {
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
        return { __isBuffer: true, data: Array.from(value) };
    }
    return value;
}

function bufferReviver(key, value) {
    if (value && typeof value === 'object' && value.__isBuffer === true && Array.isArray(value.data)) {
        return Buffer.from(value.data);
    }
    if (value && (value instanceof Binary || value._bsontype === 'Binary')) {
        return Buffer.from(value.buffer);
    }
    return value;
}

async function useMongoDBAuthState(collection) {
    const writeData = async (data, id) => {
        const serialized = JSON.parse(JSON.stringify(data, bufferReplacer));
        await collection.updateOne({ _id: id }, { $set: { data: serialized } }, { upsert: true });
    };

    const readData = async (id) => {
        try {
            const doc = await collection.findOne({ _id: id });
            if (!doc || !doc.data) return null;
            const stringified = JSON.stringify(doc.data);
            return JSON.parse(stringified, bufferReviver);
        } catch (e) {
            return null;
        }
    };

    const removeData = async (id) => {
        try { await collection.deleteOne({ _id: id }); } catch {}
    };

    const creds = await readData('creds') || initAuthCreds();

    const state = {
        creds,
        keys: {
            get: async (type, ids) => {
                const data = {};
                for (const id of ids) {
                    let value = await readData(`${type}-${id}`);
                    data[id] = value;
                }
                return data;
            },
            set: async (data) => {
                const tasks = [];
                for (const category of Object.keys(data)) {
                    for (const id of Object.keys(data[category])) {
                        const value = data[category][id];
                        const key = `${category}-${id}`;
                        if (value) {
                            tasks.push(writeData(value, key));
                        } else {
                            tasks.push(removeData(key));
                        }
                    }
                }
                await Promise.all(tasks);
            }
        }
    };

    return {
        state,
        saveCreds: async () => {
            await writeData(state.creds, 'creds');
        }
    };
}

async function startBot() {
    if (!MONGODB_URI) {
        console.error("MONGODB_URI tapılmadı!");
        return;
    }

    try {
        const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 60000 });
        await client.connect();
        const db = client.db('whatsapp_bot');
        const collection = db.collection('auth_sessions');
        console.log('MongoDB bazasına uğurla qoşuldu!');

        // Köhnə səhv formatlı məlumatları təmizləyirik ki, təmizdən başlasın
        await collection.deleteMany({});

        const { state, saveCreds } = await useMongoDBAuthState(collection);
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
                    console.log(`🔑 MONGODB PAIRING KODUNUZ: ${code}`);
                    console.log("==========================================\n");
                } catch (err) {
                    console.error("Pairing code alınarkən xəta:", err);
                }
            }, 5000);
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Bağlantı kəsildi. Yenidən qoşulur...', shouldReconnect);
                if (shouldReconnect) {
                    setTimeout(() => startBot(), 5000);
                }
            } else if (connection === 'open') {
                console.log('✅ Bot WhatsApp-a MONGODB ÜZƏRİNDƏN UĞURLA BAĞLANDI VƏ 7/24 AKTİVDİR!');
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

                const keywords = ["naxcars", "elan", "maşın", "masin", "avtomobil", "qiymət", "qiymet", "paylaş", "paylas"];
                const lowerMsg = userMessage.toLowerCase();
                const hasKeyword = keywords.some(kw => lowerMsg.includes(kw));

                if (!hasKeyword) continue;

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
                    console.error('Mesaj işlənərkən xəta:', error);
                }
            }
        });
    } catch (err) {
        console.error('Bot başladılarkən xəta baş verdi, 10 saniyə sonra yenidən cəhd ediləcək:', err);
        setTimeout(() => startBot(), 10000);
    }
}

startBot();
