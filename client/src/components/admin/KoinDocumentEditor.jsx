import { useEffect, useState } from "react";
import {
  Download,
  Eye,
  ImagePlus,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { API_URL, getToken } from "../../api.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { defaultDocumentTemplate } from "../../features/koins/document-template.js";
import { Dialog } from "../common/Dialog.jsx";
import { GameImageEditor } from "./GameImageEditor.jsx";
import "./koin-document-editor.css";

export function KoinDocumentEditor({ value, issuer, onChange }) {
  const { t } = useLocale();
  const template = { ...defaultDocumentTemplate, ...value };
  const [editing, setEditing] = useState(false),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const update = (key, value) => onChange({ ...template, [key]: value });
  async function previewPdf() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch(
        `${API_URL}/api/admin/monetization/documents/preview`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
          },
          body: JSON.stringify({ documents: template, billing: issuer }),
        },
      );
      if (!response.ok)
        throw Error((await response.json()).error || "Aperçu indisponible.");
      if (!response.headers.get("content-type")?.startsWith("application/pdf"))
        throw Error("Le serveur n’a pas renvoyé un PDF.");
      setPreview(URL.createObjectURL(await response.blob()));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="billing-editor">
      <div className="billing-editor-fields">
        <h3>{t("Modèle des documents KTGA")}</h3>
        <div className="koin-admin-controls">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={previewPdf}
          >
            <Eye size={17} />
            {t("Prévisualiser le PDF")}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => onChange(structuredClone(defaultDocumentTemplate))}
          >
            <RotateCcw size={17} />
            {t("Valeurs par défaut")}
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="koin-admin-fields">
          <label>
            {t("Nom affiché")}
            <input
              maxLength={80}
              value={template.brandName}
              onChange={(event) => update("brandName", event.target.value)}
            />
          </label>
          <label>
            {t("Couleur d’accent")}
            <input
              type="color"
              value={template.accentColor}
              onChange={(event) => update("accentColor", event.target.value)}
            />
          </label>
        </div>
        <div className="koin-admin-controls">
          <button
            type="button"
            className="secondary"
            onClick={() => setEditing(true)}
          >
            <ImagePlus size={17} />
            {t("Logo PNG / JPEG")}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!template.logoImage}
            onClick={() => update("logoImage", "")}
          >
            <RotateCcw size={17} />
            {t("Logo du site")}
          </button>
        </div>
        <label>
          {t("Texte d’accompagnement")}
          <textarea
            rows={4}
            maxLength={700}
            value={template.note}
            onChange={(event) => update("note", event.target.value)}
          />
        </label>
        <label>
          {t("Pied de page")}
          <textarea
            rows={6}
            maxLength={1200}
            value={template.footer}
            onChange={(event) => update("footer", event.target.value)}
          />
        </label>
        <h4>{t("Liens utiles")}</h4>
        {template.links.map((link, index) => (
          <div className="billing-link-row" key={index}>
            <label>
              {t("Libellé")}
              <input
                maxLength={45}
                value={link.label}
                onChange={(event) =>
                  update(
                    "links",
                    template.links.map((row, i) =>
                      i === index ? { ...row, label: event.target.value } : row,
                    ),
                  )
                }
              />
            </label>
            <label>
              URL
              <input
                maxLength={500}
                type="url"
                value={link.url}
                onChange={(event) =>
                  update(
                    "links",
                    template.links.map((row, i) =>
                      i === index ? { ...row, url: event.target.value } : row,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="secondary"
              title={t("Supprimer le lien")}
              onClick={() =>
                update(
                  "links",
                  template.links.filter((_, i) => i !== index),
                )
              }
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="secondary"
          disabled={template.links.length >= 4}
          onClick={() =>
            update("links", [
              ...template.links,
              {
                label: "Contact",
                url: issuer.contactEmail
                  ? `mailto:${issuer.contactEmail}`
                  : "https://www.ktga.me/conditions",
              },
            ])
          }
        >
          <Plus size={17} />
          {t("Ajouter un lien")}
        </button>
        <h4>{t("Factures officielles Stripe")}</h4>
        <p>
          {t(
            "Les PDF émis restent inchangés. Le logo et les coordonnées des factures officielles sont ceux du compte Stripe.",
          )}
        </p>
        <a
          href="https://dashboard.stripe.com/settings/branding"
          target="_blank"
          rel="noreferrer"
        >
          {t("Identité visuelle Stripe")}
        </a>
      </div>
      <aside className="billing-preview">
        <div
          className="billing-paper"
          style={{ "--document-accent": template.accentColor }}
        >
          <header>
            <img
              src={`${API_URL}${template.logoImage || "/api/branding/site"}`}
              alt=""
            />
            <strong>{template.brandName}</strong>
            <small>{t("Modèle · non émis")}</small>
          </header>
          <h3>{t("Justificatif d’attribution gratuite")}</h3>
          <p>
            {t("Date")} : {new Date().toLocaleDateString()}
          </p>
          <div className="billing-parties">
            <div>
              <b>{t("Émetteur")}</b>
              <p>
                {issuer.legalName || template.brandName}
                <br />
                {issuer.address}
                <br />
                {issuer.contactEmail}
              </p>
            </div>
            <div>
              <b>{t("Bénéficiaire")}</b>
              <p>
                {t("Joueur exemple")}
                <br />
                joueur@example.invalid
              </p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>{t("Désignation")}</th>
                <th>{t("Quantité")}</th>
                <th>{t("Montant")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>25 Koins</td>
                <td>1</td>
                <td>0,00 €</td>
              </tr>
            </tbody>
          </table>
          <p className="billing-total">
            {t("Montant payé")} <b>0,00 €</b>
          </p>
          <p className="billing-disclaimer">
            {t(
              "Attribution gratuite, sans vente. Ce document n’est pas une facture.",
            )}
          </p>
          <p>{template.note}</p>
          <footer>
            <p>{template.footer}</p>
            {template.links.map((link, index) => (
              <span key={index}>{link.label}</span>
            ))}
          </footer>
        </div>
      </aside>
      {editing && (
        <GameImageEditor
          gameName={t("Logo des documents")}
          imageLabel={t("Logo PNG / JPEG")}
          value={template.logoImage}
          fixedFormat={{ width: 512, height: 512 }}
          allowAnimation={false}
          uploadPath="/api/admin/media"
          onClose={() => setEditing(false)}
          onApply={(image) => {
            update("logoImage", image);
            setEditing(false);
          }}
        />
      )}
      {preview && (
        <Dialog
          title={t("Aperçu du document · non émis")}
          className="billing-pdf-dialog"
          onClose={() => setPreview("")}
        >
          <a
            href={preview}
            download="KTGA-modele-document.pdf"
            className="billing-download"
          >
            <Download size={17} />
            {t("Télécharger le modèle")}
          </a>
          <iframe
            className="billing-pdf-frame"
            title={t("Aperçu du document")}
            src={preview}
          />
        </Dialog>
      )}
    </section>
  );
}
