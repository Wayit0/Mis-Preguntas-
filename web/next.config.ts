import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Salida standalone: empaqueta un server mínimo con las deps trazadas
  // (incluido el binario nativo de sharp) para desplegar en Azure App Service.
  output: "standalone",
};

export default nextConfig;
