"use client";
import { useMemo, useState } from "react";
import {
  Archive, ExternalLink, FolderKanban, Heart, Library, Link2, Pencil, Plus,
  Search, Tag, Trash2, X
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { SavedLink } from "@/lib/types";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { cn, formatDateLabel } from "@/lib/utils";

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export default function KnowledgePage() {
  const {
    ready, savedLinks, categories, projects, createSavedLink, updateSavedLink,
    deleteSavedLink, pushToast
  } = useStore();
  const [q, setQ] = useState("");
  const [favorites, setFavorites] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [category, setCategory] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SavedLink | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return savedLinks
      .filter((l) => (showArchived ? l.archived : !l.archived))
      .filter((l) => (favorites ? l.favorite : true))
      .filter((l) => (category === "all" ? true : l.category_id === category))
      .filter((l) => !s || l.title.toLowerCase().includes(s) || l.url.toLowerCase().includes(s) || l.description.toLowerCase().includes(s) || l.tags.some((t) => t.includes(s)))
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return a.created_at < b.created_at ? 1 : -1;
      });
  }, [savedLinks, q, favorites, showArchived, category]);

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (link: SavedLink) => { setEditing(link); setFormOpen(true); };

  if (!ready) return <div className="skeleton h-64 w-full" />;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Library}
        title="Knowledge Library"
        subtitle={`${savedLinks.filter((l) => !l.archived).length} saved references · ${savedLinks.filter((l) => l.favorite).length} favourites`}
        actions={<button onClick={openCreate} className="btn-primary flex items-center gap-1.5"><Plus size={15} /> Save link</button>}
      />

      <div className="card flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[180px] flex-1 sm:max-w-sm">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search links, titles, tags..." className="input pl-8" aria-label="Search knowledge library" />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input max-w-[160px]" aria-label="Filter by category">
          <option value="all">All sections</option>
          {categories.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={() => setFavorites((v) => !v)} className={cn("chip", favorites && "chip-active")}><Heart size={12} /> Favourites</button>
        <button onClick={() => setShowArchived((v) => !v)} className={cn("chip", showArchived && "chip-active")}><Archive size={12} /> Archived</button>
        <span className="ml-auto text-[11px] text-muted-foreground">{filtered.length} link{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Library} title="No links found" body="Save articles, references and resources so they are always one search away." />
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((link) => {
            const cat = categories.find((c) => c.id === link.category_id);
            const project = projects.find((p) => p.id === link.project_id);
            return (
              <div key={link.id} className="card card-hover flex h-full flex-col p-3.5">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-300"><Link2 size={15} /></span>
                  <div className="min-w-0 flex-1">
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-sm font-semibold hover:text-indigo-300">{link.title}</a>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{domainOf(link.url)}</p>
                  </div>
                  <button onClick={() => updateSavedLink(link.id, { favorite: !link.favorite })} className={cn("shrink-0 rounded p-0.5", link.favorite ? "text-rose-400" : "text-muted-foreground hover:text-rose-400")} aria-label="Toggle favourite"><Heart size={13} className={link.favorite ? "fill-rose-400" : ""} /></button>
                </div>
                {link.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{link.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                  {cat && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: cat.color }} />{cat.name}</span>}
                  {project && <span className="inline-flex items-center gap-1"><FolderKanban size={10} />{project.name}</span>}
                  {link.tags.slice(0, 3).map((t) => <span key={t} className="inline-flex items-center gap-0.5"><Tag size={9} />{t}</span>)}
                </div>
                <div className="mt-auto flex items-center gap-1 pt-3 text-[10px] text-muted-foreground">
                  <span>{formatDateLabel(link.created_at)}</span>
                  <div className="ml-auto flex items-center gap-0.5">
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="btn-icon !p-1.5" aria-label="Open link"><ExternalLink size={12} /></a>
                    <button onClick={() => openEdit(link)} className="btn-icon !p-1.5" aria-label="Edit link"><Pencil size={12} /></button>
                    <button onClick={() => updateSavedLink(link.id, { archived: !link.archived })} className="btn-icon !p-1.5" aria-label="Archive link"><Archive size={12} /></button>
                    <button onClick={() => { if (confirm(`Remove "${link.title}" from the library?`)) deleteSavedLink(link.id); }} className="btn-icon !p-1.5 hover:text-red-400" aria-label="Delete link"><Trash2 size={12} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <LinkForm
          key={editing?.id || "new"}
          link={editing}
          onClose={() => setFormOpen(false)}
          onSave={(values) => {
            try {
              if (editing) {
                updateSavedLink(editing.id, values);
                pushToast({ kind: "success", title: "Link updated" });
              } else {
                createSavedLink(values);
                pushToast({ kind: "success", title: "Link saved" });
              }
              setFormOpen(false);
            } catch (e) {
              pushToast({ kind: "error", title: "Could not save link", body: e instanceof Error ? e.message : "Check the URL and try again." });
            }
          }}
        />
      )}
    </div>
  );
}

function LinkForm({
  link, onClose, onSave
}: {
  link: SavedLink | null;
  onClose: () => void;
  onSave: (values: { url: string; title: string; description: string; category_id: string | null; project_id: string | null; tags: string[] }) => void;
}) {
  const { categories, projects } = useStore();
  const [url, setUrl] = useState(link?.url || "");
  const [title, setTitle] = useState(link?.title || "");
  const [description, setDescription] = useState(link?.description || "");
  const [categoryId, setCategoryId] = useState(link?.category_id || "");
  const [projectId, setProjectId] = useState(link?.project_id || "");
  const [tags, setTags] = useState(link?.tags.join(", ") || "");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[8vh] backdrop-blur-sm" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <form
        className="card scale-in w-full max-w-lg p-5"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            url,
            title,
            description,
            category_id: categoryId || null,
            project_id: projectId || null,
            tags: tags.split(",").map((t) => t.trim().replace(/^#/, "").toLowerCase()).filter(Boolean).slice(0, 20)
          });
        }}
      >
        <div className="flex items-start justify-between">
          <div><h2 className="text-base font-semibold">{link ? "Edit link" : "Save a link"}</h2><p className="text-[11px] text-muted-foreground">Keep useful references attached to your work.</p></div>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Close"><X size={16} /></button>
        </div>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/article" className="input mt-4" autoFocus required />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="input mt-2" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why is this useful?" rows={3} className="input mt-2" />
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input" aria-label="Category">
            <option value="">No section</option>
            {categories.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input" aria-label="Project">
            <option value="">No project</option>
            {projects.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tags, comma separated" className="input mt-2" />
        <div className="mt-4 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary">{link ? "Save changes" : "Save link"}</button></div>
      </form>
    </div>
  );
}
