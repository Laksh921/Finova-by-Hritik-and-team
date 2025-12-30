"use server";

import { supabase } from "../lib/supabase";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

export async function getCurrentBudget(accountId) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return { budget: null, currentExpenses: 0 };

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerkUserId", clerkUserId)
      .maybeSingle();

    if (!user) return { budget: null, currentExpenses: 0 };

    const { data: budget } = await supabase
      .from("budgets")
      .select("*")
      .eq("userId", user.id)
      .maybeSingle();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const { data: expenses } = await supabase
      .from("transactions")
      .select("amount")
      .eq("userId", user.id)
      .eq("type", "EXPENSE")
      .eq("accountId", accountId)
      .gte("date", startOfMonth.toISOString())
      .lte("date", endOfMonth.toISOString());

    const totalExpenses = expenses
      ? expenses.reduce((sum, t) => sum + t.amount, 0)
      : 0;

    return {
      budget: budget || null,
      currentExpenses: totalExpenses,
    };
  } catch {
    return { budget: null, currentExpenses: 0 };
  }
}

export async function updateBudget(amount) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) return { success: false };

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("clerkUserId", clerkUserId)
      .maybeSingle();

    if (!user) return { success: false };

    const { data: existingBudget } = await supabase
      .from("budgets")
      .select("id")
      .eq("userId", user.id)
      .maybeSingle();

    let budget;

    if (existingBudget) {
      const { data } = await supabase
        .from("budgets")
        .update({ amount })
        .eq("userId", user.id)
        .select()
        .maybeSingle();
      budget = data;
    } else {
      const { data } = await supabase
        .from("budgets")
        .insert({
          userId: user.id,
          amount,
        })
        .select()
        .maybeSingle();
      budget = data;
    }

    revalidatePath("/dashboard");

    return { success: true, data: budget };
  } catch {
    return { success: false };
  }
}
