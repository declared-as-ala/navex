"use client"

import { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import { PageHeader, EmptyState, StatusBadge, formatTND } from "@/components/parcel-ui"
import { SkeletonRows } from "@/components/skeletons"
import { Button } from "@/components/ui/button"
import { Search, RefreshCw } from "lucide-react"

interface Parcel {
  _id: string
  navexTrackingCode: string
  codAmount: number
  designation?: string
  navexCreatedAt?: string
  handedToNavexAt?: string
  status: string
  paidAt?: string
  returnAt?: string
  updatedAt: string
}

const RANGES = [
  { value: "", label: "Tout" },
  { value: "today", label: "Aujourd'hui" },
  { value: "yesterday", label: "Hier" },
  { value: "7d", label: "7 j" },
  { value: "30d", label: "30 j" },
  { value: "custom", label: "Perso" },
]
const BASES = [
  { value: "remise", label: "Date remise à Navex" },
  { value: "paiement", label: "Date paiement" },
  { value: "retour", label: "Date retour" },
]
const STATUSES = [
  { value: "", label: "Tous" },
  { value: "en_cours", label: "En cours" },
  { value: "paye", label: "Payé" },
  { value: "retour", label: "Retour" },
  { value: "a_verifier", label: "À vérifier" },
]

function frDate(d?: string, withTime = false) {
  if (!d) return "—"
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Tunis", dateStyle: "short", ...(withTime ? { timeStyle: "short" } : {}) }).format(new Date(d))
}

export default function ColisPage() {
  const [parcels, setParcels] = useState<Parcel[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<Record<string, number>>({})
  const [isEmpty, setIsEmpty] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [q, setQ] = useState("")
  const [view, setView] = useState("")
  const [range, setRange] = useState("")
  const [basis, setBasis] = useState("remise")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (q) p.set("q", q)
    if (view) p.set("view", view)
    if (range) { p.set("range", range); p.set("dateBasis", basis) }
    if (range === "custom") { if (from) p.set("from", from); if (to) p.set("to", to) }
    p.set("limit", "1000")
    fetch(`/api/parcels?${p}`).then((r) => r.json())
      .then((j) => { setParcels(j.data.parcels); setTotal(j.data.total); setSummary(j.data.summary || {}); setIsEmpty(j.data.isEmpty) })
      .finally(() => setLoading(false))
  }, [q, view, range, basis, from, to])
  useEffect(() => { load() }, [load])

  async function sync() {
    setSyncing(true)
    const res = await fetch("/api/parcels/sync", { method: "POST" })
    const j = await res.json()
    setSyncing(false)
    if (j.success) { toast.success(`${j.data.paid} colis marqués Payé`); load() }
    else toast.error(j.error?.message || j.error || "Synchronisation indisponible")
  }

  return (
    <div>
      <PageHeader title="Colis" subtitle={`${total} colis`}
        action={<Button onClick={sync} disabled={syncing}><RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />Synchroniser les paiements Navex</Button>} />

      <div className="space-y-2 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code Navex, désignation, COD…"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-300 bg-white text-sm" />
          </div>
          <select value={view} onChange={(e) => setView(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-600">
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={basis} onChange={(e) => setBasis(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-600">
            {BASES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGES.map((r) => (
            <button key={r.value} onClick={() => setRange(r.value)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium ${range === r.value ? "bg-blue-700 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{r.label}</button>
          ))}
          {range === "custom" && (
            <>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 rounded-lg border border-slate-300 px-2 text-xs" />
              <span className="text-slate-400 text-xs">→</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 rounded-lg border border-slate-300 px-2 text-xs" />
            </>
          )}
        </div>
      </div>

      {/* Summary (respects date filter) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { key: "enCours", view: "en_cours", label: "En cours", tone: "text-blue-600", ring: "ring-blue-200" },
          { key: "paye", view: "paye", label: "Payé", tone: "text-green-600", ring: "ring-green-200" },
          { key: "retour", view: "retour", label: "Retour", tone: "text-orange-600", ring: "ring-orange-200" },
          { key: "aVerifier", view: "a_verifier", label: "À vérifier", tone: "text-red-600", ring: "ring-red-200" },
        ].map((c) => (
          <button key={c.key} onClick={() => setView(view === c.view ? "" : c.view)}
            className={`rounded-xl border bg-white p-4 text-left transition ${view === c.view ? `border-transparent ring-2 ${c.ring}` : "border-slate-200 hover:bg-slate-50"}`}>
            <p className="text-xs font-medium text-slate-500">{c.label}</p>
            <p className={`mt-1 text-3xl font-bold tabular-nums ${c.tone}`}>{summary[c.key] ?? 0}</p>
          </button>
        ))}
      </div>

      {isEmpty ? (
        <EmptyState title="Aucun colis scanné." hint="Scannez les codes-barres Navex dans le Scanner pour enregistrer les colis." />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5 font-medium">Code Navex</th>
                <th className="px-3 py-2.5 font-medium text-right">COD</th>
                <th className="px-3 py-2.5 font-medium">Ajout Navex</th>
                <th className="px-3 py-2.5 font-medium">Désignation</th>
                <th className="px-3 py-2.5 font-medium">Date remise</th>
                <th className="px-3 py-2.5 font-medium">Statut</th>
                <th className="px-3 py-2.5 font-medium">Date paiement</th>
                <th className="px-3 py-2.5 font-medium">Date retour</th>
                <th className="px-3 py-2.5 font-medium">Dernière MAJ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <SkeletonRows rows={8} cols={9} />
              ) : parcels.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">Aucun colis pour ce filtre</td></tr>
              ) : parcels.map((p) => (
                <tr key={p._id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{p.navexTrackingCode}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-800 tabular-nums">{formatTND(p.codAmount)}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{frDate(p.navexCreatedAt)}</td>
                  <td className="px-3 py-2.5 text-slate-600 max-w-[180px] truncate">{p.designation || "—"}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{frDate(p.handedToNavexAt, true)}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={p.status} /></td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{frDate(p.paidAt)}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{frDate(p.returnAt)}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">{frDate(p.updatedAt, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
