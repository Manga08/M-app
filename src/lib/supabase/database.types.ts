export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_entities: {
        Row: {
          archived: boolean
          archived_at: string | null
          color: string
          created_at: string
          icon: string
          id: string
          name: string
          sort_order: number
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          archived?: boolean
          archived_at?: string | null
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          archived?: boolean
          archived_at?: string | null
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      account_valuations: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          currency_code: string
          id: string
          note: string | null
          source: string
          updated_at: string
          user_id: string
          valued_on: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          currency_code: string
          id?: string
          note?: string | null
          source?: string
          updated_at?: string
          user_id: string
          valued_on: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          currency_code?: string
          id?: string
          note?: string | null
          source?: string
          updated_at?: string
          user_id?: string
          valued_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_valuations_user_id_account_id_fkey"
            columns: ["user_id", "account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_type: string
          archived: boolean
          archived_at: string | null
          color: string
          created_at: string
          currency_code: string
          entity_id: string | null
          expected_annual_return: number | null
          icon: string
          id: string
          initial_balance: number
          name: string
          opening_balance_date: string
          opening_exchange_rate: number | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          account_type: string
          archived?: boolean
          archived_at?: string | null
          color?: string
          created_at?: string
          currency_code?: string
          entity_id?: string | null
          expected_annual_return?: number | null
          icon?: string
          id?: string
          initial_balance?: number
          name: string
          opening_balance_date?: string
          opening_exchange_rate?: number | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          account_type?: string
          archived?: boolean
          archived_at?: string | null
          color?: string
          created_at?: string
          currency_code?: string
          entity_id?: string | null
          expected_annual_return?: number | null
          icon?: string
          id?: string
          initial_balance?: number
          name?: string
          opening_balance_date?: string
          opening_exchange_rate?: number | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "accounts_user_entity_fkey"
            columns: ["user_id", "entity_id"]
            isOneToOne: false
            referencedRelation: "account_entities"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          entity_id: string | null
          entity_type: string
          id: number
          next_data: Json | null
          occurred_at: string
          previous_data: Json | null
          user_id: string
        }
        Insert: {
          action: string
          entity_id?: string | null
          entity_type: string
          id?: never
          next_data?: Json | null
          occurred_at?: string
          previous_data?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          entity_id?: string | null
          entity_type?: string
          id?: never
          next_data?: Json | null
          occurred_at?: string
          previous_data?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          id: string
          month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          id?: string
          month: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          id?: string
          month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_owner_fkey"
            columns: ["user_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      categories: {
        Row: {
          archived: boolean
          category_group: string
          color: string
          created_at: string
          icon: string
          id: string
          is_default: boolean
          main_category_id: string | null
          name: string
          sort_order: number
          transaction_kind: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          category_group: string
          color: string
          created_at?: string
          icon?: string
          id?: string
          is_default?: boolean
          main_category_id?: string | null
          name: string
          sort_order?: number
          transaction_kind: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          category_group?: string
          color?: string
          created_at?: string
          icon?: string
          id?: string
          is_default?: boolean
          main_category_id?: string | null
          name?: string
          sort_order?: number
          transaction_kind?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_main_category_owner_fkey"
            columns: ["user_id", "main_category_id"]
            isOneToOne: false
            referencedRelation: "group_allocations"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "categories_main_category_owner_fkey"
            columns: ["user_id", "main_category_id"]
            isOneToOne: false
            referencedRelation: "main_categories"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      credit_card_installments: {
        Row: {
          created_at: string
          due_on: string
          estimated_fee: number
          estimated_interest: number
          id: string
          installment_number: number
          plan_id: string
          principal: number
          statement_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_on: string
          estimated_fee?: number
          estimated_interest?: number
          id?: string
          installment_number: number
          plan_id: string
          principal: number
          statement_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          due_on?: string
          estimated_fee?: number
          estimated_interest?: number
          id?: string
          installment_number?: number
          plan_id?: string
          principal?: number
          statement_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_installments_user_id_plan_id_fkey"
            columns: ["user_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "credit_card_purchase_plans"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "credit_card_installments_user_id_statement_id_fkey"
            columns: ["user_id", "statement_id"]
            isOneToOne: false
            referencedRelation: "credit_card_statements"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      credit_card_payment_allocations: {
        Row: {
          allocated_on: string
          amount: number
          created_at: string
          id: string
          statement_id: string
          transfer_group_id: string
          user_id: string
        }
        Insert: {
          allocated_on: string
          amount: number
          created_at?: string
          id?: string
          statement_id: string
          transfer_group_id: string
          user_id: string
        }
        Update: {
          allocated_on?: string
          amount?: number
          created_at?: string
          id?: string
          statement_id?: string
          transfer_group_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_payment_allocations_user_id_statement_id_fkey"
            columns: ["user_id", "statement_id"]
            isOneToOne: false
            referencedRelation: "credit_card_statements"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      credit_card_profiles: {
        Row: {
          account_id: string
          annual_fee: number
          cash_advance_rate_ea: number | null
          created_at: string
          credit_limit: number
          cutoff_day: number
          due_day: number
          last_four: string | null
          network: string
          purchase_rate_ea: number | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          account_id: string
          annual_fee?: number
          cash_advance_rate_ea?: number | null
          created_at?: string
          credit_limit: number
          cutoff_day: number
          due_day: number
          last_four?: string | null
          network?: string
          purchase_rate_ea?: number | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          account_id?: string
          annual_fee?: number
          cash_advance_rate_ea?: number | null
          created_at?: string
          credit_limit?: number
          cutoff_day?: number
          due_day?: number
          last_four?: string | null
          network?: string
          purchase_rate_ea?: number | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_profiles_liability_owner_fkey"
            columns: ["user_id", "account_id"]
            isOneToOne: false
            referencedRelation: "liabilities"
            referencedColumns: ["user_id", "account_id"]
          },
          {
            foreignKeyName: "credit_card_profiles_user_id_account_id_fkey"
            columns: ["user_id", "account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      credit_card_purchase_plans: {
        Row: {
          account_id: string
          annual_effective_rate: number | null
          created_at: string
          financing_type: string
          first_due_on: string
          id: string
          installment_count: number
          status: string
          transaction_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          annual_effective_rate?: number | null
          created_at?: string
          financing_type?: string
          first_due_on: string
          id?: string
          installment_count?: number
          status?: string
          transaction_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          annual_effective_rate?: number | null
          created_at?: string
          financing_type?: string
          first_due_on?: string
          id?: string
          installment_count?: number
          status?: string
          transaction_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_purchase_plans_user_id_account_id_fkey"
            columns: ["user_id", "account_id"]
            isOneToOne: false
            referencedRelation: "credit_card_profiles"
            referencedColumns: ["user_id", "account_id"]
          },
          {
            foreignKeyName: "credit_card_purchase_plans_user_id_transaction_id_fkey"
            columns: ["user_id", "transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      credit_card_rate_periods: {
        Row: {
          account_id: string
          annual_effective_rate: number
          created_at: string
          ends_on: string | null
          id: string
          rate_kind: string
          source: string
          starts_on: string
          user_id: string
        }
        Insert: {
          account_id: string
          annual_effective_rate: number
          created_at?: string
          ends_on?: string | null
          id?: string
          rate_kind: string
          source?: string
          starts_on: string
          user_id: string
        }
        Update: {
          account_id?: string
          annual_effective_rate?: number
          created_at?: string
          ends_on?: string | null
          id?: string
          rate_kind?: string
          source?: string
          starts_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_rate_periods_user_id_account_id_fkey"
            columns: ["user_id", "account_id"]
            isOneToOne: false
            referencedRelation: "credit_card_profiles"
            referencedColumns: ["user_id", "account_id"]
          },
        ]
      }
      credit_card_statements: {
        Row: {
          account_id: string
          advances: number
          created_at: string
          cutoff_on: string
          due_on: string
          fees: number
          id: string
          interest: number
          minimum_due: number
          payments: number
          period_end: string
          period_start: string
          purchases: number
          reconciled_at: string | null
          refunds: number
          status: string
          total_due: number
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          account_id: string
          advances?: number
          created_at?: string
          cutoff_on: string
          due_on: string
          fees?: number
          id?: string
          interest?: number
          minimum_due?: number
          payments?: number
          period_end: string
          period_start: string
          purchases?: number
          reconciled_at?: string | null
          refunds?: number
          status?: string
          total_due: number
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          account_id?: string
          advances?: number
          created_at?: string
          cutoff_on?: string
          due_on?: string
          fees?: number
          id?: string
          interest?: number
          minimum_due?: number
          payments?: number
          period_end?: string
          period_start?: string
          purchases?: number
          reconciled_at?: string | null
          refunds?: number
          status?: string
          total_due?: number
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_statements_obligation_owner_fkey"
            columns: ["user_id", "id"]
            isOneToOne: false
            referencedRelation: "liability_obligations"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "credit_card_statements_user_id_account_id_fkey"
            columns: ["user_id", "account_id"]
            isOneToOne: false
            referencedRelation: "credit_card_profiles"
            referencedColumns: ["user_id", "account_id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          base_currency_code: string
          created_at: string
          id: string
          provider: string | null
          quote_currency_code: string
          rate: number
          rate_date: string
          source: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          base_currency_code: string
          created_at?: string
          id?: string
          provider?: string | null
          quote_currency_code: string
          rate: number
          rate_date: string
          source: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          base_currency_code?: string
          created_at?: string
          id?: string
          provider?: string | null
          quote_currency_code?: string
          rate?: number
          rate_date?: string
          source?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      financial_target_debt_details: {
        Row: {
          annual_interest_rate: number | null
          created_at: string
          creditor: string | null
          due_day: number | null
          migrated_liability_account_id: string | null
          migration_status: string
          minimum_payment: number | null
          target_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          annual_interest_rate?: number | null
          created_at?: string
          creditor?: string | null
          due_day?: number | null
          migrated_liability_account_id?: string | null
          migration_status?: string
          minimum_payment?: number | null
          target_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          annual_interest_rate?: number | null
          created_at?: string
          creditor?: string | null
          due_day?: number | null
          migrated_liability_account_id?: string | null
          migration_status?: string
          minimum_payment?: number | null
          target_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_target_debt_details_target_owner_fkey"
            columns: ["user_id", "target_id"]
            isOneToOne: false
            referencedRelation: "financial_target_overview"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "financial_target_debt_details_target_owner_fkey"
            columns: ["user_id", "target_id"]
            isOneToOne: false
            referencedRelation: "financial_targets"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "financial_target_debt_liability_owner_fkey"
            columns: ["user_id", "migrated_liability_account_id"]
            isOneToOne: false
            referencedRelation: "liabilities"
            referencedColumns: ["user_id", "account_id"]
          },
        ]
      }
      financial_target_entries: {
        Row: {
          amount: number
          created_at: string
          effect: string
          id: string
          kind: string
          note: string | null
          occurred_on: string
          target_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          effect: string
          id?: string
          kind: string
          note?: string | null
          occurred_on?: string
          target_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          effect?: string
          id?: string
          kind?: string
          note?: string | null
          occurred_on?: string
          target_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_target_entries_target_owner_fkey"
            columns: ["user_id", "target_id"]
            isOneToOne: false
            referencedRelation: "financial_target_overview"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "financial_target_entries_target_owner_fkey"
            columns: ["user_id", "target_id"]
            isOneToOne: false
            referencedRelation: "financial_targets"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      financial_targets: {
        Row: {
          account_id: string | null
          archived_at: string | null
          category_id: string | null
          color: string
          completed_at: string | null
          created_at: string
          description: string | null
          icon: string
          id: string
          initial_progress: number
          kind: string
          mode: string
          priority: number
          starts_on: string
          status: string
          target_amount: number
          target_date: string | null
          title: string
          tracking_mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          archived_at?: string | null
          category_id?: string | null
          color?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          initial_progress?: number
          kind: string
          mode: string
          priority?: number
          starts_on?: string
          status?: string
          target_amount: number
          target_date?: string | null
          title: string
          tracking_mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          archived_at?: string | null
          category_id?: string | null
          color?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          icon?: string
          id?: string
          initial_progress?: number
          kind?: string
          mode?: string
          priority?: number
          starts_on?: string
          status?: string
          target_amount?: number
          target_date?: string | null
          title?: string
          tracking_mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_targets_account_owner_fkey"
            columns: ["user_id", "account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "financial_targets_category_owner_fkey"
            columns: ["user_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      group_allocations: {
        Row: {
          archived: boolean
          color: string
          created_at: string
          group_key: string
          icon: string
          id: string
          included_in_plan: boolean
          is_default: boolean
          name: string
          sort_order: number
          target_percent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          color: string
          created_at?: string
          group_key: string
          icon: string
          id?: string
          included_in_plan?: boolean
          is_default?: boolean
          name: string
          sort_order?: number
          target_percent: number
          updated_at?: string
          user_id: string
        }
        Update: {
          archived?: boolean
          color?: string
          created_at?: string
          group_key?: string
          icon?: string
          id?: string
          included_in_plan?: boolean
          is_default?: boolean
          name?: string
          sort_order?: number
          target_percent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ingestion_jobs: {
        Row: {
          confidence: number | null
          created_at: string
          error_message: string | null
          extracted_candidate: Json | null
          id: string
          idempotency_key: string
          media_kind: string
          parser_version: string | null
          retained_until: string | null
          status: string
          storage_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          error_message?: string | null
          extracted_candidate?: Json | null
          id?: string
          idempotency_key: string
          media_kind: string
          parser_version?: string | null
          retained_until?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          error_message?: string | null
          extracted_candidate?: Json | null
          id?: string
          idempotency_key?: string
          media_kind?: string
          parser_version?: string | null
          retained_until?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ledger_events: {
        Row: {
          created_at: string
          description: string
          event_type: string
          id: string
          idempotency_key: string
          merchant: string | null
          note: string | null
          occurred_on: string
          source: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          description: string
          event_type: string
          id?: string
          idempotency_key: string
          merchant?: string | null
          note?: string | null
          occurred_on?: string
          source?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          merchant?: string | null
          note?: string | null
          occurred_on?: string
          source?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      liabilities: {
        Row: {
          account_id: string
          created_at: string
          creditor_name: string | null
          kind: string
          legacy_target_id: string | null
          maturity_on: string | null
          migration_status: string
          original_principal: number | null
          originated_on: string | null
          status: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          account_id: string
          created_at?: string
          creditor_name?: string | null
          kind?: string
          legacy_target_id?: string | null
          maturity_on?: string | null
          migration_status?: string
          original_principal?: number | null
          originated_on?: string | null
          status?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          account_id?: string
          created_at?: string
          creditor_name?: string | null
          kind?: string
          legacy_target_id?: string | null
          maturity_on?: string | null
          migration_status?: string
          original_principal?: number | null
          originated_on?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "liabilities_user_id_account_id_fkey"
            columns: ["user_id", "account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "liabilities_user_id_legacy_target_id_fkey"
            columns: ["user_id", "legacy_target_id"]
            isOneToOne: true
            referencedRelation: "financial_target_overview"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "liabilities_user_id_legacy_target_id_fkey"
            columns: ["user_id", "legacy_target_id"]
            isOneToOne: true
            referencedRelation: "financial_targets"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      liability_event_metadata: {
        Row: {
          account_id: string
          created_at: string
          id: string
          ledger_event_id: string
          related_ledger_event_id: string | null
          related_obligation_id: string | null
          role: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          ledger_event_id: string
          related_ledger_event_id?: string | null
          related_obligation_id?: string | null
          role: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          ledger_event_id?: string
          related_ledger_event_id?: string | null
          related_obligation_id?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "liability_event_metadata_user_id_account_id_fkey"
            columns: ["user_id", "account_id"]
            isOneToOne: false
            referencedRelation: "liabilities"
            referencedColumns: ["user_id", "account_id"]
          },
          {
            foreignKeyName: "liability_event_metadata_user_id_ledger_event_id_fkey"
            columns: ["user_id", "ledger_event_id"]
            isOneToOne: false
            referencedRelation: "ledger_events"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "liability_event_metadata_user_id_related_ledger_event_id_fkey"
            columns: ["user_id", "related_ledger_event_id"]
            isOneToOne: false
            referencedRelation: "ledger_events"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "liability_event_metadata_user_id_related_obligation_id_fkey"
            columns: ["user_id", "related_obligation_id"]
            isOneToOne: false
            referencedRelation: "liability_obligations"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      liability_obligations: {
        Row: {
          account_id: string
          created_at: string
          due_on: string
          fee_due: number
          id: string
          interest_due: number
          kind: string
          minimum_due: number
          period_end: string | null
          period_start: string | null
          principal_due: number
          sequence_number: number | null
          source: string
          status: string
          total_due: number
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          account_id: string
          created_at?: string
          due_on: string
          fee_due?: number
          id?: string
          interest_due?: number
          kind: string
          minimum_due?: number
          period_end?: string | null
          period_start?: string | null
          principal_due?: number
          sequence_number?: number | null
          source?: string
          status?: string
          total_due: number
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          account_id?: string
          created_at?: string
          due_on?: string
          fee_due?: number
          id?: string
          interest_due?: number
          kind?: string
          minimum_due?: number
          period_end?: string | null
          period_start?: string | null
          principal_due?: number
          sequence_number?: number | null
          source?: string
          status?: string
          total_due?: number
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "liability_obligations_user_id_account_id_fkey"
            columns: ["user_id", "account_id"]
            isOneToOne: false
            referencedRelation: "liabilities"
            referencedColumns: ["user_id", "account_id"]
          },
        ]
      }
      liability_payment_allocations: {
        Row: {
          account_id: string
          allocated_on: string
          amount: number
          created_at: string
          id: string
          ledger_event_id: string
          obligation_id: string
          user_id: string
        }
        Insert: {
          account_id: string
          allocated_on: string
          amount: number
          created_at?: string
          id?: string
          ledger_event_id: string
          obligation_id: string
          user_id: string
        }
        Update: {
          account_id?: string
          allocated_on?: string
          amount?: number
          created_at?: string
          id?: string
          ledger_event_id?: string
          obligation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "liability_payment_allocations_user_id_account_id_fkey"
            columns: ["user_id", "account_id"]
            isOneToOne: false
            referencedRelation: "liabilities"
            referencedColumns: ["user_id", "account_id"]
          },
          {
            foreignKeyName: "liability_payment_allocations_user_id_ledger_event_id_fkey"
            columns: ["user_id", "ledger_event_id"]
            isOneToOne: false
            referencedRelation: "ledger_events"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "liability_payment_allocations_user_id_obligation_id_fkey"
            columns: ["user_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "liability_obligations"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      liability_payment_intents: {
        Row: {
          account_id: string
          created_at: string
          detached_by_rule: boolean
          failure_reason: string | null
          id: string
          ledger_event_id: string | null
          obligation_id: string | null
          planned_amount: number
          rule_id: string | null
          scheduled_for: string
          status: string
          suspended_by_target: boolean
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          account_id: string
          created_at?: string
          detached_by_rule?: boolean
          failure_reason?: string | null
          id?: string
          ledger_event_id?: string | null
          obligation_id?: string | null
          planned_amount: number
          rule_id?: string | null
          scheduled_for: string
          status?: string
          suspended_by_target?: boolean
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          account_id?: string
          created_at?: string
          detached_by_rule?: boolean
          failure_reason?: string | null
          id?: string
          ledger_event_id?: string | null
          obligation_id?: string | null
          planned_amount?: number
          rule_id?: string | null
          scheduled_for?: string
          status?: string
          suspended_by_target?: boolean
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "liability_payment_intents_user_id_account_id_fkey"
            columns: ["user_id", "account_id"]
            isOneToOne: false
            referencedRelation: "liabilities"
            referencedColumns: ["user_id", "account_id"]
          },
          {
            foreignKeyName: "liability_payment_intents_user_id_ledger_event_id_fkey"
            columns: ["user_id", "ledger_event_id"]
            isOneToOne: false
            referencedRelation: "ledger_events"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "liability_payment_intents_user_id_obligation_id_fkey"
            columns: ["user_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "liability_obligations"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "liability_payment_intents_user_id_rule_id_fkey"
            columns: ["user_id", "rule_id"]
            isOneToOne: false
            referencedRelation: "liability_payment_rules"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      liability_payment_rules: {
        Row: {
          account_id: string
          active: boolean
          created_at: string
          days_before_due: number
          detached_at: string | null
          fixed_amount: number | null
          funding_account_id: string
          id: string
          maximum_amount: number | null
          recording_mode: string
          strategy: string
          suspended_by_target: boolean
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          account_id: string
          active?: boolean
          created_at?: string
          days_before_due?: number
          detached_at?: string | null
          fixed_amount?: number | null
          funding_account_id: string
          id?: string
          maximum_amount?: number | null
          recording_mode?: string
          strategy: string
          suspended_by_target?: boolean
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          account_id?: string
          active?: boolean
          created_at?: string
          days_before_due?: number
          detached_at?: string | null
          fixed_amount?: number | null
          funding_account_id?: string
          id?: string
          maximum_amount?: number | null
          recording_mode?: string
          strategy?: string
          suspended_by_target?: boolean
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "liability_payment_rules_user_id_account_id_fkey"
            columns: ["user_id", "account_id"]
            isOneToOne: true
            referencedRelation: "liabilities"
            referencedColumns: ["user_id", "account_id"]
          },
          {
            foreignKeyName: "liability_payment_rules_user_id_funding_account_id_fkey"
            columns: ["user_id", "funding_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      liability_rate_periods: {
        Row: {
          account_id: string
          created_at: string
          effective_annual_rate: number | null
          ends_on: string | null
          id: string
          rate_basis: string
          rate_kind: string
          reported_value: number
          source: string
          starts_on: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          effective_annual_rate?: number | null
          ends_on?: string | null
          id?: string
          rate_basis: string
          rate_kind: string
          reported_value: number
          source?: string
          starts_on: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          effective_annual_rate?: number | null
          ends_on?: string | null
          id?: string
          rate_basis?: string
          rate_kind?: string
          reported_value?: number
          source?: string
          starts_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "liability_rate_periods_user_id_account_id_fkey"
            columns: ["user_id", "account_id"]
            isOneToOne: false
            referencedRelation: "liabilities"
            referencedColumns: ["user_id", "account_id"]
          },
        ]
      }
      liability_terms: {
        Row: {
          account_id: string
          amortization_method: string
          calculation_method: string
          contractual_minimum: number | null
          created_at: string
          due_day: number | null
          ends_on: string | null
          first_due_on: string | null
          id: string
          index_name: string | null
          installment_count: number | null
          interval_count: number
          payment_frequency: string
          periodic_fee: number
          periodic_insurance: number
          prepayment_strategy: string
          scheduled_payment: number | null
          source: string
          spread_rate: number | null
          starts_on: string
          statement_cutoff_day: number | null
          updated_at: string
          user_id: string
          variable_rate: boolean
          version: number
        }
        Insert: {
          account_id: string
          amortization_method?: string
          calculation_method?: string
          contractual_minimum?: number | null
          created_at?: string
          due_day?: number | null
          ends_on?: string | null
          first_due_on?: string | null
          id?: string
          index_name?: string | null
          installment_count?: number | null
          interval_count?: number
          payment_frequency?: string
          periodic_fee?: number
          periodic_insurance?: number
          prepayment_strategy?: string
          scheduled_payment?: number | null
          source?: string
          spread_rate?: number | null
          starts_on: string
          statement_cutoff_day?: number | null
          updated_at?: string
          user_id: string
          variable_rate?: boolean
          version?: number
        }
        Update: {
          account_id?: string
          amortization_method?: string
          calculation_method?: string
          contractual_minimum?: number | null
          created_at?: string
          due_day?: number | null
          ends_on?: string | null
          first_due_on?: string | null
          id?: string
          index_name?: string | null
          installment_count?: number | null
          interval_count?: number
          payment_frequency?: string
          periodic_fee?: number
          periodic_insurance?: number
          prepayment_strategy?: string
          scheduled_payment?: number | null
          source?: string
          spread_rate?: number | null
          starts_on?: string
          statement_cutoff_day?: number | null
          updated_at?: string
          user_id?: string
          variable_rate?: boolean
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "liability_terms_user_id_account_id_fkey"
            columns: ["user_id", "account_id"]
            isOneToOne: false
            referencedRelation: "liabilities"
            referencedColumns: ["user_id", "account_id"]
          },
        ]
      }
      monthly_budget_plans: {
        Row: {
          created_at: string
          id: string
          income_target: number
          month: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          income_target?: number
          month: string
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          income_target?: number
          month?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mutation_receipts: {
        Row: {
          created_at: string
          operation: string
          operation_id: string
          result: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          operation: string
          operation_id: string
          result?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          operation?: string
          operation_id?: string
          result?: Json
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          color_theme: string
          created_at: string
          currency_code: string
          custom_theme_color: string
          display_name: string | null
          email: string
          financial_reset_generation: number
          id: string
          month_starts_on: number
          schema_version: number
          theme_mode: string
          timezone: string
          updated_at: string
          week_starts_on: number
        }
        Insert: {
          avatar_url?: string | null
          color_theme?: string
          created_at?: string
          currency_code?: string
          custom_theme_color?: string
          display_name?: string | null
          email: string
          financial_reset_generation?: number
          id: string
          month_starts_on?: number
          schema_version?: number
          theme_mode?: string
          timezone?: string
          updated_at?: string
          week_starts_on?: number
        }
        Update: {
          avatar_url?: string | null
          color_theme?: string
          created_at?: string
          currency_code?: string
          custom_theme_color?: string
          display_name?: string | null
          email?: string
          financial_reset_generation?: number
          id?: string
          month_starts_on?: number
          schema_version?: number
          theme_mode?: string
          timezone?: string
          updated_at?: string
          week_starts_on?: number
        }
        Relationships: []
      }
      recurring_occurrences: {
        Row: {
          account_id: string
          amount: number
          category_id: string | null
          created_at: string
          description: string
          destination_account_id: string | null
          destination_amount: number | null
          effective_on: string
          exchange_rate: number
          exchange_rate_date: string
          exchange_rate_source: string
          failure_reason: string | null
          financial_target_effect: string | null
          financial_target_id: string | null
          icon: string | null
          id: string
          kind: string
          merchant: string | null
          note: string | null
          posted_at: string | null
          reference_exchange_rate: number | null
          reference_rate_source: string | null
          rule_id: string
          scheduled_on: string
          status: string
          suspended_by_target: boolean
          transaction_id: string | null
          transfer_group_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          category_id?: string | null
          created_at?: string
          description: string
          destination_account_id?: string | null
          destination_amount?: number | null
          effective_on: string
          exchange_rate?: number
          exchange_rate_date?: string
          exchange_rate_source?: string
          failure_reason?: string | null
          financial_target_effect?: string | null
          financial_target_id?: string | null
          icon?: string | null
          id?: string
          kind: string
          merchant?: string | null
          note?: string | null
          posted_at?: string | null
          reference_exchange_rate?: number | null
          reference_rate_source?: string | null
          rule_id: string
          scheduled_on: string
          status?: string
          suspended_by_target?: boolean
          transaction_id?: string | null
          transfer_group_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          category_id?: string | null
          created_at?: string
          description?: string
          destination_account_id?: string | null
          destination_amount?: number | null
          effective_on?: string
          exchange_rate?: number
          exchange_rate_date?: string
          exchange_rate_source?: string
          failure_reason?: string | null
          financial_target_effect?: string | null
          financial_target_id?: string | null
          icon?: string | null
          id?: string
          kind?: string
          merchant?: string | null
          note?: string | null
          posted_at?: string | null
          reference_exchange_rate?: number | null
          reference_rate_source?: string | null
          rule_id?: string
          scheduled_on?: string
          status?: string
          suspended_by_target?: boolean
          transaction_id?: string | null
          transfer_group_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_occurrences_account_owner_fkey"
            columns: ["user_id", "account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "recurring_occurrences_category_owner_fkey"
            columns: ["user_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "recurring_occurrences_destination_owner_fkey"
            columns: ["user_id", "destination_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "recurring_occurrences_financial_target_owner_fkey"
            columns: ["user_id", "financial_target_id"]
            isOneToOne: false
            referencedRelation: "financial_target_overview"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "recurring_occurrences_financial_target_owner_fkey"
            columns: ["user_id", "financial_target_id"]
            isOneToOne: false
            referencedRelation: "financial_targets"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "recurring_occurrences_rule_owner_fkey"
            columns: ["user_id", "rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_rules"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "recurring_occurrences_transaction_owner_fkey"
            columns: ["user_id", "transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      recurring_rules: {
        Row: {
          account_id: string
          active: boolean
          amount: number
          anchor_day: number | null
          archived_at: string | null
          auto_post: boolean
          cadence: string
          category_id: string | null
          created_at: string
          description: string
          destination_account_id: string | null
          destination_amount: number | null
          ends_on: string | null
          exchange_rate: number
          exchange_rate_date: string
          exchange_rate_source: string
          financial_target_effect: string | null
          financial_target_id: string | null
          icon: string | null
          id: string
          include_in_budget: boolean
          include_in_income_target: boolean
          interval_count: number
          kind: string
          merchant: string | null
          next_run_on: string
          note: string | null
          posting_policy: string
          reference_exchange_rate: number | null
          reference_rate_source: string | null
          second_anchor_day: number | null
          starts_on: string
          status: string
          suspended_by_target: boolean
          timezone: string
          updated_at: string
          user_id: string
          weekday: number | null
        }
        Insert: {
          account_id: string
          active?: boolean
          amount: number
          anchor_day?: number | null
          archived_at?: string | null
          auto_post?: boolean
          cadence: string
          category_id?: string | null
          created_at?: string
          description: string
          destination_account_id?: string | null
          destination_amount?: number | null
          ends_on?: string | null
          exchange_rate?: number
          exchange_rate_date?: string
          exchange_rate_source?: string
          financial_target_effect?: string | null
          financial_target_id?: string | null
          icon?: string | null
          id?: string
          include_in_budget?: boolean
          include_in_income_target?: boolean
          interval_count?: number
          kind: string
          merchant?: string | null
          next_run_on: string
          note?: string | null
          posting_policy?: string
          reference_exchange_rate?: number | null
          reference_rate_source?: string | null
          second_anchor_day?: number | null
          starts_on: string
          status?: string
          suspended_by_target?: boolean
          timezone?: string
          updated_at?: string
          user_id: string
          weekday?: number | null
        }
        Update: {
          account_id?: string
          active?: boolean
          amount?: number
          anchor_day?: number | null
          archived_at?: string | null
          auto_post?: boolean
          cadence?: string
          category_id?: string | null
          created_at?: string
          description?: string
          destination_account_id?: string | null
          destination_amount?: number | null
          ends_on?: string | null
          exchange_rate?: number
          exchange_rate_date?: string
          exchange_rate_source?: string
          financial_target_effect?: string | null
          financial_target_id?: string | null
          icon?: string | null
          id?: string
          include_in_budget?: boolean
          include_in_income_target?: boolean
          interval_count?: number
          kind?: string
          merchant?: string | null
          next_run_on?: string
          note?: string | null
          posting_policy?: string
          reference_exchange_rate?: number | null
          reference_rate_source?: string | null
          second_anchor_day?: number | null
          starts_on?: string
          status?: string
          suspended_by_target?: boolean
          timezone?: string
          updated_at?: string
          user_id?: string
          weekday?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_rules_account_owner_fkey"
            columns: ["user_id", "account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "recurring_rules_category_owner_fkey"
            columns: ["user_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "recurring_rules_destination_account_owner_fkey"
            columns: ["user_id", "destination_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "recurring_rules_financial_target_owner_fkey"
            columns: ["user_id", "financial_target_id"]
            isOneToOne: false
            referencedRelation: "financial_target_overview"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "recurring_rules_financial_target_owner_fkey"
            columns: ["user_id", "financial_target_id"]
            isOneToOne: false
            referencedRelation: "financial_targets"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          base_amount: number
          base_currency_code: string
          category_id: string | null
          created_at: string
          description: string
          exchange_rate: number
          exchange_rate_date: string
          exchange_rate_source: string
          financial_target_effect: string | null
          financial_target_id: string | null
          icon: string | null
          id: string
          kind: string
          ledger_event_id: string
          merchant: string | null
          native_currency_code: string
          note: string | null
          occurred_on: string
          recurring_occurrence_id: string | null
          reference_exchange_rate: number | null
          reference_rate_source: string | null
          transfer_group_id: string | null
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          account_id: string
          amount: number
          base_amount: number
          base_currency_code: string
          category_id?: string | null
          created_at?: string
          description: string
          exchange_rate: number
          exchange_rate_date: string
          exchange_rate_source: string
          financial_target_effect?: string | null
          financial_target_id?: string | null
          icon?: string | null
          id?: string
          kind: string
          ledger_event_id: string
          merchant?: string | null
          native_currency_code: string
          note?: string | null
          occurred_on?: string
          recurring_occurrence_id?: string | null
          reference_exchange_rate?: number | null
          reference_rate_source?: string | null
          transfer_group_id?: string | null
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          account_id?: string
          amount?: number
          base_amount?: number
          base_currency_code?: string
          category_id?: string | null
          created_at?: string
          description?: string
          exchange_rate?: number
          exchange_rate_date?: string
          exchange_rate_source?: string
          financial_target_effect?: string | null
          financial_target_id?: string | null
          icon?: string | null
          id?: string
          kind?: string
          ledger_event_id?: string
          merchant?: string | null
          native_currency_code?: string
          note?: string | null
          occurred_on?: string
          recurring_occurrence_id?: string | null
          reference_exchange_rate?: number | null
          reference_rate_source?: string | null
          transfer_group_id?: string | null
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_owner_fkey"
            columns: ["user_id", "account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "transactions_category_owner_fkey"
            columns: ["user_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "transactions_financial_target_owner_fkey"
            columns: ["user_id", "financial_target_id"]
            isOneToOne: false
            referencedRelation: "financial_target_overview"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "transactions_financial_target_owner_fkey"
            columns: ["user_id", "financial_target_id"]
            isOneToOne: false
            referencedRelation: "financial_targets"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "transactions_ledger_event_owner_fkey"
            columns: ["user_id", "ledger_event_id"]
            isOneToOne: false
            referencedRelation: "ledger_events"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "transactions_recurring_occurrence_owner_fkey"
            columns: ["user_id", "recurring_occurrence_id"]
            isOneToOne: false
            referencedRelation: "recurring_occurrences"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
    }
    Views: {
      financial_target_overview: {
        Row: {
          account_id: string | null
          archived_at: string | null
          category_id: string | null
          color: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string | null
          initial_progress: number | null
          kind: string | null
          mode: string | null
          priority: number | null
          progress_amount: number | null
          starts_on: string | null
          status: string | null
          target_amount: number | null
          target_date: string | null
          title: string | null
          tracking_mode: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_targets_account_owner_fkey"
            columns: ["user_id", "account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["user_id", "id"]
          },
          {
            foreignKeyName: "financial_targets_category_owner_fkey"
            columns: ["user_id", "category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      main_categories: {
        Row: {
          archived: boolean | null
          color: string | null
          created_at: string | null
          icon: string | null
          id: string | null
          included_in_plan: boolean | null
          is_default: boolean | null
          key: string | null
          name: string | null
          sort_order: number | null
          target_percent: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          archived?: boolean | null
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string | null
          included_in_plan?: boolean | null
          is_default?: boolean | null
          key?: string | null
          name?: string | null
          sort_order?: number | null
          target_percent?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          archived?: boolean | null
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string | null
          included_in_plan?: boolean | null
          is_default?: boolean | null
          key?: string | null
          name?: string | null
          sort_order?: number | null
          target_percent?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      archive_account_entity: {
        Args: {
          p_entity_id: string
          p_expected_version: number
          p_operation_id: string
        }
        Returns: Json
      }
      archive_account_v1: {
        Args: {
          p_account_id: string
          p_expected_version: number
          p_operation_id: string
        }
        Returns: Json
      }
      archive_finance_category: { Args: { p_id: string }; Returns: undefined }
      archive_finance_group: {
        Args: {
          p_archive_categories?: boolean
          p_destination_group_key?: string
          p_group_key: string
        }
        Returns: undefined
      }
      archive_finance_group_atomic: {
        Args: {
          p_allocations: Json
          p_archive_categories?: boolean
          p_destination_group_key?: string
          p_group_key: string
        }
        Returns: undefined
      }
      archive_income_type: { Args: { p_id: string }; Returns: undefined }
      archive_liability_v2: {
        Args: {
          p_account_id: string
          p_expected_account_version: number
          p_expected_liability_version: number
          p_operation_id: string
        }
        Returns: Json
      }
      create_credit_card_purchase_v1: {
        Args: {
          p_installments: Json
          p_operation_id: string
          p_plan: Json
          p_transaction: Json
        }
        Returns: Json
      }
      create_transfer: {
        Args: {
          p_amount: number
          p_description: string
          p_destination_account_id: string
          p_note?: string
          p_occurred_on: string
          p_source_account_id: string
        }
        Returns: string
      }
      delete_transactions_v2: {
        Args: {
          p_operation_id: string
          p_transaction_id: string
          p_transfer_group_id?: string
        }
        Returns: number
      }
      get_detailed_finance_report: {
        Args: {
          p_account_ids?: string[]
          p_category_ids?: string[]
          p_comparison_end?: string
          p_comparison_start?: string
          p_end_date: string
          p_granularity?: string
          p_group_keys?: string[]
          p_income_type_ids?: string[]
          p_kind?: string
          p_months?: string[]
          p_query?: string
          p_start_date: string
        }
        Returns: Json
      }
      get_detailed_finance_report_v3: {
        Args: {
          p_account_ids?: string[]
          p_category_ids?: string[]
          p_comparison_end?: string
          p_comparison_start?: string
          p_end_date: string
          p_granularity?: string
          p_group_keys?: string[]
          p_income_type_ids?: string[]
          p_kind?: string
          p_months?: string[]
          p_query?: string
          p_start_date: string
        }
        Returns: Json
      }
      get_detailed_finance_report_v4: {
        Args: {
          p_account_ids?: string[]
          p_category_ids?: string[]
          p_comparison_end?: string
          p_comparison_start?: string
          p_end_date: string
          p_granularity?: string
          p_group_keys?: string[]
          p_income_type_ids?: string[]
          p_kind?: string
          p_months?: string[]
          p_query?: string
          p_start_date: string
        }
        Returns: Json
      }
      get_finance_report: {
        Args: { p_end_month: string; p_months?: number }
        Returns: Json
      }
      get_finance_snapshot: { Args: { p_month: string }; Returns: Json }
      get_liability_calendar_v2: {
        Args: { p_end_date: string; p_limit?: number; p_start_date: string }
        Returns: Json
      }
      get_liability_overview_v2: {
        Args: { p_include_archived?: boolean }
        Returns: Json
      }
      get_monthly_budget_plan: { Args: { p_month: string }; Returns: Json }
      get_plan_simulation_seed: { Args: { p_month: string }; Returns: Json }
      get_transactions_page: {
        Args: {
          p_account_id?: string
          p_category_id?: string
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_cursor_occurred_on?: string
          p_end_date?: string
          p_kind?: string
          p_limit?: number
          p_query?: string
          p_start_date?: string
        }
        Returns: Json
      }
      import_planner_v1: {
        Args: {
          p_account: Json
          p_categories: Json
          p_income_types: Json
          p_operation_id: string
          p_transactions: Json
        }
        Returns: Json
      }
      is_current_user_admin: { Args: never; Returns: boolean }
      is_current_user_allowed: { Args: never; Returns: boolean }
      list_authorized_users: { Args: never; Returns: Json }
      preview_liability_reconciliation_v2: {
        Args: {
          p_account_id: string
          p_cutoff_on: string
          p_fees?: number
          p_interest?: number
          p_obligation_id?: string
          p_period_start?: string
          p_total_due: number
        }
        Returns: Json
      }
      record_liability_payment_v2: {
        Args: { p_allocations?: Json; p_operation_id: string; p_payment: Json }
        Returns: Json
      }
      set_finance_category_order: {
        Args: { p_group_key: string; p_positions: Json }
        Returns: undefined
      }
      set_financial_target_status_v2: {
        Args: { p_operation_id: string; p_status: string; p_target_id: string }
        Returns: Json
      }
      set_group_allocations: {
        Args: { p_allocations: Json }
        Returns: undefined
      }
      set_monthly_budget_plan: {
        Args: {
          p_budgets: Json
          p_income_target: number
          p_month: string
          p_source: string
        }
        Returns: undefined
      }
      update_account_v3: {
        Args: {
          p_account: Json
          p_adjustment_date?: string
          p_exchange_rate?: number
          p_expected_version: number
          p_operation_id: string
          p_reference_exchange_rate?: number
          p_reference_rate_source?: string
          p_target_balance?: number
        }
        Returns: Json
      }
      upsert_account_entity: {
        Args: {
          p_entity: Json
          p_expected_version?: number
          p_operation_id: string
        }
        Returns: Json
      }
      upsert_authorized_user: {
        Args: { p_access_role?: string; p_email: string; p_enabled?: boolean }
        Returns: undefined
      }
      upsert_credit_card_v1: {
        Args: {
          p_account: Json
          p_card: Json
          p_expected_account_version?: number
          p_expected_card_version?: number
          p_operation_id: string
        }
        Returns: Json
      }
      upsert_finance_category: {
        Args: {
          p_color: string
          p_group_key: string
          p_icon: string
          p_id: string
          p_name: string
        }
        Returns: string
      }
      upsert_finance_group: {
        Args: {
          p_color: string
          p_group_key: string
          p_icon: string
          p_id: string
          p_name: string
          p_sort_order: number
        }
        Returns: string
      }
      upsert_financial_target_v2: {
        Args: { p_debt?: Json; p_operation_id: string; p_target: Json }
        Returns: string
      }
      upsert_income_type: {
        Args: { p_color: string; p_icon: string; p_id: string; p_name: string }
        Returns: string
      }
      upsert_liability_obligation_v2: {
        Args: {
          p_adjustments?: Json
          p_expected_version?: number
          p_obligation: Json
          p_operation_id: string
          p_reconcile_difference?: boolean
          p_statement?: Json
        }
        Returns: Json
      }
      upsert_liability_payment_intent_v2: {
        Args: {
          p_expected_version?: number
          p_intent: Json
          p_operation_id: string
        }
        Returns: Json
      }
      upsert_liability_payment_rule_v2: {
        Args: {
          p_expected_version?: number
          p_operation_id: string
          p_rule: Json
        }
        Returns: Json
      }
      upsert_liability_terms_v2: {
        Args: {
          p_expected_version?: number
          p_operation_id: string
          p_rates?: Json
          p_term: Json
        }
        Returns: Json
      }
      upsert_liability_v2: {
        Args: {
          p_account: Json
          p_expected_account_version?: number
          p_expected_liability_version?: number
          p_liability: Json
          p_operation_id: string
        }
        Returns: Json
      }
      upsert_transactions_v2: {
        Args: { p_operation_id: string; p_transactions: Json }
        Returns: number
      }
      upsert_transactions_v3: {
        Args: { p_operation_id: string; p_transactions: Json }
        Returns: number
      }
      upsert_transfer: {
        Args: {
          p_amount: number
          p_description: string
          p_destination_account_id: string
          p_destination_transaction_id: string
          p_note?: string
          p_occurred_on: string
          p_source_account_id: string
          p_source_transaction_id: string
          p_transfer_group_id: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
