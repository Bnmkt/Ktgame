export function createOverlayClickGuard() {
  let gesture = null;
  return {
    down(event) {
      gesture = event.button === 0 ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY, outside: event.target === event.currentTarget, dragged: false, released: false } : null;
    },
    move(event) {
      if (gesture && event.pointerId === gesture.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6) gesture.dragged = true;
    },
    up(event) {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6) gesture.dragged = true;
      gesture.released = event.target === event.currentTarget;
    },
    cancel() { gesture = null; },
    click(event) {
      const voluntary = Boolean(gesture?.outside && gesture.released && !gesture.dragged && event.target === event.currentTarget && event.detail > 0);
      gesture = null;
      return voluntary;
    }
  };
}
