// First-run "How to play" card. Display-only: it never reads or writes the sim.
// While the card is open every game input is dropped (same idea as pause), so a
// tap or key meant to close the card can't start a run or reach the sim.
export const HOWTO_KEY = 'tobuRunnerHowto1';

function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // e.g. storage blocked by privacy settings
  }
}

// True when the card should open on load. If storage is missing or throws we
// can't remember the player, so we show it (one tap to close, nothing lost).
export function shouldShowHowto(storage = defaultStorage()) {
  if (!storage) return true;
  try {
    return storage.getItem(HOWTO_KEY) !== '1';
  } catch {
    return true;
  }
}

// Remember that the card was seen. Returns false if storage is unavailable.
export function markHowtoSeen(storage = defaultStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(HOWTO_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

// Keys while the card is open: Enter (or Escape) closes it, everything else is dropped.
export function howtoKeyAction(code, isOpen) {
  if (!isOpen) return 'pass';
  if (code === 'Enter' || code === 'NumpadEnter' || code === 'Escape') return 'dismiss';
  return 'drop';
}

export function createHowtoController({ storage, inputs, gestures } = {}) {
  const store = storage === undefined ? defaultStorage() : storage;
  let open = false;

  function discardInputs() {
    if (inputs) inputs.consume();
    if (gestures) gestures.cancel();
  }

  function show() {
    open = true;
    discardInputs();
    return true;
  }

  // Open on load only for a first-time player.
  function showIfFirstRun() {
    return shouldShowHowto(store) ? show() : false;
  }

  function dismiss() {
    if (!open) return false;
    open = false;
    markHowtoSeen(store);
    discardInputs();
    return true;
  }

  // Any game input (swipe, tap, key, start-run) asks here first.
  function gate() { return open ? 'drop' : 'pass'; }
  function isOpen() { return open; }

  return { show, showIfFirstRun, dismiss, gate, isOpen };
}
