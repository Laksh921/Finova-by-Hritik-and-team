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
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) throw new Error("Unauthorized");

    const req = await request();

    const decision = await aj.protect(req, {
      userId: clerkUserId,
      requested: 1,
    });

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        throw new Error("Too many requests. Please try again later.");
      }
      throw new Error("Request blocked");
    }

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerkUserId", clerkUserId)
      .single();

    if (!user) throw new Error("User not found");

    const { data: account } = await supabase
      .from("accounts")
      .select("id, balance")
      .eq("id", data.accountId)
      .eq("userId", user.id)
      .single();

    if (!account) throw new Error("Account not found");

    const balanceChange =
      data.type === "EXPENSE" ? -data.amount : data.amount;

    const nextRecurringDate =
      data.isRecurring && data.recurringInterval
        ? calculateNextRecurringDate(data.date, data.recurringInterval)
        : null;

    const { data: transaction } = await supabase
      .from("transactions")
      .insert({
        ...data,
        userId: user.id,
        nextRecurringDate,
      })
      .select()
      .single();

    await supabase.rpc("increment_account_balance", {
      account_id: data.accountId,
      balance_change: balanceChange,
    });

    revalidatePath("/dashboard");
    revalidatePath(`/account/${transaction.accountId}`);

    return { success: true, data: serializeAmount(transaction) };
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function getTransaction(id) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) throw new Error("Unauthorized");

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("clerkUserId", clerkUserId)
    .single();

  if (!user) throw new Error("User not found");

  const { data: transaction } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .eq("userId", user.id)
    .single();

  if (!transaction) throw new Error("Transaction not found");

  return serializeAmount(transaction);
}

export async function updateTransaction(id, data) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) throw new Error("Unauthorized");

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerkUserId", clerkUserId)
      .single();

    if (!user) throw new Error("User not found");

    const { data: originalTransaction } = await supabase
      .from("transactions")
      .select("id, type, amount, accountId")
      .eq("id", id)
      .eq("userId", user.id)
      .single();

    if (!originalTransaction)
      throw new Error("Transaction not found");

    const oldBalanceChange =
      originalTransaction.type === "EXPENSE"
        ? -originalTransaction.amount
        : originalTransaction.amount;

    const newBalanceChange =
      data.type === "EXPENSE" ? -data.amount : data.amount;

    const netBalanceChange = newBalanceChange - oldBalanceChange;

    const nextRecurringDate =
      data.isRecurring && data.recurringInterval
        ? calculateNextRecurringDate(data.date, data.recurringInterval)
        : null;

    const { data: transaction } = await supabase
      .from("transactions")
      .update({
        ...data,
        nextRecurringDate,
      })
      .eq("id", id)
      .eq("userId", user.id)
      .select()
      .single();

    await supabase.rpc("increment_account_balance", {
      account_id: data.accountId,
      balance_change: netBalanceChange,
    });

    revalidatePath("/dashboard");
    revalidatePath(`/account/${data.accountId}`);

    return { success: true, data: serializeAmount(transaction) };
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function getUserTransactions(query = {}) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) throw new Error("Unauthorized");

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerkUserId", clerkUserId)
      .single();

    if (!user) {
      throw new Error("User not found");
    }

    let supabaseQuery = supabase
      .from("transactions")
      .select("*, account:accounts(*)")
      .eq("userId", user.id)
      .order("date", { ascending: false });

    Object.entries(query).forEach(([key, value]) => {
      supabaseQuery = supabaseQuery.eq(key, value);
    });

    const { data: transactions } = await supabaseQuery;

    return { success: true, data: transactions };
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function scanReceipt(file) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const arrayBuffer = await file.arrayBuffer();
    const base64String = Buffer.from(arrayBuffer).toString("base64");

    const prompt = `
      Analyze this receipt image and extract the following information in JSON format:
      - Total amount (just the number)
      - Date (in ISO format)
      - Description or items purchased (brief summary)
      - Merchant/store name
      - Suggested category (one of: housing,transportation,groceries,utilities,entertainment,food,shopping,healthcare,education,personal,travel,insurance,gifts,bills,other-expense )
      
      Only respond with valid JSON in this exact format:
      {
        "amount": number,
        "date": "ISO date string",
        "description": "string",
        "merchantName": "string",
        "category": "string"
      }

      If its not a recipt, return an empty object
    `;

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64String,
          mimeType: file.type,
        },
      },
      prompt,
    ]);

    const response = await result.response;
    const text = response.text();
    const cleanedText = text.replace(/```(?:json)?\n?/g, "").trim();

    const parsed = JSON.parse(cleanedText);

    return {
      amount: parseFloat(parsed.amount),
      date: new Date(parsed.date),
      description: parsed.description,
      category: parsed.category,
      merchantName: parsed.merchantName,
    };
  } catch (error) {
    throw new Error("Failed to scan receipt");
  }
}

function calculateNextRecurringDate(startDate, interval) {
  const date = new Date(startDate);

  switch (interval) {
    case "DAILY":
      date.setDate(date.getDate() + 1);
      break;
    case "WEEKLY":
      date.setDate(date.getDate() + 7);
      break;
    case "MONTHLY":
      date.setMonth(date.getMonth() + 1);
      break;
    case "YEARLY":
      date.setFullYear(date.getFullYear() + 1);
      break;
  }

  return date;
}
