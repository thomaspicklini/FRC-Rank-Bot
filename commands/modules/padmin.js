import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { readFileSync, writeFileSync, existsSync } from "fs";

// 🧱 Load data
const ranks = JSON.parse(
  readFileSync(new URL("../../data/ranks.json", import.meta.url))
);
const specs = JSON.parse(
  readFileSync(new URL("../../data/specializations.json", import.meta.url))
);

const playerInfoPath = new URL("../../data/playerinfo.json", import.meta.url);
let playerInfo = {};
if (existsSync(playerInfoPath)) {
  try {
    const data = readFileSync(playerInfoPath, "utf-8").trim();
    playerInfo = data ? JSON.parse(data) : {};
  } catch {
    console.error("⚠️ playerinfo.json corrupted — resetting.");
    playerInfo = {};
    writeFileSync(playerInfoPath, JSON.stringify(playerInfo, null, 2));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 🚀 MAIN
export async function run(interaction, context = {}) {
  if (!context.calledFromAdmin)
    return interaction.reply({
      content: "❌ This module can only be accessed through the `/admin` panel.",
    });

  const guild = interaction.guild;
  await guild.members.fetch();

  // 🧍 Ask for member
  const modal = new ModalBuilder()
    .setCustomId("padminMemberModal")
    .setTitle("Select Member to Edit");

  const userInput = new TextInputBuilder()
    .setCustomId("memberQuery")
    .setLabel("Enter Member Name or ID")
    .setPlaceholder("e.g. Thomas Picklini, Thomas, 123456789012345678")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(userInput));
  await interaction.showModal(modal);

  const submitted = await interaction
    .awaitModalSubmit({
      filter: (m) => m.customId === "padminMemberModal",
      time: 120000,
    })
    .catch(() => null);
  if (!submitted) return;

  const query = submitted.fields.getTextInputValue("memberQuery").toLowerCase();
  await submitted.deferUpdate();

  // 🔍 Find member
  let member =
    guild.members.cache.get(query) ||
    guild.members.cache.find(
      (m) =>
        m.user.username.toLowerCase() === query ||
        m.displayName.toLowerCase() === query
    );

  // 🧩 Multi-match handling
  if (!member) {
    const matches = guild.members.cache.filter(
      (m) =>
        m.user.username.toLowerCase().includes(query) ||
        m.displayName.toLowerCase().includes(query)
    );

    if (matches.size === 0)
      return interaction.channel.send(`⚠️ No member found matching **${query}**.`);

    if (matches.size > 1) {
      const select = new StringSelectMenuBuilder()
        .setCustomId("padmin_member_select")
        .setPlaceholder("Select a member to edit...")
        .addOptions(
          matches.map((m) => ({
            label: m.displayName,
            description: m.user.tag,
            value: m.id,
          }))
        );

      const cancelButton = new ButtonBuilder()
        .setCustomId("cancel_multi")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Danger);

      const multiMsg = await interaction.channel.send({
        content: "🔍 Multiple matches found — please choose:",
        components: [
          new ActionRowBuilder().addComponents(select),
          new ActionRowBuilder().addComponents(cancelButton),
        ],
      });

      const choice = await multiMsg
        .awaitMessageComponent({
          filter: (i) =>
            (i.customId === "padmin_member_select" ||
              i.customId === "cancel_multi") &&
            i.user.id === interaction.user.id,
          time: 60000,
        })
        .catch(() => null);

      if (!choice) {
        await multiMsg.edit({ content: "❌ Selection timed out.", components: [] });
        await sleep(1000);
        return multiMsg.delete().catch(() => {});
      }

      if (choice.customId === "cancel_multi") {
        await choice.deferUpdate();
        await sleep(1000);
        return multiMsg.delete().catch(() => {});
      }

      member = await guild.members.fetch(choice.values[0]).catch(() => null);
      await choice.deferUpdate();
      await sleep(1000);
      await multiMsg.delete().catch(() => {});
    }
  }

  if (!member)
    return interaction.channel.send("⚠️ Could not locate that member.");

  // 🧾 Ensure record
  const ensureRecord = (obj) => ({
    userId: member.id,
    username: member.user.username,
    displayName: member.displayName,
    rank: obj.rank || "Unassigned",
    notes: obj.notes || [],
    specializations: obj.specializations || [],
  });

  const buildEmbed = (player) => {
    const notes =
      player.notes?.length > 0
        ? player.notes
            .map(
              (n, i) =>
                `**Note ${i + 1}:**\n${n.text}\n> 🕓 <t:${Math.floor(
                  new Date(n.timestamp).getTime() / 1000
                )}:R> — by ${n.addedBy}`
            )
            .join("\n\n")
        : "_No notes on file._";

    const specsList =
      player.specializations?.length > 0
        ? player.specializations
            .map((code) => {
              const s = specs[code];
              return s ? `• **${s.name}** (${code.toUpperCase()})` : `• ${code}`;
            })
            .join("\n")
        : "_No specializations assigned._";

    return new EmbedBuilder()
      .setColor(0x004aad)
      .setTitle(`📘 Dossier: ${player.displayName}`)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: "Rank", value: player.rank || "Unassigned", inline: true },
        { name: "Specializations", value: specsList },
        { name: "Notes", value: notes }
      )
      .setFooter({ text: "FRC Command Access Panel" })
      .setTimestamp();
  };

  // Determine rank
  const currentRank = Object.entries(ranks).find(([code, name]) => {
    const formatted = `${code.replace(/(\D)(\d)/, "$1-$2")} | ${name}`;
    return member.roles.cache.some((r) => r.name === formatted);
  });

  const rankText = currentRank
    ? `${currentRank[0].replace(/(\D)(\d)/, "$1-$2")} | ${currentRank[1]}`
    : "Unassigned";

  const existing = playerInfo[member.id]
    ? ensureRecord(playerInfo[member.id])
    : ensureRecord({ rank: rankText, notes: [], specializations: [] });

  const controls = () =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("rank").setLabel("Edit Rank").setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("spec")
        .setLabel("Edit Specializations")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("note").setLabel("Add Note").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("delnote").setLabel("Delete Note").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("finish").setLabel("Finish").setStyle(ButtonStyle.Success)
    );

  const panelMsg = await interaction.channel.send({
    embeds: [buildEmbed(existing)],
    components: [controls()],
  });

  const collector = panelMsg.createMessageComponentCollector({
    filter: (i) => i.user.id === interaction.user.id,
    time: 300000,
  });

  collector.on("collect", async (i) => {
    // ✅ Finish
    if (i.customId === "finish") {
      await i.deferUpdate();
      await sleep(1000);
      await panelMsg.delete().catch(() => {});
      collector.stop("finished");
      return;
    }

    // ✏️ Edit Rank — ensure we capture the message object (fetchReply)
    if (i.customId === "rank") {
      const select = new StringSelectMenuBuilder()
        .setCustomId("rankSelect")
        .setPlaceholder("Select new rank…")
        .addOptions(
          ...Object.entries(ranks).map(([code, name]) => ({
            label: `${code.replace(/(\D)(\d)/, "$1-$2")} | ${name}`,
            value: code,
          }))
        );

      const cancel = new ButtonBuilder()
        .setCustomId("rankCancel")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Danger);

      const msg = await i.reply({
        content: "Select new rank or cancel:",
        components: [
          new ActionRowBuilder().addComponents(select),
          new ActionRowBuilder().addComponents(cancel),
        ],
        fetchReply: true, // ✅ important
      });

      const pick = await msg
        .awaitMessageComponent({
          filter: (s) =>
            s.user.id === i.user.id &&
            (s.customId === "rankSelect" || s.customId === "rankCancel"),
          time: 60000,
        })
        .catch(() => null);

      if (!pick) {
        try {
          await msg.edit({ content: "⏱️ Timed out.", components: [] });
          await sleep(1000);
          await msg.delete().catch(() => {});
        } catch {}
        return;
      }

      if (pick.customId === "rankCancel") {
        await pick.deferUpdate();
        await sleep(1000);
        return msg.delete().catch(() => {});
      }

      const code = pick.values[0];
      const formatted = `${code.replace(/(\D)(\d)/, "$1-$2")} | ${ranks[code]}`;
      const oldRank = existing.rank;

      // Update dossier
      existing.rank = formatted;
      existing.notes.push({
        text: `Rank changed: ${oldRank} → ${formatted} — by ${interaction.user.displayName}`,
        addedBy: interaction.user.displayName,
        timestamp: new Date().toISOString(),
      });
      playerInfo[member.id] = existing;
      writeFileSync(playerInfoPath, JSON.stringify(playerInfo, null, 2));

      await pick.deferUpdate();
      try {
        await msg.edit({ content: `✅ Updated to ${formatted}`, components: [] });
        await sleep(1000);
        await msg.delete().catch(() => {});
      } catch {}
      // Refresh main panel
      try {
        await panelMsg.edit({ embeds: [buildEmbed(existing)], components: [controls()] });
      } catch {}
      return;
    }

    // ⚙️ Edit Specializations — same fix: capture reply message
    if (i.customId === "spec") {
      const select = new StringSelectMenuBuilder()
        .setCustomId("specSelect")
        .setPlaceholder("Select or deselect specializations…")
        .setMinValues(0)
        .setMaxValues(Object.keys(specs).length)
        .addOptions(
          ...Object.entries(specs).map(([code, data]) => ({
            label: `${data.name} (${code.toUpperCase()})`,
            value: code,
            default: existing.specializations.includes(code),
          }))
        );

      const cancel = new ButtonBuilder()
        .setCustomId("specCancel")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Danger);

      const msg = await i.reply({
        content: "Select specializations or cancel:",
        components: [
          new ActionRowBuilder().addComponents(select),
          new ActionRowBuilder().addComponents(cancel),
        ],
        fetchReply: true, // ✅ important
      });

      const pick = await msg
        .awaitMessageComponent({
          filter: (s) =>
            s.user.id === i.user.id &&
            (s.customId === "specSelect" || s.customId === "specCancel"),
          time: 60000,
        })
        .catch(() => null);

      if (!pick) {
        try {
          await msg.edit({ content: "⏱️ Timed out.", components: [] });
          await sleep(1000);
          await msg.delete().catch(() => {});
        } catch {}
        return;
      }

      if (pick.customId === "specCancel") {
        await pick.deferUpdate();
        await sleep(1000);
        return msg.delete().catch(() => {});
      }

      // Apply
      existing.specializations = pick.values;
      existing.notes.push({
        text: `Specializations updated (${pick.values.length}) — by ${interaction.user.displayName}`,
        addedBy: interaction.user.displayName,
        timestamp: new Date().toISOString(),
      });
      playerInfo[member.id] = existing;
      writeFileSync(playerInfoPath, JSON.stringify(playerInfo, null, 2));

      await pick.deferUpdate();
      try {
        await msg.edit({ content: "✅ Specializations updated.", components: [] });
        await sleep(1000);
        await msg.delete().catch(() => {});
      } catch {}
      // Refresh main panel
      try {
        await panelMsg.edit({ embeds: [buildEmbed(existing)], components: [controls()] });
      } catch {}
      return;
    }

    // 🟨 Add Note (unchanged)
    if (i.customId === "note") {
      const modal = new ModalBuilder()
        .setCustomId(`noteModal_${member.id}`)
        .setTitle(`Add Note for ${member.displayName}`);

      const noteInput = new TextInputBuilder()
        .setCustomId("noteInput")
        .setLabel("New Note")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Type note here...")
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(noteInput));
      await i.showModal(modal);

      const sub = await i
        .awaitModalSubmit({
          filter: (m) => m.customId === `noteModal_${member.id}`,
          time: 120000,
        })
        .catch(() => null);
      if (!sub) return;

      const noteText = sub.fields.getTextInputValue("noteInput");
      existing.notes.push({
        text: noteText,
        addedBy: interaction.user.displayName,
        timestamp: new Date().toISOString(),
      });

      playerInfo[member.id] = existing;
      writeFileSync(playerInfoPath, JSON.stringify(playerInfo, null, 2));

      await sub.deferUpdate();
      try {
        await panelMsg.edit({ embeds: [buildEmbed(existing)], components: [controls()] });
      } catch {}
      return;
    }

    // 🟥 Delete Note (unchanged logic; still modal-based)
    if (i.customId === "delnote") {
      const modal = new ModalBuilder()
        .setCustomId(`deleteModal_${member.id}`)
        .setTitle(`Delete Note for ${member.displayName}`);

      const numberInput = new TextInputBuilder()
        .setCustomId("noteNumber")
        .setLabel("Enter note number to delete")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Note number")
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(numberInput));
      await i.showModal(modal);

      const sub = await i
        .awaitModalSubmit({
          filter: (m) => m.customId === `deleteModal_${member.id}`,
          time: 120000,
        })
        .catch(() => null);
      if (!sub) return;

      const number = parseInt(sub.fields.getTextInputValue("noteNumber"), 10);
      if (isNaN(number) || number < 1 || number > existing.notes.length) {
        await sub.reply({ content: "❌ Invalid note number." });
        await sleep(1000);
        try {
          const rep = await sub.fetchReply();
          await rep.delete().catch(() => {});
        } catch {}
        return;
      }

      existing.notes.splice(number - 1, 1);
      playerInfo[member.id] = existing;
      writeFileSync(playerInfoPath, JSON.stringify(playerInfo, null, 2));

      await sub.deferUpdate();
      try {
        await panelMsg.edit({ embeds: [buildEmbed(existing)], components: [controls()] });
      } catch {}
      return;
    }
  });

  collector.on("end", async () => {
    try {
      await panelMsg.edit({
        content: "⏳ Session expired — dossier closed.",
        embeds: [],
        components: [],
      });
      await sleep(1000);
      await panelMsg.delete().catch(() => {});
    } catch {}
  });
}
