"use client"

import { useEffect, useState, useCallback } from "react"
import { PageHeader, EmptyState, NavexBadge, PhysicalBadge, formatTND } from "@/components/parcel-ui"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"

const FILTERS = [
  { value: "", label: "Tous" },
  { value: "PENDING", label: "En attente" },
  { value: "IN_TRANSIT", label: "En transit" },
  { value: "OUT_FOR_DELIVERY", label: "En livraison" },
  { value: "DELIVERED", label: "Livrés" },
  { value: "RETURN", label: "Retours" },
]

export default function SuiviPage() {
  const [parcels, setParcels] = useState<any[]>([])
  const [isEmpty, setIsEmpty] = useState(false)
  const [filter, setFilter] = useState("")
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filter) params.set("navex", filter)
    params.set("limit", "500")
    fetch(`/api/parcels?${params}`)
      .then((r) => r.json())
      .then((j) => { setParcels(j.data.parcels); setIsEmpty(j.data.isEmpty) })
      .finally(() => setLoading(false))
  }, [filter])
  useEffect(() => { load() }, [load])

  async function sync() {
    setSyncing(true)
    const j = await (await fetch("/api/parcels/sync", { method: "POST" })).json()
    setSyncing(false)
    if (j.success) load()
    else alert(j.error?.message || j.error || "Erreur de synchronisation")
  }

  return (
    <div>
      <PageHeader
        title="Suivi Navex"
        subtitle="Statuts de livraison synchronisés depuis Navex"
        action={<Button onClick={sync} disabled={syncing}><RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />Synchroniser</Button>}
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f.value ? "bg-blue-700 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isEmpty ? (
        <EmptyState title="Aucun colis." hint="Importez les colis Navex pour suivre leurs statuts." />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2.5 font-medium">Code Navex</th>
                <th className="px-3 py-2.5 font-medium">Commande</th>
                <th className="px-3 py-2.5 font-medium">Client</th>
                <th className="px-3 py-2.5 font-medium text-right">COD</th>
                <th className="px-3 py-2.5 font-medium">Statut Navex</th>
                <th className="px-3 py-2.5 font-medium">Physique</th>
                <th className="px-3 py-2.5 font-medium">Dernière sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-3 py-2.5"><div className="h-4 bg-slate-200 rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} /></td>
                    ))}
                  </tr>
                ))
              ) : parcels.map((p) => (
                <tr key={p._id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{p.navexTrackingCode}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">{p.externalOrderId}</td>
                  <td className="px-3 py-2.5 text-slate-700">{p.customer?.name}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{formatTND(p.codAmount)}</td>
                  <td className="px-3 py-2.5"><NavexBadge status={p.navexStatus} /></td>
                  <td className="px-3 py-2.5"><PhysicalBadge status={p.physicalStatus} /></td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">{p.lastNavexSyncAt ? new Date(p.lastNavexSyncAt).toLocaleString("fr-FR") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
