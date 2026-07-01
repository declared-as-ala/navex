"use client"

import { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import { PageHeader, EmptyState, PhysicalBadge, NavexBadge, formatTND } from "@/components/parcel-ui"
import { Search, Trash2 } from "lucide-react"

interface Parcel {
  _id: string
  navexTrackingCode: string
  customer: { name: string; phone: string; city: string }
  codAmount: number
  designation?: string
  navexCreatedAt?: string
  navexStatus: string
  physicalStatus: string
  handedToNavexAt?: string
  updatedAt: string
}

const FILTERS = [
  { value: "", label: "Tous" },
  { value: "remis", label: "Remis à Navex" },
  { value: "transit", label: "En transit" },
  { value: "delivered", label: "Livrés" },
  { value: "returns_expected", label: "Retours attendus" },
  { value: "returns_confirmed", label: "Retours confirmés" },
  { value: "returns_missing", label: "Retours manquants" },
]

function frDate(d?: string) {
  return d ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Tunis", dateStyle: "short" }).format(new Date(d)) : "—"
}

export default function ColisPage() {
  const [parcels, setParcels] = useState<Parcel[]>([])
  const [total, setTotal] = useState(0)
  const [isEmpty, setIsEmpty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [view, setView] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    setLoading(true)
    setSelected(new Set())
    const params = new URLSearchParams()
    if (q) params.set("q", q)
    if (view) params.set("view", view)
    params.set("limit", "500")
    fetch(`/api/parcels?${params}`)
      .then((r) => r.json())
      .then((j) => { setParcels(j.data.parcels); setTotal(j.data.total); setIsEmpty(j.data.isEmpty && !q && !view) })
      .finally(() => setLoading(false))
  }, [q, view])
  useEffect(() => { load() }, [load])

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    setSelected((s) => s.size === parcels.length ? new Set() : new Set(parcels.map((p) => p._id)))
  }

  async function remove(p: Parcel) {
    if (!window.confirm(`Supprimer le colis ${p.navexTrackingCode} ?`)) return
    const j = await (await fetch(`/api/parcels/${p._id}`, { method: "DELETE" })).json()
    if (j.success) { toast.success("Colis supprimé"); setParcels((list) => list.filter((x) => x._id !== p._id)); setTotal((t) => t - 1) }
    else toast.error(j.error || "Suppression impossible")
  }

  async function removeSelected() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!window.confirm(`Supprimer ${ids.length} colis sélectionné(s) ?`)) return
    const j = await (await fetch("/api/parcels/bulk-delete", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }),
    })).json()
    if (j.success) { toast.success(`${j.deleted} colis supprimés`); load() }
    else toast.error(j.error || "Suppression impossible")
  }

  return (
    <div>
      <PageHeader
        title="Colis"
        subtitle={`${total} colis`}
        action={selected.size > 0 ? (
          <button onClick={removeSelected} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">
            <Trash2 className="h-4 w-4" />Supprimer ({selected.size})
          </button>
        ) : undefined}
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher code, client, téléphone…"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-sm" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.value} onClick={() => setView(f.value)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${view === f.value ? "bg-blue-700 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isEmpty ? (
        <EmptyState title="Aucun colis scanné." hint="Scannez les codes-barres Navex dans le Scanner pour enregistrer les colis." />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5 w-8">
                  <input type="checkbox" className="h-4 w-4 rounded accent-blue-700"
                    checked={parcels.length > 0 && selected.size === parcels.length} onChange={toggleAll} />
                </th>
                <th className="px-3 py-2.5 font-medium">Code Navex</th>
                <th className="px-3 py-2.5 font-medium">Client</th>
                <th className="px-3 py-2.5 font-medium">Téléphone</th>
                <th className="px-3 py-2.5 font-medium">Ville</th>
                <th className="px-3 py-2.5 font-medium text-right">COD</th>
                <th className="px-3 py-2.5 font-medium">Ajout Navex</th>
                <th className="px-3 py-2.5 font-medium">Désignation</th>
                <th className="px-3 py-2.5 font-medium">Statut Navex</th>
                <th className="px-3 py-2.5 font-medium">Physique</th>
                <th className="px-3 py-2.5 font-medium">Remise</th>
                <th className="px-3 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={12} className="px-3 py-8 text-center text-slate-400">Chargement…</td></tr>
              ) : parcels.length === 0 ? (
                <tr><td colSpan={12} className="px-3 py-8 text-center text-slate-400">Aucun colis</td></tr>
              ) : parcels.map((p) => (
                <tr key={p._id} className={`hover:bg-slate-50 ${selected.has(p._id) ? "bg-blue-50/50" : ""}`}>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" className="h-4 w-4 rounded accent-blue-700" checked={selected.has(p._id)} onChange={() => toggle(p._id)} />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{p.navexTrackingCode}</td>
                  <td className="px-3 py-2.5 text-slate-700">{p.customer?.name || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-500 font-mono text-xs">{p.customer?.phone || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-600">{p.customer?.city || "—"}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-800 tabular-nums">{formatTND(p.codAmount)}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{frDate(p.navexCreatedAt)}</td>
                  <td className="px-3 py-2.5 text-slate-600 max-w-[160px] truncate">{p.designation || "—"}</td>
                  <td className="px-3 py-2.5"><NavexBadge status={p.navexStatus} /></td>
                  <td className="px-3 py-2.5"><PhysicalBadge status={p.physicalStatus} /></td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{frDate(p.handedToNavexAt)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => remove(p)} title="Supprimer" className="text-slate-300 hover:text-red-600 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
