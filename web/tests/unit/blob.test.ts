import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock del SDK de Azure: BlobServiceClient.fromConnectionString → container → blockBlob.
const mocks = vi.hoisted(() => {
  const uploadData = vi.fn()
  const exists = vi.fn()
  const download = vi.fn()
  const createIfNotExists = vi.fn()
  const getBlockBlobClient = vi.fn(() => ({ uploadData, exists, download }))
  const getContainerClient = vi.fn(() => ({ createIfNotExists, getBlockBlobClient }))
  const fromConnectionString = vi.fn(() => ({ getContainerClient }))
  return {
    uploadData,
    exists,
    download,
    createIfNotExists,
    getBlockBlobClient,
    getContainerClient,
    fromConnectionString,
  }
})

vi.mock('@azure/storage-blob', () => ({
  BlobServiceClient: { fromConnectionString: mocks.fromConnectionString },
}))

import { uploadImage, getImageStream } from '@/lib/storage/blob'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AZURE_STORAGE_CONNECTION_STRING = 'UseDevelopmentStorage=true'
  process.env.BLOB_CONTAINER = 'uploads'
})

describe('storage/blob (SDK mockeado)', () => {
  it('uploadImage genera una clave uuid.ext y sube el buffer', async () => {
    mocks.uploadData.mockResolvedValue(undefined)
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'foto.png', { type: 'image/png' })

    const key = await uploadImage(file)

    const [uuidPart, ext] = key.split('.')
    expect(ext).toBe('png')
    expect(uuidPart).toMatch(UUID_RE)
    expect(mocks.getBlockBlobClient).toHaveBeenCalledWith(key)
    expect(mocks.uploadData).toHaveBeenCalledTimes(1)
    const firstArg = mocks.uploadData.mock.calls[0][0]
    expect(Buffer.isBuffer(firstArg)).toBe(true)
  })

  it('uploadImage deriva la extensión del MIME cuando el nombre no la trae', async () => {
    mocks.uploadData.mockResolvedValue(undefined)
    const file = new File([new Uint8Array([1])], 'sin-extension', { type: 'image/jpeg' })

    const key = await uploadImage(file)

    expect(key.endsWith('.jpg')).toBe(true)
  })

  it('getImageStream pide el blob por su clave y retorna stream + contentType', async () => {
    mocks.exists.mockResolvedValue(true)
    const fakeStream = { fake: true }
    mocks.download.mockResolvedValue({ readableStreamBody: fakeStream, contentType: 'image/png' })

    const result = await getImageStream('abc123.png')

    expect(mocks.getBlockBlobClient).toHaveBeenCalledWith('abc123.png')
    expect(mocks.download).toHaveBeenCalledTimes(1)
    expect(result).not.toBeNull()
    expect(result?.stream).toBe(fakeStream)
    expect(result?.contentType).toBe('image/png')
  })

  it('getImageStream retorna null cuando el blob no existe', async () => {
    mocks.exists.mockResolvedValue(false)

    const result = await getImageStream('no-existe.png')

    expect(result).toBeNull()
    expect(mocks.download).not.toHaveBeenCalled()
  })

  it('lanza un error claro si falta AZURE_STORAGE_CONNECTION_STRING', async () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' })

    await expect(uploadImage(file)).rejects.toThrow(/AZURE_STORAGE_CONNECTION_STRING/)
  })
})
