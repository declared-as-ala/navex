"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { PageHeader, EmptyState } from "@/components/parcel-ui"
import { SkeletonPageHeader, SkeletonDashboardCards } from "@/components/skeletons"
import { Button } from "@/components/ui/button"
import { ChartCard, SingleBar, GroupedBar, COLORS } from "@/components/charts"
import { ScanLine, Truck, Banknote, CornerUpLeft, AlertTriangle } from "lucide-react"

interface Stats {
  cards: Record<string, number>
  activityByDay: any[]
  reconciliation: any[]
  isEmpty: boolean
}

const CARDS: { key: string; label: string; icon: any; tone: string }[] = [
  { key: "scannedToday", label: "Scannés aujourd'hui", icon: ScanLine, tone: "text-blue-600" },
  { key: "enCours", label: "En cours", icon: Truck, tone: "text-blue-600" },
  { key: "paye", label: "Payé", icon: Banknote, tone: "text-green-600" },
  { key: "retour", label: "Retour", icon: CornerUpLeft, tone: "text-orange-600" },
  { key: "aVerifier", label: "Colis à vérifier", icon: AlertTriangle, tone: "text-red-600" },
]

const RANGES = [
  { value: "", label: "Tout" },
  { value: "today", label: "Aujourd'hui" },
  { value: "yesterday", label: "Hier" },
  { value: "7d", label: "7 j" },
  { value: "30d", label: "30 j" },
]

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState("")

  const load = useCallback(() => {
    const p = new URLSearchParams()
    if (range) p.set("range", range)
    fetch(`/api/dashboard/stats?${p}`).then((r) => r.json()).then((j) => setStats(j.data)).finally(() => setLoading(false))
  }, [range])
  useEffect(() => { load() }, [load])

  if (loading && !stats) return <div><SkeletonPageHeader /><SkeletonDashboardCards /></div>

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Contrôle anti-perte des colis Navex"
        action={
          <div className="flex flex-wrap gap-1.5">
            {RANGES.map((r) => (
              <button key={r.value} onClick={() => setRange(r.value)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${range === r.value ? "bg-blue-700 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{r.label}</button>
            ))}
          </div>
        }
      />

      {stats?.isEmpty ? (
        <EmptyState title="Aucun colis scanné." hint="Scannez les codes-barres Navex dans le Scanner pour commencer."
          action={<Link href="/scan"><Button>Ouvrir le Scanner</Button></Link>} />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {CARDS.map((c) => {
              const Icon = c.icon
              return (
                <div key={c.key} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">{c.label}</span>
                    <Icon className={`h-4 w-4 ${c.tone}`} />
                  </div>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{stats?.cards[c.key] ?? 0}</p>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
            <ChartCard title="Activité par jour" subtitle="Scannés / Payé / Retour / À vérifier">
              {stats && stats.activityByDay.length > 0 ? (
                <GroupedBar data={stats.activityByDay} xKey="day" series={[
                  { key: "scannes", name: "Scannés", color: COLORS.blue },
                  { key: "payes", name: "Payé", color: COLORS.green },
                  { key: "retours", name: "Retour", color: COLORS.orange },
                  { key: "averifier", name: "À vérifier", color: COLORS.red },
                ]} />
              ) : <p className="text-sm text-slate-400 py-12 text-center">Aucune activité sur la période</p>}
            </ChartCard>

            <ChartCard title="Réconciliation" subtitle="Scannés = Payé + Retour + À vérifier">
              <SingleBar height={220} data={stats!.reconciliation} />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  )
}
