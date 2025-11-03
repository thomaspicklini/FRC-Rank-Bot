import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { readFileSync, writeFileSync, existsSync } from "fs";

// 📘 Load rank data
const ranks = JSON.parse(
  readFileSync(new URL("../../data/ranks.json", import.meta.url))
);

// 🧾 Player info file setup
const playerInfoPath = new URL("../../data/playerinfo.json", import.meta.url);
let playerInfo = {};
if (existsSync(playerInfoPath)) {
  try {
    const data = readFileSync(playerInfoPath, "utf-8").trim();
    playerInfo = data ? JSON.parse(data) : {};
  } catch {
    console.error("⚠️ playerinfo.json corrupted — resetting.");
    playerInfo = {};
    writeFileSync(playerInfoPath, JSON.stringify({}, null, 2));
  }
}

// 🚀 MODULE FUNCTION (used only from /admin)
export async function run(interaction, context = {}) {
  if (!context.calledFromAdmin) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("❌ Access Denied")
          .setDescription("This module can only be opened via `/admin`."),
      ],
      ephemeral: true,
    });
  }

  const guild = interaction.guild;
  await guild.members.fetch();

  // 🧍 Ask for member via modal
  const modal = new ModalBuilder()
    .setCustomId("onboardMemberModal")
    .setTitle("🪖 Onboard Member");

  const input = new TextInputBuilder()
    .setCustomId("memberQuery")
    .setLabel("Enter Member Name or ID")
    .setPlaceholder("Example: Thomas Picklini, Thomas, 123456789012345678")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);

  const submitted = await interaction
    .awaitModalSubmit({
      filter: (m) => m.customId === "onboardMemberModal",
      time: 120000,
    })
    .catch(() => null);

  if (!submitted) return;
  const query = submitted.fields.getTextInputValue("memberQuery").toLowerCase();
  await submitted.deferUpdate();

  // 🔍 Find the member
  let member =
    guild.members.cache.get(query) ||
    guild.members.cache.find(
      (m) =>
        m.user.username.toLowerCase() === query ||
        m.displayName.toLowerCase() === query
    );

  if (!member) {
    const matches = guild.members.cache.filter(
      (m) =>
        m.user.username.toLowerCase().includes(query) ||
        m.displayName.toLowerCase().includes(query)
    );

    if (matches.size === 0) {
      const embed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle("⚠️ No Match Found")
        .setDescription(`No member found matching **${query}**.`);
      return interaction.followUp({ embeds: [embed], ephemeral: true });
    }

    // 👥 Multiple matches selection (ephemeral)
    if (matches.size > 1) {
      const select = new StringSelectMenuBuilder()
        .setCustomId("onboard_member_select")
        .setPlaceholder("Select a member to onboard...")
        .addOptions(
          matches.map((m) => ({
            label: m.displayName,
            description: m.user.tag,
            value: m.id,
          }))
        );

      const multiEmbed = new EmbedBuilder()
        .setColor(0x00aaff)
        .setTitle("👥 Multiple Matches Found")
        .setDescription("Select the correct member from the list below.");

      const multiMsg = await interaction.followUp({
        embeds: [multiEmbed],
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true,
      });

      const choice = await multiMsg
        .awaitMessageComponent({
          filter: (i) =>
            i.customId === "onboard_member_select" &&
            i.user.id === interaction.user.id,
          time: 60000,
        })
        .catch(() => null);

      if (!choice) {
        const timeoutEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("❌ Selection Timed Out");
        return interaction.followUp({ embeds: [timeoutEmbed], ephemeral: true });
      }

      // ✅ Automatically delete ephemeral selector 1s after selection
      setTimeout(async () => {
        try {
          await choice.deleteReply();
        } catch {}
      }, 1000);

      member = await guild.members.fetch(choice.values[0]).catch(() => null);
      await choice.deferUpdate();
    } else {
      member = matches.first();
    }
  }

  if (!member) {
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("❌ Error")
      .setDescription("Could not locate that member.");
    return interaction.followUp({ embeds: [embed], ephemeral: true });
  }

  // 🚫 Prevent duplicate dossiers
  if (playerInfo[member.id]) {
    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle("⚠️ Already Exists")
      .setDescription(`${member.displayName} already has a dossier entry.`);
    return interaction.followUp({ embeds: [embed], ephemeral: true });
  }

  // 🪖 Onboarding panel
  const embed = new EmbedBuilder()
    .setColor(0x2b9cff)
    .setTitle(`🪖 Onboard ${member.displayName}`)
    .setDescription(
      "Select the member’s **initial rank** below.\n\nOnce confirmed, this will automatically:\n• Create their dossier entry\n• Assign their rank role\n• Log the onboarding note"
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: "FRC Command Access Only" });

  const rankSelect = new StringSelectMenuBuilder()
    .setCustomId(`onboard_rank_${member.id}`)
    .setPlaceholder("Select starting rank...")
    .addOptions(
      ...Object.entries(ranks).map(([code, name]) => ({
        label: `${code.replace(/(\D)(\d)/, "$1-$2")} | ${name}`,
        value: code,
      }))
    );

  const confirmButton = new ButtonBuilder()
    .setCustomId(`onboard_confirm_${member.id}`)
    .setLabel("✅ Confirm Onboard")
    .setStyle(ButtonStyle.Success)
    .setDisabled(true);

  const cancelButton = new ButtonBuilder()
    .setCustomId(`onboard_cancel_${member.id}`)
    .setLabel("❌ Cancel")
    .setStyle(ButtonStyle.Danger);

  const msg = await interaction.channel.send({
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(rankSelect),
      new ActionRowBuilder().addComponents(confirmButton, cancelButton),
    ],
  });

  let selectedRank = null;

  const collector = msg.createMessageComponentCollector({
    filter: (i) =>
      (i.customId.startsWith("onboard_rank_") ||
        i.customId.startsWith("onboard_confirm_") ||
        i.customId.startsWith("onboard_cancel_")) &&
      i.user.id === interaction.user.id,
    time: 180000,
  });

  collector.on("collect", async (i) => {
    // 🧩 Rank selection
    if (i.customId.startsWith("onboard_rank_")) {
      selectedRank = i.values[0];
      const updatedButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`onboard_confirm_${member.id}`)
          .setLabel("✅ Confirm Onboard")
          .setStyle(ButtonStyle.Success)
          .setDisabled(false),
        cancelButton
      );

      const selectionEmbed = new EmbedBuilder()
        .setColor(0x00bfff)
        .setTitle("🪖 Rank Selected")
        .setDescription(
          `**${member.displayName}** will be onboarded as **${ranks[selectedRank]} (${selectedRank.toUpperCase()})**.\nClick **Confirm Onboard** to finalize.`
        );

      await i.update({
        embeds: [selectionEmbed],
        components: [
          new ActionRowBuilder().addComponents(rankSelect),
          updatedButtons,
        ],
      });
    }

    // ❌ Cancel
    if (i.customId.startsWith("onboard_cancel_")) {
      await i.deferUpdate();
      const cancelEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("🛑 Onboarding Cancelled")
        .setDescription(`Operation cancelled by ${interaction.user.displayName}.`);
      await msg.edit({ embeds: [cancelEmbed], components: [] });
      setTimeout(() => msg.delete().catch(() => {}), 2500);
      collector.stop("cancelled");
    }

    // ✅ Confirm
    if (i.customId.startsWith("onboard_confirm_")) {
      await i.deferUpdate();

      if (!selectedRank) {
        const errEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("⚠️ Missing Selection")
          .setDescription("Please select a rank before confirming.");
        return i.followUp({ embeds: [errEmbed], ephemeral: true });
      }

      const rankName = ranks[selectedRank];
      const formattedRank = `${selectedRank.replace(
        /(\D)(\d)/,
        "$1-$2"
      )} | ${rankName}`;

      const role = guild.roles.cache.find((r) => r.name === formattedRank);
      if (role) await member.roles.add(role).catch(() => {});

      // 📝 Save dossier
      const newPlayer = {
        userId: member.id,
        username: member.user.username,
        displayName: member.displayName,
        rank: formattedRank,
        notes: [
          {
            text: `Onboarded at ${formattedRank} — by ${interaction.user.displayName}`,
            addedBy: interaction.user.displayName,
            timestamp: new Date().toISOString(),
          },
        ],
        specializations: [],
      };
      playerInfo[member.id] = newPlayer;
      writeFileSync(playerInfoPath, JSON.stringify(playerInfo, null, 2));

      const confirmEmbed = new EmbedBuilder()
        .setColor(0x00ff7f)
        .setTitle("✅ Member Onboarded")
        .setDescription(
          `**${member.displayName}** successfully onboarded at **${formattedRank}**.\n📝 Dossier created and note logged.`
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: "FRC Command Access Only" })
        .setTimestamp();

      // ✨ Ephemeral confirmation instead of DM
      await i.followUp({ embeds: [confirmEmbed], ephemeral: true });

      await msg.edit({ embeds: [confirmEmbed], components: [] });
      setTimeout(() => msg.delete().catch(() => {}), 3000);
      collector.stop("confirmed");
    }
  });

  // ⏳ Auto cleanup
  collector.on("end", async () => {
    try {
      await msg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(0x808080)
            .setTitle("⏳ Session Expired")
            .setDescription("Onboarding session closed."),
        ],
        components: [],
      });
      setTimeout(() => msg.delete().catch(() => {}), 3000);
    } catch {}
  });
}
