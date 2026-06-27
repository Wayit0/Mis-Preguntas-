export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-1 flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            Mis Preguntas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Banco de preguntas para docentes
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}
