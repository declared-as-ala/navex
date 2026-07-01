"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { PageHeader, EmptyState, PhysicalBadge, formatTND } from "@/components/parcel-ui"
import { Button } from "@/components/ui/button"
import { ScanLine } from "lucide-react"

const TABS = [
  { value: "expected", label: "Manquants (attendus)" },
  { value: "confirmed", label: "Confirmés" },
  { value: "all", label: "Tous" },
]

function frDate(d?: string) {
  return d ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Tunis", dateStyle: "short" }).format(new Date(d)) : "—"
}
function daysWaiting(d?: string) {
  if (!d) return "—"
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  return `${days} j`
}

export default function ReturnsPage() {
  const [data, setData] = useState<{ summary: any; parcels: any[] } | null>(null)
  const [tab, setTab] = useState("expected")
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/returns?status=${tab}`).then((r) => r.json()).then((j) => setData(j.data)).finally(() => setLoading(false))
  }, [tab])
  useEffect(() => { load() }, [load])

  const s = data?.summary
  return (
    <div>
      <PageHeader
        title="Retours"
        subtitle="Retours annoncés par Navex vs confirmés physiquement"
        action={<Link href="/scan"><Button variant="outline"><ScanLine className="h-4 w-4 mr-2" />Scanner un retour</Button></Link>}
      />

      <div className="grid grid-cols-3 gap-3 mb-5">
        <SummaryCard label="Retours annoncés" value={s?.announced ?? 0} tone="text-orange-600" />
        <SummaryCard label="Confirmés physiquement" value={s?.confirmed ?? 0} tone="text-green-600" />
        <SummaryCard label="Encore attendus" value={s?.stillMissing ?? 0} tone="text-red-600" />
      </div>

      <div className="flex gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t.value ? "bg-blue-700 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!loading && data?.parcels.length === 0 ? (
        <EmptyState title="Aucun retour." hint="Les retours apparaissent lorsque Navex les annonce ou lorsqu'ils sont scannés physiquement." />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5 font-medium">Code Navex</th>
                <th className="px-3 py-2.5 font-medium">Client</th>
                <th className="px-3 py-2.5 font-medium">Téléphone</th>
                <th className="px-3 py-2.5 font-medium text-right">COD</th>
                <th className="px-3 py-2.5 font-medium">Ajout Navex</th>
                <th className="px-3 py-2.5 font-medium">Retour annoncé</th>
                <th className="px-3 py-2.5 font-medium">Jours d'attente</th>
                <th className="px-3 py-2.5 font-medium">Désignation</th>
                <th className="px-3 py-2.5 font-medium">Physique</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-3 py-2.5"><div className="h-4 bg-slate-200 rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} /></td>
                    ))}
                  </tr>
                ))
              ) : data?.parcels.map((p) => (
                <tr key={p._id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{p.navexTrackingCode}</td>
                  <td className="px-3 py-2.5 text-slate-700">{p.customer?.name || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{p.customer?.phone || "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{formatTND(p.codAmount)}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">{frDate(p.navexCreatedAt)}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">{frDate(p.returnExpectedAt)}</td>
                  <td className={`px-3 py-2.5 text-xs font-medium ${p.physicalStatus === "RETURN_EXPECTED" ? "text-red-600" : "text-slate-400"}`}>{p.physicalStatus === "RETURN_EXPECTED" ? daysWaiting(p.returnExpectedAt) : "—"}</td>
                  <td className="px-3 py-2.5 text-slate-600 max-w-[160px] truncate">{p.designation || "—"}</td>
                  <td className="px-3 py-2.5"><PhysicalBadge status={p.physicalStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  )
}
