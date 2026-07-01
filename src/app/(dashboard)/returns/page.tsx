"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { PageHeader, EmptyState, formatTND } from "@/components/parcel-ui"
import { Button } from "@/components/ui/button"
import { ScanLine } from "lucide-react"

const FILTERS = [
  { value: "", label: "Tous" },
  { value: "range:today", label: "Aujourd'hui" },
  { value: "range:7d", label: "7 jours" },
  { value: "range:30d", label: "30 jours" },
  { value: "minWait:3", label: "Plus de 3 jours" },
  { value: "minWait:7", label: "Plus de 7 jours" },
]

function frDate(d?: string) {
  return d ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Tunis", dateStyle: "short" }).format(new Date(d)) : "—"
}
function daysWaiting(d?: string) {
  if (!d) return 0
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
}

export default function ReturnsPage() {
  const [data, setData] = useState<{ summary: any; parcels: any[] } | null>(null)
  const [filter, setFilter] = useState("")
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams()
    if (filter.startsWith("range:")) p.set("range", filter.split(":")[1])
    if (filter.startsWith("minWait:")) p.set("minWait", filter.split(":")[1])
    fetch(`/api/returns?${p}`).then((r) => r.json()).then((j) => setData(j.data)).finally(() => setLoading(false))
  }, [filter])
  useEffect(() => { load() }, [load])

  const s = data?.summary
  return (
    <div>
      <PageHeader
        title="Retours"
        subtitle="Contrôle anti-perte : ce que Navex doit encore vous rendre"
        action={<Link href="/scan"><Button variant="outline"><ScanLine className="h-4 w-4 mr-2" />Scanner un retour</Button></Link>}
      />

      <div className="grid grid-cols-3 gap-3 mb-5">
        <Card label="Retours annoncés par Navex" value={s?.announced ?? 0} tone="text-orange-600" />
        <Card label="Retours confirmés physiquement" value={s?.confirmed ?? 0} tone="text-green-600" />
        <Card label="Retours manquants" value={s?.missing ?? 0} tone="text-red-600" />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${filter === f.value ? "bg-blue-700 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {f.label}
          </button>
        ))}
      </div>

      <h2 className="text-sm font-semibold text-slate-700 mb-2">Retours manquants (les plus anciens d'abord)</h2>
      {!loading && data?.parcels.length === 0 ? (
        <EmptyState title="Aucun retour manquant." hint="Tous les retours annoncés par Navex ont été confirmés physiquement." />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5 font-medium">Code Navex</th>
                <th className="px-3 py-2.5 font-medium text-right">COD</th>
                <th className="px-3 py-2.5 font-medium">Désignation</th>
                <th className="px-3 py-2.5 font-medium">Date remise</th>
                <th className="px-3 py-2.5 font-medium">Retour annoncé</th>
                <th className="px-3 py-2.5 font-medium">Jours d'attente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-400">Chargement…</td></tr>
              ) : data?.parcels.map((p) => {
                const dw = daysWaiting(p.returnExpectedAt)
                return (
                  <tr key={p._id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{p.navexTrackingCode}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{formatTND(p.codAmount)}</td>
                    <td className="px-3 py-2.5 text-slate-600 max-w-[180px] truncate">{p.designation || "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{frDate(p.handedToNavexAt)}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{frDate(p.returnExpectedAt)}</td>
                    <td className={`px-3 py-2.5 text-sm font-semibold ${dw > 7 ? "text-red-600" : dw > 3 ? "text-orange-600" : "text-slate-500"}`}>{dw} j</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Card({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  )
}
