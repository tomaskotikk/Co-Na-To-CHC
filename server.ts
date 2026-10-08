import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { Game } from "./lib/server/game";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;

const app = next({ dev, hostname: "localhost", port });

app.prepare().then(() => {
  const handle = app.getRequestHandler();
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, {
    // nenechat socket.io zabíjet cizí websockety (HMR Next.js v dev režimu)
    destroyUpgrade: false,
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });

  const game = new Game(io, port);

  httpServer.listen(port, "0.0.0.0", () => {
    const line = "─".repeat(52);
    console.log(`\n${line}\n  CO NA TO CHC  ·  ${dev ? "vývojový režim" : "produkce"}\n${line}`);
    console.log(`  Projektor (na notebooku):  http://localhost:${port}`);
    for (const url of game.lanUrls) console.log(`  V síti:                    ${url}`);
    if (process.env.PUBLIC_URL) console.log(`  Veřejná adresa:            ${process.env.PUBLIC_URL}`);
    console.log(`${line}\n`);
  });
});
