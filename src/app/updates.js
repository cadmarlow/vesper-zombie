/** A running page keeps its code until a safe, explicit navigation. */
export function createUpdates({ version, build, onChange }) {
  let latest = null;
  let pending = null;
  let error = false;
  const notify = () => onChange({ latest, checking: !!pending, error });
  return {
    get available() {
      return !!latest;
    },
    check() {
      if (pending) return pending;
      error = false;
      pending = (async () => {
        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), 4000);
        try {
          const response = await fetch("/version.json", {
            cache: "no-store",
            signal: abort.signal,
          });
          if (!response.ok) throw new Error("version-unavailable");
          const release = await response.json();
          if (
            !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(release.version) ||
            typeof release.build !== "string" ||
            !/^[\w.-]{1,80}$/.test(release.build)
          )
            throw new Error("invalid-version");
          latest =
            release.build !== build || release.version !== version
              ? release
              : null;
        } catch {
          // A failed check must not erase a previously discovered update.
          error = true;
        } finally {
          clearTimeout(timeout);
          pending = null;
          notify();
        }
        return latest;
      })();
      notify();
      return pending;
    },
    apply() {
      if (!latest) return false;
      const url = new URL(location.href);
      url.searchParams.set("updated", latest.build);
      location.replace(url.href);
      return true;
    },
  };
}
