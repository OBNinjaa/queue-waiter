const { createClient, createServer, states } = require("minecraft-protocol");

let userClient;
const packets = [];
let previousQueueNumber = null;

const { username } = require("./username.json");

const proxyClient = createClient({
  username: username,
  auth: "microsoft",
  host: "2B2T.ORG",
  port: 25565,
  keepAlive: true,
  version: "1.19.4",
  hideErrors: true,
});

proxyClient.on("packet", (data, meta) => {
  if (meta.name === "keep_alive") return;
  if (!["keep_alive", "success", "custom_payload", "encryption_begin", "compress", "look", "flying", "open_window", "close_window", "close_window", "player_chat", "profileless_chat"].includes(meta.name)) packets.push([meta, data]);

  if (meta.name === "set_title_subtitle") {
    try {
      const parsedData = JSON.parse(data.text);
      const queueText = parsedData.text;
      const queueNumber = parseInt(queueText.match(/\d+/)[0]);

      if (previousQueueNumber !== queueNumber) {
        console.log("Position in queue", queueNumber);
        previousQueueNumber = queueNumber;
      }
    } catch (err) {
      return;
    }
  }

  if (!userClient || meta.state !== states.PLAY || userClient.state !== states.PLAY) return;
  userClient.write(meta.name, data);
  if (meta.name === "set_compression") userClient.compressionThreshold = data.threshold;
});

proxyClient.on("raw", (buffer, meta) => {
  if (!userClient || meta.name === "keep_alive" || meta.state !== states.PLAY || userClient.state !== states.PLAY) return;
});

proxyClient.on("end", () => {
  if (!userClient) return;
  userClient.end("Proxy client ended");
});

proxyClient.on("error", (error) => {
  if (!userClient) return;
  console.error("Proxy client error:", error);
  userClient.end(error);
});

const proxyServer = createServer({
  "online-mode": true,
  host: "0.0.0.0",
  port: 25566,
  keepAlive: false,
  version: "1.19.4",
});

proxyServer.on("login", (client) => {
  console.log(`${client.username} has connected`);

  packets.forEach((p) => {
    const meta = p[0];
    const data = p[1];
    client.write(meta.name, data);
  });

  userClient = client;

  client.on("packet", (data, meta) => {
    if (meta.name === "keep_alive") return;
    if (!proxyClient || meta.state !== states.PLAY || proxyClient.state !== states.PLAY) return;
    proxyClient.write(meta.name, data);
  });

  client.on("raw", (buffer, meta) => {
    if (meta.name === "keep_alive") return;
    if (!proxyClient || meta.state !== states.PLAY || proxyClient.state !== states.PLAY) return;
  });

  client.on("end", () => {
    if (!proxyClient) return;
    console.log(`${client.username} has disconnected`);
  });

  client.on("error", (error) => {
    if (!proxyClient) return;
    console.error(error);
  });
});
