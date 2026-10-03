// Code-split components (dialogs, sheets, My year) that load on first use.
//
//   const Sheet = lazy(() => import('./CitySheet.svelte'));
//   Sheet.load();          // start (or join) the fetch; safe to call often
//   Sheet.C                // the component once loaded, else null (reactive)
//   Sheet.error            // the last attempt failed (e.g. a deploy replaced
//                          // the chunk under an open tab): offer a reload
//
// load() resolves to the component; a failed attempt clears itself so the next
// call tries again.
export function lazy(loader) {
  const s = $state({ C: null, error: false });
  let pending = null;
  return {
    get C() {
      return s.C;
    },
    get error() {
      return s.error;
    },
    load() {
      if (s.C) return Promise.resolve(s.C);
      if (!pending) {
        s.error = false;
        pending = loader()
          .then((m) => (s.C = m.default))
          .catch((e) => {
            pending = null;
            s.error = true;
            throw e;
          });
      }
      return pending;
    }
  };
}
