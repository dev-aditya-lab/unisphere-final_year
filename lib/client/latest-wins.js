// Saves a value the member can change quickly (a like, a bookmark, a follow) without races.
//
// The screen updates the moment the member acts. Requests are sent one at a time, and whatever the member chose
// last is what ends up saved: tapping like, unlike, like in quick succession sends at most the first request and one
// follow-up for the final state, instead of three requests that can finish in any order. If a save fails, the value
// rolls back to the last one the server confirmed and `onError` explains (with the value to retry).
//
// Framework-free so it can be unit-tested; `useLatestWins` (hooks/use-latest-wins.js) adapts it to React.

/**
 * @param {object} opts
 * @param {*} opts.initial        the value the server last confirmed
 * @param {(a,b)=>boolean} [opts.equals]  when two values count as the same intent
 * @param {(value)=>Promise<{ok:boolean, value?:*, error?:string}>} opts.save
 * @param {(value)=>void} opts.onChange   called with every value the screen should show
 * @param {(error:string|undefined, attempted:*)=>void} [opts.onError]
 */
export function createLatestWins({ initial, equals = Object.is, save, onChange, onError }) {
  let confirmed = initial;
  let latest = initial;
  let running = false;

  async function set(next) {
    latest = next;
    onChange(next);
    if (running) return; // the loop below will pick the newest value up
    running = true;
    try {
      while (!equals(latest, confirmed)) {
        const sending = latest;
        let res;
        try {
          res = await save(sending);
        } catch (err) {
          res = { ok: false, error: err?.message };
        }
        if (res.ok) {
          confirmed = res.value !== undefined ? res.value : sending;
          // Only adopt the server's numbers when the member has not moved on since this request was sent.
          if (equals(latest, sending)) {
            latest = confirmed;
            onChange(confirmed);
          }
        } else {
          latest = confirmed;
          onChange(confirmed);
          onError?.(res.error, sending);
          break;
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    set,
    get confirmed() {
      return confirmed;
    },
    get pending() {
      return running;
    },
  };
}
