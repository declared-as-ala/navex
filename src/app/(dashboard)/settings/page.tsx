"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { PageHeader } from "@/components/parcel-ui"
import { Button } from "@/components/ui/button"
import { Trash2, Plug } from "lucide-react"

const FIELDS = [
  { key: "warehouseName", label: "Nom de l'entrepôt", placeholder: "Entrepôt principal" },
  { key: "navexLookupEndpoint", label: "Navex — endpoint de recherche colis", placeholder: "https://app.navex.tn/api/<token>/lookup" },
  { key: "navexStatusEndpoint", label: "Navex — endpoint sync statut", placeholder: "https://app.navex.tn/api/<token>/status" },
]

export default function SettingsPage() {
  const { data: session } = useSession()
  const [values, setValues] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function testConnection() {
    setTesting(true); setTestResult(null)
    try {
      const j = await (await fetch("/api/navex/test-connection")).json()
      setTestResult({ ok: !!(j.success ?? j.data?.success), message: j.message || j.data?.message || (j.success ? "Connexion réussie" : "Échec de connexion") })
    } catch {
      setTestResult({ ok: false, message: "Erreur réseau" })
    } finally { setTesting(false) }
  }

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((j) => setValues(j.data || {}))
  }, [])

  async function save() {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function clearDemo() {
    if (!window.confirm("Supprimer toutes les données de démonstration (isDemo) ? Les vrais colis ne sont pas touchés.")) return
    setClearing(true)
    const j = await (await fetch("/api/admin/clear-demo-data", { method: "POST" })).json()
    setClearing(false)
    alert(j.success ? `Supprimé : ${j.data.totalDeleted} document(s).` : (j.error || "Erreur"))
  }

  const role = (session?.user as any)?.role
  const isAdmin = role === "SUPER_ADMIN" || role === "ADMIN"

  return (
    <div className="max-w-2xl">
      <PageHeader title="Paramètres" />

      {/* Profile */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 mb-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Profil utilisateur</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-slate-400">Nom</p><p className="text-slate-800">{session?.user?.name}</p></div>
          <div><p className="text-xs text-slate-400">Email</p><p className="text-slate-800">{session?.user?.email}</p></div>
          <div><p className="text-xs text-slate-400">Rôle</p><p className="text-slate-800 capitalize">{role?.replace(/_/g, " ")}</p></div>
        </div>
      </section>

      {/* Config */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Configuration</h2>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="text-xs font-medium text-slate-500">{f.label}</label>
            <input
              value={values[f.key] || ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              className="mt-1 w-full h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            />
          </div>
        ))}
        <p className="text-xs text-slate-400">
          Le <b>token API Navex</b> reste côté serveur (variable d'environnement <code>NAVEX_STATUS_TOKEN</code> / <code>NAVEX_LOOKUP_ENDPOINT</code>) — il n'est jamais exposé au navigateur.
          Sans endpoint configuré, le scan affiche « Navex lookup endpoint non configuré ».
        </p>
        <div className="flex items-center gap-3 pt-1">
          <Button onClick={save}>Enregistrer</Button>
          {saved && <span className="text-sm text-green-600">Enregistré ✓</span>}
          <Button variant="outline" onClick={testConnection} disabled={testing}><Plug className="h-4 w-4 mr-2" />Tester la connexion Navex</Button>
          {testResult && <span className={`text-sm ${testResult.ok ? "text-green-600" : "text-red-600"}`}>{testResult.message}</span>}
        </div>
      </section>

      {/* Danger zone */}
      {isAdmin && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-5">
          <h2 className="text-sm font-semibold text-red-700 mb-1">Données de test / démo</h2>
          <p className="text-xs text-red-600 mb-3">Supprime uniquement les enregistrements marqués isDemo. Sans effet sur les vrais colis.</p>
          <Button variant="destructive" onClick={clearDemo} disabled={clearing}>
            <Trash2 className="h-4 w-4 mr-2" />Effacer les données de démo
          </Button>
        </section>
      )}
    </div>
  )
}
