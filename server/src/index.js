import "dotenv/config";
import { registrationAuthorization } from "./services/parental-approval.js";
import { activeModeration, activeParentalRevocation, createParentalControlStore, defaultMinorRestrictions, exactAge, featureAccess, isUnder13, minorRestrictionOptions, normalizeMinorRestrictions, registrationMarker, turnsThirteenAt } from "./services/parental-controls.js";
import { sendParentBirthdayReminder, sendParentDailySummary, sendParentalActionNotice, sendParentalAdminNotice, sendParentalDecision, sendParentVerification } from "./services/parental-email.js";
import { PRIVACY_VERSION, allowedUrlMarkers, createSiteActivityTracker, playerAchievementContext, setActivityConsent, validActivityConsent, tableActivityContext, tableTimeMetrics } from "./services/site-achievements.js";
import bcrypt from "bcryptjs";
import compression from "compression";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { randomBytes, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import v8 from "node:v8";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { games } from "./games/shared.js";
import { applyAction, createGameState, pokerHandLabel, pokerHandPreview, tickBattleState, tickPokerState } from "./games/engines.js";
import { normalizeBattleModifiers, normalizeGameModifiers } from "./games/modifiers.js";
import { midnightDiceBotAction } from "./games/engines/midnight-dice.js";
import { velvetRuseBotAction } from "./games/engines/velvet-ruse.js";
import { yahtzeeBotAction } from "./games/engines/yahtzee.js";
import { fourTwentyOneBotAction, paidRerollPrice421 } from "./games/engines/four-twenty-one.js";
import { culDeChouetteBotAction } from "./games/engines/cul-de-chouette.js";
import { farkleBotAction } from "./games/engines/farkle.js";
import { liarsDiceBotAction } from "./games/engines/liars-dice.js";
import { shutTheBoxBotAction } from "./games/engines/shut-the-box.js";
import { presidentBotAction } from "./games/engines/president.js";
import { beloteBotAction, beloteTeam, publicBeloteState, replaceBelotePlayer } from "./games/engines/belote.js";
import { beloteSeats, chooseBeloteTeam } from "./games/belote-seats.js";
import { spectatorState } from "./games/spectator-state.js";
import { texasHoldemBotAction } from "./games/engines/texas-holdem.js";
import { battleBotAction } from "./games/engines/bataille.js";
import { normalizeCosmeticCss, normalizeCosmeticDesign, normalizeCosmeticMotion } from "./services/cosmetic-validation.js";
import { friendRoomPresence } from "./services/friend-presence.js";
import { buildLeaderboard } from "./services/leaderboards.js";
import {
  appendEventPotEntry,
  calculateCommunityEventRewards,
  defaultCommunityEvent,
  eventActionAvailability,
  eventActionPeriodKey,
  quoteCommunityEventActions,
  eventLeaderboard,
  eventProgress,
  joinCommunityEvent,
  normalizeCommunityEvent,
  performCommunityEventAction,
  potentialCommunityEventReward,
  purchaseCommunityEventActions,
  validateCommunityEvent
} from "./services/community-events.js";
import { databaseHealth, readDb, setCatalogSource, updateDb, writeDb } from "./db.js";
import { archiveDays, archiveRows } from "./storage/archives.js";
import { ledgerPage } from "./storage/ledger.js";
import { playerStatistics } from "./services/player-statistics.js";
import { completedMidnightContractCount, gameResultAchievementIds } from "./services/result-achievements.js";
import {
  achievementRuleSchemas,
  consumeAchievementEvent,
  normalizeAchievementDefinition
} from "./services/achievement-rules.js";
import { casinoDateKey, casinoTimeParts, shiftDateKey } from "./services/time.js";
import { calculateDailyBonusStatus, defaultDailyBonusRules, normalizeDailyBonusConfig } from "./services/daily-bonus.js";
import { createRequestLogStore, requestLogMiddleware } from "./services/request-logs.js";
import {
  consumeEmailVerification,
  consumePasswordReset,
  emailDeliveryConfigured,
  emailVerificationCanBeResent,
  issueEmailVerification,
  issuePasswordReset,
  normalizeEmail,
  passwordResetCanBeResent,
  reservedPublicEmail,
  sendEmailVerification,
  sendPasswordReset,
  validEmail,
  verifyEmailDelivery
} from "./services/email-verification.js";
import { createStatusMonitor } from "./services/status-monitor.js";
import { createPatchnoteStore } from "./services/patchnotes.js";
import { createTribunalStore, tribunalCategories } from "./services/tribunal.js";
import { createChatStore, directChannelId } from "./services/chat.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_VERSION = process.env.APP_VERSION || JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version || "0.1.0";
const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = process.env.NODE_ENV || "development";
const JWT_SECRET = process.env.JWT_SECRET || (NODE_ENV === "production" ? "" : "dev-secret-change-me");
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const allowedOrigins = CLIENT_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
const CLIENT_DIST = process.env.CLIENT_DIST ? path.resolve(process.cwd(), process.env.CLIENT_DIST) : "";
const APP_BASE_PATH = normalizeBasePath(process.env.APP_BASE_PATH || "");
const HTTPS_KEY_PATH = process.env.HTTPS_KEY_PATH ? path.resolve(process.cwd(), process.env.HTTPS_KEY_PATH) : "";
const HTTPS_CERT_PATH = process.env.HTTPS_CERT_PATH ? path.resolve(process.cwd(), process.env.HTTPS_CERT_PATH) : "";
const HTTPS_PFX_PATH = process.env.HTTPS_PFX_PATH ? path.resolve(process.cwd(), process.env.HTTPS_PFX_PATH) : "";
const HTTPS_PFX_PASSPHRASE = process.env.HTTPS_PFX_PASSPHRASE || "";
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 300);
const AUTH_RATE_LIMIT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX || 20);
const TRUST_PROXY = String(process.env.TRUST_PROXY ?? "").trim();
const PARENTAL_DB_PATH = process.env.PARENTAL_DB_PATH ? path.resolve(process.cwd(), process.env.PARENTAL_DB_PATH) : path.join(__dirname, "..", "data", "parental.sqlite");
const TRIBUNAL_DB_PATH = process.env.TRIBUNAL_DB_PATH ? path.resolve(process.cwd(), process.env.TRIBUNAL_DB_PATH) : path.join(__dirname, "..", "data", "tribunal.sqlite");
const CHAT_DB_PATH = process.env.CHAT_DB_PATH ? path.resolve(process.cwd(), process.env.CHAT_DB_PATH) : path.join(__dirname, "..", "data", "chat.sqlite");
const DEFAULT_TOKENS = 1000;
const DAILY_TOKENS = 250;
const MIN_ROOM_STAKE = 10;
const MIN_POKER_BUY_IN = 1000;
const defaultPlatformSettings = Object.freeze({
  siteName: "KTGA.ME",
  siteIcon: "landmark",
  siteSubtitle: "Casino privé multijoueur, jetons, dés et cartes.",
  registrationsEnabled: true,
  guestAccessEnabled: true,
  emailVerificationRequired: false,
  minorRestrictions: defaultMinorRestrictions,
  signupTokens: DEFAULT_TOKENS,
  dailyTokens: DAILY_TOKENS,
  dailyBonusDefaultMultiplier: 1,
  dailyBonusMaxMultiplier: 100,
  dailyBonusRules: defaultDailyBonusRules,
  minRoomStake: MIN_ROOM_STAKE,
  botThinkingSeconds: 1,
  turnEndDelaySeconds: 5,
  roundResultsSeconds: 30,
  minPokerBuyIn: MIN_POKER_BUY_IN,
  pokerDefaultBigBlind: 20,
  pokerTurnSeconds: 300
});
const ROOM_PAYOUT_RATES = [0.6, 0.3, 0.1];
const DEFAULT_BOT_THINKING_MS = 1000;
const DEFAULT_TURN_END_DELAY_MS = 5000;
const DEFAULT_ROUND_RESULTS_MS = 30000;
const achievementThresholds = {
  gamesPlayed: [1, 5, 50, 200, 1000, 5000, 10000],
  wins: [1, 10, 100, 500, 1000, 5000, 10000],
  staked: [100, 1000, 2000, 5000, 15000, 50000, 100000, 1000000, 10000000],
  dailyClaims: [1, 7, 50, 100, 500],
  dailyStreak: [7, 30, 365],
  gameWins: [1, 10, 50, 100, 500, 1000]
};
const defaultCosmetics = {
  icons: ["chip"],
  nameEffects: ["none"],
  memberCards: ["default"],
  profileBanners: ["default"],
  profileFrames: ["none"],
  profileEffects: ["none"],
  diceSkins: ["default"],
  cardSkins: ["default"],
  equipped: { icon: "chip", nameEffect: "none", memberCard: "default", profileBanner: "default", profileFrame: "none", profileEffect: "none", diceSkin: "default", cardSkin: "default" }
};

const parentalControls = createParentalControlStore({ filename: PARENTAL_DB_PATH, secret: JWT_SECRET });
const tribunal = createTribunalStore({ filename: TRIBUNAL_DB_PATH });
process.on("exit", () => tribunal.close());
const chat = createChatStore({ filename: CHAT_DB_PATH });
process.on("exit", () => chat.close());

const defaultGameDescriptions = {
  yahtzee: "Marquer le plus de points après 13 catégories.",
  "421": "Faire la meilleure combinaison avec trois dés.",
  "cul-de-chouette": "Atteindre 343 points avant les autres.",
  blackjack: "Battre le croupier sans dépasser 21.",
  "texas-holdem": "Former la meilleure main de cinq cartes avec tes deux cartes privées et les cinq cartes communes.",
  bataille: "Piocher, choisir secrètement une pile et capturer les cartes adverses lors des confrontations.",
  president: "Se débarrasser de toutes ses cartes en premier.",
  belote: "Quatre joueurs, deux équipes : prendre l'atout et remporter les plis.",
  farkle: "Marquer 10 000 points en prenant des risques avec six dés.",
  "liars-dice": "Bluffer sur les dés cachés et survivre le plus longtemps.",
  "shut-the-box": "Fermer les tuiles 1 à 9 et finir avec le score le plus bas.",
  "midnight-dice": "Drafter les dés d'un marché commun et masquer son mandat pour déjouer la table.",
  "velvet-ruse": "Piocher, défausser et glisser des cartes sous de fausses déclarations dans un dossier sous surveillance.",
  "golf-solitaire": "Vider le tableau en jouant des cartes à +1 ou -1.",
  accordion: "Compresser 52 cartes en une seule pile."
};

const classicColors = [
  ["slate", "Ardoise", 1200],
  ["crimson", "Carmin", 1300],
  ["amber", "Ambre", 1400],
  ["emerald", "Émeraude", 1500],
  ["sapphire", "Saphir", 1600],
  ["violet", "Violet", 1700],
  ["rose", "Rose", 1800],
  ["teal", "Teal", 1900],
  ["orange", "Orange", 2000],
  ["lime", "Lime", 2100],
  ["cyan", "Cyan", 2200],
  ["indigo", "Indigo", 2300],
  ["graphite", "Graphite mat", 2400],
  ["pearl", "Perle", 2500],
  ["coral", "Corail", 2600],
  ["mint", "Menthe", 2700],
  ["steel", "Acier brossé", 2800],
  ["olive", "Olive", 2900],
  ["plum", "Prune", 3000],
  ["mocha", "Mocha", 3100]
];

const shopCatalog = [
  { id: "icon-classic-chip-red", type: "icons", category: "classic", name: "Jeton rouge", description: "Icône simple pour commencer.", price: 900, value: "classic-chip-red" },
  { id: "icon-classic-chip-blue", type: "icons", category: "classic", name: "Jeton bleu", description: "Icône sobre et lisible.", price: 1000, value: "classic-chip-blue" },
  { id: "icon-classic-chip-green", type: "icons", category: "classic", name: "Jeton vert", description: "Icône de table classique.", price: 1100, value: "classic-chip-green" },
  { id: "icon-classic-die", type: "icons", category: "classic", name: "Dé simple", description: "Icône discrète orientée dés.", price: 1200, value: "classic-die" },
  { id: "icon-classic-card", type: "icons", category: "classic", name: "Carte simple", description: "Icône discrète orientée cartes.", price: 1300, value: "classic-card" },
  { id: "icon-classic-star", type: "icons", category: "classic", name: "Étoile simple", description: "Icône claire sans effet premium.", price: 1400, value: "classic-star" },
  { id: "icon-classic-heart", type: "icons", category: "classic", name: "Coeur simple", description: "Icône sociale sobre.", price: 1500, value: "classic-heart" },
  { id: "icon-classic-club", type: "icons", category: "classic", name: "Trèfle simple", description: "Icône casino classique.", price: 1600, value: "classic-club" },
  { id: "icon-classic-spade", type: "icons", category: "classic", name: "Pique simple", description: "Icône casino nette.", price: 1700, value: "classic-spade" },
  { id: "icon-classic-medal", type: "icons", category: "classic", name: "Médaille simple", description: "Icône de progression sobre.", price: 1800, value: "classic-medal" },
  { id: "icon-classic-crown", type: "icons", category: "classic", name: "Couronne simple", description: "Icône royale en version accessible.", price: 1900, value: "classic-crown" },
  { id: "icon-classic-shield", type: "icons", category: "classic", name: "Bouclier simple", description: "Icône défensive sans effet premium.", price: 2000, value: "classic-shield" },
  { id: "icon-classic-flame", type: "icons", category: "classic", name: "Flamme simple", description: "Icône chaude mais sobre.", price: 2100, value: "classic-flame" },
  { id: "icon-classic-bolt", type: "icons", category: "classic", name: "Éclair simple", description: "Icône rapide en finition classique.", price: 2200, value: "classic-lightning" },
  { id: "icon-classic-gem", type: "icons", category: "classic", name: "Gemme simple", description: "Icône claire pour profil collectionneur.", price: 2300, value: "classic-diamond" },
  { id: "icon-classic-duel", type: "icons", category: "classic", name: "Duel simple", description: "Icône compétitive en version discrète.", price: 2400, value: "classic-swords" },
  { id: "icon-classic-rocket", type: "icons", category: "classic", name: "Rocket simple", description: "Icône de progression sans halo.", price: 2500, value: "classic-rocket" },
  { id: "icon-classic-badge", type: "icons", category: "classic", name: "Badge simple", description: "Badge de table en finition classique.", price: 2600, value: "classic-badge" },
  { id: "icon-classic-casino", type: "icons", category: "classic", name: "Casino simple", description: "Icône KTGA.ME sobre.", price: 2700, value: "classic-casino" },
  { id: "icon-classic-spark", type: "icons", category: "classic", name: "Étincelle simple", description: "Icône légère pour profils récents.", price: 2800, value: "classic-spark" },
  { id: "icon-classic-orbit", type: "icons", category: "classic", name: "Orbite simple", description: "Anneau discret sans animation.", price: 2900, value: "classic-orbit" },
  { id: "icon-classic-crest", type: "icons", category: "classic", name: "Blason simple", description: "Emblème sobre de table.", price: 3000, value: "classic-crest" },
  { id: "icon-classic-ticket", type: "icons", category: "classic", name: "Ticket simple", description: "Icône d'entrée de table classique.", price: 3100, value: "classic-ticket" },
  { id: "icon-classic-award", type: "icons", category: "classic", name: "Récompense simple", description: "Icône de réussite sobre.", price: 3200, value: "classic-award" },
  { id: "icon-classic-highroller", type: "icons", category: "classic", name: "High roller simple", description: "Icône casino discrète.", price: 3300, value: "classic-highroller" },
  { id: "icon-classic-lucky", type: "icons", category: "classic", name: "Chance simple", description: "Icône de chance sans halo.", price: 3400, value: "classic-lucky" },
  { id: "icon-classic-table", type: "icons", category: "classic", name: "Table simple", description: "Icône de salon sobre.", price: 3500, value: "classic-table" },
  { id: "icon-classic-vault", type: "icons", category: "classic", name: "Coffre simple", description: "Icône de réserve classique.", price: 3600, value: "classic-vault" },
  { id: "icon-classic-marker", type: "icons", category: "classic", name: "Marqueur simple", description: "Icône de profil nette.", price: 3700, value: "classic-marker" },
  { id: "icon-classic-token-stack", type: "icons", category: "classic", name: "Pile simple", description: "Icône de jetons discrète.", price: 3800, value: "classic-token-stack" },
  { id: "icon-dice", type: "icons", category: "premium", name: "Dés dorés", description: "Icône de joueur orientée jeux de dés.", price: 2000, value: "dice" },
  { id: "icon-cards", type: "icons", category: "premium", name: "As de pique", description: "Icône de joueur orientée jeux de cartes.", price: 2400, value: "cards" },
  { id: "icon-star", type: "icons", category: "premium", name: "Étoile", description: "Icône claire pour les joueurs réguliers.", price: 2800, value: "star" },
  { id: "icon-flame", type: "icons", category: "premium", name: "Flamme", description: "Icône agressive pour les séries chaudes.", price: 3200, value: "flame" },
  { id: "icon-crown", type: "icons", category: "premium", name: "Couronne", description: "Icône royale à côté du pseudo.", price: 3500, value: "crown" },
  { id: "icon-lightning", type: "icons", category: "premium", name: "Éclair", description: "Icône vive pour les joueurs rapides.", price: 4000, value: "lightning" },
  { id: "icon-shield", type: "icons", category: "premium", name: "Bouclier", description: "Icône solide pour les profils défensifs.", price: 4500, value: "shield" },
  { id: "icon-rocket", type: "icons", category: "premium", name: "Rocket", description: "Icône de montée fulgurante.", price: 5200, value: "rocket" },
  { id: "icon-swords", type: "icons", category: "premium", name: "Duel", description: "Icône pour les tables compétitives.", price: 5800, value: "swords" },
  { id: "icon-heart", type: "icons", category: "premium", name: "Coeur", description: "Icône de table sociale.", price: 6200, value: "heart" },
  { id: "icon-club", type: "icons", category: "premium", name: "Trèfle", description: "Icône casino classique.", price: 6800, value: "club" },
  { id: "icon-spade", type: "icons", category: "premium", name: "Pique", description: "Icône casino premium.", price: 7400, value: "spade" },
  { id: "icon-diamond", type: "icons", category: "premium", name: "Diamant", description: "Icône rare à forte présence.", price: 8500, value: "diamond" },
  { id: "icon-medal", type: "icons", category: "premium", name: "Médaille", description: "Icône de joueur titré.", price: 9500, value: "medal" },
  { id: "icon-badge", type: "icons", category: "premium", name: "Badge VIP", description: "Icône réservée aux profils installés.", price: 12000, value: "badge" },
  { id: "icon-casino", type: "icons", category: "premium", name: "Casino", description: "Icône signature KTGA.ME.", price: 16000, value: "casino" },
  { id: "icon-orbit", type: "icons", category: "premiumShape", name: "Orbite", description: "Icône premium à anneau lumineux.", price: 24000, value: "orbit", packs: ["neon"] },
  { id: "icon-crest", type: "icons", category: "premiumShape", name: "Blason", description: "Icône premium façon emblème de table.", price: 32000, value: "crest" },
  { id: "icon-cat", type: "icons", category: "premium", name: "Chat", description: "Icône animale premium élégante.", price: 18000, value: "cat" },
  { id: "icon-dog", type: "icons", category: "premium", name: "Chien", description: "Icône animale premium loyale.", price: 18000, value: "dog" },
  { id: "icon-bird", type: "icons", category: "premium", name: "Oiseau", description: "Icône animale premium rapide.", price: 18000, value: "bird" },
  { id: "icon-fish", type: "icons", category: "premium", name: "Poisson", description: "Icône animale premium fluide.", price: 18000, value: "fish" },
  { id: "icon-rabbit", type: "icons", category: "premium", name: "Lapin", description: "Icône animale premium agile.", price: 18000, value: "rabbit" },
  { id: "icon-turtle", type: "icons", category: "premium", name: "Tortue", description: "Icône animale premium patiente.", price: 18000, value: "turtle" },
  { id: "icon-squirrel", type: "icons", category: "premium", name: "Écureuil", description: "Icône animale premium vive.", price: 18000, value: "squirrel" },
  { id: "icon-snail", type: "icons", category: "premium", name: "Escargot", description: "Icône animale premium inattendue.", price: 18000, value: "snail" },
  { id: "icon-fox-fire", type: "icons", category: "premiumAnimated", name: "Renard de feu", description: "Tête de renard animée par une lueur de braise.", price: 85000, value: "fox-fire" },
  { id: "icon-phoenix-chip", type: "icons", category: "premiumAnimated", name: "Jeton phoenix", description: "Icône premium animée en halo chaud.", price: 95000, value: "phoenix-chip" },
  { id: "dice-classic-ivory", type: "diceSkins", category: "classic", name: "Dés ivoire", description: "Dés clairs très lisibles, style classique.", price: 1200, value: "classic-ivory" },
  { id: "dice-classic-charcoal", type: "diceSkins", category: "classic", name: "Dés charbon", description: "Dés sombres avec points clairs.", price: 1400, value: "classic-charcoal" },
  { id: "dice-classic-crimson", type: "diceSkins", category: "classic", name: "Dés carmin", description: "Rouge discret, contraste conservé.", price: 1600, value: "classic-crimson" },
  { id: "dice-classic-emerald", type: "diceSkins", category: "classic", name: "Dés émeraude", description: "Vert feutre sobre pour les tables casino.", price: 1800, value: "classic-emerald" },
  { id: "dice-classic-sapphire", type: "diceSkins", category: "classic", name: "Dés saphir", description: "Bleu profond, points lisibles.", price: 2000, value: "classic-sapphire" },
  { id: "dice-classic-amber", type: "diceSkins", category: "classic", name: "Dés ambre", description: "Jaune chaud avec points noirs nets.", price: 2200, value: "classic-amber" },
  { id: "dice-classic-teal", type: "diceSkins", category: "classic", name: "Dés teal", description: "Bleu vert sobre, lisible sur feutre.", price: 2400, value: "classic-teal" },
  { id: "dice-classic-violet", type: "diceSkins", category: "classic", name: "Dés violet", description: "Violet bas contraste avec points clairs.", price: 2600, value: "classic-violet" },
  { id: "dice-classic-pearl", type: "diceSkins", category: "classic", name: "Dés perle", description: "Ivoire nacré, lecture immédiate.", price: 2800, value: "classic-pearl" },
  { id: "dice-classic-copper", type: "diceSkins", category: "classic", name: "Dés cuivre", description: "Cuivre doux sans reflet agressif.", price: 3000, value: "classic-copper" },
  { id: "dice-classic-rose", type: "diceSkins", category: "classic", name: "Dés rose", description: "Rose atténué avec points nets.", price: 3200, value: "classic-rose" },
  { id: "dice-classic-navy", type: "diceSkins", category: "classic", name: "Dés navy", description: "Bleu nuit classique.", price: 3400, value: "classic-navy" },
  { id: "dice-classic-graphite", type: "diceSkins", category: "classic", name: "Dés graphite", description: "Gris sombre simple et lisible.", price: 3600, value: "classic-graphite" },
  { id: "dice-classic-mint", type: "diceSkins", category: "classic", name: "Dés menthe", description: "Vert doux à faible contraste.", price: 3800, value: "classic-mint" },
  { id: "dice-premium-gold", type: "diceSkins", category: "premium", name: "Dés or", description: "Finition or avec points noirs nets.", price: 9000, value: "premium-gold" },
  { id: "dice-premium-ruby", type: "diceSkins", category: "premium", name: "Dés rubis", description: "Finition rouge glossy, très casino.", price: 14000, value: "premium-ruby" },
  { id: "dice-premium-obsidian", type: "diceSkins", category: "premium", name: "Dés obsidienne", description: "Noir premium avec points dorés.", price: 22000, value: "premium-obsidian" },
  { id: "dice-premium-diamond", type: "diceSkins", category: "premium", name: "Dés diamant", description: "Finition claire glacée, contraste renforcé.", price: 42000, value: "premium-diamond" },
  { id: "dice-premium-casino", type: "diceSkins", category: "premium", name: "Dés casino", description: "Rouge et or façon table high roller.", price: 56000, value: "premium-casino" },
  { id: "dice-premium-neon", type: "diceSkins", category: "premium", name: "Dés néon", description: "Noir lumineux avec points cyan.", price: 68000, value: "premium-neon", packs: ["neon"] },
  { id: "dice-premium-royal", type: "diceSkins", category: "premium", name: "Dés royal", description: "Violet profond, points dorés.", price: 82000, value: "premium-royal" },
  { id: "dice-premium-ice", type: "diceSkins", category: "premium", name: "Dés ice", description: "Bleu glacé premium, points marine.", price: 96000, value: "premium-ice" },
  { id: "dice-premium-meteor", type: "diceSkins", category: "premium", name: "Dés météore", description: "Noir chaud avec cœur orange lisible.", price: 120000, value: "premium-meteor" },
  { id: "dice-premium-beveled", type: "diceSkins", category: "premiumShape", name: "Dés biseautés", description: "Forme premium à angles asymétriques sans perdre la lecture.", price: 145000, value: "premium-beveled" },
  { id: "dice-premium-cutcorner", type: "diceSkins", category: "premiumShape", name: "Dés coupe casino", description: "Silhouette fantaisie avec coin marqué et points très lisibles.", price: 165000, value: "premium-cutcorner" },
  { id: "dice-premium-emberflow", type: "diceSkins", category: "premiumAnimated", name: "Dés emberflow", description: "Dés premium animés avec reflets de braise.", price: 210000, value: "premium-emberflow" },
  { id: "dice-premium-aurora", type: "diceSkins", category: "premiumAnimated", name: "Dés aurora", description: "Dés premium animés aux reflets froids.", price: 240000, value: "premium-aurora" },
  { id: "card-classic-red", type: "cardSkins", category: "classic", name: "Dos rouge", description: "Dos de carte rouge sobre et lisible.", price: 1200, value: "classic-red" },
  { id: "card-classic-blue", type: "cardSkins", category: "classic", name: "Dos bleu", description: "Dos de carte bleu classique.", price: 1400, value: "classic-blue" },
  { id: "card-classic-green", type: "cardSkins", category: "classic", name: "Dos vert", description: "Dos de carte vert casino.", price: 1600, value: "classic-green" },
  { id: "card-classic-black", type: "cardSkins", category: "classic", name: "Dos noir", description: "Dos sombre, symboles clairs.", price: 1800, value: "classic-black" },
  { id: "card-classic-cream", type: "cardSkins", category: "classic", name: "Face crème", description: "Face légèrement crème, indices très lisibles.", price: 2000, value: "classic-cream" },
  { id: "card-classic-burgundy", type: "cardSkins", category: "classic", name: "Dos bordeaux", description: "Dos bordeaux discret, face standard.", price: 2200, value: "classic-burgundy" },
  { id: "card-classic-forest", type: "cardSkins", category: "classic", name: "Dos forêt", description: "Dos vert sombre, face standard.", price: 2400, value: "classic-forest" },
  { id: "card-classic-navy", type: "cardSkins", category: "classic", name: "Dos navy", description: "Dos bleu nuit, face standard.", price: 2600, value: "classic-navy" },
  { id: "card-classic-charcoal", type: "cardSkins", category: "classic", name: "Dos charbon", description: "Dos gris noir, contraste maîtrisé.", price: 2800, value: "classic-charcoal" },
  { id: "card-classic-ivory", type: "cardSkins", category: "classic", name: "Face ivoire", description: "Face ivoire chaude, indices classiques.", price: 3000, value: "classic-ivory" },
  { id: "card-classic-slate", type: "cardSkins", category: "classic", name: "Dos ardoise", description: "Dos gris bleu en finition classique.", price: 3200, value: "classic-slate" },
  { id: "card-classic-copper", type: "cardSkins", category: "classic", name: "Dos cuivre", description: "Dos cuivre doux avec face standard.", price: 3400, value: "classic-copper" },
  { id: "card-classic-mint", type: "cardSkins", category: "classic", name: "Dos menthe", description: "Dos vert pâle maîtrisé.", price: 3600, value: "classic-mint" },
  { id: "card-classic-violet", type: "cardSkins", category: "classic", name: "Dos violet", description: "Dos violet bas contraste.", price: 3800, value: "classic-violet" },
  { id: "card-premium-gold", type: "cardSkins", category: "premium", name: "Cartes or", description: "Dos doré premium avec face sobre.", price: 10000, value: "premium-gold" },
  { id: "card-premium-ruby", type: "cardSkins", category: "premium", name: "Cartes rubis", description: "Dos rouge profond et bordure raffinée.", price: 16000, value: "premium-ruby" },
  { id: "card-premium-emerald", type: "cardSkins", category: "premium", name: "Cartes émeraude", description: "Dos vert lumineux, face lisible.", price: 26000, value: "premium-emerald" },
  { id: "card-premium-diamond", type: "cardSkins", category: "premium", name: "Cartes diamant", description: "Dos glacé et bordure claire premium.", price: 52000, value: "premium-diamond" },
  { id: "card-premium-obsidian", type: "cardSkins", category: "premium", name: "Cartes obsidienne", description: "Face sombre premium avec indices lumineux.", price: 68000, value: "premium-obsidian" },
  { id: "card-premium-royal", type: "cardSkins", category: "premium", name: "Cartes royal", description: "Face ivoire, bordure violet et or.", price: 82000, value: "premium-royal" },
  { id: "card-premium-neon", type: "cardSkins", category: "premium", name: "Cartes néon", description: "Face noire lisible avec accents cyan.", price: 96000, value: "premium-neon", packs: ["neon"] },
  { id: "card-premium-casino", type: "cardSkins", category: "premium", name: "Cartes casino", description: "Face crème, dos rouge et détails dorés.", price: 115000, value: "premium-casino" },
  { id: "card-premium-celestial", type: "cardSkins", category: "premium", name: "Cartes célestes", description: "Face nuit douce avec indices très contrastés.", price: 140000, value: "premium-celestial" },
  { id: "card-premium-notched", type: "cardSkins", category: "premiumShape", name: "Cartes notch", description: "Carte premium à coins sculptés, face contrastée.", price: 170000, value: "premium-notched" },
  { id: "card-premium-frame", type: "cardSkins", category: "premiumShape", name: "Cartes cadre or", description: "Face premium encadrée avec dos signature.", price: 195000, value: "premium-frame" },
  { id: "card-premium-starlight", type: "cardSkins", category: "premiumAnimated", name: "Cartes starlight", description: "Cartes premium animées avec face lumineuse lisible.", price: 230000, value: "premium-starlight" },
  { id: "card-premium-inferno", type: "cardSkins", category: "premiumAnimated", name: "Cartes inferno", description: "Cartes premium animées avec dos incandescent.", price: 260000, value: "premium-inferno" },
  ...classicColors.map(([value, name, price]) => ({ id: `name-classic-${value}`, type: "nameEffects", category: "classic", name: `Pseudo ${name}`, description: `Couleur classique ${name.toLowerCase()}, accessible en début de progression.`, price, value: `classic-${value}` })),
  { id: "name-gold", type: "nameEffects", category: "premium", name: "Pseudo doré", description: "Effet or discret sur le pseudo.", price: 5000, value: "gold" },
  { id: "name-ruby", type: "nameEffects", category: "premium", name: "Pseudo rubis", description: "Effet rouge casino sur le pseudo.", price: 7500, value: "ruby" },
  { id: "name-neon", type: "nameEffects", category: "premium", name: "Pseudo néon", description: "Lueur premium pour les hauts enjeux.", price: 11000, value: "neon", packs: ["neon"] },
  { id: "name-emerald", type: "nameEffects", category: "premium", name: "Pseudo émeraude", description: "Lueur verte inspirée des tables de jeu.", price: 13500, value: "emerald" },
  { id: "name-shiny", type: "nameEffects", category: "premium", name: "Pseudo shiny", description: "Reflet animé qui traverse le pseudo.", price: 16000, value: "shiny" },
  { id: "name-fire", type: "nameEffects", category: "premium", name: "Pseudo flamme", description: "Dégradé chaud pour les séries gagnantes.", price: 19000, value: "fire" },
  { id: "name-ice", type: "nameEffects", category: "premium", name: "Pseudo ice", description: "Effet froid et lumineux.", price: 22000, value: "ice" },
  { id: "name-shadow", type: "nameEffects", category: "premium", name: "Pseudo shadow", description: "Relief sombre renforcé avec contour net.", price: 26000, value: "shadow" },
  { id: "name-pulse", type: "nameEffects", category: "premium", name: "Pseudo pulse", description: "Halo animé très visible autour du pseudo.", price: 30000, value: "pulse" },
  { id: "name-royal", type: "nameEffects", category: "premium", name: "Pseudo royal", description: "Signature violet et or très premium.", price: 36000, value: "royal" },
  { id: "name-chrome", type: "nameEffects", category: "premium", name: "Pseudo chrome", description: "Aspect métallique animé.", price: 44000, value: "chrome" },
  { id: "name-jackpot", type: "nameEffects", category: "premium", name: "Pseudo jackpot", description: "Effet doré hautement visible.", price: 58000, value: "jackpot" },
  { id: "name-glitch", type: "nameEffects", category: "premium", name: "Pseudo glitch", description: "Décalage visuel animé pour profil spectaculaire.", price: 70000, value: "glitch" },
  { id: "name-diamond", type: "nameEffects", category: "premium", name: "Pseudo diamant", description: "Reflets bleu clair et blancs pour profils élite.", price: 90000, value: "diamond" },
  { id: "name-cosmic", type: "nameEffects", category: "premium", name: "Pseudo cosmic", description: "Dégradé spatial animé pour les très hauts rangs.", price: 120000, value: "cosmic" },
  { id: "name-prism", type: "nameEffects", category: "premium", name: "Pseudo prisme", description: "Reflets multicolores animés avec contour net.", price: 145000, value: "prism" },
  { id: "name-holo", type: "nameEffects", category: "premium", name: "Pseudo holo", description: "Effet holographique premium très visible.", price: 175000, value: "holo" },
  { id: "name-emberwave", type: "nameEffects", category: "premiumAnimated", name: "Pseudo emberwave", description: "Animation chaude haut de gamme.", price: 210000, value: "emberwave" },
  { id: "name-voidpulse", type: "nameEffects", category: "premiumAnimated", name: "Pseudo void pulse", description: "Pulse sombre animé avec contour lumineux.", price: 240000, value: "voidpulse" },
  ...classicColors.map(([value, name, price]) => ({ id: `member-classic-${value}`, type: "memberCards", category: "classic", name: `Carte ${name}`, description: `Member card classique ${name.toLowerCase()}, sobre et accessible.`, price: price + 800, value: `classic-${value}` })),
  { id: "card-bronze", type: "memberCards", category: "premium", name: "Carte Bronze", description: "Première carte premium, accessible après plusieurs sessions gagnantes.", price: 4000, value: "bronze" },
  { id: "card-silver", type: "memberCards", category: "premium", name: "Carte Argent", description: "Carte de joueur régulier avec finition métallique.", price: 9000, value: "silver" },
  { id: "card-emerald", type: "memberCards", category: "premium", name: "Carte Émeraude", description: "Carte rare pour joueurs installés.", price: 18000, value: "emerald" },
  { id: "card-platinum", type: "memberCards", category: "premium", name: "Carte Platine", description: "Carte haut rang pour gros volumes de jeu.", price: 36000, value: "platinum" },
  { id: "card-diamond", type: "memberCards", category: "premium", name: "Carte Diamant", description: "Carte élite réservée aux très gros gagnants.", price: 72000, value: "diamond" },
  { id: "card-master", type: "memberCards", category: "premium", name: "Carte Master", description: "Statut ultime du casino KTGA.ME.", price: 150000, value: "master" },
  { id: "card-onyx-frame", type: "memberCards", category: "premiumShape", name: "Carte Onyx Frame", description: "Carte premium à angles sculptés et cadre sombre.", price: 210000, value: "onyx-frame" },
  { id: "card-aurora-frame", type: "memberCards", category: "premiumShape", name: "Carte Aurora Frame", description: "Carte premium à silhouette biseautée et reflets froids.", price: 280000, value: "aurora-frame" },
  { id: "card-ember-animated", type: "memberCards", category: "premiumAnimated", name: "Carte Ember Motion", description: "Member card premium animée avec reflets de feu.", price: 360000, value: "ember-animated" },
  { id: "card-nebula-animated", type: "memberCards", category: "premiumAnimated", name: "Carte Nebula Motion", description: "Member card premium animée avec halo cosmique.", price: 420000, value: "nebula-animated", packs: ["neon"] },
  { id: "profile-banner-classic-felt", type: "profileBanners", category: "classic", name: "Feutre anglais", description: "Feutre vert profond et lignes de table discrètes.", price: 3200, value: "classic-felt" },
  { id: "profile-banner-classic-midnight", type: "profileBanners", category: "classic", name: "Minuit", description: "Bleu nuit sobre relevé par une lumière froide.", price: 4400, value: "classic-midnight" },
  { id: "profile-banner-classic-ivory", type: "profileBanners", category: "classic", name: "Ivoire", description: "Un décor clair, chaleureux et très lisible.", price: 5600, value: "classic-ivory" },
  { id: "profile-banner-velvet", type: "profileBanners", category: "premium", name: "Velours impérial", description: "Un drapé rouge profond sur toute la présentation publique.", price: 12000, value: "velvet" },
  { id: "profile-banner-royal", type: "profileBanners", category: "premium", name: "Salon royal", description: "Une scène violette et or inspirée des salons privés.", price: 32000, value: "royal" },
  { id: "profile-banner-art-deco", type: "profileBanners", category: "premium", name: "Art déco", description: "Des éventails géométriques noir et champagne.", price: 48000, value: "art-deco" },
  { id: "profile-banner-aurora", type: "profileBanners", category: "premiumAnimated", name: "Aurore boréale", description: "Des reflets froids circulent lentement sur le profil.", price: 95000, value: "aurora", packs: ["neon"] },
  { id: "profile-banner-ember-flow", type: "profileBanners", category: "premiumAnimated", name: "Rivière de braises", description: "Une lumière de braise traverse le feutre sombre.", price: 125000, value: "ember-flow" },
  { id: "profile-banner-roulette-lights", type: "profileBanners", category: "premiumAnimated", name: "Nuits de roulette", description: "Des halos rouge, vert et or tournent autour de la table.", price: 155000, value: "roulette-lights" },
  { id: "profile-frame-classic-brass", type: "profileFrames", category: "classic", name: "Liseré laiton", description: "Une bordure chaude et discrète façon plaque de casino.", price: 3600, value: "classic-brass" },
  { id: "profile-frame-classic-silver", type: "profileFrames", category: "classic", name: "Liseré argent", description: "Un cadre argent brossé simple et net.", price: 4800, value: "classic-silver" },
  { id: "profile-frame-classic-crimson", type: "profileFrames", category: "classic", name: "Liseré carmin", description: "Une double bordure rouge sombre à l’allure de table privée.", price: 6200, value: "classic-crimson" },
  { id: "profile-frame-gold", type: "profileFrames", category: "premium", name: "Or haute mise", description: "Un double liseré doré encadre toute la présentation publique.", price: 18000, value: "gold" },
  { id: "profile-frame-obsidian", type: "profileFrames", category: "premium", name: "Obsidienne taillée", description: "Une bordure sombre sculptée aux angles casino.", price: 52000, value: "obsidian" },
  { id: "profile-frame-diamond-cut", type: "profileFrames", category: "premium", name: "Diamant facetté", description: "Un cadre clair aux reflets de pierre taillée.", price: 76000, value: "diamond-cut" },
  { id: "profile-frame-neon", type: "profileFrames", category: "premiumAnimated", name: "Néon cyan", description: "Une lueur cyan respire autour du profil.", price: 78000, value: "neon", packs: ["neon"] },
  { id: "profile-frame-ember", type: "profileFrames", category: "premiumAnimated", name: "Braise vive", description: "Le cadre rougeoie comme une braise entretenue.", price: 118000, value: "ember" },
  { id: "profile-frame-prismatic", type: "profileFrames", category: "premiumAnimated", name: "Prisme royal", description: "Une bordure irisée change subtilement de couleur.", price: 165000, value: "prismatic" },
  { id: "profile-frame-browser-firefox", type: "profileFrames", category: "premiumAnimated", name: "Cadre Firefox", description: "Récompense exclusive du succès secret Firefox.", price: 0, value: "browser-firefox", rewardOnly: true, achievementId: "secret-firefox" },
  { id: "profile-frame-browser-edge", type: "profileFrames", category: "premiumAnimated", name: "Cadre Edge", description: "Récompense exclusive du succès secret Edge.", price: 0, value: "browser-edge", rewardOnly: true, achievementId: "secret-edge" },
  { id: "profile-frame-browser-chrome", type: "profileFrames", category: "premiumAnimated", name: "Cadre Chrome", description: "Récompense exclusive du succès secret Chrome.", price: 0, value: "browser-chrome", rewardOnly: true, achievementId: "secret-chrome" },
  { id: "profile-effect-classic-glow", type: "profileEffects", category: "classic", name: "Halo tamisé", description: "Une lumière douce donne du relief au profil.", price: 3400, value: "classic-glow" },
  { id: "profile-effect-classic-grain", type: "profileEffects", category: "classic", name: "Grain argentique", description: "Une texture fine rappelle les tables photographiées sur pellicule.", price: 4600, value: "classic-grain" },
  { id: "profile-effect-classic-vignette", type: "profileEffects", category: "classic", name: "Vignette de salon", description: "Les bords s’assombrissent pour recentrer le regard.", price: 5800, value: "classic-vignette" },
  { id: "profile-effect-shine", type: "profileEffects", category: "premium", name: "Éclat de profil", description: "Un reflet doux traverse régulièrement tout le profil.", price: 26000, value: "shine" },
  { id: "profile-effect-holographic", type: "profileEffects", category: "premium", name: "Hologramme", description: "Des nappes irisées donnent une profondeur holographique.", price: 46000, value: "holographic", packs: ["neon"] },
  { id: "profile-effect-embers", type: "profileEffects", category: "premium", name: "Pluie de braises", description: "Des points incandescents ponctuent la présentation publique.", price: 68000, value: "embers" },
  { id: "profile-effect-sparkles", type: "profileEffects", category: "premiumAnimated", name: "Poussière d’étoiles", description: "Des paillettes dorées flottent sur tout le profil.", price: 88000, value: "sparkles" },
  { id: "profile-effect-constellation", type: "profileEffects", category: "premiumAnimated", name: "Constellation", description: "Un champ cosmique subtil anime le fond du profil.", price: 145000, value: "constellation" },
  { id: "profile-banner-burgundy-lounge", type: "profileBanners", category: "classic", name: "Salon bordeaux", description: "Un bordeaux feutré relevé de bandes ton sur ton.", price: 6800, value: "burgundy-lounge" },
  { id: "profile-banner-emerald-grid", type: "profileBanners", category: "classic", name: "Grille émeraude", description: "Une table verte structurée par une grille très discrète.", price: 7600, value: "emerald-grid" },
  { id: "profile-banner-navy-satin", type: "profileBanners", category: "classic", name: "Satin marine", description: "Un fond bleu profond traversé par un reflet satiné.", price: 8500, value: "navy-satin" },
  { id: "profile-banner-warm-parchment", type: "profileBanners", category: "classic", name: "Parchemin chaud", description: "Une composition crème et cuivre inspirée des clubs historiques.", price: 9800, value: "warm-parchment" },
  { id: "profile-banner-sapphire-suite", type: "profileBanners", category: "premium", name: "Suite saphir", description: "Des profondeurs bleues et des éclats de pierre précieuse.", price: 58000, value: "sapphire-suite" },
  { id: "profile-banner-noir-gold", type: "profileBanners", category: "premium", name: "Noir & or", description: "Des diagonales noires encadrées d’or champagne.", price: 72000, value: "noir-gold" },
  { id: "profile-banner-rose-champagne", type: "profileBanners", category: "premium", name: "Rose champagne", description: "Une ambiance poudrée premium avec reflets champagne.", price: 88000, value: "rose-champagne" },
  { id: "profile-banner-casino-wave", type: "profileBanners", category: "premiumAnimated", name: "Onde du casino", description: "Des nappes lumineuses parcourent lentement le profil.", price: 185000, value: "casino-wave" },
  { id: "profile-banner-sunburst-cut", type: "profileBanners", category: "premiumShape", name: "Éventail taillé", description: "Une bannière aux coins coupés et au motif rayonnant.", price: 128000, value: "sunburst-cut" },
  { id: "profile-banner-hex-vault", type: "profileBanners", category: "premiumShape", name: "Coffre hexagonal", description: "Une silhouette facettée inspirée des portes de chambre forte.", price: 152000, value: "hex-vault" },
  { id: "profile-frame-bronze-line", type: "profileFrames", category: "classic", name: "Trait bronze", description: "Un contour bronze fin et chaleureux.", price: 7200, value: "bronze-line" },
  { id: "profile-frame-pearl-line", type: "profileFrames", category: "classic", name: "Trait nacré", description: "Une bordure claire légèrement nacrée.", price: 8200, value: "pearl-line" },
  { id: "profile-frame-forest-line", type: "profileFrames", category: "classic", name: "Trait forêt", description: "Un encadrement vert sombre et cuivre.", price: 9200, value: "forest-line" },
  { id: "profile-frame-navy-line", type: "profileFrames", category: "classic", name: "Trait marine", description: "Une bordure bleu marine soulignée d’acier.", price: 10400, value: "navy-line" },
  { id: "profile-frame-platinum", type: "profileFrames", category: "premium", name: "Platine", description: "Un triple reflet métallique froid et précis.", price: 84000, value: "platinum" },
  { id: "profile-frame-ruby", type: "profileFrames", category: "premium", name: "Rubis serti", description: "Un sertissage rouge profond illuminé de rose.", price: 98000, value: "ruby" },
  { id: "profile-frame-emerald", type: "profileFrames", category: "premium", name: "Émeraude sertie", description: "Un cadre vert précieux aux reflets dorés.", price: 112000, value: "emerald" },
  { id: "profile-frame-electric-rainbow", type: "profileFrames", category: "premiumAnimated", name: "Arc électrique", description: "Une impulsion multicolore circule sur le pourtour.", price: 205000, value: "electric-rainbow" },
  { id: "profile-frame-corner-chips", type: "profileFrames", category: "premiumShape", name: "Coins jetons", description: "Quatre angles renforcés évoquent des piles de jetons.", price: 148000, value: "corner-chips" },
  { id: "profile-frame-crown-cut", type: "profileFrames", category: "premiumShape", name: "Couronne taillée", description: "Une bordure angulaire avec une pointe royale centrale.", price: 176000, value: "crown-cut" },
  { id: "profile-effect-soft-bloom", type: "profileEffects", category: "classic", name: "Lueur douce", description: "Un éclairage diffus et stable sans masquer les informations.", price: 7000, value: "soft-bloom" },
  { id: "profile-effect-felt-texture", type: "profileEffects", category: "classic", name: "Texture feutre", description: "Un grain textile discret inspiré des tapis de jeu.", price: 8000, value: "felt-texture" },
  { id: "profile-effect-edge-light", type: "profileEffects", category: "classic", name: "Lumière rasante", description: "Une lumière latérale donne du relief à la composition.", price: 9000, value: "edge-light" },
  { id: "profile-effect-smoked-glass", type: "profileEffects", category: "classic", name: "Verre fumé", description: "Une profondeur sombre et vitrée sur les bords.", price: 10200, value: "smoked-glass" },
  { id: "profile-effect-prism-veil", type: "profileEffects", category: "premium", name: "Voile prismatique", description: "Des reflets cyan et magenta se croisent sans gêner la lecture.", price: 76000, value: "prism-veil" },
  { id: "profile-effect-golden-bokeh", type: "profileEffects", category: "premium", name: "Bokeh doré", description: "Des halos dorés donnent une ambiance de soirée privée.", price: 92000, value: "golden-bokeh" },
  { id: "profile-effect-velvet-depth", type: "profileEffects", category: "premium", name: "Profondeur velours", description: "Des ombres rouges profondes sculptent les panneaux du profil.", price: 108000, value: "velvet-depth" },
  { id: "profile-effect-firefly-drift", type: "profileEffects", category: "premiumAnimated", name: "Vol des lucioles", description: "De petites lumières se déplacent lentement dans le décor.", price: 190000, value: "firefly-drift" },
  { id: "profile-effect-spotlight-oval", type: "profileEffects", category: "premiumShape", name: "Projecteur ovale", description: "Un faisceau ovale encadre la zone centrale du profil.", price: 138000, value: "spotlight-oval" },
  { id: "profile-effect-geometric-corners", type: "profileEffects", category: "premiumShape", name: "Angles géométriques", description: "Des facettes lumineuses habillent uniquement les quatre coins.", price: 162000, value: "geometric-corners" },
  { id: "icon-japanese-traditional", type: "icons", category: "premium", name: "Torii traditionnel", description: "Une icône vermillon inspirée des portes de sanctuaire.", price: 28000, value: "japanese-traditional", icon: '<svg viewBox="0 0 24 24"><path d="M3 4h18M5 8h14M7 8v13M17 8v13M5 13h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>', packs: ["japanese-traditional"] },
  { id: "name-japanese-traditional", type: "nameEffects", category: "premium", name: "Pseudo Encre sumi", description: "Une calligraphie sombre relevée d’un sceau vermillon.", price: 34000, value: "japanese-traditional", packs: ["japanese-traditional"] },
  { id: "member-japanese-traditional", type: "memberCards", category: "premiumShape", name: "Member card Washi", description: "Papier washi, vagues seigaiha et sceau rouge.", price: 135000, value: "japanese-traditional", packs: ["japanese-traditional"] },
  { id: "profile-banner-japanese-traditional", type: "profileBanners", category: "premiumShape", name: "Bannière Estampe", description: "Un paysage d’encre encadré de vagues traditionnelles.", price: 118000, value: "japanese-traditional", packs: ["japanese-traditional"] },
  { id: "profile-frame-japanese-traditional", type: "profileFrames", category: "premiumShape", name: "Cadre Kumiko", description: "Un encadrement géométrique en bois sombre et or patiné.", price: 126000, value: "japanese-traditional", packs: ["japanese-traditional"] },
  { id: "profile-effect-japanese-traditional", type: "profileEffects", category: "premium", name: "Effet Encre flottante", description: "Des lavis d’encre structurent discrètement le profil.", price: 98000, value: "japanese-traditional", packs: ["japanese-traditional"] },
  { id: "dice-japanese-traditional", type: "diceSkins", category: "premiumShape", name: "Dés Netsuke", description: "Dés ivoire sculptés avec points vermillon.", price: 142000, value: "japanese-traditional", packs: ["japanese-traditional"] },
  { id: "card-skin-japanese-traditional", type: "cardSkins", category: "premiumShape", name: "Cartes Hanafuda", description: "Un deck ivoire au dos indigo et motif seigaiha.", price: 168000, value: "japanese-traditional", packs: ["japanese-traditional"] },
  { id: "icon-japanese-sakura", type: "icons", category: "premiumAnimated", name: "Sakura vivant", description: "Une fleur de cerisier accompagnée d’un pétale animé.", price: 92000, value: "japanese-sakura", icon: "flower-2", packs: ["japanese-sakura"] },
  { id: "name-japanese-sakura", type: "nameEffects", category: "premiumAnimated", name: "Pseudo Sakura", description: "Des reflets rose nacré circulent dans le pseudo.", price: 124000, value: "japanese-sakura", packs: ["japanese-sakura"] },
  { id: "member-japanese-sakura", type: "memberCards", category: "premiumAnimated", name: "Member card Hanami", description: "Une carte de membre animée sous une pluie de pétales.", price: 285000, value: "japanese-sakura", packs: ["japanese-sakura"] },
  { id: "profile-banner-japanese-sakura", type: "profileBanners", category: "premiumAnimated", name: "Bannière Hanami", description: "Un ciel de printemps traversé par des pétales animés.", price: 245000, value: "japanese-sakura", packs: ["japanese-sakura"] },
  { id: "profile-frame-japanese-sakura", type: "profileFrames", category: "premiumAnimated", name: "Cadre Branches de sakura", description: "Une bordure rose et bois dont la lumière respire.", price: 230000, value: "japanese-sakura", packs: ["japanese-sakura"] },
  { id: "profile-effect-japanese-sakura", type: "profileEffects", category: "premiumAnimated", name: "Pluie de sakura", description: "Des pétales dérivent sur tout le profil sans gêner la lecture.", price: 260000, value: "japanese-sakura", packs: ["japanese-sakura"] },
  { id: "dice-japanese-sakura", type: "diceSkins", category: "premiumAnimated", name: "Dés Sakura", description: "Des dés rose nacré aux points prune et reflets mouvants.", price: 255000, value: "japanese-sakura", packs: ["japanese-sakura"] },
  { id: "card-skin-japanese-sakura", type: "cardSkins", category: "premiumAnimated", name: "Cartes Sakura", description: "Un deck printanier dont les pétales glissent sur le dos.", price: 295000, value: "japanese-sakura", packs: ["japanese-sakura"] }
];

function normalizePlatformSettings(value = {}) {
  const integer = (key, fallback, min, max) => {
    const parsed = Number(value[key]);
    return Math.max(min, Math.min(max, Math.floor(Number.isFinite(parsed) ? parsed : fallback)));
  };
  const minPokerBuyIn = integer("minPokerBuyIn", defaultPlatformSettings.minPokerBuyIn, 1000, 10000000);
  let pokerDefaultBigBlind = integer("pokerDefaultBigBlind", defaultPlatformSettings.pokerDefaultBigBlind, 2, minPokerBuyIn);
  if (pokerDefaultBigBlind % 2) pokerDefaultBigBlind += pokerDefaultBigBlind < minPokerBuyIn ? 1 : -1;
  const dailyBonus = normalizeDailyBonusConfig({
    defaultMultiplier: value.dailyBonusDefaultMultiplier ?? defaultPlatformSettings.dailyBonusDefaultMultiplier,
    maxMultiplier: value.dailyBonusMaxMultiplier ?? defaultPlatformSettings.dailyBonusMaxMultiplier,
    rules: value.dailyBonusRules ?? defaultPlatformSettings.dailyBonusRules
  });
  return {
    siteName: String(value.siteName ?? defaultPlatformSettings.siteName).trim().slice(0, 36) || defaultPlatformSettings.siteName,
    siteIcon: String(value.siteIcon ?? defaultPlatformSettings.siteIcon).trim().slice(0, 6000) || defaultPlatformSettings.siteIcon,
    siteSubtitle: String(value.siteSubtitle ?? defaultPlatformSettings.siteSubtitle).trim().slice(0, 120) || defaultPlatformSettings.siteSubtitle,
    registrationsEnabled: value.registrationsEnabled !== false,
    guestAccessEnabled: value.guestAccessEnabled !== false,
    emailVerificationRequired: value.emailVerificationRequired === true,
    minorRestrictions: normalizeMinorRestrictions(value.minorRestrictions),
    signupTokens: integer("signupTokens", defaultPlatformSettings.signupTokens, 0, 10000000),
    dailyTokens: integer("dailyTokens", defaultPlatformSettings.dailyTokens, 0, 1000000),
    dailyBonusDefaultMultiplier: dailyBonus.defaultMultiplier,
    dailyBonusMaxMultiplier: dailyBonus.maxMultiplier,
    dailyBonusRules: dailyBonus.rules,
    minRoomStake: integer("minRoomStake", defaultPlatformSettings.minRoomStake, 1, 1000000),
    botThinkingSeconds: integer("botThinkingSeconds", defaultPlatformSettings.botThinkingSeconds, 0, 30),
    turnEndDelaySeconds: integer("turnEndDelaySeconds", defaultPlatformSettings.turnEndDelaySeconds, 1, 60),
    roundResultsSeconds: integer("roundResultsSeconds", defaultPlatformSettings.roundResultsSeconds, 0, 120),
    minPokerBuyIn,
    pokerDefaultBigBlind,
    pokerTurnSeconds: integer("pokerTurnSeconds", defaultPlatformSettings.pokerTurnSeconds, 30, 600)
  };
}

function platformSettings(db = readDb()) {
  return normalizePlatformSettings(db.settings?.platform);
}

function pokerBlindsFromBigBlind(value, fallback = defaultPlatformSettings.pokerDefaultBigBlind) {
  let bigBlind = Math.max(2, Math.floor(Number(value) || fallback));
  if (bigBlind % 2) bigBlind += 1;
  return { smallBlind: bigBlind / 2, bigBlind };
}

function battleDeckOverview(state, viewerId) {
  const ranks = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
  const suits = ["S", "H", "D", "C"];
  const keyFor = (card) => `${card.rank}-${card.suit}`;
  const cards = state.piles?.[viewerId] ?? [];
  const actualKeys = new Set(cards.map(keyFor));
  const viewerKnowledge = state.deckKnowledge?.[viewerId] ?? {};
  const certain = new Set((viewerKnowledge[viewerId] ?? []).filter((key) => actualKeys.has(key)));
  const impossible = new Set();
  for (const [ownerId, keys] of Object.entries(viewerKnowledge)) if (ownerId !== viewerId) for (const key of keys) impossible.add(key);
  const knownOutsideDeck = [state.drawnCards?.[viewerId], state.pendingChoices?.[viewerId]?.card].filter(Boolean);
  for (const lane of state.battleLanes ?? []) for (const card of lane.cards) if (card.ownerId === viewerId || card.revealedToAll) knownOutsideDeck.push(card);
  for (const card of knownOutsideDeck) impossible.add(keyFor(card));
  for (const key of certain) impossible.delete(key);
  const onlyCertainRemain = certain.size >= cards.length;
  const candidates = ranks.flatMap((rank) => suits.map((suit) => ({ rank, suit }))).filter((card) => {
    const key = keyFor(card);
    return certain.has(key) || (!onlyCertainRemain && !impossible.has(key));
  }).map((card) => ({ ...card, status: certain.has(keyFor(card)) ? "certain" : "possible" }));
  return {
    total: cards.length,
    unseenAcquiredCount: cards.filter((card) => card.unseenAcquiredBy === viewerId).length,
    certainCount: candidates.filter((card) => card.status === "certain").length,
    possibleCount: candidates.filter((card) => card.status === "possible").length,
    cards: candidates
  };
}

function configuredGames(db = readDb()) {
  const overrides = db.settings?.games ?? {};
  return games.map((game, index) => ({ ...game, description: defaultGameDescriptions[game.id] ?? "", position: index + 1, enabled: true, ...(overrides[game.id] ?? {}), defaultModifiers: game.id === "bataille" ? normalizeBattleModifiers(overrides[game.id]?.defaultModifiers) : normalizeGameModifiers(game.id, overrides[game.id]?.defaultModifiers) })).sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
}

function configuredShop(db = readDb()) {
  const overrides = db.settings?.shopOverrides ?? {};
  const removed = new Set(db.settings?.removedShopItems ?? []);
  return [...shopCatalog, ...(db.settings?.customShopItems ?? [])].filter((item) => !removed.has(item.id)).map((item) => ({ ...item, ...(overrides[item.id] ?? {}) }));
}

const shopTypes = ["icons", "nameEffects", "memberCards", "profileBanners", "profileFrames", "profileEffects", "diceSkins", "cardSkins"];
const shopCategories = ["classic", "premium", "premiumShape", "premiumAnimated"];
const cosmeticEquippedKeys = { icons: "icon", nameEffects: "nameEffect", memberCards: "memberCard", profileBanners: "profileBanner", profileFrames: "profileFrame", profileEffects: "profileEffect", diceSkins: "diceSkin", cardSkins: "cardSkin" };
const builtInPackNames = { "japanese-traditional": "Japon traditionnel", "japanese-sakura": "Sakura", neon: "Néon" };

function normalizeShopPack(packName) {
  const name = normalizePlainText(packName, 80);
  if (!name) return { packs: [], packName: "" };
  const comparable = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
  const builtIn = Object.entries(builtInPackNames).find(([id, label]) => comparable === id || comparable === label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr"));
  const id = builtIn?.[0] ?? comparable.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
  if (!id) throw new Error("Le nom du pack doit contenir au moins une lettre ou un chiffre.");
  return { packs: [id], packName: builtIn?.[1] ?? name };
}

function shopPackDiscountPercent(itemCount) {
  return Math.min(35, Math.max(0, Math.floor(Number(itemCount) || 0) - 1) * 5);
}

function shopPriceGuidance(db, type, category, excludeId = "") {
  const prices = configuredShop(db)
    .filter((item) => !item.rewardOnly && item.id !== excludeId && item.type === type && item.category === category)
    .map((item) => Math.max(0, Math.floor(Number(item.price) || 0)))
    .sort((a, b) => a - b);
  if (!prices.length) return { count: 0, min: 0, max: 0, recommended: 1000, allowedMin: 0, allowedMax: 1000000 };
  const middle = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[middle] : Math.round((prices[middle - 1] + prices[middle]) / 2);
  return {
    count: prices.length,
    min: prices[0],
    max: prices.at(-1),
    recommended: median,
    allowedMin: Math.max(0, Math.floor(prices[0] * 0.75)),
    allowedMax: Math.max(1, Math.ceil(prices.at(-1) * 1.25))
  };
}

function shopPricingMatrix(db) {
  return Object.fromEntries(shopTypes.flatMap((type) => shopCategories.map((category) => [`${type}:${category}`, shopPriceGuidance(db, type, category)])));
}

function requireAdmin(req, res, next) {
  const user = readDb().users.find((entry) => entry.id === req.auth?.id);
  if (!user?.admin) return res.status(403).json({ error: "Accès administrateur requis." });
  req.backOfficeUser = user;
  next();
}

function requireBackOffice(req, res, next) {
  const user = readDb().users.find((entry) => entry.id === req.auth?.id);
  if (!user?.admin && !user?.editor) return res.status(403).json({ error: "Accès au back-office requis." });
  req.backOfficeUser = user;
  next();
}

const resultAchievementCatalog = [
  { id: "random-miracle", type: "milestone", milestone: true, secret: true, group: "Secrets", title: "Signal impossible", description: "Se débloque aléatoirement avec une chance de 1 sur 100 000.", target: 1 },
  { id: "secret-42", type: "milestone", milestone: true, secret: true, group: "Secrets", title: "Deep Thought", description: "A trouvé la réponse à la vie, l'univers et le reste.", target: 1 },
  { id: "secret-firefox", type: "milestone", milestone: true, secret: true, group: "Secrets", title: "Renard de feu", description: "A visité le casino avec Firefox.", target: 1 },
  { id: "secret-edge", type: "milestone", milestone: true, secret: true, group: "Secrets", title: "Au bord du monde", description: "A visité le casino avec Edge.", target: 1 },
  { id: "secret-chrome", type: "milestone", milestone: true, secret: true, group: "Secrets", title: "Brillant", description: "A visité le casino avec Chrome.", target: 1 },
  { id: "secret-small-rock", type: "milestone", milestone: true, secret: true, group: "Secrets", title: "Petite pierre", description: "Joueur ayant découvert l'Oeil de l'univers", target: 1 },
  { id: "shop-first-purchase", type: "site", group: "Boutique", title: "Premier achat", description: "Acheter un premier élément dans la boutique.", target: 1 },
  { id: "shop-collector-10", type: "site", group: "Boutique", title: "Collectionneur", description: "Posséder 10 éléments cosmétiques.", target: 10 },
  { id: "shop-collector-25", type: "site", milestone: true, group: "Boutique", title: "Grand collectionneur", description: "Posséder 25 éléments cosmétiques.", target: 25 },
  { id: "shop-fashionista", type: "site", milestone: true, group: "Boutique", title: "Fashionista", description: "Posséder au moins un élément de chaque type cosmétique.", target: 5 },
  { id: "shop-big-spender", type: "site", milestone: true, group: "Boutique", title: "Dépensier", description: "Dépenser 100 000 jetons dans la boutique.", target: 100000 },
  { id: "yahtzee-first-yahtzee", type: "games", milestone: true, group: "Yahtzee", title: "Yahtzee !", description: "Marquer un Yahtzee.", target: 1 },
  { id: "yahtzee-large-straight", type: "games", group: "Yahtzee", title: "Grande suite", description: "Marquer une grande suite.", target: 1 },
  { id: "yahtzee-full-house", type: "games", group: "Yahtzee", title: "Maison pleine", description: "Marquer un full.", target: 1 },
  { id: "yahtzee-upper-bonus", type: "games", milestone: true, group: "Yahtzee", title: "Bonus supérieur", description: "Atteindre le bonus de la section supérieure.", target: 1 },
  { id: "yahtzee-score-250", type: "games", group: "Yahtzee", title: "Quart de millier", description: "Atteindre au moins 250 points au Yahtzee.", target: 1 },
  { id: "yahtzee-score-300", type: "games", milestone: true, group: "Yahtzee", title: "Club des 300", description: "Atteindre au moins 300 points au Yahtzee.", target: 1 },
  { id: "yahtzee-three-zeroes", type: "games", group: "Yahtzee", title: "Triple rature", description: "Terminer une partie avec au moins trois catégories à 0.", target: 1 },
  { id: "yahtzee-clean-card", type: "games", milestone: true, group: "Yahtzee", title: "Carte pleine", description: "Terminer une partie sans aucune catégorie à 0.", target: 1 },
  { id: "yahtzee-perfect", type: "games", milestone: true, secret: true, group: "Jeux", title: "Perfect", description: "Atteindre le score maximal de 375 points au Yahtzee.", target: 1 },
  { id: "421-perfect", type: "games", milestone: true, group: "421", title: "421 sec", description: "Valider un 421.", target: 1 },
  { id: "421-nenette", type: "games", group: "421", title: "Nénette", description: "Valider une Nénette.", target: 1 },
  { id: "421-triple", type: "games", group: "421", title: "Brelan net", description: "Valider un brelan.", target: 1 },
  { id: "cul-cul-de-chouette", type: "games", milestone: true, group: "Cul de Chouette", title: "Cul de Chouette", description: "Réaliser un Cul de Chouette.", target: 1 },
  { id: "cul-chouette-velute", type: "games", milestone: true, group: "Cul de Chouette", title: "Chouette Velute", description: "Réaliser une Chouette Velute.", target: 1 },
  { id: "cul-343", type: "games", group: "Cul de Chouette", title: "Objectif 343", description: "Gagner en atteignant 343 points.", target: 1 },
  { id: "blackjack-21", type: "games", group: "Blackjack", title: "Vingt-et-un", description: "Obtenir exactement 21 au Blackjack.", target: 1 },
  { id: "blackjack-natural", type: "games", milestone: true, group: "Blackjack", title: "Blackjack naturel", description: "Obtenir 21 avec les deux premières cartes.", target: 1 },
  { id: "blackjack-dealer-bust", type: "games", group: "Blackjack", title: "Dealer bust", description: "Gagner parce que le dealer dépasse 21.", target: 1 },
  { id: "blackjack-push", type: "games", milestone: true, group: "Blackjack", title: "Égalité parfaite", description: "Faire égalité avec le dealer à 21.", target: 1 },
  { id: "blackjack-five-card-hand", type: "games", group: "Blackjack", title: "Funambule", description: "Atteindre cinq cartes sans dépasser 21.", target: 1 },
  { id: "bataille-war", type: "games", group: "Bataille", title: "Bataille déclarée", description: "Déclencher une bataille sur égalité.", target: 1 },
  { id: "bataille-sweep", type: "games", group: "Bataille", title: "Tout le paquet", description: "Gagner une partie de Bataille.", target: 1 },
  { id: "president-revolution", type: "games", milestone: true, group: "Président", title: "Révolution", description: "Jouer un carré et inverser l'ordre.", target: 1 },
  { id: "president-first-out", type: "games", group: "Président", title: "Président", description: "Sortir premier d'une manche.", target: 1 },
  { id: "president-pair-master", type: "games", group: "Président", title: "Contrôle des paires", description: "Gagner après avoir joué au moins une paire.", target: 1 },
  { id: "farkle-hot-dice", type: "games", milestone: true, group: "Farkle", title: "Hot dice", description: "Marquer avec les 6 dés sur une sélection.", target: 1 },
  { id: "farkle-straight", type: "games", group: "Farkle", title: "Suite complète", description: "Marquer une suite 1-6.", target: 1 },
  { id: "farkle-three-pairs", type: "games", group: "Farkle", title: "Les inséparables", description: "Obtenir trois paires sur un lancer.", target: 1 },
  { id: "farkle-two-triplets", type: "games", group: "Farkle", title: "Double brelan", description: "Obtenir deux brelans sur un lancer.", target: 1 },
  { id: "farkle-roll-1000", type: "games", group: "Farkle", title: "Mille d'un coup", description: "Marquer au moins 1 000 points sur un lancer.", target: 1 },
  { id: "farkle-roll-3000", type: "games", milestone: true, group: "Farkle", title: "Lancer absolu", description: "Marquer 3 000 points sur un seul lancer.", target: 1 },
  { id: "farkle-one-shot-10000", type: "games", milestone: true, group: "Farkle", title: "One shot", description: "Encaisser au moins 10 000 points en un seul tour.", target: 1 },
  { id: "farkle-target", type: "games", group: "Farkle", title: "Dix mille", description: "Atteindre 10 000 points.", target: 1 },
  { id: "liars-dice-good-call", type: "games", group: "Liar's Dice", title: "Bon call", description: "Gagner une contestation.", target: 1 },
  { id: "liars-dice-last-die", type: "games", group: "Liar's Dice", title: "Dernier dé", description: "Gagner une partie de Liar's Dice.", target: 1 },
  { id: "shut-zero", type: "games", milestone: true, group: "Shut the Box", title: "Boîte fermée", description: "Fermer toutes les tuiles.", target: 1 },
  { id: "shut-low", type: "games", group: "Shut the Box", title: "Table propre", description: "Finir avec un score de 6 ou moins.", target: 1 },
  { id: "golf-clear", type: "games", milestone: true, group: "Golf Solitaire", title: "Parfait parcours", description: "Vider le tableau.", target: 1 },
  { id: "golf-low", type: "games", group: "Golf Solitaire", title: "Sous le par", description: "Finir avec 5 cartes restantes ou moins.", target: 1 },
  { id: "accordion-one-pile", type: "games", milestone: true, group: "Accordion", title: "Accordéon parfait", description: "Finir avec une seule pile.", target: 1 },
  { id: "accordion-low", type: "games", group: "Accordion", title: "Compression nette", description: "Finir avec 10 piles ou moins.", target: 1 },
  { id: "midnight-perfect-contract", type: "games", milestone: true, group: "Dés de Minuit", title: "Mandat parfait", description: "Réussir un mandat Or, Platine ou Diamant.", target: 1 },
  { id: "midnight-market-shaker", type: "games", group: "Dés de Minuit", title: "Main invisible", description: "Écarter au moins trois dés du marché dans une partie.", target: 1 },
  { id: "midnight-flawless-contracts", type: "games", milestone: true, group: "Dés de Minuit", title: "Sans faute", description: "Réussir tous ses mandats au cours d'une même partie.", target: 1 },
  { id: "midnight-all-contracts", type: "games", milestone: true, group: "Dés de Minuit", title: "Maître des mandats", description: "Réussir chacun des 12 mandats disponibles au moins une fois.", target: 12 },
  { id: "midnight-diamond-contract", type: "games", milestone: true, secret: true, group: "Dés de Minuit", title: "Diamant de minuit", description: "Réussir le mandat Diamant.", target: 1 },
  { id: "velvet-bluff-caught", type: "games", group: "Velours Noir", title: "Pris dans le velours", description: "Démasquer un bluff adverse.", target: 1 },
  { id: "velvet-three-catches", type: "games", milestone: true, group: "Velours Noir", title: "Œil du casino", description: "Démasquer trois bluffs dans une même partie.", target: 1 }
];

const achievementCollectionCatalog = [
  { id: "achievement-collector-50", type: "site", milestone: true, group: "Jeux", title: "Galerie d'honneur", description: "Débloquer 50 succès.", target: 50 }
];
const achievementCompletionId = "achievement-visible-complete";

const app = express();
const requestLogs = createRequestLogStore({ filename: process.env.REQUEST_LOG_PATH || path.join(__dirname, "..", "data", "request-logs.sqlite") });
process.on("exit", () => requestLogs.close());
const statusMonitor = createStatusMonitor({ filename: process.env.STATUS_DB_PATH || path.join(__dirname, "..", "data", "status.sqlite") });
process.on("exit", () => statusMonitor.close());
const patchnotes = createPatchnoteStore({
  filename: process.env.PATCHNOTES_DB_PATH ? path.resolve(process.cwd(), process.env.PATCHNOTES_DB_PATH) : path.join(__dirname, "..", "data", "patchnotes.sqlite"),
  uploadDirectory: process.env.PATCHNOTES_UPLOAD_DIR ? path.resolve(process.cwd(), process.env.PATCHNOTES_UPLOAD_DIR) : path.join(__dirname, "..", "data", "patchnote-images"),
  currentVersion: APP_VERSION
});
process.on("exit", () => patchnotes.close());
const serverStartedAt = Date.now();
const requestTelemetry = {
  active: 0,
  total: 0,
  errors: 0,
  periodCount: 0,
  periodErrors: 0,
  periodDurationMs: 0,
  periodMaxDurationMs: 0,
  endpoints: new Map()
};
if (!JWT_SECRET) {
  console.error("JWT_SECRET is required when NODE_ENV=production.");
  process.exit(1);
}

function isAllowedOrigin(origin) {
  return !origin || allowedOrigins.includes(origin);
}

function normalizeBasePath(value) {
  const normalized = `/${String(value || "").replace(/^\/+|\/+$/g, "")}`;
  return normalized === "/" ? "" : normalized;
}

const corsOptions = {
  origin(origin, callback) {
    callback(isAllowedOrigin(origin) ? null : new Error("Origin not allowed by CORS"), isAllowedOrigin(origin));
  },
  credentials: true
};

app.disable("x-powered-by");
if (TRUST_PROXY) app.set("trust proxy", /^\d+$/.test(TRUST_PROXY) ? Number(TRUST_PROXY) : TRUST_PROXY);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(requestLogMiddleware(requestLogs));
app.use((req, res, next) => {
  if (!isAllowedOrigin(req.headers.origin)) res.locals.logCorsDenied = true;
  next();
});
app.use(cors(corsOptions));
app.use(compression({ threshold: 1024 }));
if (APP_BASE_PATH) {
  app.use((req, res, next) => {
    if (req.url === APP_BASE_PATH) {
      req.url = "/";
      return next();
    }
    if (req.url.startsWith(`${APP_BASE_PATH}/`)) {
      req.url = req.url.slice(APP_BASE_PATH.length) || "/";
      return next();
    }
    return res.status(404).json({ error: "Chemin introuvable." });
  });
}
app.use((req, res, next) => {
  const startedAt = performance.now();
  requestTelemetry.active += 1;
  let recorded = false;
  const recordRequest = () => {
    if (recorded) return;
    recorded = true;
    requestTelemetry.active = Math.max(0, requestTelemetry.active - 1);
    const durationMs = performance.now() - startedAt;
    const routePath = req.route?.path ? String(req.route.path) : req.path
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")
      .replace(/\b[A-F0-9]{6}\b/g, ":code")
      .replace(/\/\d+(?=\/|$)/g, "/:id");
    const key = `${req.method} ${routePath}`;
    // Le rafraîchissement de la page de santé ne doit pas masquer l'activité utile.
    if (["GET /api/admin/health", "GET /api/status"].includes(key)) return;
    const failed = res.statusCode >= 400;
    requestTelemetry.total += 1;
    requestTelemetry.periodCount += 1;
    requestTelemetry.periodDurationMs += durationMs;
    requestTelemetry.periodMaxDurationMs = Math.max(requestTelemetry.periodMaxDurationMs, durationMs);
    if (failed) {
      requestTelemetry.errors += 1;
      requestTelemetry.periodErrors += 1;
    }
    const endpoint = requestTelemetry.endpoints.get(key) ?? { route: key, requests: 0, errors: 0, durationMs: 0, maxDurationMs: 0, lastStatus: 0, lastSeenAt: null };
    endpoint.requests += 1;
    endpoint.durationMs += durationMs;
    endpoint.maxDurationMs = Math.max(endpoint.maxDurationMs, durationMs);
    endpoint.lastStatus = res.statusCode;
    endpoint.lastSeenAt = new Date().toISOString();
    if (failed) endpoint.errors += 1;
    requestTelemetry.endpoints.set(key, endpoint);
  };
  res.once("finish", recordRequest);
  res.once("close", recordRequest);
  next();
});
app.use(express.json());
app.use("/api", rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, limit: RATE_LIMIT_MAX, standardHeaders: "draft-7", legacyHeaders: false }));
app.use("/api/auth", rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, limit: AUTH_RATE_LIMIT_MAX, standardHeaders: "draft-7", legacyHeaders: false }));

function createAppServer() {
  if (HTTPS_PFX_PATH) {
    if (!fs.existsSync(HTTPS_PFX_PATH)) {
      console.error("HTTPS PFX certificate file not found.");
      process.exit(1);
    }
    return createHttpsServer({
      pfx: fs.readFileSync(HTTPS_PFX_PATH),
      passphrase: HTTPS_PFX_PASSPHRASE
    }, app);
  }
  if (!HTTPS_KEY_PATH && !HTTPS_CERT_PATH) return createServer(app);
  if (!HTTPS_KEY_PATH || !HTTPS_CERT_PATH) {
    console.error("HTTPS_KEY_PATH and HTTPS_CERT_PATH must be configured together.");
    process.exit(1);
  }
  if (!fs.existsSync(HTTPS_KEY_PATH) || !fs.existsSync(HTTPS_CERT_PATH)) {
    console.error("HTTPS certificate files not found.");
    process.exit(1);
  }
  return createHttpsServer({
    key: fs.readFileSync(HTTPS_KEY_PATH),
    cert: fs.readFileSync(HTTPS_CERT_PATH)
  }, app);
}

const server = createAppServer();
const io = new Server(server, {
  path: `${APP_BASE_PATH}/socket.io`,
  cors: {
    origin(origin, callback) {
      callback(isAllowedOrigin(origin) ? null : new Error("Origin not allowed by CORS"), isAllowedOrigin(origin));
    },
    credentials: true
  }
});
const sessions = new Map();
let socketConnectionErrors = 0;
io.engine.on("connection_error", (error) => {
  socketConnectionErrors += 1;
  requestLogs.append({ category: "socket", level: "warning", method: "WS", route: `${APP_BASE_PATH}/socket.io`, status: 400, origin: error.req?.headers?.origin, message: `Connexion temps réel refusée (code ${Number(error.code) || 0}).` });
});
const roomPresence = new Map();
const spectatorAccess = new Map();
function grantSpectatorAccess(room, userId) {
  for (const [key, expires] of spectatorAccess) if (expires <= Date.now()) spectatorAccess.delete(key);
  spectatorAccess.set(`${room.id}:${userId}`, Date.now() + 24 * 60 * 60 * 1000);
}
function maySpectate(room, userId) {
  return room.players.some((player) => player.id === userId) || (room.isPublic && !room.passwordHash) || (spectatorAccess.get(`${room.id}:${userId}`) ?? 0) > Date.now();
}
const battleBotTimers = new Map();
const eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
eventLoopMonitor.enable();
let previousProcessCpu = process.cpuUsage();
let previousSampleAt = performance.now();
let previousEventLoopUtilization = performance.eventLoopUtilization();
let previousSystemCpu = systemCpuTimes();
let lastDatabaseHealthAt = 0;
let cachedDatabaseHealth = null;
let latestServerHealth = null;
const serverHealthHistory = [];

function systemCpuTimes() {
  return os.cpus().reduce((total, cpu) => {
    const values = Object.values(cpu.times);
    total.idle += cpu.times.idle;
    total.total += values.reduce((sum, value) => sum + value, 0);
    return total;
  }, { idle: 0, total: 0 });
}

function currentDatabaseHealth(force = false) {
  const now = Date.now();
  if (force || !cachedDatabaseHealth || now - lastDatabaseHealthAt >= 30000) {
    cachedDatabaseHealth = databaseHealth();
    lastDatabaseHealthAt = now;
  }
  return cachedDatabaseHealth;
}

function collectServerHealthSample() {
  const sampledAt = performance.now();
  const elapsedMs = Math.max(1, sampledAt - previousSampleAt);
  const processCpu = process.cpuUsage(previousProcessCpu);
  previousProcessCpu = process.cpuUsage();
  previousSampleAt = sampledAt;
  const processCpuPercent = (processCpu.user + processCpu.system) / (elapsedMs * 1000) * 100;

  const systemCpu = systemCpuTimes();
  const systemTotalDelta = Math.max(1, systemCpu.total - previousSystemCpu.total);
  const systemIdleDelta = Math.max(0, systemCpu.idle - previousSystemCpu.idle);
  const systemCpuPercent = Math.max(0, Math.min(100, (1 - systemIdleDelta / systemTotalDelta) * 100));
  previousSystemCpu = systemCpu;

  const currentEventLoopUtilization = performance.eventLoopUtilization();
  const eventLoopDelta = performance.eventLoopUtilization(currentEventLoopUtilization, previousEventLoopUtilization);
  previousEventLoopUtilization = currentEventLoopUtilization;
  const eventLoopMeanMs = Number.isFinite(eventLoopMonitor.mean) ? eventLoopMonitor.mean / 1e6 : 0;
  const eventLoopP95Ms = Number.isFinite(eventLoopMonitor.percentile(95)) ? eventLoopMonitor.percentile(95) / 1e6 : 0;
  const eventLoopMaxMs = Number.isFinite(eventLoopMonitor.max) ? eventLoopMonitor.max / 1e6 : 0;
  eventLoopMonitor.reset();

  const memory = process.memoryUsage();
  const systemTotalMemory = os.totalmem();
  const db = readDb();
  const database = currentDatabaseHealth();
  const activeRooms = db.rooms.filter((room) => !room.finished);
  const playingRooms = activeRooms.filter((room) => Boolean(room.state));
  const waitingRooms = activeRooms.length - playingRooms.length;
  const seatedHumans = activeRooms.reduce((sum, room) => sum + (room.players ?? []).filter((player) => !player.isBot).length, 0);
  const seatedBots = activeRooms.reduce((sum, room) => sum + (room.players ?? []).filter((player) => player.isBot).length, 0);
  const watchedConnections = [...roomPresence.values()].reduce((sum, sockets) => sum + sockets.size, 0);
  const periodCount = requestTelemetry.periodCount;
  const sample = {
    at: new Date().toISOString(),
    cpuProcess: Number(processCpuPercent.toFixed(3)),
    cpuSystem: Number(systemCpuPercent.toFixed(3)),
    memoryRss: memory.rss,
    memoryHeap: memory.heapUsed,
    memoryExternal: memory.external,
    memorySystemUsed: systemTotalMemory - os.freemem(),
    eventLoopMean: Number(eventLoopMeanMs.toFixed(3)),
    eventLoopP95: Number(eventLoopP95Ms.toFixed(3)),
    eventLoopMax: Number(eventLoopMaxMs.toFixed(3)),
    eventLoopUtilization: Number((eventLoopDelta.utilization * 100).toFixed(3)),
    requestsPerSecond: Number((periodCount / (elapsedMs / 1000)).toFixed(3)),
    requestLatencyAverage: Number((periodCount ? requestTelemetry.periodDurationMs / periodCount : 0).toFixed(3)),
    requestLatencyMax: Number(requestTelemetry.periodMaxDurationMs.toFixed(3)),
    requestErrors: requestTelemetry.periodErrors,
    sockets: io.engine.clientsCount,
    watchedConnections,
    activeRooms: activeRooms.length,
    playingRooms: playingRooms.length,
    waitingRooms,
    seatedHumans,
    seatedBots,
    databaseBytes: database.fileBytes,
    walBytes: database.walBytes
  };
  requestTelemetry.periodCount = 0;
  requestTelemetry.periodErrors = 0;
  requestTelemetry.periodDurationMs = 0;
  requestTelemetry.periodMaxDurationMs = 0;
  latestServerHealth = sample;
  serverHealthHistory.push(sample);
  if (serverHealthHistory.length > 720) serverHealthHistory.splice(0, serverHealthHistory.length - 720);
  return sample;
}

function serverHealthPayload(requestedPoints = 360) {
  const sample = latestServerHealth ?? collectServerHealthSample();
  const database = currentDatabaseHealth();
  const memory = process.memoryUsage();
  const heap = v8.getHeapStatistics();
  const points = Math.max(30, Math.min(720, Math.floor(Number(requestedPoints) || 360)));
  const endpoints = [...requestTelemetry.endpoints.values()]
    .map((entry) => ({ ...entry, averageDurationMs: entry.requests ? entry.durationMs / entry.requests : 0, errorRate: entry.requests ? entry.errors / entry.requests : 0 }))
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 30);
  return {
    generatedAt: new Date().toISOString(),
    sampleIntervalSeconds: 5,
    status: sample.eventLoopP95 > 150 || sample.cpuProcess > 90 || memory.heapUsed / Math.max(1, heap.heap_size_limit) > .9 ? "warning" : "healthy",
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      environment: NODE_ENV,
      uptimeSeconds: process.uptime(),
      startedAt: new Date(serverStartedAt).toISOString(),
      cpuPercent: sample.cpuProcess,
      eventLoopUtilization: sample.eventLoopUtilization,
      memory: { ...memory, heapLimit: heap.heap_size_limit, heapAvailable: heap.total_available_size }
    },
    system: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      architecture: os.arch(),
      cpuModel: os.cpus()[0]?.model ?? "Inconnu",
      cpuCount: os.cpus().length,
      cpuPercent: sample.cpuSystem,
      uptimeSeconds: os.uptime(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      loadAverage: os.loadavg()
    },
    eventLoop: { meanMs: sample.eventLoopMean, p95Ms: sample.eventLoopP95, maxMs: sample.eventLoopMax },
    traffic: {
      activeRequests: Math.max(0, requestTelemetry.active - 1),
      totalRequests: requestTelemetry.total,
      totalErrors: requestTelemetry.errors,
      requestsPerSecond: sample.requestsPerSecond,
      averageDurationMs: sample.requestLatencyAverage,
      maxDurationMs: sample.requestLatencyMax,
      endpoints
    },
    realtime: {
      sockets: sample.sockets,
      watchedConnections: sample.watchedConnections,
      guestSessions: sessions.size,
      activeRooms: sample.activeRooms,
      playingRooms: sample.playingRooms,
      waitingRooms: sample.waitingRooms,
      seatedHumans: sample.seatedHumans,
      seatedBots: sample.seatedBots,
      pendingBotTimers: battleBotTimers.size
    },
    database,
    history: serverHealthHistory.slice(-points)
  };
}

collectServerHealthSample();
setInterval(collectServerHealthSample, 5000).unref();

const STATUS_PROBE_INTERVAL_MS = Math.max(30000, Number(process.env.STATUS_PROBE_INTERVAL_MS) || 60000);
let statusProbeRunning = false;
let lastEmailProbeAt = 0;
let cachedEmailProbe = { configured: emailDeliveryConfigured(), ok: false };
let lastStatusPruneAt = 0;

function publicWebsiteUrl() {
  const configured = String(process.env.PUBLIC_APP_URL ?? "").trim();
  if (configured) return configured;
  const origin = String(CLIENT_ORIGIN).split(",")[0].trim();
  return `${origin.replace(/\/$/, "")}${APP_BASE_PATH || "/"}`;
}

async function websiteStatusProbe() {
  const startedAt = performance.now();
  try {
    const response = await fetch(publicWebsiteUrl(), { method: "GET", redirect: "follow", signal: AbortSignal.timeout(5000) });
    await response.body?.cancel().catch(() => {});
    const latencyMs = performance.now() - startedAt;
    if (!response.ok) return { id: "website", status: response.status >= 500 ? "outage" : "degraded", latencyMs, message: "Le site public répond avec une erreur." };
    return { id: "website", status: latencyMs > 2000 ? "degraded" : "operational", latencyMs, message: latencyMs > 2000 ? "Le chargement du site public est ralenti." : "Le site public répond normalement." };
  } catch {
    return { id: "website", status: "outage", latencyMs: performance.now() - startedAt, message: "Le site public ne répond pas à la sonde." };
  }
}

function apiStatusProbe() {
  const rows = serverHealthHistory.slice(-12).filter((row) => Date.parse(row.at) - serverStartedAt >= 30000);
  const latest = rows.at(-1) ?? latestServerHealth ?? {};
  const p95 = Math.max(0, ...rows.map((row) => Number(row.eventLoopP95) || 0));
  const latency = rows.length ? rows.reduce((sum, row) => sum + (Number(row.requestLatencyAverage) || 0), 0) / rows.length : 0;
  const errors = rows.reduce((sum, row) => sum + (Number(row.requestErrors) || 0), 0);
  const warmingUp = !rows.length;
  const outage = !server.listening;
  const degraded = errors >= 5 || (!warmingUp && (p95 > 150 || latency > 750 || Number(latest.cpuProcess) > 90 || Number(latest.eventLoopUtilization) > 99));
  return { id: "api", status: outage ? "outage" : degraded ? "degraded" : "operational", latencyMs: latency, message: outage ? "L’API ne traite plus les requêtes dans des délais acceptables." : degraded ? "L’API connaît des ralentissements ou des erreurs." : "L’API répond normalement." };
}

function realtimeStatusProbe() {
  const errors = socketConnectionErrors;
  socketConnectionErrors = 0;
  if (!server.listening || !io.engine) return { id: "realtime", status: "outage", message: "Le service temps réel est indisponible." };
  return { id: "realtime", status: errors >= 10 ? "degraded" : "operational", message: errors >= 10 ? "Un nombre inhabituel de connexions temps réel a échoué." : "Le service temps réel est opérationnel." };
}

function gamesStatusProbe() {
  const startedAt = performance.now();
  try {
    const players = [{ id: "status-player-1", pseudo: "Sonde 1" }, { id: "status-player-2", pseudo: "Sonde 2" }];
    const state = createGameState("421", players);
    if (state.gameId !== "421" || state.players?.length !== 2) throw new Error("Invalid canary state");
    const latencyMs = performance.now() - startedAt;
    return { id: "games", status: latencyMs > 250 ? "degraded" : "operational", latencyMs, message: latencyMs > 250 ? "L’initialisation des parties est ralentie." : "Le moteur de jeu répond normalement." };
  } catch {
    return { id: "games", status: "outage", latencyMs: performance.now() - startedAt, message: "Le moteur de jeu ne parvient pas à initialiser une partie." };
  }
}

function databaseStatusProbe() {
  const startedAt = performance.now();
  try {
    const health = currentDatabaseHealth(true);
    const latencyMs = performance.now() - startedAt;
    const oversizedWal = health.walBytes > Math.max(64 * 1024 * 1024, health.fileBytes * 2);
    const degraded = latencyMs > 500 || health.fragmentationRatio > .35 || oversizedWal;
    return { id: "database", status: degraded ? "degraded" : "operational", latencyMs, message: degraded ? "Le stockage nécessite une surveillance." : "Le stockage répond normalement." };
  } catch {
    return { id: "database", status: "outage", latencyMs: performance.now() - startedAt, message: "Le stockage ne répond pas à la sonde." };
  }
}

async function emailStatusProbe(timestamp = Date.now()) {
  if (timestamp - lastEmailProbeAt >= 15 * 60 * 1000 || !lastEmailProbeAt) {
    cachedEmailProbe = await verifyEmailDelivery();
    lastEmailProbeAt = timestamp;
  }
  if (!cachedEmailProbe.configured) return { id: "email", status: "unknown", message: "Le service email n’est pas activé." };
  return { id: "email", status: cachedEmailProbe.ok ? "operational" : "outage", message: cachedEmailProbe.ok ? "Le serveur email accepte les connexions." : "Le serveur email ne répond pas à la sonde." };
}

async function collectPublicStatus() {
  if (statusProbeRunning) return;
  statusProbeRunning = true;
  const timestamp = Date.now();
  try {
    const [website, email] = await Promise.all([websiteStatusProbe(), emailStatusProbe(timestamp)]);
    statusMonitor.recordSnapshot([website, apiStatusProbe(), realtimeStatusProbe(), gamesStatusProbe(), databaseStatusProbe(), email], timestamp);
    if (timestamp - lastStatusPruneAt > 24 * 60 * 60 * 1000) {
      statusMonitor.prune(timestamp);
      lastStatusPruneAt = timestamp;
    }
  } catch (error) {
    requestLogs.append({ category: "status", level: "error", method: "SYSTEM", route: "status/probe", message: `Échec de la collecte de statut: ${error instanceof Error ? error.message : String(error)}` });
  } finally {
    statusProbeRunning = false;
  }
}

function makeToken(user) {
  return jwt.sign({ id: user.id, guest: user.guest, sessionVersion: Math.max(0, Number(user.sessionVersion) || 0) }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function normalizePublicProfile(profile = {}, fallbackName = "") {
  const birthDate = String(profile.birthDate ?? "").slice(0, 10);
  return {
    displayName: String(profile.displayName ?? fallbackName ?? "").slice(0, 32),
    birthDate: /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? birthDate : "",
    gender: String(profile.gender ?? "").slice(0, 32),
    bio: normalizePlainText(profile.bio, 180),
    favoriteGames: Array.isArray(profile.favoriteGames) ? [...new Set(profile.favoriteGames.map(String))].slice(0, 5) : []
  };
}

function normalizePlainText(value, maxLength = 180) {
  return String(value ?? "").replace(/<[^>]*>/g, "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n").slice(0, maxLength);
}

function ageFromBirthDate(birthDate) {
  if (!birthDate) return "";
  const born = new Date(`${birthDate}T00:00:00.000Z`);
  if (Number.isNaN(born.getTime())) return "";
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < born.getUTCMonth() || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age <= 120 ? age : "";
}

function ensureUserSocial(user) {
  user.profile = normalizePublicProfile(user.profile, user.pseudo);
  user.friends = Array.isArray(user.friends) ? [...new Set(user.friends)] : [];
  user.friendRequests = {
    incoming: Array.isArray(user.friendRequests?.incoming) ? [...new Set(user.friendRequests.incoming)] : [],
    outgoing: Array.isArray(user.friendRequests?.outgoing) ? [...new Set(user.friendRequests.outgoing)] : []
  };
  user.roomInvites = Array.isArray(user.roomInvites) ? user.roomInvites : [];
  user.notifications = Array.isArray(user.notifications) ? user.notifications : [];
  return user;
}

function pushNotification(user, notification) {
  ensureUserSocial(user);
  user.notifications.unshift({
    id: randomUUID(),
    type: notification.type ?? "info",
    title: notification.title ?? "Notification",
    message: notification.message ?? "",
    actorId: notification.actorId ?? "",
    roomCode: notification.roomCode ?? "",
    createdAt: new Date().toISOString()
  });
  user.notifications = user.notifications.slice(0, 100);
  return user.notifications[0];
}

function sanitizeNotification(notification, user = null) {
  const roomInvite = notification.type === "room-invite"
    ? user?.roomInvites?.find((invite) => invite.code === notification.roomCode && (!notification.actorId || invite.fromId === notification.actorId))
    : null;
  let title = notification.title ?? "Notification";
  let message = notification.message ?? "";
  if (notification.type === "room-invite") {
    title = "Invitation à une table";
    message = message.replace(" t'invite sur ", " t'invite à la table ");
  }
  if (notification.type === "achievement" && title === "Succès débloqué") {
    const [achievementTitle, ...descriptionParts] = message.split(" · ");
    const entry = achievementCatalog().find((achievement) => achievement.title === achievementTitle);
    title = `${entry?.group ?? "Casino"} - ${achievementTitle}`;
    message = descriptionParts.join(" · ") || entry?.description || "";
  }
  return {
    id: notification.id,
    type: notification.type ?? "info",
    title,
    message,
    actorId: notification.actorId ?? "",
    roomCode: notification.roomCode ?? "",
    inviteId: roomInvite?.id ?? "",
    createdAt: notification.createdAt
  };
}

function removeFriendRequestBetween(user, otherId) {
  ensureUserSocial(user);
  user.friendRequests.incoming = user.friendRequests.incoming.filter((id) => id !== otherId);
  user.friendRequests.outgoing = user.friendRequests.outgoing.filter((id) => id !== otherId);
}

function addFriendship(user, friend) {
  ensureUserSocial(user);
  ensureUserSocial(friend);
  user.friends = [...new Set([...user.friends, friend.id])];
  friend.friends = [...new Set([...friend.friends, user.id])];
  removeFriendRequestBetween(user, friend.id);
  removeFriendRequestBetween(friend, user.id);
}

function normalizeFriendGraph(db) {
  const usersById = new Map(db.users.map((user) => [user.id, ensureUserSocial(user)]));
  const existingUserIds = new Set(usersById.keys());
  for (const user of db.users) {
    user.friends = user.friends.filter((id) => existingUserIds.has(id) && id !== user.id);
    user.friendRequests.incoming = user.friendRequests.incoming.filter((id) => existingUserIds.has(id) && id !== user.id);
    user.friendRequests.outgoing = user.friendRequests.outgoing.filter((id) => existingUserIds.has(id) && id !== user.id);
  }
  for (const user of db.users) {
    for (const otherId of [...user.friendRequests.outgoing]) {
      const other = usersById.get(otherId);
      if (!other) continue;
      if (other.friendRequests.outgoing.includes(user.id) || user.friendRequests.incoming.includes(other.id)) addFriendship(user, other);
      else if (!other.friendRequests.incoming.includes(user.id)) other.friendRequests.incoming.push(user.id);
    }
    for (const otherId of [...user.friendRequests.incoming]) {
      const other = usersById.get(otherId);
      if (!other) continue;
      if (!other.friendRequests.outgoing.includes(user.id)) user.friendRequests.incoming = user.friendRequests.incoming.filter((id) => id !== otherId);
    }
  }
}

function displayNameFor(user) {
  return normalizePublicProfile(user.profile, user.pseudo).displayName || user.pseudo;
}

function friendCodeFor(user) {
  return String(user?.id ?? "").replace(/-/g, "").slice(0, 8).toUpperCase();
}

function maskedEmail(value) {
  const [local = "", domain = ""] = normalizeEmail(value).split("@");
  if (!domain) return "";
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, Math.min(6, local.length - 2)))}@${domain}`;
}

function publicProfileFor(user) {
  const profile = normalizePublicProfile(user.profile, user.pseudo);
  const { birthDate: _birthDate, ...publicProfile } = profile;
  return publicProfile;
}

function sanitizeUser(user, db = readDb()) {
  ensureUserSocial(user);
  const verificationRequired = platformSettings(db).emailVerificationRequired;
  const settings = platformSettings(db);
  const moderation = activeModeration(user);
  const parentalRevocation = activeParentalRevocation(user);
  return { id: user.id, login: user.email ?? user.pseudo, email: user.email ?? "", emailVerified: Boolean(user.emailVerifiedAt), requiresEmailUpgrade: !user.guest && !validEmail(user.email), requiresEmailVerification: !user.guest && verificationRequired && validEmail(user.email) && !user.emailVerifiedAt, pseudo: displayNameFor(user), friendCode: friendCodeFor(user), tokens: user.tokens, guest: Boolean(user.guest), admin: Boolean(user.admin), editor: Boolean(user.editor), active: user.active !== false, lastDailyClaim: user.lastDailyClaim, dailyBonus: dailyBonusStatus(user, db), cosmetics: normalizeCosmetics(user.cosmetics), achievements: normalizeAchievements(user.achievements), profileStats: normalizeProfileStats(user.profileStats), profile: user.profile, friendCount: user.friends.length, minor: isUnder13(user) ? { restricted: true, restrictions: settings.minorRestrictions, turnsThirteenAt: turnsThirteenAt(user.profile?.birthDate) } : null, moderation: moderation ? { type: moderation.type, reason: moderation.reason ?? "", endsAt: moderation.endsAt ?? "" } : null, parentalRevocation: parentalRevocation ? { reason: parentalRevocation.reason ?? "", endsAt: parentalRevocation.revokedUntil } : null };
}

function roomPlayerFor(user) {
  const cosmetics = normalizeCosmetics(user.cosmetics);
  return {
    id: user.id,
    pseudo: displayNameFor(user),
    tokens: Math.max(0, Number(user.tokens) || 0),
    guest: Boolean(user.guest),
    cosmetics: { equipped: cosmetics.equipped }
  };
}

function sanitizeFriendUser(user, db) {
  ensureUserSocial(user);
  refreshPublicProfileStats(user, db);
  return { id: user.id, pseudo: displayNameFor(user), friendCode: friendCodeFor(user), age: ageFromBirthDate(user.profile.birthDate), cosmetics: normalizeCosmetics(user.cosmetics), profileStats: normalizeProfileStats(user.profileStats), profile: publicProfileFor(user) };
}

function publicUserPayload(user, db, viewerId = "") {
  ensureUserSocial(user);
  refreshPublicProfileStats(user, db);
  const statistics = playerStatistics(db, user.id);
  const wins = statistics.wins;
  const achievements = achievementStatus(user, db);
  const viewer = db.users.find((row) => row.id === viewerId);
  if (viewer) ensureUserSocial(viewer);
  const firstDayKey = shiftDateKey(casinoDateKey(), -364);
  const activityMap = new Map(Object.entries(statistics.activity));
  const activity = [];
  for (let i = 0; i < 365; i += 1) {
    const key = shiftDateKey(firstDayKey, i);
    activity.push({ date: key, count: activityMap.get(key) ?? 0 });
  }
  return {
    id: user.id,
    pseudo: displayNameFor(user),
    friendCode: friendCodeFor(user),
    cosmetics: normalizeCosmetics(user.cosmetics),
    profileStats: normalizeProfileStats(user.profileStats),
    profile: publicProfileFor(user),
    age: ageFromBirthDate(user.profile.birthDate),
    friendCount: user.friends.length,
    relationship: {
      self: viewerId === user.id,
      isFriend: viewer?.friends?.includes(user.id) ?? false,
      requested: viewer?.friendRequests?.outgoing?.includes(user.id) ?? false,
      incoming: viewer?.friendRequests?.incoming?.includes(user.id) ?? false
    },
    stats: {
      gamesPlayed: statistics.gamesPlayed,
      wins,
      winRate: statistics.gamesPlayed ? Math.round((wins / statistics.gamesPlayed) * 100) : 0,
      achievementsUnlocked: achievements.filter((achievement) => achievement.unlocked).length,
      achievementsTotal: achievements.length
    },
    activity
  };
}

function sanitizeRoom(room, viewerId = "", db = readDb(), forceSpectator = false) {
  if (!room) return room;
  const { passwordHash: _passwordHash, ...safeRoom } = room;
  const spectating = forceSpectator || !room.players.some((player) => player.id === viewerId);
  const sanitizedPlayers = new Map();
  const sanitizeRoomPlayer = (player) => {
    if (sanitizedPlayers.has(player.id)) return sanitizedPlayers.get(player.id);
    if (player.isBot) {
      sanitizedPlayers.set(player.id, player);
      return player;
    }
    const fullUser = db.users.find((u) => u.id === player.id);
    const sanitized = !fullUser
      ? { ...player, profile: publicProfileFor(player), profileStats: normalizeProfileStats(player.profileStats) }
      : { ...player, login: fullUser.pseudo, pseudo: displayNameFor(fullUser), age: ageFromBirthDate(fullUser.profile?.birthDate), cosmetics: normalizeCosmetics(fullUser.cosmetics), profileStats: normalizeProfileStats(fullUser.profileStats), profile: publicProfileFor(fullUser) };
    sanitizedPlayers.set(player.id, sanitized);
    return sanitized;
  };
  let safeState = safeRoom.state ? { ...safeRoom.state, players: (safeRoom.state.players ?? []).map(sanitizeRoomPlayer) } : safeRoom.state;
  if (safeState?.gameId === "belote") safeState = publicBeloteState(safeState, viewerId);
  if (safeState?.gameId === "bataille") {
    safeState.deckOverview = safeState.modifiers?.hiddenDeck || !safeState.players.some((player) => player.id === viewerId) ? null : battleDeckOverview(safeState, viewerId);
    safeState.piles = Object.fromEntries(Object.entries(safeState.piles ?? {}).map(([playerId, pile]) => [playerId, Array(pile.length).fill(null)]));
    safeState.drawnCards = Object.fromEntries(Object.entries(safeState.drawnCards ?? {}).map(([playerId, card]) => [playerId, playerId === viewerId ? { ...card } : { hidden: true }]));
    safeState.battleLanes = (safeState.battleLanes ?? []).map((lane) => {
      return { ...lane, cards: lane.cards.map((card) => card.revealedToAll ? { rank: card.rank, suit: card.suit, ownerId: card.ownerId, placedRound: card.placedRound, revealedToAll: true } : { ownerId: card.ownerId, placedRound: card.placedRound, hidden: true }) };
    });
    delete safeState.pendingChoices;
    delete safeState.pendingTransfers;
    delete safeState.deckKnowledge;
  }
  if (safeState?.gameId === "president") {
    safeState.hands = Object.fromEntries(Object.entries(safeState.hands ?? {}).map(([playerId, hand]) => [playerId, playerId === viewerId ? hand.map((card) => ({ ...card })) : Array(hand.length).fill(null)]));
  }
  if (safeState?.gameId === "texas-holdem") {
    const shownPlayerIds = new Set(safeState.shownPlayerIds ?? []);
    safeState.hands = Object.fromEntries(Object.entries(safeState.hands ?? {}).map(([playerId, hand]) => [playerId, playerId === viewerId || shownPlayerIds.has(playerId) ? hand.map((card) => ({ ...card })) : Array(hand.length).fill(null)]));
    const ownCards = safeRoom.state?.hands?.[viewerId] ?? [];
    safeState.handPreview = ownCards.length ? pokerHandPreview([...ownCards, ...(safeState.community ?? [])]) : null;
    safeState.handRanks = Object.fromEntries(Object.entries(safeState.handRanks ?? {}).filter(([playerId]) => Boolean(safeState.nextHandAt) || playerId === viewerId || shownPlayerIds.has(playerId)));
    safeState.handLabels = Object.fromEntries(Object.entries(safeState.handRanks).map(([playerId, rank]) => [playerId, pokerHandLabel(rank)]));
  }
  if (safeState?.gameId === "liars-dice") {
    safeState.hands = Object.fromEntries(Object.entries(safeState.hands ?? {}).map(([playerId, hand]) => [playerId, playerId === viewerId ? [...hand] : Array(hand.length).fill(null)]));
  }
  if (safeState?.gameId === "midnight-dice") {
    safeState.secretContracts = Object.fromEntries(safeState.players.map((player) => [player.id, player.id === viewerId ? safeState.secretContracts?.[player.id] ?? null : null]));
    safeState.usedContracts = Object.fromEntries(safeState.players.map((player) => [player.id, player.id === viewerId ? [...(safeState.usedContracts?.[player.id] ?? [])] : []]));
  }
  if (safeState?.gameId === "velvet-ruse") {
    safeState.deck = Array(safeState.deck?.length ?? 0).fill(null);
    safeState.hands = Object.fromEntries(Object.entries(safeState.hands ?? {}).map(([playerId, hand]) => [playerId, playerId === viewerId ? hand.map((card) => ({ ...card })) : Array(hand.length).fill(null)]));
    safeState.dossier = (safeState.dossier ?? []).map(({ actual: _actual, ...entry }) => ({ ...entry }));
    if (safeState.pendingClaim) {
      const { actual: _actual, ...pendingClaim } = safeState.pendingClaim;
      safeState.pendingClaim = pendingClaim;
    }
  }
  const game = configuredGames(db).find((entry) => entry.id === room.gameId);
  if (spectating && room.state) safeState = spectatorState({ ...room.state, players: (room.state.players ?? []).map(sanitizeRoomPlayer) });
  if (!room.state) safeState = null;
  return {
    ...(spectating ? { id: room.id, code: room.code, name: room.name, gameId: room.gameId, ownerId: room.ownerId, isPublic: room.isPublic, finished: room.finished, stake: room.stake, pacing: room.pacing ?? null } : safeRoom),
    players: safeRoom.players.map(sanitizeRoomPlayer),
    state: safeState,
    spectator: spectating,
    ...(room.gameId === "belote" ? { beloteSeats: beloteSeats(room) } : {}),
    minPlayers: game?.minPlayers ?? 1,
    maxPlayers: game?.maxPlayers ?? safeRoom.players.length,
    hasPassword: Boolean(room.passwordHash)
  };
}

function sanitizeLobbyRoom(room) {
  return {
    id: room.id,
    code: room.code,
    gameId: room.gameId,
    name: room.name,
    stake: room.stake,
    isPublic: room.isPublic,
    hasPassword: Boolean(room.passwordHash),
    inProgress: Boolean(room.state && !room.finished),
    players: (room.players ?? []).map((player) => ({ id: player.id, isBot: Boolean(player.isBot) }))
  };
}

function sanitizeRooms(rooms) {
  return rooms.map(sanitizeLobbyRoom);
}

function emitRoomUpdate(room, db = readDb()) {
  for (const socketId of roomPresence.get(room.id) ?? []) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket) socket.emit("room", sanitizeRoom(room, socket.data.userId, db, socket.data.spectator === true));
  }
}

function normalizeCosmetics(cosmetics = {}) {
  return {
    icons: [...new Set([...(cosmetics.icons ?? []), ...defaultCosmetics.icons])],
    nameEffects: [...new Set([...(cosmetics.nameEffects ?? []), ...defaultCosmetics.nameEffects])],
    memberCards: [...new Set([...(cosmetics.memberCards ?? []), ...defaultCosmetics.memberCards])],
    profileBanners: [...new Set([...(cosmetics.profileBanners ?? []), ...defaultCosmetics.profileBanners])],
    profileFrames: [...new Set([...(cosmetics.profileFrames ?? []), ...defaultCosmetics.profileFrames])],
    profileEffects: [...new Set([...(cosmetics.profileEffects ?? []), ...defaultCosmetics.profileEffects])],
    diceSkins: [...new Set([...(cosmetics.diceSkins ?? []), ...defaultCosmetics.diceSkins])],
    cardSkins: [...new Set([...(cosmetics.cardSkins ?? []), ...defaultCosmetics.cardSkins])],
    equipped: { ...defaultCosmetics.equipped, ...(cosmetics.equipped ?? {}) }
  };
}

function normalizeAchievements(achievements = {}) {
  return {
    unlocked: [...new Set(achievements.unlocked ?? [])],
    unlockedAt: achievements.unlockedAt ?? {},
    suppressed: [...new Set(achievements.suppressed ?? [])]
  };
}

function ensureUserAchievements(user) {
  user.achievements = normalizeAchievements(user.achievements);
  return user.achievements;
}

function refreshPublicProfileStats(user, db) {
  if (!user) return user;
  user.profileStats = normalizeProfileStats(user.profileStats);
  user.profileStats.publicStats = publicMemberStats(user, db);
  return user;
}

function normalizeProfileStats(profileStats = {}) {
  const legacyCustomId = profileStats.customAchievementId ?? "";
  const defaultVisibleProfileStats = ["age", "gender", "friends", "gamesPlayed", "wins", "winRate", "achievements"];
  return {
    memberCardStats: (Array.isArray(profileStats.memberCardStats) && profileStats.memberCardStats.length ? profileStats.memberCardStats.slice(0, 2) : [profileStats.memberCardStat ?? "winRate", "achievementsUnlocked"]).map((stat) => stat === "overallWinRate" ? "winRate" : stat),
    customAchievementId: legacyCustomId,
    customAchievementIds: Array.isArray(profileStats.customAchievementIds)
      ? [profileStats.customAchievementIds[0] ?? "", profileStats.customAchievementIds[1] ?? ""]
      : [legacyCustomId, ""],
    visibleProfileStats: Array.isArray(profileStats.visibleProfileStats)
      ? profileStats.visibleProfileStats.filter((key) => defaultVisibleProfileStats.includes(key))
      : defaultVisibleProfileStats,
    publicStats: Array.isArray(profileStats.publicStats) ? profileStats.publicStats.slice(0, 2) : []
  };
}

function publicMemberStats(user, db) {
  const status = achievementStatus(user, db);
  const statistics = playerStatistics(db, user.id);
  const wins = statistics.wins;
  const today = casinoDateKey();
  const todayGames = statistics.activity[today] ?? 0;
  const unlocked = status.filter((achievement) => achievement.unlocked);
  const ratio = statistics.gamesPlayed ? `${Math.round((wins / statistics.gamesPlayed) * 100)}%` : "0%";
  const profileStats = normalizeProfileStats(user.profileStats);
  return profileStats.memberCardStats.map((stat, index) => {
    if (stat === "hidden") return null;
    if (stat === "todayGames") return { key: stat, label: "Aujourd'hui", value: todayGames.toLocaleString("fr-BE") };
    if (stat === "achievementsUnlocked") return { key: stat, label: "Succès", value: `${unlocked.length}/${status.length}` };
    if (stat === "customAchievement") {
      const custom = status.find((achievement) => achievement.id === (profileStats.customAchievementIds[index] || profileStats.customAchievementId));
      return { key: stat, label: "Milestone", value: custom?.title ?? "Aucun" };
    }
    return { key: stat, label: "Winrate", value: ratio };
  }).filter(Boolean).slice(0, 2);
}

function enrichHistoryRow(row, db, userId) {
  const players = (row.players ?? []).map((player) => {
    if (player.isBot) return { ...player, profileStats: normalizeProfileStats(player.profileStats), profile: publicProfileFor(player) };
    const found = db.users.find((u) => u.id === player.id) ?? sessions.get(player.id);
    if (!found) return { ...player, cosmetics: normalizeCosmetics(player.cosmetics), profileStats: normalizeProfileStats(player.profileStats), profile: publicProfileFor(player) };
    refreshPublicProfileStats(found, db);
    return {
      ...player,
      login: found.pseudo,
      pseudo: displayNameFor(found),
      cosmetics: normalizeCosmetics(found.cosmetics),
      profileStats: normalizeProfileStats(found.profileStats),
      age: ageFromBirthDate(found.profile?.birthDate),
      profile: publicProfileFor(found)
    };
  });
  const playerGain = Number(row.payouts?.[userId] ?? 0) + Number(row.blackjackPayouts?.[userId] ?? 0);
  return { ...row, players, winners: row.winners ?? [], playerGain };
}

function titleWithNumber(prefix, value) {
  return `${prefix} ${value.toLocaleString("fr-FR")}`;
}

function builtInAchievementRule(entry) {
  const metric = (name) => ({ source: "metric", metric: name });
  if (entry.id.startsWith("classic-games-")) return metric("gamesPlayed");
  if (entry.id.startsWith("classic-wins-")) return metric("wins");
  if (entry.id.startsWith("classic-staked-")) return metric("staked");
  if (entry.id.startsWith("classic-daily-streak-")) return metric("dailyStreak");
  if (entry.id.startsWith("classic-daily-")) return metric("dailyClaims");
  if (entry.id.startsWith("game-") && entry.id.includes("-wins-")) return metric(`gameWins.${entry.gameId}`);
  if (entry.id === "shop-first-purchase") return metric("shopPurchases");
  if (["shop-collector-10", "shop-collector-25"].includes(entry.id)) return metric("cosmeticCount");
  if (entry.id === "shop-fashionista") return metric("cosmeticTypes");
  if (entry.id === "shop-big-spender") return metric("shopSpent");
  if (entry.id === "midnight-all-contracts") return metric("midnightContractsCompleted");
  if (entry.id === "achievement-collector-50") return metric("achievementsUnlocked");
  if (entry.id === achievementCompletionId) return metric("visibleAchievementsUnlocked");
  if (entry.id === "random-miracle") return { source: "event", event: "site.random", scope: "event", aggregate: "match", condition: { all: [{ field: "roll", operator: "eq", value: 1 }, { field: "maximum", operator: "eq", value: 100000 }] } };
  if (entry.id === "secret-42") return { source: "event", event: "site.visit", scope: "event", aggregate: "match", condition: { field: "markers", operator: "contains", value: "secret:answer-42" } };
  const browser = { "secret-firefox": "firefox", "secret-edge": "edge", "secret-chrome": "chrome" }[entry.id];
  if (browser) return { source: "event", event: "account.browser", scope: "event", aggregate: "match", condition: { field: "browser", operator: "eq", value: browser } };
  if (entry.id === "secret-small-rock") return { source: "event", event: "account.browser", scope: "event", aggregate: "match", condition: { field: "browser", operator: "eq", value: "small-rock" } };
  return {
    source: "event",
    event: "game.finished",
    gameId: entry.gameId,
    scope: "event",
    aggregate: "match",
    condition: { field: "signals", operator: "contains", value: entry.id },
    legacyResultId: entry.id
  };
}

function baseAchievementCatalog() {
  const staticEntries = [
    ...achievementThresholds.gamesPlayed.map((value) => ({ id: `classic-games-${value}`, type: "site", group: "Classique", title: titleWithNumber("Parties jouées", value), description: `Terminer ${value.toLocaleString("fr-FR")} partie(s).`, target: value })),
    ...achievementThresholds.wins.map((value) => ({ id: `classic-wins-${value}`, type: "site", group: "Classique", title: titleWithNumber("Victoires", value), description: `Gagner ${value.toLocaleString("fr-FR")} partie(s).`, target: value })),
    ...achievementThresholds.staked.map((value) => ({ id: `classic-staked-${value}`, type: "site", group: "Jetons", title: titleWithNumber("Mises cumulées", value), description: `Miser ${value.toLocaleString("fr-FR")} jetons au total.`, target: value })),
    ...achievementThresholds.dailyClaims.map((value) => ({ id: `classic-daily-${value}`, type: "site", group: "Bonus", title: titleWithNumber("Bonus récupérés", value), description: `Récupérer ${value.toLocaleString("fr-FR")} bonus journalier(s).`, target: value })),
    ...achievementThresholds.dailyStreak.map((value) => ({ id: `classic-daily-streak-${value}`, type: "site", milestone: value >= 30, group: "Bonus", title: `${value} jours d'affilée`, description: `Récupérer le bonus journalier ${value} jours d'affilée.`, target: value })),
    ...games.flatMap((game) => achievementThresholds.gameWins.map((value) => ({ id: `game-${game.id}-wins-${value}`, type: "games", milestone: value >= 500, gameId: game.id, group: game.name, title: `${value.toLocaleString("fr-FR")} victoire${value > 1 ? "s" : ""}`, description: `Gagner ${value.toLocaleString("fr-FR")} partie(s) de ${game.name}.`, target: value })))
  ];
  const withoutCompletion = [...staticEntries, ...resultAchievementCatalog, ...achievementCollectionCatalog];
  const visibleTarget = withoutCompletion.filter((entry) => !entry.secret).length;
  const catalog = [...withoutCompletion, { id: achievementCompletionId, type: "site", milestone: true, group: "Jeux", title: "Grand chelem", description: "Débloquer 100 % des succès non cachés.", target: visibleTarget }];
  const gamePrefixes = [["yahtzee-", "yahtzee"], ["421-", "421"], ["cul-", "cul-de-chouette"], ["blackjack-", "blackjack"], ["bataille-", "bataille"], ["president-", "president"], ["farkle-", "farkle"], ["liars-", "liars-dice"], ["shut-", "shut-the-box"], ["golf-", "golf-solitaire"], ["accordion-", "accordion"], ["midnight-", "midnight-dice"], ["velvet-", "velvet-ruse"]];
  return catalog.map((entry) => {
    const gameId = entry.gameId ?? gamePrefixes.find(([prefix]) => entry.id.startsWith(prefix))?.[1] ?? null;
    const secret = entry.secret === true;
    const milestone = secret || entry.milestone === true;
    const categories = [...new Set([entry.group, entry.type === "games" || gameId ? "Jeux" : "Progression", entry.group === "Boutique" ? "Boutique" : null, secret ? "Secrets" : null, milestone ? "Milestones" : null, gameId ? games.find((game) => game.id === gameId)?.name : null].filter(Boolean))];
    const normalized = { ...entry, ...(gameId ? { gameId } : {}), secret, milestone, enabled: true, builtIn: true, categories };
    return { ...normalized, rule: builtInAchievementRule(normalized) };
  });
}

function achievementCatalog(db = readDb(), { includeDisabled = false } = {}) {
  const overrides = db.settings?.achievementOverrides ?? {};
  const builtIn = baseAchievementCatalog().map((entry) => ({ ...entry, ...(overrides[entry.id] ?? {}), id: entry.id, builtIn: true }));
  const custom = (db.settings?.customAchievements ?? []).map((entry) => ({ ...entry, builtIn: false, categories: [...new Set([entry.group, entry.type === "games" || entry.gameId ? "Jeux" : "Progression", entry.secret ? "Secrets" : null, entry.milestone || entry.secret ? "Milestones" : null].filter(Boolean))] }));
  const catalog = [...builtIn, ...custom].filter((entry) => includeDisabled || entry.enabled !== false);
  const completion = catalog.find((entry) => entry.id === achievementCompletionId);
  if (completion) completion.target = catalog.filter((entry) => entry.id !== achievementCompletionId && !entry.secret && entry.enabled !== false).length;
  return catalog;
}

function dailyBonusStatus(user, db) {
  const settings = platformSettings(db);
  const baseTokens = settings.dailyTokens;
  if (!user || user.guest) return { claims: 0, streak: 0, multiplier: 1, nextMultiplier: 1, nextReward: baseTokens, claimedToday: false };
  return calculateDailyBonusStatus(playerStatistics(db, user.id).claimDates, baseTokens, new Date(), {
    defaultMultiplier: settings.dailyBonusDefaultMultiplier,
    maxMultiplier: settings.dailyBonusMaxMultiplier,
    rules: settings.dailyBonusRules
  });
}

function longestDateStreak(dates) {
  let best = 0;
  let current = 0;
  let previous = null;
  for (const date of dates) {
    const time = new Date(`${date}T00:00:00.000Z`).getTime();
    if (previous === null || time - previous === 86400000) current += 1;
    else current = 1;
    best = Math.max(best, current);
    previous = time;
  }
  return best;
}

function cosmeticCount(user) {
  const cosmetics = normalizeCosmetics(user.cosmetics);
  return shopTypes.reduce((sum, key) => sum + cosmetics[key].length, 0);
}

function userAchievementProgress(user, db) {
  const statistics = playerStatistics(db, user.id);
  const { staked, shopSpent, claimDates: dates, resultIds } = statistics;
  const progress = {};
  for (const value of achievementThresholds.gamesPlayed) progress[`classic-games-${value}`] = statistics.gamesPlayed;
  for (const value of achievementThresholds.wins) progress[`classic-wins-${value}`] = statistics.wins;
  for (const value of achievementThresholds.staked) progress[`classic-staked-${value}`] = staked;
  for (const value of achievementThresholds.dailyClaims) progress[`classic-daily-${value}`] = dates.length;
  for (const value of achievementThresholds.dailyStreak) progress[`classic-daily-streak-${value}`] = longestDateStreak(dates);
  for (const game of games) {
    const gameWins = statistics.gameWins[game.id] ?? 0;
    for (const value of achievementThresholds.gameWins) progress[`game-${game.id}-wins-${value}`] = gameWins;
  }
  progress["shop-first-purchase"] = statistics.shopPurchases ? 1 : 0;
  progress["shop-collector-10"] = cosmeticCount(user);
  progress["shop-collector-25"] = cosmeticCount(user);
  progress["shop-fashionista"] = ["icons", "nameEffects", "memberCards", "diceSkins", "cardSkins"].filter((key) => normalizeCosmetics(user.cosmetics)[key].length > 1).length;
  progress["shop-big-spender"] = shopSpent;
  for (const id of resultIds) progress[id] = 1;
  progress["midnight-all-contracts"] = completedMidnightContractCount(resultIds);
  const metricValues = {
    ...Object.fromEntries(Object.keys(tableTimeMetrics).map((key) => [key, Number(user.siteActivity?.[key]) || 0])),
    ...playerAchievementContext(user, []),
    gamesPlayed: statistics.gamesPlayed,
    wins: statistics.wins,
    staked,
    dailyClaims: dates.length,
    dailyStreak: longestDateStreak(dates),
    shopPurchases: statistics.shopPurchases,
    shopSpent,
    cosmeticCount: cosmeticCount(user),
    cosmeticTypes: ["icons", "nameEffects", "memberCards", "diceSkins", "cardSkins"].filter((key) => normalizeCosmetics(user.cosmetics)[key].length > 1).length,
    midnightContractsCompleted: completedMidnightContractCount(resultIds)
  };
  for (const [gameId, wins] of Object.entries(statistics.gameWins)) metricValues[`gameWins.${gameId}`] = wins;
  for (const entry of achievementCatalog(db)) {
    if (entry.rule?.source === "metric" && metricValues[entry.rule.metric] !== undefined) progress[entry.id] = metricValues[entry.rule.metric];
    if (entry.rule?.legacyResultId && resultIds.includes(entry.rule.legacyResultId)) progress[entry.id] = Math.max(progress[entry.id] ?? 0, 1);
    if (user.achievementProgress?.[entry.id]) progress[entry.id] = Math.max(progress[entry.id] ?? 0, Number(user.achievementProgress[entry.id].value) || 0);
  }
  for (const id of normalizeAchievements(user.achievements).unlocked) progress[id] = Math.max(progress[id] ?? 0, 1);
  const catalog = achievementCatalog(db);
  const normalizedAchievements = normalizeAchievements(user.achievements);
  const persisted = new Set(normalizedAchievements.unlocked);
  const suppressed = new Set(normalizedAchievements.suppressed);
  const isComplete = (entry) => !suppressed.has(entry.id) && (persisted.has(entry.id) || (progress[entry.id] ?? 0) >= entry.target);
  const countedUnlocked = catalog.filter((entry) => !["achievement-collector-50", achievementCompletionId].includes(entry.id) && isComplete(entry)).length;
  progress["achievement-collector-50"] = countedUnlocked;
  progress[achievementCompletionId] = catalog.filter((entry) => entry.id !== achievementCompletionId && isComplete(entry)).length;
  return progress;
}

function achievementStatus(user, db) {
  const achievements = normalizeAchievements(user.achievements);
  const progress = userAchievementProgress(user, db);
  return achievementCatalog(db).map((entry) => {
    const { rule: _rule, builtIn: _builtIn, enabled: _enabled, ...publicEntry } = entry;
    const value = progress[entry.id] ?? 0;
    const suppressed = achievements.suppressed.includes(entry.id);
    const unlocked = !suppressed && (achievements.unlocked.includes(entry.id) || value >= entry.target);
    return { ...publicEntry, description: entry.secret && !unlocked ? "Succès secret" : entry.description, progress: Math.min(value, entry.target), unlocked, suppressed, unlockedAt: achievements.unlockedAt[entry.id] ?? null };
  });
}

function unlockEligibleAchievements(user, db, extraIds = []) {
  if (!user || user.guest) return [];
  const achievements = ensureUserAchievements(user);
  const catalog = achievementCatalog(db);
  const progress = userAchievementProgress(user, db);
  const unlocked = [];
  for (const entry of catalog) {
    if (achievements.suppressed.includes(entry.id)) continue;
    if (achievements.unlocked.includes(entry.id)) continue;
    if ((progress[entry.id] ?? 0) >= entry.target || extraIds.includes(entry.id)) {
      achievements.unlocked.push(entry.id);
      achievements.unlockedAt[entry.id] = new Date().toISOString();
      unlocked.push(entry.id);
    }
  }
  for (const id of unlocked) {
    const entry = catalog.find((achievement) => achievement.id === id);
    if (entry) {
      pushNotification(user, {
        type: "achievement",
        title: `${entry.group} - ${entry.title}`,
        message: entry.description
      });
    }
  }
  grantAchievementCosmetics(user);
  refreshPublicProfileStats(user, db);
  return unlocked;
}

function appendRoomAchievementUnlocks(room, userId, ids = []) {
  if (!userId || !ids.length) return;
  room.achievementUnlocksByUser = room.achievementUnlocksByUser ?? {};
  room.achievementUnlocksByUser[userId] = [...new Set([...(room.achievementUnlocksByUser[userId] ?? []), ...ids])];
}

function consumeRoomAchievementUnlocks(room, userId) {
  delete room.achievementUnlocks;
  const ids = room.achievementUnlocksByUser?.[userId] ?? [];
  if (room.achievementUnlocksByUser) {
    delete room.achievementUnlocksByUser[userId];
    if (Object.keys(room.achievementUnlocksByUser).length === 0) delete room.achievementUnlocksByUser;
  }
  return ids;
}

function triggerRandomAchievement(db, userId, room = null) {
  const roll = Math.floor(Math.random() * 100000) + 1;
  return processAchievementEvent(db, userId, { type: "site.random", payload: { roll, maximum: 100000 } }, room);
}

function processAchievementEvent(db, userId, event, room = null, depth = 0) {
  if (depth > 2) return [];
  const user = db.users.find((entry) => entry.id === userId && !entry.guest);
  if (!user) return [];
  event = { ...event, payload: { ...event.payload, player: playerAchievementContext(user, configuredShop(db)) } };
  user.achievementProgress ??= {};
  if (room) room.achievementRuleProgress ??= {};
  const gameProgress = room ? (room.achievementRuleProgress[userId] ??= {}) : {};
  const candidates = achievementCatalog(db).filter((entry) => entry.enabled !== false && entry.rule?.source === "event" && entry.rule.event === event.type);
  const reached = [];
  for (const entry of candidates) {
    const bucket = entry.rule.scope === "game" ? gameProgress : user.achievementProgress;
    const previous = entry.rule.scope === "event" ? {} : bucket[entry.id] ?? {};
    const result = consumeAchievementEvent(entry.rule, event, previous);
    if (!result.matched && entry.rule.aggregate !== "streak") continue;
    if (entry.rule.scope !== "event") bucket[entry.id] = result.progress;
    if ((Number(result.progress.value) || 0) >= entry.target) reached.push(entry.id);
  }
  const unlocked = unlockEligibleAchievements(user, db, reached);
  if (room) appendRoomAchievementUnlocks(room, userId, unlocked);
  for (const id of unlocked) {
    const entry = achievementCatalog(db).find((candidate) => candidate.id === id);
    processAchievementEvent(db, userId, { type: "achievement.unlocked", payload: { achievementId: id, group: entry?.group ?? "", unlockedCount: ensureUserAchievements(user).unlocked.length } }, room, depth + 1);
  }
  if (depth === 0 && ["account.login", "shop.purchase", "inventory.equipped", "player.updated"].includes(event.type)) unlocked.push(...processAchievementEvent(db, userId, { type: "inventory.checked", payload: { reason: event.type } }, room, depth + 1));
  return [...new Set(unlocked)];
}

function actionAchievementSnapshot(state, actorId) {
  const player = state.players?.find((entry) => entry.id === actorId);
  const scores = state.scores?.[actorId];
  const hand = state.hands?.[actorId] ?? [];
  return {
    logCount: state.logs?.length ?? 0,
    phase: state.phase ?? "",
    dice: [...(state.dice ?? state.lastDiceByPlayer?.[actorId] ?? [])],
    selectedDice: [...(state.selectedDice ?? [])],
    turnScore: Number(state.turnScore) || 0,
    totalScore: typeof scores === "number" ? scores : player ? scoreForRanking(state, player) : 0,
    rollScore: Number(state.lastRoll?.points) || 0,
    hand: hand.map((card) => card ? `${card.rank}${card.suit ?? ""}` : null),
    handTotal: state.gameId === "blackjack" ? blackjackHandTotal(hand) : 0,
    stats: structuredClone(state.stats?.[actorId] ?? {})
  };
}

function gameActionAchievementEvent(room, actorId, action, before) {
  const state = room.state;
  const after = actionAchievementSnapshot(state, actorId);
  const logs = (state.logs ?? []).slice(before.logCount);
  const categoryScore = action.category && typeof state.scores?.[actorId] === "object" ? state.scores[actorId][action.category] : undefined;
  return {
    type: "game.action",
    payload: {
      gameId: state.gameId,
      action: String(action.type ?? ""),
      playerId: actorId,
      roomId: room.id,
      phase: after.phase,
      dice: after.dice,
      diceCount: after.dice.length,
      rollScore: after.rollScore,
      selectedDice: after.selectedDice,
      turnScore: after.turnScore,
      totalScore: after.totalScore,
      cards: after.hand,
      handSize: after.hand.length,
      handTotal: after.handTotal,
      category: action.category ?? "",
      categoryScore: categoryScore ?? 0,
      logTexts: logs.map((log) => log.text).filter(Boolean),
      flags: [...new Set([state.lastRoll?.label, state.currentCombination?.label, ...logs.map((log) => log.type)].filter(Boolean))]
    }
  };
}

function gameFinishedAchievementEvent(room, player, achievementEvents, roomPayouts, pot) {
  const state = room.state;
  const ranking = state.ranking ?? roomRanking(room);
  const rank = ranking.findIndex((entry) => entry.id === player.id) + 1;
  const scores = state.scores?.[player.id];
  const hand = state.hands?.[player.id] ?? [];
  const stats = state.stats?.[player.id] ?? {};
  return {
    type: "game.finished",
    payload: {
      gameId: state.gameId,
      playerId: player.id,
      roomId: room.id,
      won: state.winners?.includes(player.id) ?? false,
      rank,
      score: ranking.find((entry) => entry.id === player.id)?.score ?? 0,
      gain: Number(roomPayouts[player.id] ?? 0) + Number(state.gameId === "blackjack" ? state.payouts?.[player.id] ?? 0 : 0),
      pot,
      playerCount: room.players.length,
      signals: achievementEvents[player.id] ?? [],
      zeroScores: typeof scores === "object" ? Object.values(scores).filter((value) => value === 0).length : 0,
      completedCategories: typeof scores === "object" ? Object.keys(scores).length : 0,
      handSize: hand.length,
      handTotal: state.gameId === "blackjack" ? blackjackHandTotal(hand) : 0,
      dealerTotal: state.gameId === "blackjack" ? blackjackHandTotal(state.dealer ?? []) : 0,
      maxRollScore: Number(stats.maxRollScore) || 0,
      maxTurnScore: Number(stats.maxTurnScore) || 0,
      contractsAttempted: Number(stats.contractsAttempted) || 0,
      contractsCompleted: Number(stats.contractsCompleted) || 0,
      completedContractIds: stats.completedContractIds ?? [],
      marketDiscards: Number(stats.marketDiscards) || 0,
      bluffsCaught: Number(stats.bluffsCaught) || 0
    }
  };
}

function blackjackHandTotal(hand = []) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === "A") {
      aces += 1;
      total += 11;
    } else {
      total += ({ J: 10, Q: 10, K: 10 }[card.rank] ?? Number(card.rank));
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function scoreForRanking(state, player) {
  if (!state || !player) return 0;
  if (state.gameId === "belote") return state.teamScores[beloteTeam(state, player.id)] ?? 0;
  if (state.gameId === "yahtzee") {
    const scores = state.scores?.[player.id] ?? {};
    const upper = ["upper-1", "upper-2", "upper-3", "upper-4", "upper-5", "upper-6"].reduce((sum, key) => sum + (scores[key] ?? 0), 0);
    return Object.values(scores).reduce((sum, value) => sum + value, 0) + (upper >= 63 ? 35 : 0);
  }
  if (state.gameId === "421") return state.scores?.[player.id] ?? (state.results ?? []).find((row) => row.playerId === player.id)?.rank ?? 0;
  if (state.gameId === "cul-de-chouette") return state.scores?.[player.id] ?? 0;
  if (state.gameId === "blackjack") {
    const total = blackjackHandTotal(state.hands?.[player.id] ?? []);
    return total > 21 ? -total : total;
  }
  if (state.gameId === "texas-holdem") return state.stacks?.[player.id] ?? 0;
  if (state.gameId === "bataille") return state.cardCounts?.[player.id] ?? state.piles?.[player.id]?.length ?? 0;
  if (state.gameId === "farkle") return state.scores?.[player.id] ?? 0;
  if (state.gameId === "liars-dice") return state.diceCounts?.[player.id] ?? 0;
  if (state.gameId === "shut-the-box") return -(state.scores?.[player.id] ?? 999);
  if (state.gameId === "golf-solitaire") return -(state.score ?? 999);
  if (state.gameId === "accordion") return -(state.score ?? 999);
  if (state.gameId === "midnight-dice") return state.scores?.[player.id] ?? 0;
  if (state.gameId === "velvet-ruse") return state.prestige?.[player.id] ?? 0;
  if (state.gameId === "president") {
    const index = state.finishedOrder?.indexOf(player.id) ?? -1;
    return index >= 0 ? 1000 - index : -(state.hands?.[player.id]?.length ?? 99);
  }
  return state.winners?.includes(player.id) ? 1 : 0;
}

function roomRanking(room) {
  return [...(room.state?.players ?? room.players)].map((player) => ({
    id: player.id,
    pseudo: player.pseudo,
    isBot: Boolean(player.isBot),
    score: scoreForRanking(room.state, player),
    winner: room.state?.winners?.includes(player.id) ?? false
  })).sort((a, b) => Number(b.winner) - Number(a.winner) || b.score - a.score);
}

function roomPotPayouts(room, pot) {
  const payouts = {};
  const humans = roomRanking(room).filter((player) => !player.isBot);
  const rates = humans.length <= 1 ? [1] : humans.length === 2 ? [0.7, 0.3] : ROOM_PAYOUT_RATES;
  rates.forEach((rate, index) => {
    const player = humans[index];
    if (!player || pot <= 0) return;
    payouts[player.id] = Math.floor(pot * rate);
  });
  return payouts;
}

function addAchievementEvent(events, playerId, id) {
  if (!playerId || playerId === "dealer") return;
  events[playerId] = [...new Set([...(events[playerId] ?? []), id])];
}

function roomAchievementEvents(room) {
  const state = room.state;
  const events = {};
  if (!state) return events;
  for (const player of room.players.filter((p) => !p.isBot)) {
    events[player.id] = [];
    for (const id of gameResultAchievementIds(state, player.id)) addAchievementEvent(events, player.id, id);
  }
  if (state.gameId === "421") {
    for (const result of state.results ?? []) {
      if (result.label === "421") addAchievementEvent(events, result.playerId, "421-perfect");
      if (result.label === "Nénette") addAchievementEvent(events, result.playerId, "421-nenette");
      if (String(result.label).startsWith("Brelan")) addAchievementEvent(events, result.playerId, "421-triple");
    }
  }
  if (state.gameId === "cul-de-chouette") {
    for (const log of state.logs ?? []) {
      if (log.type !== "score") continue;
      if (log.text?.includes("Cul de chouette")) addAchievementEvent(events, log.actorId, "cul-cul-de-chouette");
      if (log.text?.includes("Chouette Velute")) addAchievementEvent(events, log.actorId, "cul-chouette-velute");
    }
    for (const winnerId of state.winners ?? []) addAchievementEvent(events, winnerId, "cul-343");
  }
  if (state.gameId === "bataille") {
    for (const log of state.logs ?? []) if (log.text?.includes("déclenche une bataille")) for (const player of state.players) addAchievementEvent(events, player.id, "bataille-war");
    for (const winnerId of state.winners ?? []) addAchievementEvent(events, winnerId, "bataille-sweep");
  }
  if (state.gameId === "president") {
    for (const log of state.logs ?? []) {
      if (log.text?.includes("révolution")) addAchievementEvent(events, log.actorId, "president-revolution");
      if (log.text?.includes("pose 2x")) addAchievementEvent(events, log.actorId, "president-pair-master");
    }
    for (const winnerId of state.winners ?? []) addAchievementEvent(events, winnerId, "president-first-out");
  }
  if (state.gameId === "liars-dice") {
    const loserId = state.lastReveal?.loserId;
    const winnerId = state.lastReveal?.challengerWins ? state.logs?.at(-1)?.actorId : state.lastBidderId;
    if (winnerId && winnerId !== loserId) addAchievementEvent(events, winnerId, "liars-dice-good-call");
    for (const id of state.winners ?? []) addAchievementEvent(events, id, "liars-dice-last-die");
  }
  if (state.gameId === "shut-the-box") {
    for (const [playerId, score] of Object.entries(state.scores ?? {})) {
      if (score === 0) addAchievementEvent(events, playerId, "shut-zero");
      if (score <= 6) addAchievementEvent(events, playerId, "shut-low");
    }
  }
  if (state.gameId === "golf-solitaire") {
    const playerId = state.players?.[0]?.id;
    if (state.score === 0) addAchievementEvent(events, playerId, "golf-clear");
    if (state.score <= 5) addAchievementEvent(events, playerId, "golf-low");
  }
  if (state.gameId === "accordion") {
    const playerId = state.players?.[0]?.id;
    if (state.score === 1) addAchievementEvent(events, playerId, "accordion-one-pile");
    if (state.score <= 10) addAchievementEvent(events, playerId, "accordion-low");
  }
  if (state.gameId === "velvet-ruse") {
    for (const player of state.players) {
      const catches = state.stats?.[player.id]?.bluffsCaught ?? 0;
      if (catches >= 1) addAchievementEvent(events, player.id, "velvet-bluff-caught");
      if (catches >= 3) addAchievementEvent(events, player.id, "velvet-three-catches");
    }
  }
  return events;
}

function ensureUserCosmetics(user) {
  user.cosmetics = normalizeCosmetics(user.cosmetics);
  return user.cosmetics;
}

function grantAchievementCosmetics(user) {
  if (!user || user.guest) return [];
  const cosmetics = ensureUserCosmetics(user);
  const unlocked = new Set(normalizeAchievements(user.achievements).unlocked);
  const granted = [];
  for (const item of shopCatalog.filter((entry) => entry.rewardOnly && entry.achievementId && unlocked.has(entry.achievementId))) {
    if (!cosmetics[item.type]?.includes(item.value)) {
      cosmetics[item.type].push(item.value);
      granted.push(item.id);
    }
  }
  return granted;
}

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Non authentifié." });
  try {
    req.auth = jwt.verify(header.replace("Bearer ", ""), JWT_SECRET);
    const persistentUser = !req.auth.guest ? readDb().users.find((user) => user.id === req.auth.id) : null;
    if (!req.auth.guest && !persistentUser) return res.status(401).json({ error: "Session invalide." });
    if (persistentUser && (Number(req.auth.sessionVersion) || 0) !== (Number(persistentUser.sessionVersion) || 0)) {
      return res.status(401).json({ error: "Cette session a expiré. Reconnecte-toi." });
    }
    if (persistentUser?.active === false) return res.status(403).json({ error: "Ce compte est désactivé." });
    const moderation = activeModeration(persistentUser);
    if (moderation?.type === "hard") return res.status(403).json({ code: "HARD_BAN", error: "Ce compte est temporairement inaccessible.", reason: moderation.reason ?? "", endsAt: moderation.endsAt ?? "" });
    const parentalRevocation = activeParentalRevocation(persistentUser);
    if (parentalRevocation) return res.status(403).json({ code: "PARENTAL_ACCESS_REVOKED", error: "L’accès à ce compte a été suspendu par le responsable légal.", reason: parentalRevocation.reason ?? "", endsAt: parentalRevocation.revokedUntil });
    const accountSetupRoute = req.path === "/api/me" || req.path === "/api/me/email";
    if (persistentUser && !validEmail(persistentUser.email) && !accountSetupRoute) return res.status(403).json({ code: "EMAIL_UPGRADE_REQUIRED", error: "Ajoute une adresse email valide pour continuer." });
    if (persistentUser && platformSettings().emailVerificationRequired && validEmail(persistentUser.email) && !persistentUser.emailVerifiedAt && !accountSetupRoute) return res.status(403).json({ code: "EMAIL_VERIFICATION_REQUIRED", error: "Valide ton adresse email pour continuer." });
    if (persistentUser && isUnder13(persistentUser) && req.method !== "GET" && !req.path.endsWith("/guardian-activity")) {
      res.once("finish", () => {
        if (res.statusCode >= 400) return;
        const route = req.path;
        const category = route.includes("/rooms/") ? "game" : route.includes("community-events") ? "event" : route.includes("friends") || route.includes("room-invites") || route.includes("/chat") ? "social" : route.includes("shop") ? "shop" : "account";
        const label = category === "game" ? "Action dans une table" : category === "event" ? "Action dans un événement" : category === "social" ? "Interaction sociale" : category === "shop" ? "Action boutique" : "Modification du compte";
        parentalControls.recordActivity(persistentUser.id, { day: casinoDateKey(), category, label });
      });
    }
    next();
  } catch {
    res.status(401).json({ error: "Session invalide." });
  }
}

function userFeatureAccess(user, feature, db = readDb()) {
  return featureAccess(user, feature, platformSettings(db).minorRestrictions);
}

function tableFeatureAccess(user, room, db = readDb()) {
  const roomAccess = userFeatureAccess(user, room?.ownerId === user?.id ? "rooms:create" : "rooms:join", db);
  return roomAccess.allowed ? userFeatureAccess(user, `game:${room?.gameId}`, db) : roomAccess;
}

function rejectFeature(res, access) {
  return res.status(403).json({ code: access.code, error: access.reason || "Cette action n’est pas disponible pour ce compte.", reason: access.reason ?? "", endsAt: access.until ?? "" });
}

function getUser(id) {
  if (sessions.has(id)) return sessions.get(id);
  return readDb().users.find((u) => u.id === id);
}

const chatRateWindows = new Map();
function chatRateAllowed(userId, now = Date.now()) {
  const recent = (chatRateWindows.get(userId) ?? []).filter((at) => now - at < 60000);
  if (recent.length >= 20 || now - (recent.at(-1) ?? 0) < 750) return false;
  recent.push(now);
  chatRateWindows.set(userId, recent);
  return true;
}

function chatRoomAccess(db, userId, roomCodeValue) {
  const room = db.rooms.find((entry) => entry.code === String(roomCodeValue ?? "").trim().toUpperCase());
  if (!room || (!room.players.some((player) => player.id === userId) && !maySpectate(room, userId))) return null;
  return room;
}

function resolveChatChannel(db, user, input = {}) {
  const channelType = String(input.channelType ?? input.channel ?? "");
  if (channelType === "global") return { channelType, channelId: "global", socketRoom: "chat:global" };
  if (channelType === "direct") {
    const friend = db.users.find((entry) => entry.id === String(input.friendId ?? ""));
    ensureUserSocial(user);
    if (!friend || !user.friends.includes(friend.id)) return null;
    const channelId = directChannelId(user.id, friend.id);
    return { channelType, channelId, friend, socketRoom: `chat:direct:${channelId}` };
  }
  if (channelType === "room") {
    const room = chatRoomAccess(db, user.id, input.roomCode);
    if (!room) return null;
    return { channelType, channelId: room.id, room, socketRoom: `chat:room:${room.id}` };
  }
  return null;
}

function decorateChatMessage(message, db = readDb()) {
  const sender = db.users.find((entry) => entry.id === message.senderId);
  return {
    ...message,
    sender: sender ? sanitizeFriendUser(sender, db) : { id: message.senderId, pseudo: "Compte supprimé", cosmetics: structuredClone(defaultCosmetics) }
  };
}

function roomCode() {
  return randomBytes(3).toString("hex").toUpperCase();
}

function saveRoom(room) {
  updateDb((db) => {
    const index = db.rooms.findIndex((r) => r.id === room.id);
    if (index >= 0) db.rooms[index] = room;
    else db.rooms.push(room);
  });
}

function addTokens(db, userId, amount, meta = {}) {
  const persistent = db.users.find((u) => u.id === userId);
  if (persistent) {
    persistent.tokens = (Number(persistent.tokens) || 0) + amount;
    db.transactions.push({ id: randomUUID(), userId, amount, balance: persistent.tokens, gameId: meta.gameId ?? null, roomId: meta.roomId ?? null, eventId: meta.eventId ?? null, requestId: meta.requestId ?? null, reason: meta.reason ?? "adjustment", ...(meta.note ? { note: normalizePlainText(meta.note, 160) } : {}), ...(meta.dailyBonusMultiplier ? { dailyBonusMultiplier: meta.dailyBonusMultiplier } : {}), ...(meta.dailyBonusClaims ? { dailyBonusClaims: meta.dailyBonusClaims } : {}), ...(meta.dailyBonusStreak ? { dailyBonusStreak: meta.dailyBonusStreak } : {}), ...(meta.eventPurchaseQuantity ? { eventPurchaseQuantity: meta.eventPurchaseQuantity, eventOverflowQuantity: meta.eventOverflowQuantity ?? 0, eventUnitPrices: meta.eventUnitPrices ?? [] } : {}), createdAt: new Date().toISOString() });
    processAchievementEvent(db, userId, { type: "transaction", payload: { amount, balance: persistent.tokens, reason: meta.reason ?? "adjustment", gameId: meta.gameId ?? "", roomId: meta.roomId ?? "" } }, meta.roomId ? db.rooms.find((room) => room.id === meta.roomId) : null);
    return persistent.tokens;
  }
  const session = sessions.get(userId);
  if (session) {
    session.tokens += amount;
    db.transactions.push({ id: randomUUID(), userId, amount, balance: session.tokens, gameId: meta.gameId ?? null, roomId: meta.roomId ?? null, eventId: meta.eventId ?? null, requestId: meta.requestId ?? null, reason: meta.reason ?? "adjustment", ...(meta.eventPurchaseQuantity ? { eventPurchaseQuantity: meta.eventPurchaseQuantity, eventOverflowQuantity: meta.eventOverflowQuantity ?? 0, eventUnitPrices: meta.eventUnitPrices ?? [] } : {}), createdAt: new Date().toISOString() });
    return session.tokens;
  }
  return null;
}

function tribunalEligibility(user, db = readDb()) {
  const settings = tribunal.settings();
  if (!settings.enabled) return { eligible: false, reason: "Le tribunal est temporairement fermé." };
  if (!user || user.guest) return { eligible: false, reason: "Un compte joueur est requis pour participer." };
  if (isUnder13(user)) return { eligible: false, reason: "Le tribunal est réservé aux joueurs de 13 ans et plus." };
  if (activeModeration(user)) return { eligible: false, reason: "Un compte sous sanction ne peut pas siéger au tribunal." };
  const gamesPlayed = playerStatistics(db, user.id).gamesPlayed;
  if (gamesPlayed < settings.minimumGames) return { eligible: false, reason: `${settings.minimumGames} parties terminées sont requises.`, gamesPlayed };
  const behavior = tribunal.behavior(user.id);
  if (behavior.score < settings.minimumBehaviorScore) return { eligible: false, reason: "Le score comportemental du compte est insuffisant.", gamesPlayed, behavior };
  return { eligible: true, gamesPlayed, behavior };
}

function anonymizeTribunalText(value, db) {
  let text = normalizePlainText(value, 2000);
  const identities = db.users.flatMap((user) => [user.pseudo, user.profile?.displayName, user.email]).filter((entry) => String(entry ?? "").trim().length >= 2).sort((a, b) => String(b).length - String(a).length);
  for (const identity of identities) text = text.replace(new RegExp(String(identity).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "Joueur anonymisé");
  return text;
}

function publicTribunalCase(entry, userId, settings = tribunal.settings(), db = readDb()) {
  return {
    id: entry.id,
    code: entry.code,
    title: entry.title,
    summary: anonymizeTribunalText(entry.summary, db),
    evidence: Array.isArray(entry.evidence) ? entry.evidence.map((item) => ({
      type: normalizePlainText(item?.type, 30) || "context",
      label: anonymizeTribunalText(item?.label, db).slice(0, 80) || "Élément de contexte",
      value: anonymizeTribunalText(item?.value, db).slice(0, 500),
      occurredAt: Number.isFinite(Date.parse(item?.occurredAt)) ? new Date(item.occurredAt).toISOString() : ""
    })) : [],
    status: entry.status,
    reportCount: entry.reportCount,
    startsAt: entry.startsAt,
    endsAt: entry.endsAt,
    finalScore: entry.finalScore,
    outcome: entry.outcome,
    vote: entry.vote,
    accused: settings.revealAccusedIdentity && entry.accusedId !== userId ? entry.accusedId : ""
  };
}

function tribunalOutcomeMessage(entry) {
  if (entry.outcome === "social-ban") return `Le tribunal a prononcé une restriction sociale de ${entry.socialBanDays} jour(s). Score final : ${entry.finalScore}/5.`;
  if (entry.outcome === "hard-ban-review") return `Le tribunal a prononcé un bannissement de ${entry.hardBanDays} jour(s). Score final : ${entry.finalScore}/5.`;
  if (entry.outcome === "permanent-ban-review") return `Le tribunal a prononcé un bannissement définitif. Score final : ${entry.finalScore}/5.`;
  if (entry.outcome === "warning") return `Le dossier se conclut par un avertissement. Score final : ${entry.finalScore}/5.`;
  return `Le tribunal a conclu à l’absence de culpabilité. Un rappel des règles reste adressé au compte. Score final : ${entry.finalScore}/5.`;
}

function settleTribunalCases(now = Date.now()) {
  tribunal.resolveDue(now);
  for (const entry of tribunal.casesAwaitingSettlement()) {
    const paidJurors = [];
    updateDb((db) => {
      const accused = db.users.find((user) => user.id === entry.accusedId);
      if (accused) {
        ensureUserSocial(accused);
        pushNotification(accused, { type: "tribunal-verdict", title: "Décision du tribunal", message: tribunalOutcomeMessage(entry) });
      }
      for (const vote of entry.votes) {
        if (vote.rewardPaid || !vote.reward) continue;
        const requestId = `tribunal:${entry.id}:${vote.jurorId}`;
        const alreadyPaid = db.transactions.some((transaction) => transaction.requestId === requestId)
          || archiveRows(db.transactions, { userId: vote.jurorId, requestId }, { limit: 1 }).length > 0;
        const juror = db.users.find((user) => user.id === vote.jurorId);
        if (!alreadyPaid && juror) {
          addTokens(db, juror.id, vote.reward, { reason: "tribunal-juror-reward", requestId, note: `Vote ${entry.code}` });
          pushNotification(juror, { type: "tribunal-reward", title: "Vote du tribunal évalué", message: `Ton vote rapporte ${vote.reward.toLocaleString("fr-BE")} jetons. Score final : ${entry.finalScore}/5.` });
        }
        paidJurors.push(vote.jurorId);
      }
    });
    for (const jurorId of paidJurors) tribunal.markRewardPaid(entry.id, jurorId);
    tribunal.markSettlement(entry.id);
  }
}

function tribunalAdminPayload(db = readDb()) {
  const snapshot = tribunal.adminSnapshot();
  const users = new Map(db.users.map((user) => [user.id, user]));
  const identity = (id) => {
    const user = users.get(id);
    return user ? { id, pseudo: displayNameFor(ensureUserSocial(user)), email: user.email ?? "" } : { id, pseudo: "Compte supprimé", email: "" };
  };
  return {
    ...snapshot,
    categories: tribunalCategories,
    reports: snapshot.reports.map((entry) => ({ ...entry, reporter: identity(entry.reporterId), accused: identity(entry.accusedId) })),
    cases: snapshot.cases.map((entry) => ({ ...entry, accused: identity(entry.accusedId), accusedBehavior: tribunal.behavior(entry.accusedId), accusedReports: tribunal.reportStats(entry.accusedId), reportIds: tribunal.reportIdsForCase(entry.id), votes: tribunal.votes(entry.id) }))
  };
}

function applyTribunalDecision(caseId, body, adminId, now = Date.now()) {
  const entry = tribunal.adminSnapshot().cases.find((candidate) => candidate.id === caseId && candidate.status === "awaiting-enforcement");
  if (!entry) return { error: "missing" };
  const allowed = new Set(["permanent-ban-review", "hard-ban-review", "social-ban", "warning", "not-guilty"]);
  const outcome = allowed.has(body?.outcome) ? body.outcome : entry.outcome;
  const permanent = outcome === "permanent-ban-review";
  const maximumDays = outcome === "social-ban" ? 30 : 3650;
  const fallbackDays = outcome === "social-ban" ? entry.socialBanDays : entry.hardBanDays;
  const days = permanent || ["warning", "not-guilty"].includes(outcome) ? 0 : Math.max(1, Math.min(maximumDays, Math.round(Number(body?.days) || fallbackDays)));
  const reason = normalizePlainText(body?.reason, 240) || `Décision du tribunal ${entry.code}`;
  const applied = updateDb((db) => {
    const user = db.users.find((candidate) => candidate.id === entry.accusedId);
    if (!user) return false;
    ensureUserSocial(user);
    user.moderation ??= {};
    if (outcome === "social-ban") {
      user.moderation.softBan = { active: true, reason, endsAt: new Date(now + days * 86400000).toISOString(), updatedAt: new Date(now).toISOString(), updatedBy: adminId, caseId: entry.id };
    } else if (["hard-ban-review", "permanent-ban-review"].includes(outcome)) {
      user.moderation.hardBan = { active: true, reason, endsAt: permanent ? "" : new Date(now + days * 86400000).toISOString(), updatedAt: new Date(now).toISOString(), updatedBy: adminId, caseId: entry.id };
      user.sessionVersion = (Number(user.sessionVersion) || 0) + 1;
    }
    return true;
  });
  if (!applied) return { error: "user" };
  const decided = tribunal.confirmDecision(entry.id, adminId, { outcome, days }, now);
  settleTribunalCases(now);
  return { entry: decided };
}

function getTokenBalance(db, userId) {
  return db.users.find((u) => u.id === userId)?.tokens ?? sessions.get(userId)?.tokens ?? 0;
}

function syncRoomPlayerTokens(room, db) {
  room.players = room.players.map((player) => ({
    ...player,
    tokens: player.isBot ? player.tokens : getTokenBalance(db, player.id)
  }));
}

function removePlayerFromRoomState(room, playerId) {
  if (!room.state) return;
  const state = room.state;
  if (state.gameId === "belote" && !state.finished) {
    if (!room.players.some((player) => !player.isBot)) { state.finished = true; state.winners = []; return; }
    if (!state.players.some((player) => player.id === playerId)) return;
    const replacement = { id: `bot-${randomUUID()}`, pseudo: "IA remplaçante", isBot: true, tokens: 0 };
    replaceBelotePlayer(state, playerId, replacement);
    room.beloteSeats = (room.beloteSeats ?? state.players.map((player) => player.id)).map((id) => id === playerId ? replacement.id : id);
    room.players = [...state.players];
    return;
  }
  const removedIndex = state.players?.findIndex((p) => p.id === playerId) ?? -1;
  state.players = (state.players ?? []).filter((p) => p.id !== playerId);
  if (state.currentPlayerIndex !== undefined && removedIndex >= 0) {
    if (removedIndex < state.currentPlayerIndex) state.currentPlayerIndex -= 1;
    if (state.currentPlayerIndex >= state.players.length) state.currentPlayerIndex = 0;
  }
  for (const key of ["scores", "hands", "bets", "piles", "boxes", "diceCounts", "drawnCards", "pendingChoices", "botThinking", "cardCounts", "trays", "secretContracts", "usedContracts", "discardRemaining", "prestige", "stats"]) {
    if (state[key]) delete state[key][playerId];
  }
  if (state.deckKnowledge) {
    delete state.deckKnowledge[playerId];
    for (const viewerKnowledge of Object.values(state.deckKnowledge)) delete viewerKnowledge[playerId];
  }
  state.submittedPlayerIds = (state.submittedPlayerIds ?? []).filter((id) => id !== playerId);
  if (state.battleLanes) state.battleLanes = state.battleLanes.map((lane) => ({ ...lane, cards: lane.cards.filter((card) => card.ownerId !== playerId) }));
  state.results = (state.results ?? []).filter((row) => row.playerId !== playerId);
  state.finishedOrder = (state.finishedOrder ?? []).filter((id) => id !== playerId);
  state.passes = (state.passes ?? []).filter((id) => id !== playerId);
  state.winners = (state.winners ?? []).filter((id) => id !== playerId);
  if (state.currentSet?.playerId === playerId) {
    state.pile = [];
    state.currentSet = null;
    state.passes = [];
  }
  if (state.pendingClaim?.playerId === playerId) {
    state.pendingClaim = null;
    if (state.phase === "decision") state.phase = "draw";
  }
  if (state.dossier) state.dossier = state.dossier.filter((entry) => entry.playerId !== playerId);
  if (state.players.length <= 1) {
    state.winners = state.players.length ? [state.players[0].id] : [];
    state.finished = true;
  }
}

function cashOutPokerPlayer(room, db, playerId, reason = "poker-cash-out") {
  const state = room.state;
  if (state?.gameId !== "texas-holdem" || state.departedPayouts?.[playerId] !== undefined) return 0;
  if (state.currentPlayerIndex >= 0 && state.players[state.currentPlayerIndex]?.id === playerId && !state.foldedPlayerIds.includes(playerId)) applyAction(state, playerId, { type: "fold" });
  const player = state.players.find((entry) => entry.id === playerId);
  const alreadyRecovered = Object.values(state.departedPayouts ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
  const availableRealFunds = Math.max(0, (state.realBankroll ?? state.buyIn ?? 0) - alreadyRecovered);
  const amount = player?.isBot ? 0 : Math.min(Math.max(0, state.stacks?.[playerId] ?? 0), availableRealFunds);
  if (amount && !player?.isBot) addTokens(db, playerId, amount, { gameId: room.gameId, roomId: room.id, reason });
  state.departedPayouts ??= {};
  state.departedPlayers ??= [];
  state.departedPayouts[playerId] = amount;
  if (player && !state.departedPlayers.some((entry) => entry.id === playerId)) state.departedPlayers.push({ ...player, recovered: amount });
  state.stacks[playerId] = 0;
  state.foldedPlayerIds = [...new Set([...state.foldedPlayerIds, playerId])];
  room.players = room.players.filter((entry) => entry.id !== playerId);
  const eligible = state.players.filter((entry) => (state.stacks[entry.id] ?? 0) > 0);
  const humansRemaining = room.players.filter((entry) => !entry.isBot);
  if (!humansRemaining.length || eligible.length < 2) {
    state.winners = eligible.map((entry) => entry.id);
    state.finished = true;
  }
  return amount;
}

function broadcastRooms(db = readDb()) {
  if (cleanupEmptyRooms(db)) writeDb(db);
  io.emit("rooms", sanitizeRooms(db.rooms.filter((room) => room.isPublic && !room.finished)));
}

function cleanupEmptyRooms(db) {
  const before = db.rooms.length;
  const now = Date.now();
  db.rooms = db.rooms.filter((room) => {
    const ageMs = now - new Date(room.createdAt ?? now).getTime();
    return room.finished || room.state || (roomPresence.get(room.id)?.size ?? 0) > 0 || ageMs < 30000;
  });
  return before - db.rooms.length;
}

function finishRoomIfNeeded(room, db) {
  if (!room.state?.finished || room.finished) return;
  room.finished = true;
  const paidPlayers = room.players.filter((p) => !p.isBot);
  const pot = room.stake * paidPlayers.length;
  const winners = room.state.winners ?? [];
  const achievementEvents = roomAchievementEvents(room);
  if (room.state.gameId === "blackjack") {
    for (const [playerId, amount] of Object.entries(room.state.payouts ?? {})) addTokens(db, playerId, amount, { gameId: room.gameId, roomId: room.id, reason: "blackjack-payout" });
  }
  const roomPayouts = room.state.gameId === "texas-holdem"
    ? (() => {
      const recovered = Object.values(room.state.departedPayouts ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
      const available = Math.max(0, (room.state.realBankroll ?? pot) - recovered);
      const weights = paidPlayers.map((player) => Math.max(0, room.state.stacks?.[player.id] ?? 0));
      const totalWeight = weights.reduce((sum, value) => sum + value, 0);
      let distributed = 0;
      return Object.fromEntries(paidPlayers.map((player, index) => {
        const amount = index === paidPlayers.length - 1 ? available - distributed : totalWeight ? Math.floor(available * weights[index] / totalWeight) : 0;
        distributed += amount;
        return [player.id, amount];
      }));
    })()
    : winners.length > 0 ? roomPotPayouts(room, pot) : {};
  if (room.state.gameId === "texas-holdem") {
    for (const [playerId, amount] of Object.entries(roomPayouts)) if (amount > 0) addTokens(db, playerId, amount, { gameId: room.gameId, roomId: room.id, reason: "poker-cash-out" });
  } else if (pot > 0 && winners.length > 0) {
    for (const [playerId, amount] of Object.entries(roomPayouts)) {
      if (amount > 0) addTokens(db, playerId, amount, { gameId: room.gameId, roomId: room.id, reason: "room-pot-win" });
    }
  }
  room.state.ranking = roomRanking(room);
  room.state.roomPayouts = roomPayouts;
  syncRoomPlayerTokens(room, db);
  const historyRow = { id: randomUUID(), roomId: room.id, code: room.code, name: room.name, gameId: room.gameId, players: room.players.map((p) => ({ id: p.id, pseudo: p.pseudo, isBot: p.isBot })), winners, ranking: room.state.ranking, payouts: roomPayouts, blackjackPayouts: room.state.gameId === "blackjack" ? room.state.payouts ?? {} : {}, pot, achievementEvents, finishedAt: new Date().toISOString() };
  if (room.gameId === "belote") historyRow.leaderboardScores = Object.fromEntries(room.state.players.map((player, index) => [player.id, room.state.teamScores[index % 2]]));
  db.history.push(historyRow);
  for (const player of room.players.filter((p) => !p.isBot)) {
    const user = db.users.find((u) => u.id === player.id);
    processAchievementEvent(db, player.id, gameFinishedAchievementEvent(room, player, achievementEvents, roomPayouts, pot), room);
    appendRoomAchievementUnlocks(room, player.id, unlockEligibleAchievements(user, db));
    triggerRandomAchievement(db, player.id, room);
  }
}

function botActionFor(state, bot) {
  if (state.gameId === "belote") return beloteBotAction(state, bot);
  if (state.gameId === "yahtzee") return yahtzeeBotAction(state, bot);
  if (state.gameId === "421") return fourTwentyOneBotAction(state, bot);
  if (state.gameId === "cul-de-chouette") return culDeChouetteBotAction(state, bot);
  if (state.gameId === "bataille") return battleBotAction(state, bot);
  if (state.gameId === "texas-holdem") return texasHoldemBotAction(state, bot);
  if (state.gameId === "farkle") return farkleBotAction(state, bot);
  if (state.gameId === "liars-dice") return liarsDiceBotAction(state, bot);
  if (state.gameId === "shut-the-box") return shutTheBoxBotAction(state, bot);
  if (state.gameId === "midnight-dice") return midnightDiceBotAction(state, bot);
  if (state.gameId === "velvet-ruse") return velvetRuseBotAction(state, bot);
  if (state.gameId === "president") return presidentBotAction(state, bot);
  return null;
}

function roundProgressSnapshot(state) {
  if (!state) return { finished: false, round: 0, resultKey: "", yahtzeeRound: 0 };
  const lastRound = state.lastRound?.round;
  const lastResolution = state.gameId === "bataille" ? undefined : state.lastResolution?.round;
  const latest421Round = state.roundHistory?.at(-1)?.round;
  const resultKey = lastRound !== undefined
    ? `last-round:${lastRound}`
    : lastResolution !== undefined
      ? `last-resolution:${lastResolution}`
      : latest421Round !== undefined
        ? `round-history:${latest421Round}`
        : state.gameId === "texas-holdem" && state.nextHandAt
          ? `poker-hand:${state.handNumber ?? 1}`
          : "";
  const yahtzeeCompletedTurns = state.gameId === "yahtzee"
    ? Object.values(state.scores ?? {}).reduce((total, score) => total + Object.keys(score ?? {}).length, 0)
    : 0;
  return {
    finished: Boolean(state.finished),
    round: Number(state.round) || Number(state.handNumber) || 0,
    resultKey,
    yahtzeeRound: state.gameId === "yahtzee" ? Math.floor(yahtzeeCompletedTurns / Math.max(1, state.players?.length ?? 1)) : 0
  };
}

function completedRoundNumber(state, before) {
  if (state.lastRound?.round !== undefined) return state.lastRound.round;
  if (state.lastResolution?.round !== undefined) return state.lastResolution.round;
  if (state.roundHistory?.length) return state.roundHistory.at(-1).round;
  if (state.gameId === "texas-holdem") return state.handNumber ?? before.round ?? 1;
  if (state.gameId === "yahtzee") return Math.max(1, roundProgressSnapshot(state).yahtzeeRound);
  return before.round || state.round || 1;
}

function didRoundFinish(before, state) {
  const after = roundProgressSnapshot(state);
  if (!before.finished && after.finished) return true;
  if (after.resultKey && after.resultKey !== before.resultKey) return true;
  if (state.gameId === "yahtzee" && after.yahtzeeRound > before.yahtzeeRound) return true;
  if (!["texas-holdem", "belote", "midnight-dice", "421"].includes(state.gameId) && after.round > before.round) return true;
  return false;
}

function roomPacingActive(room, now = Date.now()) {
  return Boolean(room.pacing?.endsAt && room.pacing.endsAt > now);
}

function roomTiming(room) {
  return {
    botThinkingMs: Math.max(0, Number(room.timing?.botThinkingMs ?? DEFAULT_BOT_THINKING_MS)),
    turnEndDelayMs: Math.max(1000, Number(room.timing?.turnEndDelayMs ?? DEFAULT_TURN_END_DELAY_MS)),
    roundResultsMs: Math.max(0, Number(room.timing?.roundResultsMs ?? DEFAULT_ROUND_RESULTS_MS))
  };
}

function startRoomPacing(room, kind, durationMs, details = {}) {
  const now = Date.now();
  room.pacing = {
    id: randomUUID(),
    kind,
    startedAt: now,
    endsAt: now + durationMs,
    ...details
  };
  if (room.state?.gameId === "texas-holdem" && kind === "round-results" && room.state.nextHandAt) {
    room.state.resolutionStartedAt = now;
    room.state.nextHandAt = room.pacing.endsAt;
  }
}

function roundResultsPacingDetails(room, before) {
  const round = completedRoundNumber(room.state, before);
  return {
    round,
    final: Boolean(room.state.finished),
    results: roomRanking(room).map((player, index) => {
      const state = room.state;
      let scoreLabel = "";
      if (["shut-the-box", "golf-solitaire", "accordion"].includes(state.gameId)) scoreLabel = String(Math.abs(player.score));
      if (state.gameId === "president") {
        const finishIndex = state.finishedOrder?.indexOf(player.id) ?? -1;
        scoreLabel = finishIndex >= 0 ? `${finishIndex + 1}e place` : `${state.hands?.[player.id]?.length ?? 0} carte(s)`;
      }
      return { ...player, rank: index + 1, ...(scoreLabel ? { scoreLabel } : {}) };
    })
  };
}

function startRoundResultsIfNeeded(room, before, afterActor = null) {
  if (!room.state || !didRoundFinish(before, room.state)) return false;
  const details = roundResultsPacingDetails(room, before);
  const timing = roomTiming(room);
  if (afterActor) {
    startRoomPacing(room, "turn-end", timing.turnEndDelayMs, {
      actorId: afterActor.id,
      actorName: afterActor.pseudo,
      actorIsBot: Boolean(afterActor.isBot),
      ...(timing.roundResultsMs > 0 ? { nextPacing: { kind: "round-results", durationMs: timing.roundResultsMs, details } } : {})
    });
  } else if (timing.roundResultsMs > 0) {
    startRoomPacing(room, "round-results", timing.roundResultsMs, details);
  } else {
    return false;
  }
  return true;
}

function advanceRoomPacing(room, db, now = Date.now()) {
  if (!room.pacing || room.pacing.endsAt > now) return false;
  const completedPacing = room.pacing;
  room.pacing = null;
  if (completedPacing.kind === "turn-end" && room.state?.turnDeadline) {
    const pausedFor = Math.max(0, now - completedPacing.startedAt);
    room.state.turnStartedAt = room.state.turnStartedAt ? room.state.turnStartedAt + pausedFor : room.state.turnStartedAt;
    room.state.turnDeadline += pausedFor;
  }
  if (completedPacing.kind === "round-results" && room.state?.gameId === "texas-holdem" && room.state.nextHandAt) {
    room.state.nextHandAt = now;
    tickPokerState(room.state, now);
  }
  if (completedPacing.nextPacing) {
    startRoomPacing(room, completedPacing.nextPacing.kind, completedPacing.nextPacing.durationMs, completedPacing.nextPacing.details);
    return true;
  }
  if (!room.state?.finished) runBotTurns(room, db, { skipThinking: completedPacing.kind === "bot-thinking" });
  finishRoomIfNeeded(room, db);
  return true;
}

function runBotTurns(room, db, { skipThinking = false } = {}) {
  if (roomPacingActive(room)) return;
  if (room.state?.gameId === "bataille") {
    if (room.state.resolutionEndsAt) return;
    room.state.botThinking ??= {};
    for (const bot of room.state.players.filter((player) => player.isBot && !room.state.submittedPlayerIds?.includes(player.id))) {
      const phase = room.state.drawnCards?.[bot.id] ? "place" : "draw";
      const scheduledRound = room.state.round;
      const timerKey = `${room.id}:${scheduledRound}:${bot.id}:${phase}`;
      if (battleBotTimers.has(timerKey)) continue;
      const configuredDelay = roomTiming(room).botThinkingMs;
      const delay = configuredDelay > 0 ? configuredDelay : 50;
      room.state.botThinking[bot.id] = { phase, until: Date.now() + delay };
      const timer = setTimeout(() => {
        battleBotTimers.delete(timerKey);
        const currentDb = readDb();
        const currentRoom = currentDb.rooms.find((entry) => entry.id === room.id && !entry.finished && entry.state?.gameId === "bataille");
        const currentBot = currentRoom?.state.players.find((player) => player.id === bot.id && player.isBot);
        if (!currentRoom || !currentBot || currentRoom.state.round !== scheduledRound || currentRoom.state.submittedPlayerIds?.includes(bot.id)) return;
        delete currentRoom.state.botThinking?.[bot.id];
        const action = botActionFor(currentRoom.state, currentBot);
        if (!action) return;
        try {
          const roundBeforeAction = roundProgressSnapshot(currentRoom.state);
          currentRoom.state = applyAction(currentRoom.state, currentBot.id, action);
          if (!startRoundResultsIfNeeded(currentRoom, roundBeforeAction, currentBot)) runBotTurns(currentRoom, currentDb);
          finishRoomIfNeeded(currentRoom, currentDb);
          writeDb(currentDb);
          emitRoomUpdate(currentRoom, currentDb);
        } catch (error) {
          console.error(`Battle bot action failed for ${currentBot.id}:`, error.message);
        }
      }, delay);
      battleBotTimers.set(timerKey, timer);
    }
    finishRoomIfNeeded(room, db);
    return;
  }
  let guard = 0;
  let actionCount = 0;
  const firstBot = room.state?.players?.[room.state.currentPlayerIndex];
  if (!firstBot?.isBot) {
    finishRoomIfNeeded(room, db);
    return;
  }
  const timing = roomTiming(room);
  if (!skipThinking && timing.botThinkingMs > 0) {
    startRoomPacing(room, "bot-thinking", timing.botThinkingMs, { actorId: firstBot.id, actorName: firstBot.pseudo, actorIsBot: true });
    return;
  }
  const before = roundProgressSnapshot(room.state);
  while (room.state && !room.state.finished && guard < 30) {
    guard += 1;
    const bot = room.state.players?.[room.state.currentPlayerIndex];
    if (!bot?.isBot || bot.id !== firstBot.id) break;
    const action = botActionFor(room.state, bot);
    if (!action) break;
    room.state = applyAction(room.state, bot.id, action);
    actionCount += 1;
  }
  if (!startRoundResultsIfNeeded(room, before, firstBot) && actionCount > 0 && !room.state.finished) {
    startRoomPacing(room, "turn-end", timing.turnEndDelayMs, { actorId: firstBot.id, actorName: firstBot.pseudo, actorIsBot: true });
  }
  finishRoomIfNeeded(room, db);
}

function startRoomRound(room, db) {
  const game = configuredGames(db).find((g) => g.id === room.gameId);
  if (!game) return "missing";
  if (room.players.length < game.minPlayers) return `Minimum ${game.minPlayers} joueur(s).`;
  if (room.gameId === "belote" && room.players.length !== 4) return "La belote exige exactement quatre joueurs, IA comprises.";
  const settings = platformSettings(db);
  room.stake = Math.max(room.gameId === "texas-holdem" ? settings.minPokerBuyIn : settings.minRoomStake, Number(room.stake) || 0);
  for (const player of room.players.filter((p) => !p.isBot)) {
    if (getTokenBalance(db, player.id) < room.stake) return `${player.pseudo} n'a pas assez de jetons.`;
  }
  for (const player of room.players.filter((p) => !p.isBot)) {
    addTokens(db, player.id, -room.stake, { gameId: room.gameId, roomId: room.id, reason: "room-stake" });
    appendRoomAchievementUnlocks(room, player.id, unlockEligibleAchievements(db.users.find((u) => u.id === player.id), db));
    triggerRandomAchievement(db, player.id, room);
  }
  syncRoomPlayerTokens(room, db);
  room.finished = false;
  room.pacing = null;
  room.timing = {
    botThinkingMs: settings.botThinkingSeconds * 1000,
    turnEndDelayMs: settings.turnEndDelaySeconds * 1000,
    roundResultsMs: settings.roundResultsSeconds * 1000
  };
  if (room.gameId === "texas-holdem") {
    room.pokerBlinds = {
      ...pokerBlindsFromBigBlind(room.pokerBlinds?.bigBlind, settings.pokerDefaultBigBlind),
      maximumBet: Math.max(Number(room.pokerBlinds?.bigBlind) || settings.pokerDefaultBigBlind, Number(room.pokerBlinds?.maximumBet) || room.stake)
    };
  }
  room.gameModifiers = normalizeGameModifiers(room.gameId, room.gameModifiers);
  if (room.gameId === "belote") room.beloteSeats = beloteSeats(room);
  const seatedPlayers = room.gameId === "belote" ? room.beloteSeats.map((id) => room.players.find((player) => player.id === id)) : room.players;
  room.state = createGameState(room.gameId, seatedPlayers, { buyIn: room.stake, bigBlind: room.pokerBlinds?.bigBlind, maximumBet: room.pokerBlinds?.maximumBet, turnDurationMs: (room.pokerTurnSeconds ?? settings.pokerTurnSeconds) * 1000, battleModifiers: room.battleModifiers, gameModifiers: room.gameModifiers });
  if (room.state.gameId === "bataille") room.state.resolutionDurationMs = room.timing.turnEndDelayMs;
  room.activityMatchId = randomUUID();
  runBotTurns(room, db);
  return null;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ktga-me-server", environment: NODE_ENV, timeZone: process.env.CASINO_TIME_ZONE || "Europe/Brussels", serverTime: new Date().toISOString(), casinoDate: casinoDateKey() });
});

app.get("/api/status", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=30");
  res.json(statusMonitor.payload(req.query.days));
});

app.get("/api/patchnotes/images/:id", (req, res) => {
  const image = patchnotes.attachment(req.params.id);
  if (!image || !fs.existsSync(image.path)) return res.status(404).json({ error: "Image introuvable." });
  res.setHeader("Content-Type", image.mimeType);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(image.path);
});

app.get("/api/patchnotes", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
  res.json({ currentVersion: patchnotes.currentVersion, notes: patchnotes.list() });
});

app.get("/api/patchnotes/:version", (req, res) => {
  const note = patchnotes.get(req.params.version);
  if (!note) return res.status(404).json({ error: "Patchnote introuvable." });
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
  res.json(note);
});

app.get("/api/patchnotes/:id/reaction", auth, (req, res) => {
  res.json(patchnotes.reaction(req.params.id, req.auth.id));
});

app.post("/api/patchnotes/:id/reaction", auth, (req, res) => {
  try {
    const result = patchnotes.react(req.params.id, req.auth.id, req.body?.value);
    if (!result) return res.status(404).json({ error: "Patchnote introuvable." });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Réaction invalide." });
  }
});

updateDb((db) => {
  db.settings ??= {};
  db.settings.platform = platformSettings(db);
  db.settings.games ??= {};
  for (const game of games) {
    db.settings.games[game.id] ??= {};
    if (!Object.hasOwn(db.settings.games[game.id], "description")) db.settings.games[game.id].description = defaultGameDescriptions[game.id] ?? "";
    if (game.id === "bataille" && ["Remporter toutes les cartes.", "Choisir secrètement entre deux piles et capturer toutes les cartes adverses."].includes(db.settings.games[game.id].description)) db.settings.games[game.id].description = defaultGameDescriptions.bataille;
  }
  for (const user of db.users) {
    if (user.active === undefined) user.active = true;
    if (user.editor === undefined) user.editor = false;
  }
  for (const room of db.rooms.filter((entry) => entry.gameId === "texas-holdem")) {
    const blinds = pokerBlindsFromBigBlind(room.pokerBlinds?.bigBlind, db.settings.platform.pokerDefaultBigBlind);
    room.pokerBlinds = { ...blinds, maximumBet: Math.max(blinds.bigBlind, Number(room.pokerBlinds?.maximumBet) || Number(room.stake) || blinds.bigBlind) };
    if (room.state?.gameId === "texas-holdem") {
      const stateBlinds = pokerBlindsFromBigBlind(room.state.bigBlind, room.pokerBlinds.bigBlind);
      room.state.smallBlind = stateBlinds.smallBlind;
      room.state.bigBlind = stateBlinds.bigBlind;
      room.state.maximumBet = Math.max(stateBlinds.bigBlind, Number(room.state.maximumBet) || room.pokerBlinds.maximumBet);
      room.state.autoCheckFoldPlayerIds ??= [];
      room.state.autoCheckFoldEnabledAt ??= {};
      room.state.turnStartedAt ??= room.state.currentPlayerIndex >= 0 ? Date.now() : null;
      room.state.turnDurationMs ??= db.settings.platform.pokerTurnSeconds * 1000;
    }
  }
  for (const room of db.rooms.filter((entry) => entry.gameId === "bataille")) {
    room.battleModifiers = normalizeBattleModifiers(room.battleModifiers ?? room.state?.modifiers);
    if (room.state?.gameId === "bataille") room.state.modifiers = normalizeBattleModifiers(room.state.modifiers ?? room.battleModifiers);
  }
  for (const room of db.rooms) {
    room.gameModifiers = normalizeGameModifiers(room.gameId, room.gameModifiers ?? room.state?.modifiers);
    if (room.state && room.gameId !== "bataille") room.state.modifiers = normalizeGameModifiers(room.gameId, room.state.modifiers ?? room.gameModifiers);
    if (room.state?.gameId === "421") {
      room.state.round ??= 1;
      room.state.maxRounds ??= room.state.modifiers.rounds;
      room.state.scores ??= Object.fromEntries(room.state.players.map((player) => [player.id, (room.state.results ?? []).find((result) => result.playerId === player.id)?.rank ?? 0]));
      room.state.roundHistory ??= [];
    }
    if (room.state?.gameId === "cul-de-chouette") {
      room.state.round ??= 1;
      room.state.maxRounds ??= room.state.modifiers.rounds;
      room.state.completedThisRound ??= [];
    }
    const humans = room.players?.filter((player) => !player.isBot) ?? [];
    if (!room.state && humans.length === 1) room.readyPlayerIds = [...new Set([...(room.readyPlayerIds ?? []), humans[0].id])];
  }
});

setCatalogSource((db) => ({ achievements: achievementCatalog(db, { includeDisabled: true }), items: configuredShop(db) }));

app.get("/api/config", (_req, res) => res.json({ ...platformSettings(), emailVerificationAvailable: emailDeliveryConfigured() }));

app.get("/api/games", (_req, res) => res.json(configuredGames().filter((game) => game.enabled !== false)));

function minorRestrictionCatalog(db = readDb()) {
  const options = [...minorRestrictionOptions, ...configuredGames(db).map((game) => ({ id: `game:${game.id}`, label: game.name, description: `Créer, rejoindre ou observer une table de ${game.name}.` }))];
  return [...new Map(options.map((entry) => [entry.id, entry])).values()];
}

app.get("/api/parental/request", (req, res) => {
  const request = parentalControls.requestForVerification(req.query.token);
  if (!request) return res.status(404).json({ error: "Cette demande parentale est invalide ou a expiré." });
  res.json({ code: request.code, childPseudo: request.childPseudo, childBirthDate: request.childBirthDate, parentEmail: maskedEmail(request.parentEmail), status: request.status, restrictions: platformSettings().minorRestrictions, restrictionOptions: minorRestrictionCatalog() });
});

app.post("/api/parental/consent", (req, res) => {
  if (req.body.consent !== true) return res.status(400).json({ error: "L’accord explicite du responsable légal est requis." });
  const request = parentalControls.consent(req.body.token);
  if (!request) return res.status(404).json({ error: "Cette demande parentale est invalide ou a expiré." });
  res.json({ ok: true, code: request.code, status: request.status, message: "Votre adresse est validée et votre accord enregistré. La demande attend maintenant la revue de l’équipe." });
});

function parentalPortalSummary(request, selectedDay = casinoDateKey()) {
  const db = readDb();
  const user = db.users.find((entry) => entry.id === request.userId && !entry.guest);
  if (!user) return null;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(selectedDay)) ? String(selectedDay) : casinoDateKey();
  const activity = parentalControls.activity(user.id, day);
  const history = archiveRows(db.history, { memberId: user.id }, { descending: true, limit: 250 }).filter((entry) => casinoDateKey(entry.finishedAt) === day).map((entry) => ({ id: entry.id, gameId: entry.gameId, name: entry.name || entry.code || "Table", finishedAt: entry.finishedAt, won: entry.winners?.includes(user.id) ?? false, players: entry.players?.length ?? 0 }));
  const transactions = archiveRows(db.transactions, { userId: user.id }, { descending: true, limit: 500 }).filter((entry) => casinoDateKey(entry.createdAt) === day).map((entry) => ({ id: entry.id, reason: entry.reason, amount: Number(entry.amount) || 0, balance: Number(entry.balance) || 0, gameId: entry.gameId ?? "", createdAt: entry.createdAt }));
  const seconds = activity.reduce((sum, entry) => sum + Number(entry.durationSeconds || 0), 0);
  const sessions = Math.max(activity.length ? 1 : 0, activity.filter((entry) => entry.category === "session").reduce((sum, entry) => sum + Number(entry.count || 0), 0));
  const revocation = activeParentalRevocation(user);
  const access = revocation ? { ...user.parentalAccess, managed: true, revoked: true, revokedUntil: revocation.revokedUntil } : { status: "active", managed: isUnder13(user), revoked: false, reactivationRequestedAt: null };
  return { request: { code: request.code, parentEmail: maskedEmail(request.parentEmail) }, child: { pseudo: displayNameFor(user), birthDate: user.profile?.birthDate, turnsThirteenAt: turnsThirteenAt(user.profile?.birthDate) }, day, access, restrictions: platformSettings(db).minorRestrictions, activity, history, transactions, metrics: { seconds, sessions, games: history.length, wins: history.filter((entry) => entry.won).length, actions: activity.reduce((sum, entry) => sum + Number(entry.count || 0), 0), credits: transactions.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0), debits: Math.abs(transactions.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0)) } };
}

app.get("/api/parental/portal", (req, res) => {
  const request = parentalControls.portalRequest(req.query.token);
  if (!request) return res.status(403).json({ error: "Le lien de l’espace parent est invalide." });
  const payload = parentalPortalSummary(request, req.query.date);
  if (!payload) return res.status(404).json({ error: "Le compte associé n’existe plus." });
  res.json(payload);
});

app.post("/api/parental/portal/revoke", async (req, res) => {
  const request = parentalControls.portalRequest(req.body.token);
  if (!request) return res.status(403).json({ error: "Le lien de l’espace parent est invalide." });
  const result = updateDb((db) => {
    const user = db.users.find((entry) => entry.id === request.userId && isUnder13(entry));
    if (!user) return null;
    const thirteenth = Date.parse(turnsThirteenAt(user.profile.birthDate));
    const requestedDays = Math.max(1, Math.min(3650, Math.floor(Number(req.body.days) || 0)));
    const requestedEnd = req.body.untilThirteen === true ? thirteenth : Date.now() + requestedDays * 86400000;
    const revokedUntil = new Date(Math.min(thirteenth, requestedEnd)).toISOString();
    user.parentalAccess = { status: "revoked", reason: normalizePlainText(req.body.reason || "Décision du responsable légal", 240), revokedAt: new Date().toISOString(), revokedUntil, reactivationRequestedAt: null };
    user.sessionVersion = (Number(user.sessionVersion) || 0) + 1;
    return { user, revokedUntil };
  });
  if (!result) return res.status(404).json({ error: "Ce compte ne relève plus du parcours des moins de 13 ans." });
  await sendParentalActionNotice({ request, portalToken: req.body.token, title: "Accès suspendu", message: `Votre décision a été enregistrée. L’accès de ${request.childPseudo} est suspendu jusqu’au ${new Intl.DateTimeFormat("fr-BE", { dateStyle: "long" }).format(new Date(result.revokedUntil))}.` }).catch((error) => console.error("Parental decision email failed:", error.message));
  res.json(parentalPortalSummary(request, req.body.date));
});

app.post("/api/parental/portal/reactivate", async (req, res) => {
  const request = parentalControls.portalRequest(req.body.token);
  if (!request) return res.status(403).json({ error: "Le lien de l’espace parent est invalide." });
  const updated = updateDb((db) => {
    const user = db.users.find((entry) => entry.id === request.userId && isUnder13(entry));
    if (!user?.parentalAccess?.reactivationRequestedAt) return null;
    user.parentalAccess = { status: "active", reactivatedAt: new Date().toISOString(), reactivationRequestedAt: null };
    user.sessionVersion = (Number(user.sessionVersion) || 0) + 1;
    return user;
  });
  if (!updated) return res.status(409).json({ error: "Aucune demande de réactivation n’est en attente." });
  await sendParentalActionNotice({ request, portalToken: req.body.token, title: "Accès réactivé", message: `L’accès de ${request.childPseudo} est de nouveau autorisé.` }).catch((error) => console.error("Parental reactivation email failed:", error.message));
  res.json(parentalPortalSummary(request, req.body.date));
});

app.post("/api/auth/request-parental-reactivation", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const db = readDb();
  const user = db.users.find((entry) => normalizeEmail(entry.email) === email && activeParentalRevocation(entry));
  if (!user) return res.json({ ok: true, message: "Si ce compte peut demander une réactivation, son responsable légal recevra un email." });
  const request = parentalControls.approvedGuardians().find((entry) => entry.userId === user.id);
  if (!request) return res.json({ ok: true, message: "Si ce compte peut demander une réactivation, son responsable légal recevra un email." });
  const previousRequestAt = Date.parse(user.parentalAccess?.reactivationRequestedAt ?? "");
  if (Number.isFinite(previousRequestAt) && Date.now() - previousRequestAt < 3600000) return res.json({ ok: true, message: "Une demande de réactivation a déjà été envoyée récemment." });
  user.parentalAccess.reactivationRequestedAt = new Date().toISOString();
  writeDb(db);
  await sendParentalActionNotice({ request, portalToken: request.portalToken, title: "Demande de réactivation", message: `${displayNameFor(user)} demande la réactivation de son accès. Connectez-vous à l’espace parent pour confirmer ou laisser la suspension en place.` }).catch((error) => console.error("Parental reactivation request email failed:", error.message));
  res.json({ ok: true, message: "La demande a été envoyée au responsable légal." });
});

app.post("/api/auth/register", async (req, res) => {
  const settings = platformSettings();
  if (!settings.registrationsEnabled) return res.status(403).json({ error: "Les inscriptions sont temporairement fermées." });
  const pseudo = String(req.body.pseudo ?? "").trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password ?? "");
  if (!validEmail(email)) return res.status(400).json({ error: "Saisis une adresse email valide." });
  if (reservedPublicEmail(email)) return res.status(400).json({ error: "Cette adresse utilise un domaine réservé au service." });
  if (pseudo.length < 3 || pseudo.length > 32 || password.length < 4) return res.status(400).json({ error: "Pseudo ou mot de passe invalide." });
  const age = exactAge(req.body.birthDate);
  if (age === null || req.body.termsVersion !== PRIVACY_VERSION) return res.status(400).json({ error: "Saisis une date de naissance valide et accepte les conditions d’utilisation." });
  const marker = registrationMarker({ deviceId: req.headers["x-registration-device"], ip: req.ip, userAgent: req.headers["user-agent"] }, JWT_SECRET);
  if (age >= 13 && parentalControls.hasRecentMinorRisk({ markers: marker, email, pseudo })) return res.status(429).json({ code: "REGISTRATION_REVIEW_REQUIRED", error: "Une demande pour un compte de moins de 13 ans a récemment été commencée avec des informations ou un appareil similaires. L’inscription est temporairement suspendue afin d’éviter un contournement du parcours parental." });
  if (!emailDeliveryConfigured()) return res.status(503).json({ error: "La validation par email est temporairement indisponible." });
  const passwordHash = await bcrypt.hash(password, 10);
  if (age < 13) {
    const parentEmail = normalizeEmail(req.body.parentEmail);
    if (!validEmail(parentEmail) || parentEmail === email) return res.status(400).json({ error: "Saisis l’adresse email distincte d’un responsable légal." });
    if (!emailDeliveryConfigured()) return res.status(503).json({ error: "Le parcours parental est temporairement indisponible car le service email ne répond pas." });
    const db = readDb();
    if (db.users.some((user) => user.pseudo.toLowerCase() === pseudo.toLowerCase())) return res.status(409).json({ error: "Pseudo déjà utilisé." });
    if (db.users.some((user) => normalizeEmail(user.email) === email)) return res.status(409).json({ error: "Cette adresse email est déjà utilisée." });
    let request;
    try { request = parentalControls.createRequest({ childEmail: email, childPseudo: pseudo, childBirthDate: req.body.birthDate, passwordHash, parentEmail }, marker); }
    catch (error) { return res.status(409).json({ error: String(error.message).includes("UNIQUE") ? "Une demande existe déjà pour cette adresse email." : "La demande parentale n’a pas pu être créée." }); }
    try { await Promise.all([sendParentVerification(request), sendParentalAdminNotice(request)]); }
    catch (error) { console.error("Parental request email delivery failed:", error.message); return res.status(503).json({ code: "EMAIL_DELIVERY_FAILED", error: `Le dossier ${request.code} a été créé, mais un email n’a pas pu être envoyé. Contacte le support avec ce code.` }); }
    return res.status(202).json({ parentalApprovalRequired: true, code: request.code, parentEmail: maskedEmail(parentEmail), message: "La demande a été envoyée au responsable légal. Le compte sera créé après son accord et la validation de l’équipe." });
  }
  const result = updateDb((db) => {
    if (db.users.some((u) => u.pseudo.toLowerCase() === pseudo.toLowerCase())) return null;
    if (db.users.some((u) => normalizeEmail(u.email) === email)) return "email";
    let authorization;
    try { authorization = registrationAuthorization(db, req.body); } catch (error) { return { error: error.message }; }
    const testAdminEmail = NODE_ENV === "test" ? normalizeEmail(process.env.TEST_ADMIN_EMAIL) : "";
    const user = ensureUserSocial({ id: randomUUID(), pseudo, email, emailVerifiedAt: null, passwordHash, tokens: settings.signupTokens, guest: false, admin: Boolean(testAdminEmail && testAdminEmail === email), editor: false, active: true, createdAt: new Date().toISOString(), lastDailyClaim: null, profile: { displayName: pseudo, birthDate: authorization.birthDate }, cosmetics: structuredClone(defaultCosmetics), achievements: normalizeAchievements(), profileStats: normalizeProfileStats() });
    user.registrationAuthorization = authorization;
    db.users.push(user);
    db.transactions.push({ id: randomUUID(), userId: user.id, amount: settings.signupTokens, balance: user.tokens, gameId: null, roomId: null, reason: "signup-bonus", createdAt: new Date().toISOString() });
    refreshPublicProfileStats(user, db);
    return { user, verificationToken: emailDeliveryConfigured() ? issueEmailVerification(user) : "" };
  });
  if (!result) return res.status(409).json({ error: "Pseudo déjà utilisé." });
  if (result === "email") return res.status(409).json({ error: "Cette adresse email est déjà utilisée." });
  if (result.error) return res.status(400).json(result);
  if (result.verificationToken) {
    try { await sendEmailVerification({ user: result.user, token: result.verificationToken, siteName: settings.siteName }); }
    catch (error) { console.error("Email verification delivery failed:", error.message); return res.status(503).json({ code: "EMAIL_DELIVERY_FAILED", error: "Le compte a été créé, mais l'email de validation n'a pas pu être envoyé. Réessaie depuis la connexion." }); }
    if (settings.emailVerificationRequired) return res.status(202).json({ verificationRequired: true, email: maskedEmail(result.user.email), user: sanitizeUser(result.user) });
  }
  res.status(201).json({ token: makeToken(result.user), user: sanitizeUser(result.user), verificationSent: Boolean(result.verificationToken) });
});

app.post("/api/auth/login", async (req, res) => {
  const identifier = String(req.body.login ?? req.body.pseudo ?? "").trim();
  const password = String(req.body.password ?? "");
  const db = readDb();
  const normalizedIdentifier = normalizeEmail(identifier);
  const user = db.users.find((entry) => validEmail(entry.email) ? normalizeEmail(entry.email) === normalizedIdentifier : entry.pseudo.toLowerCase() === identifier.toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "Identifiants invalides." });
  if (user.active === false) return res.status(403).json({ error: "Ce compte est désactivé." });
  const moderation = activeModeration(user);
  if (moderation?.type === "hard") return res.status(403).json({ code: "HARD_BAN", error: "Ce compte est temporairement inaccessible.", reason: moderation.reason ?? "", endsAt: moderation.endsAt ?? "" });
  const parentalRevocation = activeParentalRevocation(user);
  if (parentalRevocation) return res.status(403).json({ code: "PARENTAL_ACCESS_REVOKED", error: "L’accès à ce compte a été suspendu par le responsable légal.", reason: parentalRevocation.reason ?? "", endsAt: parentalRevocation.revokedUntil });
  const settings = platformSettings(db);
  if (settings.emailVerificationRequired && validEmail(user.email) && !user.emailVerifiedAt) {
    if (!emailDeliveryConfigured()) return res.status(503).json({ error: "La validation par email est temporairement indisponible." });
    if (emailVerificationCanBeResent(user)) {
      const token = issueEmailVerification(user);
      writeDb(db);
      try { await sendEmailVerification({ user, token, siteName: settings.siteName }); }
      catch (error) { console.error("Email verification delivery failed:", error.message); return res.status(503).json({ error: "L'email de validation n'a pas pu être envoyé." }); }
    }
    return res.status(403).json({ code: "EMAIL_VERIFICATION_REQUIRED", email: maskedEmail(user.email), error: "Valide ton adresse email avant de te connecter." });
  }
  processAchievementEvent(db, user.id, { type: "account.login", payload: { method: "password" } });
  user.lastLoginAt = new Date().toISOString();
  if (isUnder13(user)) parentalControls.recordActivity(user.id, { day: casinoDateKey(), category: "session", label: "Connexion", count: 1 });
  refreshPublicProfileStats(user, db);
  writeDb(db);
  res.json({ token: makeToken(user), user: sanitizeUser(user) });
});

app.post("/api/auth/verify-email", (req, res) => {
  const user = updateDb((db) => consumeEmailVerification(db.users, req.body.token));
  if (!user) return res.status(400).json({ error: "Ce lien de validation est invalide ou a expiré." });
  res.json({ ok: true, email: maskedEmail(user.email) });
});

app.post("/api/auth/resend-verification", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const settings = platformSettings();
  if (!emailDeliveryConfigured()) return res.json({ ok: true });
  const pending = updateDb((db) => {
    const user = db.users.find((entry) => normalizeEmail(entry.email) === email && !entry.emailVerifiedAt);
    if (!user || !emailVerificationCanBeResent(user)) return null;
    return { user, token: issueEmailVerification(user) };
  });
  if (pending) {
    try { await sendEmailVerification({ user: pending.user, token: pending.token, siteName: settings.siteName }); }
    catch (error) { console.error("Email verification delivery failed:", error.message); }
  }
  res.json({ ok: true });
});

app.post("/api/auth/request-password-reset", async (req, res) => {
  if (!emailDeliveryConfigured()) return res.status(503).json({ error: "La récupération de compte est temporairement indisponible." });
  const email = normalizeEmail(req.body.email);
  const pending = updateDb((db) => {
    if (!validEmail(email)) return null;
    const user = db.users.find((entry) => !entry.guest && entry.active !== false && normalizeEmail(entry.email) === email);
    if (!user || !user.passwordHash || !passwordResetCanBeResent(user)) return null;
    return { user, token: issuePasswordReset(user) };
  });
  if (pending) {
    try { await sendPasswordReset({ user: pending.user, token: pending.token, siteName: platformSettings().siteName }); }
    catch (error) { console.error("Password reset delivery failed:", error.message); }
  }
  res.json({ ok: true, message: "Si cette adresse correspond à un compte, un lien de récupération vient d’être envoyé." });
});

app.post("/api/auth/reset-password", async (req, res) => {
  const token = String(req.body.token ?? "");
  const password = String(req.body.password ?? "");
  if (!token || password.length < 4 || password.length > 128) return res.status(400).json({ error: "Lien invalide ou nouveau mot de passe incorrect." });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = updateDb((db) => {
    const found = consumePasswordReset(db.users, token);
    if (!found) return null;
    found.passwordHash = passwordHash;
    found.sessionVersion = (Number(found.sessionVersion) || 0) + 1;
    found.emailVerifiedAt ??= new Date().toISOString();
    return found;
  });
  if (!user) return res.status(400).json({ error: "Ce lien de récupération est invalide ou a expiré." });
  res.json({ ok: true });
});

app.post("/api/me/email", auth, async (req, res) => {
  if (req.auth.guest) return res.status(400).json({ error: "Les invités ne peuvent pas modifier un compte." });
  const email = normalizeEmail(req.body.email);
  if (!validEmail(email)) return res.status(400).json({ error: "Saisis une adresse email valide." });
  if (reservedPublicEmail(email)) return res.status(400).json({ error: "Cette adresse utilise un domaine réservé au service." });
  const settings = platformSettings();
  if (!emailDeliveryConfigured()) return res.status(503).json({ error: "La validation par email est temporairement indisponible." });
  const result = updateDb((db) => {
    if (db.users.some((entry) => entry.id !== req.auth.id && normalizeEmail(entry.email) === email)) return "duplicate";
    const user = db.users.find((entry) => entry.id === req.auth.id);
    if (!user) return null;
    if (normalizeEmail(user.email) !== email) {
      user.email = email;
      user.emailVerifiedAt = null;
      delete user.emailVerification;
    }
    return { user, verificationToken: emailDeliveryConfigured() ? issueEmailVerification(user) : "" };
  });
  if (!result) return res.status(404).json({ error: "Utilisateur introuvable." });
  if (result === "duplicate") return res.status(409).json({ error: "Cette adresse email est déjà utilisée." });
  if (result.verificationToken) {
    try { await sendEmailVerification({ user: result.user, token: result.verificationToken, siteName: settings.siteName }); }
    catch (error) { console.error("Email verification delivery failed:", error.message); return res.status(503).json({ error: "L'email de validation n'a pas pu être envoyé." }); }
    if (settings.emailVerificationRequired) return res.status(202).json({ verificationRequired: true, email: maskedEmail(result.user.email), user: sanitizeUser(result.user) });
  }
  res.json({ token: makeToken(result.user), user: sanitizeUser(result.user), verificationSent: Boolean(result.verificationToken) });
});

app.post("/api/auth/guest", (req, res) => {
  const settings = platformSettings();
  if (!settings.guestAccessEnabled) return res.status(403).json({ error: "L'accès invité est temporairement fermé." });
  const pseudo = String(req.body.pseudo ?? "").trim() || `Invité-${randomBytes(2).toString("hex")}`;
  const user = ensureUserSocial({ id: randomUUID(), pseudo, tokens: settings.signupTokens, guest: true, cosmetics: structuredClone(defaultCosmetics), achievements: normalizeAchievements(), profileStats: normalizeProfileStats() });
  sessions.set(user.id, user);
  res.json({ token: makeToken(user), user: sanitizeUser(user) });
});

app.get("/api/me", auth, (req, res) => {
  const sessionUser = sessions.get(req.auth.id);
  if (sessionUser) {
    const db = readDb();
    refreshPublicProfileStats(sessionUser, db);
    return res.json(sanitizeUser(sessionUser));
  }
  const user = updateDb((db) => {
    const found = db.users.find((entry) => entry.id === req.auth.id);
    if (!found) return null;
    grantAchievementCosmetics(found);
    refreshPublicProfileStats(found, db);
    return found;
  });
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });
  res.json(sanitizeUser(user));
});

app.get("/api/users/search", auth, (req, res) => {
  const query = String(req.query.q ?? "").trim().toLowerCase();
  if (query.length < 2) return res.json([]);
  const db = readDb();
  const requester = db.users.find((u) => u.id === req.auth.id);
  const rows = db.users
    .filter((user) => user.id !== req.auth.id)
    .filter((user) => user.pseudo.toLowerCase().includes(query) || displayNameFor(ensureUserSocial(user)).toLowerCase().includes(query) || friendCodeFor(user).toLowerCase() === query.replace(/[^a-z0-9]/g, ""))
    .slice(0, 12)
    .map((user) => ({
      ...sanitizeFriendUser(user, db),
      isFriend: requester?.friends?.includes(user.id) ?? false,
      requested: requester?.friendRequests?.outgoing?.includes(user.id) ?? false,
      incoming: requester?.friendRequests?.incoming?.includes(user.id) ?? false
    }));
  res.json(rows);
});

app.get("/api/users/:id/public", auth, (req, res) => {
  const db = readDb();
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "Profil introuvable." });
  res.json(publicUserPayload(user, db, req.auth.id));
});

app.post("/api/tribunal/reports", auth, (req, res) => {
  if (req.auth.guest) return res.status(403).json({ error: "Un compte joueur est requis pour effectuer un signalement." });
  const db = readDb();
  const reporter = db.users.find((user) => user.id === req.auth.id);
  const accused = db.users.find((user) => user.id === String(req.body.accusedId ?? "") && !user.guest);
  if (!reporter || !accused) return res.status(404).json({ error: "Joueur introuvable." });
  const evidence = [];
  const roomCode = String(req.body.roomCode ?? "").trim().toUpperCase();
  if (roomCode) {
    const room = db.rooms.find((entry) => entry.code === roomCode);
    const participants = room?.players?.map((player) => player.id) ?? [];
    if (!room || !participants.includes(reporter.id) || !participants.includes(accused.id)) return res.status(400).json({ error: "Cette table ne peut pas servir de contexte à ce signalement." });
    const aliases = new Map(participants.map((id, index) => [id, id === accused.id ? "Joueur mis en cause" : `Participant ${index + 1}`]));
    const roomIdentities = room.players.flatMap((player) => {
      const registered = db.users.find((entry) => entry.id === player.id);
      return [player.pseudo, registered?.pseudo, registered?.profile?.displayName].filter(Boolean).map((name) => [String(name), aliases.get(player.id) ?? "Participant"]);
    }).sort((left, right) => right[0].length - left[0].length);
    const redactRoomText = (value) => {
      let text = normalizePlainText(value, 500);
      for (const [name, alias] of roomIdentities) text = text.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), alias);
      return text;
    };
    for (const message of chat.list("room", room.id, 30)) {
      evidence.push({ type: "table-chat", label: `Chat de table · ${aliases.get(message.senderId) ?? "Participant"}`, value: redactRoomText(message.content), occurredAt: message.createdAt });
    }
    evidence.push({ type: "table", label: "Contexte de partie vérifié", value: games.find((game) => game.id === room.gameId)?.name || "Partie", occurredAt: new Date().toISOString() });
    const publicLogs = spectatorState(room.state)?.logs ?? [];
    for (const log of publicLogs.filter((entry) => entry.actorId === accused.id).slice(-8)) {
      evidence.push({ type: "journal", label: "Journal · joueur mis en cause", value: redactRoomText(log.text), occurredAt: log.at });
    }
  }
  try {
    const report = tribunal.createReport({
      reporterId: reporter.id,
      accusedId: accused.id,
      category: String(req.body.category ?? ""),
      description: normalizePlainText(req.body.description, 1200),
      evidence,
      context: roomCode ? { type: "room", roomCode } : { type: "profile" }
    });
    const settings = tribunal.settings();
    let openedAutomatically = false;
    if (settings.automaticReviewEnabled && tribunal.pendingReporterCount(accused.id) >= settings.automaticReportThreshold) {
      const reportIds = tribunal.pendingReportIds(accused.id);
      tribunal.openCaseFromReports({ reportIds, adminId: "automatic-rule", source: "automatic", title: "Signalements concordants", summary: "Plusieurs joueurs distincts ont signalé des comportements qui doivent être examinés par le tribunal." });
      openedAutomatically = true;
    }
    res.status(201).json({ ok: true, reportId: report.id, openedAutomatically });
  } catch (error) {
    const messages = {
      INVALID_REPORT_TARGET: "Tu ne peux pas te signaler toi-même.",
      INVALID_REPORT_CATEGORY: "Choisis un motif de signalement valide.",
      REPORT_DESCRIPTION_TOO_SHORT: "Décris les faits en au moins 20 caractères.",
      DUPLICATE_REPORT: "Un signalement similaire a déjà été envoyé au cours des dernières 24 heures."
    };
    res.status(error.message === "DUPLICATE_REPORT" ? 409 : 400).json({ error: messages[error.message] ?? "Le signalement n’a pas pu être enregistré." });
  }
});

app.get("/api/tribunal", auth, (req, res) => {
  settleTribunalCases();
  const db = readDb();
  const user = db.users.find((entry) => entry.id === req.auth.id);
  const eligibility = tribunalEligibility(user, db);
  const settings = tribunal.settings();
  if (eligibility.eligible) {
    const eligibleCaseIds = tribunal.openCases()
      .filter((entry) => entry.accusedId !== user.id)
      .filter((entry) => !tribunal.reporterIdsForCase(entry.id).includes(user.id))
      .filter((entry) => !user.friends?.includes(entry.accusedId))
      .map((entry) => entry.id);
    tribunal.assign(user.id, eligibleCaseIds);
  }
  const cases = eligibility.eligible ? tribunal.jurorCases(user.id)
    .filter((entry) => entry.accusedId !== user.id)
    .filter((entry) => !tribunal.reporterIdsForCase(entry.id).includes(user.id))
    .filter((entry) => !user.friends?.includes(entry.accusedId))
    .map((entry) => {
    const payload = publicTribunalCase(entry, user.id, settings, db);
    if (settings.revealAccusedIdentity) {
      const accused = db.users.find((candidate) => candidate.id === entry.accusedId);
      payload.accused = accused ? displayNameFor(ensureUserSocial(accused)) : "Compte supprimé";
    }
    return payload;
  }) : [];
  res.json({
    eligibility,
    cases,
    categories: tribunalCategories,
    settings: { votingDurationHours: settings.votingDurationHours, minimumVotes: settings.minimumVotes, maximumReward: settings.maximumReward },
    stats: { pending: cases.filter((entry) => entry.status === "voting" && !entry.vote).length, voted: cases.filter((entry) => entry.vote).length, behaviorScore: eligibility.behavior?.score ?? tribunal.behavior(user?.id ?? "").score }
  });
});

app.get("/api/tribunal/availability", auth, (req, res) => {
  const db = readDb();
  const user = db.users.find((entry) => entry.id === req.auth.id);
  const eligibility = tribunalEligibility(user, db);
  if (!eligibility.eligible) return res.json({ available: false, count: 0 });
  const count = tribunal.openCases()
    .filter((entry) => entry.accusedId !== user.id)
    .filter((entry) => !tribunal.reporterIdsForCase(entry.id).includes(user.id))
    .filter((entry) => !user.friends?.includes(entry.accusedId)).length;
  res.json({ available: count > 0, count });
});

app.post("/api/tribunal/cases/:id/vote", auth, (req, res) => {
  const db = readDb();
  const user = db.users.find((entry) => entry.id === req.auth.id);
  const eligibility = tribunalEligibility(user, db);
  if (!eligibility.eligible) return res.status(403).json({ error: eligibility.reason });
  const entry = tribunal.openCases().find((candidate) => candidate.id === req.params.id);
  if (!entry || entry.accusedId === user.id || tribunal.reporterIdsForCase(entry.id).includes(user.id) || user.friends?.includes(entry.accusedId)) return res.status(403).json({ error: "Ce dossier est lié à ton compte et ne peut pas t’être soumis." });
  try {
    const vote = tribunal.vote(req.params.id, user.id, req.body.score, req.body.rationale);
    settleTribunalCases();
    res.json({ ok: true, vote });
  } catch (error) {
    const messages = { INVALID_VOTE: "Le vote doit être compris entre 1 et 5.", CASE_NOT_ASSIGNED: "Ce dossier ne t’est pas affecté.", VOTING_CLOSED: "Le vote de ce dossier est terminé." };
    res.status(error.message === "CASE_NOT_ASSIGNED" ? 403 : 409).json({ error: messages[error.message] ?? "Le vote n’a pas pu être enregistré." });
  }
});

app.get("/api/leaderboards", auth, (req, res) => {
  const db = readDb();
  try {
    const result = buildLeaderboard(db, req.query, req.auth.id, new Date(), games.map((game) => game.id));
    const identities = new Map();
    const decorate = (row) => {
      if (!row) return null;
      if (!identities.has(row.id)) {
        const safe = sanitizeFriendUser(db.users.find((user) => user.id === row.id), db);
        identities.set(row.id, { id: safe.id, pseudo: safe.pseudo, cosmetics: safe.cosmetics, profileStats: safe.profileStats });
      }
      return { ...row, user: identities.get(row.id) };
    };
    res.json({ ...result, rows: result.rows.map(decorate), self: decorate(result.self), games: games.map(({ id, name }) => ({ id, name })) });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get("/api/friends", auth, (req, res) => {
  const result = updateDb((db) => {
    const user = db.users.find((u) => u.id === req.auth.id);
    if (!user) return null;
    normalizeFriendGraph(db);
    user.roomInvites = (user.roomInvites ?? []).filter((invite) => db.rooms.some((room) => room.code === invite.code && !room.finished));
    const byIds = (ids) => ids.map((id) => db.users.find((u) => u.id === id)).filter(Boolean).map((friend) => sanitizeFriendUser(friend, db));
    return {
      friends: byIds(user.friends).map((friend) => ({ ...friend, ...friendRoomPresence(db.rooms, friend.id, user, (roomId, userId) => [...(roomPresence.get(roomId) ?? [])].some((socketId) => io.sockets.sockets.get(socketId)?.data.userId === userId)) })),
      incoming: byIds(user.friendRequests.incoming),
      outgoing: byIds(user.friendRequests.outgoing),
      roomInvites: user.roomInvites.map((invite) => {
        const room = db.rooms.find((row) => row.code === invite.code);
        const from = db.users.find((row) => row.id === invite.fromId);
        return { ...invite, roomName: room?.name, gameId: room?.gameId, from: from ? sanitizeFriendUser(from, db) : null };
      })
    };
  });
  if (!result) return res.status(400).json({ error: "Les amis sont réservés aux comptes enregistrés." });
  res.json(result);
});

app.get("/api/chat/messages", auth, (req, res) => {
  if (req.auth.guest) return res.status(403).json({ error: "Le chat est réservé aux comptes enregistrés." });
  const db = readDb();
  const user = db.users.find((entry) => entry.id === req.auth.id);
  const channel = user ? resolveChatChannel(db, user, req.query) : null;
  if (!channel) return res.status(404).json({ error: "Canal introuvable ou inaccessible." });
  const messages = chat.list(channel.channelType, channel.channelId).map((message) => decorateChatMessage(message, db));
  chat.markRead(user.id, channel.channelType, channel.channelId);
  res.json({ channel: { type: channel.channelType, id: channel.channelId }, messages });
});

app.post("/api/chat/messages", auth, (req, res) => {
  if (req.auth.guest) return res.status(403).json({ error: "Le chat est réservé aux comptes enregistrés." });
  const db = readDb();
  const user = db.users.find((entry) => entry.id === req.auth.id);
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });
  const access = userFeatureAccess(user, "chat", db);
  if (!access.allowed) return rejectFeature(res, access);
  const channel = resolveChatChannel(db, user, req.body);
  if (!channel) return res.status(404).json({ error: "Canal introuvable ou inaccessible." });
  if (!chatRateAllowed(user.id)) return res.status(429).json({ error: "Tu envoies des messages trop rapidement." });
  try {
    const message = decorateChatMessage(chat.add({ channelType: channel.channelType, channelId: channel.channelId, senderId: user.id, content: req.body.content }), db);
    chat.markRead(user.id, channel.channelType, channel.channelId);
    io.to(channel.socketRoom).emit("chat-message", message);
    res.status(201).json(message);
  } catch (error) {
    res.status(400).json({ error: error.message === "INVALID_CHAT_MESSAGE" ? "Écris un message de 500 caractères maximum." : "Le message n’a pas pu être envoyé." });
  }
});

app.post("/api/chat/read", auth, (req, res) => {
  if (req.auth.guest) return res.json({ ok: true });
  const db = readDb();
  const user = db.users.find((entry) => entry.id === req.auth.id);
  const channel = user ? resolveChatChannel(db, user, req.body) : null;
  if (!channel) return res.status(404).json({ error: "Canal introuvable ou inaccessible." });
  chat.markRead(user.id, channel.channelType, channel.channelId);
  res.json({ ok: true });
});

app.get("/api/chat/journal", auth, (req, res) => {
  const db = readDb();
  const user = db.users.find((entry) => entry.id === req.auth.id) ?? sessions.get(req.auth.id);
  const room = user ? chatRoomAccess(db, user.id, req.query.roomCode) : null;
  if (!room) return res.status(404).json({ error: "Table introuvable ou inaccessible." });
  const state = spectatorState(room.state);
  res.json({ room: { code: room.code, name: room.name, gameId: room.gameId }, logs: (state?.logs ?? []).slice(-100) });
});

app.get("/api/notifications", auth, (req, res) => {
  if (req.auth.guest) return res.json([]);
  const db = readDb();
  const user = db.users.find((u) => u.id === req.auth.id);
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });
  ensureUserSocial(user);
  res.json(user.notifications.map((notification) => sanitizeNotification(notification, user)));
});

app.delete("/api/notifications/:id", auth, (req, res) => {
  if (req.auth.guest) return res.json({ ok: true });
  const id = req.params.id;
  updateDb((db) => {
    const user = db.users.find((u) => u.id === req.auth.id);
    if (!user) return;
    ensureUserSocial(user);
    user.notifications = id === "all" ? [] : user.notifications.filter((notification) => notification.id !== id);
  });
  res.json({ ok: true });
});

app.post("/api/friends/request", auth, (req, res) => {
  if (req.auth.guest) return res.status(400).json({ error: "Les amis sont réservés aux comptes enregistrés." });
  const access = userFeatureAccess(getUser(req.auth.id), "friends");
  if (!access.allowed) return rejectFeature(res, access);
  const targetId = String(req.body.userId ?? "");
  const result = updateDb((db) => {
    const user = db.users.find((u) => u.id === req.auth.id);
    const target = db.users.find((u) => u.id === targetId);
    if (!user || !target || user.id === target.id) return "missing";
    ensureUserSocial(user);
    ensureUserSocial(target);
    if (user.friends.includes(target.id)) return "friend";
    if (user.friendRequests.incoming.includes(target.id) || target.friendRequests.outgoing.includes(user.id)) {
      addFriendship(user, target);
      pushNotification(target, {
        type: "friend-accepted",
        title: "Demande acceptée",
        message: `${displayNameFor(user)} est maintenant dans tes amis.`,
        actorId: user.id
      });
      return "accepted";
    }
    if (!user.friendRequests.outgoing.includes(target.id)) user.friendRequests.outgoing.push(target.id);
    if (!target.friendRequests.incoming.includes(user.id)) {
      target.friendRequests.incoming.push(user.id);
      pushNotification(target, {
        type: "friend-request",
        title: "Demande d'ami",
        message: `${displayNameFor(user)} veut t'ajouter en ami.`,
        actorId: user.id
      });
    }
    return true;
  });
  if (result === "missing") return res.status(404).json({ error: "Joueur introuvable." });
  if (result === "friend") return res.status(400).json({ error: "Ce joueur est déjà dans tes amis." });
  res.json({ ok: true });
});

app.post("/api/friends/:id/accept", auth, (req, res) => {
  const access = userFeatureAccess(getUser(req.auth.id), "friends");
  if (!access.allowed) return rejectFeature(res, access);
  const friendId = req.params.id;
  const result = updateDb((db) => {
    const user = db.users.find((u) => u.id === req.auth.id);
    const friend = db.users.find((u) => u.id === friendId);
    if (!user || !friend) return null;
    ensureUserSocial(user);
    ensureUserSocial(friend);
    if (!user.friendRequests.incoming.includes(friend.id)) return "missing";
    user.friendRequests.incoming = user.friendRequests.incoming.filter((id) => id !== friend.id);
    friend.friendRequests.outgoing = friend.friendRequests.outgoing.filter((id) => id !== user.id);
    user.friends = [...new Set([...user.friends, friend.id])];
    friend.friends = [...new Set([...friend.friends, user.id])];
    return true;
  });
  if (!result) return res.status(404).json({ error: "Joueur introuvable." });
  if (result === "missing") return res.status(400).json({ error: "Demande introuvable." });
  res.json({ ok: true });
});

app.post("/api/friends/:id/decline", auth, (req, res) => {
  const friendId = req.params.id;
  updateDb((db) => {
    const user = db.users.find((u) => u.id === req.auth.id);
    const friend = db.users.find((u) => u.id === friendId);
    if (!user || !friend) return;
    ensureUserSocial(user);
    ensureUserSocial(friend);
    user.friendRequests.incoming = user.friendRequests.incoming.filter((id) => id !== friend.id);
    user.friendRequests.outgoing = user.friendRequests.outgoing.filter((id) => id !== friend.id);
    friend.friendRequests.incoming = friend.friendRequests.incoming.filter((id) => id !== user.id);
    friend.friendRequests.outgoing = friend.friendRequests.outgoing.filter((id) => id !== user.id);
  });
  res.json({ ok: true });
});

app.delete("/api/friends/:id", auth, (req, res) => {
  const friendId = req.params.id;
  updateDb((db) => {
    const user = db.users.find((u) => u.id === req.auth.id);
    const friend = db.users.find((u) => u.id === friendId);
    if (!user || !friend) return;
    ensureUserSocial(user);
    ensureUserSocial(friend);
    user.friends = user.friends.filter((id) => id !== friend.id);
    friend.friends = friend.friends.filter((id) => id !== user.id);
  });
  res.json({ ok: true });
});

app.get("/api/shop", (_req, res) => {
  res.json(configuredShop());
});

app.get("/api/achievements", auth, (req, res) => {
  const db = readDb();
  const user = db.users.find((u) => u.id === req.auth.id) ?? sessions.get(req.auth.id);
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });
  res.json(achievementStatus(user, db));
});

app.post("/api/secrets/small-rock/start", auth, (req, res) => {
  if (req.auth.guest) return res.status(400).json({ error: "Secret réservé aux comptes enregistrés." });
  const result = updateDb((db) => {
    const user = db.users.find((entry) => entry.id === req.auth.id);
    if (!user) return null;
    user.secretTimers ??= {};
    const now = Date.now();
    const previous = Number(user.secretTimers.smallRockStartedAt) || 0;
    if (!previous || now - previous >= 1380000) user.secretTimers.smallRockStartedAt = now;
    return { startedAt: user.secretTimers.smallRockStartedAt, unlocked: ensureUserAchievements(user).unlocked.includes("secret-small-rock") };
  });
  if (!result) return res.status(404).json({ error: "Utilisateur introuvable." });
  res.json(result);
});

app.post("/api/secrets/small-rock/claim", auth, (req, res) => {
  if (req.auth.guest) return res.status(400).json({ error: "Secret réservé aux comptes enregistrés." });
  const result = updateDb((db) => {
    const user = db.users.find((entry) => entry.id === req.auth.id);
    if (!user) return { status: "missing" };
    user.secretTimers ??= {};
    const startedAt = Number(user.secretTimers.smallRockStartedAt) || 0;
    const elapsed = startedAt ? Date.now() - startedAt : 0;
    if (!startedAt) return { status: "not-started" };
    if (elapsed < 1320000) return { status: "early", startedAt };
    if (elapsed >= 1380000) {
      user.secretTimers.smallRockStartedAt = Date.now();
      return { status: "late", startedAt: user.secretTimers.smallRockStartedAt };
    }
    return { status: "unlocked", startedAt, unlocked: processAchievementEvent(db, user.id, { type: "account.browser", payload: { browser: "small-rock" } }) };
  });
  if (result.status === "missing") return res.status(404).json({ error: "Utilisateur introuvable." });
  if (result.status === "not-started") return res.status(400).json({ error: "La boucle n’a pas encore commencé." });
  if (result.status === "early") return res.status(400).json({ error: "La pierre reste silencieuse." });
  if (result.status === "late") return res.status(400).json({ error: "La boucle s’est refermée et recommence." });
  res.json(result);
});

const siteActivityTracker = createSiteActivityTracker();
const guardianActivityCursors = new Map();
app.post("/api/me/guardian-activity", auth, (req, res) => {
  const user = readDb().users.find((entry) => entry.id === req.auth.id);
  if (!user || !isUnder13(user)) return res.json({ tracked: false });
  const pageLabels = { lobby: "Accueil", profile: "Profil", leaderboard: "Classements", room: "Table de jeu", spectator: "Partie observée", event: "Événement", admin: "Administration" };
  const page = Object.hasOwn(pageLabels, req.body.page) ? req.body.page : "lobby";
  const now = Date.now();
  const previous = guardianActivityCursors.get(user.id);
  const seconds = previous && now - previous.at >= 5000 && now - previous.at <= 90000 ? Math.floor((now - previous.at) / 1000) : 0;
  guardianActivityCursors.set(user.id, { at: now, page });
  parentalControls.recordActivity(user.id, { day: casinoDateKey(now), category: "navigation", label: pageLabels[page], count: previous?.page === page ? 0 : 1, durationSeconds: seconds }, now);
  res.json({ tracked: true });
});
app.get("/api/me/activity-config", auth, (req, res) => {
  const db = readDb();
  res.json({ markers: allowedUrlMarkers(achievementCatalog(db)) });
});

app.post("/api/me/privacy", auth, (req, res) => {
  if (req.auth.guest) return res.status(403).json({ error: "Compte requis." });
  try {
    const result = updateDb((db) => {
      const user = db.users.find((entry) => entry.id === req.auth.id);
      if (!user) throw new Error("Compte introuvable.");
      const consent = setActivityConsent(user, req.body);
      if (!consent.enabled) {
        siteActivityTracker.forget(user.id);
        for (const entry of achievementCatalog(db)) if (["site.visit", "site.activity", "account.browser", "table.activity", "game.round.activity"].includes(entry.rule?.event) || Object.hasOwn(tableTimeMetrics, entry.rule?.metric ?? "")) delete user.achievementProgress?.[entry.id];
      }
      return consent;
    });
    res.json(result);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post("/api/me/activity", auth, (req, res) => {
  const user = readDb().users.find((entry) => entry.id === req.auth.id);
  if (req.auth.guest || !validActivityConsent(user)) return res.status(403).json({ error: "Suivi facultatif desactive." });
  if (req.body.active === false) { siteActivityTracker.forget(user.id); return res.json({ unlocked: [] }); }
  try {
    const unlocked = updateDb((db) => {
      const found = db.users.find((entry) => entry.id === user.id);
      const room = req.body.page === "room" ? db.rooms.find((entry) => entry.code === String(req.body.roomCode ?? "").slice(0, 20).toUpperCase()) : null;
      const events = siteActivityTracker.record(found, req.body, req.headers["user-agent"], allowedUrlMarkers(achievementCatalog(db)), Date.now(), tableActivityContext(room, found.id));
      const ids = events.flatMap((event) => processAchievementEvent(db, found.id, event, ["table.activity", "game.round.activity"].includes(event.type) ? room : null));
      if (events.some((event) => event.type === "site.visit")) ids.push(...processAchievementEvent(db, found.id, { type: "account.browser", payload: { browser: events[0].payload.browser } }));
      return [...new Set(ids)];
    });
    res.json({ unlocked });
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post("/api/secrets/:secret", auth, (req, res) => {
  if (req.auth.guest) return res.status(400).json({ error: "Secret réservé aux comptes enregistrés." });
  if (!validActivityConsent(readDb().users.find((entry) => entry.id === req.auth.id))) return res.status(403).json({ error: "Suivi facultatif desactive." });
  const secret = req.params.secret;
  const ua = String(req.headers["user-agent"] ?? "");
  const id = secret === "answer-42" ? "secret-42" : secret === "browser" ? (/Firefox/i.test(ua) ? "secret-firefox" : /Edg\//i.test(ua) ? "secret-edge" : /Chrome/i.test(ua) ? "secret-chrome" : "") : "";
  const browser = secret === "answer-42" ? "answer-42" : id === "secret-firefox" ? "firefox" : id === "secret-edge" ? "edge" : id === "secret-chrome" ? "chrome" : "";
  if (!id) return res.status(400).json({ error: "Rien à découvrir ici." });
  const unlocked = updateDb((db) => {
    const user = db.users.find((entry) => entry.id === req.auth.id);
    return secret === "answer-42" ? [] : processAchievementEvent(db, user.id, { type: "account.browser", payload: { browser } });
  });
  res.json({ unlocked });
});

function adminOverview(db) {
  const users = db.users.filter((user) => !user.guest);
  const activeRooms = db.rooms.filter((room) => !room.finished);
  const today = casinoDateKey();
  const todayHistory = archiveDays(db.history, today, today);
  const todayTransactions = archiveDays(db.transactions, today, today);
  const weekStart = shiftDateKey(today, -6);
  const activePlayersToday = new Set(todayHistory.flatMap((game) => (game.players ?? []).filter((player) => !player.isBot).map((player) => player.id)).filter(Boolean));
  const customShopIds = new Set((db.settings?.customShopItems ?? []).map((item) => item.id));
  const gamesCatalog = configuredGames(db);
  const shopCatalog = configuredShop(db);
  const achievementsCatalog = achievementCatalog(db, { includeDisabled: true });
  const events = db.communityEvents ?? [];
  const transactionTotal = (positive) => todayTransactions.reduce((total, entry) => {
    const amount = Number(entry.amount) || 0;
    return total + (positive ? Math.max(0, amount) : Math.max(0, -amount));
  }, 0);
  return {
    users: {
      total: users.length,
      active: users.filter((user) => user.active !== false).length,
      inactive: users.filter((user) => user.active === false).length,
      admins: users.filter((user) => user.admin).length,
      pendingVerification: users.filter((user) => validEmail(user.email) && !user.emailVerifiedAt).length,
      legacyLogins: users.filter((user) => !validEmail(user.email)).length,
      newToday: users.filter((user) => casinoDateKey(user.createdAt) === today).length,
      new7d: users.filter((user) => {
        const created = casinoDateKey(user.createdAt);
        return created && created >= weekStart && created <= today;
      }).length
    },
    rooms: {
      active: activeRooms.length,
      playing: activeRooms.filter((room) => room.state).length,
      waiting: activeRooms.filter((room) => !room.state).length,
      seatedHumans: activeRooms.reduce((total, room) => total + room.players.filter((player) => !player.isBot).length, 0),
      seatedBots: activeRooms.reduce((total, room) => total + room.players.filter((player) => player.isBot).length, 0)
    },
    activity: { gamesToday: todayHistory.length, gamesTotal: db.history.length, activePlayersToday: activePlayersToday.size },
    economy: {
      circulatingTokens: users.reduce((total, user) => total + Math.max(0, Number(user.tokens) || 0), 0),
      creditsToday: transactionTotal(true),
      debitsToday: transactionTotal(false),
      transactionsToday: todayTransactions.length
    },
    catalog: {
      games: gamesCatalog.length,
      enabledGames: gamesCatalog.filter((game) => game.enabled !== false).length,
      disabledGames: gamesCatalog.filter((game) => game.enabled === false).length,
      shopItems: shopCatalog.length,
      customShopItems: customShopIds.size,
      achievements: achievementsCatalog.length,
      disabledAchievements: achievementsCatalog.filter((achievement) => achievement.enabled === false).length
    },
    events: {
      active: events.filter((event) => event.status === "active").length,
      scheduled: events.filter((event) => event.status === "scheduled").length,
      draft: events.filter((event) => event.status === "draft").length
    },
    activeRooms: activeRooms.slice(0, 6).map((room) => ({ id: room.id, code: room.code, name: room.name, gameId: room.gameId, players: room.players.length, playing: Boolean(room.state), createdAt: room.createdAt })),
    recentUsers: users.filter((user) => user.createdAt).sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).slice(0, 5).map((user) => ({ id: user.id, displayName: displayNameFor(user), emailVerified: Boolean(user.emailVerifiedAt), legacyLogin: !validEmail(user.email), active: user.active !== false, createdAt: user.createdAt }))
  };
}

function adminMetrics(db, requestedDays = 90) {
  const days = [30, 90, 365].includes(Number(requestedDays)) ? Number(requestedDays) : 90;
  const users = db.users.filter((user) => !user.guest);
  const now = new Date();
  const todayKey = casinoDateKey(now);
  const startKey = shiftDateKey(todayKey, -days + 1);
  const inRange = (value) => {
    const key = casinoDateKey(value);
    return Boolean(key && key >= startKey && key <= todayKey);
  };
  const signupDates = new Map(users.map((user) => {
    const fallback = user.createdAt ? null : archiveRows(db.transactions, { userId: user.id, reason: "signup-bonus" }, { limit: 1 })[0]?.createdAt;
    return [user.id, user.createdAt ?? fallback ?? null];
  }));
  const histories = archiveDays(db.history, startKey, todayKey);
  const transactions = archiveDays(db.transactions, startKey, todayKey);
  const daily = new Map();
  for (let index = 0; index < days; index += 1) {
    const key = shiftDateKey(startKey, index);
    daily.set(key, { date: key, games: 0, participants: new Set(), pot: 0, credits: 0, debits: 0, net: 0, transactions: 0, bonuses: 0, bonusAmount: 0, signups: 0, eventActions: 0, eventParticipants: new Set(), eventDamage: 0, eventContribution: 0, eventPotInflow: 0, eventPurchases: 0, eventPurchaseRevenue: 0 });
  }
  for (const user of users) {
    const key = casinoDateKey(signupDates.get(user.id));
    if (daily.has(key)) daily.get(key).signups += 1;
  }
  for (const row of histories) {
    const bucket = daily.get(casinoDateKey(row.finishedAt));
    if (!bucket) continue;
    bucket.games += 1;
    bucket.pot += Math.max(0, Number(row.pot) || 0);
    for (const player of row.players ?? []) if (!player.isBot) bucket.participants.add(player.id);
  }
  for (const entry of transactions) {
    const bucket = daily.get(casinoDateKey(entry.createdAt));
    if (!bucket) continue;
    const amount = Number(entry.amount) || 0;
    bucket.transactions += 1;
    bucket.net += amount;
    if (amount >= 0) bucket.credits += amount;
    else bucket.debits += Math.abs(amount);
    if (entry.userId) bucket.participants.add(entry.userId);
    if (entry.reason === "daily-claim") {
      bucket.bonuses += 1;
      bucket.bonusAmount += amount;
    }
  }
  const allCommunityEvents = db.communityEvents ?? [];
  const allEventParticipants = db.communityEventParticipants ?? [];
  const periodEventActions = archiveDays(db.communityEventActions, startKey, todayKey);
  const periodEventPotEntries = archiveDays(db.communityEventPotEntries, startKey, todayKey);
  const periodEventRewards = (db.communityEventRewards ?? []).filter((entry) => inRange(entry.distributedAt));
  const periodEventTransactions = transactions.filter((entry) => entry.eventId);
  const periodEventJoins = allEventParticipants.filter((entry) => inRange(entry.joinedAt));
  for (const entry of periodEventActions) {
    const bucket = daily.get(casinoDateKey(entry.createdAt));
    if (!bucket) continue;
    bucket.eventActions += 1;
    if (entry.userId) bucket.eventParticipants.add(entry.userId);
    bucket.eventDamage += Math.max(0, Number(entry.result?.damage) || 0);
    bucket.eventContribution += Math.max(0, Number(entry.result?.contribution) || 0);
  }
  for (const participant of periodEventJoins) {
    const bucket = daily.get(casinoDateKey(participant.joinedAt));
    if (bucket && participant.userId) bucket.eventParticipants.add(participant.userId);
  }
  for (const entry of periodEventPotEntries) {
    const bucket = daily.get(casinoDateKey(entry.createdAt));
    if (bucket && Number(entry.amount) > 0) bucket.eventPotInflow += Number(entry.amount) || 0;
  }
  for (const entry of periodEventTransactions.filter((row) => row.reason === "community-event-action-purchase")) {
    const bucket = daily.get(casinoDateKey(entry.createdAt));
    if (!bucket) continue;
    bucket.eventPurchases += Math.max(1, Number(entry.eventPurchaseQuantity) || 1);
    bucket.eventPurchaseRevenue += Math.abs(Math.min(0, Number(entry.amount) || 0));
  }
  const eventRows = allCommunityEvents.map((event) => {
    const participants = allEventParticipants.filter((entry) => entry.eventId === event.id);
    const actions = periodEventActions.filter((entry) => entry.eventId === event.id);
    const potEntries = periodEventPotEntries.filter((entry) => entry.eventId === event.id);
    const eventTransactions = periodEventTransactions.filter((entry) => entry.eventId === event.id);
    const rewards = periodEventRewards.filter((entry) => entry.eventId === event.id);
    const activeParticipantIds = new Set([
      ...actions.map((entry) => entry.userId),
      ...participants.filter((entry) => inRange(entry.joinedAt)).map((entry) => entry.userId)
    ].filter(Boolean));
    const purchaseRows = eventTransactions.filter((entry) => entry.reason === "community-event-action-purchase");
    const entryRows = eventTransactions.filter((entry) => entry.reason === "community-event-entry");
    const rewardTransactions = eventTransactions.filter((entry) => entry.reason === "community-event-reward");
    return {
      id: event.id,
      name: event.name,
      status: event.status,
      gameType: event.game?.type ?? "dice",
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      progress: eventProgress(event),
      currentValue: Number(event.runtime?.currentValue) || 0,
      objectiveMax: Number(event.objective?.max) || 0,
      currentPot: Math.max(0, Number(event.runtime?.pot) || 0),
      participants: participants.length,
      activeParticipants: activeParticipantIds.size,
      joins: participants.filter((entry) => inRange(entry.joinedAt)).length,
      actions: actions.length,
      totalActions: Number(event.runtime?.actionCount) || 0,
      paidActions: actions.filter((entry) => entry.paid).length,
      criticalActions: actions.filter((entry) => entry.result?.critical).length,
      damage: actions.reduce((sum, entry) => sum + Math.max(0, Number(entry.result?.damage) || 0), 0),
      contribution: actions.reduce((sum, entry) => sum + Math.max(0, Number(entry.result?.contribution) || 0), 0),
      potInflow: potEntries.filter((entry) => Number(entry.amount) > 0).reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
      potOutflow: Math.abs(potEntries.filter((entry) => Number(entry.amount) < 0).reduce((sum, entry) => sum + Number(entry.amount || 0), 0)),
      entryRevenue: Math.abs(entryRows.reduce((sum, entry) => sum + Math.min(0, Number(entry.amount) || 0), 0)),
      purchaseRevenue: Math.abs(purchaseRows.reduce((sum, entry) => sum + Math.min(0, Number(entry.amount) || 0), 0)),
      purchasedActions: purchaseRows.reduce((sum, entry) => sum + Math.max(1, Number(entry.eventPurchaseQuantity) || 1), 0),
      rewardsDistributed: rewardTransactions.reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0),
      rewardedPlayers: new Set(rewards.map((entry) => entry.userId)).size,
      milestonesReached: (event.runtime?.reachedMilestones ?? []).length,
      milestonesTotal: (event.objective?.milestones ?? []).length
    };
  }).sort((left, right) => right.actions - left.actions || right.participants - left.participants);
  const eventParticipantMetrics = new Map();
  for (const action of periodEventActions) {
    const row = eventParticipantMetrics.get(action.userId) ?? { id: action.userId, pseudo: displayNameFor(users.find((user) => user.id === action.userId) ?? { pseudo: "Joueur" }), actions: 0, paidActions: 0, criticalActions: 0, damage: 0, contribution: 0, events: new Set() };
    row.actions += 1;
    row.paidActions += action.paid ? 1 : 0;
    row.criticalActions += action.result?.critical ? 1 : 0;
    row.damage += Math.max(0, Number(action.result?.damage) || 0);
    row.contribution += Math.max(0, Number(action.result?.contribution) || 0);
    const event = allCommunityEvents.find((entry) => entry.id === action.eventId);
    if (event) row.events.add(event.name);
    eventParticipantMetrics.set(action.userId, row);
  }
  const topEventParticipants = [...eventParticipantMetrics.values()].map((entry) => ({ ...entry, events: [...entry.events] })).sort((left, right) => right.contribution - left.contribution || right.damage - left.damage).slice(0, 15);
  const eventStatusCounts = ["draft", "scheduled", "active", "finished", "cancelled"].map((status) => ({ id: status, status, count: allCommunityEvents.filter((event) => event.status === status).length }));
  const dailySeries = [...daily.values()].map((entry) => ({ ...entry, activePlayers: entry.participants.size, eventParticipants: entry.eventParticipants.size, participants: undefined }));
  const activeInPeriod = new Set(dailySeries.flatMap((entry) => []));
  for (const row of histories) for (const player of row.players ?? []) if (!player.isBot) activeInPeriod.add(player.id);
  for (const entry of transactions) if (entry.userId && users.some((user) => user.id === entry.userId)) activeInPeriod.add(entry.userId);

  const gameMetrics = configuredGames(db).map((game) => {
    const rows = histories.filter((row) => row.gameId === game.id);
    const realPlayers = rows.flatMap((row) => (row.players ?? []).filter((player) => !player.isBot));
    const bots = rows.flatMap((row) => (row.players ?? []).filter((player) => player.isBot));
    const uniquePlayers = new Set(realPlayers.map((player) => player.id));
    const pot = rows.reduce((sum, row) => sum + (Number(row.pot) || 0), 0);
    return { id: game.id, name: game.name, type: game.type, games: rows.length, uniquePlayers: uniquePlayers.size, seats: realPlayers.length + bots.length, realSeats: realPlayers.length, botSeats: bots.length, averagePlayers: rows.length ? (realPlayers.length + bots.length) / rows.length : 0, botRate: realPlayers.length + bots.length ? bots.length / (realPlayers.length + bots.length) : 0, pot, averagePot: rows.length ? pot / rows.length : 0 };
  }).sort((left, right) => right.games - left.games);

  const reasonMetrics = Object.values(transactions.reduce((groups, entry) => {
    const reason = entry.reason ?? "adjustment";
    groups[reason] ??= { reason, count: 0, volume: 0, net: 0, credits: 0, debits: 0 };
    const amount = Number(entry.amount) || 0;
    groups[reason].count += 1;
    groups[reason].volume += Math.abs(amount);
    groups[reason].net += amount;
    if (amount >= 0) groups[reason].credits += amount;
    else groups[reason].debits += Math.abs(amount);
    return groups;
  }, {})).sort((left, right) => right.volume - left.volume);

  const userActivity = users.map((user) => {
    const rows = histories.filter((row) => row.players?.some((player) => player.id === user.id) || row.winners?.includes(user.id));
    const userTransactions = transactions.filter((entry) => entry.userId === user.id);
    return { id: user.id, pseudo: displayNameFor(ensureUserSocial(user)), tokens: Math.max(0, Number(user.tokens) || 0), games: rows.length, wins: rows.filter((row) => row.winners?.includes(user.id)).length, transactions: userTransactions.length, spent: Math.abs(userTransactions.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + Number(entry.amount || 0), 0)), earned: userTransactions.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + Number(entry.amount || 0), 0) };
  });
  const balances = users.map((user) => Math.max(0, Number(user.tokens) || 0)).sort((left, right) => left - right);
  const medianBalance = balances.length ? (balances[Math.floor((balances.length - 1) / 2)] + balances[Math.floor(balances.length / 2)]) / 2 : 0;
  const balanceBuckets = [
    { label: "0", min: 0, max: 0 }, { label: "1–999", min: 1, max: 999 }, { label: "1k–4,9k", min: 1000, max: 4999 },
    { label: "5k–19,9k", min: 5000, max: 19999 }, { label: "20k–99,9k", min: 20000, max: 99999 }, { label: "100k+", min: 100000, max: Infinity }
  ].map((bucket) => ({ ...bucket, count: balances.filter((value) => value >= bucket.min && value <= bucket.max).length }));

  const catalog = configuredShop(db);
  const ownedCounts = new Map();
  const equippedCounts = new Map();
  for (const user of users) {
    const cosmetics = normalizeCosmetics(user.cosmetics);
    for (const type of shopTypes) for (const value of cosmetics[type]) ownedCounts.set(`${type}:${value}`, (ownedCounts.get(`${type}:${value}`) ?? 0) + 1);
    for (const [type, equippedKey] of Object.entries(cosmeticEquippedKeys)) {
      const value = cosmetics.equipped[equippedKey];
      equippedCounts.set(`${type}:${value}`, (equippedCounts.get(`${type}:${value}`) ?? 0) + 1);
    }
  }
  const shopOwnership = catalog.map((item) => ({ id: item.id, name: item.name, type: item.type, category: item.category, price: Number(item.price) || 0, owners: ownedCounts.get(`${item.type}:${item.value}`) ?? 0, equipped: equippedCounts.get(`${item.type}:${item.value}`) ?? 0, rewardOnly: Boolean(item.rewardOnly) })).sort((left, right) => right.owners - left.owners || right.equipped - left.equipped);
  const shopTransactions = transactions.filter((entry) => ["shop-purchase", "shop-pack-purchase"].includes(entry.reason));

  const catalogAchievements = achievementCatalog();
  const achievementCounts = new Map(catalogAchievements.map((entry) => [entry.id, 0]));
  let totalUnlocked = 0;
  for (const user of users) {
    const statuses = achievementStatus(user, db);
    for (const status of statuses) if (status.unlocked) {
      totalUnlocked += 1;
      achievementCounts.set(status.id, (achievementCounts.get(status.id) ?? 0) + 1);
    }
  }
  const achievementMetrics = catalogAchievements.map((entry) => ({ id: entry.id, title: entry.title, group: entry.group, gameId: entry.gameId ?? null, secret: Boolean(entry.secret), milestone: Boolean(entry.milestone), unlocked: achievementCounts.get(entry.id) ?? 0, rate: users.length ? (achievementCounts.get(entry.id) ?? 0) / users.length : 0 })).sort((left, right) => right.unlocked - left.unlocked);

  const byWeekday = Array.from({ length: 7 }, (_, weekday) => ({ weekday, games: 0 }));
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, games: 0 }));
  for (const row of histories) {
    const parts = casinoTimeParts(row.finishedAt);
    if (!parts) continue;
    byWeekday[parts.weekday].games += 1;
    byHour[parts.hour].games += 1;
  }
  const activeFor = (numberOfDays) => {
    const cutoffKey = shiftDateKey(todayKey, -numberOfDays + 1);
    const ids = new Set();
    const userIds = new Set(users.map((user) => user.id));
    for (const row of archiveDays(db.history, cutoffKey, todayKey)) for (const player of row.players ?? []) if (!player.isBot) ids.add(player.id);
    for (const entry of archiveDays(db.transactions, cutoffKey, todayKey)) if (userIds.has(entry.userId)) ids.add(entry.userId);
    return ids.size;
  };
  const totalCredits = transactions.filter((entry) => Number(entry.amount) >= 0).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const totalDebits = Math.abs(transactions.filter((entry) => Number(entry.amount) < 0).reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
  const bonusRows = transactions.filter((entry) => entry.reason === "daily-claim");
  const activeRooms = db.rooms.filter((room) => !room.finished);
  return {
    generatedAt: new Date().toISOString(),
    days,
    summary: { accounts: users.length, activeAccounts: users.filter((user) => user.active !== false).length, newAccounts: users.filter((user) => inRange(signupDates.get(user.id))).length, activePlayers: activeInPeriod.size, games: histories.length, totalGames: db.history.length, transactions: transactions.length, circulation: balances.reduce((sum, value) => sum + value, 0), credits: totalCredits, debits: totalDebits, net: totalCredits - totalDebits, pots: histories.reduce((sum, row) => sum + Number(row.pot || 0), 0) },
    activity: { daily: dailySeries, active1d: activeFor(1), active7d: activeFor(7), active30d: activeFor(30), byWeekday, byHour, averageGamesPerDay: histories.length / days, averageActivePlayersPerDay: dailySeries.reduce((sum, entry) => sum + entry.activePlayers, 0) / days },
    users: { balanceAverage: users.length ? balances.reduce((sum, value) => sum + value, 0) / users.length : 0, balanceMedian: medianBalance, balanceBuckets, zeroBalance: balances.filter((value) => value === 0).length, topWealth: [...userActivity].sort((left, right) => right.tokens - left.tokens).slice(0, 10), topActive: [...userActivity].sort((left, right) => right.games - left.games || right.transactions - left.transactions).slice(0, 10), topWinners: [...userActivity].filter((entry) => entry.games).sort((left, right) => right.wins - left.wins || right.games - left.games).slice(0, 10) },
    games: gameMetrics,
    economy: { reasons: reasonMetrics, bonuses: { claims: bonusRows.length, amount: bonusRows.reduce((sum, entry) => sum + Number(entry.amount || 0), 0), average: bonusRows.length ? bonusRows.reduce((sum, entry) => sum + Number(entry.amount || 0), 0) / bonusRows.length : 0, averageMultiplier: bonusRows.length ? bonusRows.reduce((sum, entry) => sum + Number(entry.dailyBonusMultiplier || 1), 0) / bonusRows.length : 0 } },
    shop: { catalogItems: catalog.length, customItems: catalog.filter((item) => item.id.startsWith("custom-")).length, purchases: shopTransactions.length, revenue: Math.abs(shopTransactions.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)), averageInventory: users.length ? [...ownedCounts.values()].reduce((sum, value) => sum + value, 0) / users.length : 0, ownership: shopOwnership.slice(0, 20) },
    achievements: { catalog: catalogAchievements.length, unlocked: totalUnlocked, averagePerUser: users.length ? totalUnlocked / users.length : 0, completionRate: users.length && catalogAchievements.length ? totalUnlocked / (users.length * catalogAchievements.length) : 0, common: achievementMetrics.slice(0, 10), rare: achievementMetrics.filter((entry) => entry.unlocked > 0).sort((left, right) => left.unlocked - right.unlocked).slice(0, 10), neverUnlocked: achievementMetrics.filter((entry) => entry.unlocked === 0).length, secretUnlocked: achievementMetrics.filter((entry) => entry.secret).reduce((sum, entry) => sum + entry.unlocked, 0) },
    communityEvents: {
      summary: {
        total: allCommunityEvents.length,
        active: allCommunityEvents.filter((event) => event.status === "active").length,
        scheduled: allCommunityEvents.filter((event) => event.status === "scheduled").length,
        joins: periodEventJoins.length,
        uniqueParticipants: new Set([...periodEventJoins.map((entry) => entry.userId), ...periodEventActions.map((entry) => entry.userId)].filter(Boolean)).size,
        actions: periodEventActions.length,
        paidActions: periodEventActions.filter((entry) => entry.paid).length,
        criticalActions: periodEventActions.filter((entry) => entry.result?.critical).length,
        damage: periodEventActions.reduce((sum, entry) => sum + Math.max(0, Number(entry.result?.damage) || 0), 0),
        contribution: periodEventActions.reduce((sum, entry) => sum + Math.max(0, Number(entry.result?.contribution) || 0), 0),
        currentPot: allCommunityEvents.filter((event) => ["scheduled", "active"].includes(event.status)).reduce((sum, event) => sum + Math.max(0, Number(event.runtime?.pot) || 0), 0),
        potInflow: periodEventPotEntries.filter((entry) => Number(entry.amount) > 0).reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
        potOutflow: Math.abs(periodEventPotEntries.filter((entry) => Number(entry.amount) < 0).reduce((sum, entry) => sum + Number(entry.amount || 0), 0)),
        purchaseRevenue: Math.abs(periodEventTransactions.filter((entry) => entry.reason === "community-event-action-purchase").reduce((sum, entry) => sum + Math.min(0, Number(entry.amount) || 0), 0)),
        entryRevenue: Math.abs(periodEventTransactions.filter((entry) => entry.reason === "community-event-entry").reduce((sum, entry) => sum + Math.min(0, Number(entry.amount) || 0), 0)),
        rewardsDistributed: periodEventTransactions.filter((entry) => entry.reason === "community-event-reward").reduce((sum, entry) => sum + Math.max(0, Number(entry.amount) || 0), 0)
      },
      statuses: eventStatusCounts,
      events: eventRows,
      topParticipants: topEventParticipants
    },
    rooms: { active: activeRooms.length, playing: activeRooms.filter((room) => room.state).length, waiting: activeRooms.filter((room) => !room.state).length, public: activeRooms.filter((room) => room.isPublic).length, private: activeRooms.filter((room) => !room.isPublic).length, seatedPlayers: activeRooms.reduce((sum, room) => sum + room.players.filter((player) => !player.isBot).length, 0), seatedBots: activeRooms.reduce((sum, room) => sum + room.players.filter((player) => player.isBot).length, 0) }
  };
}

function adminUserDetail(db, user) {
  ensureUserSocial(user);
  refreshPublicProfileStats(user, db);
  const profile = normalizePublicProfile(user.profile, user.pseudo);
  const transactions = [...new Map([
    ...archiveRows(db.transactions, { userId: user.id }, { descending: true, limit: 500 }),
    ...archiveRows(db.transactions, { userId: user.id, reason: "daily-claim" }, { descending: true, limit: 365 })
  ].map((entry) => [entry.id, { ...entry }])).values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const history = archiveRows(db.history, { memberId: user.id }, { descending: true, limit: 250 })
    .map((row) => ({
      id: row.id,
      roomId: row.roomId ?? null,
      gameId: row.gameId,
      name: row.name ?? "",
      code: row.code ?? "",
      finishedAt: row.finishedAt,
      pot: Number(row.pot) || 0,
      won: row.winners?.includes(user.id) ?? false,
      players: (row.players ?? []).map((player, index) => {
        const registered = db.users.find((entry) => entry.id === player.id);
        const ranking = Array.isArray(row.ranking) ? row.ranking.find((entry) => entry.id === player.id || entry.playerId === player.id) : null;
        return {
          id: player.id,
          pseudo: registered ? displayNameFor(registered) : player.pseudo || `Joueur ${index + 1}`,
          isBot: Boolean(player.isBot),
          won: row.winners?.includes(player.id) ?? false,
          rank: ranking?.rank ?? ranking?.position ?? null,
          score: ranking?.score ?? player.score ?? null
        };
      }),
      winners: (row.winners ?? []).map((winnerId) => {
        const winner = db.users.find((entry) => entry.id === winnerId);
        return winner ? displayNameFor(winner) : winnerId;
      }),
      score: row.players?.find((player) => player.id === user.id)?.score ?? null
    }));
  const catalog = configuredShop(db).map(({ id, type, value, name, category, rewardOnly = false, icon = "" }) => ({ id, type, value, name, category, rewardOnly, icon }));
  const achievements = achievementStatus(user, db).map((entry) => {
    const source = achievementCatalog().find((candidate) => candidate.id === entry.id);
    return { ...entry, description: source?.description ?? entry.description };
  });
  const statistics = playerStatistics(db, user.id);
  const relation = (id) => {
    const related = db.users.find((entry) => entry.id === id && !entry.guest);
    return related ? { id: related.id, displayName: displayNameFor(ensureUserSocial(related)), active: related.active !== false } : null;
  };
  const activeRooms = db.rooms.filter((room) => !room.finished && room.players?.some((player) => player.id === user.id)).map((room) => ({ id: room.id, code: room.code, name: room.name, gameId: room.gameId, playing: Boolean(room.state), owner: room.ownerId === user.id }));
  const moderationEntryActive = (entry) => entry?.active === true && (!entry.endsAt || Date.parse(entry.endsAt) > Date.now());
  return {
    user: {
      id: user.id,
      login: user.email ?? user.pseudo,
      legacyLogin: !validEmail(user.email),
      emailVerified: Boolean(user.emailVerifiedAt),
      displayName: profile.displayName,
      birthDate: profile.birthDate,
      gender: profile.gender,
      bio: profile.bio,
      favoriteGames: profile.favoriteGames,
      tokens: Math.max(0, Number(user.tokens) || 0),
      active: user.active !== false,
      admin: Boolean(user.admin),
      editor: Boolean(user.editor),
      createdAt: user.createdAt ?? transactions.find((entry) => entry.reason === "signup-bonus")?.createdAt ?? null,
      lastLoginAt: user.lastLoginAt ?? null,
      lastDailyClaim: user.lastDailyClaim ?? null,
      friendCode: friendCodeFor(user),
      hasPassword: Boolean(user.passwordHash),
      profileStats: normalizeProfileStats(user.profileStats),
      minor: isUnder13(user),
      moderation: {
        softBan: { active: moderationEntryActive(user.moderation?.softBan), reason: user.moderation?.softBan?.reason ?? "", endsAt: user.moderation?.softBan?.endsAt ?? "" },
        hardBan: { active: moderationEntryActive(user.moderation?.hardBan), reason: user.moderation?.hardBan?.reason ?? "", endsAt: user.moderation?.hardBan?.endsAt ?? "" }
      }
    },
    inventory: { cosmetics: normalizeCosmetics(user.cosmetics), catalog },
    achievements,
    history,
    transactions,
    statistics: {
      gamesPlayed: statistics.gamesPlayed,
      wins: statistics.wins,
      winRate: statistics.gamesPlayed ? Math.round((statistics.wins / statistics.gamesPlayed) * 100) : 0,
      transactions: statistics.transactions,
      credits: statistics.credits,
      debits: statistics.debits,
      staked: statistics.staked,
      shopSpent: statistics.shopSpent,
      shopPurchases: statistics.shopPurchases,
      dailyClaims: statistics.dailyClaims
    },
    relationships: {
      friends: user.friends.map(relation).filter(Boolean),
      incoming: user.friendRequests.incoming.map(relation).filter(Boolean),
      outgoing: user.friendRequests.outgoing.map(relation).filter(Boolean)
    },
    security: {
      sessionVersion: Math.max(0, Number(user.sessionVersion) || 0),
      emailVerificationPending: Boolean(user.emailVerification),
      emailVerificationSentAt: user.emailVerification?.sentAt ?? null,
      emailVerificationExpiresAt: user.emailVerification?.expiresAt ?? null,
      passwordResetPending: Boolean(user.passwordReset),
      passwordResetSentAt: user.passwordReset?.sentAt ?? null,
      passwordResetExpiresAt: user.passwordReset?.expiresAt ?? null
    },
    tribunal: {
      behavior: tribunal.behavior(user.id),
      reports: tribunal.reportStats(user.id)
    },
    activeRooms,
    bonus: {
      status: dailyBonusStatus(user, db),
      recentClaims: transactions.filter((entry) => entry.reason === "daily-claim").slice(0, 30)
    }
  };
}

const communityEventHelpers = {
  addTokens,
  grantCosmetic(db, userId, itemId) {
    const user = db.users.find((entry) => entry.id === userId);
    const item = configuredShop(db).find((entry) => entry.id === itemId);
    if (!user || !item || !shopTypes.includes(item.type)) return false;
    const cosmetics = ensureUserCosmetics(user);
    cosmetics[item.type] = [...new Set([...(cosmetics[item.type] ?? []), item.value])];
    return true;
  }
};

function activateCommunityEvent(db, event, now = new Date()) {
  if (event.status === "active") return false;
  event.status = "active";
  event.startedAtActual ??= now.toISOString();
  event.runtime.currentValue ??= event.objective.startValue;
  event.runtime.startedAt ??= now.toISOString();
  if (!event.runtime.potInitialized) {
    event.runtime.potInitialized = true;
    if (event.pot.initial) appendEventPotEntry(db, event, event.pot.initial, "initial");
  }
  return true;
}

function finishCommunityEvent(db, event, now = new Date()) {
  if (event.status === "finished" && event.runtime.finalizedAt) return false;
  event.status = "finished";
  event.finishedAtActual ??= now.toISOString();
  calculateCommunityEventRewards(db, event, communityEventHelpers);
  return true;
}

function syncCommunityEventLifecycle(db, event, now = new Date()) {
  let changed = false;
  const timestamp = now.getTime();
  const activeEffect = (effect) => !effect.expiresAt || new Date(effect.expiresAt).getTime() > timestamp;
  const eventEffectsBefore = event.runtime.activeEffects?.length ?? 0;
  event.runtime.activeEffects = (event.runtime.activeEffects ?? []).filter(activeEffect);
  if (event.runtime.activeEffects.length !== eventEffectsBefore) changed = true;
  for (const participant of db.communityEventParticipants.filter((row) => row.eventId === event.id)) {
    const before = participant.activeEffects?.length ?? 0;
    participant.activeEffects = (participant.activeEffects ?? []).filter(activeEffect);
    if (participant.activeEffects.length !== before) changed = true;
  }
  const storedBefore = db.communityEventEffects.length;
  db.communityEventEffects = db.communityEventEffects.filter(activeEffect);
  if (storedBefore !== db.communityEventEffects.length) changed = true;
  if (event.status === "scheduled" && event.autoStart && timestamp >= new Date(event.startsAt).getTime()) changed = activateCommunityEvent(db, event, now) || changed;
  if (event.status !== "active") return changed;
  const objectiveReached = (event.runtime.currentValue ?? event.objective.startValue) <= event.objective.minimum;
  if (objectiveReached && event.objective.finishAtMinimum && !event.objective.continueAfterCompletion) return finishCommunityEvent(db, event, now) || changed;
  if (event.autoFinish && timestamp >= new Date(event.endsAt).getTime()) return finishCommunityEvent(db, event, now) || changed;
  return changed;
}

function publicCommunityEvent(db, event, userId = "") {
  const copy = structuredClone(event);
  delete copy.internalName;
  if (copy.runtime) delete copy.runtime.communityDeck;
  const participant = db.communityEventParticipants.find((row) => row.eventId === event.id && row.userId === userId);
  const reward = db.communityEventRewards.find((row) => row.eventId === event.id && row.userId === userId) ?? null;
  const potentialReward = reward ?? potentialCommunityEventReward(db, event, participant);
  const leaderboard = eventLeaderboard(db, event, db.users).map((row) => ({
    rank: row.rank,
    userId: row.userId,
    pseudo: displayNameFor(db.users.find((user) => user.id === row.userId) ?? { pseudo: row.pseudo }),
    contribution: row.contribution,
    damage: row.damage,
    actions: row.actions,
    potAdded: row.potAdded,
    bestAction: row.bestAction,
    communityEffects: row.communityEffects
  }));
  const recentActions = archiveRows(db.communityEventActions, { eventId: event.id }, { descending: true, limit: event.limits.recentActivityLimit })
    .map((row) => ({ ...row, pseudo: displayNameFor(db.users.find((user) => user.id === row.userId) ?? { pseudo: "Joueur" }), requestId: undefined }));
  const personalActions = participant ? archiveRows(db.communityEventActions, { eventId: event.id, userId }, { descending: true, limit: 100 }).map((row) => ({ ...row, requestId: undefined })) : [];
  const safeParticipant = participant ? {
    id: participant.id,
    joinedAt: participant.joinedAt,
    lastActivityAt: participant.lastActivityAt,
    actions: participant.actions,
    diceRolls: participant.diceRolls,
    cardsDrawn: participant.cardsDrawn,
    damage: participant.damage,
    contribution: participant.contribution,
    tokensSpent: participant.tokensSpent,
    potAdded: participant.potAdded,
    bonusesTriggered: participant.bonusesTriggered,
    communityEffects: participant.communityEffects,
    bestAction: participant.bestAction,
    bestCombination: participant.bestCombination,
    purchasesTotal: participant.purchasesTotal,
    overflowPurchasesTotal: participant.overflowPurchasesTotal ?? 0,
    activeEffects: (participant.activeEffects ?? []).map((effect) => ({ id: effect.id, sourceEffectId: effect.sourceEffectId, milestoneId: effect.milestoneId, type: effect.type, value: effect.value, target: effect.target, stat: effect.stat, label: effect.label, appliedAt: effect.appliedAt, expiresAt: effect.expiresAt })),
    availability: eventActionAvailability(event, participant, db)
  } : null;
  return {
    event: copy,
    progress: eventProgress(event),
    participant: safeParticipant,
    reward,
    potentialReward,
    personalRank: participant ? leaderboard.find((row) => row.userId === userId)?.rank ?? db.communityEventParticipants.filter((row) => row.eventId === event.id).sort((a, b) => b.contribution - a.contribution || b.damage - a.damage).findIndex((row) => row.userId === userId) + 1 : null,
    nextMilestone: event.objective.milestones.find((row) => row.percent > eventProgress(event)) ?? null,
    leaderboard,
    recentActions,
    personalActions,
    recentPotEntries: archiveRows(db.communityEventPotEntries, { eventId: event.id }, { descending: true, limit: 20 }),
    serverNow: new Date().toISOString()
  };
}

function communityEventCarouselCard(db, event, userId = "") {
  const participant = db.communityEventParticipants.find((row) => row.eventId === event.id && row.userId === userId);
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    shortDescription: event.shortDescription,
    status: event.status,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    progress: eventProgress(event),
    theme: {
      primary: event.theme.primary,
      secondary: event.theme.secondary,
      accent: event.theme.accent,
      heroImage: event.theme.heroImage,
      icon: event.theme.icon
    },
    runtime: {
      participantCount: event.runtime.participantCount,
      actionCount: event.runtime.actionCount,
      pot: event.runtime.pot
    },
    participant: participant ? {
      contribution: participant.contribution,
      actions: participant.actions
    } : null
  };
}

function getCommunityEvent(db, idOrSlug) {
  return db.communityEvents.find((event) => event.id === idOrSlug || event.slug === String(idOrSlug).toLowerCase());
}

function emitCommunityEvent(event) {
  io.emit("community-event-update", { id: event.id, slug: event.slug, updatedAt: new Date().toISOString() });
}

function communityEventAdminDetail(db, event) {
  const participants = db.communityEventParticipants.filter((row) => row.eventId === event.id);
  const actions = archiveRows(db.communityEventActions, { eventId: event.id }, { descending: true, limit: 200 });
  const rewards = db.communityEventRewards.filter((row) => row.eventId === event.id);
  const effects = db.communityEventEffects.filter((row) => row.eventId === event.id);
  const potEntries = archiveRows(db.communityEventPotEntries, { eventId: event.id }, { descending: true, limit: 300 });
  return {
    event,
    validation: validateCommunityEvent(event),
    metrics: {
      participants: participants.length,
      actions: Number(event.runtime?.actionCount) || actions.length,
      damage: participants.reduce((sum, row) => sum + row.damage, 0),
      contribution: participants.reduce((sum, row) => sum + row.contribution, 0),
      tokensSpent: participants.reduce((sum, row) => sum + row.tokensSpent, 0),
      pot: event.runtime.pot,
      progress: eventProgress(event)
    },
    participants: eventLeaderboard(db, event, db.users, 100),
    actions,
    rewards,
    effects,
    potEntries
  };
}

const communityEventActionLimiter = rateLimit({ windowMs: 60000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false });

app.get("/api/community-events/featured", auth, (req, res) => {
  const db = readDb();
  let changed = false;
  for (const event of db.communityEvents) changed = syncCommunityEventLifecycle(db, event) || changed;
  if (changed) writeDb(db);
  const visible = db.communityEvents.filter((event) => event.status === "active" || (event.status === "scheduled" && event.showBeforeStart));
  visible.sort((left, right) => {
    if (left.status !== right.status) return left.status === "active" ? -1 : 1;
    return new Date(left.startsAt) - new Date(right.startsAt);
  });
  res.json(visible[0] ? publicCommunityEvent(db, visible[0], req.auth.id) : null);
});

app.get("/api/community-events/carousel", auth, (req, res) => {
  const db = readDb();
  let changed = false;
  for (const event of db.communityEvents) changed = syncCommunityEventLifecycle(db, event) || changed;
  if (changed) writeDb(db);
  const visible = db.communityEvents
    .filter((event) => event.status === "active" || event.status === "finished" || (event.status === "scheduled" && event.showBeforeStart))
    .sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt));
  let focusIndex = visible.findIndex((event) => event.status === "active");
  if (focusIndex < 0) focusIndex = visible.findIndex((event) => event.status === "scheduled");
  if (focusIndex < 0) focusIndex = Math.max(0, visible.length - 1);
  res.json({
    events: visible.map((event) => communityEventCarouselCard(db, event, req.auth.id)),
    focusIndex,
    serverNow: new Date().toISOString()
  });
});

app.get("/api/community-events/:slug", auth, (req, res) => {
  const db = readDb();
  const event = getCommunityEvent(db, req.params.slug);
  if (!event || event.status === "draft" || event.status === "cancelled" || (event.status === "scheduled" && !event.showBeforeStart)) return res.status(404).json({ error: "Événement introuvable." });
  const changed = syncCommunityEventLifecycle(db, event);
  if (changed) writeDb(db);
  res.json(publicCommunityEvent(db, event, req.auth.id));
});

app.get("/api/community-events/:id/leaderboards", auth, (req, res) => {
  const db = readDb();
  const event = getCommunityEvent(db, req.params.id);
  if (!event || ["draft", "cancelled"].includes(event.status)) return res.status(404).json({ error: "Événement introuvable." });
  res.json(publicCommunityEvent(db, event, req.auth.id).leaderboard);
});

app.post("/api/community-events/:id/join", auth, communityEventActionLimiter, (req, res) => {
  if (req.auth.guest) return res.status(403).json({ error: "Crée un compte pour participer aux événements communautaires." });
  const access = userFeatureAccess(getUser(req.auth.id), "community-events");
  if (!access.allowed) return rejectFeature(res, access);
  try {
    const result = updateDb((db) => {
      const event = getCommunityEvent(db, req.params.id);
      const user = db.users.find((entry) => entry.id === req.auth.id);
      if (!event || !user) throw new Error("Événement ou joueur introuvable.");
      syncCommunityEventLifecycle(db, event);
      joinCommunityEvent(db, event, user, communityEventHelpers, normalizePlainText(req.body.requestId, 100));
      return { payload: publicCommunityEvent(db, event, user.id), user: sanitizeUser(user, db), event };
    });
    emitCommunityEvent(result.event);
    res.json({ ...result.payload, user: result.user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/community-events/:id/actions/purchase", auth, communityEventActionLimiter, (req, res) => {
  if (req.auth.guest) return res.status(403).json({ error: "Crée un compte pour acheter des actions." });
  const access = userFeatureAccess(getUser(req.auth.id), "community-events");
  if (!access.allowed) return rejectFeature(res, access);
  const requestId = normalizePlainText(req.body.requestId, 100);
  if (!requestId) return res.status(400).json({ error: "Identifiant d’achat manquant." });
  try {
    const result = updateDb((db) => {
      const event = getCommunityEvent(db, req.params.id);
      const user = db.users.find((entry) => entry.id === req.auth.id);
      const participant = db.communityEventParticipants.find((row) => row.eventId === event?.id && row.userId === req.auth.id);
      if (!event || !user || !participant) throw new Error("Rejoins d’abord l’événement.");
      syncCommunityEventLifecycle(db, event);
      const purchase = purchaseCommunityEventActions(db, event, participant, req.body.count, user, communityEventHelpers, requestId);
      return { payload: publicCommunityEvent(db, event, user.id), quote: purchase.quote ?? null, user: sanitizeUser(user, db), event };
    });
    emitCommunityEvent(result.event);
    res.json({ ...result.payload, purchaseQuote: result.quote, user: result.user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/community-events/:id/actions/quote", auth, communityEventActionLimiter, (req, res) => {
  try {
    const db = readDb();
    const event = getCommunityEvent(db, req.params.id);
    const participant = db.communityEventParticipants.find((row) => row.eventId === event?.id && row.userId === req.auth.id);
    if (!event || !participant) throw new Error("Rejoins d’abord l’événement.");
    if (event.status !== "active" || !event.actions.allowPurchase) throw new Error("L’achat d’actions n’est pas disponible.");
    const quote = quoteCommunityEventActions(event, participant, req.body.count);
    res.json({ quote, availability: eventActionAvailability(event, participant, db) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/community-events/:id/actions", auth, communityEventActionLimiter, (req, res) => {
  if (req.auth.guest) return res.status(403).json({ error: "Crée un compte pour agir pendant l’événement." });
  const access = userFeatureAccess(getUser(req.auth.id), "community-events");
  if (!access.allowed) return rejectFeature(res, access);
  const requestId = normalizePlainText(req.body.requestId, 100);
  if (!requestId) return res.status(400).json({ error: "Identifiant d’action manquant." });
  try {
    const result = updateDb((db) => {
      const event = getCommunityEvent(db, req.params.id);
      const user = db.users.find((entry) => entry.id === req.auth.id);
      const participant = db.communityEventParticipants.find((row) => row.eventId === event?.id && row.userId === req.auth.id);
      if (!event || !participant || !user) throw new Error("Rejoins d’abord l’événement.");
      syncCommunityEventLifecycle(db, event);
      const action = performCommunityEventAction(db, event, participant, communityEventHelpers, requestId);
      syncCommunityEventLifecycle(db, event);
      return { action, payload: publicCommunityEvent(db, event, req.auth.id), user: sanitizeUser(user, db), event };
    });
    emitCommunityEvent(result.event);
    res.json({ ...result.payload, action: result.action, user: result.user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/admin/community-events", auth, requireBackOffice, (req, res) => {
  const db = readDb();
  let changed = false;
  for (const event of db.communityEvents) changed = syncCommunityEventLifecycle(db, event) || changed;
  if (changed) writeDb(db);
  res.json(db.communityEvents.map((event) => communityEventAdminDetail(db, event)).sort((a, b) => new Date(b.event.startsAt) - new Date(a.event.startsAt)));
});

app.get("/api/admin/community-events/:id", auth, requireBackOffice, (req, res) => {
  const db = readDb();
  const event = getCommunityEvent(db, req.params.id);
  if (!event) return res.status(404).json({ error: "Événement introuvable." });
  res.json(communityEventAdminDetail(db, event));
});

app.post("/api/admin/community-events", auth, requireBackOffice, (req, res) => {
  const result = updateDb((db) => {
    const event = normalizeCommunityEvent({ ...defaultCommunityEvent(), ...req.body, status: "draft", id: randomUUID() });
    if (!event.slug || db.communityEvents.some((row) => row.slug === event.slug)) return { error: "Ce slug est déjà utilisé." };
    event.createdAt = new Date().toISOString();
    event.createdById = req.auth.id;
    db.communityEvents.push(event);
    return { detail: communityEventAdminDetail(db, event) };
  });
  if (result.error) return res.status(409).json(result);
  res.status(201).json(result.detail);
});

app.post("/api/admin/community-events/preview", auth, requireBackOffice, (req, res) => {
  try {
    const event = normalizeCommunityEvent(req.body);
    const fakeDb = { communityEvents: [event], communityEventParticipants: [], communityEventActions: [], communityEventPotEntries: [], communityEventRewards: [], communityEventEffects: [], users: [{ id: "preview", pseudo: "Prévisualisation", tokens: 100000000 }] };
    event.status = "active";
    event.runtime.currentValue = event.objective.startValue;
    const participant = joinCommunityEvent(fakeDb, event, fakeDb.users[0], { addTokens() {} }, "preview-join");
    const action = performCommunityEventAction(fakeDb, event, participant, { addTokens() {} }, randomUUID());
    res.json({ event, action, progress: eventProgress(event), validation: validateCommunityEvent(event) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.patch("/api/admin/community-events/:id", auth, requireBackOffice, (req, res) => {
  const result = updateDb((db) => {
    const current = getCommunityEvent(db, req.params.id);
    if (!current) return { status: 404, error: "Événement introuvable." };
    const next = normalizeCommunityEvent({ ...req.body, id: current.id, status: current.status, runtime: current.runtime, createdAt: current.createdAt, createdById: current.createdById, startedAtActual: current.startedAtActual, finishedAtActual: current.finishedAtActual, cancelledAt: current.cancelledAt }, current);
    if (db.communityEvents.some((row) => row.id !== current.id && row.slug === next.slug)) return { status: 409, error: "Ce slug est déjà utilisé." };
    if (current.status === "finished") return { status: 409, error: "Cet événement est terminé : sa configuration est désormais archivée en lecture seule." };
    if ((Boolean(current.startedAtActual) || current.status === "active") && (next.slug !== current.slug || next.startsAt !== current.startsAt)) return { status: 409, error: "L’adresse publique et la date de début restent fixes après le lancement. Tous les autres paramètres peuvent encore être ajustés." };
    if (!["draft", "cancelled"].includes(current.status)) {
      const errors = validateCommunityEvent(next);
      if (errors.length) return { status: 400, error: errors.join(" ") };
    }
    next.updatedAt = new Date().toISOString();
    db.communityEvents[db.communityEvents.indexOf(current)] = next;
    return { status: 200, detail: communityEventAdminDetail(db, next) };
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  emitCommunityEvent(result.detail.event);
  res.json(result.detail);
});

app.post("/api/admin/community-events/:id/duplicate", auth, requireBackOffice, (req, res) => {
  const result = updateDb((db) => {
    const source = getCommunityEvent(db, req.params.id);
    if (!source) return null;
    const copy = normalizeCommunityEvent({ ...structuredClone(source), id: randomUUID(), internalName: `${source.internalName} · copie`, name: `${source.name} · copie`, slug: `${source.slug}-copie-${randomUUID().slice(0, 4)}`, status: "draft", startedAtActual: null, finishedAtActual: null, runtime: defaultCommunityEvent().runtime });
    copy.createdAt = new Date().toISOString();
    copy.createdById = req.auth.id;
    db.communityEvents.push(copy);
    return communityEventAdminDetail(db, copy);
  });
  if (!result) return res.status(404).json({ error: "Événement introuvable." });
  res.status(201).json(result);
});

app.post("/api/admin/community-events/:id/status", auth, requireAdmin, (req, res) => {
  const requested = String(req.body.status ?? "");
  if (!["scheduled", "active", "finished", "cancelled"].includes(requested)) return res.status(400).json({ error: "Statut invalide." });
  const result = updateDb((db) => {
    const event = getCommunityEvent(db, req.params.id);
    if (!event) return { status: 404, error: "Événement introuvable." };
    const errors = validateCommunityEvent(event);
    if (["scheduled", "active"].includes(requested) && errors.length) return { status: 400, error: errors.join(" ") };
    if (event.status === "finished") return { status: 409, error: "Un événement terminé ne peut pas être relancé." };
    if (requested === "scheduled") event.status = "scheduled";
    if (requested === "active") activateCommunityEvent(db, event);
    if (requested === "finished") finishCommunityEvent(db, event);
    if (requested === "cancelled") { event.status = "cancelled"; event.cancelledAt = new Date().toISOString(); }
    return { status: 200, detail: communityEventAdminDetail(db, event) };
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  emitCommunityEvent(result.detail.event);
  res.json(result.detail);
});

app.post("/api/admin/community-events/:id/pot", auth, requireAdmin, (req, res) => {
  const amount = Math.trunc(Number(req.body.amount));
  if (!Number.isFinite(amount) || !amount) return res.status(400).json({ error: "Montant invalide." });
  const result = updateDb((db) => {
    const event = getCommunityEvent(db, req.params.id);
    if (!event) return null;
    if ((Number(event.runtime.pot) || 0) + amount < 0) throw new Error("Le pot ne peut pas devenir négatif.");
    appendEventPotEntry(db, event, amount, "admin-adjustment", { adminId: req.auth.id, note: normalizePlainText(req.body.note, 160) });
    return communityEventAdminDetail(db, event);
  });
  if (!result) return res.status(404).json({ error: "Événement introuvable." });
  emitCommunityEvent(result.event);
  res.json(result);
});

app.delete("/api/admin/community-events/:id", auth, requireAdmin, (req, res) => {
  const result = updateDb((db) => {
    const event = getCommunityEvent(db, req.params.id);
    if (!event) return "missing";
    if (["active", "finished"].includes(event.status)) return "locked";
    db.communityEvents = db.communityEvents.filter((row) => row.id !== event.id);
    db.communityEventParticipants = db.communityEventParticipants.filter((row) => row.eventId !== event.id);
    db.communityEventActions = db.communityEventActions.filter((row) => row.eventId !== event.id);
    db.communityEventPotEntries = db.communityEventPotEntries.filter((row) => row.eventId !== event.id);
    db.communityEventRewards = db.communityEventRewards.filter((row) => row.eventId !== event.id);
    db.communityEventEffects = db.communityEventEffects.filter((row) => row.eventId !== event.id);
    return "deleted";
  });
  if (result === "missing") return res.status(404).json({ error: "Événement introuvable." });
  if (result === "locked") return res.status(409).json({ error: "Un événement lancé ou terminé doit être conservé pour l’historique financier." });
  res.json({ ok: true });
});

app.get("/api/admin", auth, requireBackOffice, (req, res) => {
  const db = readDb();
  const isAdministrator = Boolean(req.backOfficeUser?.admin);
  const settings = platformSettings(db);
  const registeredUsers = db.users.filter((user) => !user.guest).map((user) => {
    const statistics = playerStatistics(db, user.id);
    const signupTransaction = user.createdAt ? null : archiveRows(db.transactions, { userId: user.id, reason: "signup-bonus" }, { limit: 1 })[0];
    return { id: user.id, login: user.email ?? user.pseudo, legacyLogin: !validEmail(user.email), emailVerified: Boolean(user.emailVerifiedAt), displayName: displayNameFor(user), bio: user.profile?.bio ?? "", tokens: user.tokens, active: user.active !== false, admin: Boolean(user.admin), editor: Boolean(user.editor), gamesPlayed: statistics.gamesPlayed, wins: statistics.wins, lastDailyClaim: user.lastDailyClaim ?? null, createdAt: user.createdAt ?? signupTransaction?.createdAt ?? null, lastLoginAt: user.lastLoginAt ?? null };
  });
  const permissions = {
    role: isAdministrator ? "admin" : "editor",
    manageUsers: isAdministrator,
    manageGames: isAdministrator,
    manageSettings: isAdministrator,
    editBuiltInShopItems: isAdministrator,
    createCustomShopItems: true,
    editCustomShopItems: true,
    manageCommunityEvents: true,
    operateCommunityEvents: isAdministrator,
    manageAchievements: isAdministrator
  };
  res.json({
    users: isAdministrator ? registeredUsers : [],
    games: isAdministrator ? configuredGames(db).map((game) => game.id === "texas-holdem" ? {
      ...game,
      minPokerBuyIn: settings.minPokerBuyIn,
      pokerDefaultBigBlind: settings.pokerDefaultBigBlind,
      pokerTurnSeconds: settings.pokerTurnSeconds
    } : game) : [],
    shop: configuredShop(db),
    achievements: isAdministrator ? achievementCatalog(db, { includeDisabled: true }) : [],
    achievementRuleSchemas: isAdministrator ? achievementRuleSchemas(configuredGames(db), configuredShop(db), achievementCatalog(db, { includeDisabled: true })) : null,
    pricing: shopPricingMatrix(db),
    permissions,
    settings: { ...settings, emailVerificationAvailable: emailDeliveryConfigured() },
    overview: isAdministrator ? adminOverview(db) : { catalog: { shopItems: configuredShop(db).length, customShopItems: db.settings?.customShopItems?.length ?? 0 } }
  });
});

app.get("/api/admin/tribunal", auth, requireAdmin, (_req, res) => {
  settleTribunalCases();
  res.json(tribunalAdminPayload());
});

app.patch("/api/admin/tribunal/settings", auth, requireAdmin, (req, res) => {
  res.json(tribunal.updateSettings(req.body ?? {}));
});

app.post("/api/admin/tribunal/reports/:id/dismiss", auth, requireAdmin, (req, res) => {
  const dismissed = tribunal.dismissReport(req.params.id, req.auth.id, req.body.note);
  if (!dismissed) return res.status(404).json({ error: "Signalement introuvable ou déjà traité." });
  res.json({ ok: true });
});

app.post("/api/admin/tribunal/cases", auth, requireAdmin, (req, res) => {
  try {
    const created = tribunal.openCaseFromReports({
      reportIds: req.body.reportIds,
      adminId: req.auth.id,
      title: req.body.title,
      summary: req.body.summary,
      votingDurationHours: req.body.votingDurationHours,
      minimumVotes: req.body.minimumVotes,
      hardBanDays: req.body.hardBanDays,
      socialBanDays: req.body.socialBanDays
    });
    res.status(201).json(created);
  } catch (error) {
    const messages = { REPORT_REQUIRED: "Sélectionne au moins un signalement.", REPORT_NOT_AVAILABLE: "Un signalement sélectionné a déjà été traité.", REPORT_TARGET_MISMATCH: "Tous les signalements d’un dossier doivent viser le même joueur." };
    res.status(400).json({ error: messages[error.message] ?? "Le dossier n’a pas pu être ouvert." });
  }
});

app.post("/api/admin/tribunal/cases/:id/resolve", auth, requireAdmin, (req, res) => {
  const resolved = tribunal.resolveDue(Date.now(), req.params.id);
  if (!resolved.length) return res.status(409).json({ error: "Ce dossier ne contient encore aucun vote ou n’est plus ouvert." });
  settleTribunalCases();
  res.json({ ok: true, case: resolved[0] });
});

app.post("/api/admin/tribunal/cases/:id/dismiss", auth, requireAdmin, (req, res) => {
  const dismissed = tribunal.dismissCase(req.params.id, req.auth.id, req.body.note);
  if (!dismissed) return res.status(404).json({ error: "Dossier introuvable ou déjà clôturé." });
  res.json({ ok: true });
});

app.post("/api/admin/tribunal/cases/:id/enforce", auth, requireAdmin, (req, res) => {
  const result = applyTribunalDecision(req.params.id, req.body, req.auth.id);
  if (result.error === "missing") return res.status(404).json({ error: "Aucune décision n’attend de confirmation pour ce dossier." });
  if (result.error === "user") return res.status(404).json({ error: "Le compte concerné n’existe plus." });
  res.json({ ok: true, case: result.entry });
});

app.post("/api/admin/tribunal/cases/enforce-batch", auth, requireAdmin, (req, res) => {
  const ids = [...new Set((Array.isArray(req.body.caseIds) ? req.body.caseIds : []).map(String))].slice(0, 100);
  if (!ids.length) return res.status(400).json({ error: "Sélectionne au moins un dossier." });
  const applied = [];
  const skipped = [];
  for (const caseId of ids) {
    const result = applyTribunalDecision(caseId, req.body, req.auth.id);
    if (result.entry) applied.push(result.entry.id);
    else skipped.push(caseId);
  }
  res.json({ ok: true, applied, skipped });
});

app.get("/api/admin/users/:id", auth, requireAdmin, (req, res) => {
  const db = readDb();
  const target = db.users.find((entry) => entry.id === req.params.id && !entry.guest);
  if (!target) return res.status(404).json({ error: "Joueur introuvable." });
  res.json(adminUserDetail(db, target));
});

app.post("/api/admin/users/:id/send-verification", auth, requireAdmin, async (req, res) => {
  if (!emailDeliveryConfigured()) return res.status(503).json({ error: "Le service email n’est pas configuré." });
  const pending = updateDb((db) => {
    const target = db.users.find((entry) => entry.id === req.params.id && !entry.guest);
    if (!target) return "missing";
    if (!validEmail(target.email)) return "email";
    return { user: target, token: issueEmailVerification(target), siteName: platformSettings(db).siteName };
  });
  if (pending === "missing") return res.status(404).json({ error: "Joueur introuvable." });
  if (pending === "email") return res.status(400).json({ error: "Ce compte ne possède pas encore d’adresse email valide." });
  try {
    await sendEmailVerification({ user: pending.user, token: pending.token, siteName: pending.siteName });
    res.json({ ok: true });
  } catch (error) {
    console.error("Admin email verification delivery failed:", error.message);
    res.status(503).json({ error: "L’email de validation n’a pas pu être envoyé." });
  }
});

app.post("/api/admin/users/:id/email-validation", auth, requireAdmin, (req, res) => {
  const result = updateDb((db) => {
    const target = db.users.find((entry) => entry.id === req.params.id && !entry.guest);
    if (!target) return "missing";
    if (!validEmail(target.email)) return "email";
    if (req.body.verified === false) target.emailVerifiedAt = null;
    else {
      target.emailVerifiedAt = new Date().toISOString();
      delete target.emailVerification;
    }
    return true;
  });
  if (result === "missing") return res.status(404).json({ error: "Joueur introuvable." });
  if (result === "email") return res.status(400).json({ error: "Ce compte ne possède pas encore d’adresse email valide." });
  res.json({ ok: true });
});

app.post("/api/admin/users/:id/revoke-sessions", auth, requireAdmin, (req, res) => {
  if (req.params.id === req.auth.id) return res.status(400).json({ error: "Utilise la déconnexion pour fermer ta propre session." });
  const found = updateDb((db) => {
    const target = db.users.find((entry) => entry.id === req.params.id && !entry.guest);
    if (!target) return false;
    target.sessionVersion = (Number(target.sessionVersion) || 0) + 1;
    delete target.passwordReset;
    return true;
  });
  if (!found) return res.status(404).json({ error: "Joueur introuvable." });
  res.json({ ok: true });
});

app.get("/api/admin/metrics", auth, requireAdmin, (req, res) => {
  res.json(adminMetrics(readDb(), req.query.days));
});

app.get("/api/admin/health", auth, requireAdmin, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(serverHealthPayload(req.query.points));
});

app.get("/api/admin/health/logs", auth, requireAdmin, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(requestLogs.query(req.query));
});

app.get("/api/admin/status", auth, requireAdmin, (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(statusMonitor.payload(7, { includeFutureUpdates: true }));
});

app.put("/api/admin/status/settings", auth, requireAdmin, (req, res) => {
  try {
    const settings = statusMonitor.updateStatusSettings(req.body ?? {});
    res.json({ settings, status: statusMonitor.payload(7, { includeFutureUpdates: true }) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Paramètres invalides." });
  }
});

app.post("/api/admin/status/incidents", auth, requireAdmin, (req, res) => {
  try {
    const incident = statusMonitor.createIncident(req.body ?? {}, req.auth.id);
    res.status(201).json({ incident, status: statusMonitor.payload(7, { includeFutureUpdates: true }) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Incident invalide." });
  }
});

app.patch("/api/admin/status/incidents/:id", auth, requireAdmin, (req, res) => {
  try {
    const incident = statusMonitor.updateIncident(req.params.id, req.body ?? {});
    if (!incident) return res.status(404).json({ error: "Incident introuvable." });
    res.json({ incident, status: statusMonitor.payload(7, { includeFutureUpdates: true }) });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Incident invalide." });
  }
});

app.get("/api/admin/patchnotes", auth, requireBackOffice, (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ currentVersion: patchnotes.currentVersion, notes: patchnotes.list({ includeDrafts: true, includeReactions: true }) });
});

app.put("/api/admin/patchnotes/settings", auth, requireBackOffice, (req, res) => {
  try { res.json({ currentVersion: patchnotes.setCurrentVersion(req.body?.currentVersion) }); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Version invalide." }); }
});

app.get("/api/admin/patchnotes/:id", auth, requireBackOffice, (req, res) => {
  const note = patchnotes.get(req.params.id, { includeDrafts: true, includeReactions: true });
  if (!note) return res.status(404).json({ error: "Patchnote introuvable." });
  res.json(note);
});

app.post("/api/admin/patchnotes", auth, requireBackOffice, (req, res) => {
  try { res.status(201).json(patchnotes.create(req.body ?? {}, req.auth.id)); }
  catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Patchnote invalide." }); }
});

app.patch("/api/admin/patchnotes/:id", auth, requireBackOffice, (req, res) => {
  try {
    const note = patchnotes.update(req.params.id, req.body ?? {});
    if (!note) return res.status(404).json({ error: "Patchnote introuvable." });
    res.json(note);
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Patchnote invalide." }); }
});

app.post("/api/admin/patchnotes/:id/duplicate", auth, requireBackOffice, (req, res) => {
  try {
    const note = patchnotes.duplicate(req.params.id, req.auth.id, req.body?.version);
    if (!note) return res.status(404).json({ error: "Patchnote introuvable." });
    res.status(201).json(note);
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Duplication impossible." }); }
});

app.post("/api/admin/patchnotes/:id/images", auth, requireBackOffice, express.raw({ type: ["image/png", "image/jpeg", "image/webp", "image/gif"], limit: "5mb" }), (req, res) => {
  try {
    const originalName = decodeURIComponent(String(req.headers["x-file-name"] ?? "image"));
    const image = patchnotes.addAttachment(req.params.id, { body: req.body, mimeType: req.headers["content-type"], originalName });
    if (!image) return res.status(404).json({ error: "Patchnote introuvable." });
    res.status(201).json(image);
  } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : "Image invalide." }); }
});

app.delete("/api/admin/patchnotes/:id", auth, requireBackOffice, (req, res) => {
  if (!patchnotes.remove(req.params.id)) return res.status(404).json({ error: "Patchnote introuvable." });
  res.json({ ok: true });
});

app.get("/api/admin/parental-approvals", auth, requireAdmin, (req, res) => {
  res.json({ requests: parentalControls.listRequests(), restrictions: platformSettings().minorRestrictions, restrictionOptions: minorRestrictionCatalog() });
});
app.post("/api/admin/parental-approvals/:id/approve", auth, requireAdmin, async (req, res) => {
  const request = parentalControls.getInternal(req.params.id);
  if (!request || request.status !== "admin_pending") return res.status(409).json({ error: "Ce dossier n’attend pas de validation administrative." });
  const created = updateDb((db) => {
    if (db.users.some((user) => normalizeEmail(user.email) === normalizeEmail(request.childEmail) || user.pseudo.toLowerCase() === request.childPseudo.toLowerCase())) return null;
    const settings = platformSettings(db);
    const user = ensureUserSocial({ id: randomUUID(), pseudo: request.childPseudo, email: normalizeEmail(request.childEmail), emailVerifiedAt: null, passwordHash: request.passwordHash, tokens: settings.signupTokens, guest: false, admin: false, editor: false, active: true, createdAt: new Date().toISOString(), lastDailyClaim: null, registrationAuthorization: { ageBand: "under13", birthDate: request.childBirthDate, termsVersion: PRIVACY_VERSION, acceptedAt: request.parentConsentAt, parentalApproval: { requestId: request.id, code: request.code, reviewerId: req.auth.id, approvedAt: new Date().toISOString(), parentEmail: request.parentEmail } }, parentalAccess: { status: "active" }, profile: { displayName: request.childPseudo, birthDate: request.childBirthDate }, cosmetics: structuredClone(defaultCosmetics), achievements: normalizeAchievements(), profileStats: normalizeProfileStats() });
    db.users.push(user);
    db.transactions.push({ id: randomUUID(), userId: user.id, amount: settings.signupTokens, balance: user.tokens, gameId: null, roomId: null, reason: "signup-bonus", createdAt: new Date().toISOString() });
    refreshPublicProfileStats(user, db);
    return user;
  });
  if (!created) return res.status(409).json({ error: "L’adresse email ou le pseudo est désormais utilisé par un autre compte." });
  const approved = parentalControls.approve(request.id, req.auth.id, created.id);
  const childVerification = emailDeliveryConfigured() ? updateDb((db) => {
    const child = db.users.find((entry) => entry.id === created.id);
    return child ? { user: child, token: issueEmailVerification(child), siteName: platformSettings(db).siteName } : null;
  }) : null;
  try { await Promise.all([
    sendParentalDecision(approved, { approved: true, portalToken: approved.portalToken }),
    childVerification ? sendEmailVerification(childVerification) : Promise.resolve()
  ]); }
  catch (error) { console.error("Parental approval email failed:", error.message); }
  res.status(201).json({ request: approved, user: sanitizeUser(created) });
});
app.post("/api/admin/parental-approvals/:id/reject", auth, requireAdmin, async (req, res) => {
  const request = parentalControls.reject(req.params.id, req.auth.id, req.body.reason);
  if (!request) return res.status(409).json({ error: "Ce dossier ne peut plus être refusé." });
  try { await sendParentalDecision(request, { approved: false, reason: request.rejectionReason }); }
  catch (error) { console.error("Parental rejection email failed:", error.message); }
  res.json(request);
});

app.post("/api/admin/achievements", auth, requireAdmin, (req, res) => {
  try {
    const created = updateDb((db) => {
      db.settings ??= {};
      db.settings.customAchievements ??= [];
      const candidate = normalizeAchievementDefinition({ ...req.body, id: req.body.id || `custom-achievement-${randomUUID()}` });
      if (achievementCatalog(db, { includeDisabled: true }).some((entry) => entry.id === candidate.id)) return null;
      const achievement = { ...candidate, builtIn: false, createdAt: new Date().toISOString(), createdById: req.auth.id };
      db.settings.customAchievements.push(achievement);
      return achievement;
    });
    if (!created) return res.status(409).json({ error: "Cet identifiant de succès existe déjà." });
    res.status(201).json(created);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.patch("/api/admin/achievements/:id", auth, requireAdmin, (req, res) => {
  try {
    const result = updateDb((db) => {
      const current = achievementCatalog(db, { includeDisabled: true }).find((entry) => entry.id === req.params.id);
      if (!current) return null;
      const next = normalizeAchievementDefinition({ ...current, ...req.body, id: current.id, rule: req.body.rule ?? current.rule }, current);
      next.updatedAt = new Date().toISOString();
      if (current.builtIn) {
        db.settings ??= {};
        db.settings.achievementOverrides ??= {};
        db.settings.achievementOverrides[current.id] = { title: next.title, description: next.description, group: next.group, type: next.type, target: next.target, gameId: next.gameId, milestone: next.milestone, secret: next.secret, enabled: next.enabled, rule: next.rule, updatedAt: next.updatedAt };
      } else {
        const index = db.settings.customAchievements.findIndex((entry) => entry.id === current.id);
        db.settings.customAchievements[index] = { ...db.settings.customAchievements[index], ...next, builtIn: false };
      }
      return next;
    });
    if (!result) return res.status(404).json({ error: "Succès introuvable." });
    res.json(result);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post("/api/admin/achievements/:id/duplicate", auth, requireAdmin, (req, res) => {
  try {
    const created = updateDb((db) => {
      const current = achievementCatalog(db, { includeDisabled: true }).find((entry) => entry.id === req.params.id);
      if (!current) return null;
      db.settings ??= {};
      db.settings.customAchievements ??= [];
      const copy = normalizeAchievementDefinition({ ...current, id: `custom-achievement-${randomUUID()}`, title: `${current.title} · copie`, enabled: false });
      const result = { ...copy, builtIn: false, createdAt: new Date().toISOString(), createdById: req.auth.id };
      db.settings.customAchievements.push(result);
      return result;
    });
    if (!created) return res.status(404).json({ error: "Succès introuvable." });
    res.status(201).json(created);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.delete("/api/admin/achievements/:id", auth, requireAdmin, (req, res) => {
  const result = updateDb((db) => {
    const current = achievementCatalog(db, { includeDisabled: true }).find((entry) => entry.id === req.params.id);
    if (!current) return "missing";
    db.settings ??= {};
    if (current.builtIn) {
      db.settings.achievementOverrides ??= {};
      db.settings.achievementOverrides[current.id] = { ...(db.settings.achievementOverrides[current.id] ?? {}), enabled: false };
      return "disabled";
    }
    db.settings.customAchievements = (db.settings.customAchievements ?? []).filter((entry) => entry.id !== current.id);
    for (const user of db.users) delete user.achievementProgress?.[current.id];
    return "deleted";
  });
  if (result === "missing") return res.status(404).json({ error: "Succès introuvable." });
  res.json({ ok: true, status: result });
});

app.patch("/api/admin/settings", auth, requireAdmin, (req, res) => {
  if (req.body.emailVerificationRequired === true && !emailDeliveryConfigured()) return res.status(400).json({ error: "Configure SMTP_HOST et EMAIL_FROM avant d'activer la validation des emails." });
  const settings = updateDb((db) => {
    db.settings ??= {};
    db.settings.platform = normalizePlatformSettings({ ...platformSettings(db), ...req.body });
    return db.settings.platform;
  });
  res.json({ ...settings, emailVerificationAvailable: emailDeliveryConfigured() });
});

app.patch("/api/admin/users/:id", auth, requireAdmin, async (req, res) => {
  const newPassword = String(req.body.password ?? "");
  if (newPassword && newPassword.length < 4) return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 4 caractères." });
  const currentTarget = readDb().users.find((entry) => entry.id === req.params.id && !entry.guest);
  const requestedEmail = normalizeEmail(req.body.login ?? currentTarget?.email);
  if (currentTarget && validEmail(requestedEmail) && requestedEmail !== normalizeEmail(currentTarget.email) && !emailDeliveryConfigured()) return res.status(503).json({ error: "Le service email est indisponible : l’adresse n’a pas été modifiée." });
  const passwordHash = newPassword ? await bcrypt.hash(newPassword, 10) : null;
  const result = updateDb((db) => {
    const user = db.users.find((entry) => entry.id === req.params.id && !entry.guest);
    if (!user) return null;
    const email = normalizeEmail(req.body.login ?? user.email);
    if (!validEmail(email) || db.users.some((entry) => entry.id !== user.id && normalizeEmail(entry.email) === email)) return "duplicate";
    ensureUserSocial(user);
    const emailChanged = normalizeEmail(user.email) !== email;
    if (emailChanged) {
      user.email = email;
      user.emailVerifiedAt = null;
      delete user.emailVerification;
      user.sessionVersion = (Number(user.sessionVersion) || 0) + 1;
    }
    if (!emailChanged && req.body.emailVerified === true) user.emailVerifiedAt ??= new Date().toISOString();
    if (!emailChanged && req.body.emailVerified === false) user.emailVerifiedAt = null;
    user.profile.displayName = String(req.body.displayName ?? displayNameFor(user)).trim().slice(0, 32) || user.pseudo;
    user.profile.bio = normalizePlainText(req.body.bio ?? user.profile.bio, 180);
    user.profile.birthDate = normalizePublicProfile({ birthDate: req.body.birthDate ?? user.profile.birthDate }).birthDate;
    user.profile.gender = String(req.body.gender ?? user.profile.gender ?? "").trim().slice(0, 32);
    if (Array.isArray(req.body.favoriteGames)) user.profile.favoriteGames = [...new Set(req.body.favoriteGames.map(String))].filter((id) => games.some((game) => game.id === id)).slice(0, 5);
    if (req.body.profileStats && typeof req.body.profileStats === "object") user.profileStats = normalizeProfileStats(req.body.profileStats);
    const requestedBalance = Math.max(0, Math.floor(Number(req.body.tokens) || 0));
    const balanceDelta = requestedBalance - (Number(user.tokens) || 0);
    if (balanceDelta) addTokens(db, user.id, balanceDelta, { reason: "admin-adjustment", note: "Solde modifié depuis la fiche joueur" });
    const nextActive = req.body.active !== false;
    if (user.active !== false && !nextActive) user.sessionVersion = (Number(user.sessionVersion) || 0) + 1;
    user.active = nextActive;
    if (req.body.lastDailyClaim === null || req.body.lastDailyClaim === "") user.lastDailyClaim = null;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.body.lastDailyClaim))) user.lastDailyClaim = String(req.body.lastDailyClaim);
    if (passwordHash) {
      user.passwordHash = passwordHash;
      user.sessionVersion = (Number(user.sessionVersion) || 0) + 1;
    }
    if (req.body.admin !== undefined && user.id !== req.auth.id) user.admin = Boolean(req.body.admin);
    if (req.body.editor !== undefined && user.id !== req.auth.id) user.editor = Boolean(req.body.editor);
    if (req.body.moderation && user.id !== req.auth.id) {
      user.moderation ??= {};
      for (const type of ["softBan", "hardBan"]) {
        const input = req.body.moderation[type];
        if (!input || typeof input !== "object") continue;
        const wasActive = activeModeration(user)?.type === (type === "hardBan" ? "hard" : "soft");
        const endsAt = input.endsAt && Number.isFinite(Date.parse(input.endsAt)) ? new Date(input.endsAt).toISOString() : "";
        user.moderation[type] = { active: input.active === true, reason: normalizePlainText(input.reason, 240), endsAt, updatedAt: new Date().toISOString(), updatedBy: req.auth.id };
        if (type === "hardBan" && !wasActive && input.active === true) user.sessionVersion = (Number(user.sessionVersion) || 0) + 1;
      }
    }
    refreshPublicProfileStats(user, db);
    return { user, verificationToken: emailChanged && emailDeliveryConfigured() ? issueEmailVerification(user) : "", siteName: platformSettings(db).siteName };
  });
  if (!result) return res.status(404).json({ error: "Joueur introuvable." });
  if (result === "duplicate") return res.status(409).json({ error: "Adresse email invalide ou déjà utilisée." });
  if (result.verificationToken) {
    try { await sendEmailVerification({ user: result.user, token: result.verificationToken, siteName: result.siteName }); }
    catch (error) { console.error("Admin email verification delivery failed:", error.message); return res.status(503).json({ error: "Le compte a été modifié, mais l’email de validation n’a pas pu être envoyé." }); }
  }
  res.json({ ok: true, verificationSent: Boolean(result.verificationToken) });
});

app.put("/api/admin/users/:id/inventory", auth, requireAdmin, (req, res) => {
  const result = updateDb((db) => {
    const target = db.users.find((entry) => entry.id === req.params.id && !entry.guest);
    if (!target) return null;
    const current = normalizeCosmetics(target.cosmetics);
    const catalog = configuredShop(db);
    const requested = req.body.cosmetics ?? {};
    const next = { ...current, equipped: { ...current.equipped, ...(requested.equipped ?? {}) } };
    for (const type of shopTypes) {
      const allowed = new Set(catalog.filter((item) => item.type === type).map((item) => item.value));
      const defaults = defaultCosmetics[type] ?? [];
      next[type] = [...new Set([...(Array.isArray(requested[type]) ? requested[type] : current[type]), ...defaults])].filter((value) => allowed.has(value) || defaults.includes(value) || current[type].includes(value));
      const equippedKey = cosmeticEquippedKeys[type];
      if (!next[type].includes(next.equipped[equippedKey])) next.equipped[equippedKey] = defaults[0];
    }
    target.cosmetics = normalizeCosmetics(next);
    return target.cosmetics;
  });
  if (!result) return res.status(404).json({ error: "Joueur introuvable." });
  res.json({ cosmetics: result });
});

app.patch("/api/admin/users/:id/achievements", auth, requireAdmin, (req, res) => {
  const result = updateDb((db) => {
    const target = db.users.find((entry) => entry.id === req.params.id && !entry.guest);
    if (!target) return null;
    const allowedIds = new Set(achievementCatalog().map((entry) => entry.id));
    const states = req.body.states && typeof req.body.states === "object" ? req.body.states : {};
    const achievements = ensureUserAchievements(target);
    for (const [id, unlocked] of Object.entries(states)) {
      if (!allowedIds.has(id)) continue;
      if (unlocked) {
        achievements.unlocked = [...new Set([...achievements.unlocked, id])];
        achievements.suppressed = achievements.suppressed.filter((entry) => entry !== id);
        achievements.unlockedAt[id] ??= new Date().toISOString();
      } else {
        achievements.unlocked = achievements.unlocked.filter((entry) => entry !== id);
        achievements.suppressed = [...new Set([...achievements.suppressed, id])];
        delete achievements.unlockedAt[id];
      }
    }
    grantAchievementCosmetics(target);
    refreshPublicProfileStats(target, db);
    return achievementStatus(target, db);
  });
  if (!result) return res.status(404).json({ error: "Joueur introuvable." });
  res.json({ achievements: result });
});

app.post("/api/admin/users/:id/transactions", auth, requireAdmin, (req, res) => {
  const amount = Math.trunc(Number(req.body.amount));
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 10000000) return res.status(400).json({ error: "Saisis un ajustement compris entre -10 000 000 et 10 000 000 jetons." });
  const result = updateDb((db) => {
    const target = db.users.find((entry) => entry.id === req.params.id && !entry.guest);
    if (!target) return "missing";
    if ((Number(target.tokens) || 0) + amount < 0) return "negative";
    const balance = addTokens(db, target.id, amount, { reason: "admin-adjustment", note: req.body.note });
    return { balance, transaction: db.transactions.at(-1) };
  });
  if (result === "missing") return res.status(404).json({ error: "Joueur introuvable." });
  if (result === "negative") return res.status(400).json({ error: "Cet ajustement rendrait le solde négatif." });
  res.json(result);
});

app.post("/api/admin/users/:id/reset-achievements", auth, requireAdmin, (req, res) => {
  const found = updateDb((db) => { const user = db.users.find((entry) => entry.id === req.params.id); if (!user) return false; user.achievements = normalizeAchievements({ suppressed: achievementCatalog(db).map((entry) => entry.id) }); user.achievementProgress = {}; refreshPublicProfileStats(user, db); return true; });
  if (!found) return res.status(404).json({ error: "Joueur introuvable." });
  res.json({ ok: true });
});

app.post("/api/admin/users/:id/reset-account", auth, requireAdmin, (req, res) => {
  const found = updateDb((db) => {
    const user = db.users.find((entry) => entry.id === req.params.id && !entry.guest);
    if (!user) return false;
    const birthDate = user.profile?.birthDate ?? "";
    const targetBalance = platformSettings(db).signupTokens;
    const balanceDelta = targetBalance - (Number(user.tokens) || 0);
    if (balanceDelta) addTokens(db, user.id, balanceDelta, { reason: "admin-adjustment", note: "Réinitialisation administrative du compte" });
    user.profile = normalizePublicProfile({}, user.pseudo);
    user.profile.birthDate = birthDate;
    user.profileStats = normalizeProfileStats();
    user.cosmetics = structuredClone(defaultCosmetics);
    user.achievements = normalizeAchievements();
    user.achievementProgress = {};
    user.active = true;
    user.sessionVersion = (Number(user.sessionVersion) || 0) + 1;
    delete user.passwordReset;
    return true;
  });
  if (!found) return res.status(404).json({ error: "Joueur introuvable." });
  res.json({ ok: true });
});

app.delete("/api/admin/users/:id", auth, requireAdmin, (req, res) => {
  if (req.params.id === req.auth.id) return res.status(400).json({ error: "Tu ne peux pas supprimer ton propre compte administrateur." });
  const result = updateDb((db) => {
    const target = db.users.find((entry) => entry.id === req.params.id && !entry.guest);
    if (!target) return "missing";
    if (target.admin && db.users.filter((entry) => !entry.guest && entry.admin).length <= 1) return "last-admin";
    if (db.rooms.some((room) => !room.finished && room.players?.some((player) => player.id === target.id))) return "active-room";
    for (const user of db.users) {
      if (user.id === target.id) continue;
      ensureUserSocial(user);
      user.friends = user.friends.filter((id) => id !== target.id);
      user.friendRequests.incoming = user.friendRequests.incoming.filter((id) => id !== target.id);
      user.friendRequests.outgoing = user.friendRequests.outgoing.filter((id) => id !== target.id);
      user.roomInvites = user.roomInvites.filter((invite) => invite.fromId !== target.id);
      user.notifications = user.notifications.filter((notification) => notification.actorId !== target.id);
    }
    db.users = db.users.filter((entry) => entry.id !== target.id);
    return "deleted";
  });
  if (result === "missing") return res.status(404).json({ error: "Joueur introuvable." });
  if (result === "last-admin") return res.status(409).json({ error: "Le dernier administrateur du casino ne peut pas être supprimé." });
  if (result === "active-room") return res.status(409).json({ error: "Ce joueur est encore présent dans une table active. Exclue-le ou ferme la table avant de supprimer son compte." });
  if (result === "deleted") {
    parentalControls.deleteForUser(req.params.id);
    tribunal.deleteForUser(req.params.id);
    chat.deleteForUser(req.params.id);
  }
  res.json({ ok: true });
});

app.patch("/api/admin/games/:id", auth, requireAdmin, (req, res) => {
  if (Object.hasOwn(req.body, "defaultModifiers") && (!req.body.defaultModifiers || typeof req.body.defaultModifiers !== "object" || Array.isArray(req.body.defaultModifiers))) return res.status(400).json({ error: "Parametres par defaut invalides." });
  if (req.params.id === "texas-holdem" && Number(req.body.pokerDefaultBigBlind) % 2) return res.status(400).json({ error: "La grosse blinde par défaut doit être paire." });
  const updated = updateDb((db) => {
    if (!games.some((game) => game.id === req.params.id)) return false;
    db.settings ??= {};
    db.settings.games ??= {};
    db.settings.games[req.params.id] = {
      ...(db.settings.games[req.params.id] ?? {}),
      ...(Object.hasOwn(req.body, "defaultModifiers") ? { defaultModifiers: req.params.id === "bataille" ? normalizeBattleModifiers(req.body.defaultModifiers) : normalizeGameModifiers(req.params.id, req.body.defaultModifiers) } : {}),
      name: String(req.body.name ?? "").trim().slice(0, 60),
      description: String(req.body.description ?? "").trim().slice(0, 240),
      category: String(req.body.category ?? "").trim().slice(0, 40),
      audience: String(req.body.audience ?? "").trim().slice(0, 40),
      complexity: String(req.body.complexity ?? "").trim().slice(0, 40),
      entryPot: Math.max(0, Math.floor(Number(req.body.entryPot) || 0)),
      position: Math.max(1, Math.floor(Number(req.body.position) || 1)),
      enabled: req.body.enabled !== false
    };
    if (req.params.id === "texas-holdem") {
      db.settings.platform = normalizePlatformSettings({
        ...platformSettings(db),
        minPokerBuyIn: req.body.minPokerBuyIn,
        pokerDefaultBigBlind: req.body.pokerDefaultBigBlind,
        pokerTurnSeconds: req.body.pokerTurnSeconds
      });
    }
    return true;
  });
  if (!updated) return res.status(404).json({ error: "Jeu introuvable." });
  res.json({ ok: true });
});

app.post("/api/admin/shop", auth, requireBackOffice, (req, res) => {
  const id = `custom-${randomUUID()}`;
  const type = shopTypes.includes(String(req.body.type)) ? String(req.body.type) : "icons";
  const category = shopCategories.includes(String(req.body.category)) ? String(req.body.category) : "classic";
  const price = Math.max(0, Math.floor(Number(req.body.price) || 0));
  const db = readDb();
  const guidance = shopPriceGuidance(db, type, category);
  if (!req.backOfficeUser.admin && (price < guidance.allowedMin || price > guidance.allowedMax)) {
    return res.status(400).json({ error: `Le prix doit être compris entre ${guidance.allowedMin} et ${guidance.allowedMax} jetons pour cette catégorie.`, pricing: guidance });
  }
  let pack;
  try { pack = normalizeShopPack(req.body.packName); } catch (error) { return res.status(400).json({ error: error.message }); }
  const item = { id, type, category, name: String(req.body.name ?? "Nouvel élément").slice(0, 80), description: String(req.body.description ?? "").slice(0, 240), price, value: id, icon: String(req.body.icon ?? "").trim().slice(0, 6000), design: normalizeCosmeticDesign(req.body.design, type), motion: normalizeCosmeticMotion(req.body.motion), css: normalizeCosmeticCss(req.body.css), ...pack, createdById: req.backOfficeUser.id, createdByName: displayNameFor(req.backOfficeUser), createdAt: new Date().toISOString() };
  updateDb((currentDb) => { currentDb.settings ??= {}; currentDb.settings.customShopItems ??= []; currentDb.settings.customShopItems.push(item); });
  res.json(item);
});

app.patch("/api/admin/shop/:id", auth, requireBackOffice, (req, res) => {
  const result = updateDb((db) => {
    db.settings ??= {};
    db.settings.shopOverrides ??= {};
    const current = configuredShop(db).find((item) => item.id === req.params.id);
    if (!current) return "missing";
    const isCustom = (db.settings.customShopItems ?? []).some((item) => item.id === req.params.id);
    if (!req.backOfficeUser.admin && !isCustom) return "forbidden";
    const type = shopTypes.includes(String(req.body.type)) ? String(req.body.type) : current.type;
    const category = shopCategories.includes(String(req.body.category)) ? String(req.body.category) : current.category;
    const price = Math.max(0, Math.floor(Number(req.body.price) || 0));
    const guidance = shopPriceGuidance(db, type, category, req.params.id);
    if (!req.backOfficeUser.admin && (price < guidance.allowedMin || price > guidance.allowedMax)) return { pricing: guidance };
    let pack;
    try { pack = req.body.packName === undefined ? { packs: current.packs ?? [], packName: current.packName ?? "" } : normalizeShopPack(req.body.packName); } catch (error) { return { error: error.message }; }
    const design = req.body.design === undefined ? current?.design ?? null : normalizeCosmeticDesign(req.body.design, type);
    const motion = req.body.motion === undefined ? current?.motion ?? null : normalizeCosmeticMotion(req.body.motion);
    db.settings.shopOverrides[req.params.id] = { name: String(req.body.name ?? "").slice(0, 80), description: String(req.body.description ?? "").slice(0, 240), price, type, category, value: current?.value ?? req.params.id, icon: String(req.body.icon ?? current?.icon ?? "").trim().slice(0, 6000), design, motion, css: normalizeCosmeticCss(req.body.css), ...pack };
    return "updated";
  });
  if (result === "missing") return res.status(404).json({ error: "Objet introuvable." });
  if (result === "forbidden") return res.status(403).json({ error: "Un éditeur ne peut modifier que les objets personnalisés." });
  if (result?.error) return res.status(400).json({ error: result.error });
  if (typeof result === "object") return res.status(400).json({ error: `Le prix doit être compris entre ${result.pricing.allowedMin} et ${result.pricing.allowedMax} jetons pour cette catégorie.`, pricing: result.pricing });
  res.json({ ok: true });
});

app.delete("/api/admin/shop/:id", auth, requireBackOffice, (req, res) => {
  const result = updateDb((db) => {
    db.settings ??= {};
    const isCustom = (db.settings.customShopItems ?? []).some((item) => item.id === req.params.id);
    const exists = configuredShop(db).some((item) => item.id === req.params.id);
    if (!exists) return "missing";
    if (!req.backOfficeUser.admin && !isCustom) return "forbidden";
    db.settings.shopOverrides ??= {};
    delete db.settings.shopOverrides[req.params.id];
    if (isCustom) db.settings.customShopItems = (db.settings.customShopItems ?? []).filter((item) => item.id !== req.params.id);
    else db.settings.removedShopItems = [...new Set([...(db.settings.removedShopItems ?? []), req.params.id])];
    return "deleted";
  });
  if (result === "missing") return res.status(404).json({ error: "Objet introuvable." });
  if (result === "forbidden") return res.status(403).json({ error: "Un éditeur ne peut supprimer que les objets personnalisés." });
  res.json({ ok: true });
});

app.patch("/api/me", auth, async (req, res) => {
  if (req.auth.guest) return res.status(400).json({ error: "Les invités ne peuvent pas modifier un compte." });
  const login = req.body.login === undefined ? "" : normalizeEmail(req.body.login);
  const displayName = String(req.body.displayName ?? req.body.pseudo ?? "").trim();
  const birthDate = String(req.body.birthDate ?? "").trim();
  const gender = String(req.body.gender ?? "").trim();
  const bio = normalizePlainText(req.body.bio, 180);
  const favoriteGames = Array.isArray(req.body.favoriteGames) ? req.body.favoriteGames.map(String).filter((id) => games.some((game) => game.id === id)).slice(0, 5) : null;
  const password = String(req.body.password ?? "");
  const memberCardStats = Array.isArray(req.body.memberCardStats) ? req.body.memberCardStats.map(String).slice(0, 2) : [];
  const visibleProfileStats = Array.isArray(req.body.visibleProfileStats) ? [...new Set(req.body.visibleProfileStats.map(String))] : null;
  const customAchievementId = req.body.customAchievementId ? String(req.body.customAchievementId) : "";
  const customAchievementIds = Array.isArray(req.body.customAchievementIds)
    ? req.body.customAchievementIds.slice(0, 2).map((id) => String(id ?? ""))
    : [customAchievementId, ""];
  const statOptions = ["hidden", "todayGames", "overallWinRate", "winRate", "achievementsUnlocked", "customAchievement"];
  const publicStatOptions = ["age", "gender", "friends", "gamesPlayed", "wins", "winRate", "achievements"];
  if (login && !validEmail(login)) return res.status(400).json({ error: "Adresse email invalide." });
  const currentAccount = readDb().users.find((entry) => entry.id === req.auth.id);
  if (login && normalizeEmail(currentAccount?.email) !== login) return res.status(400).json({ error: "Modifie l'adresse email depuis l'écran de sécurité du compte." });
  if (displayName && displayName.length < 3) return res.status(400).json({ error: "Pseudo en jeu trop court." });
  const allowedGenders = ["", "Homme", "Femme", "Non-binaire", "Autre", "Préfère ne pas dire"];
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return res.status(400).json({ error: "Date de naissance invalide." });
  if (birthDate) {
    const age = ageFromBirthDate(birthDate);
    const authorization = currentAccount?.registrationAuthorization;
    if (age === "" || (age < 13 && !authorization?.parentalApproval)) return res.status(400).json({ error: "Une autorisation parentale est nécessaire avant 13 ans." });
    if (currentAccount?.profile?.birthDate && birthDate !== currentAccount.profile.birthDate) return res.status(400).json({ error: "La date de naissance enregistrée ne peut être modifiée que par l’administration." });
  }
  if (!allowedGenders.includes(gender)) return res.status(400).json({ error: "Genre invalide." });
  if (password && password.length < 4) return res.status(400).json({ error: "Mot de passe trop court." });
  if (memberCardStats.some((stat) => !statOptions.includes(stat))) return res.status(400).json({ error: "Statistique de member card invalide." });
  if (visibleProfileStats?.some((stat) => !publicStatOptions.includes(stat))) return res.status(400).json({ error: "Statistique de profil invalide." });
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const user = updateDb((db) => {
    const found = db.users.find((u) => u.id === req.auth.id);
    if (!found) return null;
    ensureUserSocial(found);
    ensureUserCosmetics(found);
    ensureUserAchievements(found);
    found.profileStats = normalizeProfileStats(found.profileStats);
    for (const id of customAchievementIds.filter(Boolean)) {
      const achievement = achievementStatus(found, db).find((entry) => entry.id === id);
      if (!achievement?.milestone || !achievement.unlocked) return "achievement";
    }
    if (displayName) found.profile.displayName = displayName;
    if (req.body.birthDate !== undefined) found.profile.birthDate = birthDate;
    if (req.body.gender !== undefined) found.profile.gender = gender;
    if (req.body.bio !== undefined) found.profile.bio = bio.slice(0, 180);
    if (favoriteGames) found.profile.favoriteGames = favoriteGames;
    found.profile = normalizePublicProfile(found.profile, found.pseudo);
    if (passwordHash) {
      found.passwordHash = passwordHash;
      found.sessionVersion = (Number(found.sessionVersion) || 0) + 1;
    }
    if (memberCardStats.length) found.profileStats.memberCardStats = memberCardStats.length === 1 ? [memberCardStats[0], "achievementsUnlocked"] : memberCardStats;
    if (visibleProfileStats) found.profileStats.visibleProfileStats = visibleProfileStats;
    if (req.body.customAchievementIds !== undefined || customAchievementId || found.profileStats.memberCardStats.includes("customAchievement")) {
      found.profileStats.customAchievementIds = customAchievementIds;
      found.profileStats.customAchievementId = customAchievementIds[0] ?? "";
    }
    refreshPublicProfileStats(found, db);
    if (displayName) {
      for (const room of db.rooms.filter((r) => !r.finished)) {
        const player = room.players.find((p) => p.id === found.id);
        if (player) {
          player.login = found.pseudo;
          player.pseudo = displayNameFor(found);
          player.profile = found.profile;
        }
        const statePlayer = room.state?.players?.find((p) => p.id === found.id);
        if (statePlayer) {
          statePlayer.login = found.pseudo;
          statePlayer.pseudo = displayNameFor(found);
          statePlayer.profile = found.profile;
        }
      }
    }
    processAchievementEvent(db, found.id, { type: "player.updated", payload: { changed: Object.keys(req.body).filter((key) => ["displayName", "bio", "favoriteGames", "memberCardStats"].includes(key)) } });
    return found;
  });
  if (user === "achievement") return res.status(400).json({ error: "Succès milestone indisponible." });
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });
  const payload = sanitizeUser(user);
  if (passwordHash) payload.sessionToken = makeToken(user);
  res.json(payload);
});

app.patch("/api/me/cosmetics", auth, (req, res) => {
  if (req.auth.guest) return res.status(400).json({ error: "Les invités ne peuvent pas modifier la personnalisation." });
  const { icon, nameEffect, memberCard, profileBanner, profileFrame, profileEffect, diceSkin, cardSkin } = req.body;
  const user = updateDb((db) => {
    const found = db.users.find((u) => u.id === req.auth.id);
    if (!found) return null;
    const cosmetics = ensureUserCosmetics(found);
    if (icon && !cosmetics.icons.includes(icon)) return "locked";
    if (nameEffect && !cosmetics.nameEffects.includes(nameEffect)) return "locked";
    if (memberCard && !cosmetics.memberCards.includes(memberCard)) return "locked";
    if (profileBanner && !cosmetics.profileBanners.includes(profileBanner)) return "locked";
    if (profileFrame && !cosmetics.profileFrames.includes(profileFrame)) return "locked";
    if (profileEffect && !cosmetics.profileEffects.includes(profileEffect)) return "locked";
    if (diceSkin && !cosmetics.diceSkins.includes(diceSkin)) return "locked";
    if (cardSkin && !cosmetics.cardSkins.includes(cardSkin)) return "locked";
    const previousEquipped = { ...cosmetics.equipped };
    cosmetics.equipped = {
      ...cosmetics.equipped,
      ...(icon ? { icon } : {}),
      ...(nameEffect ? { nameEffect } : {}),
      ...(memberCard ? { memberCard } : {}),
      ...(profileBanner ? { profileBanner } : {}),
      ...(profileFrame ? { profileFrame } : {}),
      ...(profileEffect ? { profileEffect } : {}),
      ...(diceSkin ? { diceSkin } : {}),
      ...(cardSkin ? { cardSkin } : {})
    };
    for (const room of db.rooms.filter((r) => !r.finished)) {
      const player = room.players.find((p) => p.id === found.id);
      if (player) player.cosmetics = cosmetics;
      const statePlayer = room.state?.players?.find((p) => p.id === found.id);
      if (statePlayer) statePlayer.cosmetics = cosmetics;
    }
    const changed = Object.keys(cosmetics.equipped).filter((key) => previousEquipped[key] !== cosmetics.equipped[key]);
    if (changed.length) processAchievementEvent(db, found.id, { type: "inventory.equipped", payload: { changed } });
    return found;
  });
  if (user === "locked") return res.status(400).json({ error: "Élément non débloqué." });
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });
  res.json(sanitizeUser(user));
});

app.post("/api/shop/purchase", auth, (req, res) => {
  if (req.auth.guest) return res.status(400).json({ error: "La boutique est réservée aux comptes enregistrés." });
  const access = userFeatureAccess(getUser(req.auth.id), "shop");
  if (!access.allowed) return rejectFeature(res, access);
  const item = configuredShop().find((entry) => entry.id === req.body.itemId);
  if (!item) return res.status(404).json({ error: "Article introuvable." });
  if (item.rewardOnly) return res.status(400).json({ error: "Cet objet se débloque avec un succès." });
  const user = updateDb((db) => {
    const found = db.users.find((u) => u.id === req.auth.id);
    if (!found) return null;
    let cosmetics = ensureUserCosmetics(found);
    if (cosmetics[item.type].includes(item.value)) return { user: found, achievementUnlocks: [] };
    if (found.tokens < item.price) return "tokens";
    addTokens(db, found.id, -item.price, { reason: "shop-purchase" });
    // Transaction achievements may normalize and replace the inventory object.
    cosmetics = ensureUserCosmetics(found);
    cosmetics[item.type].push(item.value);
    const equippedKey = cosmeticEquippedKeys[item.type];
    cosmetics.equipped = { ...cosmetics.equipped, [equippedKey]: item.value };
    for (const room of db.rooms.filter((r) => !r.finished)) {
      const player = room.players.find((p) => p.id === found.id);
      if (player) player.cosmetics = cosmetics;
      const statePlayer = room.state?.players?.find((p) => p.id === found.id);
      if (statePlayer) statePlayer.cosmetics = cosmetics;
    }
    const eventUnlocks = processAchievementEvent(db, found.id, { type: "shop.purchase", payload: { itemId: item.id, itemType: item.type, itemCategory: item.category, price: item.price, quantity: 1 } });
    const achievementUnlocks = [...new Set([...eventUnlocks, ...unlockEligibleAchievements(found, db), ...triggerRandomAchievement(db, found.id)])];
    return { user: found, achievementUnlocks };
  });
  if (user === "tokens") return res.status(400).json({ error: "Jetons insuffisants." });
  if (!user?.user) return res.status(404).json({ error: "Utilisateur introuvable." });
  res.json({ user: sanitizeUser(user.user), achievementUnlocks: user.achievementUnlocks });
});

app.post("/api/shop/purchase-pack", auth, (req, res) => {
  if (req.auth.guest) return res.status(400).json({ error: "La boutique est réservée aux comptes enregistrés." });
  const access = userFeatureAccess(getUser(req.auth.id), "shop");
  if (!access.allowed) return rejectFeature(res, access);
  const packId = String(req.body.packId ?? "").trim().slice(0, 80);
  const itemIds = [...new Set(Array.isArray(req.body.itemIds) ? req.body.itemIds.map(String) : [])].slice(0, shopTypes.length);
  if (!packId || !itemIds.length) return res.status(400).json({ error: "Sélectionne au moins un élément du pack." });
  const result = updateDb((db) => {
    const found = db.users.find((entry) => entry.id === req.auth.id);
    if (!found) return "missing";
    const catalog = configuredShop(db);
    const selected = itemIds.map((id) => catalog.find((entry) => entry.id === id)).filter(Boolean);
    if (selected.length !== itemIds.length || selected.some((item) => item.rewardOnly || !item.packs?.includes(packId))) return "invalid";
    if (new Set(selected.map((item) => item.type)).size !== selected.length) return "duplicate-type";
    let cosmetics = ensureUserCosmetics(found);
    const purchasable = selected.filter((item) => !cosmetics[item.type].includes(item.value));
    if (!purchasable.length) return "owned";
    const subtotal = purchasable.reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item.price) || 0)), 0);
    const discountPercent = shopPackDiscountPercent(purchasable.length);
    const total = Math.ceil(subtotal * (100 - discountPercent) / 100);
    if (found.tokens < total) return { status: "tokens", subtotal, total, discountPercent };
    addTokens(db, found.id, -total, { reason: "shop-pack-purchase" });
    cosmetics = ensureUserCosmetics(found);
    for (const item of purchasable) {
      cosmetics[item.type].push(item.value);
      cosmetics.equipped[cosmeticEquippedKeys[item.type]] = item.value;
    }
    for (const room of db.rooms.filter((entry) => !entry.finished)) {
      const player = room.players.find((entry) => entry.id === found.id);
      if (player) player.cosmetics = cosmetics;
      const statePlayer = room.state?.players?.find((entry) => entry.id === found.id);
      if (statePlayer) statePlayer.cosmetics = cosmetics;
    }
    const eventUnlocks = purchasable.flatMap((item) => processAchievementEvent(db, found.id, { type: "shop.purchase", payload: { itemId: item.id, itemType: item.type, itemCategory: item.category, price: item.price, quantity: purchasable.length } }));
    const achievementUnlocks = [...new Set([...eventUnlocks, ...unlockEligibleAchievements(found, db), ...triggerRandomAchievement(db, found.id)])];
    return { status: "ok", user: found, achievementUnlocks, pricing: { itemCount: purchasable.length, subtotal, total, discountPercent } };
  });
  if (result === "missing") return res.status(404).json({ error: "Utilisateur introuvable." });
  if (result === "invalid" || result === "duplicate-type") return res.status(400).json({ error: "Cette sélection ne correspond pas au pack." });
  if (result === "owned") return res.status(400).json({ error: "Tous les éléments sélectionnés sont déjà débloqués." });
  if (result?.status === "tokens") return res.status(400).json({ error: "Jetons insuffisants.", pricing: result });
  res.json({ user: sanitizeUser(result.user), achievementUnlocks: result.achievementUnlocks, pricing: result.pricing });
});

app.post("/api/me/daily-claim", auth, (req, res) => {
  const today = casinoDateKey();
  const result = updateDb((db) => {
    const found = db.users.find((u) => u.id === req.auth.id);
    if (!found || found.guest) return { user: found, achievementUnlocks: [] };
    const bonus = dailyBonusStatus(found, db);
    if (found.lastDailyClaim === today || bonus.claimedToday) return { user: found, achievementUnlocks: [], alreadyClaimed: true };
    const nextStreak = bonus.streak + 1;
    const amount = bonus.nextReward;
    addTokens(db, found.id, amount, { reason: "daily-claim", dailyBonusMultiplier: bonus.nextMultiplier, dailyBonusStreak: nextStreak, dailyBonusClaims: bonus.claims + 1 });
    found.lastDailyClaim = today;
    const eventUnlocks = processAchievementEvent(db, found.id, { type: "daily.claimed", payload: { amount, multiplier: bonus.nextMultiplier, streak: nextStreak, claims: bonus.claims + 1 } });
    const achievementUnlocks = [...new Set([...eventUnlocks, ...unlockEligibleAchievements(found, db), ...triggerRandomAchievement(db, found.id)])];
    return { user: found, achievementUnlocks, award: { amount, multiplier: bonus.nextMultiplier, streak: nextStreak, claims: bonus.claims + 1, tiers: bonus.nextTierRules, capped: bonus.nextCapped, weeklyBoost: bonus.nextWeeklyBoost, monthlyDouble: bonus.nextMonthlyDouble } };
  });
  if (!result?.user || result.user.guest) return res.status(400).json({ error: "Bonus réservé aux comptes enregistrés." });
  res.json({ user: sanitizeUser(result.user), achievementUnlocks: result.achievementUnlocks, award: result.award ?? null, alreadyClaimed: Boolean(result.alreadyClaimed) });
});

app.get("/api/rooms", (_req, res) => {
  const db = readDb();
  if (cleanupEmptyRooms(db)) writeDb(db);
  res.json(sanitizeRooms(db.rooms.filter((room) => room.isPublic && !room.finished)));
});

app.post("/api/rooms", auth, async (req, res) => {
  const user = getUser(req.auth.id);
  const game = configuredGames().find((g) => g.id === req.body.gameId);
  if (!user || !game || game.enabled === false) return res.status(400).json({ error: "Création impossible." });
  const roomAccess = userFeatureAccess(user, "rooms:create");
  if (!roomAccess.allowed) return rejectFeature(res, roomAccess);
  const gameAccess = userFeatureAccess(user, `game:${game.id}`);
  if (!gameAccess.allowed) return rejectFeature(res, gameAccess);
  const settings = platformSettings();
  const name = String(req.body.name ?? "").trim();
  const password = String(req.body.password ?? "");
  if (name && name.length < 3) return res.status(400).json({ error: "Nom de table trop court." });
  if (password && password.length < 4) return res.status(400).json({ error: "Mot de passe de table trop court." });
  const minimumStake = Math.max(game.id === "texas-holdem" ? settings.minPokerBuyIn : settings.minRoomStake, Number(game.entryPot) || 0);
  const stake = Math.max(minimumStake, Number(req.body.stake || minimumStake));
  if (user.tokens < stake) return res.status(400).json({ error: "Jetons insuffisants." });
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const room = {
    id: randomUUID(),
    code: roomCode(),
    gameId: game.id,
    name: name || `${game.name} de ${user.pseudo}`,
    passwordHash,
    isPublic: req.body.isPublic !== false,
    stake,
    pokerBlinds: game.id === "texas-holdem" ? { ...pokerBlindsFromBigBlind(settings.pokerDefaultBigBlind), maximumBet: stake } : undefined,
    pokerTurnSeconds: game.id === "texas-holdem" ? settings.pokerTurnSeconds : undefined,
    battleModifiers: game.id === "bataille" ? normalizeBattleModifiers(game.defaultModifiers) : undefined,
    gameModifiers: normalizeGameModifiers(game.id, game.defaultModifiers),
    readyPlayerIds: [user.id],
    ownerId: user.id,
    players: [roomPlayerFor(user)],
    state: null,
    finished: false,
    createdAt: new Date().toISOString()
  };
  saveRoom(room);
  broadcastRooms();
  res.json(sanitizeRoom(room, req.auth.id));
});

app.post("/api/rooms/:code/join", auth, async (req, res) => {
  const user = getUser(req.auth.id);
  const db = readDb();
  const room = db.rooms.find((r) => r.code === req.params.code.toUpperCase());
  const game = room && games.find((g) => g.id === room.gameId);
  if (!user || !room || !game) return res.status(404).json({ error: "Table introuvable." });
  const roomAccess = userFeatureAccess(user, "rooms:join", db);
  if (!roomAccess.allowed) return rejectFeature(res, roomAccess);
  const gameAccess = userFeatureAccess(user, `game:${room.gameId}`, db);
  if (!gameAccess.allowed) return rejectFeature(res, gameAccess);
  if (room.players.some((p) => p.id === user.id)) return res.json(sanitizeRoom(room, req.auth.id));
  if (room.passwordHash && !maySpectate(room, user.id) && !(await bcrypt.compare(String(req.body.password ?? ""), room.passwordHash))) return res.status(403).json({ error: "Mot de passe de table requis ou invalide." });
  if (room.state) {
    grantSpectatorAccess(room, user.id);
    return res.json(sanitizeRoom(room, user.id, db, true));
  }
  if (room.players.length >= game.maxPlayers) return res.status(400).json({ error: "Table complète." });
  if (user.tokens < room.stake) return res.status(400).json({ error: "Jetons insuffisants." });
  room.players.push(roomPlayerFor(user));
  if (room.gameId === "belote") room.beloteSeats = beloteSeats(room);
  writeDb(db);
  broadcastRooms();
  emitRoomUpdate(room);
  res.json(sanitizeRoom(room, req.auth.id));
});

app.get("/api/rooms/:code", auth, (req, res) => {
  const db = readDb();
  const room = db.rooms.find((r) => r.code === req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: "Table introuvable." });
  const access = tableFeatureAccess(getUser(req.auth.id), room, db);
  if (!access.allowed) return rejectFeature(res, access);
  if (!maySpectate(room, req.auth.id)) return res.json({ ...sanitizeLobbyRoom(room), state: room.state ? { gameId: room.gameId } : null, accessRequired: true });
  res.json(sanitizeRoom(room, req.auth.id, db, req.query.spectate === "1"));
});

app.post("/api/rooms/:code/spectate", auth, async (req, res) => {
  const room = readDb().rooms.find((entry) => entry.code === req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: "Table introuvable." });
  const user = getUser(req.auth.id);
  const roomAccess = userFeatureAccess(user, "rooms:join");
  if (!roomAccess.allowed) return rejectFeature(res, roomAccess);
  const gameAccess = userFeatureAccess(user, `game:${room.gameId}`);
  if (!gameAccess.allowed) return rejectFeature(res, gameAccess);
  if (!maySpectate(room, req.auth.id) && room.passwordHash && !(await bcrypt.compare(String(req.body.password ?? ""), room.passwordHash))) return res.status(403).json({ error: "Mot de passe de table requis ou invalide." });
  grantSpectatorAccess(room, req.auth.id);
  res.json(sanitizeRoom(room, req.auth.id, undefined, true));
});

app.post("/api/rooms/:code/belote-team", auth, (req, res) => {
  const db = readDb();
  const room = db.rooms.find((entry) => entry.code === req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: "Table introuvable." });
  const access = tableFeatureAccess(getUser(req.auth.id), room, db);
  if (!access.allowed) return rejectFeature(res, access);
  try {
    chooseBeloteTeam(room, req.auth.id, String(req.body.playerId ?? req.auth.id), req.body.team);
    writeDb(db); emitRoomUpdate(room, db);
    res.json(sanitizeRoom(room, req.auth.id, db));
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post("/api/rooms/:code/invite", auth, (req, res) => {
  const access = userFeatureAccess(getUser(req.auth.id), "friends");
  if (!access.allowed) return rejectFeature(res, access);
  if (req.auth.guest) return res.status(400).json({ error: "Les invitations sont réservées aux comptes enregistrés." });
  const friendId = String(req.body.friendId ?? "");
  const result = updateDb((db) => {
    const room = db.rooms.find((r) => r.code === req.params.code.toUpperCase() && !r.finished);
    const user = db.users.find((u) => u.id === req.auth.id);
    const friend = db.users.find((u) => u.id === friendId);
    if (!room || !user || !friend) return "missing";
    ensureUserSocial(user);
    ensureUserSocial(friend);
    if (!room.players.some((p) => p.id === user.id)) return "room";
    if (!user.friends.includes(friend.id)) return "friend";
    friend.roomInvites = (friend.roomInvites ?? []).filter((invite) => !(invite.code === room.code && invite.fromId === user.id));
    friend.roomInvites.unshift({ id: randomUUID(), code: room.code, roomId: room.id, fromId: user.id, createdAt: new Date().toISOString() });
    friend.roomInvites = friend.roomInvites.slice(0, 25);
    pushNotification(friend, {
      type: "room-invite",
      title: "Invitation à une table",
      message: `${displayNameFor(user)} t'invite à la table ${room.name}. Mise ${room.stake} jetons · pot prévu ${room.stake * (room.players.filter((player) => !player.isBot).length + 1)} jetons.`,
      actorId: user.id,
      roomCode: room.code
    });
    return true;
  });
  if (result === "missing") return res.status(404).json({ error: "Table ou ami introuvable." });
  if (result === "room") return res.status(403).json({ error: "Tu dois être à la table pour inviter." });
  if (result === "friend") return res.status(403).json({ error: "Tu peux inviter uniquement tes amis." });
  res.json({ ok: true });
});

app.post("/api/room-invites/:id/accept", auth, (req, res) => {
  const access = userFeatureAccess(getUser(req.auth.id), "friends");
  if (!access.allowed) return rejectFeature(res, access);
  if (req.auth.guest) return res.status(400).json({ error: "Les invitations sont réservées aux comptes enregistrés." });
  const inviteId = req.params.id;
  const db = readDb();
  const user = db.users.find((u) => u.id === req.auth.id);
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });
  ensureUserSocial(user);
  const invite = user.roomInvites.find((row) => row.id === inviteId);
  const room = invite && db.rooms.find((row) => row.code === invite.code && !row.finished);
  const game = room && games.find((g) => g.id === room.gameId);
  if (!invite || !room || !game) return res.status(404).json({ error: "Invitation expirée." });
  const tableAccess = tableFeatureAccess(user, room, db);
  if (!tableAccess.allowed) return rejectFeature(res, tableAccess);
  if (room.players.some((p) => p.id === user.id)) return res.json(sanitizeRoom(room, req.auth.id));
  if (room.state) {
    grantSpectatorAccess(room, user.id);
    user.roomInvites = user.roomInvites.filter((row) => row.id !== inviteId);
    writeDb(db);
    return res.json(sanitizeRoom(room, user.id, db, true));
  }
  if (room.players.length >= game.maxPlayers) return res.status(400).json({ error: "Table complète." });
  if (user.tokens < room.stake) return res.status(400).json({ error: "Jetons insuffisants." });
  room.players.push(roomPlayerFor(user));
  user.roomInvites = user.roomInvites.filter((row) => row.id !== inviteId);
  writeDb(db);
  broadcastRooms();
  emitRoomUpdate(room);
  res.json(sanitizeRoom(room, req.auth.id));
});

app.delete("/api/room-invites/:id", auth, (req, res) => {
  updateDb((db) => {
    const user = db.users.find((u) => u.id === req.auth.id);
    if (!user) return;
    ensureUserSocial(user);
    user.roomInvites = user.roomInvites.filter((invite) => invite.id !== req.params.id);
  });
  res.json({ ok: true });
});

app.delete("/api/rooms/:code", auth, (req, res) => {
  const db = readDb();
  const room = db.rooms.find((r) => r.code === req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: "Table introuvable." });
  if (room.ownerId !== req.auth.id) return res.status(403).json({ error: "Seul le créateur peut fermer cette table." });
  if (room.state?.gameId === "texas-holdem") {
    for (const player of [...room.players]) cashOutPokerPlayer(room, db, player.id, "poker-table-closed");
  }
  db.rooms = db.rooms.filter((r) => r.id !== room.id);
  writeDb(db);
  io.to(room.id).emit("room-closed", { code: room.code });
  broadcastRooms();
  res.json({ ok: true });
});

app.post("/api/rooms/:code/kick", auth, (req, res) => {
  const db = readDb();
  const room = db.rooms.find((r) => r.code === req.params.code.toUpperCase() && !r.finished);
  if (!room) return res.status(404).json({ error: "Table introuvable." });
  if (room.ownerId !== req.auth.id) return res.status(403).json({ error: "Seul le maître peut exclure un joueur." });
  const playerId = String(req.body.playerId ?? "");
  if (!playerId || playerId === room.ownerId) return res.status(400).json({ error: "Joueur impossible à exclure." });
  if (!room.players.some((p) => p.id === playerId)) return res.status(404).json({ error: "Joueur introuvable à cette table." });
  const excludedUser = db.users.find((entry) => entry.id === playerId);
  const exclusion = { type: "room-exclusion", title: "Vous avez été exclu", message: `Le maître vous a exclu de la table « ${room.name} ».`, actorId: room.ownerId, roomCode: room.code };
  const notification = excludedUser ? pushNotification(excludedUser, exclusion) : { ...exclusion, id: randomUUID(), createdAt: new Date().toISOString() };
  if (room.state?.gameId === "texas-holdem") cashOutPokerPlayer(room, db, playerId, "poker-kicked-cash-out");
  else {
    room.players = room.players.filter((p) => p.id !== playerId);
    removePlayerFromRoomState(room, playerId);
  }
  if (!room.state) {
    const humans = room.players.filter((player) => !player.isBot);
    if (humans.length === 1) room.readyPlayerIds = [...new Set([...(room.readyPlayerIds ?? []), humans[0].id])];
  }
  if (room.state && !room.state.finished) runBotTurns(room, db);
  finishRoomIfNeeded(room, db);
  writeDb(db);
  const safeRoom = sanitizeRoom(room, req.auth.id);
  // Notify before the room update and revoke every live subscription of this player.
  for (const socketId of [...(roomPresence.get(room.id) ?? [])]) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket?.data.userId !== playerId) continue;
    socket.emit("room-player-kicked", { code: room.code, playerId, reason: "owner", notification });
    socket.leave(room.id);
    roomPresence.get(room.id)?.delete(socketId);
    delete socket.data.roomId;
  }
  emitRoomUpdate(room);
  broadcastRooms();
  res.json(safeRoom);
});

app.post("/api/rooms/:code/bot", auth, (req, res) => {
  const db = readDb();
  const room = db.rooms.find((r) => r.code === req.params.code.toUpperCase() && r.ownerId === req.auth.id && !r.state);
  if (!room) return res.status(404).json({ error: "Table introuvable." });
  const game = games.find((g) => g.id === room.gameId);
  if (room.players.length >= game.maxPlayers) return res.status(400).json({ error: "Table complète." });
  room.players.push({ id: randomUUID(), pseudo: `Bot ${room.players.length}`, tokens: platformSettings(db).signupTokens, isBot: true, guest: true });
  if (room.gameId === "belote") room.beloteSeats = beloteSeats(room);
  writeDb(db);
  emitRoomUpdate(room);
  broadcastRooms();
  res.json(sanitizeRoom(room, req.auth.id));
});

app.post("/api/rooms/:code/poker-settings", auth, (req, res) => {
  const db = readDb();
  const room = db.rooms.find((entry) => entry.code === req.params.code.toUpperCase() && entry.ownerId === req.auth.id && !entry.state && entry.gameId === "texas-holdem");
  if (!room) return res.status(404).json({ error: "Réglages de table indisponibles." });
  const requestedBigBlind = Math.floor(Number(req.body.bigBlind));
  if (!Number.isFinite(requestedBigBlind) || requestedBigBlind < 2) return res.status(400).json({ error: "La grosse blinde doit être d'au moins 2 jetons." });
  if (requestedBigBlind % 2) return res.status(400).json({ error: "La grosse blinde doit être paire afin que la petite blinde vaille exactement sa moitié." });
  const { smallBlind, bigBlind } = pokerBlindsFromBigBlind(requestedBigBlind);
  const maximumBet = Math.floor(Number(req.body.maximumBet));
  if (!Number.isFinite(maximumBet) || maximumBet < bigBlind) return res.status(400).json({ error: "La mise maximale doit être supérieure ou égale à la grosse blinde." });
  room.pokerBlinds = { smallBlind, bigBlind, maximumBet };
  writeDb(db);
  const safeRoom = sanitizeRoom(room, req.auth.id);
  emitRoomUpdate(room);
  res.json(safeRoom);
});

app.post("/api/rooms/:code/battle-settings", auth, (req, res) => {
  const db = readDb();
  const room = db.rooms.find((entry) => entry.code === req.params.code.toUpperCase() && entry.ownerId === req.auth.id && !entry.state && entry.gameId === "bataille");
  if (!room) return res.status(404).json({ error: "Modificateurs de Bataille indisponibles." });
  room.battleModifiers = normalizeBattleModifiers(req.body);
  writeDb(db);
  const safeRoom = sanitizeRoom(room, req.auth.id);
  emitRoomUpdate(room);
  broadcastRooms();
  res.json(safeRoom);
});

app.post("/api/rooms/:code/game-settings", auth, (req, res) => {
  const db = readDb();
  const room = db.rooms.find((entry) => entry.code === req.params.code.toUpperCase() && entry.ownerId === req.auth.id && !entry.state);
  if (!room) return res.status(404).json({ error: "Réglages de table indisponibles." });
  room.gameModifiers = normalizeGameModifiers(room.gameId, req.body);
  writeDb(db);
  const safeRoom = sanitizeRoom(room, req.auth.id);
  emitRoomUpdate(room);
  res.json(safeRoom);
});

app.post("/api/rooms/:code/leave", auth, (req, res) => {
  const db = readDb();
  const room = db.rooms.find((entry) => entry.code === req.params.code.toUpperCase() && !entry.finished);
  if (!room || !room.players.some((entry) => entry.id === req.auth.id)) return res.status(404).json({ error: "Table introuvable." });
  if (room.state?.gameId === "texas-holdem") cashOutPokerPlayer(room, db, req.auth.id);
  else {
    room.players = room.players.filter((entry) => entry.id !== req.auth.id);
    removePlayerFromRoomState(room, req.auth.id);
  }
  if (room.gameId === "belote" && room.state && !room.state.finished) {
    if (room.ownerId === req.auth.id) room.ownerId = room.players.find((player) => !player.isBot)?.id ?? room.ownerId;
    runBotTurns(room, db);
  }
  if (!room.state) {
    const humans = room.players.filter((player) => !player.isBot);
    if (humans.length === 1) room.readyPlayerIds = [...new Set([...(room.readyPlayerIds ?? []), humans[0].id])];
  }
  finishRoomIfNeeded(room, db);
  writeDb(db);
  emitRoomUpdate(room);
  broadcastRooms();
  res.json({ ok: true });
});

app.post("/api/rooms/:code/ready", auth, (req, res) => {
  const db = readDb();
  const room = db.rooms.find((entry) => entry.code === req.params.code.toUpperCase() && !entry.state && !entry.finished);
  if (!room || !room.players.some((player) => player.id === req.auth.id && !player.isBot)) return res.status(404).json({ error: "Table introuvable." });
  const access = tableFeatureAccess(getUser(req.auth.id), room, db);
  if (!access.allowed) return rejectFeature(res, access);
  room.readyPlayerIds ??= [];
  room.readyPlayerIds = room.readyPlayerIds.includes(req.auth.id) ? room.readyPlayerIds.filter((id) => id !== req.auth.id) : [...room.readyPlayerIds, req.auth.id];
  writeDb(db);
  const safeRoom = sanitizeRoom(room, req.auth.id);
  emitRoomUpdate(room);
  res.json(safeRoom);
});

app.post("/api/rooms/:code/start", auth, (req, res) => {
  const db = readDb();
  const room = db.rooms.find((r) => r.code === req.params.code.toUpperCase() && r.ownerId === req.auth.id && !r.state);
  if (!room) return res.status(404).json({ error: "Table introuvable." });
  const access = tableFeatureAccess(getUser(req.auth.id), room, db);
  if (!access.allowed) return rejectFeature(res, access);
  const game = configuredGames(db).find((entry) => entry.id === room.gameId);
  if (!game) return res.status(404).json({ error: "Jeu introuvable." });
  const humans = room.players.filter((player) => !player.isBot);
  if (humans.length === 1) room.readyPlayerIds = [...new Set([...(room.readyPlayerIds ?? []), humans[0].id])];
  while (room.players.length < game.minPlayers && room.players.length < game.maxPlayers) {
    room.players.push({ id: randomUUID(), pseudo: `Bot ${room.players.filter((player) => player.isBot).length + 1}`, tokens: platformSettings(db).signupTokens, isBot: true, guest: true });
  }
  const waitingHumans = room.players.filter((player) => !player.isBot && player.id !== room.ownerId && !(room.readyPlayerIds ?? []).includes(player.id));
  if (waitingHumans.length) return res.status(400).json({ error: `Tous les joueurs doivent être prêts (${waitingHumans.map((player) => player.pseudo).join(", ")}).` });
  const error = startRoomRound(room, db);
  if (error === "missing") return res.status(404).json({ error: "Jeu introuvable." });
  if (error) return res.status(400).json({ error });
  const achievementUnlocks = consumeRoomAchievementUnlocks(room, req.auth.id);
  writeDb(db);
  const safeRoom = sanitizeRoom(room, req.auth.id);
  emitRoomUpdate(room);
  broadcastRooms();
  res.json({ ...safeRoom, achievementUnlocks });
});

app.post("/api/rooms/:code/replay", auth, (req, res) => {
  const db = readDb();
  const room = db.rooms.find((r) => r.code === req.params.code.toUpperCase() && r.ownerId === req.auth.id && r.finished);
  if (!room) return res.status(404).json({ error: "Replay indisponible." });
  room.state = null;
  room.pacing = null;
  const humans = room.players.filter((player) => !player.isBot);
  room.readyPlayerIds = humans.length === 1 ? [humans[0].id] : [];
  room.finished = false;
  room.createdAt = new Date().toISOString();
  syncRoomPlayerTokens(room, db);
  writeDb(db);
  const safeRoom = sanitizeRoom(room, req.auth.id);
  emitRoomUpdate(room);
  broadcastRooms();
  res.json(safeRoom);
});

app.post("/api/rooms/:code/replay-now", auth, (req, res) => {
  const db = readDb();
  const room = db.rooms.find((entry) => entry.code === req.params.code.toUpperCase() && entry.ownerId === req.auth.id && entry.finished && entry.gameId === "blackjack");
  if (!room) return res.status(404).json({ error: "Nouvelle manche de Blackjack indisponible." });
  const error = startRoomRound(room, db);
  if (error === "missing") return res.status(404).json({ error: "Jeu introuvable." });
  if (error) return res.status(400).json({ error });
  room.createdAt = new Date().toISOString();
  const achievementUnlocks = consumeRoomAchievementUnlocks(room, req.auth.id);
  writeDb(db);
  const safeRoom = sanitizeRoom(room, req.auth.id);
  emitRoomUpdate(room);
  broadcastRooms();
  res.json({ ...safeRoom, achievementUnlocks });
});

app.post("/api/rooms/:code/action", auth, (req, res) => {
  const db = readDb();
  const room = db.rooms.find((r) => r.code === req.params.code.toUpperCase());
  if (!room?.state) return res.status(404).json({ error: "Partie non démarrée." });
  const access = tableFeatureAccess(getUser(req.auth.id), room, db);
  if (!access.allowed) return rejectFeature(res, access);
  if (!room.players.some((player) => player.id === req.auth.id && !player.isBot) || !room.state.players.some((player) => player.id === req.auth.id && !player.isBot)) return res.status(403).json({ error: "Un spectateur ne peut pas jouer." });
  if (room.finished && !(room.state.gameId === "texas-holdem" && req.body.type === "show")) return res.status(404).json({ error: "Cette partie est terminée." });
  const pacingAdvanced = room.pacing && !roomPacingActive(room) ? advanceRoomPacing(room, db) : false;
  const actionAllowedDuringPacing = (room.state.gameId === "texas-holdem" && req.body.type === "show")
    || (room.pacing?.kind === "turn-end" && room.pacing.actorIsBot && room.state.gameId === "midnight-dice" && room.state.phase === "contract" && req.body.type === "choose-contract");
  if (roomPacingActive(room) && !actionAllowedDuringPacing) {
    if (pacingAdvanced) {
      writeDb(db);
      emitRoomUpdate(room, db);
    }
    const pacingError = room.pacing.kind === "round-results"
      ? "La manche suivante commencera après les résultats."
      : room.pacing.kind === "bot-thinking"
        ? "L'IA prépare encore son coup."
        : "Le tour précédent est encore affiché.";
    return res.status(409).json({ error: pacingError });
  }
  try {
    const actionPlayer = room.state.players?.find((player) => player.id === req.auth.id);
    const turnBeforeActionPlayerId = room.state.players?.[room.state.currentPlayerIndex]?.id ?? "";
    const achievementSnapshot = actionAchievementSnapshot(room.state, req.auth.id);
    const roundBeforeAction = roundProgressSnapshot(room.state);
    const actionNow = Date.now();
    if (req.body.type === "roll" && !actionPlayer?.isBot && (room.state.rollAvailableAt?.[req.auth.id] ?? 0) > actionNow) throw new Error("Laisse les dés terminer leur lancer avant de relancer.");
    if (room.state.gameId === "blackjack" && req.body.type === "bet") {
      const minimumBet = Math.max(1, Number(room.state.modifiers?.minimumBet) || 1);
      const maximumBet = Math.max(minimumBet, Number(room.state.modifiers?.maximumBet) || minimumBet);
      const amount = Math.floor(Number(req.body.amount) || 0);
      if (amount < minimumBet) throw new Error(`La mise minimale est de ${minimumBet} jetons.`);
      if (amount > maximumBet) throw new Error(`La mise maximale est de ${maximumBet} jetons.`);
      if (room.state.bets[req.auth.id]) throw new Error("Mise déjà placée.");
      if (getTokenBalance(db, req.auth.id) < amount) throw new Error("Jetons insuffisants.");
      addTokens(db, req.auth.id, -amount, { gameId: room.gameId, roomId: room.id, reason: "blackjack-bet" });
      appendRoomAchievementUnlocks(room, req.auth.id, unlockEligibleAchievements(db.users.find((u) => u.id === req.auth.id), db));
      triggerRandomAchievement(db, req.auth.id, room);
      syncRoomPlayerTokens(room, db);
    }
    if (room.state.gameId === "blackjack" && req.body.type === "double") {
      const originalBet = Number(room.state.bets?.[req.auth.id]) || 0;
      const hand = room.state.hands?.[req.auth.id] ?? [];
      if (!originalBet || hand.length !== 2) throw new Error("Le doublement est disponible uniquement sur les deux cartes initiales.");
      if (Object.keys(room.state.bets ?? {}).length < room.state.players.filter((player) => !player.isBot).length) throw new Error("Toutes les mises doivent être placées avant de doubler.");
      if ((room.state.completedPlayerIds ?? []).includes(req.auth.id)) throw new Error("Ta main est déjà terminée.");
      if (blackjackHandTotal(hand) === 21) throw new Error("Une main de 21 ne peut pas être doublée.");
      if (getTokenBalance(db, req.auth.id) < originalBet) throw new Error("Jetons insuffisants pour doubler la mise.");
      addTokens(db, req.auth.id, -originalBet, { gameId: room.gameId, roomId: room.id, reason: "blackjack-double" });
      appendRoomAchievementUnlocks(room, req.auth.id, unlockEligibleAchievements(db.users.find((u) => u.id === req.auth.id), db));
      triggerRandomAchievement(db, req.auth.id, room);
      syncRoomPlayerTokens(room, db);
    }
    if (room.state.gameId === "421" && req.body.type === "buy-reroll") {
      if (!room.state.modifiers?.paidRerollsEnabled) throw new Error("Les relances payantes sont désactivées.");
      if (room.state.players?.[room.state.currentPlayerIndex]?.id !== req.auth.id) throw new Error("Ce n'est pas ton tour.");
      if (room.state.rollsLeft > 0 || room.state.dice?.length !== 3) throw new Error("Cette relance sera disponible après les lancers gratuits.");
      const used = Number(room.state.paidRerollsUsed?.[req.auth.id]) || 0;
      if (used >= (room.state.modifiers?.paidRerollsPerTurn ?? 2)) throw new Error("Limite de relances payantes atteinte pour ce tour.");
      const amount = paidRerollPrice421(room.state, req.auth.id);
      if (getTokenBalance(db, req.auth.id) < amount) throw new Error("Jetons insuffisants pour acheter cette relance.");
      addTokens(db, req.auth.id, -amount, { gameId: room.gameId, roomId: room.id, reason: "421-paid-reroll" });
      syncRoomPlayerTokens(room, db);
    }
    room.state = applyAction(room.state, req.auth.id, req.body);
    processAchievementEvent(db, req.auth.id, gameActionAchievementEvent(room, req.auth.id, req.body, achievementSnapshot), room);
    if (req.body.type === "roll" && !actionPlayer?.isBot) room.state.rollAvailableAt = { ...(room.state.rollAvailableAt ?? {}), [req.auth.id]: Date.now() + 700 };
    const showingRoundResults = startRoundResultsIfNeeded(room, roundBeforeAction, actionPlayer);
    if (!showingRoundResults) {
      const turnAfterActionPlayerId = room.state.players?.[room.state.currentPlayerIndex]?.id ?? "";
      const humanTurnEnded = !room.state.finished
        && room.state.gameId !== "bataille"
        && turnBeforeActionPlayerId === req.auth.id
        && (turnAfterActionPlayerId !== turnBeforeActionPlayerId || didRoundFinish(roundBeforeAction, room.state));
      if (humanTurnEnded && !roomPacingActive(room)) {
        const timing = roomTiming(room);
        startRoomPacing(room, "turn-end", timing.turnEndDelayMs, {
          actorId: actionPlayer?.id ?? req.auth.id,
          actorName: actionPlayer?.pseudo ?? "Le joueur",
          actorIsBot: false
        });
      } else {
        runBotTurns(room, db);
      }
    }
    finishRoomIfNeeded(room, db);
    const achievementUnlocks = consumeRoomAchievementUnlocks(room, req.auth.id);
    writeDb(db);
    const safeRoom = sanitizeRoom(room, req.auth.id, db);
    emitRoomUpdate(room, db);
    res.json({ ...safeRoom, achievementUnlocks });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/rooms/:code/pacing/skip", auth, (req, res) => {
  const db = readDb();
  const room = db.rooms.find((entry) => entry.code === req.params.code.toUpperCase());
  if (!room?.state || !room.pacing) return res.status(404).json({ error: "Aucune attente à passer." });
  if (!room.players.some((player) => player.id === req.auth.id && !player.isBot)) return res.status(403).json({ error: "Seuls les joueurs assis peuvent accélérer la partie." });
  if (req.body?.pacingId && req.body.pacingId !== room.pacing.id) return res.status(409).json({ error: "Cette attente est déjà terminée." });
  room.pacing.endsAt = Date.now();
  advanceRoomPacing(room, db, Date.now());
  finishRoomIfNeeded(room, db);
  writeDb(db);
  const safeRoom = sanitizeRoom(room, req.auth.id, db);
  emitRoomUpdate(room, db);
  res.json(safeRoom);
});

app.get("/api/history", auth, (req, res) => {
  const db = readDb();
  const page = ledgerPage(db.history, req.auth.id, req.query);
  page.rows = page.rows.map((row) => enrichHistoryRow(row, db, req.auth.id));
  res.json(req.query.paged === "1" ? page : page.rows);
});

app.get("/api/transactions", auth, (req, res) => {
  const page = ledgerPage(readDb().transactions, req.auth.id, req.query);
  res.json(req.query.paged === "1" ? page : page.rows);
});

app.get("/api/me/statistics", auth, (req, res) => {
  const stats = playerStatistics(readDb(), req.auth.id);
  res.json({ ...stats, todayGames: stats.activity[casinoDateKey()] ?? 0 });
});

let parentalDigestRunning = false;
async function processParentalDigests(now = Date.now()) {
  if (parentalDigestRunning) return;
  parentalDigestRunning = true;
  try {
    const db = readDb();
    const day = casinoDateKey(now);
    if (emailDeliveryConfigured()) {
      for (const request of parentalControls.approvedGuardians()) {
        const user = db.users.find((entry) => entry.id === request.userId);
        if (!user || !isUnder13(user, now)) continue;
        const approvalDay = casinoDateKey(request.reviewedAt || request.createdAt);
        for (let offset = 7; offset >= 1; offset -= 1) {
          const summaryDay = shiftDateKey(day, -offset);
          if (summaryDay < approvalDay || parentalControls.mailWasSent(user.id, "daily", summaryDay)) continue;
          const summary = parentalPortalSummary(request, summaryDay);
          try { await sendParentDailySummary({ request, portalToken: request.portalToken, date: summaryDay, metrics: summary.metrics }); parentalControls.markMailSent(user.id, "daily", summaryDay, now); }
          catch (error) { console.error("Parent daily summary failed:", error.message); break; }
        }
        const birthday = Date.parse(turnsThirteenAt(user.profile?.birthDate));
        const days = Math.ceil((birthday - now) / 86400000);
        const reminder = days <= 0 ? null : days <= 1 ? 1 : days <= 7 ? 7 : days <= 30 ? 30 : null;
        if (reminder && !parentalControls.mailKindWasSent(user.id, `birthday-${reminder}`)) {
          try { await sendParentBirthdayReminder({ request, portalToken: request.portalToken, days }); parentalControls.markMailSent(user.id, `birthday-${reminder}`, day, now); }
          catch (error) { console.error("Parent birthday reminder failed:", error.message); }
        }
      }
    }
    parentalControls.prune(shiftDateKey(day, -120), now);
  } finally { parentalDigestRunning = false; }
}

setInterval(() => {
  const db = readDb();
  const changedEvents = [];
  for (const event of db.communityEvents) {
    if (syncCommunityEventLifecycle(db, event)) changedEvents.push(event);
  }
  if (!changedEvents.length) return;
  writeDb(db);
  for (const event of changedEvents) emitCommunityEvent(event);
}, 10000).unref();

setInterval(() => {
  const db = readDb();
  let changed = false;
  const now = Date.now();
  for (const room of db.rooms.filter((entry) => entry.pacing)) {
    if (!advanceRoomPacing(room, db, now)) continue;
    changed = true;
    emitRoomUpdate(room, db);
  }
  for (const room of db.rooms.filter((entry) => entry.state?.gameId === "texas-holdem" && !entry.finished)) {
    if (roomPacingActive(room, now)) continue;
    const roundBeforeTick = roundProgressSnapshot(room.state);
    let roomChanged = tickPokerState(room.state, now);
    const showingResults = roomChanged && startRoundResultsIfNeeded(room, roundBeforeTick);
    if (roomChanged && !showingResults) runBotTurns(room, db);
    const current = room.state.currentPlayerIndex >= 0 ? room.state.players[room.state.currentPlayerIndex] : null;
    if (current && !current.isBot && room.state.turnDeadline && now >= room.state.turnDeadline) {
      cashOutPokerPlayer(room, db, current.id, "poker-timeout-cash-out");
      finishRoomIfNeeded(room, db);
      io.to(room.id).emit("room-player-kicked", { code: room.code, playerId: current.id, reason: "timeout" });
      roomChanged = true;
    }
    if (roomChanged && !room.state.finished && !roomPacingActive(room, now)) runBotTurns(room, db);
    if (roomChanged) {
      changed = true;
      emitRoomUpdate(room, db);
    }
  }
  for (const room of db.rooms.filter((entry) => entry.state?.gameId === "bataille" && !entry.finished)) {
    if (roomPacingActive(room, now)) continue;
    const roundBeforeTick = roundProgressSnapshot(room.state);
    if (!tickBattleState(room.state, now)) continue;
    const showingResults = startRoundResultsIfNeeded(room, roundBeforeTick);
    finishRoomIfNeeded(room, db);
    if (!room.finished && !showingResults) runBotTurns(room, db);
    changed = true;
    emitRoomUpdate(room, db);
  }
  if (changed) {
    writeDb(db);
  }
}, 1000).unref();

io.on("connection", (socket) => {
  socket.emit("rooms", sanitizeRooms(readDb().rooms.filter((room) => room.isPublic && !room.finished)));
  const subscribeToChat = (payload = {}) => {
    const token = payload.token || socket.handshake.auth?.token;
    if (!token) return;
    let viewer;
    try { viewer = jwt.verify(token, JWT_SECRET); } catch { return; }
    const db = readDb();
    const user = db.users.find((entry) => entry.id === viewer.id && entry.active !== false && !entry.guest);
    const staleSession = user && (Number(viewer.sessionVersion) || 0) !== (Number(user.sessionVersion) || 0);
    if (!user || staleSession || activeModeration(user)?.type === "hard" || activeParentalRevocation(user)) return;
    ensureUserSocial(user);
    socket.data.chatUserId = user.id;
    socket.join("chat:global");
    for (const friendId of user.friends) socket.join(`chat:direct:${directChannelId(user.id, friendId)}`);
    const room = payload.roomCode ? chatRoomAccess(db, user.id, payload.roomCode) : null;
    if (room) socket.join(`chat:room:${room.id}`);
    socket.emit("chat-ready", { roomCode: room?.code ?? "" });
  };
  subscribeToChat();
  socket.on("chat-subscribe", subscribeToChat);
  socket.on("watch-room", (payload) => {
    const roomId = typeof payload === "string" ? payload : payload?.roomId;
    if (!roomId || typeof payload !== "object" || !payload?.token) return;
    let viewer;
    try {
      viewer = jwt.verify(payload.token, JWT_SECRET);
    } catch {
      socket.emit("room-error", { error: "Session invalide." });
      return;
    }
    const room = readDb().rooms.find((entry) => entry.id === roomId);
    const seated = room?.players.some((player) => player.id === viewer.id);
    const viewerUser = getUser(viewer.id);
    const staleSession = viewerUser && (Number(viewer.sessionVersion) || 0) !== (Number(viewerUser.sessionVersion) || 0);
    const roomAccess = viewerUser ? userFeatureAccess(viewerUser, room?.ownerId === viewer.id ? "rooms:create" : "rooms:join") : { allowed: false };
    const gameAccess = viewerUser && room ? userFeatureAccess(viewerUser, `game:${room.gameId}`) : { allowed: false };
    if (!room || !viewerUser || viewerUser.active === false || staleSession || !roomAccess.allowed || !gameAccess.allowed || (!seated && (!payload.spectator || !maySpectate(room, viewer.id)))) {
      socket.emit("room-error", { error: "Table introuvable." });
      return;
    }
    if (socket.data.roomId && socket.data.roomId !== roomId) {
      socket.leave(socket.data.roomId);
      roomPresence.get(socket.data.roomId)?.delete(socket.id);
    }
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.userId = viewer.id;
    socket.data.spectator = payload.spectator === true || !seated;
    socket.join(`chat:room:${room.id}`);
    const sockets = roomPresence.get(roomId) ?? new Set();
    sockets.add(socket.id);
    roomPresence.set(roomId, sockets);
    socket.emit("room", sanitizeRoom(room, viewer.id, undefined, socket.data.spectator));
  });
  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const sockets = roomPresence.get(roomId);
    sockets?.delete(socket.id);
    if (sockets?.size) return;
    roomPresence.delete(roomId);
    setTimeout(() => {
      if ((roomPresence.get(roomId)?.size ?? 0) > 0) return;
      const db = readDb();
      const room = db.rooms.find((r) => r.id === roomId);
      if (!room || room.state || room.finished) return;
      db.rooms = db.rooms.filter((r) => r.id !== roomId);
      writeDb(db);
      broadcastRooms();
    }, 10000);
  });
});

if (CLIENT_DIST) {
  if (!fs.existsSync(CLIENT_DIST)) {
    console.warn(`CLIENT_DIST is configured but does not exist: ${CLIENT_DIST}`);
  } else {
    app.use(express.static(CLIENT_DIST));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(CLIENT_DIST, "index.html"));
    });
  }
}

updateDb((db) => {
  db.communityEvents = (db.communityEvents ?? []).map((event) => normalizeCommunityEvent(event, event));
  for (const participant of db.communityEventParticipants ?? []) {
    participant.overflowPurchasesTotal = Math.max(0, Number(participant.overflowPurchasesTotal) || 0);
    participant.purchaseDaily ??= { date: casinoDateKey(), count: 0 };
    const event = db.communityEvents.find((entry) => entry.id === participant.eventId);
    if (event) participant.paidActionsPeriodKey ??= eventActionPeriodKey(event, new Date(participant.lastActivityAt ?? participant.joinedAt ?? Date.now()));
  }
  return true;
});

server.listen(PORT, HOST, () => {
  const protocol = HTTPS_PFX_PATH || (HTTPS_KEY_PATH && HTTPS_CERT_PATH) ? "https" : "http";
  console.log(`KTGA.ME server listening on ${protocol}://${HOST}:${PORT}`);
  requestLogs.append({ category: "lifecycle", level: "info", method: "SYSTEM", route: "server/start", message: `Serveur démarré, processus ${process.pid}.` });
  try { statusMonitor.backfillDowntime(); } catch (error) { console.error("Status history backfill failed:", error); }
  collectPublicStatus();
  setInterval(collectPublicStatus, STATUS_PROBE_INTERVAL_MS).unref();
  settleTribunalCases();
  setInterval(settleTribunalCases, 60 * 1000).unref();
  processParentalDigests();
  setInterval(processParentalDigests, 15 * 60 * 1000).unref();
});
