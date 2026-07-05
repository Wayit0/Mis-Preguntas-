// Genera los fixtures binarios usados por tests/unit/docparse.test.ts:
//   - sample.docx           : un DOCX OOXML mínimo y válido con texto conocido.
//   - sample.png            : un PNG real de 1x1 px.
//   - sample-con-imagen.docx: un DOCX con esa misma imagen incrustada inline.
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
const pngBuffer = Buffer.from(pngBase64, 'base64')
writeFileSync(join(here, 'sample.png'), pngBuffer)

// ---------------------------------------------------------------------------
// sample-con-imagen.docx: mismo texto, más una imagen inline (DrawingML) que
// referencia media/image1.png vía la relación rId100 en
// word/_rels/document.xml.rels. Usado por el test de extracción de imágenes
// incrustadas (marcador [IMAGEN_n] + `ImagenExtraida`).
// ---------------------------------------------------------------------------

const contentTypesConImagen = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

const documentRelsConImagen = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId100" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`

const documentXmlConImagen = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${TEXTO_DOCX}</w:t></w:r></w:p>
    <w:p>
      <w:r>
        <w:drawing xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
                   xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                   xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
                   xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <wp:inline>
            <wp:extent cx="914400" cy="914400"/>
            <wp:docPr id="1" name="Imagen 1"/>
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic>
                  <pic:blipFill>
                    <a:blip r:embed="rId100"/>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm>
                      <a:off x="0" y="0"/>
                      <a:ext cx="914400" cy="914400"/>
                    </a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
    <w:p><w:r><w:t>Segunda línea del documento.</w:t></w:r></w:p>
  </w:body>
</w:document>`

const zipConImagen = new JSZip()
zipConImagen.file('[Content_Types].xml', contentTypesConImagen)
zipConImagen.folder('_rels').file('.rels', rels)
zipConImagen.folder('word').file('document.xml', documentXmlConImagen)
zipConImagen.folder('word').folder('_rels').file('document.xml.rels', documentRelsConImagen)
zipConImagen.folder('word').folder('media').file('image1.png', pngBuffer)

const docxConImagenBuffer = await zipConImagen.generateAsync({ type: 'nodebuffer' })
writeFileSync(join(here, 'sample-con-imagen.docx'), docxConImagenBuffer)

console.log(
  'Fixtures generados: sample.docx, sample.png, sample-con-imagen.docx',
)
