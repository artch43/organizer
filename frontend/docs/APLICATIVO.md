# Aplicativo para Android e iPhone

Os apps são feitos com o [Capacitor](https://capacitorjs.com): o mesmo site, empacotado dentro de um app
nativo. Os projetos ficam em `frontend/android/` e `frontend/ios/`. O app fala com o mesmo Supabase do site, então a conta e os
dados são os mesmos.

## O que instalar (uma vez)

| Para | Instale | Custo |
|---|---|---|
| Android | [Android Studio](https://developer.android.com/studio) | grátis |
| iPhone | Xcode, pela App Store do Mac | grátis |
| Publicar na Google Play | conta de desenvolvedor Google Play | US$ 25, uma vez |
| Publicar na App Store | Apple Developer Program | US$ 99 por ano |

Para testar no seu próprio celular, não precisa pagar nada.

## Rodar

```bash
npm run android   # gera o site, copia para o app e abre no Android Studio
npm run ios       # o mesmo, abrindo no Xcode
```

No Android Studio, ligue o celular por USB (com a depuração USB ativada) e clique em ▶. No Xcode, escolha o
iPhone ou um simulador, selecione seu time em **Signing & Capabilities** e clique em ▶.

Depois de mudar o código, rode o comando de novo (ou `npm run build:app`) para o app receber a versão nova.

## Publicar nas lojas

- **Google Play:** no Android Studio, **Build → Generate Signed App Bundle**. Guarde a chave de assinatura
  em lugar seguro: sem ela não dá para atualizar o app. Envie o `.aab` no Google Play Console.
- **App Store:** no Xcode, **Product → Archive** e depois **Distribute App**. O envio vai para o App Store
  Connect, onde se preenche a ficha e se pede a revisão.

As duas lojas pedem um link de política de privacidade: use `https://<seu-site>/privacidade.html`.

## Detalhes

- Identificador do app: `com.artch43.organizer` (em `frontend/capacitor.config.ts`). Depois de publicado, não muda.
- Ícones e tela de abertura saem de `frontend/assets/`. Para gerar de novo, dentro de `frontend/`:
  `npx @capacitor/assets generate --android --ios`.
- Os links dos e-mails (confirmar conta, nova senha) abrem o site, definido em `VITE_SITE_URL`
  (padrão: `https://organizerapp.vercel.app`).
- No app não há service worker: os arquivos do site já vêm dentro dele.
