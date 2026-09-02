import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { db } from "@deploypilot/database/client";

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await db.$connect(); }
  async onModuleDestroy() { await db.$disconnect(); }
  get client() { return db; }
}
