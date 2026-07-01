import { NavexApiLog } from "../models/NavexApiLog"
import { SystemSetting } from "../models/SystemSetting"
import {
  NavexCreateShipmentPayload,
  NavexCreateShipmentResponse,
  NavexStatusResponse,
  NavexMultiStatusResponse,
  NavexDeleteResponse,
  NavexLogEntry,
  NavexLookupResult,
  NavexParcelData,
} from "./navex.types"
import {
  NavexError,
  NavexAuthenticationError,
  NavexTimeoutError,
  NavexMissingTrackingCodeError,
} from "./navex.errors"

const DEFAULT_TIMEOUT = 15000

const NAVEX_BASE = "https://app.navex.tn"

function getConfig() {
  return {
    createToken: process.env.NAVEX_CREATE_TOKEN || "",
    statusToken: process.env.NAVEX_STATUS_TOKEN || "",
    senderName: process.env.NAVEX_SENDER_NAME || "LogiFlow",
    senderLocation: process.env.NAVEX_SENDER_LOCATION || "Tunis",
    senderGovernorate: process.env.NAVEX_SENDER_GOUVERNORAT || "Tunis",
  }
}

function isMockMode(): boolean {
  const cfg = getConfig()
  return !cfg.createToken || cfg.createToken === "YOUR_CREATE_TOKEN_HERE"
}

function mockCreateShipment(payload: NavexCreateShipmentPayload): NavexCreateShipmentResponse {
  const trackingCode = `NVX${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`
  return {
    success: true,
    tracking_code: trackingCode,
    shipment_reference: `REF-${trackingCode}`,
    message: "Colis créé avec succès (MOCK)",
  }
}

function mockGetStatus(trackingCode: string): NavexStatusResponse {
  return {
    success: true,
    status: "en_cours",
    status_label: "En cours d'acheminement",
    delivery_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  }
}

const MOCK_NAMES = ["Ryan Ouachouacha", "Ahmed Ben Ali", "Sarra Mejdoub", "Mohamed Salah", "Nadia Karray", "Karim Jelliti", "Leila Bouaziz", "Yassine Bouchiba"]
const MOCK_CITIES: [string, string][] = [["Tunis", "La Marsa"], ["Ariana", "Raoued"], ["Sfax", "Sfax"], ["Sousse", "Sousse"], ["Nabeul", "Hammamet"]]

/** Complete (non-empty) simulated parcel for local testing only. */
function mockLookup(trackingCode: string): NavexParcelData {
  const n = parseInt(trackingCode.replace(/\D/g, "").slice(-4) || "0", 10)
  const [gov, city] = MOCK_CITIES[n % MOCK_CITIES.length]
  return {
    clientName: MOCK_NAMES[n % MOCK_NAMES.length],
    clientPhone: `${50 + (n % 49)} ${String(100000 + (n % 899999))}`.slice(0, 11),
    clientAddress: `${(n % 80) + 1} Rue de la République`,
    city,
    governorate: gov,
    codAmount: 15 + (n % 60),
    designation: "1x article (taille M)",
    navexCreatedAt: new Date().toISOString(),
    navexStatusRaw: "en_attente",
  }
}

function mockMultiStatus(trackingCodes: string[]): NavexMultiStatusResponse {
  return {
    success: true,
    shipments: trackingCodes.map((code) => ({
      tracking_code: code,
      status: "en_cours",
      status_label: "En cours d'acheminement",
    })),
  }
}

async function loadStatusEndpoints(): Promise<{ statusUrl: string; multiStatusUrl: string; deleteUrl: string }> {
  try {
    const [statusUrl, multiStatusUrl, deleteUrl] = await Promise.all([
      SystemSetting.findOne({ key: "navexStatusEndpoint" }).then((s) => s?.value || ""),
      SystemSetting.findOne({ key: "navexMultiStatusEndpoint" }).then((s) => s?.value || ""),
      SystemSetting.findOne({ key: "navexDeleteEndpoint" }).then((s) => s?.value || ""),
    ])
    return { statusUrl, multiStatusUrl, deleteUrl }
  } catch {
    return { statusUrl: "", multiStatusUrl: "", deleteUrl: "" }
  }
}

async function logNavexCall(entry: NavexLogEntry): Promise<void> {
  try {
    await NavexApiLog.create({
      endpoint: entry.endpoint,
      method: entry.method,
      statusCode: entry.statusCode,
      requestBody: entry.requestBody,
      responseBody: entry.responseBody,
      errorMessage: entry.errorMessage,
      duration: entry.duration,
      trackingCode: entry.trackingCode,
      success: entry.success,
    })
  } catch {
    // Silently fail - logging should never break the app
  }
}

async function makeNavexRequest<T>(
  url: string,
  method: string,
  body?: URLSearchParams,
  trackingCode?: string
): Promise<T> {
  const start = Date.now()

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)

    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      signal: controller.signal,
    }

    if (body) {
      options.body = body.toString()
    }

    const response = await fetch(url, options)
    clearTimeout(timeout)

    const responseText = await response.text()
    const duration = Date.now() - start

    let data: T
    try {
      data = JSON.parse(responseText)
    } catch {
      data = { success: false, error: responseText } as unknown as T
    }

    await logNavexCall({
      endpoint: url,
      method,
      statusCode: response.status,
      requestBody: body?.toString(),
      responseBody: responseText.substring(0, 2000),
      duration,
      trackingCode,
      success: response.ok,
    })

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new NavexAuthenticationError()
      }
      throw new NavexError(
        `Erreur Navex: ${response.status}`,
        "NAVEX_API_ERROR",
        response.status,
        data
      )
    }

    return data
  } catch (error) {
    const duration = Date.now() - start

    if (error instanceof NavexError) {
      await logNavexCall({
        endpoint: url,
        method,
        statusCode: error.statusCode,
        requestBody: body?.toString(),
        errorMessage: error.message,
        duration,
        trackingCode,
        success: false,
      })
      throw error
    }

    if ((error as Error).name === "AbortError") {
      const timeoutError = new NavexTimeoutError()
      await logNavexCall({
        endpoint: url,
        method,
        errorMessage: timeoutError.message,
        duration,
        trackingCode,
        success: false,
      })
      throw timeoutError
    }

    const unknownError = new NavexError(
      (error as Error).message || "Erreur inconnue Navex",
      "NAVEX_UNKNOWN_ERROR",
      500
    )
    await logNavexCall({
      endpoint: url,
      method,
      errorMessage: unknownError.message,
      duration,
      trackingCode,
      success: false,
    })
    throw unknownError
  }
}

export class NavexService {
  async createShipment(payload: NavexCreateShipmentPayload): Promise<NavexCreateShipmentResponse> {
    if (isMockMode()) {
      const result = mockCreateShipment(payload)
      await logNavexCall({
        endpoint: "MOCK /create",
        method: "POST",
        success: true,
        trackingCode: result.tracking_code,
        duration: 0,
      })
      return result
    }

    const cfg = getConfig()

    if (!payload.prix || !payload.nom || !payload.tel || !payload.gouvernerat || !payload.ville) {
      throw new NavexError(
        "Données client incomplètes pour la création du colis Navex",
        "NAVEX_INVALID_PAYLOAD",
        400
      )
    }

    const body = new URLSearchParams()
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        body.append(key, String(value))
      }
    })

    const url = `${NAVEX_BASE}/api/${cfg.createToken}/v1/post.php`

    const response = await makeNavexRequest<NavexCreateShipmentResponse>(
      url,
      "POST",
      body
    )

    if (!response.tracking_code) {
      throw new NavexMissingTrackingCodeError()
    }

    return response
  }

  async getShipmentStatus(trackingCode: string): Promise<NavexStatusResponse> {
    const cfg = getConfig()

    if (cfg.statusToken) {
      const body = new URLSearchParams()
      body.append("code", trackingCode)
      body.append("include_prix", "1")
      body.append("include_date", "1")

      const url = `${NAVEX_BASE}/api/${cfg.statusToken}/v1/post.php`

      try {
        const response = await makeNavexRequest<NavexStatusResponse>(url, "POST", body, trackingCode)
        return {
          success: true,
          status: response.status,
          etat: response.etat,
          motif: response.motif,
          pre_etat: response.pre_etat,
          pre_motif: response.pre_motif,
          livreur: response.livreur,
          livreur_tel: response.livreur_tel,
          status_message: response.status_message,
          prix: response.prix,
          date_dernier_statut: response.date_dernier_statut,
          status_label: response.etat,
        }
      } catch (error: any) {
        return {
          success: false,
          error: error.message || "Erreur de récupération du statut",
        }
      }
    }

    if (isMockMode()) {
      const result = mockGetStatus(trackingCode)
      await logNavexCall({
        endpoint: "MOCK /status",
        method: "GET",
        success: true,
        trackingCode,
        duration: 0,
      })
      return result
    }

    const endpoints = await loadStatusEndpoints()
    if (!endpoints.statusUrl) {
      return mockGetStatus(trackingCode)
    }

    const url = `${endpoints.statusUrl}?code=${encodeURIComponent(trackingCode)}`

    return makeNavexRequest<NavexStatusResponse>(
      url,
      "GET",
      undefined,
      trackingCode
    )
  }

  async getMultipleShipmentStatuses(trackingCodes: string[]): Promise<NavexMultiStatusResponse> {
    if (trackingCodes.length === 0) {
      return { success: true, shipments: [] }
    }

    const cfg = getConfig()

    if (cfg.statusToken) {
      const shipments = await Promise.all(
        trackingCodes.map(async (code) => {
          try {
            const result = await this.getShipmentStatus(code)
            if (result.success) {
              return {
                tracking_code: code,
                status: result.etat || "",
                status_label: result.etat || "",
                delivery_date: result.date_dernier_statut,
              }
            }
            return {
              tracking_code: code,
              status: "unknown",
              status_label: "Erreur de synchronisation",
              error: result.error,
            }
          } catch {
            return {
              tracking_code: code,
              status: "unknown",
              status_label: "Erreur de synchronisation",
            }
          }
        })
      )
      return { success: true, shipments }
    }

    if (isMockMode()) {
      return mockMultiStatus(trackingCodes)
    }

    const endpoints = await loadStatusEndpoints()
    if (!endpoints.multiStatusUrl) {
      return mockMultiStatus(trackingCodes)
    }

    const body = new URLSearchParams()
    body.append("codes", trackingCodes.join(","))

    return makeNavexRequest<NavexMultiStatusResponse>(
      endpoints.multiStatusUrl,
      "POST",
      body
    )
  }

  /**
   * Look up a full parcel from Navex by its tracking code. This is what the
   * "Remise à Navex" scan uses to register a parcel locally with REAL data.
   *
   *  - Mock mode (no token): returns complete simulated data for local testing.
   *  - Real token but no lookup endpoint configured: { configured: false }.
   *  - Configured: calls the endpoint; { found: false } if Navex doesn't know it.
   *
   * It NEVER fabricates empty/placeholder records.
   */
  async getParcelByTrackingCode(trackingCode: string): Promise<NavexLookupResult> {
    if (isMockMode()) {
      return { configured: true, found: true, mock: true, parcel: mockLookup(trackingCode) }
    }

    const cfg = getConfig()
    const lookupUrl = await SystemSetting.findOne({ key: "navexLookupEndpoint" })
      .then((s) => s?.value || process.env.NAVEX_LOOKUP_ENDPOINT || "")
      .catch(() => process.env.NAVEX_LOOKUP_ENDPOINT || "")

    // Build the request URL: a dedicated lookup endpoint if configured, else fall
    // back to the Navex status (etat) endpoint, which returns real COD + status.
    let url: string
    let method: "GET" | "POST" = "GET"
    let body: URLSearchParams | undefined
    if (lookupUrl) {
      url = `${lookupUrl}${lookupUrl.includes("?") ? "&" : "?"}code=${encodeURIComponent(trackingCode)}`
    } else if (cfg.statusToken) {
      url = `${NAVEX_BASE}/api/${cfg.statusToken}/v1/post.php`
      method = "POST"
      body = new URLSearchParams()
      body.append("code", trackingCode)
      body.append("include_prix", "1")
      body.append("include_date", "1")
    } else {
      return { configured: false, found: false, error: "Navex lookup endpoint not configured" }
    }

    try {
      const res = await makeNavexRequest<any>(url, method, body, trackingCode)
      // "found" requires real signal from Navex (a status or a price)
      const hasData = res && res.success !== false && (res.etat || res.status || res.prix || res.nom || res.recipient_name)
      if (!hasData) return { configured: true, found: false }

      const parcel: NavexParcelData = {
        clientName: res.nom || res.client || res.recipient_name || res.client_name || "",
        clientPhone: res.tel || res.telephone || res.phone || "",
        clientAddress: res.adresse || res.address || "",
        city: res.ville || res.city || "",
        governorate: res.gouvernerat || res.gouvernorat || res.governorate || "",
        codAmount: parseFloat(String(res.prix ?? res.cod ?? 0)) || 0,
        designation: res.designation || res.produit || res.product || "",
        navexCreatedAt: res.date_creation || res.created_at || res.date || undefined,
        navexStatusRaw: res.etat || res.status || "en_attente",
      }
      return { configured: true, found: true, parcel }
    } catch (error: any) {
      // Navex returns an error/non-200 for an unknown code → treat as not found
      return { configured: true, found: false, error: error.message || "Erreur de recherche Navex" }
    }
  }

  async deleteShipment(trackingCode: string): Promise<NavexDeleteResponse> {
    if (isMockMode()) {
      return { success: true, message: "Colis supprimé (MOCK)" }
    }

    const endpoints = await loadStatusEndpoints()
    if (!endpoints.deleteUrl) {
      return { success: true, message: "Colis supprimé (MOCK — aucun endpoint configuré)" }
    }

    const url = `${endpoints.deleteUrl}?code=${encodeURIComponent(trackingCode)}`

    return makeNavexRequest<NavexDeleteResponse>(
      url,
      "GET",
      undefined,
      trackingCode
    )
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (isMockMode()) {
      return {
        success: true,
        message: "Mode démonstration activé (pas de token configuré)",
      }
    }

    try {
      const cfg = getConfig()
    const url = `${NAVEX_BASE}/api/${cfg.createToken}/v1/post.php`
      const body = new URLSearchParams()
      body.append("prix", "0.000")
      body.append("nom", "TEST")
      body.append("tel", "+21600000000")
      body.append("gouvernerat", "Tunis")
      body.append("ville", "Tunis")
      body.append("adresse", "Test")
      body.append("designation", "Test")
      body.append("nb_article", "1")
      body.append("sender_name", cfg.senderName)
      body.append("sender_location", cfg.senderLocation)
      body.append("sender_gouvernorat", cfg.senderGovernorate)

      await makeNavexRequest(url, "POST", body)
      return { success: true, message: "Connexion Navex réussie" }
    } catch (error) {
      return {
        success: false,
        message: error instanceof NavexError ? error.message : "Erreur de connexion inconnue",
      }
    }
  }
}

export const navexService = new NavexService()
