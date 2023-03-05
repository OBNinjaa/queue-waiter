const {
  createClient,
  createServer,
  states: { PLAY },
} = require("minecraft-protocol");
const bufferEqual = require("buffer-equal");
const colors = require("colors");

console.log(`[${new Date().toLocaleTimeString().grey}]`, colors.yellow(`Created by OBNinjaa`));
console.log(`[${new Date().toLocaleTimeString().grey}]`, colors.yellow(`https://dsc.gg/wolkig`));

const config = require("./config.json");
const { username, password, auth, version, host, local } = config;

let userClient;
const packets = [];

const proxyClient = createClient({
  username: username,
  password: password || null,
  auth: auth,
  host: host,
  port: 25565,
  keepAlive: true,
  version: version,
});

proxyClient.on("packet", (data, meta) => {
  if (meta.name === "keep_alive") return;
  if (
    ![
      "keep_alive",
      "animation",
      "entity_action",
      "entity_teleport",
      "entity_velocity",
      "entity_head_look",
      "entity_effect",
      "entity_equipment",
      "entity_properties",
      "vehicle_move",
      "vehicle_look",
      "player_abilities",
      "tab_complete",
      "chat",
      "spectate",
      "update_time",
      "success",
      "custom_payload",
      "encryption_begin",
      "compress",
      "remove_entity_effect",
      "rel_entity_move",
      "entity_move_look",
      "flying",
      "open_window",
    ].includes(meta.name)
  )
    packets.push([meta, data]);

  if (!userClient || meta.state !== PLAY || userClient.state !== PLAY) return;
  userClient.write(meta.name, data);
  if (meta.name === "set_compression") userClient.compressionThreshold = data.threshold;
});

proxyClient.on("raw", (buffer, meta) => {
  if (!userClient || meta.name === "keep_alive" || meta.state !== PLAY || userClient.state !== PLAY) return;
});

proxyClient.on("end", () => {
  if (!userClient) return;
  userClient.end("End");
  console.log(`[${new Date().toLocaleTimeString().grey}]`, colors.yellow(`Disconnected From The Server`), "[ENDED]".grey);
});

proxyClient.on("error", (error) => {
  if (!userClient) return;
  userClient.end(error);
  console.log(`[${new Date().toLocaleTimeString().grey}]`, colors.yellow(`Client Was Disconnected`), "[ERROR]".red);
  console.error(`[${new Date().toLocaleTimeString().magenta}]`, colors.red(error.message));
});

proxyClient.on("chat", (packet) => {
  const message = JSON.parse(packet.message);
  const messageText = message.extra
    ? message.extra
        .map((i) => i.text)
        .join("")
        .slice(0, 22)
    : message.text;
  console.log(`[${new Date().toLocaleTimeString().magenta}]`, colors.white(messageText));
});

const proxyServer = createServer({
  "online-mode": true,
  "max-players": 1,
  host: local,
  port: 25566,
  motd: "By OBNinjaa\ndsc.gg/wolkig",
  keepAlive: false,
  version: version,
});

proxyServer.on("login", (client) => {
  console.log(`[${new Date().toLocaleTimeString().grey}]`, colors.green(`${client.username} connected to the server`));
  packets.forEach((p) => {
    const meta = p[0];
    const data = p[1];
    client.write(meta.name, data);
  });

  userClient = client;

  client.on("packet", (data, meta) => {
    if (meta.name === "keep_alive") return;
    if (!proxyClient || meta.state !== PLAY || proxyClient.state !== PLAY) return;
    proxyClient.write(meta.name, data);
  });

  client.on("raw", (buffer, meta) => {
    if (meta.name === "keep_alive") return;
    if (!proxyClient || meta.state !== PLAY || proxyClient.state !== PLAY) return;
  });

  client.on("end", (client) => {
    if (!proxyClient) return;
    console.log(`[${new Date().toLocaleTimeString().magenta}]`, colors.yellow(`Client disconnected from the server`), "[ENDED]".grey);
  });

  client.on("error", (error) => {
    if (!proxyClient) return;
    console.log(`[${new Date().toLocaleTimeString().red}]`, colors.yellow(`Client disconnected from the server`), `[ERROR]`.red);
    console.log(error.message);
  });
});
