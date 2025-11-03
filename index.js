// Disable noisy Node warnings
process.noDeprecation = true;
process.removeAllListeners('warning');

// ───────────────────────────────────────────────
// Mini Express Web Server (for UptimeRobot pings)
// ───────────────────────────────────────────────
import express from 'express';
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot is running.'));
app.listen(PORT, () => console.log(`🌐 Keep-alive server listening on port ${PORT}`));

// ───────────────────────────────────────────────
// FRC Rank Bot — Main Entry File
// ───────────────────────────────────────────────
import { Client, GatewayIntentBits, REST, Routes, Collection } from 'discord.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// Command collection
client.commands = new Collection();

// Load all command files
const commandsPath = path.resolve('./commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
const commands = [];

(async () => {
  for (const file of commandFiles) {
    const command = await import(`./commands/${file}`);
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      commands.push(command.data.toJSON());
    } else {
      console.warn(`[⚠️] Command ${file} missing "data" or "execute" property.`);
    }
  }

  // Register slash commands
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log(`✅ Registered ${commands.length} slash commands.`);
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }

  // Bot ready event
  client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
  });

  // Handle slash command interactions
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`❌ Error executing ${interaction.commandName}:`, error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ There was an error executing this command.', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ There was an error executing this command.', ephemeral: true });
      }
    }
  });

  // Login
  client.login(process.env.DISCORD_TOKEN);
})();
