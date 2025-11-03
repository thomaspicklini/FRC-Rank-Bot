import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check FRC system latency and connection status.');

export async function execute(interaction) {
  // Step 1 — Send initial message
  const sent = await interaction.reply({ content: '📡 Running diagnostics...', fetchReply: true });

  // Step 2 — Calculate latency
  const roundTrip = sent.createdTimestamp - interaction.createdTimestamp;
  const apiPing = Math.round(interaction.client.ws.ping);

  // Step 3 — Determine connection type and color
  let color, status, emoji;
  if (roundTrip < 100) {
    color = 0x00ff7f; // Green
    emoji = '🟢';
    status = 'Excellent Connection';
  } else if (roundTrip < 200) {
    color = 0xffd700; // Yellow
    emoji = '🟡';
    status = 'Stable Connection';
  } else if (roundTrip < 300) {
    color = 0xffa500; // Orange
    emoji = '🟠';
    status = 'Moderate Lag';
  } else {
    color = 0xff0000; // Red
    emoji = '🔴';
    status = 'Severe Latency Detected';
  }

  // Step 4 — Build embed
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('📶 FRC Network Diagnostics')
    .addFields(
      { name: 'Connection Type', value: `${emoji} ${status}`, inline: false },
      { name: 'Round-trip Latency', value: `\`${roundTrip}ms\``, inline: true },
      { name: 'API Latency', value: `\`${apiPing}ms\``, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: 'FRC System Diagnostic Utility' });

  // Step 5 — Edit with final results
  await interaction.editReply({ content: '', embeds: [embed] });
}
