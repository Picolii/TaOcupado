import { useBusyMood, type PaperLevel, type Stall } from "@/lib/stalls";
import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "neutral",
  pulse = false,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "busy" | "free" | "warn";
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide transition-colors",
        tone === "busy" && "border-busy/60 bg-busy/15 text-busy",
        tone === "free" && "border-free/60 bg-free/15 text-free",
        tone === "warn" && "border-orange-400/60 bg-orange-400/15 text-orange-400",
        tone === "neutral" && "border-border bg-card text-muted-foreground",
        pulse && "animate-pulse",
      )}
    >
      {children}
    </span>
  );
}

export function FloodAlert({
  message,
  note,
  secondsLeft,
  onDismiss,
}: {
  message: string;
  note?: string | null;
  secondsLeft: number;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="fixed left-1/2 top-4 z-50 w-[min(92vw,32rem)] -translate-x-1/2 animate-scale-in rounded-2xl border border-busy/70 bg-busy/15 px-4 py-3 text-sm font-semibold text-busy shadow-lg backdrop-blur"
    >
      <div className="flex items-start gap-3">
        <span className="animate-pulse text-lg">🚨</span>
        <div className="flex-1">
          <p>{message}</p>
          {note && <p className="mt-1 text-xs opacity-90">{note}</p>}
          {secondsLeft > 0 && (
            <p className="mt-1 text-xs font-bold uppercase tracking-wide">
              Cliques bloqueados por{" "}
              <span className="text-display text-base tabular-nums">{secondsLeft}s</span>
            </p>
          )}
        </div>
        {secondsLeft > 0 ? (
          <span className="text-display text-2xl tabular-nums">{secondsLeft}</span>
        ) : (
          <button
            onClick={onDismiss}
            className="text-xs font-bold uppercase opacity-70 hover:opacity-100"
          >
            ok
          </button>
        )}
      </div>
      {secondsLeft > 0 && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-busy/25">
          <div
            className="h-full rounded-full bg-busy transition-all duration-300"
            style={{ width: `${Math.min(100, (secondsLeft / 10) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

const PAPER_LOOK: Record<PaperLevel, { label: string; className: string; emoji: string }> = {
  cheio: {
    label: "cheio",
    className: "border-free/60 bg-free/15 text-free",
    emoji: "🧻",
  },
  acabando: {
    label: "acabando",
    className: "border-orange-400/70 bg-orange-400/15 text-orange-400",
    emoji: "🧻",
  },
  acabou: {
    label: "acabou",
    className: "border-busy/70 bg-busy/15 text-busy",
    emoji: "💀",
  },
};

export function PaperRolls({
  stall,
  onCycle,
  disabled,
}: {
  stall: Stall;
  onCycle: (roll: 1 | 2) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {([1, 2] as const).map((roll) => {
        const level = roll === 1 ? stall.paper_1 : stall.paper_2;
        const look = PAPER_LOOK[level];
        return (
          <button
            key={roll}
            type="button"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onCycle(roll);
            }}
            className={cn(
              "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-all active:scale-[0.97]",
              look.className,
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <span className="flex items-center gap-2">
              <span className={cn("text-xl", level === "acabou" && "animate-pulse")}>
                {look.emoji}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wide">Rolo {roll}</span>
            </span>
            <span className="text-display text-lg leading-none">{look.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function StallCard({
  stall,
  onToggle,
  onCyclePaper,
  blocked = false,
  compact = false,
}: {
  stall: Stall;
  onToggle: () => void;
  onCyclePaper: (roll: 1 | 2) => void;
  blocked?: boolean;
  compact?: boolean;
}) {
  const mood = useBusyMood(stall);
  const busy = stall.occupied;
  const noPaper = stall.paper_1 === "acabou" && stall.paper_2 === "acabou";

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-3xl border transition-all",
        compact ? "p-6" : "p-5",
        blocked && "opacity-60",
        !busy && "border-free/60 bg-free/10 glow-free",
        busy && !mood.stinky && "border-busy/50 bg-busy/8 glow-busy",
        busy && mood.stinky && !mood.critical && "border-busy/70 bg-busy/12 glow-busy",
        busy && mood.critical && !mood.roast && "border-busy/80 bg-busy/16 glow-busy",
        busy && mood.roast && "border-busy bg-busy/22 animate-alert-flash",
        busy && mood.critical && !mood.dead && "animate-shake-soft",
        busy && mood.dead && "animate-shake-hard",
      )}
    >
      {busy && mood.roast && (
        <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-siren-sweep bg-busy blur-xl" />
      )}

      <button
        type="button"
        onClick={onToggle}
        aria-pressed={busy}
        aria-disabled={blocked}
        className={cn(
          "relative w-full text-left active:scale-[0.99]",
          blocked && "cursor-not-allowed",
        )}
      >
        <div className="flex items-start justify-between">
          <div>
            <span className={cn("text-display", compact ? "text-5xl" : "text-4xl")}>
              {stall.label}
            </span>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {stall.id === "vaso-2" ? "Lado do mictório" : "Lado da pia"}
            </p>
          </div>
          <span className="flex items-center gap-2">
            <span className={cn("text-2xl", busy && mood.critical && "animate-toilet-bob")}>
              🚽
            </span>
            <span
              className={cn(
                "relative flex size-5 items-center justify-center rounded-full",
                busy ? "bg-busy animate-pulse-ring" : "bg-free",
              )}
            />
          </span>
        </div>

        <div className="mt-3 flex items-end gap-3">
          <span
            className={cn(
              "text-display leading-none",
              compact ? "text-7xl" : "text-6xl",
              busy ? "text-busy" : "text-free",
              busy && mood.roast && "animate-pulse",
            )}
          >
            {busy ? "OCUPADO" : "LIVRE"}
          </span>
          {busy && mood.stinky && (
            <span className="relative -mb-1 flex gap-1 text-2xl">
              {[0, 1, 2].map((i) => (
                <span key={i} className="animate-stink" style={{ animationDelay: `${i * 0.5}s` }}>
                  ~
                </span>
              ))}
            </span>
          )}
        </div>

        <p className="mt-2 min-h-10 text-sm text-muted-foreground">
          {busy ? mood.joke : "Porta encostada, luz apagada, tudo em paz."}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Badge tone={busy ? "busy" : "free"}>
            Toque para marcar como {busy ? "livre" : "ocupado"}
          </Badge>
          {noPaper && (
            <Badge tone="busy" pulse>
              🧻 sem papel!
            </Badge>
          )}
          {busy ? (
            <>
              {mood.stinky && <Badge tone="busy">zona de risco</Badge>}
              {mood.critical && <Badge tone="busy">modo casulo</Badge>}
              {mood.forgotten && <Badge tone="neutral">esqueceram de desmarcar?</Badge>}
              {mood.roast && (
                <Badge tone="busy" pulse>
                  esculacho nível 30min
                </Badge>
              )}
              {mood.dead && (
                <Badge tone="busy" pulse>
                  ☠️ mandem socorro
                </Badge>
              )}
            </>
          ) : (
            <Badge tone="free">pronto pra uso</Badge>
          )}
        </div>
      </button>

      <div className="relative">
        <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Papel higiênico — toque para trocar (cheio → acabando → acabou)
        </p>
        <PaperRolls stall={stall} onCycle={onCyclePaper} disabled={blocked} />
      </div>

      {busy && mood.dead && (
        <span className="absolute -right-6 top-4 rotate-12 rounded bg-busy px-8 py-0.5 text-xs font-bold text-busy-foreground">
          CÓDIGO VERMELHO
        </span>
      )}
    </div>
  );
}
