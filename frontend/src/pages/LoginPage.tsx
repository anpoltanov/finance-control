import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";

export default function LoginPage() {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.login(username, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.failed"));
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "4rem auto", padding: "1rem" }}>
      <h1>{t("app.title")}</h1>
      <form onSubmit={submit} className="card">
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
        <div className="form-group">
          <label>{t("login.username")}</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>{t("login.password")}</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button type="submit" style={{ width: "100%" }}>
          {t("login.signIn")}
        </button>
      </form>
    </div>
  );
}
