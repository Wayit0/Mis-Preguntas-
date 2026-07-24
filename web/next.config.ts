import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Salida standalone: empaqueta un server mínimo con las deps trazadas
  // (incluido el binario nativo de sharp) para desplegar en Azure App Service.
  output: "standalone",
  // No bundlear estos paquetes: dejarlos como externos para que se carguen desde
  // node_modules en runtime y el tracer los copie completos al bundle standalone.
  // @react-pdf/renderer depende de yoga-layout (WASM) y sharp es nativo; si se
  // bundlean, faltan sus assets/binarios en producción y la generación de PDF
  // falla (el dev con `next start` no lo detecta porque usa node_modules entero).
  serverExternalPackages: ["@react-pdf/renderer", "sharp"],
  // Default de Server Actions es 1MB: muy poco para "Importar Documento" (DOCX/PDF
  // con fotos/diagramas incrustados, o la re-subida de esas imágenes al guardar).
  // El auto-guardado de borradores de importación envía el estado editable completo
  // (imágenes en base64, incluidas las originales pre-recorte); el tope amable es
  // 25 MB (MAX_BYTES_EDICION en lib/actions/borradores-importacion.ts) y el límite
  // de plataforma debe quedar POR ENCIMA para que ese error amable sea alcanzable.
  experimental: {
    serverActions: {
      bodySizeLimit: "30mb",
    },
  },
};

export default nextConfig;
