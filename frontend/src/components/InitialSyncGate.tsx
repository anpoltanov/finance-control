import { useTranslation } from "react-i18next";

interface InitialSyncGateProps {
  failed: boolean;
  onRetry: () => void;
}

export default function InitialSyncGate({ failed, onRetry }: InitialSyncGateProps) {
  const { t } = useTranslation();

  return (
    <div
      className="sync-gate"
      role="alertdialog"
      aria-modal="true"
      aria-busy={!failed}
      aria-labelledby="sync-gate-title"
    >
      <div className="sync-gate-card">
        {!failed && <div className="sync-spinner" aria-hidden="true" />}
        <h2 id="sync-gate-title">{failed ? t("sync.failed") : t("sync.initial")}</h2>
        {failed && (
          <button type="button" onClick={onRetry}>
            {t("sync.retry")}
          </button>
        )}
      </div>
    </div>
  );
}
