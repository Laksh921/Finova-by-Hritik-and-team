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
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return [];

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerkUserId", clerkUserId)
      .maybeSingle();

    if (!user) return [];

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

    if (!accounts) return [];

    return accounts.map((account) => ({
      ...account,
      _count: {
        transactions: account.transactions?.[0]?.count || 0,
      },
    }));
  } catch {
    return [];
  }
}

export async function createAccount(data) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return { success: false };

    const req = await request();

    const decision = await aj.protect(req, {
      userId: clerkUserId,
      requested: 1,
    });

    if (decision.isDenied()) {
      return { success: false, error: "Too many requests. Please try again later." };
    }

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerkUserId", clerkUserId)
      .maybeSingle();

    if (!user) return { success: false };

    const balanceFloat = parseFloat(data.balance);
    if (isNaN(balanceFloat)) return { success: false };

    const { data: existingAccounts } = await supabase
      .from("accounts")
      .select("id")
      .eq("userId", user.id);

    const shouldBeDefault =
      !existingAccounts || existingAccounts.length === 0
        ? true
        : data.isDefault;

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
      .maybeSingle();

    revalidatePath("/dashboard");

    return { success: true, data: account };
  } catch {
    return { success: false };
  }
}

export async function getDashboardData() {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return [];

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerkUserId", clerkUserId)
      .maybeSingle();

    if (!user) return [];

    const { data: transactions } = await supabase
      .from("transactions")
      .select("*")
      .eq("userId", user.id)
      .order("date", { ascending: false });

    return transactions || [];
  } catch {
    return [];
  }
}
