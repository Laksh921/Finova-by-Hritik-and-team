"use server";

import { auth } from "@clerk/nextjs/server";
import { supabase } from "../lib/supabase";
import { revalidatePath } from "next/cache";
import { GoogleGenerativeAI } from "@google/generative-ai";
import aj from "@/lib/arcjet";
import { request } from "@arcjet/next";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const serializeAmount = (obj) => ({
  ...obj,
  amount: obj.amount,
});

export async function createTransaction(data) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return { success: false, error: "Unauthorized" };

  try {
    const req = await request();

    const decision = await aj.protect(req, {
      userId: clerkUserId,
      requested: 1,
    });

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        return { success: false, error: "Too many requests. Try again later." };
      }
      return { success: false, error: "Request blocked" };
    }

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerkUserId", clerkUserId)
      .maybeSingle();

    if (!user) return { success: false, error: "User not found" };

    const { data: account } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", data.accountId)
      .eq("userId", user.id)
      .maybeSingle();

    if (!account) return { success: false, error: "Account not found" };

    const balanceChange =
      data.type === "EXPENSE" ? -data.amount : data.amount;

    const nextRecurringDate =
      data.isRecurring && data.recurringInterval
        ? calculateNextRecurringDate(data.date, data.recurringInterval)
        : null;

    const { data: transaction, error: insertError } = await supabase
      .from("transactions")
      .insert({
        ...data,
        userId: user.id,
        nextRecurringDate,
      })
      .select()
      .single();

    if (insertError) {
      return { success: false, error: insertError.message };
    }

    await supabase.rpc("increment_account_balance", {
      account_id: data.accountId,
      balance_change: balanceChange,
    });

    revalidatePath("/dashboard");
    revalidatePath(`/account/${transaction.accountId}`);

    return { success: true, data: serializeAmount(transaction) };
  } catch {
    return { success: false, error: "Failed to create transaction" };
  }
}

export async function getTransaction(id) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("clerkUserId", clerkUserId)
    .maybeSingle();

  if (!user) return null;

  const { data: transaction } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .eq("userId", user.id)
    .maybeSingle();

  if (!transaction) return null;

  return serializeAmount(transaction);
}

export async function updateTransaction(id, data) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return { success: false, error: "Unauthorized" };

  try {
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerkUserId", clerkUserId)
      .maybeSingle();

    if (!user) return { success: false, error: "User not found" };

    const { data: original } = await supabase
      .from("transactions")
      .select("type, amount, accountId")
      .eq("id", id)
      .eq("userId", user.id)
      .maybeSingle();

    if (!original) {
      return { success: false, error: "Transaction not found" };
    }

    const oldChange =
      original.type === "EXPENSE" ? -original.amount : original.amount;

    const newChange =
      data.type === "EXPENSE" ? -data.amount : data.amount;

    const netChange = newChange - oldChange;

    const nextRecurringDate =
      data.isRecurring && data.recurringInterval
        ? calculateNextRecurringDate(data.date, data.recurringInterval)
        : null;

    const { data: updated, error } = await supabase
      .from("transactions")
      .update({
        ...data,
        nextRecurringDate,
      })
      .eq("id", id)
      .eq("userId", user.id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    await supabase.rpc("increment_account_balance", {
      account_id: data.accountId,
      balance_change: netChange,
    });

    revalidatePath("/dashboard");
    revalidatePath(`/account/${data.accountId}`);

    return { success: true, data: serializeAmount(updated) };
  } catch {
    return { success: false, error: "Failed to update transaction" };
  }
}

export async function getUserTransactions(query = {}) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return { success: false, data: [] };

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("clerkUserId", clerkUserId)
    .maybeSingle();

  if (!user) return { success: false, data: [] };

  let q = supabase
    .from("transactions")
    .select("*, account:accounts(*)")
    .eq("userId", user.id)
    .order("date", { ascending: false });

  Object.entries(query).forEach(([k, v]) => {
    q = q.eq(k, v);
  });

  const { data } = await q;
  return { success: true, data: data || [] };
}

export async function scanReceipt(file) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64,
          mimeType: file.type,
        },
      },
      `
      Analyze this receipt and return JSON:
      {
        "amount": number,
        "date": "ISO string",
        "description": "string",
        "merchantName": "string",
        "category": "string"
      }
      `,
    ]);

    const text = result.response.text().replace(/```(?:json)?/g, "").trim();
    const parsed = JSON.parse(text);

    if (!parsed.amount || !parsed.date) return null;

    return {
      amount: Number(parsed.amount),
      date: new Date(parsed.date),
      description: parsed.description || "",
      category: parsed.category || "other-expense",
      merchantName: parsed.merchantName || "",
    };
  } catch {
    return null;
  }
}

function calculateNextRecurringDate(startDate, interval) {
  const date = new Date(startDate);
  if (interval === "DAILY") date.setDate(date.getDate() + 1);
  if (interval === "WEEKLY") date.setDate(date.getDate() + 7);
  if (interval === "MONTHLY") date.setMonth(date.getMonth() + 1);
  if (interval === "YEARLY") date.setFullYear(date.getFullYear() + 1);
  return date;
}
