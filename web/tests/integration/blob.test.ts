import { describe, it, expect } from 'vitest'
import { uploadImage, getImageStream } from '@/lib/storage/blob'

// Requiere un emulador real (Azurite) accesible vía AZURE_STORAGE_CONNECTION_STRING.
// Sin configuración, la suite se omite (no falla) para no bloquear CI.
const hasConfig = Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING)

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

describe.runIf(hasConfig)('storage/blob (Azurite real)', () => {
  it('sube un buffer y getImageStream recupera el mismo contenido', async () => {
    const original = Buffer.from(`contenido mis-preguntas ${Date.now()} áéíóú`)
    const file = new File([original], 'prueba.png', { type: 'image/png' })

    const key = await uploadImage(file)
    expect(key.endsWith('.png')).toBe(true)

    const result = await getImageStream(key)
    expect(result).not.toBeNull()
    expect(result?.contentType).toBe('image/png')

    const recovered = await streamToBuffer(result!.stream)
    expect(recovered.equals(original)).toBe(true)
  })

  it('getImageStream retorna null para una clave inexistente', async () => {
    const result = await getImageStream(`no-existe-${Date.now()}.png`)
    expect(result).toBeNull()
  })
})
