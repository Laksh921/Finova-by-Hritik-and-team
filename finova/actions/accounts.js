"use server";

import { supabase } from "../lib/supabase";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

export async function getAccountWithTransactions(accountId) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return null;

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerkUserId", clerkUserId)
      .maybeSingle();

    if (!user) return null;

    const { data: account } = await supabase
      .from("accounts")
      .select(`*, transactions (*)`)
      .eq("id", accountId)
      .eq("userId", user.id)
      .maybeSingle();

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
  } catch {
    return null;
  }
}

export async function bulkDeleteTransactions(transactionIds) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return { success: false };

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerkUserId", clerkUserId)
      .maybeSingle();

    if (!user) return { success: false };

    const { data: transactions } = await supabase
      .from("transactions")
      .select("id, type, amount, accountId")
      .in("id", transactionIds)
      .eq("userId", user.id);

    if (!transactions?.length) return { success: true };

    const accountBalanceChanges = transactions.reduce((acc, t) => {
      const change = t.type === "EXPENSE" ? t.amount : -t.amount;
      acc[t.accountId] = (acc[t.accountId] || 0) + change;
      return acc;
    }, {});

    await supabase
      .from("transactions")
      .delete()
      .in("id", transactionIds)
      .eq("userId", user.id);

    await Promise.all(
      Object.entries(accountBalanceChanges).map(([accountId, balanceChange]) =>
        supabase.rpc("increment_account_balance", {
          account_id: accountId,
          balance_change: balanceChange,
        })
      )
    );

    revalidatePath("/dashboard");
    revalidatePath("/account/[id]");

    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function updateDefaultAccount(accountId) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return { success: false };

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerkUserId", clerkUserId)
      .maybeSingle();

    if (!user) return { success: false };

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
      .maybeSingle();

    revalidatePath("/dashboard");

    return { success: true, data: account };
  } catch {
    return { success: false };
  }
}
