// Pause controller for the runner. Pausing stops sim ticks; it never changes the sim.
// Inputs made while paused (or during the resume countdown) are thrown away, so a
// pause can't queue a hidden swipe or jump. The countdown is wall-clock UI only.
export const RESUME_COUNTDOWN_MS = 3000;

export function createPauseController({ getSim, inputs, gestures, countdownMs = RESUME_COUNTDOWN_MS }) {
  let resumeAt = 0;

  function discardInputs() {
    if (inputs) inputs.consume();
    if (gestures) gestures.cancel();
  }

  function pause() {
    const sim = getSim();
    if (!sim) return false;
    if (sim.mode === 'paused' && resumeAt) {
      // Paused again during the countdown: stop the countdown, stay paused.
      resumeAt = 0;
      discardInputs();
      return true;
    }
    if (sim.mode !== 'play') return false;
    sim.pause();
    resumeAt = 0;
    discardInputs();
    return true;
  }

  function requestResume(now) {
    const sim = getSim();
    if (!sim || sim.mode !== 'paused' || resumeAt) return false;
    resumeAt = now + countdownMs;
    discardInputs();
    return true;
  }

  // Call every frame. Returns seconds left in the countdown (0 when none).
  function update(now) {
    const sim = getSim();
    if (!resumeAt || !sim) return 0;
    if (sim.mode !== 'paused') { resumeAt = 0; return 0; }
    if (now >= resumeAt) {
      resumeAt = 0;
      discardInputs();
      sim.resume();
      return 0;
    }
    discardInputs();
    return Math.ceil((resumeAt - now) / 1000);
  }

  function counting() { return resumeAt > 0; }
  function reset() { resumeAt = 0; }

  return { pause, requestResume, update, counting, reset };
}
