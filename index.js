const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.get('/', (req, res) => {
    res.send('Bot is running!');
});

app.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
});

// WhatsApp Bot
const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', qr => {
    console.log('QR RECEIVED', qr);
});

client.on('ready', () => {
    console.log('WhatsApp Bot is ready!');
});

client.on('message', async msg => {
    if (msg.body.toLowerCase() === '!saldo') {
        try {
            const response = await axios.get(`https://vip-reseller.co.id/api/saldo?api_key=${process.env.VIP_API_KEY}`);
            msg.reply(`Saldo Anda: Rp ${response.data.saldo}`);
        } catch (error) {
            msg.reply('Gagal mengambil saldo.');
        }
    }
});

client.initialize();
