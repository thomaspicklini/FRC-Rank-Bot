import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
} from "discord.js";
import { readFileSync, writeFileSync, existsSync } from "fs";

const specPath = new URL("../../data/specializations.json", import.meta.url);
let specializations = {};

function loadSpecs() {
  if (existsSync(specPath)) {
    try {
      const data = readFileSync(specPath, "utf8").trim();
      specializations = data ? JSON.parse(data) : {};
    } catch {
      console.error("⚠️ Error parsing specializations.json — resetting.");
      specializations = {};
    }
  } else {
    specializations = {};
  }
}

function saveSpecs() {
  writeFileSync(specPath, JSON.stringify(specializations, null, 2));
}

// ⚙️ MAIN MODULE RUN
export async function run(interaction, context = {}) {
  // 🚫 Security — only callable from /admin
  if (!context.calledFromAdmin) {
    return interaction.reply({
      content: "❌ This module can only be opened via `/admin`.",
      flags: ["Ephemeral"],
    });
  }

  const ADMIN_USER_ID = "1229270897626452038";

  // 🧭 Helper to rebuild panel
  async function refreshPanel(editInteraction = null) {
    loadSpecs();

    const embed = new EmbedBuilder()
      .setColor(0x004aad)
      .setTitle("⚙️ FRC Specialization Administration Panel")
      .setDescription("Manage all registered FRC specializations.")
      .addFields({
        name: "Current Specializations",
        value:
          Object.keys(specializations).length > 0
            ? Object.entries(specializations)
                .map(([code, value]) => `• **${value.name}** (${code})`)
                .join("\n")
            : "_No specializations added yet._",
      })
      .setFooter({ text: "FRC Command Access Only" });

    // Build buttons
    const row = new ActionRowBuilder();

    row.addComponents(
      new ButtonBuilder()
        .setCustomId("add_spec")
        .setLabel("➕ Add")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("edit_spec")
        .setLabel("✏️ Edit")
        .setStyle(ButtonStyle.Primary)
    );

    // 🗑️ Remove button only visible to you
    if (interaction.user.id === ADMIN_USER_ID) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId("remove_spec")
          .setLabel("🗑️ Remove")
          .setStyle(ButtonStyle.Danger)
      );
    }

    // ✅ Finish button (deletes panel)
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("finish_spec")
        .setLabel("✅ Finish")
        .setStyle(ButtonStyle.Secondary)
    );

    const payload = { embeds: [embed], components: [row] };
    let message;
    if (editInteraction) message = await editInteraction.editReply(payload);
    else message = await interaction.channel.send(payload);

    setTimeout(async () => {
      try {
        await message.delete();
      } catch {}
    }, 300000); // Auto delete after 5 minutes
  }

  await refreshPanel();

  // 🎯 Collector
  const collector = interaction.channel.createMessageComponentCollector({ time: 300000 });

  collector.on("collect", async (i) => {
    if (i.user.id !== interaction.user.id)
      return i.reply({
        content: "❌ Only the command executor can use this panel.",
        flags: ["Ephemeral"],
      });

    loadSpecs();

    // ✅ Finish
    if (i.customId === "finish_spec") {
      await i.deferUpdate();
      try {
        const msg = await i.fetchReply();
        await msg.delete();
      } catch {}
      collector.stop("finished");
      return;
    }

    // ➕ ADD
    if (i.customId === "add_spec") {
      const modal1 = new ModalBuilder()
        .setCustomId("add_step1")
        .setTitle("Add Specialization – Step 1");

      const fields = [
        ["spec_code", "Specialization Code", TextInputStyle.Short, "e.g., 32m", true],
        ["spec_name", "Name", TextInputStyle.Short, "e.g., Medic", true],
        ["spec_desc", "Description", TextInputStyle.Paragraph, "Brief summary of duties.", true],
      ];

      modal1.addComponents(
        ...fields.map(([id, label, style, placeholder, req]) =>
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(id)
              .setLabel(label)
              .setStyle(style)
              .setPlaceholder(placeholder)
              .setRequired(req)
          )
        )
      );

      await i.showModal(modal1);

      const step1 = await i
        .awaitModalSubmit({ filter: (m) => m.customId === "add_step1", time: 120000 })
        .catch(() => null);
      if (!step1) return;

      const code = step1.fields.getTextInputValue("spec_code").toLowerCase();
      const name = step1.fields.getTextInputValue("spec_name");
      const description = step1.fields.getTextInputValue("spec_desc");

      await step1.reply({
        content: `✅ Step 1 complete for **${name}** (${code}). Click below to continue.`,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`continue_step2_${code}`)
              .setLabel("Continue to Step 2")
              .setStyle(ButtonStyle.Primary)
          ),
        ],
        flags: ["Ephemeral"],
      });

      const buttonInt = await step1.channel
        .awaitMessageComponent({
          filter: (btn) =>
            btn.customId === `continue_step2_${code}` &&
            btn.user.id === interaction.user.id,
          time: 120000,
        })
        .catch(() => null);
      if (!buttonInt) return;

      const modal2 = new ModalBuilder()
        .setCustomId(`add_step2_${code}`)
        .setTitle("Add Specialization – Step 2");

      const fields2 = [
        ["spec_sop", "SOP", TextInputStyle.Paragraph, "", false],
        ["spec_radio", "Radio Info", TextInputStyle.Paragraph, "", false],
        ["spec_terms", "Common Terms", TextInputStyle.Paragraph, "", false],
        ["spec_training", "Training", TextInputStyle.Paragraph, "", false],
      ];

      modal2.addComponents(
        ...fields2.map(([id, label, style, placeholder, req]) =>
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(id)
              .setLabel(label)
              .setStyle(style)
              .setPlaceholder(placeholder)
              .setRequired(req)
          )
        )
      );

      await buttonInt.showModal(modal2);

      const step2 = await buttonInt
        .awaitModalSubmit({ filter: (m) => m.customId === `add_step2_${code}`, time: 120000 })
        .catch(() => null);
      if (!step2) return;

      const sop = step2.fields.getTextInputValue("spec_sop");
      const radio = step2.fields.getTextInputValue("spec_radio");
      const terms = step2.fields.getTextInputValue("spec_terms");
      const training = step2.fields.getTextInputValue("spec_training");

      specializations[code] = { name, description, sop, radio, terms, training };
      saveSpecs();

      await step2.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x00ff7f)
            .setTitle("✅ Specialization Added")
            .setDescription(`**${name}** (${code}) successfully added.`),
        ],
        flags: ["Ephemeral"],
      });

      await refreshPanel(i);
    }

    // ✏️ EDIT
    if (i.customId === "edit_spec") {
      if (Object.keys(specializations).length === 0)
        return i.reply({
          content: "⚠️ No specializations to edit.",
          flags: ["Ephemeral"],
        });

      const select = new StringSelectMenuBuilder()
        .setCustomId("spec_edit_select")
        .setPlaceholder("Select specialization to edit...")
        .addOptions(
          Object.entries(specializations).map(([code, value]) => ({
            label: value.name,
            description: (value.description || "No description").slice(0, 50),
            value: code,
          }))
        );

      await i.reply({
        content: "Select a specialization to edit:",
        components: [new ActionRowBuilder().addComponents(select)],
        flags: ["Ephemeral"],
      });
    }

    // 🗑️ REMOVE (only visible to you)
    if (i.customId === "remove_spec") {
      if (interaction.user.id !== ADMIN_USER_ID) return;
      if (Object.keys(specializations).length === 0)
        return i.reply({
          content: "⚠️ No specializations to remove.",
          flags: ["Ephemeral"],
        });

      const select = new StringSelectMenuBuilder()
        .setCustomId("spec_remove_select")
        .setPlaceholder("Select specialization to remove...")
        .addOptions(
          Object.entries(specializations).map(([code, value]) => ({
            label: value.name,
            description: (value.description || "No description").slice(0, 50),
            value: code,
          }))
        );

      await i.reply({
        content: "Select a specialization to delete:",
        components: [new ActionRowBuilder().addComponents(select)],
        flags: ["Ephemeral"],
      });
    }
  });
}
