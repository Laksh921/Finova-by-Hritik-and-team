"use server";

import { supabase } from "../lib/supabase";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

export async function getAccountWithTransactions(accountId) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) throw new Error("Unauthorized");

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("clerkUserId", clerkUserId)
    .single();

  if (!user) throw new Error("User not found");

  const { data: account } = await supabase
    .from("accounts")
    .select(
      `
      *,
      transactions (*)
    `
    )
    .eq("id", accountId)
    .eq("userId", user.id)
    .single();

  if (!account) return null;

  account.transactions.sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  return {
    ...account,
    _count: {
      transactions: account.transactions.length,
    },
  };
}

export async function bulkDeleteTransactions(transactionIds) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) throw new Error("Unauthorized");

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerkUserId", clerkUserId)
      .single();

    if (!user) throw new Error("User not found");

    const { data: transactions } = await supabase
      .from("transactions")
      .select("id, type, amount, accountId")
      .in("id", transactionIds)
      .eq("userId", user.id);

    const accountBalanceChanges = transactions.reduce((acc, transaction) => {
      const change =
        transaction.type === "EXPENSE"
          ? transaction.amount
          : -transaction.amount;

      acc[transaction.accountId] =
        (acc[transaction.accountId] || 0) + change;

      return acc;
    }, {});

    await supabase
      .from("transactions")
      .delete()
      .in("id", transactionIds)
      .eq("userId", user.id);

    for (const [accountId, balanceChange] of Object.entries(
      accountBalanceChanges
    )) {
      await supabase.rpc("increment_account_balance", {
        account_id: accountId,
        balance_change: balanceChange,
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/account/[id]");

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function updateDefaultAccount(accountId) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) throw new Error("Unauthorized");

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerkUserId", clerkUserId)
      .single();

    if (!user) throw new Error("User not found");

    await supabase
      .from("accounts")
      .update({ isDefault: false })
      .eq("userId", user.id)
      .eq("isDefault", true);

    const { data: account } = await supabase
      .from("accounts")
      .update({ isDefault: true })
      .eq("id", accountId)
      .eq("userId", user.id)
      .select()
      .single();

    revalidatePath("/dashboard");

    return { success: true, data: account };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
