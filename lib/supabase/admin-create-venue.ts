/**
 * Alta de usuario centro vía API remota (p. ej. Next `/api/admin/create-venue-user`).
 * Configura `EXPO_PUBLIC_ADMIN_BACKEND_URL` con la URL base (sin barra final), p. ej.
 * `https://tu-app.vercel.app`. La API debe aceptar `Authorization: Bearer <access_token>`
 * (además de cookies si aplica).
 */
export type CreateVenueUserForm = {
  email: string
  password: string
  venueName: string
  city: string
  address: string
  phone: string
  mapsUrl: string
}

function adminBackendBase(): string | null {
  const raw = process.env.EXPO_PUBLIC_ADMIN_BACKEND_URL?.trim()
  if (!raw) return null
  return raw.replace(/\/$/, '')
}

export function isAdminCreateVenueConfigured(): boolean {
  return adminBackendBase() !== null
}

export async function createVenueUserViaBackend(
  accessToken: string,
  form: CreateVenueUserForm
): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = adminBackendBase()
  if (!base) {
    return {
      ok: false,
      error:
        'Configura EXPO_PUBLIC_ADMIN_BACKEND_URL con la URL del backend que expone POST /api/admin/create-venue-user (p. ej. despliegue Next con la ruta actualizada para Bearer JWT).',
    }
  }

  const url = `${base}/api/admin/create-venue-user`
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        venueName: form.venueName.trim(),
        city: form.city.trim() || 'Rancagua',
        address: form.address.trim(),
        phone: form.phone.trim(),
        mapsUrl: form.mapsUrl.trim() || null,
      }),
    })
    const json = (await r.json()) as { ok?: boolean; error?: string }
    if (!r.ok || !json.ok) {
      return { ok: false, error: json.error ?? 'No se pudo crear el usuario centro' }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error de red'
    return { ok: false, error: msg }
  }
}
