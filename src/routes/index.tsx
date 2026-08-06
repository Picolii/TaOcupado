import { createFileRoute } from "@tanstack/react-router";
import { useStalls } from "@/lib/stalls";
import { cn } from "@/lib/utils";
import { Badge, FloodAlert, StallCard } from "@/components/stalls-ui";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tá Ocupado? — Status do banheiro em tempo real" },
      {
        name: "description",
        content:
          "Veja em tempo real se o Vaso 1 e o Vaso 2 estão livres, ocupados, em limpeza ou sem papel. Entre na fila e seja avisado na sua vez.",
      },
      { property: "og:title", content: "Tá Ocupado? — Status do banheiro em tempo real" },
      {
        property: "og:description",
        content:
          "Painel ao vivo dos boxes: ocupado, livre, papel higiênico, modo limpeza e fila de espera.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const {
    stalls,
    bathroom,
    live,
    geo,
    toggle,
    cyclePaper,
    toggleCleaning,
    setPerimeterHere,
    clearPerimeter,
    floodAlert,
    blockNote,
    cooldownLeft,
    blocked,
    dismissFlood,
    queue,
    inQueue,
    position,
    myTurn,
    joinQueue,
    leaveQueue,
  } = useStalls();

  const cleaning = bathroom?.cleaning ?? false;
  const freeCount = stalls?.filter((s) => !s.occupied).length ?? 0;
  const locked = blocked || cleaning || !geo.allowed;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8">
      {floodAlert && (
        <FloodAlert
          message={floodAlert}
          note={blockNote}
          secondsLeft={cooldownLeft}
          onDismiss={dismissFlood}
        />
      )}

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display text-5xl leading-none sm:text-6xl">Tá ocupado?</h1>
          <p className="mt-1 text-sm text-muted-foreground">Painel ao vivo dos boxes.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold uppercase tracking-wide">
          <span
            className={cn(
              "size-2 rounded-full",
              live ? "bg-free animate-pulse" : "bg-muted-foreground",
            )}
          />
          {live ? "AO VIVO" : "CONECTANDO..."}
        </div>
      </header>

      {/* limpeza */}
      <section
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4",
          cleaning ? "border-orange-400/70 bg-orange-400/10" : "border-border bg-card",
        )}
      >
        <div>
          <p className="text-display text-3xl">
            {cleaning ? "🧹 BANHEIRO FECHADO — EM LIMPEZA" : "Banheiro aberto"}
          </p>
          <p className="text-xs text-muted-foreground">
            {cleaning
              ? "Ninguém entra e nada pode ser marcado até a limpeza terminar."
              : "Se a faxina começar, feche o banheiro aqui."}
          </p>
        </div>
        <button
          onClick={toggleCleaning}
          disabled={!geo.allowed}
          className={cn(
            "rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors",
            cleaning
              ? "bg-free text-background hover:opacity-90"
              : "bg-orange-400 text-background hover:opacity-90",
            !geo.allowed && "cursor-not-allowed opacity-50",
          )}
        >
          {cleaning ? "Limpeza terminou — reabrir" : "Marcar limpeza"}
        </button>
      </section>

      {/* perímetro / localização */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            tone={
              geo.status === "perto"
                ? "free"
                : geo.status === "off"
                  ? "neutral"
                  : geo.status === "pedindo"
                    ? "warn"
                    : "busy"
            }
          >
            📍 {geo.status === "perto" ? "dentro do perímetro" : geo.status}
          </Badge>
          <span className="text-xs text-muted-foreground">{geo.message}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={setPerimeterHere}
            disabled={!geo.coords}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            Estou no banheiro: definir perímetro
          </button>
          {bathroom?.lat != null && (
            <button
              onClick={clearPerimeter}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
            >
              Liberar geral
            </button>
          )}
        </div>
      </section>

      {!stalls ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">
          Espiando pela fresta da porta...
        </div>
      ) : (
        <>
          <div
            className={cn(
              "rounded-2xl border p-4 text-display text-3xl",
              cleaning
                ? "border-orange-400/60 bg-orange-400/10 text-orange-400"
                : freeCount === 0
                  ? "border-busy/50 bg-busy/10 text-busy"
                  : "border-free/50 bg-free/10 text-free",
            )}
          >
            {cleaning
              ? "Em limpeza — volte em alguns minutos"
              : freeCount === 0
                ? "Fila! Nenhum vaso livre agora"
                : `${freeCount} de ${stalls.length} vaso${freeCount > 1 ? "s" : ""} livre${freeCount > 1 ? "s" : ""}`}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {stalls.map((s) => (
              <StallCard
                key={s.id}
                stall={s}
                blocked={locked}
                onToggle={() => toggle(s)}
                onCyclePaper={(roll) => cyclePaper(s, roll)}
              />
            ))}
          </div>

          {/* fila */}
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
            <div>
              <h2 className="text-display text-2xl">Fila de espera</h2>
              <p className="text-xs text-muted-foreground">
                {inQueue
                  ? myTurn
                    ? "É a sua vez! Um vaso liberou."
                    : `Você é o ${position + 1}º de ${queue.length} na fila. Avisamos por notificação do navegador.`
                  : `${queue.length} pessoa${queue.length === 1 ? "" : "s"} esperando. Ninguém é identificado — é só um ticket anônimo no seu navegador.`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {myTurn && (
                <Badge tone="free" pulse>
                  🔔 sua vez
                </Badge>
              )}
              <button
                onClick={inQueue ? leaveQueue : joinQueue}
                className={cn(
                  "rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors",
                  inQueue
                    ? "border border-border text-muted-foreground hover:text-foreground"
                    : "bg-free text-background hover:opacity-90",
                )}
              >
                {inQueue ? "Sair da fila" : "Entrar na fila"}
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
