-- AlterTable
ALTER TABLE "users" ADD COLUMN     "base_salary" INTEGER,
ADD COLUMN     "commission_rate" DECIMAL,
ADD COLUMN     "pay_type" TEXT NOT NULL DEFAULT 'mixed';

-- CreateTable
CREATE TABLE "commission_payments" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "side" TEXT NOT NULL,
    "payer_contact_id" UUID,
    "expected_amount" INTEGER NOT NULL,
    "actual_amount" INTEGER,
    "due_date" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "method" TEXT,
    "tax_invoice_status" TEXT NOT NULL DEFAULT 'none',
    "tax_invoice_no" TEXT,
    "tax_invoice_date" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "office_expense_templates" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "day_of_month" INTEGER,
    "tax_deductible" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "office_expense_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commission_payments_office_id_status_idx" ON "commission_payments"("office_id", "status");

-- CreateIndex
CREATE INDEX "commission_payments_office_id_due_date_idx" ON "commission_payments"("office_id", "due_date");

-- CreateIndex
CREATE INDEX "commission_payments_deal_id_idx" ON "commission_payments"("deal_id");

-- CreateIndex
CREATE INDEX "office_expense_templates_office_id_is_active_idx" ON "office_expense_templates"("office_id", "is_active");

-- AddForeignKey
ALTER TABLE "commission_payments" ADD CONSTRAINT "commission_payments_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payments" ADD CONSTRAINT "commission_payments_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_payments" ADD CONSTRAINT "commission_payments_payer_contact_id_fkey" FOREIGN KEY ("payer_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_expense_templates" ADD CONSTRAINT "office_expense_templates_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
