import { sql } from "drizzle-orm";
import { db } from "$/db";
import {
  accountsTable,
  budgetsTable,
  eventsTable,
  goalContributionsTable,
  goalsTable,
  type InsertTransaction,
  recurringRulesTable,
  type SelectAccount,
  transactionsTable,
  transfersTable,
  usersTable,
} from "$/db/schema";
import { seedDefaultCategories } from "$/lib/services/default-categories";
import { toPaise } from "$/lib/utils/money";
import { addDays, addMonths, today } from "$/lib/utils/period";
import { seedSplits } from "./split-data";

// Safety check: prevent accidental seeding on production.
const isProduction =
  process.env.NODE_ENV === "production" ||
  process.env.DATABASE_URL?.includes("production");
if (isProduction && process.env.FORCE_SEED !== "true") {
  console.error("❌ SEED BLOCKED: Cannot run seed on production database!");
  process.exit(1);
}

const DEMO_EMAIL = "demo@finance.local";
const DEMO_PASSWORD = "Demo@1234";

/** Deterministic pseudo-random so every seed produces the same data. */
let s = 42;
const rand = () => {
  s = (s * 16807) % 2147483647;
  return (s - 1) / 2147483646;
};
const between = (min: number, max: number) =>
  Math.round(min + rand() * (max - min));

async function mainSeed() {
  console.info("🌱 Seeding (this wipes existing data)...");
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      truncate table goal_contributions, goals, budgets, transactions,
        transfers, split_shares, settlements, splits, split_group_members,
        split_groups, people, events, recurring_rules, accounts, categories,
        email_otps, auths, users
      restart identity cascade
    `);

    const [user] = await tx
      .insert(usersTable)
      .values({
        name: "Demo User",
        email: DEMO_EMAIL,
        passwordHash: await Bun.password.hash(DEMO_PASSWORD),
        monthlyBudget: toPaise(75_000),
      })
      .returning();
    if (!user) throw new Error("user seed failed");

    const cats = await seedDefaultCategories(tx, user.id);
    const cat = (name: string) => {
      const c = cats.find((x) => x.name === name);
      if (!c) throw new Error(`missing category ${name}`);
      return c.id;
    };

    const end = today();
    const start = addDays(`${addMonths(end, -3).slice(0, 7)}-01`, 0);

    const [hdfc, cash, card, paytm] = (await tx
      .insert(accountsTable)
      .values([
        {
          userId: user.id,
          name: "HDFC Bank",
          type: "bank",
          icon: "landmark",
          color: "#2563eb",
          openingBalance: toPaise(45_000),
          isDefault: true,
        },
        {
          userId: user.id,
          name: "Cash",
          type: "cash",
          icon: "banknote",
          color: "#16a34a",
          openingBalance: toPaise(3_000),
        },
        {
          userId: user.id,
          name: "SBI Credit Card",
          type: "credit_card",
          icon: "credit-card",
          color: "#7c3aed",
          openingBalance: 0,
        },
        {
          userId: user.id,
          name: "Paytm Wallet",
          type: "wallet",
          icon: "wallet",
          color: "#0ea5e9",
          openingBalance: toPaise(1_500),
        },
      ])
      .returning()) as [
      SelectAccount,
      SelectAccount,
      SelectAccount,
      SelectAccount,
    ];
    /** Cash payments come from the wallet of cash, card swipes from the credit card, the rest from HDFC. */
    const accountFor = (pm: InsertTransaction["paymentMethod"]) =>
      pm === "cash" ? cash.id : pm === "credit_card" ? card.id : hdfc.id;

    const txns: InsertTransaction[] = [];
    const add = (
      type: "credit" | "debit",
      name: string,
      rupees: number,
      date: string,
      paymentMethod: InsertTransaction["paymentMethod"],
      note?: string,
      extra?: Partial<InsertTransaction>,
    ) =>
      txns.push({
        userId: user.id,
        type,
        categoryId: cat(name),
        amount: toPaise(rupees),
        date,
        paymentMethod,
        accountId: accountFor(paymentMethod),
        note: note ?? null,
        ...extra,
      });

    // Events: a festival visit last week and the Goa trip (used by the split demo).
    const [mela, goaTrip] = await tx
      .insert(eventsTable)
      .values([
        {
          userId: user.id,
          name: "Diwali mela",
          icon: "party-popper",
          color: "#f97316",
          startDate: addDays(end, -9),
          endDate: addDays(end, -8),
          budget: toPaise(5_000),
        },
        {
          userId: user.id,
          name: "Goa trip",
          icon: "plane",
          color: "#0ea5e9",
          startDate: addDays(end, -6),
          endDate: addDays(end, -4),
          budget: toPaise(15_000),
        },
      ])
      .returning();
    const melaDay = addDays(end, -9);
    add(
      "debit",
      "Food & dining",
      640,
      melaDay,
      "cash",
      "Chaat & jalebi at the mela",
      { eventId: mela!.id },
    );
    add("debit", "Shopping", 2_400, melaDay, "upi", "Kurta for Diwali", {
      eventId: mela!.id,
    });
    add("debit", "Grocery", 1_150, melaDay, "upi", "Sweets & dry fruits", {
      eventId: mela!.id,
    });
    add("debit", "Entertainment", 300, melaDay, "cash", "Giant wheel & games", {
      eventId: mela!.id,
    });
    add(
      "debit",
      "Shopping",
      850,
      addDays(melaDay, 1),
      "upi",
      "Diyas & decorations",
      {
        eventId: mela!.id,
        accountId: paytm.id,
      },
    );

    for (let d = start; d <= end; d = addDays(d, 1)) {
      const dom = Number(d.slice(8, 10));
      if (dom === 1) {
        add("credit", "Salary", 85_000, d, "bank", "Monthly salary");
        add("debit", "Room rent", 18_000, d, "upi", "Flat rent");
      }
      if (dom === 5)
        add(
          "debit",
          "Bills & utilities",
          between(1800, 3200),
          d,
          "upi",
          "Electricity + internet",
        );
      if (dom === 10) add("debit", "EMI / Loan", 7_500, d, "bank", "Bike EMI");
      if (dom === 15 && rand() > 0.4)
        add(
          "credit",
          "Freelance",
          between(8_000, 20_000),
          d,
          "bank",
          "Website project",
        );
      if (dom % 4 === 0) add("debit", "Grocery", between(600, 2400), d, "upi");
      if (rand() > 0.35)
        add(
          "debit",
          "Food & dining",
          between(120, 900),
          d,
          rand() > 0.5 ? "upi" : "cash",
        );
      if (rand() > 0.85) add("debit", "Travel", between(150, 2500), d, "upi");
      if (rand() > 0.9)
        add("debit", "Shopping", between(700, 5000), d, "credit_card");
      if (rand() > 0.93) add("debit", "Medical", between(250, 1800), d, "cash");
      if (dom % 9 === 0)
        add("debit", "Fuel", between(500, 1500), d, "debit_card");
      if (rand() > 0.94)
        add("debit", "Entertainment", between(200, 1200), d, "upi");
    }
    await tx.insert(transactionsTable).values(txns);

    // Monthly ATM withdrawal and credit-card bill payment.
    const transfers: (typeof transfersTable.$inferInsert)[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const dom = Number(d.slice(8, 10));
      if (dom === 3)
        transfers.push({
          userId: user.id,
          fromAccountId: hdfc.id,
          toAccountId: cash.id,
          amount: toPaise(9_000),
          date: d,
          note: "ATM withdrawal",
        });
      if (dom === 20)
        transfers.push({
          userId: user.id,
          fromAccountId: hdfc.id,
          toAccountId: card.id,
          amount: toPaise(6_000),
          date: d,
          note: "Credit card bill",
        });
    }
    if (transfers.length) await tx.insert(transfersTable).values(transfers);

    const nextFirst = `${addMonths(end, 1).slice(0, 7)}-01`;
    await tx.insert(recurringRulesTable).values([
      {
        userId: user.id,
        type: "credit",
        amount: toPaise(85_000),
        categoryId: cat("Salary"),
        accountId: hdfc.id,
        paymentMethod: "bank",
        note: "Monthly salary",
        frequency: "monthly",
        startDate: start,
        nextRunDate: nextFirst,
      },
      {
        userId: user.id,
        type: "debit",
        amount: toPaise(18_000),
        categoryId: cat("Room rent"),
        accountId: hdfc.id,
        paymentMethod: "upi",
        note: "Flat rent",
        frequency: "monthly",
        startDate: start,
        nextRunDate: nextFirst,
      },
    ]);

    await tx.insert(budgetsTable).values([
      {
        userId: user.id,
        categoryId: cat("Food & dining"),
        amount: toPaise(8_000),
      },
      { userId: user.id, categoryId: cat("Grocery"), amount: toPaise(6_000) },
      { userId: user.id, categoryId: cat("Shopping"), amount: toPaise(5_000) },
      { userId: user.id, categoryId: cat("Travel"), amount: toPaise(4_000) },
    ]);

    const [goal] = await tx
      .insert(goalsTable)
      .values({
        userId: user.id,
        name: "Emergency fund",
        target: toPaise(200_000),
        targetDate: addMonths(end, 10),
        color: "#10b981",
        icon: "shield",
      })
      .returning();
    await tx.insert(goalContributionsTable).values([
      { goalId: goal!.id, amount: toPaise(25_000), date: addDays(start, 2) },
      { goalId: goal!.id, amount: toPaise(15_000), date: addDays(start, 33) },
    ]);
    await seedSplits(tx, user.id, cat, end, goaTrip!.id);
    console.info(`Seeded ${txns.length} transactions + shared expenses`);
  });

  console.info("✅ Seed complete");
  console.info(`   Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  process.exit(0);
}

mainSeed().catch((e) => {
  console.error(e);
  process.exit(1);
});
