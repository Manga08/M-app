import { handleIntegrationApi } from "@/lib/integrations/server";

type Context = { params: Promise<{ path: string[] }> };
export async function GET(request: Request, context: Context) { return handleIntegrationApi(request, (await context.params).path); }
export async function POST(request: Request, context: Context) { return handleIntegrationApi(request, (await context.params).path); }
