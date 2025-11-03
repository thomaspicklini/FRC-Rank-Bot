import { readFileSync } from "fs";
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

// Load ranks.json (E1 → O8)
const ranks = JSON.parse(
  readFileSync(new URL("../data/ranks.json", import.meta.url))
);

export const data = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Creates and organizes all rank roles in proper order (E-1 | Recruit → O-8 | CEO).")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  try {
    await interaction.reply({
      content: "⚙️ Checking permissions and preparing setup...",
      ephemeral: true,
    });

    const guild = interaction.guild;
    const botMember = await guild.members.fetchMe();
    const botRole = botMember.roles.highest;

    // 🧠 Auto-detect permission issues
    if (!guild.members.me.permissions.has("ManageRoles")) {
      await interaction.editReply({
        content:
          "❌ I don’t have permission to **Manage Roles**.\nEnable it in **Server Settings → Roles → FRC Tracker**.",
      });
      return;
    }

    // Find rank roles in the guild
    const rankEntries = Object.entries(ranks);
    const rankRoles = [];
    const created = [];
    const renamed = [];

    for (const [code, name] of rankEntries) {
      const formattedName = `${code.replace(/(\D)(\d)/, "$1-$2")} | ${name}`; // E1 → E-1
      const existing = guild.roles.cache.find(
        (r) => r.name === name || r.name === formattedName
      );

      if (!existing) {
        const newRole = await guild.roles.create({
          name: formattedName,
          mentionable: true,
          reason: "FRC Tracker setup command",
        });
        created.push(formattedName);
        rankRoles.push(newRole);
      } else {
        // Rename if old name doesn’t match the new format
        if (existing.name !== formattedName) {
          await existing.setName(formattedName, "Aligning role naming convention");
          renamed.push(formattedName);
        }
        rankRoles.push(existing);
      }
    }

    // ✅ Ensure bot is allowed to move them
    const tooHigh = rankRoles.filter((r) => r.position >= botRole.position);
    if (tooHigh.length > 0) {
      const names = tooHigh.map((r) => r.name).join(", ");
      await interaction.editReply({
        content: `⚠️ I can’t reorder these roles because they’re **above or equal** to my own role:\n> ${names}\n\nPlease drag my role (**${botRole.name}**) **above all rank roles**, then rerun \`/setup\`.`,
      });
      return;
    }

    // Reorder roles: highest (O-8) just under bot role, lowest (E-1) bottom
    const orderedRoles = rankEntries
      .map(([code, name]) =>
        guild.roles.cache.find(
          (r) => r.name === `${code.replace(/(\D)(\d)/, "$1-$2")} | ${name}`
        )
      )
      .filter(Boolean)
      .reverse(); // O-8 → E-1

    const newPositions = orderedRoles.map((role, i) => ({
      role: role.id,
      position: botRole.position - (i + 1),
    }));

    try {
      await guild.roles.setPositions(newPositions);
      console.log("✅ Role order updated successfully.");
    } catch (err) {
      console.error("⚠️ Failed to reorder roles:", err.message);
    }

    await interaction.editReply({
      content:
        `✅ **Setup Complete!**\n` +
        `• Created: ${created.length}\n` +
        `• Renamed: ${renamed.length}\n` +
        `• Ordered ranks so E-1 | Recruit is at the bottom and O-8 | Chief Executive Officer is just below the bot role.`,
    });
  } catch (err) {
    console.error(err);
    if (!interaction.replied)
      await interaction.reply({
        content: `❌ Setup failed: ${err.message}`,
        ephemeral: true,
      });
    else
      await interaction.editReply({
        content: `❌ Setup failed: ${err.message}`,
      });
  }
}