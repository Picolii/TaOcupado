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
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide transition-colors",
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
      className="fixed left-1/2 top-4 z-50 w-[min(92vw,32rem)] -translate-x-1/2 animate-scale-in rounded-lg border border-busy/70 bg-busy/15 px-4 py-3 text-sm font-semibold text-busy shadow-lg backdrop-blur"
    >
      <div className="flex items-start gap-3">
        <span className="mt-1 size-2 shrink-0 animate-pulse rounded-full bg-busy" />
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

const PAPER_LOOK: Record<PaperLevel, { label: string; className: string; icon: string }> = {
  cheio: {
    label: "cheio",
    className: "border-free/60 bg-free/15 text-free",
    icon: "🧻",
  },
  acabando: {
    label: "baixo",
    className: "border-orange-400/70 bg-orange-400/15 text-orange-400",
    icon: "🧻",
  },
  acabou: {
    label: "acabou",
    className: "border-busy/70 bg-busy/15 text-busy",
    icon: "💀",
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
              "flex h-12 items-center justify-between gap-2 rounded-lg border px-3 text-left transition-all active:scale-[0.98]",
              look.className,
              disabled && "cursor-not-allowed opacity-50",
            )}
          >
            <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
              <span className={cn("text-lg leading-none", level === "acabou" && "animate-pulse")}>
                {look.icon}
              </span>
              Rolo {roll}
            </span>
            <span className="text-display text-lg leading-none">{look.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function getPoopStormLabel(minutes: number) {
  if (minutes >= 30) {
    return "apocalipse de bosta";
  }
  if (minutes >= 20) {
    return "temporal de bosta";
  }
  if (minutes >= 12) {
    return "tempestade de bosta";
  }
  if (minutes >= 7) {
    return "chuva de merda";
  }

  return null;
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
  const poopStormLabel = busy ? getPoopStormLabel(mood.mins) : null;

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border transition-all",
        compact ? "p-4" : "p-5",
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
        disabled={blocked}
        aria-pressed={busy}
        className={cn(
          "relative w-full text-left transition-transform active:scale-[0.99]",
          blocked && "cursor-not-allowed",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className={cn("text-display leading-none", compact ? "text-4xl" : "text-5xl")}>
              {stall.label}
            </span>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {stall.id === "vaso-2" ? "Lado do mictório" : "Lado da pia"}
            </p>
          </div>
          <span
            className={cn(
              "mt-1 flex h-7 min-w-24 items-center justify-center gap-1.5 rounded-md text-[11px] font-bold uppercase tracking-wide",
              busy ? "bg-busy text-busy-foreground" : "bg-free text-free-foreground",
            )}
          >
            <span
              aria-hidden
              className={cn("text-sm", busy && mood.critical && "animate-toilet-bob")}
            >
              {busy ? "🚪" : "🚽"}
            </span>
            {busy ? "ocupado" : "livre"}
          </span>
        </div>

        <div className="mt-3 flex items-end gap-3">
          <span
            className={cn(
              "text-display leading-none",
              compact ? "text-6xl" : "text-7xl",
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

        {busy && <p className="mt-2 min-h-8 text-sm text-muted-foreground">{mood.joke}</p>}

        <div className="mt-3 flex min-h-6 flex-wrap items-center gap-1.5">
          {noPaper && (
            <Badge tone="busy" pulse>
              🧻 sem papel
            </Badge>
          )}
          {busy ? (
            <>
              {mood.stinky && <Badge tone="busy">zona de risco</Badge>}
              {poopStormLabel && (
                <Badge tone="busy" pulse>
                  {poopStormLabel}
                </Badge>
              )}
              {mood.critical && <Badge tone="busy">modo casulo</Badge>}
              {mood.forgotten && <Badge tone="neutral">confere aí</Badge>}
              {mood.roast && (
                <Badge tone="busy" pulse>
                  30min+
                </Badge>
              )}
              {mood.dead && (
                <Badge tone="busy" pulse>
                  verificar
                </Badge>
              )}
            </>
          ) : (
            <Badge tone="free">pronto</Badge>
          )}
        </div>
      </button>

      <PaperRolls stall={stall} onCycle={onCyclePaper} disabled={blocked} />

      {busy && mood.dead && (
        <span className="absolute -right-6 top-4 rotate-12 rounded bg-busy px-8 py-0.5 text-xs font-bold text-busy-foreground">
          CÓDIGO VERMELHO
        </span>
      )}
    </div>
  );
}
