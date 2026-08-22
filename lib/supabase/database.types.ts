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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      aroma_taxonomy: {
        Row: {
          created_at: string
          family: Database["public"]["Enums"]["aroma_family"]
          id: number
          label_en: string | null
          label_fr: string
          parent_id: number | null
          slug: string
        }
        Insert: {
          created_at?: string
          family: Database["public"]["Enums"]["aroma_family"]
          id?: never
          label_en?: string | null
          label_fr: string
          parent_id?: number | null
          slug: string
        }
        Update: {
          created_at?: string
          family?: Database["public"]["Enums"]["aroma_family"]
          id?: never
          label_en?: string | null
          label_fr?: string
          parent_id?: number | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "aroma_taxonomy_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "aroma_taxonomy"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string | null
          entity_schema: string | null
          entity_table: string | null
          id: number
          ip_hash: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_schema?: string | null
          entity_table?: string | null
          id?: never
          ip_hash?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_schema?: string | null
          entity_table?: string | null
          id?: never
          ip_hash?: string | null
        }
        Relationships: []
      }
      comments: {
        Row: {
          author_id: string
          body: string
          cigar_id: string
          created_at: string
          hidden_at: string | null
          hidden_by: string | null
          hidden_reason: string | null
          id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          cigar_id: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          cigar_id?: string
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      consents: {
        Row: {
          granted: boolean
          granted_at: string
          id: string
          ip_hash: string | null
          kind: Database["public"]["Enums"]["consent_kind"]
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: {
          granted: boolean
          granted_at?: string
          id?: string
          ip_hash?: string | null
          kind: Database["public"]["Enums"]["consent_kind"]
          user_agent?: string | null
          user_id: string
          version: string
        }
        Update: {
          granted?: boolean
          granted_at?: string
          id?: string
          ip_hash?: string | null
          kind?: Database["public"]["Enums"]["consent_kind"]
          user_agent?: string | null
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          description: string
          enabled: boolean
          key: string
          payload: Json
          updated_at: string
        }
        Insert: {
          description: string
          enabled?: boolean
          key: string
          payload?: Json
          updated_at?: string
        }
        Update: {
          description?: string
          enabled?: boolean
          key?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      profile_settings: {
        Row: {
          adult_confirmed_at: string | null
          birth_date: string | null
          created_at: string
          id: string
          locale: string
          preferences: Json
          privacy: Json
          updated_at: string
        }
        Insert: {
          adult_confirmed_at?: string | null
          birth_date?: string | null
          created_at?: string
          id: string
          locale?: string
          preferences?: Json
          privacy?: Json
          updated_at?: string
        }
        Update: {
          adult_confirmed_at?: string | null
          birth_date?: string | null
          created_at?: string
          id?: string
          locale?: string
          preferences?: Json
          privacy?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_settings_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          bio: string | null
          city: string | null
          country: string | null
          created_at: string
          display_name: string | null
          handle: string
          id: string
          is_discoverable: boolean
          reputation: number
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          handle: string
          id: string
          is_discoverable?: boolean
          reputation?: number
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          bio?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string
          id?: string
          is_discoverable?: boolean
          reputation?: number
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      review_shares: {
        Row: {
          granted_at: string
          granted_by: string
          grantee_id: string
          review_id: string
        }
        Insert: {
          granted_at?: string
          granted_by: string
          grantee_id: string
          review_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string
          grantee_id?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_shares_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_thirds: {
        Row: {
          notes: string | null
          review_id: string
          third: number
        }
        Insert: {
          notes?: string | null
          review_id: string
          third: number
        }
        Update: {
          notes?: string | null
          review_id?: string
          third?: number
        }
        Relationships: [
          {
            foreignKeyName: "review_thirds_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          aroma_tags: number[]
          body: string | null
          box_code: string | null
          cigar_id: string
          created_at: string
          humidity_pct: number | null
          id: string
          is_blind: boolean
          kind: Database["public"]["Enums"]["review_kind"]
          pairing_tags: string[]
          pairing_text: string | null
          production_year: number | null
          purchase_year: number | null
          score_total: number | null
          scores: Json
          smoke_duration_min: number | null
          smoked_on: string
          strength_perceived: Database["ref"]["Enums"]["strength"] | null
          updated_at: string
          user_id: string
          visibility: Database["public"]["Enums"]["review_visibility"]
        }
        Insert: {
          aroma_tags?: number[]
          body?: string | null
          box_code?: string | null
          cigar_id: string
          created_at?: string
          humidity_pct?: number | null
          id?: string
          is_blind?: boolean
          kind?: Database["public"]["Enums"]["review_kind"]
          pairing_tags?: string[]
          pairing_text?: string | null
          production_year?: number | null
          purchase_year?: number | null
          score_total?: number | null
          scores?: Json
          smoke_duration_min?: number | null
          smoked_on?: string
          strength_perceived?: Database["ref"]["Enums"]["strength"] | null
          updated_at?: string
          user_id: string
          visibility?: Database["public"]["Enums"]["review_visibility"]
        }
        Update: {
          aroma_tags?: number[]
          body?: string | null
          box_code?: string | null
          cigar_id?: string
          created_at?: string
          humidity_pct?: number | null
          id?: string
          is_blind?: boolean
          kind?: Database["public"]["Enums"]["review_kind"]
          pairing_tags?: string[]
          pairing_text?: string | null
          production_year?: number | null
          purchase_year?: number | null
          score_total?: number | null
          scores?: Json
          smoke_duration_min?: number | null
          smoked_on?: string
          strength_perceived?: Database["ref"]["Enums"]["strength"] | null
          updated_at?: string
          user_id?: string
          visibility?: Database["public"]["Enums"]["review_visibility"]
        }
        Relationships: []
      }
    }
    Views: {
      cigar_stats: {
        Row: {
          bayesian_score: number | null
          cigar_id: string | null
          distribution: Json | null
          last_review_at: string | null
          mean_score: number | null
          mean_score_90d: number | null
          review_count: number | null
          review_count_90d: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      comment_min_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_min_role: {
        Args: { minimum: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      immutable_unaccent: { Args: { value: string }; Returns: string }
      is_privileged_context: { Args: never; Returns: boolean }
      owns_review: { Args: { target: string }; Returns: boolean }
      refresh_cigar_stats: { Args: never; Returns: undefined }
      slugify: { Args: { value: string }; Returns: string }
    }
    Enums: {
      app_role: "member" | "contributor" | "editor" | "moderator" | "admin"
      aroma_family:
        | "boise"
        | "torrefie"
        | "epice"
        | "terreux"
        | "animal"
        | "fruite"
        | "floral"
        | "sucre"
        | "vegetal"
        | "mineral"
        | "defaut"
      consent_kind:
        | "terms"
        | "privacy"
        | "age_verification"
        | "analytics"
        | "marketing_email"
        | "health_related_processing"
      review_kind: "log" | "tasting"
      review_visibility: "private" | "shared" | "followers" | "public"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  ref: {
    Tables: {
      box_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          factory_code: string | null
          id: string
          kind: Database["ref"]["Enums"]["box_code_kind"]
          month: number | null
          notes: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          factory_code?: string | null
          id?: string
          kind: Database["ref"]["Enums"]["box_code_kind"]
          month?: number | null
          notes?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          factory_code?: string | null
          id?: string
          kind?: Database["ref"]["Enums"]["box_code_kind"]
          month?: number | null
          notes?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      brands: {
        Row: {
          country: string | null
          created_at: string
          created_by: string | null
          description: string | null
          founded_year: number | null
          id: string
          is_cuban: boolean
          logo_path: string | null
          manufacturer_id: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          founded_year?: number | null
          id?: string
          is_cuban?: boolean
          logo_path?: string | null
          manufacturer_id?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          founded_year?: number | null
          id?: string
          is_cuban?: boolean
          logo_path?: string | null
          manufacturer_id?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      cigar_images: {
        Row: {
          blurhash: string | null
          cigar_id: string
          created_at: string
          created_by: string | null
          credit: string | null
          height: number | null
          id: string
          is_primary: boolean
          kind: Database["ref"]["Enums"]["image_kind"]
          license: string
          path: string
          width: number | null
        }
        Insert: {
          blurhash?: string | null
          cigar_id: string
          created_at?: string
          created_by?: string | null
          credit?: string | null
          height?: number | null
          id?: string
          is_primary?: boolean
          kind: Database["ref"]["Enums"]["image_kind"]
          license?: string
          path: string
          width?: number | null
        }
        Update: {
          blurhash?: string | null
          cigar_id?: string
          created_at?: string
          created_by?: string | null
          credit?: string | null
          height?: number | null
          id?: string
          is_primary?: boolean
          kind?: Database["ref"]["Enums"]["image_kind"]
          license?: string
          path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cigar_images_cigar_id_fkey"
            columns: ["cigar_id"]
            isOneToOne: false
            referencedRelation: "cigars"
            referencedColumns: ["id"]
          },
        ]
      }
      cigar_revisions: {
        Row: {
          author_id: string
          cigar_id: string | null
          comment: string | null
          created_at: string
          diff: Json
          id: string
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["ref"]["Enums"]["revision_status"]
        }
        Insert: {
          author_id: string
          cigar_id?: string | null
          comment?: string | null
          created_at?: string
          diff: Json
          id?: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["ref"]["Enums"]["revision_status"]
        }
        Update: {
          author_id?: string
          cigar_id?: string | null
          comment?: string | null
          created_at?: string
          diff?: Json
          id?: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["ref"]["Enums"]["revision_status"]
        }
        Relationships: [
          {
            foreignKeyName: "cigar_revisions_cigar_id_fkey"
            columns: ["cigar_id"]
            isOneToOne: false
            referencedRelation: "cigars"
            referencedColumns: ["id"]
          },
        ]
      }
      cigars: {
        Row: {
          binder_origin: string | null
          brand_id: string
          commercial_name: string
          created_at: string
          created_by: string | null
          discontinued_year: number | null
          filler_origins: string[]
          id: string
          line_id: string | null
          merged_into_id: string | null
          msrp_effective_on: string | null
          msrp_eur: number | null
          msrp_source: string | null
          origin_country: string | null
          packaging: Json
          release_type: Database["ref"]["Enums"]["release_type"]
          release_year: number | null
          search_vector: unknown
          slug: string
          status: Database["ref"]["Enums"]["entry_status"]
          strength: Database["ref"]["Enums"]["strength"] | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          vitola_id: string | null
          wrapper_origin: string | null
          wrapper_shade: Database["ref"]["Enums"]["wrapper_shade"] | null
        }
        Insert: {
          binder_origin?: string | null
          brand_id: string
          commercial_name: string
          created_at?: string
          created_by?: string | null
          discontinued_year?: number | null
          filler_origins?: string[]
          id?: string
          line_id?: string | null
          merged_into_id?: string | null
          msrp_effective_on?: string | null
          msrp_eur?: number | null
          msrp_source?: string | null
          origin_country?: string | null
          packaging?: Json
          release_type?: Database["ref"]["Enums"]["release_type"]
          release_year?: number | null
          search_vector?: unknown
          slug: string
          status?: Database["ref"]["Enums"]["entry_status"]
          strength?: Database["ref"]["Enums"]["strength"] | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          vitola_id?: string | null
          wrapper_origin?: string | null
          wrapper_shade?: Database["ref"]["Enums"]["wrapper_shade"] | null
        }
        Update: {
          binder_origin?: string | null
          brand_id?: string
          commercial_name?: string
          created_at?: string
          created_by?: string | null
          discontinued_year?: number | null
          filler_origins?: string[]
          id?: string
          line_id?: string | null
          merged_into_id?: string | null
          msrp_effective_on?: string | null
          msrp_eur?: number | null
          msrp_source?: string | null
          origin_country?: string | null
          packaging?: Json
          release_type?: Database["ref"]["Enums"]["release_type"]
          release_year?: number | null
          search_vector?: unknown
          slug?: string
          status?: Database["ref"]["Enums"]["entry_status"]
          strength?: Database["ref"]["Enums"]["strength"] | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          vitola_id?: string | null
          wrapper_origin?: string | null
          wrapper_shade?: Database["ref"]["Enums"]["wrapper_shade"] | null
        }
        Relationships: [
          {
            foreignKeyName: "cigars_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cigars_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cigars_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "cigars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cigars_vitola_id_fkey"
            columns: ["vitola_id"]
            isOneToOne: false
            referencedRelation: "vitolas"
            referencedColumns: ["id"]
          },
        ]
      }
      lines: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lines_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      manufacturers: {
        Row: {
          country: string | null
          created_at: string
          created_by: string | null
          group_name: string | null
          id: string
          name: string
          notes: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          created_by?: string | null
          group_name?: string | null
          id?: string
          name: string
          notes?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          created_by?: string | null
          group_name?: string | null
          id?: string
          name?: string
          notes?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      vitolas: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          length_mm: number
          name_galera: string | null
          name_salida: string
          notes: string | null
          ring_gauge: number
          shape: Database["ref"]["Enums"]["cigar_shape"]
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          length_mm: number
          name_galera?: string | null
          name_salida: string
          notes?: string | null
          ring_gauge: number
          shape: Database["ref"]["Enums"]["cigar_shape"]
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          length_mm?: number
          name_galera?: string | null
          name_salida?: string
          notes?: string | null
          ring_gauge?: number
          shape?: Database["ref"]["Enums"]["cigar_shape"]
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      box_code_kind: "factory" | "month" | "year"
      cigar_shape:
        | "parejo"
        | "torpedo"
        | "piramide"
        | "perfecto"
        | "belicoso"
        | "culebra"
        | "diadema"
        | "petit_corona"
        | "figurado_autre"
      entry_status: "draft" | "published" | "merged" | "rejected"
      image_kind: "band" | "full" | "box" | "foot" | "ash"
      release_type:
        | "regular"
        | "edicion_limitada"
        | "regional"
        | "reserva"
        | "gran_reserva"
        | "aniversario"
        | "custom_roll"
      revision_status: "pending" | "approved" | "rejected"
      strength: "leger" | "leger_moyen" | "moyen" | "moyen_corse" | "corse"
      wrapper_shade:
        | "claro"
        | "colorado_claro"
        | "colorado"
        | "colorado_maduro"
        | "maduro"
        | "oscuro"
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
    Enums: {
      app_role: ["member", "contributor", "editor", "moderator", "admin"],
      aroma_family: [
        "boise",
        "torrefie",
        "epice",
        "terreux",
        "animal",
        "fruite",
        "floral",
        "sucre",
        "vegetal",
        "mineral",
        "defaut",
      ],
      consent_kind: [
        "terms",
        "privacy",
        "age_verification",
        "analytics",
        "marketing_email",
        "health_related_processing",
      ],
      review_kind: ["log", "tasting"],
      review_visibility: ["private", "shared", "followers", "public"],
    },
  },
  ref: {
    Enums: {
      box_code_kind: ["factory", "month", "year"],
      cigar_shape: [
        "parejo",
        "torpedo",
        "piramide",
        "perfecto",
        "belicoso",
        "culebra",
        "diadema",
        "petit_corona",
        "figurado_autre",
      ],
      entry_status: ["draft", "published", "merged", "rejected"],
      image_kind: ["band", "full", "box", "foot", "ash"],
      release_type: [
        "regular",
        "edicion_limitada",
        "regional",
        "reserva",
        "gran_reserva",
        "aniversario",
        "custom_roll",
      ],
      revision_status: ["pending", "approved", "rejected"],
      strength: ["leger", "leger_moyen", "moyen", "moyen_corse", "corse"],
      wrapper_shade: [
        "claro",
        "colorado_claro",
        "colorado",
        "colorado_maduro",
        "maduro",
        "oscuro",
      ],
    },
  },
} as const
