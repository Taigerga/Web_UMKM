// src/ml/ml-client.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type MlResult = any;

@Injectable()
export class MlClientService {
  private readonly logger = new Logger(MlClientService.name);
  private failures = 0;
  private state: "closed" | "open" | "half_open" = "closed";
  private lastFailure = 0;

  constructor(private readonly config: ConfigService) {}

  private baseUrl(): string {
    return (this.config.get<string>("ML_SERVICE_URL") ?? "http://127.0.0.1:8000").replace(/\/$/, "");
  }

  private async call(path: string, body?: any, timeoutMs = 300_000): Promise<MlResult> {
    // circuit breaker
    if (this.state === "open" && Date.now() - this.lastFailure < 60_000) {
      throw new Error("ML service unavailable (circuit open)");
    }
    if (this.state === "open") this.state = "half_open";

    const url = `${this.baseUrl()}${path}`;
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt <= 2; attempt++) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: body ? "POST" : "GET",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
          signal: ac.signal,
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`ML ${path} failed: ${res.status} ${res.statusText}`);
        const json = await res.json();
        this.failures = 0;
        this.state = "closed";
        return json;
      } catch (e) {
        clearTimeout(timer);
        lastErr = e instanceof Error ? e : new Error(String(e));
        this.logger.warn(`ML call attempt ${attempt + 1} failed: ${lastErr.message}`);
      }
    }
    this.failures += 1;
    this.lastFailure = Date.now();
    if (this.failures > 3) this.state = "open";
    throw lastErr ?? new Error("ML call failed");
  }

  async forecast(horizonDays = 30) {
    return this.call("/forecast", { horizon_days: horizonDays });
  }

  // --- Inferensi per-toko (Promt §13.2): payload berdata toko, bukan id ---

  async forecastRun(input: { series: { date: string; sales: number }[]; horizon_days: number }) {
    return this.call("/forecast/run", input);
  }

  async segmentationRun(input: { customers: unknown[] }) {
    return this.call("/segmentation/run", input);
  }

  async basketRun(input: { transactions: { order_id: string; product: string }[] }, topK = 20) {
    return this.call("/basket/run", { ...input, top_k: topK });
  }

  async churnRun(input: { customers: unknown[] }, topK = 50) {
    return this.call("/churn/run", { ...input, top_k: topK });
  }

  async anomalyRun(input: { series: { date: string; sales: number }[] }) {
    return this.call("/anomaly/run", input);
  }

  async segmentation() {
    return this.call("/segmentation", {});
  }

  async basket(topK = 20) {
    return this.call(`/basket?top_k=${topK}`);
  }

  async churn(topK = 50) {
    return this.call(`/churn?top_k=${topK}`);
  }

  async anomaly() {
    return this.call("/anomaly", {});
  }

  async health() {
    return this.call("/health", undefined, 5_000);
  }
}
