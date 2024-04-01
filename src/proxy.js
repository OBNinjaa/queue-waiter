const { createServer, createClient, states } = require("minecraft-protocol");
const axios = require("axios");
const { username, host, version, port, webhook } = require("./settings.json");

const server = createServer({ "online-mode": false, port, host: "0.0.0.0", version, keepAlive: false, hideErrors: true });
const remote = createClient({ host, port: 25565, version, username, auth: "microsoft", hideErrors: true });

const packets = new Map();
let user;
let queue;
let estimation;

remote.on("packet", handleRemotePacket);
server.on("login", handleClientLogin);

remote.on("end", () => {
  if (!user) return;
  user.end(`The remote client has been disconnected.`);
  console.log(`[!] The remote client has been disconnected.`);
});

function purgeChunk(x, z) {
  const keysToRemove = [];

  packets.forEach((data, meta) => {
    if (meta.name === "map_chunk" && data.x === x && data.z === z) {
      keysToRemove.push(meta);
    }
  });

  keysToRemove.forEach((key) => {
    packets.delete(key);
  });
}

function purgePosition(x, y, z) {
  const keysToRemove = [];

  packets.forEach((data, meta) => {
    if (meta.name === "position" && data.x === x && data.y === y && data.z === z) {
      keysToRemove.push(meta);
    }
  });

  keysToRemove.forEach((key) => {
    packets.delete(key);
  });
}

function purgeLight(x, z) {
  const keysToRemove = [];

  packets.forEach((data, meta) => {
    if (meta.name === "update_light" && data.chunkX === x && data.chunkZ === z) {
      keysToRemove.push(meta);
    }
  });

  keysToRemove.forEach((key) => {
    packets.delete(key);
  });
}

function purgeDelimiter() {
  const keysToRemove = [];

  packets.forEach((data, meta) => {
    if (meta.name === "bundle_delimiter") {
      keysToRemove.push(meta);
    }

    keysToRemove.forEach((key) => {
      packets.delete(key);
    });
  });
}

function handleRemotePacket(data, meta) {
  if (shouldIgnorePacket(meta.name)) return;

  if (!dontStore(meta.name)) {
    packets.set(meta, data);
  }

  if (meta.name === "update_light") {
    purgeLight(data.chunkX, data.chunkZ);
  }

  if (meta.name === "position") {
    purgePosition(data.x, data.y, data.z);
  }

  if (meta.name === "unload_chunk") {
    purgeChunk(data.chunkX, data.chunkZ);
  }

  if (meta.name === "bundle_delimiter") {
    purgeDelimiter();
  }

  if (["title", "set_title_subtitle"].includes(meta.name) && host.toLowerCase() === "2b2t.org") {
    try {
      const parsedData = JSON.parse(data.text);
      const queueText = parsedData.text;

      const matchResult = queueText.match(/\d+/);

      if (matchResult !== null) {
        const queueNumber = parseInt(matchResult[0]);

        if (queue !== queueNumber) {
          const currentTime = new Date().toLocaleTimeString();
          console.log(`[${currentTime}] Position in queue: ${queueNumber} | Estimated time: ${estimation}`);
          send(`**[${currentTime}]** Position in queue: **${queueNumber}** | Estimated time: **${estimation}**`);
          queue = queueNumber;
          server.motd = `Position in queue: ${queueNumber}`;
        }
      }
    } catch (error) {
      return;
    }
  }

  if (meta.name === "playerlist_header" && host.toLowerCase() === "2b2t.org") {
    const headerData = JSON.parse(data.header);

    if (headerData.extra) {
      const estimatedTimeItem = headerData.extra.find((item) => item.text && item.text.startsWith("Estimated time: "));

      if (estimatedTimeItem && estimatedTimeItem.extra && estimatedTimeItem.extra[0] && estimatedTimeItem.extra[0].text) {
        const estimatedTime = estimatedTimeItem.extra[0].text.trim();
        const timeComponents = estimatedTime.match(/(\d+h)?(\d+m)?(\d+s)?/);

        if (timeComponents) {
          let hours = 0;
          let minutes = 0;
          let seconds = 0;

          if (timeComponents[1]) {
            hours = parseInt(timeComponents[1]);
          }
          if (timeComponents[2]) {
            minutes = parseInt(timeComponents[2]);
          }
          if (timeComponents[3]) {
            seconds = parseInt(timeComponents[3]);
          }

          estimation = `${hours}h ${minutes}m ${seconds}s`;
          server.motd = server.motd + `\nEstimated time: ${hours}h ${minutes}m ${seconds}s`;
        } else {
          console.log("Invalid estimated time format.");
        }
      } else {
        console.log("Estimated time not found.");
      }
    }
  }

  if (user && meta.state === states.PLAY && user.state === states.PLAY) {
    handleUserPacket(meta, data);
  }
}

function handleUserPacket(meta, data) {
  if (meta.name === "set_compression") {
    user.compressionThreshold = data.threshold;
  }

  user.write(meta.name, data);
}

function handleClientLogin(client) {
  console.log(`[+] ${client.username} connected to the proxy server.`);
  send(`**${client.username}** connected to the proxy server.`);

  if (client.state === states.PLAY) {
    packets.forEach((data, meta) => {
      if (!shouldIgnorePacket(meta.name)) {
        client.write(meta.name, data);
      }
    });

    user = client;

    client.on("end", () => {
      console.log(`[-] ${client.username} disconnected from the proxy server.`);
      send(`**${client.username}** disconnected from the proxy server.`);
    });
  }

  client.on("packet", handleClientPacket);
}

function handleClientPacket(data, meta) {
  if (shouldIgnorePacket(meta.name)) return;
  if (!remote || meta.state !== states.PLAY || remote.state !== states.PLAY) return;

  if (meta.name === "chat_command") {
    const command = data.command;

    switch (command) {
      case "packets":
        packetCount();
        break;
    }
  }

  remote.write(meta.name, data);
}

function shouldIgnorePacket(packetName) {
  const ignoredPackets = ["keep_alive", "success", "custom_payload", "encryption_begin", "compress", "registry_data", "finish_configuration", "server_data"];
  return ignoredPackets.includes(packetName);
}

function dontStore(packetName) {
  const ignoredPackets = [
    "title",
    "set_title_subtitle",
    "unload_chunk",
    "chat",
    "chat_suggestions",
    "profileless_chat",
    "player_chat",
    "system_chat",
    "chat_command",
    "chat_message",
    "open_window",
    "close_window",
    "entity_head_rotation",
    "entity_metadata",
    "attach_entity",
    "entity_velocity",
    "entity_equipment",
    "entity_sound_effect",
    "entity_teleport",
    "entity_update_attributes",
    "entity_effect",
    "use_entity",
    "entity_action",
    "rel_entity_move",
    "entity_move_look",
    "vehicle_move",
    "playerlist_header",
    "teams",
    "combat_event",
    "update_time",
    "named_sound_effect",
    "stop_sound",
    "sound_effect",
    "block_break_animation",
    "tile_entity_data",
    "advancements",
    "named_entity_spawn",
    "animation",
    "arm_animation",
    "teleport_confirm",
    "player_info",
    "spawn_entity",
    "set_title_time",
    "set_title_text",
  ];
  return ignoredPackets.includes(packetName);
}

function send(message) {
  try {
    axios.post(webhook, { content: message });
  } catch (error) {
    console.error(error);
  }
}

function packetCount() {
  console.log("Stored packets:");
  const packetCounts = new Map();

  packets.forEach((data, meta) => {
    const packetName = meta.name;
    if (packetCounts.has(packetName)) {
      packetCounts.set(packetName, packetCounts.get(packetName) + 1);
    } else {
      packetCounts.set(packetName, 1);
    }
  });

  packetCounts.forEach((count, packetName) => {
    console.log(`${packetName}: ${count}`);
  });
}
