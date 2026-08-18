import { useState } from "react";

import { useTranslation } from "react-i18next";

import { importWalletAppCsv, type ImportPreview } from "../api/client";

import { formatCurrency, formatDateTime } from "../utils/format";



type Tab = "paired" | "to_nowhere" | "from_nowhere" | "ambiguous" | "regular";



export default function ImportPage({ embedded = false }: { embedded?: boolean }) {

  const { t } = useTranslation();

  const [file, setFile] = useState<File | null>(null);

  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const [tab, setTab] = useState<Tab>("paired");

  const [resolutions, setResolutions] = useState<Record<string, string>>({});

  const [result, setResult] = useState<string>("");

  const [loading, setLoading] = useState(false);



  const tabs: Tab[] = ["paired", "to_nowhere", "from_nowhere", "ambiguous", "regular"];



  async function runPreview() {

    if (!file) return;

    setLoading(true);

    try {

      const data = await importWalletAppCsv(file, true, resolutions);

      setPreview(data as ImportPreview);

    } catch (err) {

      setResult(err instanceof Error ? err.message : t("import.previewFailed"));

    } finally {

      setLoading(false);

    }

  }



  async function commit() {

    if (!file) return;

    setLoading(true);

    try {

      const data = await importWalletAppCsv(file, false, resolutions);

      const { created, skipped } = data as { created: number; skipped: number };

      setResult(t("import.result", { created, skipped }));

      setPreview(null);

    } catch (err) {

      setResult(err instanceof Error ? err.message : t("import.importFailed"));

    } finally {

      setLoading(false);

    }

  }



  function tabCount(current: Tab): number {

    if (!preview) return 0;

    if (current === "paired") return preview.paired_transfers.length;

    if (current === "regular") return preview.regular_count;

    return (preview[current as keyof ImportPreview] as unknown[])?.length ?? 0;

  }



  return (

    <div>

      {!embedded && <h2>{t("import.title")}</h2>}

      <div className="card">

        <p>{t("import.hint")}</p>

        <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />

        <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>

          <button onClick={runPreview} disabled={!file || loading}>{t("import.preview")}</button>

          <button onClick={commit} disabled={!file || !preview || loading}>{t("import.confirm")}</button>

        </div>

        {result && <p>{result}</p>}

      </div>



      {preview && (

        <div className="card">

          <p>

            {t("import.newSummary", {

              accounts: preview.new_accounts.length,

              categories: preview.new_categories.length,

              tags: preview.new_tags.length,

              regular: preview.regular_count,

            })}

          </p>

          <div className="tabs">

            {tabs.map((current) => (

              <button key={current} className={tab === current ? "active" : ""} onClick={() => setTab(current)}>

                {t(`import.tabs.${current}`)} ({tabCount(current)})

              </button>

            ))}

          </div>



          {tab === "paired" && (

            <table>

              <thead>

                <tr>

                  <th>{t("import.table.from")}</th>

                  <th>{t("import.table.to")}</th>

                  <th>{t("common.amount")}</th>

                  <th>{t("common.date")}</th>

                  <th>{t("import.table.confidence")}</th>

                </tr>

              </thead>

              <tbody>

                {preview.paired_transfers.map((p, i) => (

                  <tr key={i}>

                    <td>{p.from_account}</td>

                    <td>{p.to_account}</td>

                    <td>{formatCurrency(p.amount, p.currency)}</td>

                    <td>{formatDateTime(p.date)}</td>

                    <td>{p.confidence}</td>

                  </tr>

                ))}

              </tbody>

            </table>

          )}



          {tab === "to_nowhere" && (

            <table>

              <thead><tr><th>{t("common.account")}</th><th>{t("common.amount")}</th><th>{t("common.date")}</th></tr></thead>

              <tbody>

                {preview.to_nowhere.map((r) => (

                  <tr key={r.index}><td>{r.account}</td><td>{formatCurrency(r.amount)}</td><td>{formatDateTime(r.date)}</td></tr>

                ))}

              </tbody>

            </table>

          )}



          {tab === "from_nowhere" && (

            <table>

              <thead><tr><th>{t("common.account")}</th><th>{t("common.amount")}</th><th>{t("common.date")}</th></tr></thead>

              <tbody>

                {preview.from_nowhere.map((r) => (

                  <tr key={r.index}><td>{r.account}</td><td>{formatCurrency(r.amount)}</td><td>{formatDateTime(r.date)}</td></tr>

                ))}

              </tbody>

            </table>

          )}



          {tab === "ambiguous" && (

            <div>

              {preview.ambiguous.map((a) => (

                <div key={a.outflow_index} className="card">

                  <p>{t("import.ambiguousHint", { index: a.outflow_index })}</p>

                  <select

                    value={resolutions[String(a.outflow_index)] || ""}

                    onChange={(e) => setResolutions({ ...resolutions, [String(a.outflow_index)]: e.target.value })}

                  >

                    <option value="">{t("import.autoSkip")}</option>

                    <option value="to_nowhere">{t("transfer.toNowhere")}</option>

                    {a.candidates.map((c) => (

                      <option key={c} value={String(c)}>{t("import.pairWith", { index: c })}</option>

                    ))}

                  </select>

                </div>

              ))}

            </div>

          )}



          {tab === "regular" && <p>{t("import.regularHint", { count: preview.regular_count })}</p>}

        </div>

      )}

    </div>

  );

}


