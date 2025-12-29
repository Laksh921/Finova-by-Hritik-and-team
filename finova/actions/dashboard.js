"use server";

import aj from "@/lib/arcjet";
import { supabase } from "../lib/supabase";
import { request } from "@arcjet/next";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

const serializeTransaction = (obj) => ({
  ...obj,
  balance: obj.balance ?? obj.balance,
  amount: obj.amount ?? obj.amount,
});

export async function getUserAccounts() {
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

  const { data: accounts } = await supabase
    .from("accounts")
    .select(
      `
      *,
      transactions(count)
    `
    )
    .eq("userId", user.id)
    .order("createdAt", { ascending: false });

  return accounts.map((account) => ({
    ...account,
    _count: {
      transactions: account.transactions[0]?.count || 0,
    },
  }));
}

export async function createAccount(data) {
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

    if (!user) {
      throw new Error("User not found");
    }

    const balanceFloat = parseFloat(data.balance);
    if (isNaN(balanceFloat)) {
      throw new Error("Invalid balance amount");
    }

    const { data: existingAccounts } = await supabase
      .from("accounts")
      .select("id")
      .eq("userId", user.id);

    const shouldBeDefault =
      existingAccounts.length === 0 ? true : data.isDefault;

    if (shouldBeDefault) {
      await supabase
        .from("accounts")
        .update({ isDefault: false })
        .eq("userId", user.id)
        .eq("isDefault", true);
    }

    const { data: account } = await supabase
      .from("accounts")
      .insert({
        ...data,
        balance: balanceFloat,
        userId: user.id,
        isDefault: shouldBeDefault,
      })
      .select()
      .single();

    revalidatePath("/dashboard");
    return { success: true, data: account };
  } catch (error) {
    throw new Error(error.message);
  }
}

export async function getDashboardData() {
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

  const { data: transactions } = await supabase
    .from("transactions")
    .select("*")
    .eq("userId", user.id)
    .order("date", { ascending: false });

  return transactions;
}
