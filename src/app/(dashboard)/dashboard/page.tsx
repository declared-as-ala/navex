"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { PageHeader, EmptyState } from "@/components/parcel-ui"
import { SkeletonPageHeader, SkeletonDashboardCards } from "@/components/skeletons"
import { Button } from "@/components/ui/button"
import { ChartCard, SingleBar, Donut } from "@/components/charts"
import {
  ScanLine, PackageCheck, Truck, CheckCircle2, CornerUpLeft, RotateCcw, AlertTriangle, HelpCircle,
} from "lucide-react"

interface Stats {
  cards: Record<string, number>
  remisChart: any[]
  returnsChart: any[]
  isEmpty: boolean
}

const CARDS: { key: string; label: string; icon: any; tone: string }[] = [
  { key: "scanned", label: "Colis scannés", icon: ScanLine, tone: "text-blue-600" },
  { key: "handedToNavex", label: "Remis à Navex", icon: PackageCheck, tone: "text-indigo-600" },
  { key: "inTransit", label: "En transit", icon: Truck, tone: "text-blue-600" },
  { key: "delivered", label: "Livrés", icon: CheckCircle2, tone: "text-green-600" },
  { key: "returnsAnnounced", label: "Retours annoncés", icon: CornerUpLeft, tone: "text-orange-600" },
  { key: "returnsConfirmed", label: "Retours confirmés", icon: RotateCcw, tone: "text-green-600" },
  { key: "returnsMissing", label: "Retours manquants", icon: AlertTriangle, tone: "text-red-600" },
  { key: "noUpdate", label: "Sans mise à jour", icon: HelpCircle, tone: "text-slate-500" },
]

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/dashboard/stats").then((r) => r.json()).then((j) => setStats(j.data)).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div><SkeletonPageHeader /><SkeletonDashboardCards /></div>
  )

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Contrôle des colis Navex" />

      {stats?.isEmpty ? (
        <EmptyState
          title="Aucun colis scanné."
          hint="Scannez les codes-barres Navex dans le Scanner pour commencer."
          action={<Link href="/scan"><Button>Ouvrir le Scanner</Button></Link>}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            <ChartCard title="Colis remis à Navex" subtitle="Livrés / Retours / En transit">
              <Donut data={stats!.remisChart} centerLabel={stats!.cards.handedToNavex} />
            </ChartCard>
            <ChartCard title="Contrôle des retours" subtitle="Annoncés → Confirmés → Manquants (anti-perte)">
              <SingleBar height={200} data={stats!.returnsChart} />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  )
}
