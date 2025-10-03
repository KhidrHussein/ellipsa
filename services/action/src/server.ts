import express, { Request, Response } from "express";
import { z } from "zod";
import { chromium, Browser, Page } from "playwright";

const ExecuteSchema = z.object({
  agent_id: z.string().optional(),
  plan: z
    .array(
      z.discriminatedUnion("op", [
        z.object({ op: z.literal("open_url"), args: z.object({ url: z.string().url() }) }),
        z.object({ op: z.literal("type_text"), args: z.object({ selector: z.string(), text: z.string() }) }),
        z.object({ op: z.literal("click"), args: z.object({ selector: z.string() }) }),
        z.object({ op: z.literal("wait"), args: z.object({ ms: z.number().min(100).max(10000) }) }),
        z.object({ op: z.literal("screenshot"), args: z.object({ path: z.string().optional() }) })
      ])
    )
    .min(1),
  provenance: z.any().optional()
});

type ExecutionResult = {
  action_id: string;
  status: "completed" | "failed";
  steps: Array<{
    op: string;
    status: "success" | "failed";
    error?: string;
    screenshot?: string; // base64 for dry-run verification
  }>;
};

function getAllowlist(): string[] {
  const raw = process.env.ACTION_ALLOWLIST ?? "example.com,mail.google.com,accounts.google.com";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function executePlan(plan: z.infer<typeof ExecuteSchema>["plan"]): Promise<ExecutionResult["steps"]> {
  const steps: ExecutionResult["steps"] = [];
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 }
    });
    page = await context.newPage();

    for (const step of plan) {
      try {
        switch (step.op) {
          case "open_url":
            await page.goto(step.args.url, { waitUntil: "domcontentloaded", timeout: 30000 });
            steps.push({ op: step.op, status: "success" });
            break;

          case "type_text":
            await page.fill(step.args.selector, step.args.text);
            steps.push({ op: step.op, status: "success" });
            break;

          case "click":
            await page.click(step.args.selector);
            steps.push({ op: step.op, status: "success" });
            break;

          case "wait":
            await page.waitForTimeout(step.args.ms);
            steps.push({ op: step.op, status: "success" });
            break;

          case "screenshot":
            const buffer = await page.screenshot({ fullPage: false });
            const base64 = buffer.toString("base64");
            steps.push({
              op: step.op,
              status: "success",
              screenshot: `data:image/png;base64,${base64}`
            });
            break;
        }
      } catch (error: any) {
        steps.push({
          op: step.op,
          status: "failed",
          error: error.message || "Unknown error"
        });
      }
    }
  } catch (error: any) {
    // If browser setup fails, mark all steps as failed
    for (const step of plan) {
      steps.push({
        op: step.op,
        status: "failed",
        error: `Browser error: ${error.message}`
      });
    }
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }

  return steps;
}

const app = express();
app.use(express.json());

app.post("/action/v1/execute", async (req: Request, res: Response) => {
  const parsed = ExecuteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const plan = parsed.data.plan;
  const allowlist = new Set(getAllowlist());

  // Validate each step against allowlist constraints
  for (const step of plan) {
    if (step.op === "open_url") {
      try {
        const u = new URL(step.args.url);
        const host = u.hostname.toLowerCase();
        if (!allowlist.has(host)) {
          return res.status(403).json({
            error: "domain_not_allowlisted",
            host,
            allowlist: Array.from(allowlist)
          });
        }
      } catch (e: any) {
        return res.status(400).json({ error: "invalid_url", detail: e?.message });
      }
    }
  }

  // Execute the plan
  const steps = await executePlan(plan);
  const status = steps.every(s => s.status === "success") ? "completed" : "failed";

  return res.status(200).json({
    action_id: `act_${Date.now()}`,
    status,
    steps
  });
});

const PORT = process.env.PORT || 4004;
app.listen(PORT, () => console.log(`[action] listening on ${PORT}`));
