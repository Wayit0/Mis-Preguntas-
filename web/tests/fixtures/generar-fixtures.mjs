// Genera los fixtures binarios usados por tests/unit/docparse.test.ts:
//   - sample.docx : un DOCX OOXML mínimo y válido con texto conocido.
//   - sample.png  : un PNG real de 1x1 px.
//
// Ejecutar desde web/:  node tests/fixtures/generar-fixtures.mjs
// jszip llega de forma transitiva vía mammoth; lo resolvemos desde su ruta en
// el almacén de pnpm para no añadirlo como dependencia directa.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
// jszip no es dependencia directa: lo resolvemos desde el árbol de mammoth.
const require = createRequire(import.meta.url)
const mammothRequire = createRequire(require.resolve('mammoth'))
const JSZip = mammothRequire('jszip')

// Texto conocido que el test verifica como substring.
export const TEXTO_DOCX = 'Pregunta de prueba: ¿cuánto es 2 + 2?'

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${TEXTO_DOCX}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Segunda línea del documento.</w:t></w:r></w:p>
  </w:body>
</w:document>`

const zip = new JSZip()
zip.file('[Content_Types].xml', contentTypes)
zip.folder('_rels').file('.rels', rels)
zip.folder('word').file('document.xml', documentXml)

const docxBuffer = await zip.generateAsync({ type: 'nodebuffer' })
writeFileSync(join(here, 'sample.docx'), docxBuffer)

// PNG real de 1x1 px (transparente).
const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
writeFileSync(join(here, 'sample.png'), Buffer.from(pngBase64, 'base64'))

console.log('Fixtures generados: sample.docx, sample.png')
