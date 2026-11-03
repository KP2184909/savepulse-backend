"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const net = require("node:net");
const { once } = require("node:events");
const { sendProviderMail } = require("../src/emailDispatcher");

test("installed SMTP dependency sends through the real dispatcher to a loopback-only SMTP fixture", { timeout: 10000 }, async () => {
  const messages = [], sockets = new Set();
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket));
    let buffer = "", inData = false, message = "";
    socket.setEncoding("utf8"); socket.write("220 localhost SMTP fixture\r\n");
    socket.on("data", chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (inData) {
          if (line === ".") { messages.push(message); inData = false; socket.write("250 queued locally\r\n"); }
          else message += line + "\r\n";
        } else if (/^EHLO/i.test(line)) socket.write("250-localhost\r\n250 AUTH PLAIN\r\n");
        else if (/^AUTH PLAIN/i.test(line)) socket.write("235 authenticated fixture\r\n");
        else if (/^(MAIL FROM|RCPT TO)/i.test(line)) socket.write("250 OK\r\n");
        else if (line === "DATA") { inData = true; socket.write("354 send message\r\n"); }
        else if (line === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const result = await sendProviderMail({ from: "SavePulse <sender@example.invalid>", to: "recipient@example.invalid", subject: "SMTP compatibility", text: "Plain text", html: "<p>HTML version</p>" },
      { EMAIL_PROVIDER: "smtp", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(server.address().port), SMTP_USER: "fixture", SMTP_PASS: "fixture" });
    assert.equal(result.provider, "smtp"); assert.ok(result.messageId);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /Subject: SMTP compatibility/);
    assert.match(messages[0], /Plain text/); assert.match(messages[0], /HTML version/);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
});
