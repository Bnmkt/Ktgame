import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import jwt from "jsonwebtoken";

test(
  "actual gateway and accounts process preserve Jetons and atomic premium shop purchases",
  { timeout: 60000 },
  async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ktga-koins-api-")),
      filename = path.join(directory, "main.sqlite"),
      secret = "isolated-koins-api-secret";
    let child,
      output = "";
    try {
      const db = new DatabaseSync(filename);
      db.exec(
        "CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO meta VALUES('legacy-json-migrated','true'); CREATE TABLE users(id TEXT PRIMARY KEY,data TEXT NOT NULL,pseudo TEXT NOT NULL,email TEXT,guest INTEGER)",
      );
      for (const id of ["admin", "player", "editor", "minor"]) {
        const user = {
          id,
          pseudo: id,
          email: `${id}@example.org`,
          active: true,
          admin: id === "admin",
          editor: id === "editor",
          tokens: 10000,
          passwordHash: "test-unused",
          profile: { birthDate: id === "minor" ? "2012-01-01" : "1990-01-01" },
          emailVerifiedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        db.prepare("INSERT INTO users VALUES(?,?,?,?,0)").run(
          id,
          JSON.stringify(user),
          id,
          user.email,
        );
      }
      db.close();
      const listener = net.createServer();
      await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
      const port = listener.address().port;
      await new Promise((resolve) => listener.close(resolve));
      child = spawn(process.execPath, ["src/index.js"], {
        cwd: new URL("../", import.meta.url),
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          DOTENV_CONFIG_PATH: path.join(directory, "absent.env"),
          NODE_ENV: "production",
          HOST: "127.0.0.1",
          PORT: String(port),
          SQLITE_PATH: filename,
          JWT_SECRET: secret,
          APP_BASE_PATH: "",
          CLIENT_DIST: "",
          CLIENT_ORIGIN: "https://www.ktga.me",
          PUBLIC_APP_URL: "https://www.ktga.me",
          CONTACT_EMAIL: "test@example.org",
          TLS_TERMINATION: "proxy",
          TRUST_PROXY: "loopback",
          HTTPS_KEY_PATH: "",
          HTTPS_CERT_PATH: "",
          HTTPS_PFX_PATH: "",
          SMTP_HOST: "",
          SMTP_USER: "",
          SMTP_PASS: "",
          EMAIL_FROM: "",
          STRIPE_SECRET_KEY: "",
          STRIPE_WEBHOOK_SECRET: "",
          DISCORD_BOT_TOKEN: "",
          ACCOUNTS_PROCESS_ENABLED: "1",
          GAME_WORKERS_ENABLED: "1",
          GAME_WORKERS: "1",
          PATCHNOTES_UPLOAD_DIR: path.join(directory, "images"),
          BUG_REPORT_UPLOAD_DIR: path.join(directory, "bugs"),
          ...Object.fromEntries(
            [
              "PARENTAL_DB_PATH",
              "TRIBUNAL_DB_PATH",
              "CHAT_DB_PATH",
              "STATUS_DB_PATH",
              "REQUEST_LOG_PATH",
              "HELP_DB_PATH",
              "DATA_REQUEST_DB_PATH",
              "BUG_REPORT_DB_PATH",
              "PATCHNOTES_DB_PATH",
              "CONTACT_NOTICE_DB_PATH",
            ].map((key) => [key, path.join(directory, `${key}.sqlite`)]),
          ),
        },
      });
      child.stdout.on("data", (data) => (output += data));
      child.stderr.on("data", (data) => (output += data));
      const origin = `http://127.0.0.1:${port}`;
      let ready = false;
      for (let attempt = 0; attempt < 180; attempt++) {
        try {
          if ((await fetch(`${origin}/api/health`)).ok) {
            ready = true;
            break;
          }
        } catch {}
        if (child.exitCode !== null) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.ok(ready, output.slice(-5000));
      const request = async (id, route, method = "GET", body) => {
        const response = await fetch(`${origin}${route}`, {
          method,
          headers: {
            Origin: "https://www.ktga.me",
            "content-type": "application/json",
            Authorization: `Bearer ${jwt.sign({ id, sessionVersion: 0 }, secret, { expiresIn: "1h" })}`,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: response.status, data: await response.json() };
      };
      assert.equal(
        (await request("editor", "/api/admin/monetization")).status,
        403,
      );
      let result = await request("admin", "/api/admin/monetization");
      assert.equal(result.status, 200);
      const config = {
        ...result.data.config,
        codesEnabled: true,
        shopEnabled: true,
        billing: {
          ...result.data.config.billing,
          administrativeEmail: "office@example.org",
          contactEmail: "contact@example.org",
        },
      };
      assert.equal(
        (await request("admin", "/api/admin/monetization", "PUT", config))
          .status,
        200,
      );
      result = await request("admin", "/api/admin/monetization/codes", "POST", {
        amount: 100,
        count: 1,
        label: "API",
      });
      assert.equal(result.status, 200);
      const code = result.data.codes[0];
      const concurrent = await Promise.all([
        request("player", "/api/me/koins/redeem", "POST", { code }),
        request("player", "/api/me/koins/redeem", "POST", { code }),
      ]);
      assert.deepEqual(concurrent.map((row) => row.status).sort(), [200, 400]);
      const create = async (
        name,
        type,
        koinPrice,
        tokenPriceEnabled = true,
      ) => {
        const row = await request("admin", "/api/admin/shop", "POST", {
          name,
          type,
          category: "classic",
          description: "Fixture",
          price: 100,
          koinPrice,
          tokenPriceEnabled,
          packName: "Koins fixture",
        });
        assert.equal(row.status, 200, JSON.stringify(row.data));
        return row.data;
      };
      const premium = await create("Premium icon", "icons", 30, false),
        second = await create("Premium cards", "cardSkins", 40),
        third = await create("Premium dice", "diceSkins", 10),
        expensive = await create("Too expensive", "nameEffects", 1000);
      assert.equal(
        (
          await request("player", "/api/shop/purchase", "POST", {
            itemId: premium.id,
            currency: "tokens",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request("player", "/api/shop/purchase", "POST", {
            itemId: expensive.id,
            currency: "koins",
          })
        ).status,
        409,
      );
      result = await request("player", "/api/shop/purchase", "POST", {
        itemId: premium.id,
        currency: "koins",
      });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      assert.equal(result.data.user.tokens, 10000);
      assert.deepEqual(result.data.achievementUnlocks, []);
      assert.equal(
        (
          await request("player", "/api/shop/purchase", "POST", {
            itemId: premium.id,
            currency: "koins",
          })
        ).status,
        200,
      );
      result = await request("player", "/api/shop/purchase-pack", "POST", {
        packId: "koins-fixture",
        itemIds: [second.id, third.id],
        currency: "koins",
      });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      assert.equal(result.data.pricing.total, 48);
      assert.equal(result.data.user.tokens, 10000);
      result = await request("player", "/api/me/koins");
      assert.equal(result.data.balance, 22);
      assert.equal(
        result.data.transactions.filter((row) => row.reason === "cosmetics")
          .length,
        2,
      );
      assert.equal(
        (
          await request("minor", "/api/me/koins/checkout", "POST", {
            offerId: config.offers[0].id,
            provider: "stripe",
            acceptedTerms: true,
          })
        ).status,
        400,
      );
      const inspect = new DatabaseSync(filename, { readOnly: true });
      try {
        assert.equal(
          inspect
            .prepare(
              "SELECT COUNT(*) n FROM koin_cosmetic_grants WHERE user_id='player'",
            )
            .get().n,
          3,
        );
        assert.equal(
          inspect
            .prepare(
              "SELECT COUNT(*) n FROM transactions WHERE user_id='player'",
            )
            .get().n,
          0,
        );
      } finally {
        inspect.close();
      }
    } finally {
      if (child && child.exitCode === null) {
        const exited = new Promise((resolve) => child.once("exit", resolve));
        child.kill();
        await exited;
      }
      assert.equal(
        path.dirname(path.resolve(directory)),
        path.resolve(os.tmpdir()),
      );
      assert.ok(path.basename(directory).startsWith("ktga-koins-api-"));
      fs.rmSync(directory, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  },
);
