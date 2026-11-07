import { cn } from "@/lib/utils";
import type { Database, Item } from "@/lib/types";
import { groupOf, optOf } from "@/lib/model";
import { fmtDate, today } from "@/lib/util";
import { openPeek } from "@/store";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Mascot } from "@/components/brand/Brand";
import { AreaDot, OptionBadge, useAreas } from "../common";

export function TaskTable({ db, list, hasAny, onCreate }: { db: Database; list: Item[]; hasAny: boolean; onCreate: () => void }) {
  const areas = useAreas();
  const prop = (id: string) => db.props.find((p) => p.id === id);
  if (!list.length)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia>
            <Mascot pose="anota" size={72} className="mascot-pop" />
          </EmptyMedia>
          <EmptyTitle>{hasAny ? "Nenhuma tarefa com esses filtros" : "Nenhuma tarefa ainda"}</EmptyTitle>
          <EmptyDescription>
            {hasAny ? "Troque a área no topo ou limpe os filtros." : "Crie a primeira tarefa desta lista."}
          </EmptyDescription>
        </EmptyHeader>
        {!hasAny && (
          <EmptyContent>
            <Button onClick={onCreate}>Nova tarefa</Button>
          </EmptyContent>
        )}
      </Empty>
    );
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Tarefa</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-3 py-2.5 font-medium">Data</th>
            <th className="px-3 py-2.5 font-medium">Prioridade</th>
            <th className="px-3 py-2.5 font-medium">Área</th>
            <th className="px-3 py-2.5 font-medium">Etiquetas</th>
          </tr>
        </thead>
        <tbody>
          {list.map((it) => {
            const date = typeof it.props.date === "string" ? it.props.date : "";
            const late = date && date.slice(0, 10) < today() && groupOf(db, it) !== "done";
            const area = areas.find((a) => a.id === it.area);
            return (
              <tr
                key={it.id}
                data-del={"task:" + it.id}
                tabIndex={0}
                className="cursor-pointer border-b last:border-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                onClick={() => openPeek(it.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") openPeek(it.id);
                }}
              >
                <td className="max-w-72 truncate px-4 py-2.5 font-medium">
                  {it.title || <span className="text-muted-foreground">Sem título</span>}
                </td>
                <td className="px-3 py-2.5">
                  <OptionBadge opt={optOf(prop("status"), it.props.status)} dot />
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 whitespace-nowrap tabular-nums",
                    late ? "font-medium text-destructive" : "text-muted-foreground",
                  )}
                >
                  {date ? fmtDate(date) : ""}
                </td>
                <td className="px-3 py-2.5">
                  <OptionBadge opt={optOf(prop("prio"), it.props.prio)} />
                </td>
                <td className="px-3 py-2.5">
                  {area && (
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <AreaDot area={area} />
                      {area.name}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {((it.props.tags as string[]) ?? []).map((id) => (
                      <OptionBadge key={id} opt={optOf(prop("tags"), id)} />
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
