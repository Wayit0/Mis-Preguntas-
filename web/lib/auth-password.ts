import crypto from 'node:crypto'

const LEGACY = 'legacy-sha256:'
const N = 16384,
  r = 8,
  p = 1,
  KEYLEN = 64

function scrypt(pw: string, salt: Buffer): Promise<Buffer> {
  return new Promise((res, rej) =>
    crypto.scrypt(pw, salt, KEYLEN, { N, r, p }, (e, d) =>
      e ? rej(e) : res(d as Buffer),
    ),
  )
}

export async function hashPw(password: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  const dk = await scrypt(password, salt)
  return `scrypt:${salt.toString('hex')}:${dk.toString('hex')}`
}

export async function verifyPw({
  hash,
  password,
}: {
  hash: string
  password: string
}): Promise<boolean> {
  if (hash.startsWith(LEGACY)) {
    const expected = hash.slice(LEGACY.length)
    const actual = crypto.createHash('sha256').update(password).digest('hex')
    if (actual.length !== expected.length) return false
    return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  }
  const [scheme, saltHex, keyHex] = hash.split(':')
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false
  const dk = await scrypt(password, Buffer.from(saltHex, 'hex'))
  const key = Buffer.from(keyHex, 'hex')
  return dk.length === key.length && crypto.timingSafeEqual(dk, key)
}

export { LEGACY }
