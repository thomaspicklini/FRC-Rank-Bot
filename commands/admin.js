import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";

// Import submodules from commands/modules/
import * as padmin from "./modules/padmin.js";
import * as sadmin from "./modules/sadmin.js";
import * as onboard from "./modules/onboard.js";

export const data = new SlashCommandBuilder()
  .setName("admin")
  .setDescription("Open the FRC Administrative Control Panel.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x004aad)
    .setTitle("🛠️ FRC Command Admin Panel")
    .setDescription(
      "Welcome to the **Forward Response Corp Command Center**.\n\n" +
        "Select one of the options below:\n" +
        "• 🧍‍♂️ **Edit Players** — Manage dossiers, ranks, and notes.\n" +
        "• ⚙️ **Edit Specializations** — Manage specialization data and training info.\n" +
        "• ➕ **Onboard Members** — Add new members to the database.\n\n" +
        "_Panel closes automatically after 5 minutes of inactivity or when **Finish** is pressed._"
    )
    .setFooter({ text: "FRC Admin Access — Authorized Personnel Only" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("edit_players")
      .setLabel("🧍‍♂️ Edit Players")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("edit_specializations")
      .setLabel("⚙️ Edit Specializations")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("add_players")
      .setLabel("➕ Onboard Members")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("finish_admin")
      .setLabel("❌ Finish")
      .setStyle(ButtonStyle.Danger)
  );

  // 👇 Public message
  const msg = await interaction.reply({
    embeds: [embed],
    components: [row],
  });

  const collector = msg.createMessageComponentCollector({ time: 300000 }); // 5 minutes

  collector.on("collect", async (i) => {
    if (i.user.id !== interaction.user.id)
      return i.reply({
        content: "❌ You do not have permission to use this control panel.",
        ephemeral: true,
      });

    // 🧍‍♂️ Player Administration
    if (i.customId === "edit_players") {
      await padmin.run(i, { calledFromAdmin: true });
      return;
    }

    // ⚙️ Specialization Administration
    if (i.customId === "edit_specializations") {
      await sadmin.run(i, { calledFromAdmin: true });
      return;
    }

    // ➕ Onboarding
    if (i.customId === "add_players") {
      await onboard.run(i, { calledFromAdmin: true });
      return;
    }

    // ❌ Finish — deletes immediately
    if (i.customId === "finish_admin") {
      await i.deferUpdate();
      try {
        await msg.edit({
          content: "✅ Admin Panel closed manually.",
          embeds: [],
          components: [],
        });
        setTimeout(async () => {
          await msg.delete().catch(() => {});
        }, 1000);
      } catch {}
      collector.stop("finished");
      return;
    }
  });

  // ⏳ Timeout handling
  collector.on("end", async (_, reason) => {
    if (reason === "finished") return; // Already deleted
    try {
      await msg.edit({
        content: "⏳ Session expired — Admin Panel closed.",
        embeds: [],
        components: [],
      });
      setTimeout(async () => {
        await msg.delete().catch(() => {});
      }, 2000);
    } catch {}
  });
}
