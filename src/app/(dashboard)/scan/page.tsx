"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { PageHeader, formatTND, NavexBadge, MainStatusBadge, PaymentBadge } from "@/components/parcel-ui"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, PackageCheck, CornerUpLeft, Search, ShieldAlert } from "lucide-react"

type Mode = "HANDOVER_PREP" | "RETURN_RECEIVE" | "VERIFY"

const MODES: { value: Mode; label: string; icon: any }[] = [
  { value: "HANDOVER_PREP", label: "Remise à Navex", icon: PackageCheck },
  { value: "RETURN_RECEIVE", label: "Retour reçu", icon: CornerUpLeft },
  { value: "VERIFY", label: "Vérifier un colis", icon: Search },
]

interface ScanRow { ok: boolean; result: string; message: string; code: string; parcel?: any; ts: number }

function beep(ok: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.frequency.value = ok ? 880 : 220
    o.type = ok ? "sine" : "square"
    g.gain.value = 0.1; o.start()
    setTimeout(() => { o.stop(); ctx.close() }, ok ? 110 : 240)
  } catch { /* no audio */ }
}

function frDate(d?: string, withTime = false) {
  return d ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Tunis", dateStyle: "short", ...(withTime ? { timeStyle: "short" } : {}) }).format(new Date(d)) : "—"
}

export default function ScannerPage() {
  const [mode, setMode] = useState<Mode>("HANDOVER_PREP")
  const [code, setCode] = useState("")
  const [last, setLast] = useState<ScanRow | null>(null)
  const [history, setHistory] = useState<ScanRow[]>([])
  const [busy, setBusy] = useState(false)
  const [pendingOverride, setPendingOverride] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const focusInput = useCallback(() => inputRef.current?.focus(), [])
  useEffect(() => { focusInput() }, [mode, focusInput])
  useEffect(() => { const i = setInterval(focusInput, 1500); return () => clearInterval(i) }, [focusInput])

  async function submit(trackingCode: string, override = false) {
    const t = trackingCode.trim().replace(/[\r\n]+$/g, "").trim()
    if (!t || busy) return
    setBusy(true)
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingCode: t, mode, override, overrideReason: override ? "Override administrateur" : undefined }),
      })
      const j = await res.json()
      const row: ScanRow = {
        ok: !!j.success, result: j.result || j.error?.code || "ERROR",
        message: j.success ? "OK" : j.error?.message || "Erreur",
        code: j.parcel?.navexTrackingCode || t, parcel: j.parcel, ts: Date.now(),
      }
      setLast(row)
      setHistory((h) => [row, ...h].slice(0, 25))
      beep(j.success)
      setPendingOverride(j.error?.code === "NOT_RETURN" ? t : null)
    } catch {
      beep(false)
      setLast({ ok: false, result: "ERROR", message: "Erreur réseau", code: t, ts: Date.now() })
    } finally {
      setBusy(false); setCode(""); focusInput()
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); submit(code) }
  }

  const okCount = history.filter((h) => h.ok).length
  const failCount = history.length - okCount
  const successTitle = mode === "RETURN_RECEIVE" ? "Retour confirmé physiquement" : mode === "VERIFY" ? "Colis trouvé" : "Colis remis à Navex"

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Scanner" subtitle="Poste de scan entrepôt" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
        {MODES.map((m) => {
          const Icon = m.icon; const active = mode === m.value
          return (
            <button key={m.value} onClick={() => { setMode(m.value); setLast(null); setPendingOverride(null) }}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${active ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
              <Icon className={`h-5 w-5 ${active ? "text-blue-600" : "text-slate-400"}`} />
              <span className="text-sm font-medium">{m.label}</span>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <input
            ref={inputRef} value={code}
            onChange={(e) => setCode(e.target.value)} onKeyDown={onKeyDown} onBlur={focusInput} autoFocus
            placeholder="Scannez le code-barres Navex…"
            className="scan-input w-full h-20 rounded-2xl border-2 border-slate-300 bg-white px-6 text-3xl font-mono tracking-wider text-slate-900 focus:border-blue-600"
          />

          {last && (
            <div className={`rounded-2xl border-2 p-6 ${last.ok ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
              <div className="flex items-center gap-3">
                {last.ok ? <CheckCircle2 className="h-10 w-10 text-green-600" /> : <XCircle className="h-10 w-10 text-red-600" />}
                <div>
                  <p className={`text-xl font-bold ${last.ok ? "text-green-800" : "text-red-800"}`}>{last.ok ? successTitle : last.message}</p>
                  <p className="text-sm font-mono text-slate-500">{last.code}</p>
                </div>
              </div>

              {last.parcel && (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <Info label="COD" value={formatTND(last.parcel.codAmount)} />
                  <Info label="Désignation" value={last.parcel.designation || "—"} />
                  <Info label="Date ajout Navex" value={frDate(last.parcel.navexCreatedAt)} />
                  <Info label="Date remise" value={frDate(last.parcel.handedToNavexAt, true)} />
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Statut</p><div className="mt-0.5"><MainStatusBadge status={last.parcel.mainStatus} /></div></div>
                  <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Paiement</p><div className="mt-0.5"><PaymentBadge status={last.parcel.paymentStatus} /></div></div>
                  {mode === "VERIFY" && (
                    <>
                      <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Statut Navex</p><div className="mt-0.5"><NavexBadge status={last.parcel.navexStatus} /></div></div>
                      <Info label="Retour annoncé" value={frDate(last.parcel.returnExpectedAt)} />
                      <Info label="Retour confirmé" value={frDate(last.parcel.returnConfirmedAt, true)} />
                    </>
                  )}
                </div>
              )}

              {pendingOverride && (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-orange-300 bg-orange-50 p-3">
                  <ShieldAlert className="h-5 w-5 text-orange-600" />
                  <span className="text-sm text-orange-800 flex-1">Colis non annoncé en retour. Confirmer en tant qu'administrateur ?</span>
                  <Button size="sm" variant="destructive" onClick={() => submit(pendingOverride, true)}>Override</Button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-700">Scans récents</span>
            <span className="text-xs text-slate-400"><span className="text-green-600 font-medium">{okCount} ✓</span> · <span className="text-red-600 font-medium">{failCount} ✗</span></span>
          </div>
          <div className="max-h-[460px] overflow-y-auto divide-y divide-slate-100">
            {history.length === 0 && <p className="px-4 py-6 text-sm text-slate-400 text-center">Aucun scan</p>}
            {history.map((h, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                {h.ok ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-mono text-slate-700 truncate">{h.code}</p>
                  <p className={`text-[11px] truncate ${h.ok ? "text-slate-400" : "text-red-500"}`}>{h.ok && h.parcel ? formatTND(h.parcel.codAmount) : h.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-slate-800 font-medium truncate">{value || "—"}</p>
    </div>
  )
}
