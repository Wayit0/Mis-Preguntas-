import type { Metadata } from "next";
import { Lora, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Titulares y marca: Lora (serif con contraste, identidad EduBox). Bold para
// h1/h2 y el wordmark.
const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

// Cuerpo/UI: IBM Plex Sans (legible, herencia técnica-académica).
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Utilitaria: IBM Plex Mono (etiquetas A–E, números, fórmulas).
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "EduBox — banco de preguntas y pruebas para docentes",
  description:
    "Reúne tus preguntas, ármalas en pruebas listas para imprimir y compártelas con tu colegio.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-CL"
      className={`${plexSans.variable} ${lora.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
