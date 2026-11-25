import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createHttpServer } from "node:http";
import express from "express";
import { Pool } from "pg";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { createServer as createViteServer } from "vite";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 5000);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to start the budget settings API.");
}

const pool = new Pool({ connectionString: databaseUrl });
await pool.query("SELECT settings, revision FROM budget_preferences LIMIT 0");
const app = express();
const server = createHttpServer(app);
app.set("trust proxy", 1);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(express.json({ limit: "512kb" }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

function requireAuth(req, res, next) {
  const userId = getAuth(req)?.userId;
  if (!userId) return res.status(401).json({ error: "Sign in to sync settings." });
  req.userId = userId;
  next();
}

function validBudgetId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function validSnapshot(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    value.id.length <= 128 &&
    (value.parentId === null || typeof value.parentId === "string") &&
    typeof value.date === "string" &&
    typeof value.payee === "string" &&
    value.payee.length <= 500 &&
    typeof value.memo === "string" &&
    value.memo.length <= 2000 &&
    Number.isSafeInteger(value.amount) &&
    value.amount >= 0
  );
}

function validOverride(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const numeric = [
    "target",
    "currentMonthly",
    "billAmount",
    "saved",
    "expectedAnnual",
    "savingsMonthly",
  ];
  for (const key of numeric) {
    if (
      Object.hasOwn(value, key) &&
      !(Number.isFinite(value[key]) && value[key] >= 0) &&
      !(value[key] === null && key !== "target")
    )
      return false;
  }
  if (
    value.fundingType !== undefined &&
    !["monthly", "annual", "irregular", "savings", "oneoff"].includes(
      value.fundingType,
    )
  )
    return false;
  if (
    (value.oneOff !== undefined && typeof value.oneOff !== "boolean") ||
    (value.done !== undefined && typeof value.done !== "boolean") ||
    (value.fixedBill !== undefined && typeof value.fixedBill !== "boolean") ||
    (value.dueDate !== undefined &&
      typeof value.dueDate !== "string" &&
      value.dueDate !== null)
  )
    return false;
  if (
    value.excludedMonths !== undefined &&
    (!Array.isArray(value.excludedMonths) ||
      value.excludedMonths.length > 120 ||
      value.excludedMonths.some(
        (month) => typeof month !== "string" || month.length > 10,
      ))
  )
    return false;
  if (value.exclusionReasons !== undefined) {
    if (
      !value.exclusionReasons ||
      typeof value.exclusionReasons !== "object" ||
      Array.isArray(value.exclusionReasons)
    )
      return false;
    if (
      Object.values(value.exclusionReasons).some(
        (reason) => typeof reason !== "string" || reason.length > 1000,
      )
    )
      return false;
  }
  return Object.keys(value).length <= 13;
}

function validSettings(value) {
  if (!value || typeof value !== "object" || value.version !== 1) return false;
  const { plan, sortOrder, reimbursements } = value;
  if (
    !plan ||
    typeof plan !== "object" ||
    !plan.overrides ||
    typeof plan.overrides !== "object" ||
    Array.isArray(plan.overrides) ||
    !Number.isFinite(plan.annualReserve) ||
    plan.annualReserve < 0 ||
    typeof plan.incomeInput !== "string" ||
    plan.incomeInput.length > 50
  )
    return false;
  const enteredIncome = plan.incomeInput.trim();
  if (
    enteredIncome &&
    (!Number.isFinite(Number(enteredIncome)) || Number(enteredIncome) < 0)
  )
    return false;
  const overrides = Object.entries(plan.overrides);
  if (
    overrides.length > 2000 ||
    overrides.some(
      ([id, override]) => id.length > 128 || !validOverride(override),
    )
  )
    return false;
  if (
    !Array.isArray(sortOrder) ||
    sortOrder.length > 300 ||
    sortOrder.some((id) => typeof id !== "string" || id.length > 128)
  )
    return false;
  if (
    !reimbursements ||
    typeof reimbursements !== "object" ||
    reimbursements.version !== 1 ||
    !Array.isArray(reimbursements.matches) ||
    reimbursements.matches.length > 1000 ||
    typeof reimbursements.startDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(reimbursements.startDate) ||
    !reimbursements.ignored ||
    typeof reimbursements.ignored !== "object" ||
    Array.isArray(reimbursements.ignored) ||
    Object.keys(reimbursements.ignored).length > 2000
  )
    return false;
  if (
    reimbursements.categoryIds !== null &&
    (!Array.isArray(reimbursements.categoryIds) ||
      reimbursements.categoryIds.length > 100 ||
      reimbursements.categoryIds.some(
        (id) => typeof id !== "string" || id.length > 128,
      ))
  )
    return false;
  for (const match of reimbursements.matches) {
    if (
      !match ||
      typeof match.id !== "string" ||
      match.id.length > 128 ||
      typeof match.createdAt !== "string" ||
      !Array.isArray(match.allocations) ||
      match.allocations.length > 1000 ||
      match.allocations.some(
        (allocation) =>
          !allocation ||
          !validSnapshot(allocation.outflow) ||
          !validSnapshot(allocation.inflow) ||
          !Number.isSafeInteger(allocation.amount) ||
          allocation.amount <= 0,
      )
    )
      return false;
  }
  for (const [id, entry] of Object.entries(reimbursements.ignored)) {
    if (
      id.length > 128 ||
      !entry ||
      !validSnapshot(entry.tx) ||
      typeof entry.note !== "string" ||
      entry.note.length > 2000 ||
      typeof entry.at !== "string"
    )
      return false;
  }
  return true;
}

function record(row) {
  return { settings: row?.settings ?? null, revision: row?.revision ?? null };
}

app.get("/api/preferences/:budgetId", requireAuth, async (req, res, next) => {
  if (!validBudgetId(req.params.budgetId))
    return res.status(400).json({ error: "Invalid budget ID." });
  try {
    const result = await pool.query(
      "SELECT settings, revision FROM budget_preferences WHERE user_id = $1 AND budget_id = $2",
      [req.userId, req.params.budgetId],
    );
    res.json(record(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

app.put("/api/preferences/:budgetId", requireAuth, async (req, res, next) => {
  if (!validBudgetId(req.params.budgetId))
    return res.status(400).json({ error: "Invalid budget ID." });
  const { settings, expectedRevision } = req.body ?? {};
  if (
    !validSettings(settings) ||
    !(
      expectedRevision === null ||
      (Number.isSafeInteger(expectedRevision) && expectedRevision > 0)
    )
  )
    return res.status(400).json({ error: "Invalid saved settings." });

  try {
    if (expectedRevision === null) {
      const inserted = await pool.query(
        `INSERT INTO budget_preferences (user_id, budget_id, settings)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (user_id, budget_id) DO NOTHING
         RETURNING settings, revision`,
        [req.userId, req.params.budgetId, JSON.stringify(settings)],
      );
      if (inserted.rowCount) return res.status(201).json(record(inserted.rows[0]));
    } else {
      const updated = await pool.query(
        `UPDATE budget_preferences
         SET settings = $3::jsonb, revision = revision + 1, updated_at = NOW()
         WHERE user_id = $1 AND budget_id = $2 AND revision = $4
         RETURNING settings, revision`,
        [
          req.userId,
          req.params.budgetId,
          JSON.stringify(settings),
          expectedRevision,
        ],
      );
      if (updated.rowCount) return res.json(record(updated.rows[0]));
    }

    const latest = await pool.query(
      "SELECT settings, revision FROM budget_preferences WHERE user_id = $1 AND budget_id = $2",
      [req.userId, req.params.budgetId],
    );
    return res.status(409).json({
      ...record(latest.rows[0]),
      error: "These settings changed in another session.",
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));
app.use((error, _req, res, _next) => {
  console.error("Application request failed:", error);
  res.status(500).json({ error: "The app could not sync your saved settings." });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(root, "dist"), { index: false }));
  app.get("*", (_req, res) => res.sendFile(path.join(root, "dist", "index.html")));
} else {
  const vite = await createViteServer({
    root,
    configFile: path.join(root, "vite.config.ts"),
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

server.listen(port, "0.0.0.0", () => {
  console.log(`Budget clarity listening on port ${port}`);
});

async function shutdown() {
  server.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
