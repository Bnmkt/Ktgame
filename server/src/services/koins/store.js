import { createHash, randomBytes, randomUUID } from "node:crypto";
import { defaultKoinConfig, validateKoinConfig } from "./config.js";
const json = (row) => (row ? JSON.parse(row.data) : null);
const codeHash = (value) =>
  createHash("sha256")
    .update(
      String(value ?? "")
        .toUpperCase()
        .replace(/[-\s]/g, ""),
    )
    .digest("hex");
export function createKoinStore(sqlite) {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS koin_settings(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS koin_wallets(user_id TEXT PRIMARY KEY,balance INTEGER NOT NULL DEFAULT 0,blocked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS koin_ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,delta INTEGER NOT NULL,balance INTEGER NOT NULL,source TEXT NOT NULL UNIQUE,reason TEXT NOT NULL,created_at TEXT NOT NULL,data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS koin_ledger_user ON koin_ledger(user_id,created_at);
    CREATE TABLE IF NOT EXISTS koin_cosmetic_grants(user_id TEXT NOT NULL,item_type TEXT NOT NULL,item_value TEXT NOT NULL,PRIMARY KEY(user_id,item_type,item_value));
    CREATE TABLE IF NOT EXISTS koin_orders(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,provider TEXT NOT NULL,provider_ref TEXT UNIQUE,payment_ref TEXT,status TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS koin_orders_user ON koin_orders(user_id,created_at);
    CREATE INDEX IF NOT EXISTS koin_orders_payment ON koin_orders(payment_ref);
    CREATE TABLE IF NOT EXISTS koin_codes(hash TEXT PRIMARY KEY,batch TEXT NOT NULL,amount INTEGER NOT NULL,expires_at TEXT,used_by TEXT,used_at TEXT,label TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS koin_skus(id TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS koin_documents(id TEXT PRIMARY KEY,event_key TEXT NOT NULL UNIQUE,user_id TEXT NOT NULL,number TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,data TEXT NOT NULL,body BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS koin_document_numbers(event_key TEXT PRIMARY KEY,number TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS koin_jobs(id TEXT PRIMARY KEY,kind TEXT NOT NULL,order_id TEXT NOT NULL,data TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,last_error TEXT);
    CREATE TABLE IF NOT EXISTS koin_mail_log(id TEXT PRIMARY KEY,job_id TEXT NOT NULL,created_at TEXT NOT NULL,status TEXT NOT NULL,message TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS koin_jobs_pending ON koin_jobs(state,next_at);
    CREATE INDEX IF NOT EXISTS koin_documents_user ON koin_documents(user_id,created_at);`);
  const atomic = (fn) => {
    sqlite.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  };
  const config = () =>
    json(sqlite.prepare("SELECT data FROM koin_settings WHERE id=1").get()) ??
    structuredClone(defaultKoinConfig);
  const wallet = (id) => {
    const row = sqlite
      .prepare("SELECT balance,blocked FROM koin_wallets WHERE user_id=?")
      .get(id);
    return { balance: row?.balance ?? 0, blocked: Boolean(row?.blocked) };
  };
  function change(userId, delta, source, reason, data = {}) {
    const prior = sqlite
      .prepare("SELECT * FROM koin_ledger WHERE source=?")
      .get(source);
    if (prior) {
      if (prior.user_id !== userId || prior.delta !== delta)
        throw Error("Référence de crédit déjà attribuée.");
      return prior.balance;
    }
    if (!Number.isSafeInteger(delta) || Math.abs(delta) > 1000000000000)
      throw Error("Montant Koins invalide.");
    sqlite
      .prepare("INSERT OR IGNORE INTO koin_wallets(user_id) VALUES(?)")
      .run(userId);
    if (
      sqlite
        .prepare(
          "SELECT 1 FROM koin_orders WHERE user_id=? AND json_extract(data,'$.disputed')=1 LIMIT 1",
        )
        .get(userId)
    )
      sqlite
        .prepare("UPDATE koin_wallets SET blocked=1 WHERE user_id=?")
        .run(userId);
    const balance = wallet(userId).balance + delta;
    if (!Number.isSafeInteger(balance) || Math.abs(balance) > 1000000000000)
      throw Error("Limite de portefeuille atteinte.");
    sqlite
      .prepare("UPDATE koin_wallets SET balance=? WHERE user_id=?")
      .run(balance, userId);
    sqlite
      .prepare("INSERT INTO koin_ledger VALUES(?,?,?,?,?,?,?,?)")
      .run(
        randomUUID(),
        userId,
        delta,
        balance,
        source,
        reason,
        new Date().toISOString(),
        JSON.stringify(data),
      );
    return balance;
  }
  const order = (id) =>
    json(sqlite.prepare("SELECT data FROM koin_orders WHERE id=?").get(id));
  function saveOrder(row) {
    sqlite
      .prepare(
        "INSERT INTO koin_orders VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET provider_ref=excluded.provider_ref,payment_ref=excluded.payment_ref,status=excluded.status,data=excluded.data",
      )
      .run(
        row.id,
        row.userId,
        row.provider,
        row.providerRef ?? null,
        row.paymentRef ?? null,
        row.status,
        JSON.stringify(row),
        row.createdAt,
      );
    return row;
  }
  function job(id, kind, orderId, data = {}) {
    sqlite
      .prepare(
        "INSERT OR IGNORE INTO koin_jobs(id,kind,order_id,data) VALUES(?,?,?,?)",
      )
      .run(
        id,
        kind,
        orderId,
        JSON.stringify({ createdAt: new Date().toISOString(), ...data }),
      );
  }
  function reverse(row, cents) {
    row.refundedCents = Math.max(
      row.refundedCents ?? 0,
      Math.min(row.amountCents, cents),
    );
    const target = row.amountCents
      ? Math.ceil((row.koins * row.refundedCents) / row.amountCents)
      : 0;
    if (row.credited && target > (row.revokedKoins ?? 0)) {
      change(
        row.userId,
        -(target - (row.revokedKoins ?? 0)),
        `refund:${row.id}:${target}`,
        "refund",
        { orderId: row.id },
      );
      row.revokedKoins = target;
      job(`refund-document:${row.id}:${target}`, "document", row.id, {
        refund: true,
        refundedCents: row.refundedCents,
        revokedKoins: target,
        eventKey: `refund:${row.id}:${target}`,
      });
    }
    row.status =
      row.refundedCents === row.amountCents ? "refunded" : "partially_refunded";
    return saveOrder(row);
  }
  return {
    atomic,
    config,
    wallet,
    hasUnsettledPayment: (userId) =>
      Boolean(
        sqlite
          .prepare(
            "SELECT 1 FROM koin_orders WHERE user_id=? AND provider!='code' AND (json_extract(data,'$.disputed')=1 OR status='pending' AND (provider='stripe' OR provider_ref IS NOT NULL OR created_at>?)) LIMIT 1",
          )
          .get(userId, new Date(Date.now() - 86400000).toISOString()),
      ),
    order,
    saveOrder,
    job,
    saveConfig(input) {
      const next = validateKoinConfig(input);
      return atomic(() => {
        for (const offer of next.offers.filter((o) => o.discordSkuId)) {
          const prior = json(
            sqlite
              .prepare("SELECT data FROM koin_skus WHERE id=?")
              .get(offer.discordSkuId),
          );
          if (
            prior &&
            (prior.quantity + prior.bonus !== offer.quantity + offer.bonus ||
              prior.id !== offer.id)
          )
            throw Error(
              "Crée un nouveau SKU pour modifier la quantité associée à un SKU existant.",
            );
          sqlite
            .prepare("INSERT OR IGNORE INTO koin_skus VALUES(?,?)")
            .run(offer.discordSkuId, JSON.stringify(offer));
        }
        sqlite
          .prepare("INSERT OR REPLACE INTO koin_settings VALUES(1,?)")
          .run(JSON.stringify(next));
        return next;
      });
    },
    sku: (id) =>
      json(sqlite.prepare("SELECT data FROM koin_skus WHERE id=?").get(id)),
    createOrder(userId, provider, offer, details = {}) {
      const row = {
        id: randomUUID(),
        userId,
        provider,
        status: "pending",
        offer: structuredClone(offer),
        koins: offer.quantity + offer.bonus,
        amountCents: offer.priceCents,
        currency: "eur",
        credited: false,
        refundedCents: 0,
        revokedKoins: 0,
        createdAt: new Date().toISOString(),
        ...details,
      };
      return atomic(() => saveOrder(row));
    },
    complete(id, proof) {
      return atomic(() => {
        const row = order(id);
        if (!row) throw Error("Commande introuvable.");
        if (
          typeof proof.providerRef !== "string" ||
          !proof.providerRef ||
          proof.providerRef.length > 200 ||
          proof.provider !== row.provider ||
          proof.amountCents !== row.amountCents ||
          proof.currency !== row.currency ||
          Boolean(proof.test) !== Boolean(row.test) ||
          (row.providerRef && proof.providerRef !== row.providerRef)
        )
          throw Error("Confirmation de paiement incohérente.");
        if (row.credited) return row;
        row.proof = proof;
        row.paymentRef = proof.paymentRef ?? null;
        row.providerRef = proof.providerRef ?? row.providerRef;
        row.credited = true;
        row.status = "delivered";
        change(row.userId, row.koins, `payment:${row.id}`, "purchase", {
          orderId: row.id,
        });
        saveOrder(row);
        if (row.refundedCents) reverse(row, row.refundedCents);
        job(`document:${row.id}`, "document", row.id, {
          eventKey: `order:${row.id}`,
        });
        if (row.provider === "discord") {
          job(`consume:${row.providerRef}`, "discord-consume", row.id);
          job(`audit:${row.id}`, "discord-audit", row.id);
        }
        return saveOrder(row);
      });
    },
    reverse(id, cents) {
      if (!Number.isSafeInteger(cents) || cents < 0)
        throw Error("Remboursement invalide.");
      return atomic(() => {
        const row = order(id);
        if (!row) throw Error("Commande introuvable.");
        return reverse(row, cents);
      });
    },
    setDispute(id, active) {
      return atomic(() => {
        const row = order(id);
        if (!row) throw Error("Commande introuvable.");
        row.disputed = active;
        saveOrder(row);
        const held = sqlite
          .prepare(
            "SELECT 1 FROM koin_orders WHERE user_id=? AND json_extract(data,'$.disputed')=1 LIMIT 1",
          )
          .get(row.userId);
        sqlite
          .prepare("UPDATE koin_wallets SET blocked=? WHERE user_id=?")
          .run(held ? 1 : 0, row.userId);
      });
    },
    spend(userId, amount, source, items) {
      if (sqlite.isTransaction === false)
        throw Error("Transaction atomique requise.");
      if (!Number.isSafeInteger(amount) || amount < 0)
        throw Error("Prix Koins invalide.");
      const current = wallet(userId);
      if (current.blocked || current.balance < amount)
        throw Object.assign(
          Error("Koins insuffisants ou portefeuille suspendu."),
          { code: "KOINS_BALANCE", status: 409 },
        );
      const balance = change(userId, -amount, source, "cosmetics", { items });
      for (const item of items)
        if (item.type && item.value)
          sqlite
            .prepare("INSERT OR IGNORE INTO koin_cosmetic_grants VALUES(?,?,?)")
            .run(userId, item.type, item.value);
      return balance;
    },
    revokeDiscord(id) {
      return atomic(() => {
        const row = order(id);
        if (!row || row.provider !== "discord")
          throw Error("Commande Discord introuvable.");
        if (row.credited && !row.revokedKoins) {
          change(row.userId, -row.koins, `discord-refund:${row.id}`, "refund", {
            orderId: row.id,
          });
          row.revokedKoins = row.koins;
          row.status = "refunded";
          job(`refund-document:${row.id}`, "document", row.id, {
            refund: true,
            eventKey: `refund:${row.id}`,
          });
          saveOrder(row);
        }
        return row;
      });
    },
    generate({ amount, count, expiresAt, label }) {
      if (
        !Number.isSafeInteger(amount) ||
        amount < 1 ||
        amount > 1000000 ||
        !Number.isSafeInteger(count) ||
        count < 1 ||
        count > 500
      )
        throw Error("Quantité invalide : 1 à 500 codes, 1 à 1 000 000 Koins.");
      if (
        expiresAt &&
        (!Number.isFinite(Date.parse(expiresAt)) ||
          Date.parse(expiresAt) <= Date.now())
      )
        throw Error("Expiration invalide.");
      return atomic(() => {
        const batch = randomUUID(),
          codes = [];
        for (let i = 0; i < count; i++) {
          const code = `KTGA-${randomBytes(16).toString("hex").toUpperCase().match(/.{4}/g).join("-")}`;
          sqlite
            .prepare("INSERT INTO koin_codes VALUES(?,?,?,?,NULL,NULL,?)")
            .run(
              codeHash(code),
              batch,
              amount,
              expiresAt || null,
              String(label ?? "").slice(0, 120),
            );
          codes.push(code);
        }
        return { batch, codes };
      });
    },
    redeem(userId, code, details = {}) {
      if (typeof code !== "string" || code.length > 100)
        throw Error("Code invalide ou indisponible.");
      return atomic(() => {
        const hash = codeHash(code),
          row = sqlite
            .prepare("SELECT * FROM koin_codes WHERE hash=?")
            .get(hash);
        if (
          !row ||
          row.used_by ||
          (row.expires_at && Date.parse(row.expires_at) <= Date.now())
        )
          throw Error("Code invalide ou indisponible.");
        const usedAt = new Date().toISOString();
        if (
          sqlite
            .prepare(
              "UPDATE koin_codes SET used_by=?,used_at=? WHERE hash=? AND used_by IS NULL",
            )
            .run(userId, usedAt, hash).changes !== 1
        )
          throw Error("Code indisponible.");
        const receipt = {
          id: randomUUID(),
          userId,
          provider: "code",
          status: "delivered",
          createdAt: usedAt,
          koins: row.amount,
          amountCents: 0,
          currency: "eur",
          credited: true,
          codeReference: hash.slice(0, 16),
          campaign: row.label,
          ...details,
        };
        change(userId, row.amount, `code:${hash}`, "code", {
          reference: receipt.codeReference,
          campaign: row.label,
        });
        saveOrder(receipt);
        job(`document:${receipt.id}`, "document", receipt.id, {
          eventKey: `order:${receipt.id}`,
        });
        return receipt;
      });
    },
    findByRef(ref) {
      return json(
        sqlite
          .prepare(
            "SELECT data FROM koin_orders WHERE provider_ref=? OR payment_ref=?",
          )
          .get(ref, ref),
      );
    },
    pendingDiscordIntent(userId, skuId, test) {
      return json(
        sqlite
          .prepare(
            "SELECT data FROM koin_orders WHERE user_id=? AND provider='discord' AND provider_ref IS NULL AND json_extract(data,'$.offer.discordSkuId')=? AND json_extract(data,'$.test')=? ORDER BY created_at DESC LIMIT 1",
          )
          .get(userId, skuId, test ? 1 : 0),
      );
    },
    orders({
      userId,
      search = "",
      provider = "",
      status = "",
      limit = 50,
      offset = 0,
    } = {}) {
      return sqlite
        .prepare(
          "SELECT data FROM koin_orders WHERE (? IS NULL OR user_id=?) AND (?='' OR data LIKE ?) AND (?='' OR provider=?) AND (?='' OR status=?) ORDER BY created_at DESC,rowid DESC LIMIT ? OFFSET ?",
        )
        .all(
          userId ?? null,
          userId ?? null,
          search,
          `%${String(search).slice(0, 120)}%`,
          provider,
          provider,
          status,
          status,
          Math.min(100, limit),
          Math.max(0, offset),
        )
        .map(json);
    },
    ledger: (userId, offset = 0) =>
      sqlite
        .prepare(
          "SELECT * FROM koin_ledger WHERE (? IS NULL OR user_id=?) ORDER BY created_at DESC,rowid DESC LIMIT 50 OFFSET ?",
        )
        .all(userId ?? null, userId ?? null, Math.max(0, offset))
        .map((row) => ({ ...row, data: JSON.parse(row.data) })),
    batches: () =>
      sqlite
        .prepare(
          "SELECT batch,label,amount,expires_at AS expiresAt,COUNT(*) AS count,SUM(used_by IS NOT NULL) AS used FROM koin_codes GROUP BY batch ORDER BY rowid DESC LIMIT 100",
        )
        .all(),
    documents: (userId, search = "", offset = 0) =>
      sqlite
        .prepare(
          "SELECT id,number,created_at AS createdAt,data FROM koin_documents WHERE (? IS NULL OR user_id=?) AND (?='' OR data LIKE ? OR number LIKE ?) ORDER BY created_at DESC,rowid DESC LIMIT 50 OFFSET ?",
        )
        .all(
          userId ?? null,
          userId ?? null,
          search,
          `%${String(search).slice(0, 120)}%`,
          `%${String(search).slice(0, 120)}%`,
          Math.max(0, offset),
        )
        .map((row) => ({ ...row, ...JSON.parse(row.data) })),
    document: (id) =>
      sqlite.prepare("SELECT * FROM koin_documents WHERE id=?").get(id),
    saveDocument(eventKey, userId, data, body) {
      return atomic(() => {
        const old = sqlite
          .prepare("SELECT id FROM koin_documents WHERE event_key=?")
          .get(eventKey);
        if (old) return old.id;
        const id = randomUUID(),
          number = sqlite
            .prepare(
              "SELECT number FROM koin_document_numbers WHERE event_key=?",
            )
            .get(eventKey)?.number;
        if (!number) throw Error("Numéro de document non réservé.");
        sqlite
          .prepare("INSERT INTO koin_documents VALUES(?,?,?,?,?,?,?)")
          .run(
            id,
            eventKey,
            userId,
            number,
            new Date().toISOString(),
            JSON.stringify(data),
            body,
          );
        return id;
      });
    },
    reserveDocumentNumber(eventKey) {
      return atomic(() => {
        const old = sqlite
          .prepare("SELECT number FROM koin_document_numbers WHERE event_key=?")
          .get(eventKey);
        if (old) return old.number;
        const number = `KTGA-${new Date().getUTCFullYear()}-${String(sqlite.prepare("SELECT COUNT(*) AS n FROM koin_document_numbers").get().n + 1).padStart(7, "0")}`;
        sqlite
          .prepare("INSERT INTO koin_document_numbers VALUES(?,?)")
          .run(eventKey, number);
        return number;
      });
    },
    pendingJobs: () =>
      sqlite
        .prepare(
          "SELECT * FROM koin_jobs WHERE state='pending' AND next_at<=? ORDER BY rowid LIMIT 10",
        )
        .all(Date.now())
        .map((row) => ({ ...row, data: JSON.parse(row.data) })),
    finishJob: (id) =>
      sqlite
        .prepare("UPDATE koin_jobs SET state='done',last_error=NULL WHERE id=?")
        .run(id),
    deferJob: (id, nextAt) =>
      sqlite
        .prepare(
          "UPDATE koin_jobs SET next_at=?,attempts=0,last_error=NULL WHERE id=?",
        )
        .run(nextAt, id),
    failJob(row, error) {
      sqlite
        .prepare(
          "UPDATE koin_jobs SET attempts=attempts+1,state=?,last_error=?,next_at=? WHERE id=?",
        )
        .run(
          row.attempts >= 9 ? "failed" : "pending",
          String(error.message ?? error).slice(0, 500),
          Date.now() + Math.min(86400000, 60000 * 2 ** row.attempts),
          row.id,
        );
      sqlite
        .prepare("INSERT INTO koin_mail_log VALUES(?,?,?,?,?)")
        .run(
          randomUUID(),
          row.id,
          new Date().toISOString(),
          "failed",
          String(error.message ?? error).slice(0, 500),
        );
    },
    mailSuccess: (id) =>
      sqlite
        .prepare("INSERT INTO koin_mail_log VALUES(?,?,?,?,?)")
        .run(randomUUID(), id, new Date().toISOString(), "sent", ""),
    jobs: (offset = 0) =>
      sqlite
        .prepare(
          "SELECT * FROM koin_jobs ORDER BY CASE WHEN state='failed' OR last_error IS NOT NULL THEN 0 WHEN state='pending' THEN 1 ELSE 2 END,rowid DESC LIMIT 100 OFFSET ?",
        )
        .all(Math.max(0, Math.floor(Number(offset) || 0))),
    mailLog: (offset = 0) =>
      sqlite
        .prepare(
          "SELECT * FROM koin_mail_log ORDER BY rowid DESC LIMIT 100 OFFSET ?",
        )
        .all(Math.max(0, Math.floor(Number(offset) || 0))),
    retry: (id) =>
      sqlite
        .prepare(
          "UPDATE koin_jobs SET state='pending',attempts=0,next_at=0 WHERE id=?",
        )
        .run(id),
    statistics: () =>
      sqlite
        .prepare(
          "SELECT provider,status,COALESCE(json_extract(data,'$.test'),0) AS test,COUNT(*) AS count,SUM(CASE WHEN json_extract(data,'$.amountKnown')=0 THEN NULL ELSE json_extract(data,'$.amountCents') END) AS cents,SUM(json_extract(data,'$.refundedCents')) AS refundedCents FROM koin_orders GROUP BY provider,status,test",
        )
        .all(),
  };
}
