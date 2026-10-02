import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import type { PlannedTransaction } from "../api/client";
import PlannedFormModal from "../components/PlannedFormModal";
import PlannedReviewModal from "../components/PlannedReviewModal";
import { commitPlanned } from "../data/repository";
import { listCategories } from "../data/queries";
import { db } from "../db";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { formatCurrency } from "../utils/format";

export default function PlannedPage() {
  const { t } = useTranslation();
  const items = useLiveQuery(() => db.planned.toArray(), []) ?? [];
  const categories = useLiveQuery(() => listCategories(), []) ?? [];
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlannedTransaction | null>(null);
  const [reviewing, setReviewing] = useState<PlannedTransaction | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const { pending, error, run } = useAsyncAction();

  function categoryName(id: number | null): string {
    if (!id) return t("common.emptyDash");
    return categories.find((c) => c.id === id)?.name || t("common.emptyDash");
  }

  function commitNow(planned: PlannedTransaction) {
    setPendingId(planned.id);
    void run(async () => {
      try {
        await commitPlanned(planned.id);
      } finally {
        setPendingId(null);
      }
    });
  }

  function renderActions(planned: PlannedTransaction) {
    const busy = pending && pendingId === planned.id;
    return (
      <div className="planned-actions">
        <button
          type="button"
          className="secondary"
          disabled={pending}
          onClick={() => {
            setEditing(planned);
            setModalOpen(true);
          }}
        >
          {t("common.edit")}
        </button>
        <button type="button" disabled={pending} aria-busy={busy} onClick={() => commitNow(planned)}>
          {busy ? t("planned.committing") : t("planned.commitNow")}
        </button>
        <button type="button" className="secondary" disabled={pending} onClick={() => setReviewing(planned)}>
          {t("planned.reviewCommit")}
        </button>
      </div>
    );
  }

  return (
    <div className="planned-page">
      <div className="page-header">
        <div>
          <h2>{t("planned.title")}</h2>
          <p className="muted-text">{t("planned.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          {t("planned.add")}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}

      <table className="card planned-table">
        <thead>
          <tr>
            <th>{t("common.date")}</th>
            <th>{t("common.type")}</th>
            <th>{t("common.category")}</th>
            <th>{t("common.amount")}</th>
            <th>{t("planned.repeat")}</th>
            <th>{t("planned.autocommit")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((planned) => (
            <tr key={planned.id}>
              <td>{planned.next_occurrence_date}</td>
              <td>{t(`txType.${planned.type}`)}</td>
              <td>{categoryName(planned.category)}</td>
              <td>{formatCurrency(planned.amount, planned.currency_code)}</td>
              <td>{t(`repeat.${planned.repeat_rule}`)}</td>
              <td>{planned.autocommit ? t("common.yes") : t("common.no")}</td>
              <td>{renderActions(planned)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="planned-cards">
        {items.map((planned) => (
          <li key={planned.id} className="card planned-card">
            <div className="planned-card-top">
              <span>{planned.next_occurrence_date}</span>
              <span>{t(`txType.${planned.type}`)}</span>
            </div>
            <div>{categoryName(planned.category)}</div>
            <strong>{formatCurrency(planned.amount, planned.currency_code)}</strong>
            <div className="muted-text">
              {t("planned.repeat")}: {t(`repeat.${planned.repeat_rule}`)}
              {" · "}
              {t("planned.autocommit")}: {planned.autocommit ? t("common.yes") : t("common.no")}
            </div>
            {renderActions(planned)}
          </li>
        ))}
      </ul>

      <PlannedFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => undefined}
        planned={editing}
      />
      <PlannedReviewModal open={Boolean(reviewing)} planned={reviewing} onClose={() => setReviewing(null)} />
    </div>
  );
}
