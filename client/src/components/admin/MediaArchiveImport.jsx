import { useEffect, useRef, useState } from "react";
import { Check, FileArchive, ImageOff, Square, Upload, X } from "lucide-react";
import { api } from "../../api.js";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { readImageArchive } from "../../features/media/read-image-archive.js";
import { Dialog } from "../common/Dialog.jsx";
import { Pagination } from "../feedback/Feedback.jsx";
import { usePagination } from "../common/usePagination.js";
import "./media-archive-import.css";

export function MediaArchiveImport({ onClose, onImported }) {
  const { t } = useLocale();
  const [rows,setRows] = useState([]), [error,setError] = useState(""), [archive,setArchive] = useState(""), [maxMb,setMaxMb] = useState(null);
  const [reading,setReading] = useState(false), [sending,setSending] = useState(false), [skipped,setSkipped] = useState(0), [progress,setProgress] = useState(null);
  const input = useRef(null), controller = useRef(null), urls = useRef([]), alive = useRef(true);
  const pages = usePagination(rows,archive);
  const selected = rows.filter(row => row.selected && !row.problem && row.status !== "done");
  const available = rows.filter(row => !row.problem && row.status !== "done");
  const busy = reading || sending;
  const release = () => { urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current=[]; };
  useEffect(() => {
    alive.current=true;
    api("/api/admin/media/limits",{background:true}).then(result => { if(alive.current)setMaxMb(result.maxMb); }).catch(failure => { if(alive.current)setError(failure.message); });
    return () => { alive.current=false; controller.current?.abort(); release(); };
  },[]);
  async function read(file) {
    if(!file || busy || !maxMb)return;
    setReading(true);setError("");setProgress(null);
    const work = new AbortController();controller.current=work;
    try {
      const result = await readImageArchive(file,maxMb,work.signal);
      if(!alive.current)return;
      release();
      const next=result.rows.map(row => { const url=row.blob ? URL.createObjectURL(row.blob) : "";if(url)urls.current.push(url);return{...row,url,selected:!row.problem,status:"ready"}; });
      setRows(next);setArchive(file.name);setSkipped(result.skipped);
    } catch(failure) { if(alive.current && failure.name!=="AbortError")setError(failure.message); }
    finally { if(alive.current)setReading(false); }
  }
  function change(id,patch) { setRows(current => current.map(row => row.id===id ? {...row,...patch} : row)); }
  async function upload() {
    if(busy || !selected.length)return;
    const work=new AbortController();controller.current=work;
    setSending(true);setError("");let completed=0,uploaded=0,failed=0;
    setProgress({completed,total:selected.length,uploaded,failed});
    for(const row of selected) {
      if(work.signal.aborted)break;
      change(row.id,{status:"sending",uploadError:""});
      try {
        await api(`/api/admin/media?name=${encodeURIComponent(row.name.trim() || row.filename)}`,{method:"POST",headers:{"Content-Type":row.mime},body:row.blob,signal:work.signal,background:true,deduplicate:false});
        uploaded++;if(alive.current)change(row.id,{status:"done",selected:false});
      } catch(failure) {
        if(alive.current)change(row.id,{status:"ready",uploadError:failure.name==="AbortError" ? "" : failure.message});
        if(work.signal.aborted)break;
        failed++;
      }
      completed++;if(alive.current)setProgress({completed,total:selected.length,uploaded,failed});
    }
    if(uploaded)onImported();
    if(alive.current){setSending(false);setProgress({completed,total:selected.length,uploaded,failed});}
  }
  return <Dialog title={t("Importer des images depuis un ZIP")} className="media-archive-dialog" onClose={onClose} dismissible={!busy}>
    <input ref={input} type="file" accept=".zip,application/zip,application/x-zip-compressed" hidden onChange={event => { read(event.target.files?.[0]);event.target.value=""; }}/>
    <header className="media-archive-toolbar"><button type="button" className="secondary" disabled={busy || !maxMb} onClick={() => input.current.click()}><FileArchive size={18}/>{t(archive ? "Changer d’archive" : "Choisir une archive ZIP")}</button><span>{archive || t("ZIP · 50 Mo maximum")}</span></header>
    {maxMb && <p className="media-archive-limits">{t("PNG, JPEG, WebP ou GIF · {value0} Mo par image",{value0:maxMb})} · {t("200 images et 100 Mo décompressés maximum")}</p>}
    {error && <p className="error" role="alert">{t(error)}</p>}
    {reading && <p role="status">{t("Lecture et préparation des aperçus…")}</p>}
    {rows.length>0 && <>
      <div className="media-archive-selection"><label><input type="checkbox" disabled={busy || !available.length} checked={selected.length>0 && selected.length===available.length} onChange={() => setRows(current => current.map(row => row.problem || row.status==="done" ? row : {...row,selected:selected.length!==available.length}))}/>{t("Tout sélectionner")}</label><strong>{t("{value0} image(s) sélectionnée(s)",{value0:selected.length})}</strong>{skipped>0 && <span>{t("{value0} autre(s) fichier(s) ignoré(s)",{value0:skipped})}</span>}</div>
      <div className="media-archive-grid">{pages.rows.map(row => <article key={row.id} className={`media-archive-item${row.selected ? " media-archive-selected" : ""}`}>
        <label className="media-archive-check"><input type="checkbox" checked={row.selected} disabled={busy || Boolean(row.problem) || row.status==="done"} aria-label={t("Sélectionner {value0}",{value0:row.filename})} onChange={event => change(row.id,{selected:event.target.checked})}/>{row.status==="done" ? <Check size={16}/> : null}</label>
        <span className="media-checker media-archive-image">{row.url ? <img src={row.url} alt={row.filename} loading="lazy" decoding="async"/> : <ImageOff size={28}/>}</span>
        <label>{t("Nom")}<input aria-label={t("Nom de {value0}",{value0:row.filename})} maxLength={120} disabled={busy || Boolean(row.problem) || row.status==="done"} value={row.name} onChange={event => change(row.id,{name:event.target.value})}/></label>
        <small title={row.path}>{row.path}</small><span>{(row.bytes/1048576).toFixed(2)} {t("Mo")}</span>
        {(row.problem || row.uploadError) && <small className="error" role="alert">{t(row.problem || row.uploadError)}</small>}
        {row.status==="done" && <small className="media-archive-success">{t("Disponible dans la médiathèque")}</small>}
      </article>)}</div>
      <Pagination {...pages}/>
    </>}
    {progress && <div className="media-archive-progress" role="status"><progress max={progress.total} value={progress.completed}/><span>{progress.completed} / {progress.total} · {t("{value0} importée(s)",{value0:progress.uploaded})}{progress.failed>0 ? ` · ${t("{value0} erreur(s)",{value0:progress.failed})}` : ""}</span></div>}
    <footer className="media-archive-actions">{busy ? <button type="button" className="secondary" onClick={() => controller.current?.abort()}><Square size={17}/>{t("Arrêter")}</button> : <button type="button" className="secondary" onClick={onClose}><X size={17}/>{t(progress?.uploaded ? "Terminer" : "Annuler")}</button>}<button type="button" disabled={busy || !selected.length} onClick={upload}><Upload size={17}/>{t("Importer {value0} image(s)",{value0:selected.length})}</button></footer>
  </Dialog>;
}
