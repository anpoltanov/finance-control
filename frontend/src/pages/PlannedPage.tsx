import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import type { PlannedTransaction } from "../api/client";
import PlannedFormModal from "../components/PlannedFormModal";
import { commitPlanned } from "../data/repository";
import { listCategories } from "../data/queries";
import { db } from "../db";
import { formatCurrency } from "../utils/format";

export default function PlannedPage() {
  const { t } = useTranslation();
  const items = useLiveQuery(() => db.planned.toArray(), []) ?? [];
  const categories = useLiveQuery(() => listCategories(), []) ?? [];
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlannedTransaction | null>(null);

  function categoryName(id: number | null): string {
    if (!id) return t("common.emptyDash");
    return categories.find((c) => c.id === id)?.name || t("common.emptyDash");
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>{t("planned.title")}</h2>
          <p className="muted-text">{t("planned.subtitle")}</p>
        </div>
        <button type="button" onClick={() => { setEditing(null); setModalOpen(true); }}>{t("planned.add")}</button>
      </div>

      <table className="card">
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
          {items.map((p) => (
            <tr key={p.id}>
              <td>{p.next_occurrence_date}</td>
              <td>{t(`txType.${p.type}`)}</td>
              <td>{categoryName(p.category)}</td>
              <td>{formatCurrency(p.amount, p.currency_code)}</td>
              <td>{t(`repeat.${p.repeat_rule}`)}</td>
              <td>{p.autocommit ? t("common.yes") : t("common.no")}</td>
              <td className="planned-actions">
                <button type="button" className="secondary" onClick={() => { setEditing(p); setModalOpen(true); }}>{t("common.edit")}</button>
                <button type="button" onClick={() => commitPlanned(p.id)}>{t("planned.commitNow")}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <PlannedFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => undefined}
        planned={editing}
      />
    </div>
  );
}
