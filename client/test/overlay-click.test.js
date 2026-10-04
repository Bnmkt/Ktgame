import assert from "node:assert/strict";
import test from "node:test";
import { createOverlayClickGuard } from "../src/components/common/overlay-click.js";

test("la fermeture exige un vrai clic commencé et terminé sur l'overlay", () => {
  const overlay = {}, panel = {};
  const event = (target, x = 10, pointerId = 1) => ({ target, currentTarget: overlay, clientX: x, clientY: 10, pointerId, button: 0, detail: 1 });
  const guard = createOverlayClickGuard();
  guard.down(event(panel)); guard.up(event(overlay));
  assert.equal(guard.click(event(overlay)), false);
  guard.down(event(overlay)); guard.up(event(panel));
  assert.equal(guard.click(event(overlay)), false);
  guard.down(event(overlay)); guard.move(event(overlay, 30)); guard.up(event(overlay));
  assert.equal(guard.click(event(overlay)), false);
  guard.down(event(overlay)); guard.up(event(overlay, 30));
  assert.equal(guard.click(event(overlay)), false);
  guard.down(event(overlay)); guard.up(event(overlay, 12));
  assert.equal(guard.click(event(overlay)), true);
  assert.equal(guard.click(event(overlay)), false);
  guard.down(event(overlay)); guard.cancel(); guard.up(event(overlay));
  assert.equal(guard.click(event(overlay)), false);
  guard.down(event(overlay)); guard.up(event(overlay, 10, 2));
  assert.equal(guard.click(event(overlay)), false);
});
