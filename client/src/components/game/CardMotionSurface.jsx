import { Children, Component, cloneElement, createRef } from "react";

function frame(root) {
  const cards = [...root.querySelectorAll("[data-card-piece]:not([data-card-flight])")]
    .filter((node) => node.getClientRects().length)
    .map((node) => ({
      node, parent: node.parentElement,
      key: node.dataset.cardTrack || node.dataset.cardFace,
      covered: node.hasAttribute("data-card-covered"),
      rect: node.getBoundingClientRect(), clone: node.cloneNode(true),
      player: node.dataset.cardPlayer,
      owner: node.closest("[data-card-owner]")?.dataset.cardOwner,
      stock: node.closest("[data-card-stock]")?.dataset.cardStock,
      drawSource: node.closest("[data-card-draw-source]")?.dataset.cardDrawSource,
      arrival: node.closest('[data-card-arrival="played"]')
    }));
  const owners = new Map([...root.querySelectorAll("[data-card-owner]")].map((node) => [node.dataset.cardOwner, node.getBoundingClientRect()]));
  return { cards, owners };
}

export class CardMotionSurface extends Component {
  state = { dealing: false };
  root = createRef();
  flights = new Set();
  targets = new Map();
  dealTimer = null;
  dealFrame = null;
  dealSlots = [];
  componentDidMount() { this.startDeal(); }
  getSnapshotBeforeUpdate(previous) {
    if (previous.version === this.props.version || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
    // Capture positions before React removes the card from its old zone.
    return frame(this.root.current);
  }
  componentDidUpdate(previous, _state, before) {
    if (previous.dealKey !== this.props.dealKey) { this.startDeal(); return; }
    if (!before) return;
    this.stopDeal();
    const after = frame(this.root.current);
    for (const target of after.cards) {
      if (target.stock) continue;
      const candidates = target.key ? before.cards.filter((card) => card.key === target.key) : [];
      const destinationCount = target.key ? after.cards.filter((card) => card.key === target.key).length : 0;
      let source = candidates.length === 1 && destinationCount === 1 ? candidates[0] : null;
      if (source && ((source.node === target.node && source.parent === target.parent) || (source.owner && source.owner === target.owner && !target.arrival))) continue;
      if (!source && target.arrival && !before.cards.some((card) => card.node === target.node && card.key === target.key)) {
        const id = target.player ?? previous.actorId, owner = before.owners.get(id);
        const removed = before.cards.filter((card) => card.owner === id && card.key && !after.cards.some((next) => next.key === card.key));
        const origin = removed.length === 1 ? removed[0] : before.cards.find((card) => card.owner === id && card.covered);
        if (owner) source = {
          rect: origin?.rect ?? {
            x: owner.x + owner.width / 2 - target.rect.width / 2,
            y: owner.y + owner.height / 2 - target.rect.height / 2,
            width: target.rect.width, height: target.rect.height
          },
          clone: target.clone
        };
      }
      if (!source && target.drawSource && !before.cards.some(card => card.node === target.node && card.key === target.key)) {
        source = before.cards.find(card => card.stock === target.drawSource);
      }
      if (!source || Math.hypot(source.rect.x - target.rect.x, source.rect.y - target.rect.y) < 35) continue;
      this.fly(source, target);
    }
  }
  fly(source, target) {
    if (this.flights.size >= 16 || !target.node.animate) return;
    this.targets.get(target.node)?.();
    // Never copy a private face onto a face-down destination.
    const clone = (source.stock || target.covered ? target.clone : source.clone).cloneNode(true);
    if (source.stock) {
      // A new draw travels covered, using the destination's cosmetic, then reveals on arrival.
      clone.querySelectorAll("strong, span").forEach(node => node.remove());
      const mark = document.createElement("span"); mark.textContent = "?"; clone.prepend(mark);
      clone.classList.add("card-back"); clone.classList.remove("red-suit");
      clone.removeAttribute("data-card-face"); clone.setAttribute("data-card-covered", "");
    }
    clone.removeAttribute("id"); clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    clone.setAttribute("aria-hidden", "true"); clone.removeAttribute("title"); clone.classList.remove("deal-card", "flip-card");
    target.node.classList.remove("deal-card", "flip-card");
    const style = getComputedStyle(target.node), destination = target.node.getBoundingClientRect();
    if (destination.width < 1 || destination.height < 1) return;
    Object.assign(clone.style, { position: "fixed", left: `${destination.x}px`, top: `${destination.y}px`, width: `${destination.width}px`, height: `${destination.height}px`, minWidth: "0", margin: "0", zIndex: "18", pointerEvents: "none", animation: "none", visibility: "visible", fontSize: style.fontSize, padding: style.padding, boxSizing: "border-box", transformOrigin: "center" });
    clone.dataset.cardFlight = "true";
    (document.fullscreenElement ?? document.body).append(clone);
    const visibility = target.node.style.visibility;
    target.node.style.visibility = "hidden";
    const animation = clone.animate([
      { transform: `translate(${source.rect.x - destination.x}px, ${source.rect.y - destination.y}px) scale(${source.rect.width / destination.width}, ${source.rect.height / destination.height}) rotate(-8deg)`, opacity: this.props.opaqueFlights || source.stock ? 1 : .85 },
      { transform: `translate(${(source.rect.x - destination.x) * .45}px, ${(source.rect.y - destination.y) * .45 - 20}px) scale(1.08) rotate(3deg)`, opacity: 1, offset: .5 },
      { transform: "translate(0,0) scale(1) rotate(0deg)", opacity: 1 }
    ], { duration: 520, easing: "cubic-bezier(.2,.7,.25,1)", fill: "forwards" });
    let done = false;
    const cleanup = () => { if (done) return; done = true; target.node.style.visibility = visibility; clone.remove(); this.flights.delete(cancel); this.targets.delete(target.node); };
    const cancel = () => { animation.cancel(); cleanup(); };
    this.flights.add(cancel);
    this.targets.set(target.node, cancel);
    animation.finished.then(cleanup, cleanup);
  }
  startDeal() {
    this.stopDeal();
    if (!this.props.dealKey || !this.props.dealSequence?.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try {
      const key = `ktga-table-dealt:${this.props.dealKey}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* The room transition still prevents reconnect replays without storage. */ }
    const root = this.root.current;
    root.dataset.tableDealing = "true";
    this.setState({ dealing: true });
    this.dealSlots = [...root.querySelectorAll("[data-table-deal-slot]")];
    for (const slot of this.dealSlots) slot.style.visibility = "hidden";
    let position = 0;
    const launch = () => {
      const sourceNode = root.querySelector('[data-card-stock="table-deal"] .playing-card');
      if (!sourceNode) { this.stopDeal(); return; }
      const slotId = this.props.dealSequence[position++];
      const slot = this.dealSlots.find(node => node.dataset.tableDealSlot === slotId);
      const node = slot?.matches("[data-card-piece]") ? slot : slot?.querySelector("[data-card-piece]");
      if (slot && node) {
        slot.style.visibility = "";
        this.fly({ rect: sourceNode.getBoundingClientRect(), clone: sourceNode, stock: "table-deal" }, { node, covered: node.hasAttribute("data-card-covered"), clone: node.cloneNode(true) });
      }
      this.dealTimer = setTimeout(position < this.props.dealSequence.length ? launch : () => this.stopDeal(), position < this.props.dealSequence.length ? 36 : 540);
    };
    this.dealFrame = requestAnimationFrame(() => { this.dealFrame = requestAnimationFrame(launch); });
    window.addEventListener("resize", this.cancelDeal);
    document.addEventListener("fullscreenchange", this.cancelDeal);
    document.addEventListener("visibilitychange", this.cancelDeal);
  }
  cancelDeal = () => this.stopDeal();
  stopDeal(unmount = false) {
    clearTimeout(this.dealTimer); cancelAnimationFrame(this.dealFrame);
    window.removeEventListener("resize", this.cancelDeal);
    document.removeEventListener("fullscreenchange", this.cancelDeal);
    document.removeEventListener("visibilitychange", this.cancelDeal);
    if (!this.dealSlots.length && !this.root.current?.dataset.tableDealing) return;
    for (const cancel of [...this.flights]) cancel();
    for (const slot of this.dealSlots) slot.style.visibility = "";
    this.dealSlots = [];
    if (this.root.current) delete this.root.current.dataset.tableDealing;
    if (!unmount && this.state.dealing) this.setState({ dealing: false });
  }
  componentWillUnmount() { this.stopDeal(true); for (const cancel of [...this.flights]) cancel(); }
  render() {
    if (this.props.attachToChild) {
      const child = Children.only(this.props.children);
      return cloneElement(child, { ref: this.root }, ...Children.toArray(child.props.children), this.state.dealing && <button key="table-deal-skip" className="secondary table-deal-skip" type="button" onClick={this.cancelDeal}>{this.props.skipLabel}</button>);
    }
    return <div ref={this.root} className="card-motion-surface" style={{ display: "contents" }}>{this.props.children}</div>;
  }
}
