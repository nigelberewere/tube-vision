import { createApp } from "../server";

let appPromise: ReturnType<typeof createApp> | null = null;

function normalizePath(pathValue: unknown): string {
  if (Array.isArray(pathValue)) return pathValue.join("/");
  if (typeof pathValue === "string") return pathValue;
  return "api/auth/config";
}

function rewriteRequestUrl(req: any): void {
  const incomingUrl = typeof req.url === "string" ? req.url : "/api/route";
  const url = new URL(incomingUrl, "http://localhost");
  const targetPath = normalizePath(req.query?.path).replace(/^\/+/, "");

  // Remove routing helper param before handing off to Express.
  url.searchParams.delete("path");

  const query = url.searchParams.toString();
  req.url = `/${targetPath}${query ? `?${query}` : ""}`;
}

export default async function handler(req: any, res: any) {
  if (!appPromise) {
    appPromise = createApp({ includeFrontend: false });
  }

  rewriteRequestUrl(req);

  const app = await appPromise;
  return app(req, res);
}
