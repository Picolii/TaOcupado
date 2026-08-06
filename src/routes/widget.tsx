import { createFileRoute, Link } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useInstallPrompt } from "@/lib/pwa";
import { useStalls, type Stall } from "@/lib/stalls";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/widget")({
  head: () => ({
    meta: [
      { title: "Ta Ocupado? Widget" },
      {
        name: "description",
        content: "Widget simples com o status dos dois vasos.",
      },
    ],
  }),
  component: Widget,
});

function WidgetInstallButton() {
  const { canInstall, install } = useInstallPrompt();

  if (!canInstall) return null;

  return (
    <button
      type="button"
      onClick={install}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground"
    >
      <Download className="size-4" />
      Instalar
    </button>
  );
}

function WidgetCard({ stall, cleaning }: { stall: Stall; cleaning: boolean }) {
  const busy = stall.occupied;
  const noPaper = stall.paper_1 === "acabou" && stall.paper_2 === "acabou";

  return (
    <article
      className={cn(
        "flex min-h-44 flex-col justify-between rounded-lg border p-4",
        cleaning && "border-orange-400/60 bg-orange-400/10",
        !cleaning && !busy && "border-free/70 bg-free/12",
        !cleaning && busy && "border-busy/70 bg-busy/12",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-display text-4xl leading-none">{stall.label}</h2>
        <span
          className={cn(
            "rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide",
            cleaning && "bg-orange-400 text-background",
            !cleaning && busy && "bg-busy text-busy-foreground",
            !cleaning && !busy && "bg-free text-free-foreground",
          )}
        >
          {cleaning ? "limpeza" : busy ? "ocupado" : "livre"}
        </span>
      </div>

      <div>
        <p
          className={cn(
            "text-display text-6xl leading-none",
            cleaning && "text-orange-300",
            !cleaning && busy && "text-busy",
            !cleaning && !busy && "text-free",
          )}
        >
          {cleaning ? "FECHADO" : busy ? "OCUPADO" : "LIVRE"}
        </p>
        {noPaper && !cleaning && (
          <p className="mt-2 text-xs font-bold uppercase tracking-wide text-busy">Sem papel</p>
        )}
      </div>
    </article>
  );
}

function Widget() {
  const { stalls, bathroom, live } = useStalls();
  const cleaning = bathroom?.cleaning ?? false;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-3 px-3 py-4">
      <header className="flex items-center justify-between gap-3">
        <Link to="/" className="text-display text-4xl leading-none">
          Ta ocupado?
        </Link>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full",
              live ? "animate-pulse bg-free" : "bg-muted-foreground",
            )}
          />
          <WidgetInstallButton />
        </div>
      </header>

      {!stalls ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          Carregando...
        </div>
      ) : (
        <section className="grid gap-3">
          {stalls.map((stall) => (
            <WidgetCard key={stall.id} stall={stall} cleaning={cleaning} />
          ))}
        </section>
      )}
    </main>
  );
}
