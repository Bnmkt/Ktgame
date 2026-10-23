import { useState } from "react";
import { MediaLibrary } from "./MediaLibrary.jsx";
import { GameImageEditor } from "./GameImageEditor.jsx";
import { useLocale } from "../../locales/LocaleProvider.jsx";
import { MediaArchiveImport } from "./MediaArchiveImport.jsx";

export function AssetsAdmin({ admin }) {
  const { t } = useLocale();
  const [importing, setImporting] = useState(false), [revision, setRevision] = useState(0);
  const [archiveOpen,setArchiveOpen] = useState(false);
  return <><MediaLibrary admin={admin} onImport={() => setImporting(true)} onImportArchive={() => setArchiveOpen(true)} refresh={revision}/>{archiveOpen && <MediaArchiveImport onClose={() => setArchiveOpen(false)} onImported={() => setRevision(value => value + 1)}/>}{importing && <GameImageEditor gameName={t("Médiathèque")} imageLabel={t("Image")} selectableFormat uploadPath="/api/admin/media" onClose={() => setImporting(false)} onApply={() => { setRevision(value => value + 1); setImporting(false); }}/>}</>;
}
