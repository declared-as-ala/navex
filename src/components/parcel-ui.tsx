import { cn } from "@/lib/utils"

export function formatTND(n?: number) {
  if (n == null) return "—"
  return `${n.toFixed(3).replace(/\.?0+$/, "")} DT`
}

type Tone = "neutral" | "blue" | "green" | "orange" | "red" | "indigo"

const TONE: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  green: "bg-green-50 text-green-700 ring-green-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  red: "bg-red-50 text-red-700 ring-red-200",
}

const PHYSICAL: Record<string, { label: string; tone: Tone }> = {
  NOT_SCANNED: { label: "Non scanné", tone: "neutral" },
  HANDED_TO_NAVEX: { label: "Remis à Navex", tone: "indigo" },
  RETURN_EXPECTED: { label: "Retour attendu", tone: "orange" },
  RETURN_CONFIRMED: { label: "Retour confirmé", tone: "green" },
}
const NAVEX: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "En attente", tone: "neutral" },
  IN_TRANSIT: { label: "En transit", tone: "blue" },
  OUT_FOR_DELIVERY: { label: "En livraison", tone: "blue" },
  DELIVERED: { label: "Livré", tone: "green" },
  RETURN: { label: "Retour", tone: "orange" },
  UNKNOWN: { label: "Inconnu", tone: "red" },
}
const PAYMENT: Record<string, { label: string; tone: Tone }> = {
  COD_EXPECTED: { label: "COD attendu", tone: "neutral" },
  DELIVERED_UNPAID: { label: "Livré non payé", tone: "orange" },
  PAID_BY_NAVEX: { label: "Payé", tone: "green" },
  PAYMENT_DISPUTE: { label: "Litige", tone: "red" },
}

function Pill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", TONE[tone])}>
      {label}
    </span>
  )
}

export function PhysicalBadge({ status }: { status: string }) {
  const s = PHYSICAL[status] || { label: status, tone: "neutral" as Tone }
  return <Pill label={s.label} tone={s.tone} />
}
export function NavexBadge({ status }: { status: string }) {
  const s = NAVEX[status] || { label: status, tone: "neutral" as Tone }
  return <Pill label={s.label} tone={s.tone} />
}
export function PaymentBadge({ status }: { status: string }) {
  const s = PAYMENT[status] || { label: status, tone: "neutral" as Tone }
  return <Pill label={s.label} tone={s.tone} />
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 px-6 text-center">
      <p className="text-base font-medium text-slate-700">{title}</p>
      {hint && <p className="text-sm text-slate-400 mt-1 max-w-md">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
