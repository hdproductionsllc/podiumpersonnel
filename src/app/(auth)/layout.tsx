export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      {/* Branded panel */}
      <div className="hidden lg:flex lg:w-[48%] xl:w-[52%] bg-sidebar relative overflow-hidden items-center justify-center flex-col">
        {/* Radial glow */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 30% 50%, oklch(0.25 0.04 260) 0%, transparent 70%)',
          }}
        />
        {/* Musical staff lines - decorative */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[80%] flex flex-col gap-[10px] opacity-[0.06]">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-px bg-white" />
            ))}
          </div>
        </div>
        <div className="absolute bottom-[28%] left-[15%] w-[60%] flex flex-col gap-[10px] opacity-[0.04]">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-px bg-white" />
          ))}
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center px-12 max-w-md">
          <img
            src="/logo.png"
            alt="Podium Personnel"
            className="max-h-28 max-w-full object-contain brightness-0 invert"
          />
          <div className="mt-8 w-16 h-px bg-gold/40" />
          <p className="mt-8 text-center text-lg text-sidebar-foreground/60 leading-relaxed font-heading">
            Orchestra personnel management,
            <br />
            <span className="text-sidebar-foreground/80 italic">refined.</span>
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <img
              src="/logo.png"
              alt="Podium Personnel"
              className="max-h-16 object-contain"
            />
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
