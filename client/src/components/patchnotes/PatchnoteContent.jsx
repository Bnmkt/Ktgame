import { useEffect, useMemo, useRef, useState } from "react";
import { Bug, Dice5, Gauge, LockKeyhole, PackagePlus, Settings2, Wrench } from "lucide-react";
import { API_URL } from "../../api.js";
import { MarkdownContent } from "./MarkdownContent.jsx";

export const patchnoteCategories = {
  feature: { label: "Fonctionnalité", Icon: PackagePlus },
  game: { label: "Jeu", Icon: Dice5 },
  tool: { label: "Outil", Icon: Settings2 },
  fix: { label: "Correctif", Icon: Bug },
  security: { label: "Sécurité", Icon: LockKeyhole },
  balance: { label: "Équilibrage", Icon: Gauge },
  other: { label: "Autre", Icon: Wrench }
};

const anchor = (block) => `section-${block.id}`;
const imageUrl = (attachmentId) => `${API_URL}/api/patchnotes/images/${encodeURIComponent(attachmentId)}`;

export function PatchnoteContent({ note, compact = false }) {
  const sections = useMemo(() => note.blocks.map((block, index) => {
    if (block.type !== "section") return null;
    let category = "other";
    for (let next = index + 1; next < note.blocks.length && note.blocks[next].type !== "section"; next += 1) {
      if (note.blocks[next].type === "change") { category = note.blocks[next].category; break; }
    }
    return { block, category };
  }).filter(Boolean), [note.blocks]);
  const [activeSectionId, setActiveSectionId] = useState(() => sections[0] ? anchor(sections[0].block) : "");
  const tocRef = useRef(null);

  useEffect(() => {
    const firstSectionId = sections[0] ? anchor(sections[0].block) : "";
    setActiveSectionId(firstSectionId);
    if (compact || !sections.length) return undefined;

    const sectionElements = sections
      .map(({ block }) => document.getElementById(anchor(block)))
      .filter(Boolean);
    let animationFrame = null;

    const updateActiveSection = () => {
      animationFrame = null;
      const activationLine = Math.max(96, window.innerHeight * 0.22);
      let currentSection = sectionElements[0];
      sectionElements.forEach((section) => {
        if (section.getBoundingClientRect().top <= activationLine) currentSection = section;
      });

      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
        currentSection = sectionElements.at(-1);
      }
      if (currentSection) setActiveSectionId(currentSection.id);
    };

    const scheduleUpdate = () => {
      if (animationFrame !== null) return;
      animationFrame = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, [compact, note.id, sections]);

  useEffect(() => {
    const toc = tocRef.current;
    if (!toc || !activeSectionId) return;
    const activeItem = [...toc.querySelectorAll("[data-section-id]")]
      .find((item) => item.dataset.sectionId === activeSectionId);
    if (!activeItem) return;

    if (toc.scrollWidth > toc.clientWidth) {
      toc.scrollTo({
        behavior: "smooth",
        left: activeItem.offsetLeft - (toc.clientWidth - activeItem.clientWidth) / 2,
      });
    }
    if (toc.scrollHeight > toc.clientHeight) {
      const itemBottom = activeItem.offsetTop + activeItem.offsetHeight;
      if (activeItem.offsetTop < toc.scrollTop || itemBottom > toc.scrollTop + toc.clientHeight) {
        toc.scrollTo({ behavior: "smooth", top: activeItem.offsetTop - toc.clientHeight / 2 });
      }
    }
  }, [activeSectionId]);

  return <div className={`patchnote-document ${compact ? "compact" : ""}`}>
    {!!sections.length && <nav className="patchnote-toc" aria-label="Table des matières" ref={tocRef}><strong>Dans cette version</strong><ol>{sections.map(({ block, category }) => {
      const sectionId = anchor(block);
      const isActive = activeSectionId === sectionId;
      return <li key={block.id} className={`level-${block.metadata?.level ?? 2} toc-${category}${isActive ? " active" : ""}`} data-section-id={sectionId}><a aria-current={isActive ? "location" : undefined} href={`#${sectionId}`} onClick={() => setActiveSectionId(sectionId)}><i aria-hidden="true" />{block.title}</a></li>;
    })}</ol></nav>}
    <div className="patchnote-blocks">{note.blocks.map((block) => {
      if (block.type === "section") { const Heading = block.metadata?.level === 3 ? "h3" : "h2"; return <Heading id={anchor(block)} key={block.id}>{block.title}</Heading>; }
      if (block.type === "paragraph") return <MarkdownContent className="patchnote-paragraph" key={block.id}>{block.content}</MarkdownContent>;
      if (block.type === "change") { const category = patchnoteCategories[block.category] ?? patchnoteCategories.other; return <article className={`patchnote-change change-${block.category}`} key={block.id}><category.Icon size={19} /><div><span>{category.label}</span>{block.title && <h3>{block.title}</h3>}<MarkdownContent>{block.content}</MarkdownContent></div></article>; }
      if (block.type === "list") return <ul className="patchnote-list" key={block.id}>{block.content.split("\n").map((item) => item.trim()).filter(Boolean).map((item, index) => <li key={index}>{item}</li>)}</ul>;
      if (block.type === "quote") return <figure className="patchnote-quote" key={block.id}><blockquote><MarkdownContent>{block.content}</MarkdownContent></blockquote>{block.metadata?.attribution && <figcaption>{block.metadata.attribution}</figcaption>}</figure>;
      if (block.type === "image") return <figure className="patchnote-image" key={block.id}><img src={imageUrl(block.metadata?.attachmentId)} alt={block.metadata?.alt || "Illustration de la mise à jour"} loading="lazy" />{block.metadata?.caption && <figcaption>{block.metadata.caption}</figcaption>}</figure>;
      return null;
    })}</div>
  </div>;
}
