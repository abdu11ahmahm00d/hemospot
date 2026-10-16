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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      analyses: {
        Row: {
          assigned_to: string | null
          confidence: number | null
          created_at: string
          evidence_id: string
          explanation: Json | null
          id: string
          model_sha256: string | null
          probabilities: Json | null
          requested_by: string
          review_note: string
          reviewed_by: string | null
          stain_count: number | null
          stains: Json
          status: string
          timing_ms: number | null
          updated_at: string
          verdict: string | null
        }
        Insert: {
          assigned_to?: string | null
          confidence?: number | null
          created_at?: string
          evidence_id: string
          explanation?: Json | null
          id?: string
          model_sha256?: string | null
          probabilities?: Json | null
          requested_by: string
          review_note?: string
          reviewed_by?: string | null
          stain_count?: number | null
          stains?: Json
          status?: string
          timing_ms?: number | null
          updated_at?: string
          verdict?: string | null
        }
        Update: {
          assigned_to?: string | null
          confidence?: number | null
          created_at?: string
          evidence_id?: string
          explanation?: Json | null
          id?: string
          model_sha256?: string | null
          probabilities?: Json | null
          requested_by?: string
          review_note?: string
          reviewed_by?: string | null
          stain_count?: number | null
          stains?: Json
          status?: string
          timing_ms?: number | null
          updated_at?: string
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analyses_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analyses_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analyses_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analyses_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_jobs: {
        Row: {
          analysis_id: string
          attempts: number
          created_at: string
          finished_at: string | null
          id: string
          last_error: string
          picked_up_at: string | null
          status: string
        }
        Insert: {
          analysis_id: string
          attempts?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          last_error?: string
          picked_up_at?: string | null
          status?: string
        }
        Update: {
          analysis_id?: string
          attempts?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          last_error?: string
          picked_up_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_jobs_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      case_transitions: {
        Row: {
          acted_by: string
          case_id: string
          from_status: string
          id: string
          note: string
          to_status: string
          transitioned_at: string
        }
        Insert: {
          acted_by: string
          case_id: string
          from_status: string
          id?: string
          note?: string
          to_status: string
          transitioned_at?: string
        }
        Update: {
          acted_by?: string
          case_id?: string
          from_status?: string
          id?: string
          note?: string
          to_status?: string
          transitioned_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_transitions_acted_by_fkey"
            columns: ["acted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_transitions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          assigned_to: string | null
          case_number: string
          created_at: string
          created_by: string
          description: string
          id: string
          search_vector: unknown
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          case_number: string
          created_at?: string
          created_by: string
          description?: string
          id?: string
          search_vector?: unknown
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          case_number?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          search_vector?: unknown
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custody_events: {
        Row: {
          acted_at: string
          action: string
          actor: string
          evidence_id: string
          id: string
          reason: string
        }
        Insert: {
          acted_at?: string
          action: string
          actor: string
          evidence_id: string
          id?: string
          reason?: string
        }
        Update: {
          acted_at?: string
          action?: string
          actor?: string
          evidence_id?: string
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "custody_events_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custody_events_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          case_id: string
          file_name: string
          id: string
          item_type: string
          metadata: Json
          mime_type: string
          search_vector: unknown
          sha256_hex: string
          size_bytes: number
          storage_path: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          case_id: string
          file_name: string
          id?: string
          item_type?: string
          metadata?: Json
          mime_type?: string
          search_vector?: unknown
          sha256_hex: string
          size_bytes?: number
          storage_path: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          case_id?: string
          file_name?: string
          id?: string
          item_type?: string
          metadata?: Json
          mime_type?: string
          search_vector?: unknown
          sha256_hex?: string
          size_bytes?: number
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          role?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      case_in_review_lifecycle: {
        Args: { check_case_id: string }
        Returns: boolean
      }
      current_role: { Args: never; Returns: string }
      evidence_in_review_lifecycle: {
        Args: { check_evidence_id: string }
        Returns: boolean
      }
      next_case_status: { Args: { current_status: string }; Returns: string }
      search_cases: {
        Args: {
          from_date?: string
          max_rows?: number
          query_text: string
          status_filter?: string
          to_date?: string
        }
        Returns: {
          case_number: string
          created_at: string
          description: string
          id: string
          rank: number
          status: string
          title: string
        }[]
      }
      search_evidence: {
        Args: {
          from_date?: string
          item_type_filter?: string
          max_rows?: number
          query_text: string
          to_date?: string
        }
        Returns: {
          case_id: string
          created_at: string
          file_name: string
          id: string
          item_type: string
          rank: number
        }[]
      }
      transition_case_status: {
        Args: { p_case_id: string; p_note?: string; p_to_status: string }
        Returns: string
      }
      verify_evidence_hash: {
        Args: { evidence_id: string; recomputed_hex: string }
        Returns: boolean
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
