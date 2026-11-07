import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Mascot } from "@/components/brand/Brand";

/**
 * A part of the app loaded on demand (Anotações) that fails to load shows a message here,
 * instead of the error taking the whole page down to a blank screen.
 */
export class LoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Empty className="max-w-md border border-dashed">
          <EmptyHeader>
            <EmptyMedia>
              <Mascot pose="dorme" size={72} className="mascot-pop" />
            </EmptyMedia>
            <EmptyTitle>Não foi possível abrir esta parte</EmptyTitle>
            <EmptyDescription>
              Talvez a conexão tenha caído ou o site tenha sido atualizado. Recarregue para continuar; o que você salvou continua
              aqui.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => location.reload()}>Recarregar</Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }
}
