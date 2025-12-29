import { inngest } from "./client";
import { supabaseServer } from "@/lib/supabase-server";
import EmailTemplate from "@/emails/template";
import { sendEmail } from "@/actions/send-email";
import { GoogleGenerativeAI } from "@google/generative-ai";

/* ---------------------------------------------
   1. Process Recurring Transactions
--------------------------------------------- */

export const processRecurringTransaction = inngest.createFunction(
  {
    id: "process-recurring-transaction",
    name: "Process Recurring Transaction",
    throttle: {
      limit: 10,
      period: "1m",
      key: "event.data.userId",
    },
  },
  { event: "transaction.recurring.process" },
  async ({ event, step }) => {
    if (!event?.data?.transactionId || !event?.data?.userId) {
      return { error: "Invalid event data" };
    }

    await step.run("process-transaction", async () => {
      const { data: transaction } = await supabaseServer
        .from("transactions")
        .select("*, account:accounts(*)")
        .eq("id", event.data.transactionId)
        .eq("userId", event.data.userId)
        .single();

      if (!transaction || !isTransactionDue(transaction)) return;

      const amount =
        transaction.type === "EXPENSE"
          ? -Number(transaction.amount)
          : Number(transaction.amount);

      await supabaseServer.from("transactions").insert({
        type: transaction.type,
        amount: transaction.amount,
        description: `${transaction.description} (Recurring)`,
        date: new Date(),
        category: transaction.category,
        userId: transaction.userId,
        accountId: transaction.accountId,
        isRecurring: false,
      });

      await supabaseServer
        .from("accounts")
        .update({ balance: transaction.account.balance + amount })
        .eq("id", transaction.accountId);

      await supabaseServer
        .from("transactions")
        .update({
          lastProcessed: new Date(),
          nextRecurringDate: calculateNextRecurringDate(
            new Date(),
            transaction.recurringInterval
          ),
        })
        .eq("id", transaction.id);
    });
  }
);

/* ---------------------------------------------
   2. Trigger Recurring Transactions (Cron)
--------------------------------------------- */

export const triggerRecurringTransactions = inngest.createFunction(
  {
    id: "trigger-recurring-transactions",
    name: "Trigger Recurring Transactions",
  },
  { cron: "0 0 * * *" },
  async ({ step }) => {
    const { data: recurringTransactions } = await step.run(
      "fetch-recurring-transactions",
      async () =>
        await supabaseServer
          .from("transactions")
          .select("id, userId")
          .eq("isRecurring", true)
          .eq("status", "COMPLETED")
          .or("lastProcessed.is.null,nextRecurringDate.lte.now()")
    );

    if (!recurringTransactions?.length) return { triggered: 0 };

    await inngest.send(
      recurringTransactions.map((t) => ({
        name: "transaction.recurring.process",
        data: { transactionId: t.id, userId: t.userId },
      }))
    );

    return { triggered: recurringTransactions.length };
  }
);

/* ---------------------------------------------
   3. Monthly Reports
--------------------------------------------- */

export const generateMonthlyReports = inngest.createFunction(
  {
    id: "generate-monthly-reports",
    name: "Generate Monthly Reports",
  },
  { cron: "0 0 1 * *" },
  async ({ step }) => {
    const { data: users } = await step.run("fetch-users", async () =>
      supabaseServer.from("users").select("*")
    );

    for (const user of users ?? []) {
      await step.run(`report-${user.id}`, async () => {
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);

        const stats = await getMonthlyStats(user.id, lastMonth);
        const monthName = lastMonth.toLocaleString("default", {
          month: "long",
        });

        const insights = await generateFinancialInsights(stats, monthName);

        await sendEmail({
          to: user.email,
          subject: `Your Monthly Financial Report - ${monthName}`,
          react: EmailTemplate({
            userName: user.name,
            type: "monthly-report",
            data: { stats, month: monthName, insights },
          }),
        });
      });
    }

    return { processed: users?.length ?? 0 };
  }
);

/* ---------------------------------------------
   4. Budget Alerts
--------------------------------------------- */

export const checkBudgetAlerts = inngest.createFunction(
  { name: "Check Budget Alerts" },
  { cron: "0 */6 * * *" },
  async ({ step }) => {
    const { data: budgets } = await step.run("fetch-budgets", async () =>
      supabaseServer
        .from("budgets")
        .select("*, user:users(*, accounts:accounts(*))")
    );

    for (const budget of budgets ?? []) {
      const defaultAccount = budget.user.accounts.find((a) => a.isDefault);
      if (!defaultAccount) continue;

      await step.run(`budget-${budget.id}`, async () => {
        const startDate = new Date();
        startDate.setDate(1);

        const { data: expenses } = await supabaseServer
          .from("transactions")
          .select("amount")
          .eq("userId", budget.userId)
          .eq("accountId", defaultAccount.id)
          .eq("type", "EXPENSE")
          .gte("date", startDate);

        const totalExpenses =
          expenses?.reduce((s, e) => s + Number(e.amount), 0) ?? 0;

        const percentageUsed = (totalExpenses / budget.amount) * 100;

        if (percentageUsed >= 80 && isNewMonth(budget.lastAlertSent, new Date())) {
          await sendEmail({
            to: budget.user.email,
            subject: `Budget Alert for ${defaultAccount.name}`,
            react: EmailTemplate({
              userName: budget.user.name,
              type: "budget-alert",
              data: {
                percentageUsed,
                budgetAmount: budget.amount,
                totalExpenses,
                accountName: defaultAccount.name,
              },
            }),
          });

          await supabaseServer
            .from("budgets")
            .update({ lastAlertSent: new Date() })
            .eq("id", budget.id);
        }
      });
    }
  }
);

/* ---------------------------------------------
   Helpers
--------------------------------------------- */

function isTransactionDue(transaction) {
  if (!transaction.lastProcessed) return true;
  return new Date(transaction.nextRecurringDate) <= new Date();
}

function calculateNextRecurringDate(date, interval) {
  const next = new Date(date);
  if (interval === "DAILY") next.setDate(next.getDate() + 1);
  if (interval === "WEEKLY") next.setDate(next.getDate() + 7);
  if (interval === "MONTHLY") next.setMonth(next.getMonth() + 1);
  if (interval === "YEARLY") next.setFullYear(next.getFullYear() + 1);
  return next;
}

function isNewMonth(last, now) {
  if (!last) return true;
  return (
    new Date(last).getMonth() !== now.getMonth() ||
    new Date(last).getFullYear() !== now.getFullYear()
  );
}

async function getMonthlyStats(userId, month) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);

  const { data: transactions } = await supabaseServer
    .from("transactions")
    .select("*")
    .eq("userId", userId)
    .gte("date", start)
    .lte("date", end);

  return (transactions ?? []).reduce(
    (stats, t) => {
      const amount = Number(t.amount);
      if (t.type === "EXPENSE") {
        stats.totalExpenses += amount;
        stats.byCategory[t.category] =
          (stats.byCategory[t.category] || 0) + amount;
      } else {
        stats.totalIncome += amount;
      }
      return stats;
    },
    { totalExpenses: 0, totalIncome: 0, byCategory: {} }
  );
}

async function generateFinancialInsights(stats, month) {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Analyze finances for ${month}: ${JSON.stringify(stats)}`;
    const res = await model.generateContent(prompt);
    return JSON.parse(res.response.text().replace(/```/g, ""));
  } catch {
    return [
      "Track expenses closely this month.",
      "Consider optimizing your largest expense category.",
      "Try setting a savings goal for next month.",
    ];
  }
}
