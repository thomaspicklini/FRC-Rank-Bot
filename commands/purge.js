import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("purge")
  .setDescription("🧹 Delete messages from a specific member in this channel.")
  .addIntegerOption((option) =>
    option
      .setName("amount")
      .setDescription("Number of messages to check (max 100).")
      .setRequired(true)
  )
  .addUserOption((option) =>
    option
      .setName("member")
      .setDescription("The member whose messages you want to delete.")
      .setRequired(false)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false);

export async function execute(interaction) {
  const channel = interaction.channel;
  const target = interaction.options.getUser("member") || interaction.client.user;
  const amount = interaction.options.getInteger("amount");

  if (amount < 1 || amount > 100) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("❌ Invalid Amount")
          .setDescription("Please provide an amount between **1** and **100**."),
      ],
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Fetch recent messages
    const messages = await channel.messages.fetch({ limit: amount });

    // Filter messages by author
    const filtered = messages.filter((m) => m.author.id === target.id);

    if (filtered.size === 0) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffa500)
            .setTitle("⚠️ No Messages Found")
            .setDescription(`No messages from **${target.tag}** found in the last ${amount} messages.`),
        ],
      });
    }

    // Bulk delete
    await channel.bulkDelete(filtered, true);

    // ✅ Confirmation
    const confirmEmbed = new EmbedBuilder()
      .setColor(0x00ff7f)
      .setTitle("✅ Messages Deleted")
      .setDescription(
        `Deleted **${filtered.size}** messages from **${target.tag}** in <#${channel.id}>.`
      )
      .setFooter({ text: "FRC Command Utility" })
      .setTimestamp();

    await interaction.editReply({ embeds: [confirmEmbed] });
  } catch (error) {
    console.error("❌ Purge Error:", error);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("❌ Error")
          .setDescription(
            "An error occurred while trying to delete messages.\nEnsure the messages are not older than **14 days** (Discord limit)."
          ),
      ],
    });
  }
}
