import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { readFileSync, existsSync } from "fs";

// Load ranks and specializations
const ranks = JSON.parse(
  readFileSync(new URL("../data/ranks.json", import.meta.url))
);
const specs = JSON.parse(
  readFileSync(new URL("../data/specializations.json", import.meta.url))
);

// Load playerinfo
const playerInfoPath = new URL("../data/playerinfo.json", import.meta.url);
let playerInfo = {};
if (existsSync(playerInfoPath)) {
  try {
    const fileData = readFileSync(playerInfoPath, "utf-8").trim();
    playerInfo = fileData ? JSON.parse(fileData) : {};
  } catch {
    console.error("⚠️ playerinfo.json corrupted — resetting.");
    playerInfo = {};
  }
}

export const data = new SlashCommandBuilder()
  .setName("playerdocs")
  .setDescription("View your personal FRC dossier (private).");

export async function execute(interaction) {
  const userId = interaction.user.id;
  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  if (!member)
    return interaction.reply({
      content: "❌ You must be in the server to view your dossier.",
      ephemeral: true,
    });

  // 1) Send ephemeral "Downloading..." message
  const loadingEmbed = new EmbedBuilder()
    .setColor(0x004aad)
    .setTitle("📡 Downloading Your Dossier...")
    .setDescription("Please wait while we retrieve your FRC data.");

  await interaction.reply({
    embeds: [loadingEmbed],
    ephemeral: true,
  });

  // 2) Wait 3–5s, then delete the first message
  const delay = Math.floor(Math.random() * 2000) + 3000; // 3000–5000 ms
  await new Promise((r) => setTimeout(r, delay));
  await interaction.deleteReply().catch(() => {});

  // Pull record
  const record = playerInfo[userId];
  if (!record) {
    return interaction.followUp({
      content: `⚠️ No dossier found for **${interaction.user.displayName}**.\nPlease contact a Command Officer for onboarding.`,
      ephemeral: true,
    });
  }

  // Build specialization list (uses specs[name].name)
  const specList =
    record.specializations?.length > 0
      ? record.specializations
          .map((code) => {
            const spec = specs[code];
            return spec ? `• **${spec.name}** (${code.toUpperCase()})` : `• ${code}`;
          })
          .join("\n")
      : "_No specializations assigned._";

  // 3) Build final dossier embed
  const embed = new EmbedBuilder()
    .setColor(0x004aad)
    .setTitle(`📘 Dossier: ${record.displayName || interaction.user.displayName}`)
    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "Rank", value: record.rank || "Unassigned", inline: true },
      { name: "Specializations", value: specList }
    )
    .setFooter({ text: "FRC Personal Dossier — Confidential Access" })
    .setTimestamp();

  // Close button for the dossier
  const closeButton = new ButtonBuilder()
    .setCustomId(`close_${userId}`)
    .setLabel("Close")
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(closeButton);

  // 4) Send dossier as a SECOND ephemeral message
  const msg = await interaction.followUp({
    embeds: [embed],
    components: [row],
    ephemeral: true,
    fetchReply: true,
  });

  // 5) Handle "Close" (delete the dossier message)
  const collector = msg.createMessageComponentCollector({ time: 300000 });
  collector.on("collect", async (i) => {
    if (i.customId === `close_${userId}`) {
      if (i.user.id !== userId) {
        return i.reply({
          content: "❌ You cannot close someone else’s dossier.",
          ephemeral: true,
        });
      }
      await i.deferUpdate();
      await i.deleteReply().catch(() => {}); // deletes this ephemeral follow-up
      collector.stop("closed");
    }
  });
}
