import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Coins, Dice5, DoorOpen, Eye, EyeOff, Filter, HelpCircle, Play, Plus, Search, Sparkles, Star, Trophy, Users, X } from "lucide-react";
import { SOCKET_PATH, SOCKET_URL, api } from "../api.js";
import { friendTables } from "../features/games/friend-tables.js";
import { JoinRoomDialog } from "../components/navigation/JoinRoomDialog.jsx";
import { PlayingCard } from "../components/game/GamePieces.jsx";
import { RulesModal, StepperBet } from "../components/game/GameSupport.jsx";
import { defaultPublicSettings, gameRules } from "../config/site.js";
import { CompactNumber, gameAudienceLabel, gameCategoryLabel, gameComplexityLabel } from "../utils/presentation.jsx";

function formatEventCountdown(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return `${days ? `${days}j ` : ""}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function EventCountdown({ startsAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return formatEventCountdown(new Date(startsAt).getTime() - now);
}

function formatEventDate(value) {
  return new Intl.DateTimeFormat("fr-BE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function GameRoomsModal({ game, rooms, user, stake, setStake, isPublic, setIsPublic, roomName, setRoomName, roomPassword, setRoomPassword, joinCode, setJoinCode, joinPassword, setJoinPassword, onCreate, onJoin, onEnterRoom, onRules, onClose, settings = defaultPublicSettings }) {
  if (!game) return null;
  const minimumStake = Math.max(game.id === "texas-holdem" ? settings.minPokerBuyIn : settings.minRoomStake, Number(game.entryPot) || 0);
  const filteredRooms = rooms.filter((room) => room.gameId === game.id);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal casino-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title-row">
          <div>
            <h2>{game.name}</h2>
            <p>{game.description || gameRules[game.id]?.goal}</p>
          </div>
          <button className="secondary icon-toggle" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="room-console room-browser-columns">
          <section className="room-panel create-panel">
            <div className="panel-heading">
              <span>Créer une table</span>
              <small>Configure le nom, l'accès, la mise et la visibilité avant d'ouvrir le salon.</small>
            </div>
            <div className="room-field-grid">
              <label>Nom de la table<input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder={`Table ${game.name} VIP`} /></label>
              <label>Mot de passe optionnel<input value={roomPassword} onChange={(e) => setRoomPassword(e.target.value)} placeholder="4 caractères minimum" type="password" /></label>
            </div>
            <StepperBet value={Math.max(stake, minimumStake)} onChange={setStake} min={minimumStake} max={Math.max(minimumStake, Number(user.tokens) || 0)} label={game.id === "texas-holdem" ? "Cave par joueur" : "Mise par joueur"} />
            <div className="room-panel-actions">
              <button className="secondary" onClick={() => setIsPublic((v) => !v)}>{isPublic ? <Eye size={18} /> : <EyeOff size={18} />} {isPublic ? "Publique" : "Privée"}</button>
              <button onClick={() => onCreate(game.id)}><Plus size={18} /> Créer</button>
            </div>
            <button className="secondary room-rules-button" onClick={() => onRules(game.id)}><HelpCircle size={18} /> Consulter les règles</button>
          </section>

          <section className="room-panel browse-panel">
            <div className="panel-heading">
              <span>Tables existantes</span>
              <small>Rejoins une table publique ou utilise directement un code d'invitation.</small>
            </div>
            <div className="direct-room-join">
              <strong>Rejoindre par code</strong>
              <div className="room-field-grid">
                <label>Code de la table<input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Ex : A1B2C3" /></label>
                <label>Mot de passe<input value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} placeholder="Si nécessaire" type="password" /></label>
              </div>
              <button className="direct-join-button" onClick={() => onJoin(joinCode)}>Rejoindre avec ce code</button>
            </div>

            <div className="available-room-heading">
              <strong>Tables publiques</strong>
              <small>{filteredRooms.length} disponible{filteredRooms.length > 1 ? "s" : ""}</small>
            </div>
            <div className="table-list">
              {filteredRooms.length === 0 && <div className="empty-state">Aucune table publique active pour ce jeu.</div>}
              {filteredRooms.map((room) => (
                <button className="table-row" key={room.id} onClick={() => onEnterRoom(room.code)}>
                  <span className="table-name"><strong>{room.name}</strong><small>Code {room.code}</small></span>
                  <span className="table-pill">{room.players.length} joueur{room.players.length > 1 ? "s" : ""}</span>
                  {room.inProgress && <span className="table-pill">En cours</span>}
                  {room.hasPassword && <span className="table-pill locked">Protégée</span>}
                  <span className="table-pill gold"><CompactNumber value={room.stake} suffix=" jetons" label="Mise exacte" /></span>
                </button>
              ))}
            </div>
          </section>
        </div>
        </div>
      </div>
  );
}

export function Lobby({ user, setUser, onOpenRoom, onEnterRoom, onOpenEvent, onAchievements, settings = defaultPublicSettings }) {
  const [games, setGames] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [friends, setFriends] = useState([]);
  const liveFriendTables = friendTables(rooms, friends);
  const [stake, setStake] = useState(settings.minRoomStake);
  const [isPublic, setIsPublic] = useState(true);
  const [roomName, setRoomName] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [gameTypeFilter, setGameTypeFilter] = useState("all");
  const [gameCategoryFilter, setGameCategoryFilter] = useState("all");
  const [gameAudienceFilter, setGameAudienceFilter] = useState("all");
  const [gameComplexityFilter, setGameComplexityFilter] = useState("all");
  const [gameSearch, setGameSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rulesGame, setRulesGame] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [error, setError] = useState("");
  const [eventCarousel, setEventCarousel] = useState({ events: [], focusIndex: 0 });
  const [eventIndex, setEventIndex] = useState(0);

  useEffect(() => {
    api("/api/games").then(setGames);
    api("/api/rooms").then(setRooms);
    const socket = io(SOCKET_URL, { path: SOCKET_PATH });
    socket.on("rooms", setRooms);
    api("/api/community-events/carousel").then((result) => { setEventCarousel(result); setEventIndex(result.focusIndex ?? 0); }).catch(() => {});
    socket.on("community-event-update", () => api("/api/community-events/carousel").then((result) => { setEventCarousel(result); setEventIndex((index) => Math.min(index, Math.max(0, result.events.length - 1))); }).catch(() => {}));
    return () => socket.disconnect();
  }, []);
  useEffect(() => { setStake((current) => Math.max(current, settings.minRoomStake)); }, [settings.minRoomStake]);
  useEffect(() => {
    let cancelled = false;
    setFriends([]);
    if (user.guest) return undefined;
    const refresh = () => api("/api/friends").then((data) => { if (!cancelled) setFriends(data.friends ?? []); }).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 10000);
    window.addEventListener("ktga-connections-updated", refresh);
    window.addEventListener("ktga-inbox-updated", refresh);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener("ktga-connections-updated", refresh); window.removeEventListener("ktga-inbox-updated", refresh); };
  }, [user.id, user.guest]);

  async function createRoom(gameId) {
    setError("");
    try {
      const room = await api("/api/rooms", { method: "POST", body: JSON.stringify({ gameId, stake, isPublic, name: roomName, password: roomPassword }) });
      setRoomName("");
      setRoomPassword("");
      onOpenRoom(room.code);
    } catch (err) {
      setError(err.message);
    }
  }

  async function joinRoom(code) {
    setError("");
    try {
      const room = await api(`/api/rooms/${code}/join`, { method: "POST", body: JSON.stringify({ password: joinPassword }) });
      setJoinPassword("");
      onOpenRoom(room.code, room.spectator);
    } catch (err) {
      setError(err.message);
    }
  }

  const categoryFilters = ["all", ...new Set(games.map((game) => game.category).filter(Boolean))];
  const activeFilterCount = [gameTypeFilter, gameCategoryFilter, gameAudienceFilter, gameComplexityFilter].filter((value) => value !== "all").length;
  const normalizedGameSearch = gameSearch.trim().toLocaleLowerCase("fr");
  const favorites = user.profile?.favoriteGames ?? [];
  const favoriteOrder = (game) => favorites.includes(game.id) ? favorites.indexOf(game.id) : favorites.length;
  const visibleGames = [...games].sort((left, right) => favoriteOrder(left) - favoriteOrder(right)).filter((game) => {
    const searchMatch = !normalizedGameSearch || `${game.name} ${game.description ?? ""}`.toLocaleLowerCase("fr").includes(normalizedGameSearch);
    const typeMatch = gameTypeFilter === "all" || game.type === gameTypeFilter;
    const categoryMatch = gameCategoryFilter === "all" || game.category === gameCategoryFilter;
    const audienceMatch = gameAudienceFilter === "all" || game.audience === gameAudienceFilter || (gameAudienceFilter === "solo" && game.audience === "solo-multi") || (gameAudienceFilter === "multi" && game.audience === "solo-multi");
    const complexityMatch = gameComplexityFilter === "all" || game.complexity === gameComplexityFilter;
    return searchMatch && typeMatch && categoryMatch && audienceMatch && complexityMatch;
  });
  const carouselEvents = eventCarousel.events ?? [];
  const activeCarouselEvent = carouselEvents[eventIndex] ?? null;
  const visibleEventCards = [-2, -1, 0, 1, 2].map((offset) => ({ offset, event: carouselEvents[eventIndex + offset], index: eventIndex + offset })).filter((entry) => entry.event);

  function resetGameFilters() {
    setGameSearch("");
    setGameTypeFilter("all");
    setGameCategoryFilter("all");
    setGameAudienceFilter("all");
    setGameComplexityFilter("all");
  }

  return (
    <main className="app-shell">
      <div className="page-heading lobby-heading"><div><span className="eyebrow">Le casino</span><h1>À quelle table joues-tu ?</h1></div></div>
      {error && <div className="error">{error}</div>}
      {activeCarouselEvent && <section className="lobby-event-carousel" aria-label="Événements communautaires">
        <button className="secondary icon-toggle event-carousel-arrow" disabled={eventIndex === 0} onClick={() => setEventIndex((index) => Math.max(0, index - 1))} aria-label="Événement précédent"><ChevronLeft /></button>
        <div className="event-carousel-viewport"><div className="event-carousel-track">{visibleEventCards.map(({ event: carouselEvent, index, offset }) => {
          const status = carouselEvent.status === "active" ? "active" : carouselEvent.status === "scheduled" ? "scheduled" : "finished";
          const cta = status === "active" ? (carouselEvent.participant ? "Continuer l’événement" : "Participer maintenant") : status === "scheduled" ? "Découvrir l’événement" : "Voir les résultats";
          const CtaIcon = status === "active" ? Play : status === "scheduled" ? Clock3 : Trophy;
          return <article role="button" tabIndex={0} aria-current={offset === 0 ? "true" : undefined} className={`lobby-event-slide event-slide-${status} offset-${Math.abs(offset)} ${offset < 0 ? "slide-left" : offset > 0 ? "slide-right" : "current"}`} key={carouselEvent.id} style={{ "--event-primary": carouselEvent.theme.primary, "--event-secondary": carouselEvent.theme.secondary, "--event-accent": carouselEvent.theme.accent }} onClick={() => offset === 0 ? onOpenEvent(carouselEvent.slug) : setEventIndex(index)} onKeyDown={(keyboardEvent) => { if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") { keyboardEvent.preventDefault(); offset === 0 ? onOpenEvent(carouselEvent.slug) : setEventIndex(index); } }}>
            {carouselEvent.theme.heroImage && <div className="lobby-event-slide-image"><img src={carouselEvent.theme.heroImage} alt="" style={{ objectPosition: `${carouselEvent.theme.heroPositionX ?? 50}% ${carouselEvent.theme.heroPositionY ?? 50}%`, transform: `scale(${(carouselEvent.theme.heroScale ?? 100) / 100})`, transformOrigin: `${carouselEvent.theme.heroPositionX ?? 50}% ${carouselEvent.theme.heroPositionY ?? 50}%` }} /></div>}
            <div className="lobby-event-slide-head"><span className="lobby-event-icon"><Sparkles /></span><span className={`event-status status-${status}`}>{status === "active" ? "En cours" : status === "scheduled" ? "À venir" : "Terminé"}</span></div>
            <div className="lobby-event-copy"><span className="eyebrow">{status === "active" ? "Événement communautaire" : status === "scheduled" ? "Prochainement" : "Archives"}</span><h2>{carouselEvent.name}</h2><p>{carouselEvent.shortDescription}</p><div className="lobby-event-dates"><CalendarDays size={15} /><span><b>Du {formatEventDate(carouselEvent.startsAt)}</b><b>au {formatEventDate(carouselEvent.endsAt)}</b></span></div></div>
            <div className="lobby-event-progress"><div><span>{status === "scheduled" ? "Début dans" : "Progression"}</span><strong>{status === "scheduled" ? <EventCountdown startsAt={carouselEvent.startsAt} /> : `${Math.round(carouselEvent.progress)} %`}</strong></div><i><b style={{ width: `${Math.min(100, carouselEvent.progress)}%` }} /></i><small><Users size={14} /> <CompactNumber value={carouselEvent.runtime.participantCount} /> <Coins size={14} /> <CompactNumber value={carouselEvent.runtime.pot} label="Pot exact" />{carouselEvent.participant && <> · <CompactNumber value={carouselEvent.participant.contribution} label="Contribution exacte" /> pts</>}</small></div>
            {offset === 0 && <button className={`event-carousel-cta event-carousel-cta-${status}`} onClick={(clickEvent) => { clickEvent.stopPropagation(); onOpenEvent(carouselEvent.slug); }}><CtaIcon size={18} /> {cta}</button>}
          </article>;
        })}</div></div>
        <button className="secondary icon-toggle event-carousel-arrow" disabled={eventIndex >= carouselEvents.length - 1} onClick={() => setEventIndex((index) => Math.min(carouselEvents.length - 1, index + 1))} aria-label="Événement suivant"><ChevronRight /></button>
        <div className="event-carousel-position" aria-live="polite"><strong>{eventIndex + 1}</strong><span>/ {carouselEvents.length}</span></div>
      </section>}
      <div className="lobby-join-action"><button type="button" className="secondary" onClick={() => setJoinOpen(true)}><DoorOpen size={18} /> Rejoindre avec un code</button></div>
      {liveFriendTables.length > 0 && <section className="live-room-section"><h2>Parties en cours</h2><div className="live-room-list">{liveFriendTables.map((room) => <button className="secondary" key={room.code} onClick={() => onEnterRoom(room.code)}><Eye size={18} /><span>{room.name}</span></button>)}</div></section>}
      <div className="single-layout">
        <section>
          <div className="section-title"><h2>Jeux disponibles</h2><span>{visibleGames.length} jeu{visibleGames.length > 1 ? "x" : ""}</span></div>
          <div className="game-filter-panel">
            <div className="game-filter-toolbar">
              <label className="game-search-field"><Search size={18} /><span className="sr-only">Rechercher un jeu</span><input type="search" value={gameSearch} onChange={(event) => setGameSearch(event.target.value)} placeholder="Rechercher un jeu…" /></label>
              <button type="button" className={`secondary filter-toggle ${filtersOpen ? "active" : ""}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><Filter size={18} /> Filtres{activeFilterCount ? <b>{activeFilterCount}</b> : null}</button>
            </div>
            {filtersOpen && <div className="game-filter-controls">
              <label><span>Type de jeu</span><select value={gameTypeFilter} onChange={(event) => setGameTypeFilter(event.target.value)}><option value="all">Tous les types</option><option value="dice">Jeux de dés</option><option value="cards">Jeux de cartes</option></select></label>
              <label><span>Catégorie</span><select value={gameCategoryFilter} onChange={(event) => setGameCategoryFilter(event.target.value)}>{categoryFilters.map((value) => <option key={value} value={value}>{value === "all" ? "Toutes les catégories" : gameCategoryLabel(value)}</option>)}</select></label>
              <label><span>Nombre de joueurs</span><select value={gameAudienceFilter} onChange={(event) => setGameAudienceFilter(event.target.value)}>{["all", "solo", "multi"].map((value) => <option key={value} value={value}>{value === "all" ? "Toutes les configurations" : gameAudienceLabel(value)}</option>)}</select></label>
              <label><span>Difficulté</span><select value={gameComplexityFilter} onChange={(event) => setGameComplexityFilter(event.target.value)}>{["all", "easy", "intermediate", "advanced"].map((value) => <option key={value} value={value}>{value === "all" ? "Toutes les difficultés" : gameComplexityLabel(value)}</option>)}</select></label>
              <button type="button" className="secondary reset-game-filters" disabled={!activeFilterCount && !normalizedGameSearch} onClick={resetGameFilters}><X size={17} /> Réinitialiser</button>
            </div>}
            {(activeFilterCount > 0 || normalizedGameSearch) && <div className="active-filter-summary" aria-live="polite"><span>{visibleGames.length} résultat{visibleGames.length > 1 ? "s" : ""}</span>{gameTypeFilter !== "all" && <b>{gameTypeFilter === "dice" ? "Dés" : "Cartes"}</b>}{gameCategoryFilter !== "all" && <b>{gameCategoryLabel(gameCategoryFilter)}</b>}{gameAudienceFilter !== "all" && <b>{gameAudienceLabel(gameAudienceFilter)}</b>}{gameComplexityFilter !== "all" && <b>{gameComplexityLabel(gameComplexityFilter)}</b>}</div>}
          </div>
          <div className="game-grid">
            {visibleGames.map((game) => (
              <article key={game.id} className={`game-card premium-card ${game.type}`}>
                <span className="player-badge">{game.minPlayers}-{game.maxPlayers}</span>
                <div className="game-icon">{game.type === "dice" ? <Dice5 /> : <PlayingCard card={{ rank: "A", suit: "S" }} />}</div>
                <h3>{game.name}{favorites.includes(game.id) && <Star className="game-favorite" size={16} aria-label="Favori" fill="currentColor" />}</h3>
                <p>{game.description || gameRules[game.id]?.goal}</p>
                <div className="card-meta"><span>{gameCategoryLabel(game.category)}</span><span>{gameComplexityLabel(game.complexity)}</span><span>{rooms.filter((room) => room.gameId === game.id).length} tables publiques</span></div>
                <div className="card-actions"><button onClick={() => setSelectedGame(game)}><Play size={18} /> Ouvrir</button><button className="secondary" onClick={() => setRulesGame(game.id)}><HelpCircle size={18} /></button></div>
              </article>
            ))}
          </div>
          {!visibleGames.length && <div className="empty-state game-filter-empty"><strong>Aucun jeu ne correspond à ces critères.</strong><button className="secondary" onClick={resetGameFilters}>Effacer la recherche et les filtres</button></div>}
        </section>
      </div>
      {joinOpen && <JoinRoomDialog userId={user.id} onClose={() => setJoinOpen(false)} onJoined={onOpenRoom} />}
      <RulesModal gameId={rulesGame} onClose={() => setRulesGame(null)} />
      <GameRoomsModal game={selectedGame} rooms={rooms} user={user} stake={stake} setStake={setStake} isPublic={isPublic} setIsPublic={setIsPublic} roomName={roomName} setRoomName={setRoomName} roomPassword={roomPassword} setRoomPassword={setRoomPassword} joinCode={joinCode} setJoinCode={setJoinCode} joinPassword={joinPassword} setJoinPassword={setJoinPassword} onCreate={createRoom} onJoin={joinRoom} onEnterRoom={onEnterRoom} onRules={setRulesGame} onClose={() => setSelectedGame(null)} settings={settings} />
    </main>
  );
}
