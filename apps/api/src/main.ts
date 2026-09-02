import "reflect-metadata";
import { Controller, Get, Module, UnauthorizedException, Req } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { createClient } from "@supabase/supabase-js";
import type { Request } from "express";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
);

@Controller()
class AppController {
  @Get("/health")
  health() {
    return { service: "deploypilot-api", status: "ok", timestamp: new Date().toISOString() };
  }

  @Get("/v1/repositories")
  async repositories(@Req() request: Request) {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) throw new UnauthorizedException();
    const { data, error } = await supabase.auth.getUser(authorization.slice(7));
    if (error || !data.user) throw new UnauthorizedException();
    // Database access will be connected after the Supabase migration is applied.
    return { userId: data.user.id, repositories: [] };
  }
}

@Module({ controllers: [AppController] })
class AppModule {}

const app = await NestFactory.create(AppModule);
app.enableCors({ origin: true, credentials: true });
await app.listen(Number(process.env.API_PORT ?? 4000), "0.0.0.0");
