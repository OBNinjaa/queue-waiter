const { createServer, createClient, states } = require("minecraft-protocol");
const { username, version, port } = require("./settings.json");

const server = createServer({ "online-mode": false, port, host: "0.0.0.0", version, keepAlive: false, hideErrors: true });
const remote = createClient({ host: "2B2T.ORG", port: 25565, version, username, auth: "microsoft", hideErrors: true });

const packets = new Map();
let user;
let queue;

remote.on("packet", handleRemotePacket);
server.on("login", handleClientLogin);

remote.on("end", () => {
  if (!user) return;
  user.end(`Something has gone terribly wrong.`);
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

function handleRemotePacket(data, meta) {
  if (shouldIgnorePacket(meta.name)) return;

  if (!dontStore(meta.name)) {
    packets.set(meta, data);
  }

  if (meta.name === "unload_chunk") {
    purgeChunk(data.chunkX, data.chunkZ);
  }

  if ([("title", "set_title_subtitle")].includes(meta.name)) {
    const parsedData = JSON.parse(data.text);
    const queueText = parsedData.text;
    const queueNumber = parseInt(queueText.match(/\d+/)[0]);

    if (queue !== queueNumber) {
      const currentTime = new Date().toLocaleTimeString();
      console.log(`[${currentTime}] Position in queue: ${queueNumber}`);
      queue = queueNumber;
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

  if (client.state === states.PLAY) {
    packets.forEach((data, meta) => {
      if (!shouldIgnorePacket(meta.name)) {
        client.write(meta.name, data);
      }
    });

    user = client;

    client.on("end", () => {
      console.log(`[-] ${client.username} disconnected from the proxy server.`);
    });
  }

  client.on("packet", handleClientPacket);
}

function handleClientPacket(data, meta) {
  if (shouldIgnorePacket(meta.name)) return;
  if (!remote || meta.state !== states.PLAY || remote.state !== states.PLAY) return;

  remote.write(meta.name, data);
}

function shouldIgnorePacket(packetName) {
  const ignoredPackets = ["keep_alive", "success", "custom_payload", "encryption_begin", "compress", "registry_data", "finish_configuration", "server_data"];
  return ignoredPackets.includes(packetName);
}

function dontStore(packetName) {
  const ignoredPackets = ["title", "set_title_subtitle", "unload_chunk", "chat"];
  return ignoredPackets.includes(packetName);
}
