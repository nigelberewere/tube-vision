import { createApp } from "../server";

let appPromise: ReturnType<typeof createApp> | null = null;

export default async function handler(req: any, res: any) {
  if (!appPromise) {
    appPromise = createApp({ includeFrontend: false });
  }

  const app = await appPromise;
  return app(req, res);
}
