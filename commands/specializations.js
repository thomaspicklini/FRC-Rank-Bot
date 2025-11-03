import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from "discord.js";
import { readFileSync } from "fs";

// Load specializations
const specs = JSON.parse(
  readFileSync(new URL("../data/specializations.json", import.meta.url))
);

export const data = new SlashCommandBuilder()
  .setName("specializations")
  .setDescription("Privately view all FRC specializations and details.");

export async function execute(interaction) {
  try {
    // Check if user is an admin or command member
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const isAdmin =
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.roles.cache.some((r) =>
        /command|officer|admin/i.test(r.name)
      );

    // 🧩 Overview embed
    const list = Object.entries(specs)
      .map(([code, data]) => `• **${data.name}** (${code.toUpperCase()})`)
      .join("\n");

    const listEmbed = new EmbedBuilder()
      .setColor(0x004aad)
      .setTitle("🎖️ FRC Specializations Overview")
      .setDescription(
        `${list}\n\nSelect one below to view detailed information about a specialization.`
      )
      .setFooter({ text: "FRC Specialization Index — Confidential" });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("spec_select")
      .setPlaceholder("Select a specialization...")
      .addOptions(
        Object.entries(specs).map(([code, data]) => ({
          label: data.name,
          description:
            (data.description && data.description.trim().length > 0
              ? data.description.slice(0, 90)
              : "No description available") +
            (data.description && data.description.length > 90 ? "..." : ""),
          value: code,
        }))
      );

    const selectRow = new ActionRowBuilder().addComponents(selectMenu);

    const message = await interaction.reply({
      embeds: [listEmbed],
      components: [selectRow],
      flags: 1 << 6, // ephemeral
      fetchReply: true,
    });

    const collector = message.createMessageComponentCollector({ time: 300000 });

    collector.on("collect", async (i) => {
      try {
        await i.deferUpdate();

        // 🟦 Handle specialization selection
        if (i.customId === "spec_select") {
          const selectedCode = i.values[0];
          const selectedSpec = specs[selectedCode];
          if (!selectedSpec) return;

          const desc =
            selectedSpec.description?.trim() || "_No description available._";

          const detailEmbed = new EmbedBuilder()
            .setColor(0x004aad)
            .setTitle(`📘 ${selectedSpec.name}`)
            .setDescription(desc)
            .setFooter({
              text: `Specialization Code: ${selectedCode.toUpperCase()}`,
            });

          // Buttons: SOP, Radio, Terms (and Training for admins)
          const sopBtn = new ButtonBuilder()
            .setCustomId(`sop_${selectedCode}`)
            .setLabel("SOP")
            .setStyle(ButtonStyle.Primary);

          const radioBtn = new ButtonBuilder()
            .setCustomId(`radio_${selectedCode}`)
            .setLabel("Radio Information")
            .setStyle(ButtonStyle.Secondary);

          const termsBtn = new ButtonBuilder()
            .setCustomId(`terms_${selectedCode}`)
            .setLabel("Common Terms")
            .setStyle(ButtonStyle.Secondary);

          const backBtn = new ButtonBuilder()
            .setCustomId("back_list")
            .setLabel("← Back to List")
            .setStyle(ButtonStyle.Danger);

          const buttons = [sopBtn, radioBtn, termsBtn];
          if (isAdmin) {
            buttons.push(
              new ButtonBuilder()
                .setCustomId(`training_${selectedCode}`)
                .setLabel("Training")
                .setStyle(ButtonStyle.Success)
            );
          }
          buttons.push(backBtn);

          const buttonRow = new ActionRowBuilder().addComponents(buttons);

          return await i.editReply({
            embeds: [detailEmbed],
            components: [buttonRow],
          });
        }

        // 🟨 Extract code safely
        const match = i.customId.match(
          /^(sop|radio|terms|training|back_spec)_(.+)$/
        );
        const action = match?.[1];
        const code = match?.[2];
        const spec = specs[code];
        if (!spec) return;

        const safeText = (t) =>
          t && t.trim().length > 0 ? t : "_No data available._";

        // 🟩 Create back button
        const backBtn = new ButtonBuilder()
          .setCustomId(`back_spec_${code}`)
          .setLabel("← Back")
          .setStyle(ButtonStyle.Danger);

        const backRow = new ActionRowBuilder().addComponents(backBtn);

        // 🟦 Section embeds
        if (action === "sop") {
          return await i.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x004aad)
                .setTitle(`📋 SOP — ${spec.name}`)
                .setDescription(safeText(spec.sop)),
            ],
            components: [backRow],
          });
        }

        if (action === "radio") {
          return await i.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x004aad)
                .setTitle(`📡 Radio Information — ${spec.name}`)
                .setDescription(safeText(spec.radio)),
            ],
            components: [backRow],
          });
        }

        if (action === "terms") {
          return await i.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x004aad)
                .setTitle(`📘 Common Terms — ${spec.name}`)
                .setDescription(safeText(spec.terms)),
            ],
            components: [backRow],
          });
        }

        // 🟨 Training (admins only)
        if (action === "training" && isAdmin) {
          return await i.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x2ecc71)
                .setTitle(`🎯 Training — ${spec.name}`)
                .setDescription(safeText(spec.training)),
            ],
            components: [backRow],
          });
        }

        // 🟧 Back to specialization view
        if (action === "back_spec") {
          const desc =
            spec.description?.trim() || "_No description available._";

          const detailEmbed = new EmbedBuilder()
            .setColor(0x004aad)
            .setTitle(`📘 ${spec.name}`)
            .setDescription(desc)
            .setFooter({
              text: `Specialization Code: ${code.toUpperCase()}`,
            });

          const sopBtn = new ButtonBuilder()
            .setCustomId(`sop_${code}`)
            .setLabel("SOP")
            .setStyle(ButtonStyle.Primary);

          const radioBtn = new ButtonBuilder()
            .setCustomId(`radio_${code}`)
            .setLabel("Radio Information")
            .setStyle(ButtonStyle.Secondary);

          const termsBtn = new ButtonBuilder()
            .setCustomId(`terms_${code}`)
            .setLabel("Common Terms")
            .setStyle(ButtonStyle.Secondary);

          const buttons = [sopBtn, radioBtn, termsBtn];
          if (isAdmin) {
            buttons.push(
              new ButtonBuilder()
                .setCustomId(`training_${code}`)
                .setLabel("Training")
                .setStyle(ButtonStyle.Success)
            );
          }
          buttons.push(
            new ButtonBuilder()
              .setCustomId("back_list")
              .setLabel("← Back to List")
              .setStyle(ButtonStyle.Danger)
          );

          const buttonRow = new ActionRowBuilder().addComponents(buttons);

          return await i.editReply({
            embeds: [detailEmbed],
            components: [buttonRow],
          });
        }

        // 🟥 Back to main list
        if (i.customId === "back_list") {
          return await i.editReply({
            embeds: [listEmbed],
            components: [selectRow],
          });
        }
      } catch (err) {
        console.error("❌ Interaction handling error:", err);
        try {
          await i.followUp({
            content:
              "⚠️ An error occurred while processing this interaction.",
            flags: 1 << 6,
          });
        } catch {}
      }
    });

    collector.on("end", async () => {
      try {
        await message.edit({ components: [] });
      } catch {}
    });
  } catch (err) {
    console.error("❌ Command execution error:", err);
    await interaction.reply({
      content: "⚠️ Failed to load specializations.",
      flags: 1 << 6,
    });
  }
}
