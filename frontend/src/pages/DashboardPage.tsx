import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import AccountPlate from "../components/AccountPlate";
import DateRangeNav from "../components/DateRangeNav";
import DashboardWidgets from "../components/dashboard/DashboardWidgets";
import { loadDashboard } from "../data/dashboard";
import { useDateRangePeriod } from "../hooks/useDateRangePeriod";

export default function DashboardPage() {
  const { t } = useTranslation();
  const range = useDateRangePeriod("month");
  const navigate = useNavigate();
  const data = useLiveQuery(
    () => loadDashboard(range.from || undefined, range.to || undefined),
    [range.from, range.to]
  );

  return (
    <div>
      <div className="page-header">
        <h2>{t("nav.dashboard")}</h2>
        <DateRangeNav range={range} />
      </div>

      {!data ? (
        <p>{t("common.loading")}</p>
      ) : (
        <>
          <div className="account-plate-grid">
            {data.plates.map((account) => (
              <AccountPlate
                key={account.id}
                account={account}
                onClick={() => navigate(`/accounts/${account.id}`)}
              />
            ))}
          </div>
          {data.plates.length === 0 && <p className="muted-text">{t("accounts.empty")}</p>}
          <DashboardWidgets data={data} />
        </>
      )}
    </div>
  );
}
