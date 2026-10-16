import { NestFactory } from "@nestjs/core";
import { McpStrategy, StdioTransport } from "@rekog/mcp-nest";
import { McpModule } from "./mcp.module.js";

async function bootstrap() {
  const app = await NestFactory.create(McpModule, { logger: ["error", "warn"] });
  app.connectMicroservice({
    strategy: new McpStrategy({
      name: "bisnis-insight-mcp",
      version: "1.0.0",
      transports: [new StdioTransport()],
    }),
  });
  await app.startAllMicroservices();
}

void bootstrap();
