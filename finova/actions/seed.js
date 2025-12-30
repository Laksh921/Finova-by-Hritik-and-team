"use server";

import { supabase } from "../lib/supabase";
import { subDays } from "date-fns";

const ACCOUNT_ID = "account-id";
const USER_ID = "user-id";

const CATEGORIES = {
  INCOME: [
    { name: "salary", range: [5000, 8000] },
    { name: "freelance", range: [1000, 3000] },
    { name: "investments", range: [500, 2000] },
    { name: "other-income", range: [100, 1000] },
  ],
  EXPENSE: [
    { name: "housing", range: [1000, 2000] },
    { name: "transportation", range: [100, 500] },
    { name: "groceries", range: [200, 600] },
    { name: "utilities", range: [100, 300] },
    { name: "entertainment", range: [50, 200] },
    { name: "food", range: [50, 150] },
    { name: "shopping", range: [100, 500] },
    { name: "healthcare", range: [100, 1000] },
    { name: "education", range: [200, 1000] },
    { name: "travel", range: [500, 2000] },
  ],
};

function getRandomAmount(min, max) {
  return Number((Math.random() * (max - min) + min).toFixed(2));
}

function getRandomCategory(type) {
  const category = CATEGORIES[type][
    Math.floor(Math.random() * CATEGORIES[type].length)
  ];
  return {
    category: category.name,
    amount: getRandomAmount(category.range[0], category.range[1]),
  };
}

export async function seedTransactions() {
  const transactions = [];
  let totalBalance = 0;

  for (let i = 90; i >= 0; i--) {
    const date = subDays(new Date(), i).toISOString();
    const count = Math.floor(Math.random() * 3) + 1;

    for (let j = 0; j < count; j++) {
      const type = Math.random() < 0.4 ? "INCOME" : "EXPENSE";
      const { category, amount } = getRandomCategory(type);

      totalBalance += type === "INCOME" ? amount : -amount;

      transactions.push({
        type,
        amount,
        description: `${type === "INCOME" ? "Received" : "Paid for"} ${category}`,
        date,
        category,
        status: "COMPLETED",
        userId: USER_ID,
        accountId: ACCOUNT_ID,
      });
    }
  }

  const { error: deleteError } = await supabase
    .from("transactions")
    .delete()
    .eq("accountId", ACCOUNT_ID);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  const batchSize = 500;
  for (let i = 0; i < transactions.length; i += batchSize) {
    const { error } = await supabase
      .from("transactions")
      .insert(transactions.slice(i, i + batchSize));

    if (error) {
      return { success: false, error: error.message };
    }
  }

  const { error: balanceError } = await supabase
    .from("accounts")
    .update({ balance: totalBalance })
    .eq("id", ACCOUNT_ID);

  if (balanceError) {
    return { success: false, error: balanceError.message };
  }

  return {
    success: true,
    message: `Created ${transactions.length} transactions`,
  };
}
