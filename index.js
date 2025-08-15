// ==== BOT WHATSAPP + VIPAYMENT (Render Free) ====
// Jalankan WhatsApp Web headless + mini HTTP server (agar servis Render selalu "up").

import express from 'express';
import axios from 'axios';
import qrcode from 'qrcode-terminal';
import { Client, LocalAuth } from 'whatsapp-web.js';

// ---------- Konfigurasi dari ENV (set di Render) ----------
const VIP_API_KEY   = process.env.VIP_API_KEY || '';     // taruh API key VIPayment di Render → Environment
const VIP_BASE_URL  = process.env.VIP_BASE_URL || 'https://vip-reseller.co.id'; // base URL VIPayment
// Endpoint contoh—SESUAIKAN dengan dokumentasi punyamu (nama path bisa beda)
const VIP_LIST_PATH = process.env.VIP_LIST_PATH || '/api/game/features';        // endpoint list produk
const VIP_ORDER_PATH= process.env.VIP_ORDER_PATH || '/api/game/order';          // endpoint order (contoh)

// ---------- Express: keep-alive + healthcheck ----------
const app = express();
app.get('/', (_, res) => res.send('OK'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('HTTP up on :' + PORT));

// ---------- WhatsApp Client ----------
const client = new Client({
  authStrategy: new LocalAuth(),                   // simpan session di filesystem kontainer
  puppeteer: {
    args: ['--no-sandbox','--disable-setuid-sandbox'], // wajib di hosting tanpa sandbox
    headless: true
  }
});

client.on('qr', (qr) => {
  // QR akan tampil ASCII di log Render → buka "Logs" lalu scan di HP kamu
  console.log('=== SCAN QR PADA WHATSAPP ===');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('Bot WhatsApp siap ✔');
});

// ---------- Helper: panggil API VIPayment ----------
async function vipGetProducts() {
  // Kebanyakan API VIPayment minta API key lewat header Authorization atau query ?key=
  // Di sini kita kirim via header. Sesuaikan jika dokumentasi kamu berbeda.
  const url = `${VIP_BASE_URL}${VIP_LIST_PATH}`;
  const res = await axios.get(url, {
    headers: { Authorization: VIP_API_KEY },
    timeout: 20000
  });
  return res.data; // harapannya { status: true, data: [...] }
}

async function vipCreateOrder(payload) {
  const url = `${VIP_BASE_URL}${VIP_ORDER_PATH}`;
  const res = await axios.post(url, payload, {
    headers: { Authorization: VIP_API_KEY, 'Content-Type': 'application/json' },
    timeout: 20000
  });
  return res.data;
}

// ---------- Listener pesan ----------
client.on('message', async (msg) => {
  const text = (msg.body || '').trim();

  // 1) Daftar produk
  if (text.toLowerCase() === '!produk') {
    try {
      const api = await vipGetProducts();
      if (!api || api.status !== true || !Array.isArray(api.data)) {
        await msg.reply('❌ Gagal ambil produk (respon API tidak sesuai).');
        return;
      }
      // potong 10 item biar chat nggak kepanjangan
      const items = api.data.slice(0, 10);
      let out = '📦 *Daftar Produk (10 teratas)*\n';
      for (const p of items) {
        // penamaan field sesuaikan dengan struktur milikmu
        const game  = p.game || p.category || '-';
        const name  = p.product_name || p.name || '-';
        const price = p.price ?? p.harga ?? 0;
        const code  = p.code || p.id || '-';
        out += `• [${code}] ${game} – ${name} — Rp ${Number(price).toLocaleString('id-ID')}\n`;
      }
      out += '\nKetik: *!order KODE TUJUAN*  (contoh: !order ML86 123456789)';
      await msg.reply(out);
    } catch (e) {
      console.error(e?.response?.data || e);
      await msg.reply('❌ Gagal menghubungi server produk.');
    }
    return;
  }

  // 2) Order: !order KODE TUJUAN
  if (text.toLowerCase().startsWith('!order')) {
    const parts = text.split(/\s+/);
    // format minimal: !order KODE TUJUAN
    if (parts.length < 3) {
      await msg.reply('Format salah.\nContoh: *!order ML86 123456789*');
      return;
    }
    const kode   = parts[1];
    const tujuan = parts.slice(2).join(' '); // sisa teks jadi "tujuan" (mis. userID/nomor/UID)
    await msg.reply(`⏳ Memproses pesanan [${kode}] untuk ${tujuan}...`);

    try {
      // payload SESUAIKAN DENGAN DOKUMENTASI API VIPayment kamu
      const payload = {
        // contoh umum—gantikan field di bawah sesuai yang diwajibkan dokumen API:
        product_code: kode,
        customer_no: tujuan
        // mungkin juga butuh: server/zone/id_order/ref_id/signature dll.
      };
      const api = await vipCreateOrder(payload);

      if (api?.status === true) {
        await msg.reply(
          `✅ Order dibuat!\n` +
          `ID: ${api.data?.trx_id || api.data?.id || '-'}\n` +
          `Status: ${api.data?.status || 'diproses'}`
        );
      } else {
        await msg.reply('❌ Order gagal: ' + (api?.message || 'unknown error'));
      }
    } catch (e) {
      console.error(e?.response?.data || e);
      await msg.reply('❌ Gagal menghubungi server order.');
    }
  }
});

client.initialize();
