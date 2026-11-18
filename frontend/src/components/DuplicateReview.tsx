import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  api,
  type DuplicateGroup,
  type DuplicateResolution,
} from "../api/client";
import { runSync } from "../hooks/useOfflineSync";
import { formatCurrency, formatDateTime } from "../utils/format";

function extras(group: DuplicateGroup, keepId: number): number[] {
  return group.copies.map((copy) => copy.id).filter((id) => id !== keepId);
}

export default function DuplicateReview() {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [keepByKey, setKeepByKey] = useState<Record<string, number>>({});
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setError("");
    const data = await api.transactions.duplicateGroups();
    setGroups(data.groups);
    setKeepByKey(Object.fromEntries(data.groups.map((group) => [group.key, group.suggested_keep_id])));
    setIncluded(Object.fromEntries(data.groups.map((group) => [group.key, true])));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch(() => {
        if (!cancelled) setError(t("settings.data.duplicates.failed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const selected = useMemo(
    () => groups.filter((group) => included[group.key] !== false),
    [groups, included]
  );
  const selectedExtras = selected.reduce((sum, group) => sum + Math.max(group.count - 1, 0), 0);

  function resolution(group: DuplicateGroup): DuplicateResolution | null {
    const keepId = keepByKey[group.key] ?? group.suggested_keep_id;
    const deleteIds = extras(group, keepId);
    if (!deleteIds.length) return null;
    return { keep_id: keepId, delete_ids: deleteIds };
  }

  async function apply(resolutions: DuplicateResolution[], messageCount: number) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.transactions.resolveDuplicates(resolutions);
      try {
        await runSync();
        setNotice(t("settings.data.duplicates.removed", { count: result.deleted }));
      } catch {
        setNotice(t("settings.data.duplicates.removedSyncLater", { count: result.deleted || messageCount }));
      }
      await load();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("settings.data.duplicates.failed"));
    } finally {
      setBusy(false);
    }
  }

  function removeGroup(group: DuplicateGroup) {
    const item = resolution(group);
    if (!item || busy) return;
    if (!window.confirm(t("settings.data.duplicates.confirmGroup", { count: item.delete_ids.length }))) return;
    void apply([item], item.delete_ids.length);
  }

  function removeSelected() {
    if (busy || selectedExtras === 0) return;
    const resolutions = selected
      .map((group) => resolution(group))
      .filter((item): item is DuplicateResolution => item !== null);
    if (!resolutions.length) return;
    if (!window.confirm(t("settings.data.duplicates.confirmAll", { count: selectedExtras }))) return;
    void apply(resolutions, selectedExtras);
  }

  return (
    <section className="duplicate-review" aria-labelledby="duplicate-review-title">
      <h3 id="duplicate-review-title">{t("settings.data.duplicates.title")}</h3>
      <p className="muted-text">{t("settings.data.duplicates.hint")}</p>
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="muted-text">{notice}</p>}
      {loading ? (
        <p className="muted-text">{t("settings.data.duplicates.searching")}</p>
      ) : groups.length === 0 ? (
        <div>
          <p className="muted-text">{t("settings.data.duplicates.none")}</p>
          <button type="button" className="secondary" onClick={() => void load().catch(() => setError(t("settings.data.duplicates.failed")))} disabled={busy}>
            {t("settings.data.duplicates.refresh")}
          </button>
        </div>
      ) : (
        <>
          <p className="muted-text">
            {t("settings.data.duplicates.summary", { groups: selected.length, extras: selectedExtras })}
          </p>
          <div className="duplicate-actions">
            <button type="button" onClick={removeSelected} disabled={busy || selectedExtras === 0} aria-busy={busy}>
              {busy ? t("common.working") : t("settings.data.duplicates.removeAll")}
            </button>
            <button type="button" className="secondary" onClick={() => void load().catch(() => setError(t("settings.data.duplicates.failed")))} disabled={busy}>
              {t("settings.data.duplicates.refresh")}
            </button>
          </div>
          <div className="duplicate-groups">
            {groups.map((group) => {
              const keepId = keepByKey[group.key] ?? group.suggested_keep_id;
              const sample = group.transaction;
              const title = [
                t(`txType.${sample.type}`),
                formatCurrency(sample.amount, sample.currency_code),
                formatDateTime(sample.date),
              ].join(" · ");
              return (
                <article key={group.key} className="duplicate-group">
                  <header className="duplicate-group-header">
                    <label className="duplicate-include">
                      <input
                        type="checkbox"
                        checked={included[group.key] !== false}
                        onChange={(event) => setIncluded((prev) => ({ ...prev, [group.key]: event.target.checked }))}
                        disabled={busy}
                      />
                      <span>{t("settings.data.duplicates.include")}</span>
                    </label>
                    <h4>{title}</h4>
                    <p className="muted-text">
                      {sample.account_title}
                      {sample.category_name ? ` · ${sample.category_name}` : ""}
                      {sample.recipient ? ` · ${sample.recipient}` : ""}
                      {sample.notes ? ` · ${sample.notes}` : ""}
                    </p>
                  </header>
                  <fieldset className="duplicate-copies" disabled={busy}>
                    <legend>{t("settings.data.duplicates.copies", { count: group.count })}</legend>
                    {group.copies.map((copy) => (
                      <label key={copy.id} className={copy.id === keepId ? "duplicate-copy is-kept" : "duplicate-copy"}>
                        <input
                          type="radio"
                          name={`keep-${group.key}`}
                          checked={copy.id === keepId}
                          onChange={() => setKeepByKey((prev) => ({ ...prev, [group.key]: copy.id }))}
                        />
                        <span>
                          {t("settings.data.duplicates.saved", { time: formatDateTime(copy.created_at) })}
                          {" · "}
                          {copy.id === keepId ? t("settings.data.duplicates.keep") : t("settings.data.duplicates.remove")}
                          {copy.version > 1 ? ` · ${t("settings.data.duplicates.version", { version: copy.version })}` : ""}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <button type="button" className="secondary" onClick={() => removeGroup(group)} disabled={busy}>
                    {t("settings.data.duplicates.removeGroup")}
                  </button>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
