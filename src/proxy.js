const {
  createClient,
  createServer,
  states: { PLAY },
} = require("minecraft-protocol");
const bufferEqual = require("buffer-equal");
const colors = require("colors");
const figlet = require("figlet");

console.clear();
console.log(
  figlet.textSync("2B2T Waiter", {
    font: "colossal",
    horizontalLayout: "default",
    verticalLayout: "default",
  }).yellow
);

console.log(colors.yellow(`dsc.gg/mineflayer`));
console.log(colors.yellow(`github.com/OBNinjaa`));

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
  if (!["update_time", "success", "custom_payload", "playerlist_header", "player_info", "encryption_begin", "compress"].includes(meta.name))
    packets.push([meta, data]);
  if (!userClient || meta.state !== PLAY || userClient.state !== PLAY) return;
  userClient.write(meta.name, data);
  if (meta.name === "set_compression") userClient.compressionThreshold = data.threshold;
});

proxyClient.on("raw", (buffer, meta) => {
  if (!userClient || meta.name === "keep_alive" || meta.state !== PLAY || userClient.state !== PLAY) return;
  const packetData = proxyClient.deserializer.parsePacketBuffer(buffer).data.params;
  const packetBuff = userClient.serializer.createPacketBuffer({ name: meta.name, params: packetData });
  if (!bufferEqual(buffer, packetBuff)) {
    console.log(`[${new Date().toLocaleTimeString().grey}]`, "client<-server: Error in packet " + meta.state + "." + meta.name);
    console.log(`[${new Date().toLocaleTimeString().grey}]`, "received buffer", buffer.toString("hex"));
    console.log(`[${new Date().toLocaleTimeString().grey}]`, "produced buffer", packetBuff.toString("hex"));
    console.log(`[${new Date().toLocaleTimeString().grey}]`, "received length", buffer.length);
    console.log(`[${new Date().toLocaleTimeString().grey}]`, "produced length", packetBuff.length);
  }
});

proxyClient.on("end", () => {
  if (!userClient) return;
  userClient.end("End");
  console.log(`[${new Date().toLocaleTimeString().grey}]`, colors.red(`Disconnected From The Server`), "[ENDED]");
});

proxyClient.on("error", (error) => {
  if (!userClient) return;
  userClient.end(error);
  console.log(`[${new Date().toLocaleTimeString().grey}]`, colors.red(`Client Was Disconnected`), "[ERROR]");
  console.error(`[${new Date().toLocaleTimeString().cyan}]`, colors.red(error.message));
});

proxyClient.on("animation", (packet) => {
  console.log(packet);
});

proxyClient.on("chat", (packet) => {
  const message = JSON.parse(packet.message);
  const messageText = message.extra
    ? message.extra
        .map((i) => i.text)
        .join("")
        .slice(0, 22)
    : message.text;
  console.log(`[${new Date().toLocaleTimeString().cyan}]`, colors.yellow(messageText));
});

const proxyServer = createServer({
  "online-mode": true,
  "max-players": 1,
  host: local,
  port: 25566,
  motd: "github.com/OBNinjaa",
  keepAlive: false,
  version: version,
});

proxyServer.on("login", (client) => {
  console.log(`[${new Date().toLocaleTimeString().grey}]`, colors.red(`Client Connected To The Server`));
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
    const packetData = client.deserializer.parsePacketBuffer(buffer).data.params;
    const packetBuff = proxyClient.serializer.createPacketBuffer({ name: meta.name, params: packetData });
    if (!bufferEqual(buffer, packetBuff)) {
      console.log(`[${new Date().toLocaleTimeString().cyan}]`, "client<-server: Error in packet " + meta.state + "." + meta.name);
      console.log(`[${new Date().toLocaleTimeString().cyan}]`, "received buffer", buffer.toString("hex"));
      console.log(`[${new Date().toLocaleTimeString().cyan}]`, "produced buffer", packetBuff.toString("hex"));
      console.log(`[${new Date().toLocaleTimeString().cyan}]`, "received length", buffer.length);
      console.log(`[${new Date().toLocaleTimeString().cyan}]`, "produced length", packetBuff.length);
    }
  });

  client.on("end", () => {
    if (!proxyClient) return;
    //   proxyClient.end("End");
    console.log(`[${new Date().toLocaleTimeString().cyan}]`, colors.red(`Client Disconnected From The Server`), "[ENDED]");
  });

  client.on("error", (error) => {
    if (!proxyClient) return;
    //   proxyClient.end(error);
    console.log(`[${new Date().toLocaleTimeString().red}]`, colors.red(`Client Disconnected From The Server`), `[ERROR]`);
    client.end(`\u00A76\u00A7lYou Was Kicked\u00A7r\n\u00A7c\u00A7l${error}`);
    console.log(error);
  });
});
